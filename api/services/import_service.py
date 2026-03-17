"""
Import Service — CSV/XLSX parsing with Busy column-name aliases.
Uses sync DB calls (runs inside Celery worker).
"""
import csv
import io
import os
import uuid
import datetime
from config.db import sync_fetchone, sync_fetchall, sync_execute

try:
    import openpyxl
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

try:
    import xlrd
    HAS_XLRD = True
except ImportError:
    HAS_XLRD = False


# ── Column aliases ─────────────────────────────────────────────────────────────

SALES_MAP = {
    "sku_code":      ["Item Code","Item","SKU Code","Part No","Part Number","Product Code","Code"],
    "sku_name":      ["Item Name","Description","Product Name","Item Description","Particulars"],
    "brand":         ["Brand","Make","Manufacturer","Brand Name"],
    "category":      ["Category","Group","Item Group","Product Group"],
    "unit":          ["Unit","UOM","Unit of Measure"],
    "quantity":      ["Qty","Quantity","Qty Sold","Sales Qty"],
    "rate":          ["Rate","Price","Unit Price","Sale Rate","MRP"],
    "total_value":   ["Amount","Net Amount","Total","Sale Amount","Gross Amount"],
    "invoice_no":    ["Invoice No","Voucher No","Bill No","Inv No","Invoice Number"],
    "sale_date":     ["Date","Sale Date","Invoice Date","Voucher Date","Bill Date"],
    "customer_name": ["Customer Name","Party Name","Customer","Buyer"],
    "customer_code": ["Customer Code","Party Code","A/c Code"],
}

PURCHASE_MAP = {
    "sku_code":      ["Item Code","Item","SKU Code","Part No","Part Number","Product Code","Code"],
    "sku_name":      ["Item Name","Description","Product Name","Particulars"],
    "brand":         ["Brand","Make","Manufacturer","Brand Name"],
    "category":      ["Category","Group","Item Group","Product Group"],
    "unit":          ["Unit","UOM"],
    "quantity":      ["Qty","Quantity","Qty Purchased","Received Qty"],
    "rate_encoded":  ["Rate","Cost","Purchase Rate","Unit Cost","Rate/Unit"],
    "total_value":   ["Amount","Total Amount","Net Amount","Purchase Amount"],
    "invoice_no":    ["Invoice No","Bill No","Purchase No","Voucher No"],
    "purchase_date": ["Date","Purchase Date","Invoice Date","Voucher Date","Bill Date"],
    "vendor_name":   ["Supplier","Vendor","Party Name","Supplier Name","Vendor Name"],
}

INVENTORY_MAP = {
    "sku_code":         ["Item Code","SKU Code","Part No","Code"],
    "sku_name":         ["Item Name","Description","Product Name"],
    "brand":            ["Brand","Make","Manufacturer","Brand Name"],
    "quantity_on_hand": ["Closing Stock","Stock","Balance Qty","Closing Qty","Current Stock","On Hand"],
    "snapshot_date":    ["Date","As On Date","Stock Date"],
}

OUTSTANDING_MAP = {
    "customer_name":    ["Party Name","Customer Name","Customer","Party"],
    "customer_code":    ["Party Code","Customer Code","A/c Code","Code"],
    "phone":            ["Phone","Mobile","Phone No","Contact"],
    "transaction_date": ["Date","Invoice Date","Bill Date","Voucher Date","Transaction Date"],
    "transaction_type": ["Type","Transaction Type","Voucher Type"],
    "amount":           ["Amount","Debit","Credit","Net Amount","Balance"],
    "reference_no":     ["Invoice No","Bill No","Voucher No","Reference","Ref No"],
}

MSL_MAP = {
    "sku_code":  ["Item Code","SKU Code","Part No","Code"],
    "sku_name":  ["Item Name","Description","Product Name"],
    "msl_busy":  ["Reorder Level","Min Stock","MSL","Minimum Stock","Reorder Qty"],
}

URGENT_SKU_MAP = {
    "sku_code": ["Item Code","SKU Code","Part No","Code"],
    "sku_name": ["Item Name","Description","Product Name"],
    "priority": ["Priority","Urgency","Urgent Level"],
    "note":     ["Note","Remarks","Customer Request","Comment"],
}

SALES_INVOICE_MAP = {
    "customer_name": ["Party Name","Customer Name","Customer","Buyer","Party"],
    "customer_code": ["Party Code","Customer Code","A/c Code","Code"],
    "phone":         ["Phone","Mobile","Phone No","Contact"],
    "invoice_no":    ["Invoice No","Bill No","Voucher No","Inv No","Invoice Number"],
    "invoice_date":  ["Date","Invoice Date","Bill Date","Voucher Date"],
    "due_date":      ["Due Date","Payment Due","Due","Maturity Date"],
    "amount":        ["Amount","Invoice Amount","Net Amount","Total","Gross Amount"],
}

PAYMENT_RECEIPT_MAP = {
    "customer_name": ["Party Name","Customer Name","Customer","Party"],
    "customer_code": ["Party Code","Customer Code","A/c Code","Code"],
    "phone":         ["Phone","Mobile","Phone No","Contact"],
    "receipt_no":    ["Receipt No","Payment No","Voucher No","Ref No","Reference"],
    "receipt_date":  ["Date","Receipt Date","Payment Date","Voucher Date"],
    "amount":        ["Amount","Receipt Amount","Net Amount","Total","Payment Amount"],
}

# ── Branch auto-detection aliases (SRS §4.3.3) ────────────────────────────────
# These are the column headers that indicate a "Sale From" / location column.
SALE_FROM_ALIASES = [
    "sale from", "salefrom", "branch", "location", "store", "warehouse",
    "outlet", "godown", "shop", "showroom", "counter",
]


def detect_location_column(headers: list) -> str | None:
    """Return the raw header name that matches a known location alias, or None."""
    for h in headers:
        if h.strip().lower() in SALE_FROM_ALIASES:
            return h
    return None


def scan_location_values(rows: list, location_col: str) -> list:
    """Return sorted list of distinct non-empty location values from the column."""
    seen = set()
    for row in rows:
        val = str(row.get(location_col, "")).strip()
        if val:
            seen.add(val)
    return sorted(seen)


def resolve_branch_mappings(conn, location_values: list) -> dict:
    """
    For each location value, look up branch_column_maps.
    Returns dict: {column_value: branch_id | None}
    """
    result = {}
    for val in location_values:
        row = sync_fetchone(conn,
            "SELECT branch_id FROM branch_column_maps WHERE column_value = %s", (val,))
        result[val] = str(row["branch_id"]) if row else None
    return result


def save_branch_mapping(conn, column_value: str, branch_id: str):
    """Upsert a column_value → branch_id mapping."""
    sync_execute(conn,
        """INSERT INTO branch_column_maps (id, branch_id, column_value, created_at)
           VALUES (%s, %s, %s, NOW())
           ON CONFLICT (column_value) DO UPDATE SET branch_id = EXCLUDED.branch_id""",
        (str(uuid.uuid4()), branch_id, column_value)
    )


def auto_create_branch(conn, location_value: str) -> str:
    """Create a branch from a location string found in an import file.
    Returns the new branch_id."""
    code = location_value.upper().replace(" ", "_")[:20]
    # Make code unique if it already exists
    suffix = 0
    base_code = code
    while sync_fetchone(conn, "SELECT id FROM branches WHERE branch_code = %s", (code,)):
        suffix += 1
        code = f"{base_code[:18]}_{suffix}"

    branch_id = str(uuid.uuid4())
    sync_execute(conn,
        """INSERT INTO branches (id, branch_code, branch_name, source_label, auto_created, is_home_branch, is_active, created_at)
           VALUES (%s, %s, %s, %s, TRUE, FALSE, TRUE, NOW())""",
        (branch_id, code, location_value, location_value)
    )
    return branch_id


def parse_file(file_path: str) -> list:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        with open(file_path, "r", encoding="utf-8-sig", errors="replace") as f:
            reader = csv.DictReader(f)
            return [dict(row) for row in reader]
    elif ext == ".xlsx" and HAS_OPENPYXL:
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        headers = [str(h).strip() if h is not None else "" for h in rows[0]]
        result = []
        for row in rows[1:]:
            if all(v is None for v in row):
                continue
            result.append({headers[i]: (str(row[i]).strip() if row[i] is not None else "") for i in range(len(headers))})
        wb.close()
        return result
    elif ext == ".xls" and HAS_XLRD:
        import xlrd as _xlrd
        wb = _xlrd.open_workbook(file_path)
        ws = wb.sheet_by_index(0)
        headers = [str(ws.cell_value(0, c)).strip() for c in range(ws.ncols)]
        result = []
        for r in range(1, ws.nrows):
            result.append({headers[c]: str(ws.cell_value(r, c)).strip() for c in range(ws.ncols)})
        return result
    raise ValueError(f"Unsupported file type: {ext}")


def map_row(raw: dict, col_map: dict) -> dict:
    raw_lower = {k.strip().lower(): v for k, v in raw.items()}
    mapped = {}
    for canonical, aliases in col_map.items():
        for alias in aliases:
            if alias.lower() in raw_lower:
                mapped[canonical] = raw_lower[alias.lower()]
                break
    return mapped


def parse_date(val) -> str | None:
    if not val:
        return None
    s = str(val).strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y", "%m/%d/%Y", "%d.%m.%Y"):
        try:
            return datetime.datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def parse_num(val) -> float:
    if val is None:
        return 0.0
    s = str(val).replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return 0.0


# ── Upsert helpers ─────────────────────────────────────────────────────────────

def upsert_sku(conn, r: dict) -> tuple:
    """Returns (sku_id, is_new)"""
    code = str(r.get("sku_code", "")).strip()
    if not code:
        raise ValueError("Missing sku_code")
    existing = sync_fetchone(conn, "SELECT id FROM skus WHERE sku_code = %s", (code,))
    if existing:
        # Update name/brand/category only — never touch is_focus_sku, season_tags, msl_override
        sync_execute(conn,
            "UPDATE skus SET sku_name=COALESCE(%s, sku_name), brand=COALESCE(%s, brand), category=COALESCE(%s, category), updated_at=NOW() WHERE sku_code=%s",
            (r.get("sku_name") or None, r.get("brand") or None, r.get("category") or None, code)
        )
        return existing["id"], False
    new_id = str(uuid.uuid4())
    sync_execute(conn,
        "INSERT INTO skus (id, sku_code, sku_name, brand, category, unit, is_focus_sku, created_at, updated_at) VALUES (%s,%s,%s,%s,%s,%s,FALSE,NOW(),NOW())",
        (new_id, code, r.get("sku_name") or code, r.get("brand"), r.get("category"), r.get("unit") or "PCS")
    )
    return new_id, True


def upsert_customer(conn, r: dict) -> str | None:
    name = str(r.get("customer_name", "")).strip()
    code = str(r.get("customer_code", "")).strip() or None
    if not name and not code:
        return None
    # Try by code first, then by name
    if code:
        existing = sync_fetchone(conn, "SELECT id FROM customers WHERE customer_code = %s", (code,))
    else:
        existing = sync_fetchone(conn, "SELECT id FROM customers WHERE customer_name = %s", (name,))
    if existing:
        return existing["id"]
    new_id = str(uuid.uuid4())
    sync_execute(conn,
        "INSERT INTO customers (id, customer_name, customer_code, phone, created_at) VALUES (%s,%s,%s,%s,NOW())",
        (new_id, name or code, code, r.get("phone"))
    )
    return new_id


# ── Custom column mapping loader ───────────────────────────────────────────────

def _get_effective_map(conn, import_type: str, default_map: dict) -> dict:
    """Merge tenant-saved column aliases (from DB) with the default map.
    DB aliases are prepended so they take priority over built-in aliases."""
    import json as _json
    try:
        rows = sync_fetchall(conn,
            "SELECT field_name, aliases FROM import_column_mappings WHERE import_type = %s",
            (import_type,)
        )
    except Exception:
        return default_map  # Table may not exist on old schemas; fall back gracefully

    merged = {k: list(v) for k, v in default_map.items()}
    for row in rows:
        fname = row["field_name"]
        custom = row["aliases"]
        if isinstance(custom, str):
            try:
                custom = _json.loads(custom)
            except Exception:
                custom = []
        if fname in merged:
            # Prepend custom aliases so they win over defaults
            merged[fname] = list(custom) + [a for a in merged[fname] if a not in custom]
        else:
            merged[fname] = list(custom)
    return merged


# ── Import functions ───────────────────────────────────────────────────────────

def import_sales(conn, rows: list, batch_id: str, branch_id: str = None,
                 branch_mappings: dict = None) -> dict:
    """
    branch_id:       explicit branch to assign to all rows (if no location column)
    branch_mappings: {column_value: branch_id} override map built by the detect-branches flow
    """
    success, errors, new_masters = 0, [], 0
    sales_map = _get_effective_map(conn, "sales", SALES_MAP)

    # Detect location column from the first row's headers
    location_col = None
    if rows:
        location_col = detect_location_column(list(rows[0].keys()))

    for i, raw in enumerate(rows):
        try:
            r = map_row(raw, sales_map)
            if not r.get("sku_code") or not r.get("sale_date"):
                errors.append({"row": i + 2, "error": "Missing sku_code or sale_date", "data": str(raw)[:200]})
                continue
            sale_date = parse_date(r.get("sale_date"))
            if not sale_date:
                errors.append({"row": i + 2, "error": f"Invalid date: {r.get('sale_date')}", "data": str(raw)[:200]})
                continue

            # Resolve branch: location column wins over explicit branch_id
            row_branch_id = branch_id
            if location_col:
                loc_val = str(raw.get(location_col, "")).strip()
                if loc_val:
                    if branch_mappings and loc_val in branch_mappings:
                        row_branch_id = branch_mappings[loc_val]
                    else:
                        # Lookup in DB
                        mapping = sync_fetchone(conn,
                            "SELECT branch_id FROM branch_column_maps WHERE column_value = %s", (loc_val,))
                        row_branch_id = str(mapping["branch_id"]) if mapping else branch_id

            sku_id, is_new = upsert_sku(conn, r)
            if is_new:
                new_masters += 1
            customer_id = upsert_customer(conn, r) if r.get("customer_name") or r.get("customer_code") else None

            quantity  = parse_num(r.get("quantity"))
            rate      = parse_num(r.get("rate"))
            total_val = parse_num(r.get("total_value")) or round(quantity * rate, 2)

            # Update last_selling_price on SKU
            if rate > 0:
                sync_execute(conn, "UPDATE skus SET last_selling_price=%s, updated_at=NOW() WHERE id=%s", (rate, sku_id))

            sync_execute(conn,
                """INSERT INTO sales (sku_id, branch_id, customer_id, sale_date, quantity, rate, total_value, import_batch_id, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NOW())""",
                (sku_id, row_branch_id, customer_id, sale_date, quantity, rate, total_val, batch_id)
            )
            success += 1
        except Exception as e:
            errors.append({"row": i + 2, "error": str(e), "data": str(raw)[:200]})

    return {"success": success, "errors": errors, "new_masters": new_masters}


def import_purchases(conn, rows: list, batch_id: str, branch_id: str = None) -> dict:
    from services.cost_decoder_service import decode as _decode
    import json as _json
    formula_row = sync_fetchone(conn, "SELECT * FROM cost_decode_formulas WHERE is_active=TRUE ORDER BY created_at DESC LIMIT 1")
    formula = None
    if formula_row:
        cm = formula_row["char_map"]
        formula = {
            "char_map":   _json.loads(cm) if isinstance(cm, str) else cm,
            "math_op":    formula_row.get("math_operation", "none"),
            "math_value": formula_row.get("math_value"),
        }

    success, errors, new_masters = 0, [], 0
    purchase_map = _get_effective_map(conn, "purchases", PURCHASE_MAP)
    for i, raw in enumerate(rows):
        try:
            r = map_row(raw, purchase_map)
            if not r.get("sku_code") or not r.get("purchase_date"):
                errors.append({"row": i + 2, "error": "Missing sku_code or purchase_date", "data": str(raw)[:200]})
                continue
            purchase_date = parse_date(r.get("purchase_date"))
            if not purchase_date:
                errors.append({"row": i + 2, "error": f"Invalid date: {r.get('purchase_date')}", "data": str(raw)[:200]})
                continue

            sku_id, is_new = upsert_sku(conn, r)
            if is_new:
                new_masters += 1

            quantity     = parse_num(r.get("quantity"))
            rate_encoded = str(r.get("rate_encoded", "")).strip() or None
            rate_decoded = _decode(rate_encoded, formula) if formula and rate_encoded else parse_num(rate_encoded)
            total_val    = parse_num(r.get("total_value")) or round(quantity * (rate_decoded or 0), 2)

            sync_execute(conn,
                """INSERT INTO purchases (sku_id, branch_id, purchase_date, quantity, rate_encoded, rate_decoded, total_value, vendor_name, import_batch_id, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())""",
                (sku_id, branch_id, purchase_date, quantity, rate_encoded, rate_decoded, total_val, r.get("vendor_name"), batch_id)
            )
            # Update SKU purchase cost with latest decoded value
            if rate_decoded is not None:
                sync_execute(conn,
                    "UPDATE skus SET purchase_cost_encoded=%s, purchase_cost_decoded=%s, updated_at=NOW() WHERE id=%s",
                    (rate_encoded, rate_decoded, sku_id)
                )
            success += 1
        except Exception as e:
            errors.append({"row": i + 2, "error": str(e), "data": str(raw)[:200]})
    return {"success": success, "errors": errors, "new_masters": new_masters}


def import_inventory(conn, rows: list, batch_id: str, branch_id: str = None) -> dict:
    today = datetime.date.today().strftime("%Y-%m-%d")
    success, errors, new_masters = 0, [], 0
    inventory_map = _get_effective_map(conn, "inventory", INVENTORY_MAP)
    for i, raw in enumerate(rows):
        try:
            r = map_row(raw, inventory_map)
            if not r.get("sku_code"):
                errors.append({"row": i + 2, "error": "Missing sku_code", "data": str(raw)[:200]})
                continue
            sku_id, is_new = upsert_sku(conn, r)
            if is_new:
                new_masters += 1
            stock         = parse_num(r.get("quantity_on_hand"))
            snapshot_date = parse_date(r.get("snapshot_date")) or today

            # Upsert snapshot — use IS NOT DISTINCT FROM to handle NULL branch_id correctly
            existing = sync_fetchone(conn,
                "SELECT id FROM inventory_snapshots WHERE sku_id=%s AND branch_id IS NOT DISTINCT FROM %s AND snapshot_date=%s",
                (sku_id, branch_id, snapshot_date)
            )
            if existing:
                sync_execute(conn,
                    "UPDATE inventory_snapshots SET quantity_on_hand=%s, import_batch_id=%s WHERE id=%s",
                    (stock, batch_id, existing["id"])
                )
            else:
                sync_execute(conn,
                    "INSERT INTO inventory_snapshots (sku_id, branch_id, snapshot_date, quantity_on_hand, import_batch_id, created_at) VALUES (%s,%s,%s,%s,%s,NOW())",
                    (sku_id, branch_id, snapshot_date, stock, batch_id)
                )
            success += 1
        except Exception as e:
            errors.append({"row": i + 2, "error": str(e), "data": str(raw)[:200]})
    return {"success": success, "errors": errors, "new_masters": new_masters}


def import_outstanding(conn, rows: list, batch_id: str) -> dict:
    """Import customer outstanding ledger entries from Busy export."""
    import json as _json
    success, errors, new_masters = 0, [], 0
    outstanding_map = _get_effective_map(conn, "outstanding", OUTSTANDING_MAP)

    # Determine transaction_type mapping from Busy voucher types
    DEBIT_TYPES  = {"invoice", "sales invoice", "debit note", "dr"}
    CREDIT_TYPES = {"payment", "receipt", "credit note", "cr"}

    for i, raw in enumerate(rows):
        try:
            r = map_row(raw, outstanding_map)
            customer_name = str(r.get("customer_name", "")).strip()
            if not customer_name:
                errors.append({"row": i + 2, "error": "Missing customer name", "data": str(raw)[:200]})
                continue

            txn_date = parse_date(r.get("transaction_date"))
            if not txn_date:
                errors.append({"row": i + 2, "error": f"Invalid date: {r.get('transaction_date')}", "data": str(raw)[:200]})
                continue

            # Determine transaction type
            raw_type = str(r.get("transaction_type", "")).strip().lower()
            if raw_type in DEBIT_TYPES:
                txn_type = "invoice"
            elif raw_type in CREDIT_TYPES:
                txn_type = "payment"
            elif raw_type == "credit_note":
                txn_type = "credit_note"
            else:
                # If no type column, positive amount = invoice, negative = payment
                txn_type = "invoice"

            amount = parse_num(r.get("amount"))
            # Payments and credit notes should be stored as negative amounts
            if txn_type in ("payment", "credit_note") and amount > 0:
                amount = -amount

            customer_id = upsert_customer(conn, r)
            if not customer_id:
                errors.append({"row": i + 2, "error": "Could not resolve customer", "data": str(raw)[:200]})
                continue

            # Check if this reference already exists to avoid duplicates
            ref_no = str(r.get("reference_no", "")).strip() or None
            if ref_no:
                existing = sync_fetchone(conn,
                    "SELECT id FROM outstanding_ledger WHERE customer_id=%s AND reference_no=%s AND transaction_date=%s",
                    (customer_id, ref_no, txn_date)
                )
                if existing:
                    success += 1
                    continue

            sync_execute(conn,
                """INSERT INTO outstanding_ledger (customer_id, transaction_date, transaction_type, amount, reference_no, import_batch_id, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s,NOW())""",
                (customer_id, txn_date, txn_type, amount, ref_no, batch_id)
            )
            success += 1
        except Exception as e:
            errors.append({"row": i + 2, "error": str(e), "data": str(raw)[:200]})

    return {"success": success, "errors": errors, "new_masters": new_masters}


def import_msl(conn, rows: list, batch_id: str) -> dict:
    """Import MSL / reorder levels from Busy export. Only updates msl_busy — never msl_override."""
    success, errors, new_masters = 0, [], 0
    msl_map = _get_effective_map(conn, "msl", MSL_MAP)
    for i, raw in enumerate(rows):
        try:
            r = map_row(raw, msl_map)
            if not r.get("sku_code"):
                errors.append({"row": i + 2, "error": "Missing sku_code", "data": str(raw)[:200]})
                continue
            sku_id, is_new = upsert_sku(conn, r)
            if is_new:
                new_masters += 1
            msl_val = int(parse_num(r.get("msl_busy")))
            sync_execute(conn, "UPDATE skus SET msl_busy=%s, updated_at=NOW() WHERE id=%s", (msl_val, sku_id))
            success += 1
        except Exception as e:
            errors.append({"row": i + 2, "error": str(e), "data": str(raw)[:200]})
    return {"success": success, "errors": errors, "new_masters": new_masters}


def import_urgent_skus(conn, rows: list, batch_id: str) -> dict:
    """
    Import urgent SKU list. Creates/validates SKUs exist, returns list with forecasting data.
    Does not modify any user flags.
    """
    import json as _json
    success, errors, urgent_list = 0, [], []
    for i, raw in enumerate(rows):
        try:
            r = map_row(raw, URGENT_SKU_MAP)
            if not r.get("sku_code"):
                errors.append({"row": i + 2, "error": "Missing sku_code", "data": str(raw)[:200]})
                continue
            code = str(r["sku_code"]).strip()
            sku = sync_fetchone(conn, "SELECT id, sku_code, sku_name FROM skus WHERE sku_code=%s", (code,))
            if not sku:
                errors.append({"row": i + 2, "error": f"SKU not found: {code}", "data": str(raw)[:200]})
                continue
            urgent_list.append({
                "sku_id":   sku["id"],
                "sku_code": sku["sku_code"],
                "sku_name": sku["sku_name"],
                "priority": r.get("priority", "URGENT"),
                "note":     r.get("note", ""),
            })
            success += 1
        except Exception as e:
            errors.append({"row": i + 2, "error": str(e), "data": str(raw)[:200]})

    # Store urgent SKU list as JSON in the import_batch error_log (reused as result_data)
    import json as _json
    if urgent_list:
        sync_execute(conn,
            "UPDATE import_batches SET error_log=%s WHERE id=%s",
            (_json.dumps({"urgent_skus": urgent_list, "errors": errors}), batch_id)
        )

    return {"success": success, "errors": errors, "new_masters": 0, "urgent_skus": urgent_list}


def import_sales_invoices(conn, rows: list, batch_id: str) -> dict:
    """Import sales invoices for the computed outstanding method."""
    success, errors, new_masters = 0, [], 0
    invoice_map = _get_effective_map(conn, "sales_invoices", SALES_INVOICE_MAP)
    for i, raw in enumerate(rows):
        try:
            r = map_row(raw, invoice_map)
            customer_name = str(r.get("customer_name", "")).strip()
            if not customer_name:
                errors.append({"row": i + 2, "error": "Missing customer name", "data": str(raw)[:200]})
                continue
            invoice_date = parse_date(r.get("invoice_date"))
            if not invoice_date:
                errors.append({"row": i + 2, "error": f"Invalid invoice_date: {r.get('invoice_date')}", "data": str(raw)[:200]})
                continue

            amount = parse_num(r.get("amount"))
            if amount <= 0:
                errors.append({"row": i + 2, "error": "Invoice amount must be positive", "data": str(raw)[:200]})
                continue

            customer_id = upsert_customer(conn, r)
            if not customer_id:
                errors.append({"row": i + 2, "error": "Could not resolve customer", "data": str(raw)[:200]})
                continue

            invoice_no = str(r.get("invoice_no", "")).strip() or None
            due_date   = parse_date(r.get("due_date"))

            # Deduplicate by customer + invoice_no
            if invoice_no:
                existing = sync_fetchone(conn,
                    "SELECT id FROM sales_invoices WHERE customer_id=%s AND invoice_no=%s",
                    (customer_id, invoice_no))
                if existing:
                    success += 1
                    continue

            sync_execute(conn,
                """INSERT INTO sales_invoices (customer_id, invoice_no, invoice_date, due_date, amount, import_batch_id, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s,NOW())""",
                (customer_id, invoice_no, invoice_date, due_date, amount, batch_id)
            )
            success += 1
        except Exception as e:
            errors.append({"row": i + 2, "error": str(e), "data": str(raw)[:200]})

    return {"success": success, "errors": errors, "new_masters": new_masters}


def import_payment_receipts(conn, rows: list, batch_id: str) -> dict:
    """Import payment receipts for the computed outstanding method."""
    success, errors, new_masters = 0, [], 0
    receipt_map = _get_effective_map(conn, "payment_receipts", PAYMENT_RECEIPT_MAP)
    for i, raw in enumerate(rows):
        try:
            r = map_row(raw, receipt_map)
            customer_name = str(r.get("customer_name", "")).strip()
            if not customer_name:
                errors.append({"row": i + 2, "error": "Missing customer name", "data": str(raw)[:200]})
                continue
            receipt_date = parse_date(r.get("receipt_date"))
            if not receipt_date:
                errors.append({"row": i + 2, "error": f"Invalid receipt_date: {r.get('receipt_date')}", "data": str(raw)[:200]})
                continue

            amount = parse_num(r.get("amount"))
            if amount <= 0:
                errors.append({"row": i + 2, "error": "Receipt amount must be positive", "data": str(raw)[:200]})
                continue

            customer_id = upsert_customer(conn, r)
            if not customer_id:
                errors.append({"row": i + 2, "error": "Could not resolve customer", "data": str(raw)[:200]})
                continue

            receipt_no = str(r.get("receipt_no", "")).strip() or None

            # Deduplicate by customer + receipt_no
            if receipt_no:
                existing = sync_fetchone(conn,
                    "SELECT id FROM payment_receipts WHERE customer_id=%s AND receipt_no=%s",
                    (customer_id, receipt_no))
                if existing:
                    success += 1
                    continue

            sync_execute(conn,
                """INSERT INTO payment_receipts (customer_id, receipt_no, receipt_date, amount, import_batch_id, created_at)
                   VALUES (%s,%s,%s,%s,%s,NOW())""",
                (customer_id, receipt_no, receipt_date, amount, batch_id)
            )
            success += 1
        except Exception as e:
            errors.append({"row": i + 2, "error": str(e), "data": str(raw)[:200]})

    return {"success": success, "errors": errors, "new_masters": new_masters}
