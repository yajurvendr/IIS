from config.db import get_sync_conn, sync_fetchall, sync_fetchone
from config import settings
from services.forecasting_service import sync_recompute_all, DEFAULT_LEAD_TIME


def recompute_all(payload: dict):
    tenant_db = payload["tenant_db_name"]
    tenant_id = payload.get("tenant_id")

    lead_time        = payload.get("lead_time_days") or DEFAULT_LEAD_TIME
    woi_red          = payload.get("woi_red", 4.0)
    woi_amber        = payload.get("woi_amber", 8.0)
    target_woi_weeks = payload.get("target_woi_weeks", 12.0)

    if tenant_id and not payload.get("lead_time_days"):
        pub_conn = get_sync_conn(settings.DB_SCHEMA_PUBLIC)
        try:
            row = sync_fetchone(pub_conn,
                "SELECT lead_time_days, woi_red_threshold, woi_amber_threshold, target_woi_weeks FROM tenants WHERE id = %s",
                (tenant_id,))
            if row:
                lead_time        = row.get("lead_time_days") or DEFAULT_LEAD_TIME
                woi_red          = float(row.get("woi_red_threshold") or 4.0)
                woi_amber        = float(row.get("woi_amber_threshold") or 8.0)
                target_woi_weeks = float(row.get("target_woi_weeks") or 12.0)
        finally:
            pub_conn.close()

    conn = get_sync_conn(tenant_db)
    try:
        result = sync_recompute_all(conn, lead_time, woi_red=woi_red, woi_amber=woi_amber,
                                    target_woi_weeks=target_woi_weeks)
        print(f"[ForecastWorker] Done: {result['processed']}/{result['total']} SKUs for {tenant_db}")
        return result
    finally:
        conn.close()


def nightly_forecast():
    """Nightly scheduled job — runs at 2 AM IST.
    Recomputes forecasting cache for every active/trial tenant.
    """
    pub_conn = get_sync_conn(settings.DB_SCHEMA_PUBLIC)
    try:
        tenants = sync_fetchall(pub_conn,
            "SELECT id, db_name, lead_time_days, woi_red_threshold, woi_amber_threshold, target_woi_weeks FROM tenants WHERE status IN ('active', 'trial')")
    finally:
        pub_conn.close()

    print(f"[NightlyForecast] Recomputing forecasts for {len(tenants)} tenants")
    for tenant in tenants:
        db_name          = tenant["db_name"]
        lead_time        = tenant.get("lead_time_days") or DEFAULT_LEAD_TIME
        woi_red          = float(tenant.get("woi_red_threshold") or 4.0)
        woi_amber        = float(tenant.get("woi_amber_threshold") or 8.0)
        target_woi_weeks = float(tenant.get("target_woi_weeks") or 12.0)
        try:
            conn = get_sync_conn(db_name)
            try:
                result = sync_recompute_all(conn, lead_time, woi_red=woi_red, woi_amber=woi_amber,
                                            target_woi_weeks=target_woi_weeks)
                print(f"[NightlyForecast] {db_name}: {result['processed']}/{result['total']} SKUs")
            finally:
                conn.close()
        except Exception as exc:
            print(f"[NightlyForecast] ERROR for {db_name}: {exc}")
            continue

    return {"tenants_processed": len(tenants)}
