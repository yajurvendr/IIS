import asyncio
import json
import time
from fastapi import APIRouter, Depends
from config.db import fetchall, fetchone
from middleware.auth import require_role, get_tenant_db

_dashboard_cache: dict = {}  # key: (tenant_db, branch_id) → (ts, data)
_DASHBOARD_TTL = 300          # 5 minutes

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# Helper: current month/year filter for PostgreSQL
_MTD = (
    "EXTRACT(MONTH FROM {col})=EXTRACT(MONTH FROM NOW()) "
    "AND EXTRACT(YEAR FROM {col})=EXTRACT(YEAR FROM NOW())"
)


def _mtd(col: str) -> str:
    return _MTD.format(col=col)


@router.get("/")
async def get_dashboard(
    branch_id: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    # ── Cache check ──────────────────────────────────────────────────────────
    _ck = (user["tenantDbName"], branch_id or "")
    _cached = _dashboard_cache.get(_ck)
    if _cached and (time.time() - _cached[0]) < _DASHBOARD_TTL:
        return _cached[1]

    # Branch filter helpers
    # forecasting_cache: NULL = consolidated; specific UUID = per-branch row
    fc_b  = "AND fc.branch_id = %s" if branch_id else "AND fc.branch_id IS NULL"
    fc_bp = [branch_id] if branch_id else []
    # sales/purchases: empty = all branches (consolidated view); UUID = one branch
    sl_b  = "AND sl.branch_id = %s" if branch_id else ""
    sl_bp = [branch_id] if branch_id else []
    s_b   = "AND branch_id = %s" if branch_id else ""
    s_bp  = [branch_id] if branch_id else []

    (
        total_skus_r, focus_skus_r,
        mtd_sales_r, mtd_purchases_r,
        rag_r, woi_skus_r,
        top_skus_r, recent_imports_r, trend_r,
        outstanding_r, aging_r, customer_count_r,
        margin_r, top_margin_r,
        urgent_skus_r, seasonal_skus_r,
    ) = await asyncio.gather(
        fetchone(db, "SELECT COUNT(*) AS value FROM skus WHERE is_active = TRUE"),
        fetchone(db, "SELECT COUNT(*) AS value FROM skus WHERE is_focus_sku = TRUE"),
        fetchone(db,
            f"SELECT COALESCE(SUM(total_value),0) AS value FROM sales WHERE {_mtd('sale_date')} {s_b}",
            s_bp
        ),
        fetchone(db,
            f"SELECT COALESCE(SUM(total_value),0) AS value FROM purchases WHERE {_mtd('purchase_date')} {s_b}",
            s_bp
        ),
        fetchall(db,
            f"SELECT woi_status, COUNT(*) AS cnt FROM forecasting_cache fc WHERE 1=1 {fc_b} GROUP BY woi_status",
            fc_bp
        ),
        # WOI summary table (red + amber SKUs with DRR)
        fetchall(db,
            f"""SELECT s.sku_code, s.sku_name, fc.current_stock,
                       fc.drr_recommended, fc.woi, fc.woi_status
                FROM forecasting_cache fc JOIN skus s ON s.id = fc.sku_id
                WHERE fc.woi_status IN ('red','amber') {fc_b}
                ORDER BY CASE WHEN fc.woi_status='red' THEN 1 ELSE 2 END, fc.woi ASC
                LIMIT 10""",
            fc_bp
        ),
        fetchall(db,
            f"""SELECT s.sku_code, s.sku_name, s.brand,
                      SUM(sl.quantity) AS qty, SUM(sl.total_value) AS total_value
               FROM sales sl JOIN skus s ON s.id = sl.sku_id
               WHERE {_mtd('sl.sale_date')} {sl_b}
               GROUP BY sl.sku_id, s.sku_code, s.sku_name, s.brand ORDER BY total_value DESC LIMIT 5""",
            sl_bp
        ),
        fetchall(db,
            """SELECT id, data_type, file_name, status, records_total, records_imported, created_at
               FROM import_batches ORDER BY created_at DESC LIMIT 5"""
        ),
        fetchall(db,
            f"""SELECT TO_CHAR(sale_date,'YYYY-MM') AS month, SUM(total_value) AS total_value
               FROM sales WHERE sale_date >= NOW() - INTERVAL '168 days' {s_b}
               GROUP BY month ORDER BY month""",
            s_bp
        ),
        # Outstanding total (invoice - payments - credits) — no branch filter (customer-level)
        fetchone(db,
            """SELECT COALESCE(SUM(CASE WHEN transaction_type='invoice' THEN amount
                                        ELSE -amount END), 0) AS value
               FROM outstanding_ledger"""
        ),
        # Outstanding aging buckets
        fetchone(db,
            """SELECT
                COALESCE(SUM(CASE WHEN transaction_type='invoice' AND (NOW()::date - transaction_date) BETWEEN 0 AND 30 THEN amount ELSE 0 END),0) AS b0_30,
                COALESCE(SUM(CASE WHEN transaction_type='invoice' AND (NOW()::date - transaction_date) BETWEEN 31 AND 60 THEN amount ELSE 0 END),0) AS b31_60,
                COALESCE(SUM(CASE WHEN transaction_type='invoice' AND (NOW()::date - transaction_date) BETWEEN 61 AND 90 THEN amount ELSE 0 END),0) AS b61_90,
                COALESCE(SUM(CASE WHEN transaction_type='invoice' AND (NOW()::date - transaction_date) BETWEEN 91 AND 180 THEN amount ELSE 0 END),0) AS b91_180,
                COALESCE(SUM(CASE WHEN transaction_type='invoice' AND (NOW()::date - transaction_date) > 180 THEN amount ELSE 0 END),0) AS b180_plus
               FROM outstanding_ledger"""
        ),
        fetchone(db, "SELECT COUNT(DISTINCT customer_id) AS cnt FROM outstanding_ledger WHERE transaction_type='invoice'"),
        # Overall MTD gross margin
        fetchone(db,
            f"""SELECT
                COALESCE(SUM(sl.total_value),0) AS revenue,
                COALESCE(SUM(sl.quantity * COALESCE(s.purchase_cost_decoded,0)),0) AS cost
               FROM sales sl JOIN skus s ON s.id = sl.sku_id
               WHERE {_mtd('sl.sale_date')} {sl_b}
               AND s.purchase_cost_decoded IS NOT NULL AND s.purchase_cost_decoded > 0""",
            sl_bp
        ),
        # Top SKUs by gross margin %
        fetchall(db,
            f"""SELECT s.sku_code, s.sku_name, SUM(sl.total_value) AS revenue,
                      SUM(sl.quantity * COALESCE(s.purchase_cost_decoded,0)) AS cost,
                      (SUM(sl.total_value) - SUM(sl.quantity * COALESCE(s.purchase_cost_decoded,0)))
                        / NULLIF(SUM(sl.total_value),0) * 100 AS margin_pct
               FROM sales sl JOIN skus s ON s.id = sl.sku_id
               WHERE {_mtd('sl.sale_date')} {sl_b}
               AND s.purchase_cost_decoded IS NOT NULL AND s.purchase_cost_decoded > 0
               AND sl.total_value > 0
               GROUP BY sl.sku_id, s.sku_code, s.sku_name
               ORDER BY margin_pct DESC LIMIT 5""",
            sl_bp
        ),
        # Count urgent (red WOI) SKUs
        fetchone(db, f"SELECT COUNT(*) AS cnt FROM forecasting_cache fc WHERE woi_status='red' AND suggested_order_qty > 0 {fc_b}", fc_bp),
        # Pre-season alert SKUs
        fetchall(db,
            f"""SELECT s.sku_code, s.sku_name, s.season_tags,
                      fc.latest_order_date, fc.suggested_order_qty, fc.woi
               FROM forecasting_cache fc JOIN skus s ON s.id = fc.sku_id
               WHERE fc.pre_season_alert = TRUE {fc_b}
               ORDER BY fc.latest_order_date ASC""",
            fc_bp
        ),
    )

    rag_map = {r["woi_status"]: r["cnt"] for r in rag_r}

    # Compute overall margin %
    rev = float(margin_r["revenue"] or 0)
    cost = float(margin_r["cost"] or 0)
    overall_margin_pct = round((rev - cost) / rev * 100, 1) if rev > 0 else None

    # Group pre-season alerts by season tag
    season_groups: dict = {}
    for row in seasonal_skus_r:
        tags = []
        try:
            raw = row.get("season_tags")
            tags = json.loads(raw) if isinstance(raw, str) else (raw or [])
        except Exception:
            tags = []
        for tag in tags:
            name = tag.get("name") or tag.get("season") or "Unknown"
            if name not in season_groups:
                season_groups[name] = {
                    "name": name,
                    "start_month": tag.get("start_month"),
                    "end_month": tag.get("end_month"),
                    "sku_count": 0,
                    "gap_units": 0,
                    "latest_order_date": None,
                }
            g = season_groups[name]
            g["sku_count"] += 1
            g["gap_units"] += int(row.get("suggested_order_qty") or 0)
            lod = row.get("latest_order_date")
            if lod and (g["latest_order_date"] is None or str(lod) < str(g["latest_order_date"])):
                g["latest_order_date"] = str(lod)

    # Volume-profit divergence widget
    vol_margin_skus = await fetchall(db,
        f"""SELECT sku_code, sku_name, total_qty, revenue, margin_pct, vol_rank
            FROM (
              SELECT s.sku_code, s.sku_name,
                     SUM(sl.quantity) AS total_qty,
                     SUM(sl.total_value) AS revenue,
                     (SUM(sl.total_value) - SUM(sl.quantity * COALESCE(s.purchase_cost_decoded,0)))
                       / NULLIF(SUM(sl.total_value),0) * 100 AS margin_pct,
                     RANK() OVER (ORDER BY SUM(sl.quantity) DESC) AS vol_rank
              FROM sales sl JOIN skus s ON s.id = sl.sku_id
              WHERE {_mtd('sl.sale_date')} {sl_b} AND sl.total_value > 0
              GROUP BY sl.sku_id, s.sku_code, s.sku_name
            ) sub
            WHERE vol_rank <= 15 AND (margin_pct IS NULL OR margin_pct < 20)
            ORDER BY vol_rank LIMIT 5""",
        sl_bp
    )

    # ── Widget #7: Focus SKU Performance ─────────────────────────────────────
    focus_sku_perf = await fetchall(db,
        f"""SELECT s.sku_code, s.sku_name, s.brand, s.category,
                   fc.current_stock, fc.woi, fc.woi_status,
                   COALESCE(s.msl_override, fc.msl_suggested) AS msl,
                   fc.drr_recommended, fc.suggested_order_qty
            FROM skus s JOIN forecasting_cache fc ON fc.sku_id = s.id {fc_b}
            WHERE s.is_focus_sku = TRUE AND s.is_active = TRUE
            ORDER BY CASE WHEN fc.woi_status='red' THEN 1 WHEN fc.woi_status='amber' THEN 2 ELSE 3 END, fc.woi ASC
            LIMIT 20""",
        fc_bp
    )

    # ── Widget #10: Urgent SKU Status ────────────────────────────────────────
    urgent_status_r = await fetchone(db,
        """SELECT COUNT(*) AS total_uploads,
                  MAX(completed_at) AS last_upload_at
           FROM import_batches WHERE data_type='urgent_skus' AND status='completed'"""
    )

    # ── Widget #17: Data Freshness (last completed import per branch + data_type) ──
    freshness_r = await fetchall(db,
        """SELECT branch_id, data_type, MAX(completed_at) AS last_imported_at
           FROM import_batches
           WHERE data_type IN ('sales','purchases','inventory') AND status='completed'
           GROUP BY branch_id, data_type
           ORDER BY data_type, branch_id"""
    )

    # ── Widget #18: Cross-Branch Stock Alert ─────────────────────────────────
    cross_branch_alerts = await fetchall(db,
        """SELECT s.sku_code, s.sku_name, s.brand,
                  red_b.branch_name AS red_branch, grn_b.branch_name AS green_branch,
                  red_fc.woi AS red_woi, grn_fc.woi AS green_woi
           FROM forecasting_cache red_fc
           JOIN forecasting_cache grn_fc ON grn_fc.sku_id = red_fc.sku_id
                                        AND grn_fc.branch_id IS DISTINCT FROM red_fc.branch_id
                                        AND grn_fc.woi_status = 'green'
           JOIN skus s ON s.id = red_fc.sku_id AND s.is_active = TRUE
           JOIN branches red_b ON red_b.id = red_fc.branch_id
           JOIN branches grn_b ON grn_b.id = grn_fc.branch_id
           WHERE red_fc.woi_status = 'red'
             AND red_fc.branch_id IS NOT NULL AND grn_fc.branch_id IS NOT NULL
           ORDER BY red_fc.woi ASC LIMIT 10"""
    )

    # ── Widget #19: Branch Sales Snapshot (only when 2+ active branches) ─────
    branch_count_r = await fetchone(db, "SELECT COUNT(*) AS cnt FROM branches WHERE is_active=TRUE")
    branch_sales_snapshot = []
    if int((branch_count_r or {}).get("cnt", 0)) >= 2:
        branch_sales_snapshot = await fetchall(db,
            f"""SELECT b.branch_name,
                       COALESCE(SUM(sl.total_value),0) AS mtd_revenue,
                       COALESCE(SUM(sl.quantity),0) AS mtd_qty
                FROM branches b
                LEFT JOIN sales sl ON sl.branch_id=b.id AND {_mtd('sl.sale_date')}
                WHERE b.is_active=TRUE
                GROUP BY b.id, b.branch_name ORDER BY mtd_revenue DESC"""
        )

    result = {
        "total_skus":      total_skus_r["value"],
        "focus_skus":      focus_skus_r["value"],
        "red_skus":        rag_map.get("red", 0),
        "amber_skus":      rag_map.get("amber", 0),
        "green_skus":      rag_map.get("green", 0),
        "urgent_skus":     int(urgent_skus_r["cnt"] or 0),
        "mtd_sales":       float(mtd_sales_r["value"] or 0),
        "mtd_purchases":   float(mtd_purchases_r["value"] or 0),
        "total_outstanding": float(outstanding_r["value"] or 0),
        "overall_margin_pct": overall_margin_pct,
        "woi_skus":        woi_skus_r,
        "top_skus":        top_skus_r,
        "top_margin_skus": top_margin_r,
        "divergent_skus":  vol_margin_skus,
        "recent_imports":  recent_imports_r,
        "monthly_sales_trend": trend_r,
        "outstanding_aging": {
            "b0_30":   float(aging_r["b0_30"] or 0),
            "b31_60":  float(aging_r["b31_60"] or 0),
            "b61_90":  float(aging_r["b61_90"] or 0),
            "b91_180": float(aging_r["b91_180"] or 0),
            "b180plus":float(aging_r["b180_plus"] or 0),
            "customers": int(customer_count_r["cnt"] or 0),
        },
        "seasonal_alerts":     list(season_groups.values()),
        "focus_sku_performance": focus_sku_perf,
        "urgent_sku_status": {
            "last_upload_at":  str(urgent_status_r["last_upload_at"]) if urgent_status_r and urgent_status_r.get("last_upload_at") else None,
            "total_uploads":   int(urgent_status_r["total_uploads"] or 0) if urgent_status_r else 0,
            "urgent_count":    int(urgent_skus_r["cnt"] or 0),
        },
        "data_freshness":      freshness_r,
        "cross_branch_alerts": cross_branch_alerts,
        "branch_sales_snapshot": branch_sales_snapshot,
    }
    _dashboard_cache[_ck] = (time.time(), result)
    return result
