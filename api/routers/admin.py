import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import json
from config.db import get_public_pool, get_tenant_pool, fetchall, fetchone, execute
from middleware.auth import require_super_admin, require_role
from services.provision_service import provision_tenant
from services.password_service import pwd_ctx

router = APIRouter(prefix="/admin", tags=["admin"])

SA = Depends(require_super_admin)


# ── Dashboard ─────────────────────────────────────────────────────────────────
@router.get("/dashboard")
async def admin_dashboard(user: dict = SA):
    import asyncio
    pub = await get_public_pool()
    (
        totals_r, status_r, tenants_r, plan_r,
        mrr_r, trials_expiring_r, growth_r, activity_r, announcement_r, mtd_r,
    ) = await asyncio.gather(
        fetchone(pub, """SELECT
            (SELECT COUNT(*) FROM tenants) AS total_tenants,
            (SELECT COUNT(*) FROM tenants WHERE status='active') AS active_tenants,
            (SELECT COUNT(*) FROM tenants WHERE status='trial') AS trial_tenants,
            (SELECT COUNT(*) FROM tenants WHERE status='suspended') AS suspended_tenants"""),
        fetchall(pub, "SELECT status, COUNT(*) AS cnt FROM tenants GROUP BY status"),
        fetchall(pub, """SELECT t.id, t.business_name, t.slug, t.status, t.last_login_at,
                                p.name AS plan_name
                         FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id
                         ORDER BY t.last_login_at DESC LIMIT 20"""),
        fetchall(pub, """SELECT p.name AS plan, COUNT(t.id) AS cnt,
                                COALESCE(p.price_monthly, 0) AS price_monthly
                         FROM tenants t JOIN plans p ON p.id = t.plan_id
                         WHERE t.status IN ('active','trial')
                         GROUP BY p.id, p.name, p.price_monthly ORDER BY cnt DESC"""),
        fetchone(pub, """SELECT COALESCE(SUM(p.price_monthly), 0) AS mrr
                         FROM tenants t JOIN plans p ON p.id = t.plan_id
                         WHERE t.status = 'active'"""),
        fetchone(pub, """SELECT COUNT(*) AS cnt FROM tenants
                         WHERE status = 'trial'
                           AND trial_ends_at IS NOT NULL
                           AND trial_ends_at <= NOW() + INTERVAL '7 days'
                           AND trial_ends_at >= NOW()"""),
        fetchall(pub, """SELECT TO_CHAR(created_at,'YYYY-MM') AS month, COUNT(*) AS cnt
                         FROM tenants WHERE created_at >= NOW() - INTERVAL '12 months'
                         GROUP BY month ORDER BY month"""),
        fetchall(pub, """SELECT al.action, al.entity, al.created_at, al.details,
                                t.business_name
                         FROM audit_log al
                         LEFT JOIN tenants t ON t.id::text = al.entity_id::text AND al.entity = 'tenant'
                         ORDER BY al.created_at DESC LIMIT 8"""),
        fetchone(pub, """SELECT id, title, body, type, created_at FROM announcements
                         WHERE display_until >= NOW() AND display_from <= NOW()
                         ORDER BY created_at DESC LIMIT 1"""),
        fetchone(pub, """SELECT COUNT(*) AS new_mtd FROM tenants
                         WHERE EXTRACT(MONTH FROM created_at)=EXTRACT(MONTH FROM NOW())
                           AND EXTRACT(YEAR FROM created_at)=EXTRACT(YEAR FROM NOW())"""),
    )

    # Platform health check
    db_ok = True
    try:
        await fetchone(pub, "SELECT 1")
    except Exception:
        db_ok = False

    from workers.scheduler import _scheduler
    scheduler_ok = _scheduler.running

    return {
        **totals_r,
        "mrr":               float(mrr_r["mrr"] or 0),
        "arr":               float(mrr_r["mrr"] or 0) * 12,
        "new_tenants_mtd":   int(mtd_r["new_mtd"] or 0),
        "trials_expiring":   int(trials_expiring_r["cnt"] or 0),
        "status_breakdown":  status_r,
        "tenants":           tenants_r,
        "plan_breakdown":    plan_r,
        "tenant_growth":     growth_r,
        "activity_feed":     activity_r,
        "active_announcement": announcement_r,
        "platform_health": {
            "db_ok":        db_ok,
            "scheduler_ok": scheduler_ok,
        },
    }


# ── Tenants ───────────────────────────────────────────────────────────────────
@router.get("/tenants")
async def list_tenants(
    search: str = "", status: str = "", page: int = 1, limit: int = 20, user: dict = SA
):
    pub = await get_public_pool()
    offset = (page - 1) * limit
    where, params = "WHERE 1=1", []
    if search: where += " AND (t.business_name ILIKE %s OR t.slug ILIKE %s)"; params += [f"%{search}%"] * 2
    if status: where += " AND t.status = %s"; params.append(status)

    rows = await fetchall(pub,
        f"SELECT t.*, p.name AS plan_name FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id {where} ORDER BY t.created_at DESC LIMIT %s OFFSET %s",
        params + [limit, offset]
    )
    total_r = await fetchone(pub, f"SELECT COUNT(*) AS total FROM tenants t {where}", params)
    return {"data": rows, "total": total_r["total"], "page": page, "limit": limit}


class CreateTenantBody(BaseModel):
    business_name: str
    slug: str
    contact_email: str
    contact_phone: str | None = None
    plan_id: str | None = None
    admin_name: str = "Admin"
    admin_email: str
    admin_password: str


@router.post("/tenants", status_code=201)
async def create_tenant(body: CreateTenantBody, user: dict = SA):
    result = await provision_tenant({**body.model_dump(), "created_by": user["userId"]})
    return result


@router.patch("/tenants/{tenant_id}")
async def update_tenant(tenant_id: str, body: dict, user: dict = SA):
    pub = await get_public_pool()
    col_map = {"contact_email": "email", "contact_phone": "phone"}
    allowed = {"business_name", "contact_email", "contact_phone", "plan_id", "status", "trial_ends_at"}
    updates = {col_map.get(k, k): v for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    await execute(pub, f"UPDATE tenants SET {set_clause} WHERE id = %s", list(updates.values()) + [tenant_id])
    await execute(pub,
        "INSERT INTO audit_log (user_id, user_role, action, entity, entity_id, details) VALUES (%s,'super_admin','update_tenant','tenant',%s,%s)",
        (user["userId"], tenant_id, json.dumps(updates))
    )
    return {"message": "Tenant updated"}


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, user: dict = SA):
    pub = await get_public_pool()
    await execute(pub, "UPDATE tenants SET status = 'churned' WHERE id = %s", (tenant_id,))
    await execute(pub,
        "INSERT INTO audit_log (user_id, user_role, action, entity, entity_id, details) VALUES (%s,'super_admin','churn_tenant','tenant',%s,'{}') ",
        (user["userId"], tenant_id)
    )
    return {"message": "Tenant churned"}


@router.delete("/tenants/{tenant_id}/permanent")
async def permanently_delete_tenant(tenant_id: str, user: dict = SA):
    import psycopg2
    from config import settings as cfg
    pub = await get_public_pool()
    tenant = await fetchone(pub, "SELECT db_name, business_name FROM tenants WHERE id = %s", (tenant_id,))
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    schema_name = tenant["db_name"]

    # Drop the tenant schema
    try:
        conn = psycopg2.connect(
            host=cfg.DB_HOST, port=cfg.DB_PORT,
            user=cfg.DB_USER, password=cfg.DB_PASSWORD,
            dbname=cfg.DB_NAME,
        )
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE")
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to drop schema: {e}")

    # Evict stale pool from cache
    from config.db import _tenant_pools
    if schema_name in _tenant_pools:
        try:
            await _tenant_pools[schema_name].close()
        except Exception:
            pass
        del _tenant_pools[schema_name]

    # Remove from public tables
    await execute(pub, "DELETE FROM refresh_tokens WHERE tenant_id = %s", (tenant_id,))
    await execute(pub, "DELETE FROM audit_log WHERE entity_id::text = %s", (tenant_id,))
    await execute(pub, "DELETE FROM tenants WHERE id = %s", (tenant_id,))

    await execute(pub,
        "INSERT INTO audit_log (user_id, user_role, action, entity, entity_id, details) VALUES (%s,'super_admin','permanent_delete_tenant','tenant',%s,%s)",
        (user["userId"], tenant_id, json.dumps({"schema_name": schema_name, "business_name": tenant["business_name"]}))
    )
    return {"message": "Tenant permanently deleted"}


# ── Users ─────────────────────────────────────────────────────────────────────
@router.get("/users")
async def list_users(search: str = "", page: int = 1, limit: int = 30, user: dict = SA):
    pub = await get_public_pool()
    tenants = await fetchall(pub, "SELECT id, business_name, db_name FROM tenants WHERE status != 'churned'")
    all_users = []
    for t in tenants:
        try:
            pool = await get_tenant_pool(t["db_name"])
            q, params = "SELECT id, name, email, role, is_active, last_login_at, created_at FROM users", []
            if search:
                q += " WHERE (name ILIKE %s OR email ILIKE %s)"
                params += [f"%{search}%"] * 2
            users = await fetchall(pool, q, params)
            for u in users:
                all_users.append({**u, "tenant_id": str(t["id"]), "tenant_name": t["business_name"]})
        except Exception:
            pass

    total = len(all_users)
    offset = (page - 1) * limit
    return {"data": all_users[offset:offset + limit], "total": total, "page": page, "limit": limit}


@router.get("/tenants/{tenant_id}/admin-user")
async def get_tenant_admin_user(tenant_id: str, user: dict = SA):
    pub = await get_public_pool()
    t = await fetchone(pub, "SELECT db_name FROM tenants WHERE id = %s", (tenant_id,))
    if not t:
        raise HTTPException(status_code=404, detail="Tenant not found")
    pool = await get_tenant_pool(t["db_name"])
    admin_user = await fetchone(pool, "SELECT id, name, email, role, is_active FROM users WHERE role = 'tenant_admin' LIMIT 1")
    if not admin_user:
        return {"id": None, "name": None, "email": None}
    return admin_user


@router.post("/tenants/{tenant_id}/reset-admin-password")
async def reset_tenant_admin_password(tenant_id: str, body: dict, user: dict = SA):
    new_pw = body.get("new_password", "")
    if len(new_pw) < 8:
        raise HTTPException(status_code=400, detail="new_password min 8 chars")
    pub = await get_public_pool()
    t = await fetchone(pub, "SELECT db_name FROM tenants WHERE id = %s", (tenant_id,))
    if not t:
        raise HTTPException(status_code=404, detail="Tenant not found")
    pool = await get_tenant_pool(t["db_name"])
    admin_user = await fetchone(pool, "SELECT id, email FROM users WHERE role = 'tenant_admin' LIMIT 1")
    if not admin_user:
        raise HTTPException(status_code=404, detail="No admin user found for this tenant")
    pw_hash = pwd_ctx.hash(new_pw)
    await execute(pool, "UPDATE users SET password_hash = %s WHERE id = %s", (pw_hash, str(admin_user["id"])))
    await execute(pub,
        "INSERT INTO audit_log (user_id, user_role, action, entity, entity_id, details) VALUES (%s,'super_admin','reset_admin_password','tenant',%s,%s)",
        (user["userId"], tenant_id, json.dumps({"admin_user_id": str(admin_user["id"]), "admin_email": admin_user["email"]}))
    )
    return {"message": "Admin password reset successfully"}


@router.post("/users/{tenant_id}/{user_id}/reset-password")
async def reset_password(tenant_id: str, user_id: str, body: dict, user: dict = SA):
    new_pw = body.get("new_password", "")
    if len(new_pw) < 8:
        raise HTTPException(status_code=400, detail="new_password min 8 chars")
    pub = await get_public_pool()
    t = await fetchone(pub, "SELECT db_name FROM tenants WHERE id = %s", (tenant_id,))
    if not t:
        raise HTTPException(status_code=404, detail="Tenant not found")
    pool = await get_tenant_pool(t["db_name"])
    pw_hash = pwd_ctx.hash(new_pw)
    await execute(pool, "UPDATE users SET password_hash = %s WHERE id = %s", (pw_hash, user_id))
    await execute(pub,
        "INSERT INTO audit_log (user_id, user_role, action, entity, entity_id, details) VALUES (%s,'super_admin','reset_password','user',%s,%s)",
        (user["userId"], user_id, json.dumps({"tenant_id": tenant_id}))
    )
    return {"message": "Password reset"}


# ── Audit Log ─────────────────────────────────────────────────────────────────
@router.get("/audit-log")
async def audit_log(action: str = "", actor_role: str = "", page: int = 1, limit: int = 50, user: dict = SA):
    pub = await get_public_pool()
    offset = (page - 1) * limit
    where, params = "WHERE 1=1", []
    if action:     where += " AND action = %s"; params.append(action)
    if actor_role: where += " AND user_role = %s"; params.append(actor_role)
    rows = await fetchall(pub, f"SELECT * FROM audit_log {where} ORDER BY created_at DESC LIMIT %s OFFSET %s", params + [limit, offset])
    total_r = await fetchone(pub, f"SELECT COUNT(*) AS total FROM audit_log {where}", params)
    return {"data": rows, "total": total_r["total"], "page": page, "limit": limit}


# GET /admin/audit-log/export — CSV download
@router.get("/audit-log/export")
async def audit_log_export(action: str = "", actor_role: str = "", user: dict = SA):
    import csv, io as _io
    from fastapi.responses import StreamingResponse as SR
    pub = await get_public_pool()
    where, params = "WHERE 1=1", []
    if action:     where += " AND action = %s"; params.append(action)
    if actor_role: where += " AND user_role = %s"; params.append(actor_role)
    rows = await fetchall(pub, f"SELECT id, created_at, user_id, user_role, action, entity, entity_id, details FROM audit_log {where} ORDER BY created_at DESC LIMIT 10000", params)

    buf = _io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Timestamp", "User ID", "Role", "Action", "Entity", "Entity ID", "Details"])
    for r in rows:
        writer.writerow([
            r.get("created_at"), r.get("user_id"), r.get("user_role"),
            r.get("action"), r.get("entity"), r.get("entity_id"),
            r.get("details") or "",
        ])
    return SR(
        iter([buf.getvalue().encode()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_log.csv"},
    )


# ── Announcements ─────────────────────────────────────────────────────────────

# Tenant-accessible: get active announcements (no super-admin required)
@router.get("/announcements/active")
async def active_announcements(user: dict = Depends(require_role("tenant_admin", "tenant_user"))):
    pub = await get_public_pool()
    rows = await fetchall(pub,
        """SELECT id, title, body, type FROM announcements
           WHERE display_from <= NOW() AND display_until >= NOW()
           ORDER BY created_at DESC LIMIT 3"""
    )
    return {"data": rows}


@router.get("/announcements")
async def list_announcements(user: dict = SA):
    pub = await get_public_pool()
    rows = await fetchall(pub, "SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50")
    return {"data": rows}


@router.post("/announcements", status_code=201)
async def create_announcement(body: dict, user: dict = SA):
    if not body.get("title") or not body.get("body"):
        raise HTTPException(status_code=400, detail="title and body required")
    if not body.get("display_until"):
        raise HTTPException(status_code=400, detail="display_until required")
    pub = await get_public_pool()
    new_id = str(uuid.uuid4())
    await execute(pub,
        "INSERT INTO announcements (id, title, body, type, target_tenant, display_from, display_until, created_by, created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NOW())",
        (new_id, body["title"], body["body"], body.get("type", "info"),
         body.get("target_tenant"), body.get("display_from", "NOW()"), body["display_until"], user["userId"])
    )
    return {"id": new_id, "message": "Announcement created"}


# ── Plans ─────────────────────────────────────────────────────────────────────
@router.get("/plans")
async def list_plans(user: dict = SA):
    pub = await get_public_pool()
    rows = await fetchall(pub, "SELECT * FROM plans ORDER BY price_monthly")
    return {"data": rows}


@router.post("/plans", status_code=201)
async def create_plan(body: dict, user: dict = SA):
    if not body.get("name"):
        raise HTTPException(status_code=400, detail="name required")
    pub = await get_public_pool()
    new_id = str(uuid.uuid4())
    await execute(pub,
        """INSERT INTO plans (id, name, price_monthly, price_annual, max_users, max_skus,
                              retention_months, feature_profitability, feature_whatsapp)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        (new_id, body["name"],
         float(body.get("price_monthly", 0)),
         float(body.get("price_annual", 0)),
         int(body.get("max_users", 5)),
         int(body.get("max_skus", 1000)),
         int(body.get("retention_months", 24)),
         bool(body.get("feature_profitability", True)),
         bool(body.get("feature_whatsapp", True)))
    )
    return {"id": new_id}


@router.patch("/plans/{plan_id}")
async def update_plan(plan_id: str, body: dict, user: dict = SA):
    pub = await get_public_pool()
    allowed = {"name", "price_monthly", "price_annual", "max_users", "max_skus",
               "retention_months", "feature_profitability", "feature_whatsapp", "is_active"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    await execute(pub, f"UPDATE plans SET {set_clause} WHERE id = %s", list(updates.values()) + [plan_id])
    return {"message": "Plan updated"}


@router.delete("/plans/{plan_id}", status_code=200)
async def delete_plan(plan_id: str, user: dict = SA):
    pub = await get_public_pool()
    # Block deletion if any active/trial tenants are on this plan
    in_use = await fetchone(pub,
        "SELECT COUNT(*) AS cnt FROM tenants WHERE plan_id = %s AND status IN ('active','trial')",
        (plan_id,)
    )
    if in_use and int(in_use["cnt"]) > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete — {in_use['cnt']} active/trial tenant(s) are on this plan"
        )
    result = await fetchone(pub, "SELECT id FROM plans WHERE id = %s", (plan_id,))
    if not result:
        raise HTTPException(status_code=404, detail="Plan not found")
    await execute(pub, "DELETE FROM plans WHERE id = %s", (plan_id,))
    return {"message": "Plan deleted"}


# POST /admin/tenants/{tenant_id}/impersonate — generate a scoped tenant JWT
@router.post("/tenants/{tenant_id}/impersonate")
async def impersonate_tenant(tenant_id: str, user: dict = SA):
    """Generate a short-lived access token scoped to the tenant admin user."""
    from datetime import datetime, timezone, timedelta
    import jwt as _jwt
    from config import settings as cfg

    pub = await get_public_pool()
    tenant = await fetchone(pub,
        "SELECT id, business_name, slug, db_name, status FROM tenants WHERE id = %s",
        (tenant_id,)
    )
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if tenant["status"] == "churned":
        raise HTTPException(status_code=400, detail="Cannot impersonate a churned tenant")

    pool = await get_tenant_pool(tenant["db_name"])
    admin_user = await fetchone(pool,
        "SELECT id, name, email, role FROM users WHERE role = 'tenant_admin' AND is_active = TRUE LIMIT 1"
    )
    if not admin_user:
        raise HTTPException(status_code=404, detail="No active admin user found for this tenant")

    payload = {
        "userId":        str(admin_user["id"]),
        "email":         admin_user["email"],
        "role":          admin_user["role"],
        "tenantId":      str(tenant["id"]),
        "tenantDbName":  tenant["db_name"],
        "tenantSlug":    tenant["slug"],
        "tenantName":    tenant["business_name"],
        "impersonatedBy": str(user["userId"]),
    }
    exp = datetime.now(timezone.utc) + timedelta(hours=1)
    token_data = {**payload, "exp": exp}
    access_token = _jwt.encode(token_data, cfg.JWT_SECRET, algorithm="HS256")

    await execute(pub,
        "INSERT INTO audit_log (user_id, user_role, action, entity, entity_id, details) VALUES (%s,'super_admin','impersonate_tenant','tenant',%s,%s)",
        (str(user["userId"]), tenant_id,
         json.dumps({"tenant_name": tenant["business_name"], "admin_email": admin_user["email"]}))
    )
    return {
        "access_token": access_token,
        "expires_in":   3600,
        "tenant": {"id": str(tenant["id"]), "name": tenant["business_name"], "slug": tenant["slug"]},
        "user": {"id": str(admin_user["id"]), "email": admin_user["email"]},
    }


# GET /admin/tenants/{tenant_id}/usage — per-tenant metrics
@router.get("/tenants/{tenant_id}/usage")
async def tenant_usage(tenant_id: str, user: dict = SA):
    """Return per-tenant row counts, SKU count, and last import dates."""
    import asyncio
    pub = await get_public_pool()
    tenant = await fetchone(pub, "SELECT db_name, business_name FROM tenants WHERE id = %s", (tenant_id,))
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    pool = await get_tenant_pool(tenant["db_name"])
    (
        sku_r, user_r, sales_r, purchases_r, inv_r, outstanding_r,
        last_imports_r,
    ) = await asyncio.gather(
        fetchone(pool, "SELECT COUNT(*) AS cnt FROM skus WHERE is_active = TRUE"),
        fetchone(pool, "SELECT COUNT(*) AS cnt FROM users WHERE is_active = TRUE"),
        fetchone(pool, "SELECT COUNT(*) AS cnt FROM sales"),
        fetchone(pool, "SELECT COUNT(*) AS cnt FROM purchases"),
        fetchone(pool, "SELECT COUNT(*) AS cnt FROM inventory_snapshots"),
        fetchone(pool, "SELECT COUNT(DISTINCT customer_id) AS cnt FROM outstanding_ledger"),
        fetchall(pool,
            """SELECT data_type, MAX(completed_at) AS last_imported_at, COUNT(*) AS total_batches
               FROM import_batches WHERE status = 'completed'
               GROUP BY data_type ORDER BY data_type"""),
    )
    return {
        "tenant_id": tenant_id,
        "tenant_name": tenant["business_name"],
        "skus": int(sku_r["cnt"] or 0),
        "users": int(user_r["cnt"] or 0),
        "sales_rows": int(sales_r["cnt"] or 0),
        "purchase_rows": int(purchases_r["cnt"] or 0),
        "inventory_rows": int(inv_r["cnt"] or 0),
        "customers_with_outstanding": int(outstanding_r["cnt"] or 0),
        "import_summary": last_imports_r,
    }


# ── Health ────────────────────────────────────────────────────────────────────
@router.get("/health")
async def platform_health(user: dict = SA):
    from workers.scheduler import _scheduler

    pub = await get_public_pool()
    db_status, db_error = "ok", None
    try:
        await fetchone(pub, "SELECT 1")
    except Exception as e:
        db_status, db_error = "error", str(e)

    scheduler_status = "ok" if _scheduler.running else "stopped"

    tenant_r = await fetchone(pub, "SELECT COUNT(*) AS cnt FROM tenants WHERE status != 'churned'")

    return {
        "status": "healthy" if db_status == "ok" and scheduler_status == "ok" else "degraded",
        "db":        {"status": db_status, "error": db_error},
        "scheduler": {"status": scheduler_status},
        "active_tenants": tenant_r["cnt"],
    }
