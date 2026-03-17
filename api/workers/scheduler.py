"""APScheduler — embedded background scheduler for IIS.

Replaces Celery + Redis. All jobs run inside the FastAPI process.
Timezone: Asia/Kolkata (IST = UTC+5:30)

Fixed jobs (same time for all tenants):
  02:00 IST daily   — nightly_forecast
  03:00 IST daily   — reorder_delivery_check
  03:15 IST daily   — outstanding_auto_close
  03:30 IST daily   — outstanding_missed_payment
  03:45 IST daily   — outstanding_snooze_expiry

Per-tenant Busy sync jobs (loaded from tenants table at startup):
  busy_delta_tx_{tenant_id}      — configurable time (default 23:00 IST daily)
  busy_delta_masters_{tenant_id} — configurable day+time (default Sun 01:00 IST)
"""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

_IST = "Asia/Kolkata"
_scheduler = BackgroundScheduler(timezone=_IST)


# ── Fixed jobs ────────────────────────────────────────────────────────────────

def _setup_fixed_jobs():
    from workers.forecast_tasks import nightly_forecast
    from workers.nightly_tasks import (
        reorder_delivery_check,
        outstanding_auto_close,
        outstanding_missed_payment,
        outstanding_snooze_expiry,
    )
    _scheduler.add_job(nightly_forecast,           CronTrigger(hour=2,  minute=0,  timezone=_IST), id="nightly_forecast",           replace_existing=True)
    _scheduler.add_job(reorder_delivery_check,     CronTrigger(hour=3,  minute=0,  timezone=_IST), id="reorder_delivery_check",     replace_existing=True)
    _scheduler.add_job(outstanding_auto_close,     CronTrigger(hour=3,  minute=15, timezone=_IST), id="outstanding_auto_close",     replace_existing=True)
    _scheduler.add_job(outstanding_missed_payment, CronTrigger(hour=3,  minute=30, timezone=_IST), id="outstanding_missed_payment", replace_existing=True)
    _scheduler.add_job(outstanding_snooze_expiry,  CronTrigger(hour=3,  minute=45, timezone=_IST), id="outstanding_snooze_expiry",  replace_existing=True)


# ── Per-tenant Busy sync jobs ─────────────────────────────────────────────────

def _make_tx_job(tenant_id):
    from workers.busy_sync_tasks import sync_delta_transactions_for_tenant
    def _job():
        sync_delta_transactions_for_tenant(tenant_id)
    _job.__name__ = f"busy_tx_{tenant_id}"
    return _job


def _make_masters_job(tenant_id):
    from workers.busy_sync_tasks import sync_delta_masters_for_tenant
    def _job():
        sync_delta_masters_for_tenant(tenant_id)
    _job.__name__ = f"busy_masters_{tenant_id}"
    return _job


def schedule_busy_tenant(tenant_id, tx_hour, tx_minute, masters_day, masters_hour, masters_minute):
    """Add or replace APScheduler jobs for a single busy-enabled tenant."""
    _scheduler.add_job(
        _make_tx_job(tenant_id),
        CronTrigger(hour=tx_hour, minute=tx_minute, timezone=_IST),
        id=f"busy_tx_{tenant_id}", replace_existing=True,
    )
    _scheduler.add_job(
        _make_masters_job(tenant_id),
        CronTrigger(day_of_week=masters_day, hour=masters_hour, minute=masters_minute, timezone=_IST),
        id=f"busy_masters_{tenant_id}", replace_existing=True,
    )
    print(f"[Scheduler] Busy jobs set for tenant {tenant_id}: "
          f"tx={tx_hour:02d}:{tx_minute:02d} IST daily, "
          f"masters={masters_day} {masters_hour:02d}:{masters_minute:02d} IST")


def unschedule_busy_tenant(tenant_id):
    """Remove busy sync jobs for a tenant (when busy is disabled)."""
    for job_id in (f"busy_tx_{tenant_id}", f"busy_masters_{tenant_id}"):
        try:
            _scheduler.remove_job(job_id)
        except Exception:
            pass


def _load_busy_tenant_jobs():
    """At startup: load all busy-enabled tenants from DB and register their jobs."""
    import psycopg2
    import psycopg2.extras
    from config import settings
    try:
        conn = psycopg2.connect(
            host=settings.DB_HOST, port=settings.DB_PORT,
            dbname=settings.DB_NAME, user=settings.DB_USER, password=settings.DB_PASSWORD,
            options=f"-c search_path={settings.DB_SCHEMA_PUBLIC},public",
        )
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT id,
                       COALESCE(busy_transactions_hour,   23)    AS tx_hour,
                       COALESCE(busy_transactions_minute,  0)    AS tx_minute,
                       COALESCE(busy_masters_hour,         1)    AS masters_hour,
                       COALESCE(busy_masters_minute,       0)    AS masters_minute,
                       COALESCE(busy_masters_day,       'sun')   AS masters_day
                FROM tenants
                WHERE busy_enabled = TRUE
                  AND busy_host IS NOT NULL
                  AND busy_username IS NOT NULL
            """)
            tenants = cur.fetchall()
        conn.close()
        for t in tenants:
            schedule_busy_tenant(
                str(t["id"]),
                int(t["tx_hour"]), int(t["tx_minute"]),
                t["masters_day"],
                int(t["masters_hour"]), int(t["masters_minute"]),
            )
        print(f"[Scheduler] Loaded busy sync jobs for {len(tenants)} tenant(s)")
    except Exception as e:
        print(f"[Scheduler] WARNING: Could not load busy tenant jobs: {e}")


# ── Lifecycle ─────────────────────────────────────────────────────────────────

def start_scheduler():
    _setup_fixed_jobs()
    _load_busy_tenant_jobs()
    _scheduler.start()
    print("[IIS] APScheduler started")


def stop_scheduler():
    _scheduler.shutdown(wait=False)
    print("[IIS] APScheduler stopped")
