"""BUSY Web Service sync engine (SRS Note v2 §4A / SRS §4A).

All reads from BUSY use SC=1 (GetXML from Recordset) — a raw SQL query sent
as an HTTP GET with headers.  The response is an XML string; rows are parsed
using xml.etree.ElementTree.

Known BUSY internal table aliases (from BUSY documentation):
  tItemMaster   — inventory items (Code, Name, Alias, Unit, Group)
  tAccountMaster — accounts i.e. customers & vendors (Code, Name, Mobile, Group)
  tran1          — voucher header (VchCode, VchType, Date, VchNo, Party, MC)
  tran2          — voucher item lines (VchCode, ItemCode, Qty, Rate, Amount, MC)

VchType integers (from "Master and Voucher types.pdf"):
  4  — Purchase
  9  — Sale
  22 — Payment
  23 — Receipt
"""
from __future__ import annotations
import base64
import httpx
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from typing import Optional


# ── Credential helpers ────────────────────────────────────────────────────────

def encode_password(plain: str) -> str:
    """Simple base64 encoding stored in busy_password_enc."""
    return base64.b64encode(plain.encode()).decode()


def decode_password(encoded: str) -> str:
    return base64.b64decode(encoded.encode()).decode()


# ── Low-level HTTP call ───────────────────────────────────────────────────────

BUSY_TIMEOUT = 30  # seconds


async def busy_query(host: str, port: int, username: str, password_enc: str,
                     sql: str) -> list[dict]:
    """Execute a SC=1 SQL query against BUSY Web Service.

    Returns parsed rows as list of dicts.
    Raises RuntimeError on HTTP or XML error.
    """
    url = f"http://{host}:{port}"
    headers = {
        "SC":       "1",
        "UserName": username,
        "Pwd":      decode_password(password_enc),
        "Qry":      sql,
    }
    async with httpx.AsyncClient(timeout=BUSY_TIMEOUT) as client:
        resp = await client.get(url, headers=headers)
    if resp.status_code != 200:
        raise RuntimeError(f"BUSY returned HTTP {resp.status_code}: {resp.text[:200]}")

    text = resp.text.strip()
    if not text:
        return []

    # BUSY wraps result as <NewDataSet><Table1>…</Table1></NewDataSet>
    try:
        root = ET.fromstring(text)
    except ET.ParseError as e:
        raise RuntimeError(f"BUSY XML parse error: {e} — raw: {text[:300]}")

    rows = []
    for table in root:
        row: dict = {}
        for child in table:
            row[child.tag] = (child.text or "").strip()
        if row:
            rows.append(row)
    return rows


# ── Item (SKU) master sync ────────────────────────────────────────────────────

_ITEMS_SQL = (
    "SELECT Code, Name, Alias, PrintName, Unit, StockGroup "
    "FROM tItemMaster ORDER BY Name"
)

_ITEMS_DELTA_SQL = (
    "SELECT Code, Name, Alias, PrintName, Unit, StockGroup "
    "FROM tItemMaster WHERE LastModified >= '{since}' ORDER BY Name"
)


async def fetch_items(host, port, username, pwd_enc,
                      since: Optional[date] = None) -> list[dict]:
    sql = _ITEMS_DELTA_SQL.format(since=since.strftime("%d-%m-%Y")) if since else _ITEMS_SQL
    return await busy_query(host, port, username, pwd_enc, sql)


async def upsert_items(db, rows: list[dict]) -> dict:
    """Upsert BUSY items into skus table using busy_item_code."""
    inserted = updated = skipped = 0
    for r in rows:
        code = r.get("Code", "").strip()
        name = (r.get("Name") or r.get("PrintName") or "").strip()
        if not code or not name:
            skipped += 1
            continue

        from config.db import fetchone, execute

        existing = await fetchone(db,
            "SELECT id FROM skus WHERE busy_item_code = %s", (code,))

        if existing:
            await execute(db,
                "UPDATE skus SET sku_name = %s, unit = %s WHERE busy_item_code = %s",
                (name, r.get("Unit", "").strip() or None, code)
            )
            updated += 1
        else:
            # Only insert if sku_code is derivable (use Alias or Code)
            sku_code = (r.get("Alias") or code).strip()
            from config.db import execute
            import uuid as _uuid
            await execute(db,
                """INSERT INTO skus
                       (id, sku_code, sku_name, unit, brand, category,
                        busy_item_code, is_active, created_at, updated_at)
                   VALUES (%s,%s,%s,%s,'','',  %s,TRUE,NOW(),NOW())
                   ON CONFLICT (sku_code) DO UPDATE
                   SET sku_name = EXCLUDED.sku_name,
                       busy_item_code = EXCLUDED.busy_item_code,
                       updated_at = NOW()""",
                (str(_uuid.uuid4()), sku_code, name,
                 r.get("Unit", "").strip() or None, code)
            )
            inserted += 1

    return {"inserted": inserted, "updated": updated, "skipped": skipped}


# ── Account (customer/vendor) master sync ─────────────────────────────────────

_ACCOUNTS_SQL = (
    "SELECT Code, Name, Mobile, GroupName "
    "FROM tAccountMaster "
    "WHERE GroupName IN ('Sundry Debtors','Sundry Creditors') "
    "ORDER BY Name"
)

_ACCOUNTS_DELTA_SQL = (
    "SELECT Code, Name, Mobile, GroupName "
    "FROM tAccountMaster "
    "WHERE GroupName IN ('Sundry Debtors','Sundry Creditors') "
    "AND LastModified >= '{since}' ORDER BY Name"
)


async def fetch_accounts(host, port, username, pwd_enc,
                         since: Optional[date] = None) -> list[dict]:
    sql = _ACCOUNTS_DELTA_SQL.format(since=since.strftime("%d-%m-%Y")) if since else _ACCOUNTS_SQL
    return await busy_query(host, port, username, pwd_enc, sql)


async def upsert_accounts(db, rows: list[dict]) -> dict:
    """Upsert BUSY accounts into customers (Debtors) and vendors (Creditors)."""
    from config.db import fetchone, execute
    import uuid as _uuid

    c_inserted = c_updated = v_inserted = v_updated = skipped = 0

    for r in rows:
        code = r.get("Code", "").strip()
        name = r.get("Name", "").strip()
        group = r.get("GroupName", "").strip()
        if not code or not name:
            skipped += 1
            continue

        if group == "Sundry Debtors":
            existing = await fetchone(db,
                "SELECT id FROM customers WHERE busy_account_code = %s", (code,))
            if existing:
                await execute(db,
                    "UPDATE customers SET customer_name = %s, phone = COALESCE(%s, phone) WHERE busy_account_code = %s",
                    (name, r.get("Mobile") or None, code))
                c_updated += 1
            else:
                await execute(db,
                    """INSERT INTO customers (id, customer_name, phone, busy_account_code, created_at, updated_at)
                       VALUES (%s,%s,%s,%s,NOW(),NOW())
                       ON CONFLICT DO NOTHING""",
                    (str(_uuid.uuid4()), name, r.get("Mobile") or None, code))
                c_inserted += 1

        elif group == "Sundry Creditors":
            existing = await fetchone(db,
                "SELECT id FROM vendors WHERE busy_account_code = %s", (code,))
            if existing:
                await execute(db,
                    "UPDATE vendors SET vendor_name = %s, phone = COALESCE(%s, phone) WHERE busy_account_code = %s",
                    (name, r.get("Mobile") or None, code))
                v_updated += 1
            else:
                await execute(db,
                    """INSERT INTO vendors (id, vendor_name, phone, busy_account_code, created_at, updated_at)
                       VALUES (%s,%s,%s,%s,NOW(),NOW())
                       ON CONFLICT DO NOTHING""",
                    (str(_uuid.uuid4()), name, r.get("Mobile") or None, code))
                v_inserted += 1

    return {
        "customers_inserted": c_inserted, "customers_updated": c_updated,
        "vendors_inserted": v_inserted, "vendors_updated": v_updated,
        "skipped": skipped,
    }


# ── Transaction (voucher) sync ────────────────────────────────────────────────

# VchType 9 = Sale, VchType 4 = Purchase
_VCH_TYPES = (4, 9)

_TRANSACTIONS_SQL = (
    "SELECT t1.VchCode, t1.VchType, t1.Date, t1.VchNo, t1.Party, t1.MC, "
    "       t2.ItemCode, t2.Qty, t2.Rate, t2.Amount "
    "FROM tran1 t1 "
    "INNER JOIN tran2 t2 ON t1.VchCode = t2.VchCode "
    "WHERE t1.VchType IN (4,9) "
    "ORDER BY t1.Date, t1.VchCode"
)

_TRANSACTIONS_DELTA_SQL = (
    "SELECT t1.VchCode, t1.VchType, t1.Date, t1.VchNo, t1.Party, t1.MC, "
    "       t2.ItemCode, t2.Qty, t2.Rate, t2.Amount "
    "FROM tran1 t1 "
    "INNER JOIN tran2 t2 ON t1.VchCode = t2.VchCode "
    "WHERE t1.VchType IN (4,9) "
    "AND t1.Date >= '{since}' "
    "ORDER BY t1.Date, t1.VchCode"
)


async def fetch_transactions(host, port, username, pwd_enc,
                             since: Optional[date] = None) -> list[dict]:
    sql = _TRANSACTIONS_DELTA_SQL.format(
        since=since.strftime("%d-%m-%Y")) if since else _TRANSACTIONS_SQL
    return await busy_query(host, port, username, pwd_enc, sql)


def _parse_busy_date(ds: str) -> Optional[str]:
    """Convert DD-MM-YYYY → YYYY-MM-DD.  Returns None on parse failure."""
    if not ds:
        return None
    try:
        parts = ds.split("-")
        if len(parts) == 3:
            return f"{parts[2]}-{parts[1]}-{parts[0]}"
    except Exception:
        pass
    return None


async def upsert_transactions(db, rows: list[dict]) -> dict:
    """Upsert sales and purchase lines from BUSY transaction rows."""
    from config.db import fetchone, execute
    import uuid as _uuid

    sales_upserted = purchases_upserted = skipped = 0

    for r in rows:
        vch_code = r.get("VchCode", "").strip()
        vch_type = int(r.get("VchType") or 0)
        item_code = r.get("ItemCode", "").strip()
        qty_str = r.get("Qty", "0")
        amount_str = r.get("Amount", "0")
        party = r.get("Party", "").strip()
        mc = r.get("MC", "").strip()
        sale_date = _parse_busy_date(r.get("Date", ""))

        if not vch_code or not item_code or not sale_date:
            skipped += 1
            continue

        try:
            qty = float(qty_str or 0)
            amount = float(amount_str or 0)
        except ValueError:
            skipped += 1
            continue

        # Lookup sku_id by busy_item_code
        sku_row = await fetchone(db,
            "SELECT id FROM skus WHERE busy_item_code = %s", (item_code,))
        if not sku_row:
            skipped += 1
            continue
        sku_id = str(sku_row["id"])

        if vch_type == 9:  # Sale
            customer_row = await fetchone(db,
                "SELECT id FROM customers WHERE customer_name = %s LIMIT 1",
                (party,)) if party else None
            customer_id = str(customer_row["id"]) if customer_row else None

            await execute(db,
                """INSERT INTO sales
                       (sku_id, customer_id, quantity, total_value,
                        sale_date, busy_vch_code, data_ingestion_source, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s,'busy_api',NOW())
                   ON CONFLICT (busy_vch_code, sku_id)
                   DO UPDATE SET quantity = EXCLUDED.quantity,
                                 total_value = EXCLUDED.total_value""",
                (sku_id, customer_id, qty, amount, sale_date, vch_code)
            )
            sales_upserted += 1

        elif vch_type == 4:  # Purchase
            # purchases table stores vendor_name (VARCHAR) directly, no FK
            await execute(db,
                """INSERT INTO purchases
                       (sku_id, vendor_name, quantity, total_value,
                        purchase_date, busy_vch_code, data_ingestion_source, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s,'busy_api',NOW())
                   ON CONFLICT (busy_vch_code, sku_id)
                   DO UPDATE SET quantity = EXCLUDED.quantity,
                                 total_value = EXCLUDED.total_value""",
                (sku_id, party or None, qty, amount, sale_date, vch_code)
            )
            purchases_upserted += 1

    return {
        "sales_upserted": sales_upserted,
        "purchases_upserted": purchases_upserted,
        "skipped": skipped,
    }


# ── Sync log helper ───────────────────────────────────────────────────────────

async def write_sync_log(db, sync_type: str, status: str,
                         records_saved: int = 0, error_message: str = None):
    """Append a row to sync_log table."""
    from config.db import execute
    await execute(db,
        """INSERT INTO sync_log
               (sync_type, status, records_saved, error_message, started_at, completed_at)
           VALUES (%s, %s, %s, %s, NOW(), NOW())""",
        (sync_type, status, records_saved, error_message)
    )
