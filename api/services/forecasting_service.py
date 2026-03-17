"""
Forecasting engine per SRS §6.2 — DRR → WOI → MSL → Seasonal 5-step engine.
Used both by API (async) and Celery workers (sync via sync_* helpers).

Branch support:
  branch_id=None  → consolidated (all branches aggregated, cached with branch_id IS NULL)
  branch_id=<id>  → per-branch computation (cached with branch_id = <id>)

Column names match 002_tenant_schema.sql exactly:
  sales.quantity (not qty), forecasting_cache.drr_recommended (not drr_rec),
  forecasting_cache.computed_at (not updated_at), inventory_snapshots.quantity_on_hand
"""
import json
import math
import datetime
from config.db import fetchall, fetchone, execute, sync_fetchall, sync_fetchone, sync_execute

DEFAULT_LEAD_TIME = 105  # days — fallback if tenant has no lead_time_days


# ── Helpers ───────────────────────────────────────────────────────────────────

def _branch_filter(branch_id):
    """Returns (sql_fragment, params_tuple) for branch_id filter."""
    if branch_id:
        return "AND branch_id = %s", (branch_id,)
    return "", ()


def _woi_status(stock, weekly_drr, red_threshold=4.0, amber_threshold=8.0):
    if stock == 0:
        return 0.0, "red"
    if weekly_drr == 0:
        return 999.0, "green"
    woi = stock / weekly_drr
    return round(woi, 2), "red" if woi < red_threshold else ("amber" if woi < amber_threshold else "green")


# ──────────────────────────────────────────────────────────────────────────────
# Async version (used by FastAPI routers)
# ──────────────────────────────────────────────────────────────────────────────

async def compute_sku_forecast(db, sku_id: str, lead_time_days: int = DEFAULT_LEAD_TIME, branch_id: str = None,
                               woi_red: float = 4.0, woi_amber: float = 8.0,
                               target_woi_weeks: float = 12.0) -> dict:
    bf, bp = _branch_filter(branch_id)

    # ── DRR windows (SRS §6.2.1) ──────────────────────────────────────────────
    drr_4w  = float((await fetchone(db,
        f"SELECT COALESCE(SUM(quantity),0)/28  AS v FROM sales WHERE sku_id=%s {bf} AND sale_date>=CURRENT_DATE - INTERVAL '28 days'",
        (sku_id,)+bp) or {}).get("v", 0))
    drr_13w = float((await fetchone(db,
        f"SELECT COALESCE(SUM(quantity),0)/91  AS v FROM sales WHERE sku_id=%s {bf} AND sale_date>=CURRENT_DATE - INTERVAL '91 days'",
        (sku_id,)+bp) or {}).get("v", 0))
    drr_52w = float((await fetchone(db,
        f"SELECT COALESCE(SUM(quantity),0)/364 AS v FROM sales WHERE sku_id=%s {bf} AND sale_date>=CURRENT_DATE - INTERVAL '364 days'",
        (sku_id,)+bp) or {}).get("v", 0))

    d4  = int((await fetchone(db, f"SELECT COUNT(DISTINCT sale_date) AS d FROM sales WHERE sku_id=%s {bf} AND sale_date>=CURRENT_DATE - INTERVAL '28 days'",  (sku_id,)+bp) or {}).get("d", 0))
    d13 = int((await fetchone(db, f"SELECT COUNT(DISTINCT sale_date) AS d FROM sales WHERE sku_id=%s {bf} AND sale_date>=CURRENT_DATE - INTERVAL '91 days'",  (sku_id,)+bp) or {}).get("d", 0))
    d52 = int((await fetchone(db, f"SELECT COUNT(DISTINCT sale_date) AS d FROM sales WHERE sku_id=%s {bf} AND sale_date>=CURRENT_DATE - INTERVAL '364 days'", (sku_id,)+bp) or {}).get("d", 0))

    blend, total_w = 0.0, 0.0
    if d4  >= 14: blend += drr_4w  * 0.5;  total_w += 0.5
    if d13 >= 14: blend += drr_13w * 0.35; total_w += 0.35
    if d52 >= 14: blend += drr_52w * 0.15; total_w += 0.15
    drr_rec = (blend / total_w * 1.0) if total_w > 0 else 0.0

    # ── Current stock (SRS §3.2.4) ────────────────────────────────────────────
    if branch_id:
        snap = await fetchone(db,
            "SELECT quantity_on_hand, snapshot_date FROM inventory_snapshots WHERE sku_id=%s AND branch_id=%s ORDER BY snapshot_date DESC LIMIT 1",
            (sku_id, branch_id))
    else:
        # Consolidated: sum each branch's OWN latest snapshot (not global max date)
        snap = await fetchone(db,
            """SELECT COALESCE(SUM(latest.quantity_on_hand), 0) AS quantity_on_hand,
                      MAX(latest.snapshot_date) AS snapshot_date
               FROM (
                   SELECT DISTINCT ON (branch_id)
                          quantity_on_hand, snapshot_date
                   FROM inventory_snapshots
                   WHERE sku_id = %s
                   ORDER BY branch_id, snapshot_date DESC
               ) latest""",
            (sku_id,))

    current_stock  = float(snap["quantity_on_hand"] if snap else 0) or 0.0
    last_snap_date = snap["snapshot_date"].strftime("%Y-%m-%d") if snap and snap.get("snapshot_date") else None

    # ── WOI ───────────────────────────────────────────────────────────────────
    woi, woi_status = _woi_status(current_stock, drr_rec * 7, woi_red, woi_amber)

    # ── MSL ───────────────────────────────────────────────────────────────────
    sku = await fetchone(db, "SELECT msl_override FROM skus WHERE id=%s", (sku_id,))
    msl_override  = (sku or {}).get("msl_override")
    msl_suggested = int(msl_override) if msl_override is not None else math.ceil(drr_rec * lead_time_days * 1.2)

    target_days         = int(target_woi_weeks * 7)
    target_12w_qty      = math.ceil(drr_rec * target_days)
    suggested_order_qty = max(0, target_12w_qty - int(current_stock))

    # ── Seasonal 5-step engine (SRS §6.2.6) ───────────────────────────────────
    drr_seasonal = None; seasonal_uplift_pct = None
    pre_season_alert = False; latest_order_date = None

    sku_data = await fetchone(db, "SELECT season_tags FROM skus WHERE id=%s", (sku_id,))
    tags = []
    if sku_data and sku_data.get("season_tags"):
        raw = sku_data["season_tags"]
        try:
            tags = json.loads(raw) if isinstance(raw, str) else (raw or [])
        except Exception:
            tags = []

    today = datetime.date.today()
    best_s_drr, best_uplift, best_ord = None, None, None

    for tag in tags:
        start_m, end_m = int(tag.get("start_month", 1)), int(tag.get("end_month", 12))
        ss = datetime.date(today.year, start_m, 1)
        se = datetime.date(today.year, end_m, 28)
        if se < today:
            ss = datetime.date(today.year + 1, start_m, 1)
            se = datetime.date(today.year + 1, end_m, 28)

        days_to = (ss - today).days
        in_season = ss <= today <= se
        upcoming  = 0 < days_to <= 140
        if not in_season and not upcoming:
            continue

        py = today.year - 1
        ps, pe = f"{py}-{start_m:02d}-01", f"{py}-{end_m:02d}-28"
        prior = await fetchone(db,
            f"SELECT COALESCE(SUM(quantity),0) AS tq, (%s::date-%s::date)+1 AS days FROM sales WHERE sku_id=%s {bf} AND sale_date BETWEEN %s AND %s",
            (pe, ps, sku_id)+bp+(ps, pe))
        pqty  = float((prior or {}).get("tq", 0) or 0)
        pdays = int((prior or {}).get("days", 1) or 1)
        s_drr = pqty / pdays if pdays > 0 else 0.0
        if s_drr <= 0:
            continue

        py2 = await fetchone(db,
            f"SELECT COALESCE(SUM(quantity),0) AS tq FROM sales WHERE sku_id=%s {bf} AND sale_date BETWEEN %s AND %s",
            (sku_id,)+bp+(f"{today.year-2}-{start_m:02d}-01", f"{today.year-2}-{end_m:02d}-28"))
        py2_qty = float((py2 or {}).get("tq", 0) or 0)
        if py2_qty > 0:
            s_drr = (s_drr + py2_qty / pdays) / 2

        uplift = ((s_drr - drr_rec) / drr_rec * 100) if drr_rec > 0 else 0.0
        if s_drr <= drr_rec and drr_rec > 0:
            continue
        if best_s_drr is None or s_drr > best_s_drr:
            best_s_drr, best_uplift = s_drr, uplift
        if upcoming:
            ord_d = ss - datetime.timedelta(days=lead_time_days)
            if best_ord is None or ord_d < best_ord:
                best_ord = ord_d
            pre_season_alert = True

    if best_s_drr is not None:
        drr_seasonal        = round(best_s_drr, 4)
        seasonal_uplift_pct = round(best_uplift, 2) if best_uplift is not None else None
        latest_order_date   = best_ord.strftime("%Y-%m-%d") if best_ord else None
        if pre_season_alert:
            woi, woi_status     = _woi_status(current_stock, best_s_drr * 7, woi_red, woi_amber)
            target_12w_qty      = math.ceil(best_s_drr * target_days)
            suggested_order_qty = max(0, target_12w_qty - int(current_stock))

    return {
        "sku_id": sku_id, "branch_id": branch_id,
        "drr_4w": round(drr_4w, 4), "drr_13w": round(drr_13w, 4), "drr_52w": round(drr_52w, 4),
        "drr_recommended": round(drr_rec, 4), "drr_seasonal": drr_seasonal,
        "seasonal_uplift_pct": seasonal_uplift_pct, "woi": woi, "woi_status": woi_status,
        "msl_suggested": msl_suggested, "target_12w_qty": target_12w_qty,
        "suggested_order_qty": suggested_order_qty, "pre_season_alert": pre_season_alert,
        "latest_order_date": latest_order_date, "current_stock": round(current_stock, 3),
        "last_snapshot_date": last_snap_date,
    }


def _fc_upsert_params(m):
    return (
        m["sku_id"], m["branch_id"],
        m["drr_4w"], m["drr_13w"], m["drr_52w"], m["drr_recommended"],
        m["drr_seasonal"], m["seasonal_uplift_pct"],
        m["woi"], m["woi_status"], m["msl_suggested"],
        m["target_12w_qty"], m["suggested_order_qty"],
        m["pre_season_alert"], m["latest_order_date"],
        m["current_stock"], m["last_snapshot_date"],
    )

_FC_COLS = """(sku_id, branch_id, computed_at,
      drr_4w, drr_13w, drr_52w, drr_recommended,
      drr_seasonal, seasonal_uplift_pct,
      woi, woi_status, msl_suggested,
      target_12w_qty, suggested_order_qty,
      pre_season_alert, latest_order_date,
      current_stock, last_snapshot_date)"""

_FC_DO_UPDATE = """SET
      computed_at=NOW(),
      drr_4w=EXCLUDED.drr_4w, drr_13w=EXCLUDED.drr_13w,
      drr_52w=EXCLUDED.drr_52w, drr_recommended=EXCLUDED.drr_recommended,
      drr_seasonal=EXCLUDED.drr_seasonal,
      seasonal_uplift_pct=EXCLUDED.seasonal_uplift_pct,
      woi=EXCLUDED.woi, woi_status=EXCLUDED.woi_status,
      msl_suggested=EXCLUDED.msl_suggested,
      target_12w_qty=EXCLUDED.target_12w_qty,
      suggested_order_qty=EXCLUDED.suggested_order_qty,
      pre_season_alert=EXCLUDED.pre_season_alert,
      latest_order_date=EXCLUDED.latest_order_date,
      current_stock=EXCLUDED.current_stock,
      last_snapshot_date=EXCLUDED.last_snapshot_date"""

_FC_CONSOLIDATED_SQL = f"""INSERT INTO forecasting_cache {_FC_COLS}
   VALUES (%s,NULL,NOW(),%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
   ON CONFLICT (sku_id) WHERE branch_id IS NULL DO UPDATE {_FC_DO_UPDATE}"""

_FC_BRANCH_SQL = f"""INSERT INTO forecasting_cache {_FC_COLS}
   VALUES (%s,%s,NOW(),%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
   ON CONFLICT (sku_id, branch_id) WHERE branch_id IS NOT NULL DO UPDATE {_FC_DO_UPDATE}"""


async def recompute_all(db, lead_time_days: int = DEFAULT_LEAD_TIME,
                        woi_red: float = 4.0, woi_amber: float = 8.0,
                        target_woi_weeks: float = 12.0) -> dict:
    skus = await fetchall(db, "SELECT id FROM skus WHERE is_active=TRUE")
    branches = await fetchall(db, "SELECT id FROM branches WHERE is_active=TRUE")
    processed = 0

    for sku in skus:
        sid = sku["id"]
        # Consolidated
        try:
            m = await compute_sku_forecast(db, sid, lead_time_days, branch_id=None,
                                           woi_red=woi_red, woi_amber=woi_amber,
                                           target_woi_weeks=target_woi_weeks)
            p = _fc_upsert_params(m)
            await execute(db, _FC_CONSOLIDATED_SQL, (p[0], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11], p[12], p[13], p[14], p[15], p[16]))
            processed += 1
        except Exception as e:
            print(f"[Forecast] Consolidated error SKU {sid}: {e}")

        # Per-branch
        for branch in branches:
            bid = branch["id"]
            try:
                m = await compute_sku_forecast(db, sid, lead_time_days, branch_id=str(bid),
                                               woi_red=woi_red, woi_amber=woi_amber,
                                               target_woi_weeks=target_woi_weeks)
                p = _fc_upsert_params(m)
                await execute(db, _FC_BRANCH_SQL, p)
                processed += 1
            except Exception as e:
                print(f"[Forecast] Branch {bid} error SKU {sid}: {e}")

    return {"processed": processed, "total": len(skus)}


# ──────────────────────────────────────────────────────────────────────────────
# Sync versions for Celery workers
# ──────────────────────────────────────────────────────────────────────────────

def sync_compute_sku_forecast(conn, sku_id: str, lead_time_days: int = DEFAULT_LEAD_TIME, branch_id: str = None,
                              woi_red: float = 4.0, woi_amber: float = 8.0,
                              target_woi_weeks: float = 12.0) -> dict:
    def q1(sql, args=()):
        return sync_fetchone(conn, sql, args) or {}

    bf, bp = _branch_filter(branch_id)

    drr_4w  = float(q1(f"SELECT COALESCE(SUM(quantity),0)/28  AS v FROM sales WHERE sku_id=%s {bf} AND sale_date>=CURRENT_DATE - INTERVAL '28 days'",  (sku_id,)+bp).get("v", 0))
    drr_13w = float(q1(f"SELECT COALESCE(SUM(quantity),0)/91  AS v FROM sales WHERE sku_id=%s {bf} AND sale_date>=CURRENT_DATE - INTERVAL '91 days'",  (sku_id,)+bp).get("v", 0))
    drr_52w = float(q1(f"SELECT COALESCE(SUM(quantity),0)/364 AS v FROM sales WHERE sku_id=%s {bf} AND sale_date>=CURRENT_DATE - INTERVAL '364 days'", (sku_id,)+bp).get("v", 0))

    d4  = int(q1(f"SELECT COUNT(DISTINCT sale_date) AS d FROM sales WHERE sku_id=%s {bf} AND sale_date>=CURRENT_DATE - INTERVAL '28 days'",  (sku_id,)+bp).get("d", 0))
    d13 = int(q1(f"SELECT COUNT(DISTINCT sale_date) AS d FROM sales WHERE sku_id=%s {bf} AND sale_date>=CURRENT_DATE - INTERVAL '91 days'",  (sku_id,)+bp).get("d", 0))
    d52 = int(q1(f"SELECT COUNT(DISTINCT sale_date) AS d FROM sales WHERE sku_id=%s {bf} AND sale_date>=CURRENT_DATE - INTERVAL '364 days'", (sku_id,)+bp).get("d", 0))

    blend, total_w = 0.0, 0.0
    if d4  >= 14: blend += drr_4w  * 0.5;  total_w += 0.5
    if d13 >= 14: blend += drr_13w * 0.35; total_w += 0.35
    if d52 >= 14: blend += drr_52w * 0.15; total_w += 0.15
    drr_rec = (blend / total_w * 1.0) if total_w > 0 else 0.0

    if branch_id:
        snap = q1("SELECT quantity_on_hand, snapshot_date FROM inventory_snapshots WHERE sku_id=%s AND branch_id=%s ORDER BY snapshot_date DESC LIMIT 1", (sku_id, branch_id))
    else:
        # Consolidated: sum each branch's OWN latest snapshot (not global max date)
        snap = q1(
            """SELECT COALESCE(SUM(latest.quantity_on_hand), 0) AS quantity_on_hand,
                      MAX(latest.snapshot_date) AS snapshot_date
               FROM (
                   SELECT DISTINCT ON (branch_id)
                          quantity_on_hand, snapshot_date
                   FROM inventory_snapshots
                   WHERE sku_id = %s
                   ORDER BY branch_id, snapshot_date DESC
               ) latest""",
            (sku_id,))

    current_stock  = float(snap.get("quantity_on_hand", 0) or 0)
    snap_date_raw  = snap.get("snapshot_date")
    last_snap_date = snap_date_raw.strftime("%Y-%m-%d") if snap_date_raw and hasattr(snap_date_raw, "strftime") else str(snap_date_raw) if snap_date_raw else None

    woi, woi_status = _woi_status(current_stock, drr_rec * 7, woi_red, woi_amber)

    sku = q1("SELECT msl_override FROM skus WHERE id=%s", (sku_id,))
    msl_override  = sku.get("msl_override")
    msl_suggested = int(msl_override) if msl_override is not None else math.ceil(drr_rec * lead_time_days * 1.2)
    target_days   = int(target_woi_weeks * 7)
    target_12w    = math.ceil(drr_rec * target_days)
    order_qty     = max(0, target_12w - int(current_stock))

    drr_seasonal = None; seasonal_uplift_pct = None
    pre_season_alert = False; latest_order_date = None

    sku_data = q1("SELECT season_tags FROM skus WHERE id=%s", (sku_id,))
    raw_tags = sku_data.get("season_tags")
    tags = []
    if raw_tags:
        try:
            tags = json.loads(raw_tags) if isinstance(raw_tags, str) else (raw_tags or [])
        except Exception:
            tags = []

    today = datetime.date.today()
    best_s_drr, best_uplift, best_ord = None, None, None

    for tag in tags:
        start_m, end_m = int(tag.get("start_month", 1)), int(tag.get("end_month", 12))
        ss = datetime.date(today.year, start_m, 1)
        se = datetime.date(today.year, end_m, 28)
        if se < today:
            ss = datetime.date(today.year + 1, start_m, 1)
            se = datetime.date(today.year + 1, end_m, 28)

        days_to  = (ss - today).days
        in_season = ss <= today <= se
        upcoming  = 0 < days_to <= 140
        if not in_season and not upcoming:
            continue

        py = today.year - 1
        ps, pe = f"{py}-{start_m:02d}-01", f"{py}-{end_m:02d}-28"
        prior = q1(
            f"SELECT COALESCE(SUM(quantity),0) AS tq, (%s::date-%s::date)+1 AS days FROM sales WHERE sku_id=%s {bf} AND sale_date BETWEEN %s AND %s",
            (pe, ps, sku_id)+bp+(ps, pe))
        pqty  = float(prior.get("tq", 0) or 0)
        pdays = int(prior.get("days", 1) or 1)
        s_drr = pqty / pdays if pdays > 0 else 0.0
        if s_drr <= 0:
            continue

        py2 = q1(
            f"SELECT COALESCE(SUM(quantity),0) AS tq FROM sales WHERE sku_id=%s {bf} AND sale_date BETWEEN %s AND %s",
            (sku_id,)+bp+(f"{today.year-2}-{start_m:02d}-01", f"{today.year-2}-{end_m:02d}-28"))
        py2_qty = float(py2.get("tq", 0) or 0)
        if py2_qty > 0:
            s_drr = (s_drr + py2_qty / pdays) / 2

        uplift = ((s_drr - drr_rec) / drr_rec * 100) if drr_rec > 0 else 0.0
        if s_drr <= drr_rec and drr_rec > 0:
            continue
        if best_s_drr is None or s_drr > best_s_drr:
            best_s_drr, best_uplift = s_drr, uplift
        if upcoming:
            ord_d = ss - datetime.timedelta(days=lead_time_days)
            if best_ord is None or ord_d < best_ord:
                best_ord = ord_d
            pre_season_alert = True

    if best_s_drr is not None:
        drr_seasonal        = round(best_s_drr, 4)
        seasonal_uplift_pct = round(best_uplift, 2) if best_uplift is not None else None
        latest_order_date   = best_ord.strftime("%Y-%m-%d") if best_ord else None
        if pre_season_alert:
            woi, woi_status = _woi_status(current_stock, best_s_drr * 7, woi_red, woi_amber)
            target_12w  = math.ceil(best_s_drr * target_days)
            order_qty   = max(0, target_12w - int(current_stock))

    return {
        "sku_id": sku_id, "branch_id": branch_id,
        "drr_4w": round(drr_4w, 4), "drr_13w": round(drr_13w, 4), "drr_52w": round(drr_52w, 4),
        "drr_recommended": round(drr_rec, 4), "drr_seasonal": drr_seasonal,
        "seasonal_uplift_pct": seasonal_uplift_pct, "woi": woi, "woi_status": woi_status,
        "msl_suggested": msl_suggested, "target_12w_qty": target_12w,
        "suggested_order_qty": order_qty, "pre_season_alert": pre_season_alert,
        "latest_order_date": latest_order_date, "current_stock": round(current_stock, 3),
        "last_snapshot_date": last_snap_date,
    }


def sync_recompute_all(conn, lead_time_days: int = DEFAULT_LEAD_TIME,
                       woi_red: float = 4.0, woi_amber: float = 8.0,
                       target_woi_weeks: float = 12.0) -> dict:
    skus     = sync_fetchall(conn, "SELECT id FROM skus WHERE is_active=TRUE")
    branches = sync_fetchall(conn, "SELECT id FROM branches WHERE is_active=TRUE")
    processed = 0

    for sku in skus:
        sid = sku["id"]
        # Consolidated
        try:
            m = sync_compute_sku_forecast(conn, sid, lead_time_days, branch_id=None,
                                          woi_red=woi_red, woi_amber=woi_amber,
                                          target_woi_weeks=target_woi_weeks)
            p = _fc_upsert_params(m)
            sync_execute(conn, _FC_CONSOLIDATED_SQL,
                (p[0], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11], p[12], p[13], p[14], p[15], p[16]))
            processed += 1
        except Exception as e:
            print(f"[Forecast] Consolidated error SKU {sid}: {e}")

        # Per-branch
        for branch in branches:
            bid = str(branch["id"])
            try:
                m = sync_compute_sku_forecast(conn, sid, lead_time_days, branch_id=bid,
                                              woi_red=woi_red, woi_amber=woi_amber,
                                              target_woi_weeks=target_woi_weeks)
                p = _fc_upsert_params(m)
                sync_execute(conn, _FC_BRANCH_SQL, p)
                processed += 1
            except Exception as e:
                print(f"[Forecast] Branch {bid} error SKU {sid}: {e}")

    return {"processed": processed, "total": len(skus)}
