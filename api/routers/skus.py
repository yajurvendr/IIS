from __future__ import annotations
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any

from config.db import fetchall, fetchone, execute
from middleware.auth import get_current_user, get_tenant_db, require_role

router = APIRouter(prefix="/skus", tags=["skus"])

_SORT_MAP = {
    "woi_asc":    "fc.woi ASC NULLS LAST",
    "woi_desc":   "fc.woi DESC NULLS LAST",
    "stock_asc":  "fc.current_stock ASC NULLS LAST",
    "stock_desc": "fc.current_stock DESC NULLS LAST",
    "name_asc":   "s.sku_name ASC",
    "name_desc":  "s.sku_name DESC",
    "code_asc":   "s.sku_code ASC",
    "code_desc":  "s.sku_code DESC",
}


# GET /skus
@router.get("/")
async def list_skus(
    search: str = "",
    is_focus_sku: str = "",
    season_tag: str = "",
    is_active: str = "true",
    woi_status: str = "",        # red | amber | green
    sort: str = "code_asc",      # see _SORT_MAP
    branch_id: str = "",         # omit for consolidated (NULL) forecast row
    page: int = 1,
    limit: int = 50,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    offset = (page - 1) * limit
    where, params = "WHERE 1=1", []

    # Default: only active SKUs (pass is_active=all to include inactive)
    if is_active != "all":
        where += " AND s.is_active = %s"
        params.append(is_active.lower() not in ("0", "false"))

    if search:
        where += " AND (s.sku_code ILIKE %s OR s.sku_name ILIKE %s OR s.brand ILIKE %s)"
        params += [f"%{search}%", f"%{search}%", f"%{search}%"]
    if is_focus_sku != "":
        where += " AND s.is_focus_sku = %s"
        params.append(is_focus_sku.lower() in ("1", "true"))
    if season_tag:
        where += " AND EXISTS (SELECT 1 FROM jsonb_array_elements(s.season_tags) t WHERE t->>'name' = %s)"
        params.append(season_tag)
    if woi_status in ("red", "amber", "green"):
        where += " AND fc.woi_status = %s"
        params.append(woi_status)

    # Branch scoping: NULL branch_id on forecasting_cache = consolidated
    fc_branch_cond = "fc.branch_id IS NULL" if not branch_id else "fc.branch_id = %s"
    fc_params = [] if not branch_id else [branch_id]

    order_by = _SORT_MAP.get(sort, "s.sku_code ASC")

    # MSL from sku_msl for the active branch context (NULL godown = branch-level)
    msl_branch_cond = "sm.branch_id IS NULL" if not branch_id else "sm.branch_id = %s"
    msl_params = [] if not branch_id else [branch_id]

    rows = await fetchall(db,
        f"""SELECT s.id, s.sku_code, s.sku_name, s.brand, s.category, s.unit,
                   s.is_focus_sku, s.season_tags,
                   s.purchase_cost_decoded, s.last_selling_price, s.is_active,
                   s.created_at, s.updated_at,
                   fc.drr_recommended, fc.woi, fc.woi_status, fc.msl_suggested,
                   fc.suggested_order_qty, fc.pre_season_alert, fc.current_stock,
                   sm.msl
            FROM skus s
            LEFT JOIN forecasting_cache fc ON fc.sku_id = s.id AND {fc_branch_cond}
            LEFT JOIN sku_msl sm ON sm.sku_id = s.id AND {msl_branch_cond} AND sm.godown_id IS NULL
            {where} ORDER BY {order_by} LIMIT %s OFFSET %s""",
        fc_params + msl_params + params + [limit, offset]
    )
    total_row = await fetchone(db,
        f"""SELECT COUNT(*) AS total FROM skus s
            LEFT JOIN forecasting_cache fc ON fc.sku_id = s.id AND {fc_branch_cond}
            {where}""",
        fc_params + params
    )

    return {"data": rows, "total": total_row["total"], "page": page, "limit": limit}


# GET /skus/:id
@router.get("/{sku_id}")
async def get_sku(
    sku_id: str,
    branch_id: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    fc_branch_cond = "fc.branch_id IS NULL" if not branch_id else "fc.branch_id = %s"
    fc_params = [] if not branch_id else [branch_id]
    msl_branch_cond = "sm.branch_id IS NULL" if not branch_id else "sm.branch_id = %s"
    msl_params = [] if not branch_id else [branch_id]

    row = await fetchone(db,
        f"""SELECT s.id, s.sku_code, s.sku_name, s.brand, s.category, s.unit,
                  s.is_focus_sku, s.season_tags,
                  s.purchase_cost_encoded, s.purchase_cost_decoded, s.last_selling_price,
                  s.is_active, s.created_at, s.updated_at,
                  fc.drr_4w, fc.drr_13w, fc.drr_52w, fc.drr_recommended,
                  fc.drr_seasonal, fc.seasonal_uplift_pct, fc.woi, fc.woi_status,
                  fc.msl_suggested, fc.target_12w_qty, fc.suggested_order_qty,
                  fc.pre_season_alert, fc.latest_order_date, fc.current_stock,
                  fc.computed_at AS forecast_updated_at,
                  sm.msl
           FROM skus s
           LEFT JOIN forecasting_cache fc ON fc.sku_id = s.id AND {fc_branch_cond}
           LEFT JOIN sku_msl sm ON sm.sku_id = s.id AND {msl_branch_cond} AND sm.godown_id IS NULL
           WHERE s.id = %s""",
        fc_params + msl_params + [sku_id]
    )
    if not row:
        raise HTTPException(status_code=404, detail="SKU not found")

    history = await fetchall(db,
        """SELECT TO_CHAR(DATE_TRUNC('week', sale_date), 'IYYY-IW') AS yw,
                  SUM(quantity) AS qty
           FROM sales
           WHERE sku_id = %s AND sale_date >= NOW() - INTERVAL '364 days'
           GROUP BY yw ORDER BY yw""",
        (sku_id,)
    )
    monthly = await fetchall(db,
        """SELECT TO_CHAR(sale_date, 'Mon YY') AS label,
                  TO_CHAR(sale_date, 'YYYY-MM') AS month,
                  SUM(quantity) AS qty,
                  SUM(total_value) AS revenue
           FROM sales
           WHERE sku_id = %s AND sale_date >= NOW() - INTERVAL '12 months'
           GROUP BY month, label ORDER BY month""",
        (sku_id,)
    )
    return {**row, "sales_history": history, "monthly_trend": monthly}


class SkuUpdate(BaseModel):
    sku_name: str | None = None
    brand: str | None = None
    category: str | None = None
    unit: str | None = None
    is_focus_sku: int | None = None
    season_tags: list | None = None
    # MSL fields — write to sku_msl table, not skus directly
    msl: int | None = None
    branch_id: str | None = None   # required when msl is set
    godown_id: str | None = None   # optional — None means branch-level


# PATCH /skus/:id
@router.patch("/{sku_id}")
async def update_sku(
    sku_id: str, body: SkuUpdate,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    payload = body.model_dump(exclude_none=True)

    # Separate MSL update (goes to sku_msl) from SKU column updates
    msl_value   = payload.pop("msl", None)
    msl_branch  = payload.pop("branch_id", None)
    msl_godown  = payload.pop("godown_id", None)

    # Update skus table columns if any remain
    if payload:
        if "season_tags" in payload and isinstance(payload["season_tags"], list):
            payload["season_tags"] = json.dumps(payload["season_tags"])
        set_clause = ", ".join(f"{k} = %s" for k in payload)
        await execute(db,
            f"UPDATE skus SET {set_clause}, updated_at = NOW() WHERE id = %s",
            list(payload.values()) + [sku_id]
        )

    # UPSERT into sku_msl when msl is provided (CTE-based upsert, handles partial indexes)
    if msl_value is not None:
        if not msl_branch:
            raise HTTPException(status_code=400, detail="branch_id is required when setting msl")
        godown_cond = "godown_id = %s" if msl_godown else "godown_id IS NULL"
        godown_params = [msl_godown] if msl_godown else []
        await execute(db,
            f"""WITH upd AS (
                  UPDATE sku_msl SET msl = %s, updated_by = %s, updated_at = NOW()
                  WHERE sku_id = %s AND branch_id = %s AND {godown_cond}
                  RETURNING id
                )
                INSERT INTO sku_msl (sku_id, branch_id, godown_id, msl, updated_by, updated_at)
                SELECT %s, %s, %s, %s, %s, NOW()
                WHERE NOT EXISTS (SELECT 1 FROM upd)""",
            [msl_value, user["userId"], sku_id, msl_branch]
            + godown_params
            + [sku_id, msl_branch, msl_godown, msl_value, user["userId"]]
        )

    if not payload and msl_value is None:
        raise HTTPException(status_code=400, detail="Nothing to update")

    return {"message": "SKU updated"}


class SeasonTagItem(BaseModel):
    name: str
    start_month: int = 1
    end_month: int = 12


class BulkTagRequest(BaseModel):
    sku_ids: list[str]
    # Each tag must be a full object so season window data is preserved.
    # Accepts {name, start_month, end_month}.
    season_tags: list[SeasonTagItem]
    # replace=True  : overwrite all tags on every SKU with the supplied list
    # replace=False : merge supplied tags into existing (default, safe)
    replace: bool = False


# POST /skus/bulk-tag
@router.post("/bulk-tag")
async def bulk_tag(
    body: BulkTagRequest,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    if not body.sku_ids:
        raise HTTPException(status_code=400, detail="sku_ids required")
    if not body.season_tags:
        raise HTTPException(status_code=400, detail="season_tags required")

    new_tags = [t.model_dump() for t in body.season_tags]
    placeholders = ",".join(["%s"] * len(body.sku_ids))

    if body.replace:
        tags_json = json.dumps(new_tags)
        await execute(db,
            f"UPDATE skus SET season_tags = %s, updated_at = NOW() WHERE id IN ({placeholders})",
            [tags_json] + body.sku_ids
        )
    else:
        rows = await fetchall(db,
            f"SELECT id, season_tags FROM skus WHERE id IN ({placeholders})",
            body.sku_ids
        )
        for row in rows:
            existing = []
            raw = row.get("season_tags")
            if raw:
                try:
                    existing = json.loads(raw) if isinstance(raw, str) else (raw or [])
                except Exception:
                    existing = []
            existing_names = {t.get("name") for t in existing if isinstance(t, dict)}
            merged = existing + [t for t in new_tags if t["name"] not in existing_names]
            await execute(db,
                "UPDATE skus SET season_tags = %s, updated_at = NOW() WHERE id = %s",
                [json.dumps(merged), str(row["id"])]
            )

    return {"message": f"{len(body.sku_ids)} SKUs updated"}


# DELETE /skus/:id  (soft-delete — sets is_active=FALSE)
@router.delete("/{sku_id}", status_code=200)
async def deactivate_sku(
    sku_id: str,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    row = await fetchone(db, "SELECT id FROM skus WHERE id = %s", (sku_id,))
    if not row:
        raise HTTPException(status_code=404, detail="SKU not found")
    await execute(db, "UPDATE skus SET is_active = FALSE, updated_at = NOW() WHERE id = %s", (sku_id,))
    return {"message": "SKU deactivated"}
