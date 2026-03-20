import time
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
import io
from config.db import fetchall, fetchone, get_public_pool
from middleware.auth import require_role, get_tenant_db

_report_cache: dict = {}   # key → (timestamp, data)
_REPORT_TTL = 900           # 15 minutes

def _rcache_get(key):
    entry = _report_cache.get(key)
    if entry and (time.time() - entry[0]) < _REPORT_TTL:
        return entry[1]
    return None

def _rcache_set(key, value):
    _report_cache[key] = (time.time(), value)
from services.export_service import (
    build_po_excel, build_outstanding_excel, build_outstanding_pdf,
    build_inventory_woi_excel, build_msl_review_excel,
    build_profitability_excel, build_pre_season_excel, build_volume_profit_excel,
    build_sales_forecast_excel, build_top300_excel, build_focus_sku_excel,
    build_transfer_log_excel,
)

router = APIRouter(prefix="/reports", tags=["reports"])

_WOI_ORDER = "CASE WHEN fc.woi_status='red' THEN 1 WHEN fc.woi_status='amber' THEN 2 ELSE 3 END"


def _fc_branch(branch_id: str) -> tuple:
    """Return (JOIN/WHERE clause, params list) for forecasting_cache branch scoping."""
    if branch_id:
        return "AND fc.branch_id = %s", [branch_id]
    return "AND fc.branch_id IS NULL", []


def _sl_branch(alias: str, branch_id: str) -> tuple:
    """Return (WHERE clause, params list) for sales/purchases table branch scoping."""
    if branch_id:
        return f"AND {alias}.branch_id = %s", [branch_id]
    return "", []


def _po_where(category, brand, woi_status, urgent_only):
    where, params = "WHERE 1=1", []
    if category:    where += " AND s.category = %s"; params.append(category)
    if brand:       where += " AND s.brand = %s";    params.append(brand)
    if woi_status:  where += " AND fc.woi_status = %s"; params.append(woi_status)
    if urgent_only == "true": where += " AND fc.woi_status = 'red'"
    return where, params


# GET /reports/po-recommendation
@router.get("/po-recommendation")
async def po_recommendation(
    category: str = "", brand: str = "", woi_status: str = "",
    urgent_only: str = "", branch_id: str = "", page: int = 1, limit: int = 50,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    offset = (page - 1) * limit
    where, params = _po_where(category, brand, woi_status, urgent_only)
    fc_clause, fc_bp = _fc_branch(branch_id)
    rows = await fetchall(db,
        f"""SELECT s.id, s.sku_code, s.sku_name, s.brand, s.category, s.unit,
                   fc.drr_recommended, fc.woi, fc.woi_status, fc.msl_suggested,
                   fc.target_12w_qty, fc.suggested_order_qty, fc.current_stock,
                   s.purchase_cost_decoded
            FROM skus s JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_clause}
            {where} AND fc.suggested_order_qty > 0
            ORDER BY fc.woi ASC LIMIT %s OFFSET %s""",
        fc_bp + params + [limit, offset]
    )
    total_row = await fetchone(db,
        f"SELECT COUNT(*) AS total FROM skus s JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_clause} {where} AND fc.suggested_order_qty > 0",
        fc_bp + params
    )
    return {"data": rows, "total": total_row["total"], "page": page, "limit": limit}


# GET /reports/po-recommendation/export
@router.get("/po-recommendation/export")
async def po_export(
    branch_id: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    fc_clause, fc_bp = _fc_branch(branch_id)
    _ck = f"{user['tenantDbName']}:po_export:{branch_id}"
    rows = _rcache_get(_ck)
    if rows is None:
        rows = await fetchall(db,
            f"""SELECT s.sku_code, s.sku_name, s.brand, s.category, s.unit,
                      fc.current_stock, fc.drr_recommended, fc.woi, fc.woi_status,
                      fc.msl_suggested, fc.target_12w_qty, fc.suggested_order_qty,
                      s.purchase_cost_decoded
               FROM skus s JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_clause}
               WHERE fc.suggested_order_qty > 0 ORDER BY fc.woi ASC""",
            fc_bp
        )
        _rcache_set(_ck, rows)
    buf = build_po_excel(rows)
    return StreamingResponse(
        io.BytesIO(buf),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=po_recommendation.xlsx"},
    )


# GET /reports/inventory-woi
@router.get("/inventory-woi")
async def inventory_woi(
    category: str = "", brand: str = "", woi_status: str = "",
    branch_id: str = "", page: int = 1, limit: int = 50,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    offset = (page - 1) * limit
    fc_clause, fc_bp = _fc_branch(branch_id)
    where, params = "WHERE 1=1", []
    if category:   where += " AND s.category = %s"; params.append(category)
    if brand:      where += " AND s.brand = %s";    params.append(brand)
    if woi_status: where += " AND fc.woi_status = %s"; params.append(woi_status)

    rows = await fetchall(db,
        f"""SELECT s.id, s.sku_code, s.sku_name, s.brand, s.category, s.unit,
                   fc.current_stock, fc.drr_recommended, fc.woi, fc.woi_status,
                   fc.msl_suggested, fc.computed_at AS forecast_at
            FROM skus s LEFT JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_clause}
            {where}
            ORDER BY {_WOI_ORDER}, fc.woi ASC
            LIMIT %s OFFSET %s""",
        fc_bp + params + [limit, offset]
    )
    total_row = await fetchone(db,
        f"SELECT COUNT(*) AS total FROM skus s LEFT JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_clause} {where}",
        fc_bp + params
    )
    summary_rows = await fetchall(db,
        f"SELECT woi_status, COUNT(*) AS cnt FROM forecasting_cache WHERE 1=1 {fc_clause} GROUP BY woi_status",
        fc_bp
    )
    summary = {"red": 0, "amber": 0, "green": 0}
    for r in summary_rows:
        summary[r["woi_status"]] = r["cnt"]

    return {"data": rows, "total": total_row["total"], "page": page, "limit": limit, "summary": summary}


# GET /reports/inventory-woi/export
@router.get("/inventory-woi/export")
async def inventory_woi_export(
    branch_id: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    fc_clause, fc_bp = _fc_branch(branch_id)
    _ck = f"{user['tenantDbName']}:woi_export:{branch_id}"
    rows = _rcache_get(_ck)
    if rows is None:
        rows = await fetchall(db,
            f"""SELECT s.sku_code, s.sku_name, s.brand, s.category, s.unit,
                      fc.current_stock, fc.drr_recommended, fc.woi, fc.woi_status,
                      fc.msl_suggested, fc.suggested_order_qty, fc.computed_at
               FROM skus s LEFT JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_clause}
               ORDER BY {_WOI_ORDER}, fc.woi ASC""",
            fc_bp
        )
        _rcache_set(_ck, rows)
    buf = build_inventory_woi_excel(rows)
    return StreamingResponse(
        io.BytesIO(buf),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=inventory_woi_report.xlsx"},
    )


# GET /reports/msl-review
@router.get("/msl-review")
async def msl_review(
    category: str = "", brand: str = "", branch_id: str = "",
    page: int = 1, limit: int = 50,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    offset = (page - 1) * limit
    fc_clause, fc_bp = _fc_branch(branch_id)
    where, params = "WHERE 1=1", []
    if category: where += " AND s.category = %s"; params.append(category)
    if brand:    where += " AND s.brand = %s";    params.append(brand)

    rows = await fetchall(db,
        f"""SELECT s.id, s.sku_code, s.sku_name, s.brand, s.category,
                   s.msl_busy AS busy_msl,
                   fc.msl_suggested AS system_msl,
                   (fc.msl_suggested - COALESCE(s.msl_busy, 0)) AS variance,
                   fc.current_stock, fc.drr_recommended, fc.woi_status
            FROM skus s
            LEFT JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_clause}
            {where}
            AND (s.msl_busy IS NOT NULL OR fc.msl_suggested IS NOT NULL)
            ORDER BY ABS(fc.msl_suggested - COALESCE(s.msl_busy, 0)) DESC
            LIMIT %s OFFSET %s""",
        fc_bp + params + [limit, offset]
    )
    total_row = await fetchone(db,
        f"""SELECT COUNT(*) AS total
            FROM skus s LEFT JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_clause}
            {where} AND (s.msl_override IS NOT NULL OR fc.msl_suggested IS NOT NULL)""",
        fc_bp + params
    )
    return {"data": rows, "total": total_row["total"], "page": page, "limit": limit}


# GET /reports/msl-review/export
@router.get("/msl-review/export")
async def msl_review_export(
    branch_id: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    fc_clause, fc_bp = _fc_branch(branch_id)
    rows = await fetchall(db,
        f"""SELECT s.sku_code, s.sku_name, s.brand, s.category,
                  s.msl_busy AS busy_msl,
                  fc.msl_suggested AS system_msl,
                  (fc.msl_suggested - COALESCE(s.msl_busy, 0)) AS variance,
                  fc.current_stock, fc.drr_recommended, fc.woi_status
           FROM skus s
           LEFT JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_clause}
           WHERE s.msl_busy IS NOT NULL OR fc.msl_suggested IS NOT NULL
           ORDER BY ABS(fc.msl_suggested - COALESCE(s.msl_busy, 0)) DESC""",
        fc_bp
    )
    buf = build_msl_review_excel(rows)
    return StreamingResponse(
        io.BytesIO(buf),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=msl_review_report.xlsx"},
    )


async def _get_outstanding_method(user: dict) -> str:
    """Return the tenant's configured outstanding method: 'direct_upload' or 'computed'."""
    pub = await get_public_pool()
    row = await fetchone(pub,
        "SELECT outstanding_method FROM tenants WHERE id = %s", (user["tenantId"],))
    return (row or {}).get("outstanding_method") or "direct_upload"


async def _outstanding_direct(db, ageing_bucket: str, search: str, page: int, limit: int):
    """Query outstanding from outstanding_ledger (direct_upload method)."""
    offset = (page - 1) * limit
    bucket_having = ""
    if ageing_bucket == "0-30":    bucket_having = "AND MAX(NOW()::date - ol.transaction_date) BETWEEN 0 AND 30"
    elif ageing_bucket == "31-60": bucket_having = "AND MAX(NOW()::date - ol.transaction_date) BETWEEN 31 AND 60"
    elif ageing_bucket == "61-90": bucket_having = "AND MAX(NOW()::date - ol.transaction_date) BETWEEN 61 AND 90"
    elif ageing_bucket == "90+":   bucket_having = "AND MAX(NOW()::date - ol.transaction_date) > 90"

    customer_where, params = "", []
    if search:
        customer_where = "AND (c.customer_name ILIKE %s OR c.phone ILIKE %s)"
        params += [f"%{search}%"] * 2

    rows = await fetchall(db,
        f"""SELECT c.id, c.customer_name AS name, c.phone, c.customer_code,
                   SUM(CASE WHEN ol.transaction_type='invoice' THEN ol.amount ELSE -ol.amount END) AS total_outstanding,
                   COUNT(CASE WHEN ol.transaction_type='invoice' THEN 1 END) AS invoice_count,
                   MAX(NOW()::date - ol.transaction_date) AS max_overdue_days
            FROM customers c JOIN outstanding_ledger ol ON ol.customer_id = c.id
            WHERE 1=1 {customer_where}
            GROUP BY c.id, c.customer_name, c.phone, c.customer_code
            HAVING SUM(CASE WHEN ol.transaction_type='invoice' THEN ol.amount ELSE -ol.amount END) > 0
            {bucket_having}
            ORDER BY total_outstanding DESC LIMIT %s OFFSET %s""",
        params + [limit, offset]
    )
    total_amount_row = await fetchone(db,
        """SELECT COALESCE(SUM(CASE WHEN transaction_type='invoice' THEN amount ELSE -amount END), 0) AS total_amount
           FROM outstanding_ledger"""
    )
    ageing_row = await fetchone(db,
        """SELECT
             COALESCE(SUM(CASE WHEN transaction_type='invoice' AND (NOW()::date - transaction_date) BETWEEN 0 AND 30 THEN amount ELSE 0 END),0) AS bucket_0_30,
             COALESCE(SUM(CASE WHEN transaction_type='invoice' AND (NOW()::date - transaction_date) BETWEEN 31 AND 60 THEN amount ELSE 0 END),0) AS bucket_31_60,
             COALESCE(SUM(CASE WHEN transaction_type='invoice' AND (NOW()::date - transaction_date) BETWEEN 61 AND 90 THEN amount ELSE 0 END),0) AS bucket_61_90,
             COALESCE(SUM(CASE WHEN transaction_type='invoice' AND (NOW()::date - transaction_date) > 90 THEN amount ELSE 0 END),0) AS bucket_90plus
           FROM outstanding_ledger WHERE transaction_type='invoice'"""
    )
    return rows, float(total_amount_row["total_amount"] or 0), {k: float(v or 0) for k, v in ageing_row.items()}


async def _outstanding_computed(db, ageing_bucket: str, search: str, page: int, limit: int):
    """Query outstanding from sales_invoices - payment_receipts (computed method)."""
    offset = (page - 1) * limit

    customer_where, params = "", []
    if search:
        customer_where = "AND (c.customer_name ILIKE %s OR c.phone ILIKE %s)"
        params += [f"%{search}%"] * 2

    bucket_having = ""
    if ageing_bucket == "0-30":    bucket_having = "AND MAX(NOW()::date - si.invoice_date) BETWEEN 0 AND 30"
    elif ageing_bucket == "31-60": bucket_having = "AND MAX(NOW()::date - si.invoice_date) BETWEEN 31 AND 60"
    elif ageing_bucket == "61-90": bucket_having = "AND MAX(NOW()::date - si.invoice_date) BETWEEN 61 AND 90"
    elif ageing_bucket == "90+":   bucket_having = "AND MAX(NOW()::date - si.invoice_date) > 90"

    rows = await fetchall(db,
        f"""SELECT c.id, c.customer_name AS name, c.phone, c.customer_code,
                   COALESCE(SUM(si.amount), 0) - COALESCE(pr_totals.paid, 0) AS total_outstanding,
                   COUNT(si.id) AS invoice_count,
                   MAX(NOW()::date - si.invoice_date) AS max_overdue_days
            FROM customers c
            JOIN sales_invoices si ON si.customer_id = c.id
            LEFT JOIN (
                SELECT customer_id, COALESCE(SUM(amount), 0) AS paid
                FROM payment_receipts GROUP BY customer_id
            ) pr_totals ON pr_totals.customer_id = c.id
            WHERE 1=1 {customer_where}
            GROUP BY c.id, c.customer_name, c.phone, c.customer_code, pr_totals.paid
            HAVING COALESCE(SUM(si.amount), 0) - COALESCE(pr_totals.paid, 0) > 0
            {bucket_having}
            ORDER BY total_outstanding DESC LIMIT %s OFFSET %s""",
        params + [limit, offset]
    )
    total_row = await fetchone(db,
        """SELECT COALESCE(SUM(si.amount),0) - COALESCE(SUM(pr.amount),0) AS total_amount
           FROM sales_invoices si
           FULL OUTER JOIN payment_receipts pr ON pr.customer_id = si.customer_id"""
    )
    ageing_row = await fetchone(db,
        """SELECT
             COALESCE(SUM(CASE WHEN (NOW()::date - invoice_date) BETWEEN 0 AND 30  THEN amount ELSE 0 END),0) AS bucket_0_30,
             COALESCE(SUM(CASE WHEN (NOW()::date - invoice_date) BETWEEN 31 AND 60 THEN amount ELSE 0 END),0) AS bucket_31_60,
             COALESCE(SUM(CASE WHEN (NOW()::date - invoice_date) BETWEEN 61 AND 90 THEN amount ELSE 0 END),0) AS bucket_61_90,
             COALESCE(SUM(CASE WHEN (NOW()::date - invoice_date) > 90              THEN amount ELSE 0 END),0) AS bucket_90plus
           FROM sales_invoices"""
    )
    return rows, float(total_row["total_amount"] or 0), {k: float(v or 0) for k, v in ageing_row.items()}


# GET /reports/outstanding
@router.get("/outstanding")
async def outstanding(
    ageing_bucket: str = "", search: str = "", page: int = 1, limit: int = 50,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    method = await _get_outstanding_method(user)
    if method == "computed":
        rows, total_amount, ageing = await _outstanding_computed(db, ageing_bucket, search, page, limit)
    else:
        rows, total_amount, ageing = await _outstanding_direct(db, ageing_bucket, search, page, limit)
    return {
        "data": rows,
        "total_amount": total_amount,
        "ageing": ageing,
        "method": method,
        "page": page, "limit": limit,
        "total": len(rows),
    }


# GET /reports/outstanding/export-pdf
@router.get("/outstanding/export-pdf")
async def outstanding_export_pdf(
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    method = await _get_outstanding_method(user)
    if method == "computed":
        rows, _, ageing = await _outstanding_computed(db, "", "", 1, 10000)
    else:
        rows = await fetchall(db,
            """SELECT c.customer_name AS name, c.phone, c.customer_code,
                      SUM(CASE WHEN ol.transaction_type='invoice' THEN ol.amount ELSE -ol.amount END) AS total_outstanding,
                      COUNT(CASE WHEN ol.transaction_type='invoice' THEN 1 END) AS invoice_count,
                      MAX(NOW()::date - ol.transaction_date) AS max_overdue_days
               FROM customers c JOIN outstanding_ledger ol ON ol.customer_id = c.id
               GROUP BY c.id, c.customer_name, c.phone, c.customer_code
               HAVING SUM(CASE WHEN ol.transaction_type='invoice' THEN ol.amount ELSE -ol.amount END) > 0
               ORDER BY total_outstanding DESC"""
        )
        ageing_row = await fetchone(db,
            """SELECT
                 COALESCE(SUM(CASE WHEN transaction_type='invoice' AND (NOW()::date - transaction_date) BETWEEN 0 AND 30 THEN amount ELSE 0 END),0) AS bucket_0_30,
                 COALESCE(SUM(CASE WHEN transaction_type='invoice' AND (NOW()::date - transaction_date) BETWEEN 31 AND 60 THEN amount ELSE 0 END),0) AS bucket_31_60,
                 COALESCE(SUM(CASE WHEN transaction_type='invoice' AND (NOW()::date - transaction_date) BETWEEN 61 AND 90 THEN amount ELSE 0 END),0) AS bucket_61_90,
                 COALESCE(SUM(CASE WHEN transaction_type='invoice' AND (NOW()::date - transaction_date) BETWEEN 91 AND 180 THEN amount ELSE 0 END),0) AS bucket_91_180,
                 COALESCE(SUM(CASE WHEN transaction_type='invoice' AND (NOW()::date - transaction_date) > 180 THEN amount ELSE 0 END),0) AS bucket_180plus
               FROM outstanding_ledger WHERE transaction_type='invoice'"""
        )
        ageing = {k: float(v or 0) for k, v in ageing_row.items()}
    buf = build_outstanding_pdf(rows, ageing)
    return StreamingResponse(
        io.BytesIO(buf),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=outstanding_report.pdf"},
    )


# GET /reports/outstanding/export
@router.get("/outstanding/export")
async def outstanding_export(
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    method = await _get_outstanding_method(user)
    if method == "computed":
        rows = await fetchall(db,
            """SELECT c.customer_name, c.phone, c.customer_code,
                      si.invoice_no AS reference_no, si.amount, si.invoice_date AS transaction_date,
                      si.due_date,
                      (NOW()::date - si.invoice_date) AS overdue_days
               FROM sales_invoices si JOIN customers c ON c.id = si.customer_id
               ORDER BY c.customer_name, si.invoice_date"""
        )
    else:
        rows = await fetchall(db,
            """SELECT c.customer_name, c.phone, c.customer_code,
                      ol.reference_no, ol.amount, ol.transaction_date,
                      (NOW()::date - ol.transaction_date) AS overdue_days
               FROM outstanding_ledger ol JOIN customers c ON c.id = ol.customer_id
               WHERE ol.transaction_type = 'invoice'
               ORDER BY c.customer_name, ol.transaction_date"""
        )
    buf = build_outstanding_excel(rows)
    return StreamingResponse(
        io.BytesIO(buf),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=outstanding_report.xlsx"},
    )


# GET /reports/profitability
@router.get("/profitability")
async def profitability(
    period: str = "13w", category: str = "", brand: str = "", branch_id: str = "",
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    date_filter = {
        # SRS-specified rolling windows
        "13w":  "AND sl.sale_date >= CURRENT_DATE - INTERVAL '91 days'",
        "26w":  "AND sl.sale_date >= CURRENT_DATE - INTERVAL '182 days'",
        "52w":  "AND sl.sale_date >= CURRENT_DATE - INTERVAL '364 days'",
        # Legacy aliases kept for backwards compatibility
        "mtd":        "AND EXTRACT(MONTH FROM sl.sale_date)=EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM sl.sale_date)=EXTRACT(YEAR FROM NOW())",
        "last_month": "AND EXTRACT(MONTH FROM sl.sale_date)=EXTRACT(MONTH FROM NOW() - INTERVAL '1 month') AND EXTRACT(YEAR FROM sl.sale_date)=EXTRACT(YEAR FROM NOW() - INTERVAL '1 month')",
        "ytd":        "AND EXTRACT(YEAR FROM sl.sale_date)=EXTRACT(YEAR FROM NOW())",
        "last_90":    "AND sl.sale_date >= NOW() - INTERVAL '90 days'",
    }.get(period, "AND sl.sale_date >= CURRENT_DATE - INTERVAL '91 days'")
    sl_clause, sl_bp = _sl_branch("sl", branch_id)

    sku_where, params = "", []
    if category: sku_where += " AND s.category = %s"; params.append(category)
    if brand:    sku_where += " AND s.brand = %s";    params.append(brand)

    summary = await fetchone(db,
        f"""SELECT SUM(sl.total_value) AS total_revenue,
                   SUM(sl.quantity * s.purchase_cost_decoded) AS total_cogs,
                   SUM(sl.total_value - sl.quantity * s.purchase_cost_decoded) AS gross_profit,
                   SUM(sl.quantity) AS total_qty
            FROM sales sl JOIN skus s ON s.id = sl.sku_id
            WHERE 1=1 {date_filter} {sl_clause} {sku_where}""", sl_bp + params
    )
    by_category = await fetchall(db,
        f"""SELECT s.category, SUM(sl.total_value) AS revenue,
                   SUM(sl.quantity * s.purchase_cost_decoded) AS cogs,
                   SUM(sl.total_value - sl.quantity * s.purchase_cost_decoded) AS gross_profit
            FROM sales sl JOIN skus s ON s.id = sl.sku_id
            WHERE 1=1 {date_filter} {sl_clause} {sku_where} GROUP BY s.category ORDER BY revenue DESC""", sl_bp + params
    )
    by_brand = await fetchall(db,
        f"""SELECT s.brand, SUM(sl.total_value) AS revenue,
                   SUM(sl.quantity * s.purchase_cost_decoded) AS cogs,
                   SUM(sl.total_value - sl.quantity * s.purchase_cost_decoded) AS gross_profit
            FROM sales sl JOIN skus s ON s.id = sl.sku_id
            WHERE 1=1 {date_filter} {sl_clause} {sku_where} GROUP BY s.brand ORDER BY revenue DESC LIMIT 20""", sl_bp + params
    )
    top_skus = await fetchall(db,
        f"""SELECT s.sku_code, s.sku_name, s.brand, s.category,
                   SUM(sl.total_value) AS revenue,
                   SUM(sl.quantity * s.purchase_cost_decoded) AS cogs,
                   SUM(sl.total_value - sl.quantity * s.purchase_cost_decoded) AS gross_profit,
                   SUM(sl.quantity) AS qty
            FROM sales sl JOIN skus s ON s.id = sl.sku_id
            WHERE 1=1 {date_filter} {sl_clause} {sku_where}
            GROUP BY sl.sku_id, s.sku_code, s.sku_name, s.brand, s.category ORDER BY gross_profit DESC LIMIT 20""", sl_bp + params
    )
    trend = await fetchall(db,
        f"""SELECT TO_CHAR(sl.sale_date,'YYYY-MM') AS month,
                   SUM(sl.total_value) AS revenue,
                   SUM(sl.total_value - sl.quantity * s.purchase_cost_decoded) AS gross_profit
            FROM sales sl JOIN skus s ON s.id = sl.sku_id
            WHERE sl.sale_date >= NOW() - INTERVAL '12 months' {sl_clause} {sku_where}
            GROUP BY month ORDER BY month""", sl_bp + params
    )
    return {"summary": summary, "by_category": by_category, "by_brand": by_brand, "top_skus": top_skus, "trend": trend}


# GET /reports/pre-season-alert
@router.get("/pre-season-alert")
async def pre_season_report(
    branch_id: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    fc_clause, fc_bp = _fc_branch(branch_id)
    rows = await fetchall(db,
        f"""SELECT s.id, s.sku_code, s.sku_name, s.brand, s.category, s.season_tags,
                  fc.current_stock, fc.drr_recommended, fc.drr_4w, fc.drr_13w, fc.drr_52w,
                  fc.drr_seasonal, fc.seasonal_uplift_pct,
                  fc.woi, fc.woi_status,
                  fc.suggested_order_qty, fc.target_12w_qty,
                  fc.pre_season_alert, fc.latest_order_date,
                  -- total_seasonal_demand: drr_seasonal × 84 days (12 weeks)
                  CASE WHEN fc.drr_seasonal IS NOT NULL
                       THEN CEIL(fc.drr_seasonal * 84) ELSE NULL END AS total_seasonal_demand,
                  -- stock_gap: demand - current stock
                  CASE WHEN fc.drr_seasonal IS NOT NULL
                       THEN GREATEST(0, CEIL(fc.drr_seasonal * 84) - fc.current_stock) ELSE NULL END AS stock_gap
           FROM forecasting_cache fc JOIN skus s ON s.id = fc.sku_id
           WHERE fc.pre_season_alert = TRUE {fc_clause} ORDER BY s.category, fc.woi ASC""",
        fc_bp
    )
    return {"data": rows, "total": len(rows)}


# GET /reports/pre-season-alert/export
@router.get("/pre-season-alert/export")
async def pre_season_export(
    branch_id: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    fc_clause, fc_bp = _fc_branch(branch_id)
    rows = await fetchall(db,
        f"""SELECT s.sku_code, s.sku_name, s.brand, s.category,
                  fc.current_stock, fc.drr_recommended, fc.drr_4w, fc.drr_13w,
                  fc.drr_seasonal, fc.seasonal_uplift_pct,
                  fc.woi, fc.woi_status,
                  fc.suggested_order_qty, fc.latest_order_date,
                  CASE WHEN fc.drr_seasonal IS NOT NULL THEN CEIL(fc.drr_seasonal * 84) ELSE NULL END AS total_seasonal_demand,
                  CASE WHEN fc.drr_seasonal IS NOT NULL THEN GREATEST(0, CEIL(fc.drr_seasonal * 84) - fc.current_stock) ELSE NULL END AS stock_gap
           FROM forecasting_cache fc JOIN skus s ON s.id = fc.sku_id
           WHERE fc.pre_season_alert = TRUE {fc_clause} ORDER BY s.category, fc.woi ASC""",
        fc_bp
    )
    buf = build_pre_season_excel(rows)
    return StreamingResponse(
        io.BytesIO(buf),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=pre_season_alert.xlsx"},
    )


# GET /reports/profitability/export
@router.get("/profitability/export")
async def profitability_export(
    period: str = "13w", category: str = "", brand: str = "",
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    date_filter = {
        "13w":  "AND sl.sale_date >= CURRENT_DATE - INTERVAL '91 days'",
        "26w":  "AND sl.sale_date >= CURRENT_DATE - INTERVAL '182 days'",
        "52w":  "AND sl.sale_date >= CURRENT_DATE - INTERVAL '364 days'",
        "mtd":        "AND EXTRACT(MONTH FROM sl.sale_date)=EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM sl.sale_date)=EXTRACT(YEAR FROM NOW())",
        "last_month": "AND EXTRACT(MONTH FROM sl.sale_date)=EXTRACT(MONTH FROM NOW() - INTERVAL '1 month') AND EXTRACT(YEAR FROM sl.sale_date)=EXTRACT(YEAR FROM NOW() - INTERVAL '1 month')",
        "ytd":        "AND EXTRACT(YEAR FROM sl.sale_date)=EXTRACT(YEAR FROM NOW())",
        "last_90":    "AND sl.sale_date >= NOW() - INTERVAL '90 days'",
    }.get(period, "AND sl.sale_date >= CURRENT_DATE - INTERVAL '91 days'")

    sku_where, params = "", []
    if category: sku_where += " AND s.category = %s"; params.append(category)
    if brand:    sku_where += " AND s.brand = %s";    params.append(brand)

    summary = await fetchone(db,
        f"""SELECT SUM(sl.total_value) AS total_revenue,
                   SUM(sl.quantity * s.purchase_cost_decoded) AS total_cogs,
                   SUM(sl.total_value - sl.quantity * s.purchase_cost_decoded) AS gross_profit,
                   SUM(sl.quantity) AS total_qty
            FROM sales sl JOIN skus s ON s.id = sl.sku_id
            WHERE 1=1 {date_filter} {sku_where}""", params
    )
    by_category = await fetchall(db,
        f"""SELECT s.category, SUM(sl.total_value) AS revenue,
                   SUM(sl.quantity * s.purchase_cost_decoded) AS cogs,
                   SUM(sl.total_value - sl.quantity * s.purchase_cost_decoded) AS gross_profit
            FROM sales sl JOIN skus s ON s.id = sl.sku_id
            WHERE 1=1 {date_filter} {sku_where} GROUP BY s.category ORDER BY revenue DESC""", params
    )
    by_brand = await fetchall(db,
        f"""SELECT s.brand, SUM(sl.total_value) AS revenue,
                   SUM(sl.quantity * s.purchase_cost_decoded) AS cogs,
                   SUM(sl.total_value - sl.quantity * s.purchase_cost_decoded) AS gross_profit
            FROM sales sl JOIN skus s ON s.id = sl.sku_id
            WHERE 1=1 {date_filter} {sku_where} GROUP BY s.brand ORDER BY revenue DESC LIMIT 20""", params
    )
    top_skus = await fetchall(db,
        f"""SELECT s.sku_code, s.sku_name, s.brand, s.category,
                   SUM(sl.total_value) AS revenue,
                   SUM(sl.quantity * s.purchase_cost_decoded) AS cogs,
                   SUM(sl.total_value - sl.quantity * s.purchase_cost_decoded) AS gross_profit,
                   SUM(sl.quantity) AS qty
            FROM sales sl JOIN skus s ON s.id = sl.sku_id
            WHERE 1=1 {date_filter} {sku_where}
            GROUP BY sl.sku_id, s.sku_code, s.sku_name, s.brand, s.category ORDER BY gross_profit DESC LIMIT 50""", params
    )
    buf = build_profitability_excel(summary, by_category, by_brand, top_skus)
    return StreamingResponse(
        io.BytesIO(buf),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=profitability_report.xlsx"},
    )


def _vol_profit_query(extra_where: str, params: list) -> str:
    """
    Top-20 SKUs by volume (13w) where margin is below the median margin of those 20.
    Uses a CTE to compute top-20 first, then filters to below-median margin.
    """
    return f"""
        WITH top20 AS (
            SELECT s.sku_code, s.sku_name, s.brand, s.category,
                   SUM(sl.quantity) AS total_qty,
                   SUM(sl.total_value) AS revenue,
                   CASE WHEN SUM(sl.total_value) > 0
                        THEN ROUND((SUM(sl.total_value) - SUM(sl.quantity * COALESCE(s.purchase_cost_decoded,0)))
                             / SUM(sl.total_value) * 100, 1)
                        ELSE NULL END AS margin_pct,
                   RANK() OVER (ORDER BY SUM(sl.quantity) DESC) AS vol_rank
            FROM sales sl JOIN skus s ON s.id = sl.sku_id
            WHERE sl.sale_date >= CURRENT_DATE - INTERVAL '91 days' {extra_where}
            GROUP BY sl.sku_id, s.sku_code, s.sku_name, s.brand, s.category
        ),
        top20_filtered AS (SELECT * FROM top20 WHERE vol_rank <= 20),
        median_margin AS (
            SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY margin_pct) AS med
            FROM top20_filtered WHERE margin_pct IS NOT NULL
        )
        SELECT t.*, m.med AS median_margin_pct
        FROM top20_filtered t, median_margin m
        WHERE t.margin_pct IS NULL OR t.margin_pct < m.med
        ORDER BY t.vol_rank
    """


# GET /reports/volume-profit-divergence
@router.get("/volume-profit-divergence")
async def volume_profit_divergence(
    category: str = "", brand: str = "", page: int = 1, limit: int = 50,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    extra_where, params = "", []
    if category: extra_where += " AND s.category = %s"; params.append(category)
    if brand:    extra_where += " AND s.brand = %s";    params.append(brand)

    rows = await fetchall(db, _vol_profit_query(extra_where, params), params)
    return {"data": rows, "total": len(rows), "page": page, "limit": limit}


# GET /reports/volume-profit-divergence/export
@router.get("/volume-profit-divergence/export")
async def volume_profit_export(
    category: str = "", brand: str = "",
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    extra_where, params = "", []
    if category: extra_where += " AND s.category = %s"; params.append(category)
    if brand:    extra_where += " AND s.brand = %s";    params.append(brand)

    rows = await fetchall(db, _vol_profit_query(extra_where, params), params)
    buf = build_volume_profit_excel(rows)
    return StreamingResponse(
        io.BytesIO(buf),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=volume_profit_divergence.xlsx"},
    )


# GET /reports/sales-forecast
@router.get("/sales-forecast")
async def sales_forecast(
    category: str = "", brand: str = "", woi_status: str = "",
    branch_id: str = "", page: int = 1, limit: int = 50,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    offset = (page - 1) * limit
    fc_clause, fc_bp = _fc_branch(branch_id)
    where, params = "WHERE 1=1", []
    if category:   where += " AND s.category = %s"; params.append(category)
    if brand:      where += " AND s.brand = %s";    params.append(brand)
    if woi_status: where += " AND fc.woi_status = %s"; params.append(woi_status)

    rows = await fetchall(db,
        f"""SELECT s.id, s.sku_code, s.sku_name, s.brand, s.category, s.unit,
                   fc.current_stock, fc.drr_recommended, fc.woi, fc.woi_status,
                   fc.msl_suggested, fc.suggested_order_qty,
                   GREATEST(0, fc.current_stock - fc.drr_recommended * 7 * 4)  AS proj_4w,
                   GREATEST(0, fc.current_stock - fc.drr_recommended * 7 * 8)  AS proj_8w,
                   GREATEST(0, fc.current_stock - fc.drr_recommended * 7 * 12) AS proj_12w,
                   CASE WHEN fc.drr_recommended > 0
                        THEN (NOW()::date + (fc.current_stock / NULLIF(fc.drr_recommended, 0))::int)
                        ELSE NULL END AS stockout_date
            FROM skus s JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_clause}
            {where}
            ORDER BY fc.woi ASC LIMIT %s OFFSET %s""",
        fc_bp + params + [limit, offset]
    )
    total_row = await fetchone(db,
        f"SELECT COUNT(*) AS total FROM skus s JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_clause} {where}",
        fc_bp + params
    )
    return {"data": rows, "total": total_row["total"], "page": page, "limit": limit}


# GET /reports/sales-forecast/export
@router.get("/sales-forecast/export")
async def sales_forecast_export(
    category: str = "", brand: str = "", woi_status: str = "",
    branch_id: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    fc_clause, fc_bp = _fc_branch(branch_id)
    where, params = "WHERE 1=1", []
    if category:   where += " AND s.category = %s"; params.append(category)
    if brand:      where += " AND s.brand = %s";    params.append(brand)
    if woi_status: where += " AND fc.woi_status = %s"; params.append(woi_status)

    rows = await fetchall(db,
        f"""SELECT s.sku_code, s.sku_name, s.brand, s.category, s.unit,
                   fc.current_stock, fc.drr_recommended, fc.woi, fc.woi_status,
                   fc.msl_suggested, fc.suggested_order_qty,
                   GREATEST(0, fc.current_stock - fc.drr_recommended * 7 * 4)  AS proj_4w,
                   GREATEST(0, fc.current_stock - fc.drr_recommended * 7 * 8)  AS proj_8w,
                   GREATEST(0, fc.current_stock - fc.drr_recommended * 7 * 12) AS proj_12w,
                   CASE WHEN fc.drr_recommended > 0
                        THEN (NOW()::date + (fc.current_stock / NULLIF(fc.drr_recommended, 0))::int)
                        ELSE NULL END AS stockout_date
            FROM skus s JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_clause}
            {where} ORDER BY fc.woi ASC""",
        fc_bp + params
    )
    buf = build_sales_forecast_excel(rows)
    return StreamingResponse(
        io.BytesIO(buf),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=sales_forecast_report.xlsx"},
    )


# GET /reports/sales-forecast/chart-data
@router.get("/sales-forecast/chart-data")
async def sales_forecast_chart_data(
    branch_id: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    """Aggregated data for the sales forecast visualization charts."""
    fc_clause, fc_bp = _fc_branch(branch_id)
    s_clause, s_bp = _sl_branch("sales", branch_id)

    # 1. WOI distribution
    woi_dist = await fetchall(db,
        f"SELECT woi_status, COUNT(*) AS cnt FROM forecasting_cache fc WHERE 1=1 {fc_clause} GROUP BY woi_status",
        fc_bp
    )

    # 2. Aggregate stock projection (sum across all SKUs)
    proj = await fetchone(db,
        f"""SELECT
              COALESCE(SUM(fc.current_stock), 0) AS stock_now,
              COALESCE(SUM(GREATEST(0, fc.current_stock - fc.drr_recommended * 28)), 0) AS stock_4w,
              COALESCE(SUM(GREATEST(0, fc.current_stock - fc.drr_recommended * 56)), 0) AS stock_8w,
              COALESCE(SUM(GREATEST(0, fc.current_stock - fc.drr_recommended * 84)), 0) AS stock_12w
           FROM forecasting_cache fc WHERE 1=1 {fc_clause}""",
        fc_bp
    )

    # 3. Forecast vs Actual: forecasted demand (DRR × 28) vs actual past-4W sales, by category
    cat_comparison = await fetchall(db,
        f"""SELECT s.category,
                   COALESCE(SUM(fc.drr_recommended * 28), 0) AS forecasted_demand,
                   COALESCE(SUM(sl.actual_4w), 0)            AS actual_sales
            FROM skus s
            JOIN forecasting_cache fc ON fc.sku_id = s.id
            LEFT JOIN (
                SELECT sku_id, SUM(quantity) AS actual_4w
                FROM sales
                WHERE sale_date >= NOW() - INTERVAL '28 days' {s_clause}
                GROUP BY sku_id
            ) sl ON sl.sku_id = s.id
            WHERE 1=1 {fc_clause} AND s.category IS NOT NULL AND s.category != ''
            GROUP BY s.category
            ORDER BY forecasted_demand DESC
            LIMIT 10""",
        s_bp + fc_bp
    )

    # 4. Top 5 SKUs closest to stock-out
    stockout_soon = await fetchall(db,
        f"""SELECT s.sku_code, s.sku_name, fc.current_stock, fc.drr_recommended,
                   fc.woi_status,
                   (fc.current_stock / NULLIF(fc.drr_recommended, 0))::int AS days_to_stockout
            FROM forecasting_cache fc JOIN skus s ON s.id = fc.sku_id
            WHERE 1=1 {fc_clause} AND fc.drr_recommended > 0 AND fc.current_stock > 0
            ORDER BY (fc.current_stock / fc.drr_recommended) ASC
            LIMIT 5""",
        fc_bp
    )

    woi_map = {r["woi_status"]: int(r["cnt"] or 0) for r in woi_dist}
    return {
        "woi_distribution": {
            "red":   woi_map.get("red", 0),
            "amber": woi_map.get("amber", 0),
            "green": woi_map.get("green", 0),
        },
        "stock_projection": {
            "now":  float(proj["stock_now"] or 0),
            "w4":   float(proj["stock_4w"] or 0),
            "w8":   float(proj["stock_8w"] or 0),
            "w12":  float(proj["stock_12w"] or 0),
        },
        "category_comparison": [
            {
                "category":          r["category"],
                "forecasted_demand": float(r["forecasted_demand"] or 0),
                "actual_sales":      float(r["actual_sales"] or 0),
            }
            for r in cat_comparison
        ],
        "stockout_soon": [
            {
                "sku_code":        r["sku_code"],
                "sku_name":        r["sku_name"],
                "current_stock":   float(r["current_stock"] or 0),
                "drr_recommended": float(r["drr_recommended"] or 0),
                "woi_status":      r["woi_status"],
                "days_to_stockout": int(r["days_to_stockout"] or 0),
            }
            for r in stockout_soon
        ],
    }


# GET /reports/top-300
@router.get("/top-300")
async def top_300(
    period: str = "last_90", category: str = "", brand: str = "",
    branch_id: str = "", page: int = 1, limit: int = 100,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    offset = (page - 1) * limit
    fc_clause, fc_bp = _fc_branch(branch_id)
    sl_clause, sl_bp = _sl_branch("sl", branch_id)
    date_filter = {
        "mtd":     "AND EXTRACT(MONTH FROM sl.sale_date)=EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM sl.sale_date)=EXTRACT(YEAR FROM NOW())",
        "last_90": "AND sl.sale_date >= NOW() - INTERVAL '90 days'",
        "ytd":     "AND EXTRACT(YEAR FROM sl.sale_date)=EXTRACT(YEAR FROM NOW())",
    }.get(period, "AND sl.sale_date >= NOW() - INTERVAL '90 days'")

    sku_where, params = "", []
    if category: sku_where += " AND s.category = %s"; params.append(category)
    if brand:    sku_where += " AND s.brand = %s";    params.append(brand)

    rows = await fetchall(db,
        f"""SELECT ROW_NUMBER() OVER (ORDER BY SUM(sl.quantity) DESC) AS rank,
                   s.sku_code, s.sku_name, s.brand, s.category,
                   SUM(sl.quantity) AS total_qty, SUM(sl.total_value) AS revenue,
                   CASE WHEN SUM(sl.total_value) > 0
                        THEN ROUND(SUM(sl.total_value - sl.quantity * s.purchase_cost_decoded) / SUM(sl.total_value) * 100, 1)
                        ELSE 0 END AS margin_pct,
                   fc.current_stock, fc.woi_status
            FROM sales sl
            JOIN skus s ON s.id = sl.sku_id
            LEFT JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_clause}
            WHERE 1=1 {date_filter} {sl_clause} {sku_where}
            GROUP BY sl.sku_id, s.sku_code, s.sku_name, s.brand, s.category,
                     fc.current_stock, fc.woi_status
            ORDER BY total_qty DESC LIMIT %s OFFSET %s""",
        fc_bp + sl_bp + params + [limit, offset]
    )
    total_row = await fetchone(db,
        f"SELECT COUNT(DISTINCT sl.sku_id) AS total FROM sales sl JOIN skus s ON s.id = sl.sku_id WHERE 1=1 {date_filter} {sl_clause} {sku_where}",
        sl_bp + params
    )
    return {"data": rows, "total": total_row["total"], "page": page, "limit": limit}


# GET /reports/top-300/export
@router.get("/top-300/export")
async def top_300_export(
    period: str = "last_90", category: str = "", brand: str = "",
    branch_id: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    fc_clause, fc_bp = _fc_branch(branch_id)
    sl_clause, sl_bp = _sl_branch("sl", branch_id)
    date_filter = {
        "mtd":     "AND EXTRACT(MONTH FROM sl.sale_date)=EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM sl.sale_date)=EXTRACT(YEAR FROM NOW())",
        "last_90": "AND sl.sale_date >= NOW() - INTERVAL '90 days'",
        "ytd":     "AND EXTRACT(YEAR FROM sl.sale_date)=EXTRACT(YEAR FROM NOW())",
    }.get(period, "AND sl.sale_date >= NOW() - INTERVAL '90 days'")

    sku_where, params = "", []
    if category: sku_where += " AND s.category = %s"; params.append(category)
    if brand:    sku_where += " AND s.brand = %s";    params.append(brand)

    rows = await fetchall(db,
        f"""SELECT ROW_NUMBER() OVER (ORDER BY SUM(sl.quantity) DESC) AS rank,
                   s.sku_code, s.sku_name, s.brand, s.category,
                   SUM(sl.quantity) AS total_qty, SUM(sl.total_value) AS revenue,
                   CASE WHEN SUM(sl.total_value) > 0
                        THEN ROUND(SUM(sl.total_value - sl.quantity * s.purchase_cost_decoded) / SUM(sl.total_value) * 100, 1)
                        ELSE 0 END AS margin_pct,
                   fc.current_stock, fc.woi_status
            FROM sales sl
            JOIN skus s ON s.id = sl.sku_id
            LEFT JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_clause}
            WHERE 1=1 {date_filter} {sl_clause} {sku_where}
            GROUP BY sl.sku_id, s.sku_code, s.sku_name, s.brand, s.category,
                     fc.current_stock, fc.woi_status
            ORDER BY total_qty DESC LIMIT 300""",
        fc_bp + sl_bp + params
    )
    buf = build_top300_excel(rows)
    return StreamingResponse(
        io.BytesIO(buf),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=top300_report.xlsx"},
    )


# GET /reports/focus-sku
@router.get("/focus-sku")
async def focus_sku_report(
    category: str = "", brand: str = "", woi_status: str = "",
    branch_id: str = "", page: int = 1, limit: int = 50,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    offset = (page - 1) * limit
    fc_clause, fc_bp = _fc_branch(branch_id)
    where, params = "WHERE s.is_focus_sku = TRUE", []
    if category:   where += " AND s.category = %s"; params.append(category)
    if brand:      where += " AND s.brand = %s";    params.append(brand)
    if woi_status: where += " AND fc.woi_status = %s"; params.append(woi_status)

    msl_clause = "AND sm.branch_id = %s AND sm.godown_id IS NULL" if branch_id else "AND sm.branch_id IS NULL"
    msl_bp = [branch_id] if branch_id else []

    rows = await fetchall(db,
        f"""SELECT s.id, s.sku_code, s.sku_name, s.brand, s.category, s.unit,
                   sm.msl, fc.current_stock, fc.drr_recommended, fc.woi, fc.woi_status,
                   fc.msl_suggested, fc.suggested_order_qty, fc.computed_at
            FROM skus s
            LEFT JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_clause}
            LEFT JOIN sku_msl sm ON sm.sku_id = s.id {msl_clause}
            {where}
            ORDER BY {_WOI_ORDER}, fc.woi ASC LIMIT %s OFFSET %s""",
        fc_bp + msl_bp + params + [limit, offset]
    )
    total_row = await fetchone(db,
        f"""SELECT COUNT(*) AS total FROM skus s
            LEFT JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_clause} {where}""",
        fc_bp + params
    )
    return {"data": rows, "total": total_row["total"], "page": page, "limit": limit}


# GET /reports/focus-sku/export
@router.get("/focus-sku/export")
async def focus_sku_export(
    category: str = "", brand: str = "", branch_id: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    fc_clause, fc_bp = _fc_branch(branch_id)
    msl_clause = "AND sm.branch_id = %s AND sm.godown_id IS NULL" if branch_id else "AND sm.branch_id IS NULL"
    msl_bp = [branch_id] if branch_id else []
    where, params = "WHERE s.is_focus_sku = TRUE", []
    if category: where += " AND s.category = %s"; params.append(category)
    if brand:    where += " AND s.brand = %s";    params.append(brand)

    rows = await fetchall(db,
        f"""SELECT s.sku_code, s.sku_name, s.brand, s.category, s.unit,
                   sm.msl, fc.current_stock, fc.drr_recommended, fc.woi, fc.woi_status,
                   fc.msl_suggested, fc.suggested_order_qty
            FROM skus s
            LEFT JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_clause}
            LEFT JOIN sku_msl sm ON sm.sku_id = s.id {msl_clause}
            {where} ORDER BY {_WOI_ORDER}, fc.woi ASC""",
        fc_bp + msl_bp + params
    )
    buf = build_focus_sku_excel(rows)
    return StreamingResponse(
        io.BytesIO(buf),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=focus_sku_report.xlsx"},
    )


# ── Stock Transfer Log ────────────────────────────────────────────────────────

def _transfer_query(branch_id, sku_id, from_date, to_date):
    where, params = "WHERE 1=1", []
    if branch_id:
        where += " AND (st.from_branch_id=%s OR st.to_branch_id=%s)"
        params += [branch_id, branch_id]
    if sku_id:
        where += " AND st.sku_id=%s"; params.append(sku_id)
    if from_date:
        where += " AND st.transfer_date>=%s"; params.append(from_date)
    if to_date:
        where += " AND st.transfer_date<=%s"; params.append(to_date)
    return where, params


# GET /reports/stock-transfer-log
@router.get("/stock-transfer-log")
async def stock_transfer_log(
    branch_id: str = "", sku_id: str = "",
    from_date: str = "", to_date: str = "",
    page: int = 1, limit: int = 50,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    offset = (page - 1) * limit
    where, params = _transfer_query(branch_id, sku_id, from_date, to_date)
    rows = await fetchall(db,
        f"""SELECT st.id, st.transfer_date, sk.sku_code, sk.sku_name,
                   fb.branch_name AS from_branch, tb.branch_name AS to_branch,
                   st.quantity, u.name AS transferred_by, st.notes, st.created_at
            FROM stock_transfers st
            JOIN skus sk     ON sk.id = st.sku_id
            JOIN branches fb ON fb.id = st.from_branch_id
            JOIN branches tb ON tb.id = st.to_branch_id
            LEFT JOIN users u ON u.id = st.created_by
            {where} ORDER BY st.transfer_date DESC, st.created_at DESC
            LIMIT %s OFFSET %s""",
        params + [limit, offset]
    )
    total_row = await fetchone(db,
        f"SELECT COUNT(*) AS total FROM stock_transfers st {where}", params)
    return {"data": rows, "total": total_row["total"], "page": page, "limit": limit}


# GET /reports/stock-transfer-log/export
@router.get("/stock-transfer-log/export")
async def stock_transfer_log_export(
    branch_id: str = "", sku_id: str = "",
    from_date: str = "", to_date: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    where, params = _transfer_query(branch_id, sku_id, from_date, to_date)
    rows = await fetchall(db,
        f"""SELECT st.transfer_date, sk.sku_code, sk.sku_name,
                   fb.branch_name AS from_branch, tb.branch_name AS to_branch,
                   st.quantity, u.name AS transferred_by, st.notes
            FROM stock_transfers st
            JOIN skus sk     ON sk.id = st.sku_id
            JOIN branches fb ON fb.id = st.from_branch_id
            JOIN branches tb ON tb.id = st.to_branch_id
            LEFT JOIN users u ON u.id = st.created_by
            {where} ORDER BY st.transfer_date DESC, st.created_at DESC""",
        params
    )
    buf = build_transfer_log_excel(rows)
    return StreamingResponse(
        io.BytesIO(buf),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=stock_transfer_log.xlsx"},
    )
