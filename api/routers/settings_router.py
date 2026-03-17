from __future__ import annotations
import json
import uuid
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from typing import Any, List

from config.db import get_public_pool, fetchone, fetchall, execute
from middleware.auth import require_role, get_tenant_db
from services.cost_decoder_service import re_decode_all

router = APIRouter(prefix="/settings", tags=["settings"])


# GET /settings
@router.get("/")
async def get_settings(
    user: dict = Depends(require_role("tenant_admin")),
):
    pub = await get_public_pool()
    row = await fetchone(pub,
        "SELECT id, business_name, slug, email, phone, plan_id, status, trial_ends_at, lead_time_days, created_at FROM tenants WHERE id = %s",
        (user["tenantId"],)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return row


class SettingsUpdate(BaseModel):
    business_name: str | None = None
    email: str | None = None
    phone: str | None = None
    lead_time_days: int | None = None


# PATCH /settings
@router.patch("/")
async def update_settings(
    body: SettingsUpdate,
    user: dict = Depends(require_role("tenant_admin")),
):
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    pub = await get_public_pool()
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    await execute(pub, f"UPDATE tenants SET {set_clause} WHERE id = %s", list(updates.values()) + [user["tenantId"]])
    return {"message": "Settings updated"}


# ── Outstanding Method ─────────────────────────────────────────────────────────

# GET /settings/outstanding-method
@router.get("/outstanding-method")
async def get_outstanding_method(
    user: dict = Depends(require_role("tenant_admin")),
):
    pub = await get_public_pool()
    row = await fetchone(pub,
        "SELECT outstanding_method FROM tenants WHERE id = %s", (user["tenantId"],))
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {"outstanding_method": row["outstanding_method"]}


class OutstandingMethodBody(BaseModel):
    outstanding_method: str  # 'direct_upload' | 'computed'


# PATCH /settings/outstanding-method
@router.patch("/outstanding-method")
async def set_outstanding_method(
    body: OutstandingMethodBody,
    user: dict = Depends(require_role("tenant_admin")),
):
    if body.outstanding_method not in ("direct_upload", "computed"):
        raise HTTPException(status_code=400, detail="outstanding_method must be 'direct_upload' or 'computed'")
    pub = await get_public_pool()
    await execute(pub,
        "UPDATE tenants SET outstanding_method = %s WHERE id = %s",
        (body.outstanding_method, user["tenantId"])
    )
    return {"message": "Outstanding method updated", "outstanding_method": body.outstanding_method}


# ── Inventory Targets (WOI thresholds) ─────────────────────────────────────────

# GET /settings/inventory-targets
@router.get("/inventory-targets")
async def get_inventory_targets(
    user: dict = Depends(require_role("tenant_admin")),
):
    pub = await get_public_pool()
    row = await fetchone(pub,
        "SELECT lead_time_days, woi_red_threshold, woi_amber_threshold, target_woi_weeks FROM tenants WHERE id = %s",
        (user["tenantId"],))
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {
        "lead_time_days":      row["lead_time_days"],
        "woi_red_threshold":   float(row["woi_red_threshold"] or 4.0),
        "woi_amber_threshold": float(row["woi_amber_threshold"] or 8.0),
        "target_woi_weeks":    float(row["target_woi_weeks"] or 12.0),
    }


class InventoryTargetsBody(BaseModel):
    lead_time_days: int | None = None
    woi_red_threshold: float | None = None
    woi_amber_threshold: float | None = None
    target_woi_weeks: float | None = None


# PATCH /settings/inventory-targets
@router.patch("/inventory-targets")
async def update_inventory_targets(
    body: InventoryTargetsBody,
    user: dict = Depends(require_role("tenant_admin")),
):
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if "woi_red_threshold" in updates and updates["woi_red_threshold"] <= 0:
        raise HTTPException(status_code=400, detail="woi_red_threshold must be > 0")
    if "target_woi_weeks" in updates and updates["target_woi_weeks"] <= 0:
        raise HTTPException(status_code=400, detail="target_woi_weeks must be > 0")
    if "woi_amber_threshold" in updates and updates.get("woi_amber_threshold", 999) <= updates.get("woi_red_threshold", 0):
        raise HTTPException(status_code=400, detail="woi_amber_threshold must be greater than woi_red_threshold")
    pub = await get_public_pool()
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    await execute(pub, f"UPDATE tenants SET {set_clause} WHERE id = %s",
                  list(updates.values()) + [user["tenantId"]])
    return {"message": "Inventory targets updated"}


# GET /settings/cost-decoder
@router.get("/cost-decoder")
async def get_cost_decoder(
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    row = await fetchone(db, "SELECT * FROM cost_decode_formulas WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1")
    return row


class CostDecoderBody(BaseModel):
    char_map: dict[str, str]
    math_operation: str = "none"
    math_value: float | None = None


# POST /settings/cost-decoder
@router.post("/cost-decoder")
async def save_cost_decoder(
    body: CostDecoderBody,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    new_id = str(uuid.uuid4())
    await execute(db,
        "INSERT INTO cost_decode_formulas (id, char_map, math_operation, math_value, created_by, created_at) VALUES (%s,%s,%s,%s,%s,NOW())",
        (new_id, json.dumps(body.char_map), body.math_operation, body.math_value, user["userId"])
    )
    await re_decode_all(db, {"char_map": body.char_map, "math_op": body.math_operation, "math_value": body.math_value})
    return {"message": "Cost decoder updated", "id": new_id}


# GET /settings/whatsapp-templates
@router.get("/whatsapp-templates")
async def list_templates(
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    rows = await fetchall(db, "SELECT * FROM whatsapp_templates ORDER BY template_name")
    return {"data": rows}


class TemplateBody(BaseModel):
    template_name: str
    message_body: str
    is_default: bool = False


# POST /settings/whatsapp-templates
@router.post("/whatsapp-templates")
async def create_template(
    body: TemplateBody,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    new_id = str(uuid.uuid4())
    await execute(db,
        "INSERT INTO whatsapp_templates (id, template_name, message_body, is_default, created_at) VALUES (%s,%s,%s,%s,NOW())",
        (new_id, body.template_name, body.message_body, body.is_default)
    )
    return {"id": new_id, "message": "Template saved"}


# PATCH /settings/whatsapp-templates/:id
@router.patch("/whatsapp-templates/{tpl_id}")
async def update_template(
    tpl_id: str, body: dict,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    allowed = {"template_name", "message_body", "is_default"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    await execute(db, f"UPDATE whatsapp_templates SET {set_clause} WHERE id = %s", list(updates.values()) + [tpl_id])
    return {"message": "Template updated"}


# DELETE /settings/whatsapp-templates/:id
@router.delete("/whatsapp-templates/{tpl_id}")
async def delete_template(
    tpl_id: str,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    await execute(db, "DELETE FROM whatsapp_templates WHERE id = %s", (tpl_id,))
    return {"message": "Template deleted"}


# ── Column Mappings ────────────────────────────────────────────────────────────

# GET /settings/column-mappings?import_type=sales
@router.get("/column-mappings")
async def get_column_mappings(
    import_type: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    """Return saved column alias overrides per import type."""
    where = "WHERE import_type = %s" if import_type else ""
    params = [import_type] if import_type else []
    rows = await fetchall(db,
        f"SELECT id, import_type, field_name, aliases, updated_at FROM import_column_mappings {where} ORDER BY import_type, field_name",
        params
    )
    return {"data": [dict(r) for r in rows]}


class ColumnMappingBody(BaseModel):
    import_type: str
    field_name: str
    aliases: List[str]


# POST /settings/column-mappings  (upsert by import_type + field_name)
@router.post("/column-mappings")
async def upsert_column_mapping(
    body: ColumnMappingBody,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    allowed_types = {"sales", "purchases", "inventory", "outstanding", "msl",
                     "sales_invoices", "payment_receipts"}
    if body.import_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"import_type must be one of {allowed_types}")

    new_id = str(uuid.uuid4())
    await execute(db,
        """INSERT INTO import_column_mappings (id, import_type, field_name, aliases, created_at, updated_at)
           VALUES (%s, %s, %s, %s, NOW(), NOW())
           ON CONFLICT (import_type, field_name)
           DO UPDATE SET aliases = EXCLUDED.aliases, updated_at = NOW()""",
        (new_id, body.import_type, body.field_name, json.dumps(body.aliases))
    )
    return {"message": "Column mapping saved"}


# DELETE /settings/column-mappings/{mapping_id}
@router.delete("/column-mappings/{mapping_id}")
async def delete_column_mapping(
    mapping_id: str,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    await execute(db, "DELETE FROM import_column_mappings WHERE id = %s", (mapping_id,))
    return {"message": "Mapping deleted"}


# ── Busy Sync Configuration ────────────────────────────────────────────────────

# GET /settings/busy-config
@router.get("/busy-config")
async def get_busy_config(
    user: dict = Depends(require_role("tenant_admin")),
):
    """Return Busy Web Service connection config and sync schedule."""
    pub = await get_public_pool()
    row = await fetchone(pub,
        """SELECT busy_host, busy_port, busy_username, busy_enabled, busy_last_sync_at,
                  COALESCE(busy_transactions_hour,   23)    AS busy_transactions_hour,
                  COALESCE(busy_transactions_minute,  0)    AS busy_transactions_minute,
                  COALESCE(busy_masters_hour,         1)    AS busy_masters_hour,
                  COALESCE(busy_masters_minute,       0)    AS busy_masters_minute,
                  COALESCE(busy_masters_day,       'sun')   AS busy_masters_day
           FROM tenants WHERE id = %s""",
        (user["tenantId"],))
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {
        "busy_host":                  row["busy_host"],
        "busy_port":                  row["busy_port"] or 981,
        "busy_username":              row["busy_username"],
        "busy_enabled":               bool(row["busy_enabled"]),
        "busy_last_sync_at":          row["busy_last_sync_at"],
        "password_set":               bool(row.get("busy_host")),
        "busy_transactions_hour":     int(row["busy_transactions_hour"]),
        "busy_transactions_minute":   int(row["busy_transactions_minute"]),
        "busy_masters_hour":          int(row["busy_masters_hour"]),
        "busy_masters_minute":        int(row["busy_masters_minute"]),
        "busy_masters_day":           row["busy_masters_day"],
    }


class BusyConfigBody(BaseModel):
    busy_host:                  str | None  = None
    busy_port:                  int | None  = None
    busy_username:              str | None  = None
    busy_password:              str | None  = None  # plain, encoded before storing
    busy_enabled:               bool | None = None
    busy_transactions_hour:     int | None  = None
    busy_transactions_minute:   int | None  = None
    busy_masters_hour:          int | None  = None
    busy_masters_minute:        int | None  = None
    busy_masters_day:           str | None  = None  # mon/tue/wed/thu/fri/sat/sun


# PATCH /settings/busy-config
@router.patch("/busy-config")
async def update_busy_config(
    body: BusyConfigBody,
    user: dict = Depends(require_role("tenant_admin")),
):
    from services.busy_sync_service import encode_password
    updates: dict = {}
    if body.busy_host is not None:               updates["busy_host"] = body.busy_host
    if body.busy_port is not None:               updates["busy_port"] = body.busy_port
    if body.busy_username is not None:           updates["busy_username"] = body.busy_username
    if body.busy_password is not None:
        updates["busy_password_enc"] = encode_password(body.busy_password)
    if body.busy_enabled is not None:            updates["busy_enabled"] = body.busy_enabled
    if body.busy_transactions_hour is not None:  updates["busy_transactions_hour"]   = body.busy_transactions_hour
    if body.busy_transactions_minute is not None: updates["busy_transactions_minute"] = body.busy_transactions_minute
    if body.busy_masters_hour is not None:       updates["busy_masters_hour"]   = body.busy_masters_hour
    if body.busy_masters_minute is not None:     updates["busy_masters_minute"] = body.busy_masters_minute
    if body.busy_masters_day is not None:        updates["busy_masters_day"]    = body.busy_masters_day

    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    pub = await get_public_pool()
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    await execute(pub, f"UPDATE tenants SET {set_clause} WHERE id = %s",
                  list(updates.values()) + [user["tenantId"]])

    # Reschedule busy jobs if schedule or enable/disable changed
    schedule_fields = {"busy_transactions_hour", "busy_transactions_minute",
                       "busy_masters_hour", "busy_masters_minute", "busy_masters_day",
                       "busy_enabled"}
    if schedule_fields & set(updates.keys()):
        row = await fetchone(pub,
            """SELECT busy_enabled,
                      COALESCE(busy_transactions_hour,   23)  AS tx_hour,
                      COALESCE(busy_transactions_minute,  0)  AS tx_min,
                      COALESCE(busy_masters_hour,         1)  AS m_hour,
                      COALESCE(busy_masters_minute,       0)  AS m_min,
                      COALESCE(busy_masters_day,       'sun') AS m_day,
                      busy_host, busy_username
               FROM tenants WHERE id = %s""",
            (user["tenantId"],))
        if row:
            from workers.scheduler import schedule_busy_tenant, unschedule_busy_tenant
            if row["busy_enabled"] and row["busy_host"] and row["busy_username"]:
                schedule_busy_tenant(
                    user["tenantId"],
                    int(row["tx_hour"]), int(row["tx_min"]),
                    row["m_day"], int(row["m_hour"]), int(row["m_min"]),
                )
            else:
                unschedule_busy_tenant(user["tenantId"])

    return {"message": "Busy configuration updated"}


# POST /settings/busy-config/test
@router.post("/busy-config/test")
async def test_busy_connection(
    user: dict = Depends(require_role("tenant_admin")),
):
    """Test BUSY Web Service connectivity using a trivial SC=1 query."""
    from services.busy_sync_service import busy_query, decode_password
    pub = await get_public_pool()
    tenant = await fetchone(pub,
        "SELECT busy_host, busy_port, busy_username, busy_password_enc FROM tenants WHERE id = %s",
        (user["tenantId"],))
    if not tenant or not tenant.get("busy_host"):
        raise HTTPException(status_code=400, detail="Busy connection is not configured")
    try:
        rows = await busy_query(
            tenant["busy_host"], tenant["busy_port"] or 981,
            tenant["busy_username"], tenant["busy_password_enc"],
            "SELECT 1 AS ping",
        )
        return {"success": True, "message": "Connected to BUSY Web Service", "rows": rows}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"BUSY connection failed: {e}")


# POST /settings/busy-config/sync-now
@router.post("/busy-config/sync-now")
async def trigger_manual_sync(
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_role("tenant_admin")),
):
    """Trigger an immediate full master sync for this tenant."""
    from workers.busy_sync_tasks import sync_full_masters
    background_tasks.add_task(sync_full_masters, user["tenantId"])
    return {"message": "Full sync queued. Check sync log in a few minutes."}
