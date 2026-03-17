"""Nightly background jobs for Reorder and Outstanding Follow-up modules.

Jobs in this file (all run after Busy sync / forecast):
  1. reorder_delivery_check     — marks overdue orders, alerts on missed deliveries
  2. outstanding_auto_close     — inserts auto_closed rows when invoice is paid
  3. outstanding_missed_payment — alerts on missed promised_payment_dt
  4. outstanding_snooze_expiry  — re-activates snoozed follow-ups
"""
from __future__ import annotations
import psycopg2
import psycopg2.extras
from datetime import date

from config import settings
from config.mailer import send_mail
import asyncio


def _get_all_active_tenant_schemas():
    """Fetch (tenant_id, db_name) for all active tenants (sync via psycopg2)."""
    conn = psycopg2.connect(
        host=settings.DB_HOST, port=settings.DB_PORT,
        user=settings.DB_USER, password=settings.DB_PASSWORD,
        dbname=settings.DB_NAME,
        options=f"-c search_path={settings.DB_SCHEMA_PUBLIC},public",
    )
    conn.autocommit = True
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, db_name FROM tenants WHERE status IN ('active','trial')")
        rows = cur.fetchall()
    conn.close()
    return rows


def _tenant_conn(schema: str):
    conn = psycopg2.connect(
        host=settings.DB_HOST, port=settings.DB_PORT,
        user=settings.DB_USER, password=settings.DB_PASSWORD,
        dbname=settings.DB_NAME,
        options=f"-c search_path={schema},public",
    )
    conn.autocommit = True
    return conn


def _send_mail_sync(to: str, subject: str, html: str):
    """Fire-and-forget email via asyncio.run (workers run in sync context)."""
    try:
        asyncio.run(send_mail(to=to, subject=subject, html=html))
    except Exception as e:
        print(f"[nightly_tasks] email error: {e}")


# ── Job 1: Reorder Delivery Overdue Check ────────────────────────────────────

def _reorder_delivery_check_for_schema(schema: str):
    conn = _tenant_conn(schema)
    today = date.today()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        # Find pending_delivery orders past expected_delivery_dt
        cur.execute("""
            SELECT ro.id, ro.sku_id, ro.branch_id, ro.order_placed_at,
                   ro.expected_delivery_dt, ro.ordered_qty,
                   s.sku_code, s.sku_name, b.branch_name
            FROM skus_reorder_orders ro
            JOIN skus s    ON s.id = ro.sku_id
            JOIN branches b ON b.id = ro.branch_id
            WHERE ro.status IN ('order_placed','pending_delivery')
              AND ro.expected_delivery_dt < %s
        """, (today,))
        overdue = cur.fetchall()

        for order in overdue:
            sku_id    = order["sku_id"]
            branch_id = order["branch_id"]
            order_placed = order["order_placed_at"]

            # Check if stock increased since order was placed
            cur.execute("""
                SELECT COALESCE(SUM(quantity_on_hand), 0) AS stock_now
                FROM inventory_snapshots
                WHERE sku_id = %s AND branch_id = %s
                  AND snapshot_date >= %s::date
                ORDER BY snapshot_date DESC LIMIT 1
            """, (sku_id, branch_id, order_placed))
            snap = cur.fetchone()
            stock_now = float((snap or {}).get("stock_now") or 0)

            cur.execute("""
                SELECT COALESCE(SUM(quantity_on_hand), 0) AS stock_at_order
                FROM inventory_snapshots
                WHERE sku_id = %s AND branch_id = %s
                  AND snapshot_date <= %s::date
                ORDER BY snapshot_date DESC LIMIT 1
            """, (sku_id, branch_id, order_placed))
            snap_old = cur.fetchone()
            stock_at_order = float((snap_old or {}).get("stock_at_order") or 0)

            if stock_now > stock_at_order:
                # Stock increased — mark delivered
                cur.execute(
                    "UPDATE skus_reorder_orders SET status='delivered', updated_at=NOW() WHERE id=%s",
                    (order["id"],)
                )
            else:
                # Still overdue — mark pending_delivery and alert admin
                cur.execute(
                    "UPDATE skus_reorder_orders SET status='pending_delivery', updated_at=NOW() WHERE id=%s",
                    (order["id"],)
                )
                cur.execute(
                    "SELECT email, name FROM users WHERE role='tenant_admin' AND is_active=TRUE LIMIT 1")
                admin = cur.fetchone()
                if admin and admin.get("email"):
                    _send_mail_sync(
                        to=admin["email"],
                        subject=f"[IIS] Delivery Overdue — {order['sku_name']} ({order['branch_name']})",
                        html=(
                            f"<p>Order for <b>{order['sku_name']}</b> "
                            f"({order['sku_code']}) at branch <b>{order['branch_name']}</b> "
                            f"was expected by <b>{order['expected_delivery_dt']}</b> "
                            f"but stock has not been updated.</p>"
                            f"<p>Ordered qty: {order['ordered_qty']}</p>"
                        ),
                    )
    conn.close()


def reorder_delivery_check():
    tenants = _get_all_active_tenant_schemas()
    for t in tenants:
        try:
            _reorder_delivery_check_for_schema(t["db_name"])
        except Exception as e:
            print(f"[reorder_delivery_check] tenant {t['db_name']} error: {e}")
    return {"processed": len(tenants)}


# ── Job 2: Outstanding Auto-close on Payment ──────────────────────────────────

def _outstanding_auto_close_for_schema(schema: str):
    """Insert auto_closed rows for invoices where balance is now 0."""
    conn = _tenant_conn(schema)
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        # Find invoices with open follow-ups
        cur.execute("""
            SELECT DISTINCT f.invoice_ref, f.customer_id
            FROM outstanding_followups f
            WHERE f.followup_status != 'auto_closed'
              AND f.id = (
                SELECT id FROM outstanding_followups
                WHERE invoice_ref = f.invoice_ref
                ORDER BY created_at DESC LIMIT 1
              )
        """)
        open_invoices = cur.fetchall()

        for inv in open_invoices:
            invoice_ref = inv["invoice_ref"]
            customer_id = inv["customer_id"]

            # Method B: check sales_invoices balance
            cur.execute("""
                SELECT COALESCE(SUM(amount), 0) AS total_invoiced
                FROM sales_invoices
                WHERE invoice_no = %s
            """, (invoice_ref,))
            inv_row = cur.fetchone()
            total_invoiced = float((inv_row or {}).get("total_invoiced") or 0)

            if total_invoiced == 0:
                # Not in sales_invoices — skip (might be direct upload method)
                continue

            # Sum payments linked to this customer (oldest-first allocation)
            cur.execute("""
                SELECT COALESCE(SUM(amount), 0) AS total_paid
                FROM payment_receipts
                WHERE customer_id = %s
            """, (customer_id,))
            pay_row = cur.fetchone()
            total_paid = float((pay_row or {}).get("total_paid") or 0)

            if total_paid >= total_invoiced:
                # Payment received — auto-close
                cur.execute("""
                    INSERT INTO outstanding_followups
                        (invoice_ref, customer_id, followup_status, created_by, created_at, updated_at)
                    VALUES (%s, %s, 'auto_closed', NULL, NOW(), NOW())
                """, (invoice_ref, customer_id))
    conn.close()


def outstanding_auto_close():
    tenants = _get_all_active_tenant_schemas()
    for t in tenants:
        try:
            _outstanding_auto_close_for_schema(t["db_name"])
        except Exception as e:
            print(f"[outstanding_auto_close] tenant {t['db_name']} error: {e}")
    return {"processed": len(tenants)}


# ── Job 3: Outstanding Missed Payment Alert ───────────────────────────────────

def _outstanding_missed_payment_for_schema(schema: str):
    """Alert created_by when promised_payment_dt has passed but invoice still unpaid."""
    conn = _tenant_conn(schema)
    today = date.today()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT f.id, f.invoice_ref, f.customer_id, f.promised_payment_dt,
                   f.created_by, c.customer_name,
                   u.email AS creator_email, u.name AS creator_name
            FROM outstanding_followups f
            JOIN customers c ON c.id = f.customer_id
            LEFT JOIN users u ON u.id = f.created_by
            WHERE f.followup_status = 'customer_promised'
              AND f.promised_payment_dt < %s
              AND f.id = (
                SELECT id FROM outstanding_followups
                WHERE invoice_ref = f.invoice_ref
                ORDER BY created_at DESC LIMIT 1
              )
        """, (today,))
        missed = cur.fetchall()

        for row in missed:
            if row.get("creator_email"):
                _send_mail_sync(
                    to=row["creator_email"],
                    subject=f"[IIS] Payment Due Not Received — {row['customer_name']}",
                    html=(
                        f"<p>Payment promised by <b>{row['customer_name']}</b> "
                        f"for invoice <b>{row['invoice_ref']}</b> "
                        f"was due on <b>{row['promised_payment_dt']}</b> "
                        f"but has not been received yet.</p>"
                        f"<p>Please follow up with the customer.</p>"
                    ),
                )
    conn.close()


def outstanding_missed_payment():
    tenants = _get_all_active_tenant_schemas()
    for t in tenants:
        try:
            _outstanding_missed_payment_for_schema(t["db_name"])
        except Exception as e:
            print(f"[outstanding_missed_payment] tenant {t['db_name']} error: {e}")
    return {"processed": len(tenants)}


# ── Job 4: Outstanding Snooze Expiry ─────────────────────────────────────────

def _outstanding_snooze_expiry_for_schema(schema: str):
    """Re-activate snoozed follow-ups whose snoozed_until date has passed."""
    conn = _tenant_conn(schema)
    today = date.today()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT f.invoice_ref, f.customer_id, f.comment, f.promised_payment_dt
            FROM outstanding_followups f
            WHERE f.followup_status = 'reminder_snoozed'
              AND f.snoozed_until <= %s
              AND f.id = (
                SELECT id FROM outstanding_followups
                WHERE invoice_ref = f.invoice_ref
                ORDER BY created_at DESC LIMIT 1
              )
        """, (today,))
        expired = cur.fetchall()

        for row in expired:
            cur.execute("""
                INSERT INTO outstanding_followups
                    (invoice_ref, customer_id, comment, promised_payment_dt,
                     followup_status, created_by, created_at, updated_at)
                VALUES (%s, %s, %s, %s, 'followup_pending', NULL, NOW(), NOW())
            """, (row["invoice_ref"], row["customer_id"],
                  row["comment"], row["promised_payment_dt"]))
    conn.close()


def outstanding_snooze_expiry():
    tenants = _get_all_active_tenant_schemas()
    for t in tenants:
        try:
            _outstanding_snooze_expiry_for_schema(t["db_name"])
        except Exception as e:
            print(f"[outstanding_snooze_expiry] tenant {t['db_name']} error: {e}")
    return {"processed": len(tenants)}
