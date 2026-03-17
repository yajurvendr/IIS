"""Busy Web Service sync — Celery tasks (SRS Note v2 §4A).

Tasks:
  sync_full_masters       — manual: items + accounts, all data
  sync_delta_transactions — nightly 23:00 IST: sales+purchases last 24h
  sync_delta_masters      — weekly Sun 01:00 IST: items+accounts last 7d

All tasks iterate over every busy_enabled tenant, run their sync,
and write a row to sync_log.
"""
from __future__ import annotations
import psycopg2
import psycopg2.extras
from datetime import date, timedelta
import asyncio

from config import settings


# ── DB helpers (sync, psycopg2) ───────────────────────────────────────────────

def _get_conn():
    return psycopg2.connect(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        dbname=settings.DB_NAME,
        user=settings.DB_USER,
        password=settings.DB_PASSWORD,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def _get_busy_tenants(cur) -> list[dict]:
    cur.execute(
        """SELECT id, db_name,
                  busy_host, busy_port, busy_username, busy_password_enc
           FROM platform.tenants
           WHERE busy_enabled = TRUE
             AND busy_host IS NOT NULL
             AND busy_username IS NOT NULL
             AND busy_password_enc IS NOT NULL"""
    )
    return cur.fetchall()


def _log_sync(cur, schema: str, sync_type: str, status: str,
              records_saved: int = 0, error_message: str = None):
    # sync_type CHECK: 'full' | 'delta_transactions' | 'delta_masters'
    # status CHECK:    'running' | 'completed' | 'failed'
    cur.execute(
        f"""INSERT INTO "{schema}".sync_log
                (sync_type, status, records_saved, error_message, started_at, completed_at)
            VALUES (%s,%s,%s,%s,NOW(),NOW())""",
        (sync_type, status, records_saved, error_message)
    )


# ── Async bridge ─────────────────────────────────────────────────────────────

def _run(coro):
    """Run an async coroutine from sync Celery context."""
    return asyncio.run(coro)


# ── Tenant-level sync functions ───────────────────────────────────────────────

async def _sync_items_for_tenant(tenant: dict, since: date | None = None):
    """Fetch items from BUSY and upsert into tenant schema (async)."""
    from services.busy_sync_service import (
        fetch_items, upsert_items, encode_password, decode_password
    )
    from config.db import get_tenant_pool

    pool = await get_tenant_pool(tenant["db_name"])
    async with pool.acquire() as conn:
        rows = await fetch_items(
            tenant["busy_host"], tenant["busy_port"],
            tenant["busy_username"], tenant["busy_password_enc"],
            since=since,
        )

        class _FakeDB:
            """Wraps asyncpg connection for use with config.db helper calls."""
            def __init__(self, c): self._c = c

        # Directly use asyncpg conn
        from config.db import _to_pg
        item_res = {"inserted": 0, "updated": 0, "skipped": 0}
        import uuid
        for r in rows:
            code = r.get("Code", "").strip()
            name = (r.get("Name") or r.get("PrintName") or "").strip()
            if not code or not name:
                item_res["skipped"] += 1
                continue
            sku_code = (r.get("Alias") or code).strip()
            existing = await conn.fetchrow(
                "SELECT id FROM skus WHERE busy_item_code = $1", code)
            if existing:
                await conn.execute(
                    "UPDATE skus SET sku_name = $1, unit = $2 WHERE busy_item_code = $3",
                    name, r.get("Unit", "").strip() or None, code)
                item_res["updated"] += 1
            else:
                await conn.execute(
                    """INSERT INTO skus
                           (id, sku_code, sku_name, unit, brand, category,
                            busy_item_code, is_active, created_at, updated_at)
                       VALUES ($1,$2,$3,$4,'','', $5,TRUE,NOW(),NOW())
                       ON CONFLICT (sku_code) DO UPDATE
                       SET sku_name = EXCLUDED.sku_name,
                           busy_item_code = EXCLUDED.busy_item_code,
                           updated_at = NOW()""",
                    str(uuid.uuid4()), sku_code, name,
                    r.get("Unit", "").strip() or None, code)
                item_res["inserted"] += 1

        total = item_res["inserted"] + item_res["updated"]
        return total, item_res


async def _sync_accounts_for_tenant(tenant: dict, since: date | None = None):
    from services.busy_sync_service import fetch_accounts
    from config.db import get_tenant_pool
    import uuid

    pool = await get_tenant_pool(tenant["db_name"])
    async with pool.acquire() as conn:
        rows = await fetch_accounts(
            tenant["busy_host"], tenant["busy_port"],
            tenant["busy_username"], tenant["busy_password_enc"],
            since=since,
        )
        c_ins = c_upd = v_ins = v_upd = skipped = 0
        for r in rows:
            code = r.get("Code", "").strip()
            name = r.get("Name", "").strip()
            group = r.get("GroupName", "").strip()
            if not code or not name:
                skipped += 1
                continue
            if group == "Sundry Debtors":
                ex = await conn.fetchrow("SELECT id FROM customers WHERE busy_account_code = $1", code)
                if ex:
                    await conn.execute(
                        "UPDATE customers SET customer_name = $1, phone = COALESCE($2, phone) WHERE busy_account_code = $3",
                        name, r.get("Mobile") or None, code)
                    c_upd += 1
                else:
                    await conn.execute(
                        """INSERT INTO customers (id, customer_name, phone, busy_account_code, created_at, updated_at)
                           VALUES ($1,$2,$3,$4,NOW(),NOW()) ON CONFLICT DO NOTHING""",
                        str(uuid.uuid4()), name, r.get("Mobile") or None, code)
                    c_ins += 1
            elif group == "Sundry Creditors":
                ex = await conn.fetchrow("SELECT id FROM vendors WHERE busy_account_code = $1", code)
                if ex:
                    await conn.execute(
                        "UPDATE vendors SET vendor_name = $1, phone = COALESCE($2, phone) WHERE busy_account_code = $3",
                        name, r.get("Mobile") or None, code)
                    v_upd += 1
                else:
                    await conn.execute(
                        """INSERT INTO vendors (id, vendor_name, phone, busy_account_code, created_at, updated_at)
                           VALUES ($1,$2,$3,$4,NOW(),NOW()) ON CONFLICT DO NOTHING""",
                        str(uuid.uuid4()), name, r.get("Mobile") or None, code)
                    v_ins += 1
        total = c_ins + c_upd + v_ins + v_upd
        return total, {"c_ins": c_ins, "c_upd": c_upd, "v_ins": v_ins, "v_upd": v_upd}


async def _sync_transactions_for_tenant(tenant: dict, since: date | None = None):
    from services.busy_sync_service import fetch_transactions, _parse_busy_date
    from config.db import get_tenant_pool
    import uuid

    pool = await get_tenant_pool(tenant["db_name"])
    async with pool.acquire() as conn:
        rows = await fetch_transactions(
            tenant["busy_host"], tenant["busy_port"],
            tenant["busy_username"], tenant["busy_password_enc"],
            since=since,
        )
        sales_upserted = purchases_upserted = skipped = 0

        for r in rows:
            vch_code = r.get("VchCode", "").strip()
            vch_type = int(r.get("VchType") or 0)
            item_code = r.get("ItemCode", "").strip()
            sale_date = _parse_busy_date(r.get("Date", ""))
            party = r.get("Party", "").strip()

            if not vch_code or not item_code or not sale_date:
                skipped += 1
                continue
            try:
                qty = float(r.get("Qty") or 0)
                amount = float(r.get("Amount") or 0)
            except ValueError:
                skipped += 1
                continue

            sku_row = await conn.fetchrow("SELECT id FROM skus WHERE busy_item_code = $1", item_code)
            if not sku_row:
                skipped += 1
                continue
            sku_id = str(sku_row["id"])

            if vch_type == 9:  # Sale
                cust_row = await conn.fetchrow(
                    "SELECT id FROM customers WHERE customer_name = $1 LIMIT 1", party) if party else None
                cust_id = str(cust_row["id"]) if cust_row else None
                await conn.execute(
                    """INSERT INTO sales
                           (sku_id, customer_id, quantity, total_value,
                            sale_date, busy_vch_code, data_ingestion_source, created_at)
                       VALUES ($1,$2,$3,$4,$5,$6,'busy_api',NOW())
                       ON CONFLICT (busy_vch_code, sku_id)
                       DO UPDATE SET quantity = EXCLUDED.quantity,
                                     total_value = EXCLUDED.total_value""",
                    sku_id, cust_id, qty, amount, sale_date, vch_code)
                sales_upserted += 1

            elif vch_type == 4:  # Purchase
                # purchases table stores vendor_name (VARCHAR) — no vendor_id FK
                await conn.execute(
                    """INSERT INTO purchases
                           (sku_id, vendor_name, quantity, total_value,
                            purchase_date, busy_vch_code, data_ingestion_source, created_at)
                       VALUES ($1,$2,$3,$4,$5,$6,'busy_api',NOW())
                       ON CONFLICT (busy_vch_code, sku_id)
                       DO UPDATE SET quantity = EXCLUDED.quantity,
                                     total_value = EXCLUDED.total_value""",
                    sku_id, party or None, qty, amount, sale_date, vch_code)
                purchases_upserted += 1

        total = sales_upserted + purchases_upserted
        return total, {"sales": sales_upserted, "purchases": purchases_upserted, "skipped": skipped}


# ── Single-tenant helpers (used by per-tenant APScheduler jobs) ───────────────

def _get_tenant_by_id(cur, tenant_id: str):
    cur.execute(
        """SELECT id, db_name, busy_host, busy_port, busy_username, busy_password_enc
           FROM platform.tenants
           WHERE id = %s AND busy_enabled = TRUE
             AND busy_host IS NOT NULL AND busy_username IS NOT NULL""",
        (tenant_id,)
    )
    return cur.fetchone()


def sync_delta_transactions_for_tenant(tenant_id: str):
    """Run delta-transactions sync for a single tenant (called by APScheduler)."""
    since = date.today() - timedelta(days=1)
    conn = _get_conn()
    try:
        cur = conn.cursor()
        tenant = _get_tenant_by_id(cur, tenant_id)
        if not tenant:
            return
        schema = tenant["db_name"]
        try:
            total, detail = _run(_sync_transactions_for_tenant(tenant, since=since))
            _log_sync(cur, schema, "delta_transactions", "completed", total)
            conn.commit()
            cur.execute("UPDATE platform.tenants SET busy_last_sync_at = NOW() WHERE id = %s", (tenant_id,))
            conn.commit()
            print(f"[busy_sync] delta_transactions OK for {schema}: {total} records (since {since})")
        except Exception as e:
            conn.rollback()
            _log_sync(cur, schema, "delta_transactions", "failed", 0, str(e))
            conn.commit()
            print(f"[busy_sync] delta_transactions FAILED for {schema}: {e}")
    finally:
        conn.close()


def sync_delta_masters_for_tenant(tenant_id: str):
    """Run delta-masters sync for a single tenant (called by APScheduler)."""
    since = date.today() - timedelta(days=7)
    conn = _get_conn()
    try:
        cur = conn.cursor()
        tenant = _get_tenant_by_id(cur, tenant_id)
        if not tenant:
            return
        schema = tenant["db_name"]
        try:
            items_total, _ = _run(_sync_items_for_tenant(tenant, since=since))
            accs_total, _  = _run(_sync_accounts_for_tenant(tenant, since=since))
            total = items_total + accs_total
            _log_sync(cur, schema, "delta_masters", "completed", total)
            conn.commit()
            cur.execute("UPDATE platform.tenants SET busy_last_sync_at = NOW() WHERE id = %s", (tenant_id,))
            conn.commit()
            print(f"[busy_sync] delta_masters OK for {schema}: {total} records (since {since})")
        except Exception as e:
            conn.rollback()
            _log_sync(cur, schema, "delta_masters", "failed", 0, str(e))
            conn.commit()
            print(f"[busy_sync] delta_masters FAILED for {schema}: {e}")
    finally:
        conn.close()


# ── Legacy all-tenant functions (kept for manual use) ─────────────────────────

def sync_full_masters(tenant_id: str | None = None):
    """Manual full sync of items + accounts for one or all busy_enabled tenants."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        if tenant_id:
            cur.execute(
                """SELECT id, db_name, busy_host, busy_port,
                          busy_username, busy_password_enc
                   FROM platform.tenants WHERE id = %s AND busy_enabled = TRUE""",
                (tenant_id,)
            )
            tenants = cur.fetchall()
        else:
            tenants = _get_busy_tenants(cur)

        results = []
        for tenant in tenants:
            schema = tenant["db_name"]
            try:
                items_total, items_detail = _run(_sync_items_for_tenant(tenant))
                accs_total, accs_detail = _run(_sync_accounts_for_tenant(tenant))
                total = items_total + accs_total

                _log_sync(cur, schema, "full", "completed", total)
                conn.commit()
                results.append({"tenant": schema, "items": items_detail, "accounts": accs_detail})
                print(f"[busy_sync] full OK for {schema}: {total} records")

                # Update busy_last_sync_at
                cur.execute(
                    "UPDATE platform.tenants SET busy_last_sync_at = NOW() WHERE id = %s",
                    (tenant["id"],))
                conn.commit()

            except Exception as e:
                conn.rollback()
                _log_sync(cur, schema, "full", "failed", 0, str(e))
                conn.commit()
                print(f"[busy_sync] full FAILED for {schema}: {e}")
                results.append({"tenant": schema, "error": str(e)})

        return results
    finally:
        conn.close()


def sync_delta_transactions():
    """Nightly 23:00 IST — sync sales + purchase transactions from last 24h."""
    since = date.today() - timedelta(days=1)
    conn = _get_conn()
    try:
        cur = conn.cursor()
        tenants = _get_busy_tenants(cur)

        for tenant in tenants:
            schema = tenant["db_name"]
            try:
                total, detail = _run(_sync_transactions_for_tenant(tenant, since=since))
                _log_sync(cur, schema, "delta_transactions", "completed", total)
                conn.commit()
                cur.execute(
                    "UPDATE platform.tenants SET busy_last_sync_at = NOW() WHERE id = %s",
                    (tenant["id"],))
                conn.commit()
                print(f"[busy_sync] delta_transactions OK for {schema}: {total} records (since {since})")
            except Exception as e:
                conn.rollback()
                _log_sync(cur, schema, "delta_transactions", "failed", 0, str(e))
                conn.commit()
                print(f"[busy_sync] delta_transactions FAILED for {schema}: {e}")
    finally:
        conn.close()


def sync_delta_masters():
    """Weekly Sun 01:00 IST — sync items + accounts modified in last 7 days."""
    since = date.today() - timedelta(days=7)
    conn = _get_conn()
    try:
        cur = conn.cursor()
        tenants = _get_busy_tenants(cur)

        for tenant in tenants:
            schema = tenant["db_name"]
            try:
                items_total, _ = _run(_sync_items_for_tenant(tenant, since=since))
                accs_total, _ = _run(_sync_accounts_for_tenant(tenant, since=since))
                total = items_total + accs_total
                _log_sync(cur, schema, "delta_masters", "completed", total)
                conn.commit()
                cur.execute(
                    "UPDATE platform.tenants SET busy_last_sync_at = NOW() WHERE id = %s",
                    (tenant["id"],))
                conn.commit()
                print(f"[busy_sync] delta_masters OK for {schema}: {total} records (since {since})")
            except Exception as e:
                conn.rollback()
                _log_sync(cur, schema, "delta_masters", "failed", 0, str(e))
                conn.commit()
                print(f"[busy_sync] delta_masters FAILED for {schema}: {e}")
    finally:
        conn.close()
