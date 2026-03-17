from fastapi import APIRouter, BackgroundTasks, Depends
from config.db import fetchall, fetchone, get_public_pool
from middleware.auth import require_role, get_tenant_db
from services.forecasting_service import DEFAULT_LEAD_TIME

router = APIRouter(prefix="/forecasting", tags=["forecasting"])


# GET /forecasting/pre-season-alerts
@router.get("/pre-season-alerts")
async def pre_season_alerts(
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    rows = await fetchall(db,
        """SELECT s.id, s.sku_code, s.sku_name, s.brand, s.category, s.season_tags,
                  fc.drr_recommended, fc.woi, fc.woi_status, fc.msl_suggested,
                  fc.suggested_order_qty, fc.pre_season_alert, fc.latest_order_date, fc.computed_at
           FROM forecasting_cache fc JOIN skus s ON s.id = fc.sku_id
           WHERE fc.pre_season_alert = TRUE AND fc.branch_id IS NULL
           ORDER BY fc.woi ASC"""
    )
    return {"data": rows, "total": len(rows)}


# GET /forecasting/status
@router.get("/status")
async def forecasting_status(
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    """Return last computed_at per branch (NULL = consolidated) from forecasting_cache."""
    rows = await fetchall(db,
        """SELECT fc.branch_id, b.branch_name,
                  MAX(fc.computed_at) AS last_computed_at,
                  COUNT(*) AS sku_count
           FROM forecasting_cache fc
           LEFT JOIN branches b ON b.id = fc.branch_id
           GROUP BY fc.branch_id, b.branch_name
           ORDER BY fc.branch_id NULLS FIRST"""
    )
    pub = await get_public_pool()
    tenant_row = await fetchone(pub,
        "SELECT lead_time_days FROM tenants WHERE id = %s", (user["tenantId"],))
    lead_time = (tenant_row or {}).get("lead_time_days") or DEFAULT_LEAD_TIME
    return {"data": rows, "lead_time_days": lead_time}


async def _get_tenant_forecast_settings(user: dict) -> tuple:
    """Return (lead_time_days, woi_red, woi_amber, target_woi_weeks) from tenant config."""
    pub = await get_public_pool()
    t = await fetchone(pub,
        "SELECT lead_time_days, woi_red_threshold, woi_amber_threshold, target_woi_weeks FROM tenants WHERE id = %s",
        (user["tenantId"],))
    t = t or {}
    return (
        t.get("lead_time_days") or DEFAULT_LEAD_TIME,
        float(t.get("woi_red_threshold") or 4.0),
        float(t.get("woi_amber_threshold") or 8.0),
        float(t.get("target_woi_weeks") or 12.0),
    )


# POST /forecasting/recompute
@router.post("/recompute")
async def recompute(
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    lead_time, woi_red, woi_amber, target_woi_weeks = await _get_tenant_forecast_settings(user)
    from workers.forecast_tasks import recompute_all
    background_tasks.add_task(recompute_all, {
        "tenant_id":        user.get("tenantId"),
        "tenant_db_name":   user["tenantDbName"],
        "lead_time_days":   lead_time,
        "woi_red":          woi_red,
        "woi_amber":        woi_amber,
        "target_woi_weeks": target_woi_weeks,
    })
    return {"message": "Recompute queued"}


# POST /forecasting/recompute/{sku_id}
@router.post("/recompute/{sku_id}")
async def recompute_sku(
    sku_id: str,
    branch_id: str = "",
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    """Recompute forecast for a single SKU immediately (sync, not queued)."""
    from services.forecasting_service import compute_sku_forecast, _fc_upsert_params, _FC_CONSOLIDATED_SQL, _FC_BRANCH_SQL
    from config.db import execute

    lead_time, woi_red, woi_amber, target_woi_weeks = await _get_tenant_forecast_settings(user)

    bid = branch_id or None
    result = await compute_sku_forecast(db, sku_id, lead_time, branch_id=bid,
                                        woi_red=woi_red, woi_amber=woi_amber,
                                        target_woi_weeks=target_woi_weeks)
    p = _fc_upsert_params(result)
    if bid:
        await execute(db, _FC_BRANCH_SQL, p)
    else:
        await execute(db, _FC_CONSOLIDATED_SQL,
            (p[0], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11], p[12], p[13], p[14], p[15], p[16]))
    return {"message": "Recomputed", "sku_id": sku_id, "branch_id": bid, "result": result}
