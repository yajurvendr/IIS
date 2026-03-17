"""Branches & Stock Transfers router."""
from __future__ import annotations
import io
import csv
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import uuid

from config.db import fetchall, fetchone, execute
from middleware.auth import get_current_user, get_tenant_db, require_role

router = APIRouter(prefix="/branches", tags=["branches"])


# ── Pydantic models ───────────────────────────────────────────────────────────

class BranchCreate(BaseModel):
    branch_code: str
    branch_name: str
    address: Optional[str] = None

class BranchUpdate(BaseModel):
    branch_name: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None

class TransferCreate(BaseModel):
    transfer_date: str           # YYYY-MM-DD
    sku_id: str
    from_branch_id: str
    to_branch_id: str
    quantity: float
    notes: Optional[str] = None


# ── Branches CRUD ─────────────────────────────────────────────────────────────

@router.get("/")
async def list_branches(
    include_inactive: bool = False,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    where = "" if include_inactive else "WHERE is_active = TRUE"
    rows = await fetchall(db,
        f"SELECT id, branch_code, branch_name, address, is_home_branch, is_active, created_at FROM branches {where} ORDER BY is_home_branch DESC, branch_name",
        []
    )
    return [dict(r) for r in rows]


@router.get("/{branch_id}")
async def get_branch(
    branch_id: str,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    row = await fetchone(db,
        "SELECT id, branch_code, branch_name, address, is_home_branch, is_active, created_at FROM branches WHERE id = %s",
        (branch_id,)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Branch not found")
    return dict(row)


@router.post("/", status_code=201)
async def create_branch(
    body: BranchCreate,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    existing = await fetchone(db, "SELECT id FROM branches WHERE branch_code = %s", (body.branch_code,))
    if existing:
        raise HTTPException(status_code=409, detail="Branch code already exists")

    branch_id = str(uuid.uuid4())
    await execute(db,
        "INSERT INTO branches (id, branch_code, branch_name, address, is_home_branch, is_active, created_at) VALUES (%s,%s,%s,%s,FALSE,TRUE,NOW())",
        (branch_id, body.branch_code.upper(), body.branch_name, body.address)
    )
    return {"id": branch_id, "message": "Branch created"}


@router.patch("/{branch_id}")
async def update_branch(
    branch_id: str,
    body: BranchUpdate,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    row = await fetchone(db, "SELECT id, is_home_branch FROM branches WHERE id = %s", (branch_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Branch not found")

    # Home branch cannot be deactivated
    if row["is_home_branch"] and body.is_active is False:
        raise HTTPException(status_code=400, detail="Home branch cannot be deactivated")

    updates, params = [], []
    if body.branch_name is not None:
        updates.append("branch_name = %s"); params.append(body.branch_name)
    if body.address is not None:
        updates.append("address = %s"); params.append(body.address)
    if body.is_active is not None:
        updates.append("is_active = %s"); params.append(body.is_active)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    params.append(branch_id)
    await execute(db, f"UPDATE branches SET {', '.join(updates)} WHERE id = %s", params)
    return {"message": "Branch updated"}


@router.patch("/{branch_id}/set-home", status_code=200)
async def set_home_branch(
    branch_id: str,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    """Designate a branch as the home branch (clears existing home branch flag)."""
    row = await fetchone(db, "SELECT id FROM branches WHERE id = %s AND is_active = TRUE", (branch_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Branch not found or inactive")
    await execute(db, "UPDATE branches SET is_home_branch = FALSE WHERE is_home_branch = TRUE")
    await execute(db, "UPDATE branches SET is_home_branch = TRUE WHERE id = %s", (branch_id,))
    return {"message": "Home branch updated"}


@router.delete("/{branch_id}", status_code=204)
async def delete_branch(
    branch_id: str,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    row = await fetchone(db, "SELECT id, is_home_branch FROM branches WHERE id = %s", (branch_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Branch not found")
    if row["is_home_branch"]:
        raise HTTPException(status_code=400, detail="Home branch cannot be deleted")

    # Block deletion if the branch has any associated data
    for table, label in [
        ("sales",                 "sales"),
        ("purchases",             "purchases"),
        ("inventory_snapshots",   "inventory snapshots"),
        ("stock_transfers",       "stock transfers"),
        ("import_batches",        "import batches"),
    ]:
        col = "from_branch_id" if table == "stock_transfers" else "branch_id"
        check = await fetchone(db, f"SELECT 1 FROM {table} WHERE {col} = %s LIMIT 1", (branch_id,))
        if check:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot delete branch with {label}. Deactivate it instead."
            )

    await execute(db, "DELETE FROM branches WHERE id = %s", (branch_id,))


# ── Stock Transfers ───────────────────────────────────────────────────────────

@router.post("/transfers", status_code=201)
async def create_transfer(
    body: TransferCreate,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    if body.from_branch_id == body.to_branch_id:
        raise HTTPException(status_code=400, detail="Source and destination branches must differ")
    if body.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")

    # Verify both branches exist
    from_b = await fetchone(db, "SELECT id FROM branches WHERE id = %s AND is_active = TRUE", (body.from_branch_id,))
    to_b   = await fetchone(db, "SELECT id FROM branches WHERE id = %s AND is_active = TRUE", (body.to_branch_id,))
    if not from_b:
        raise HTTPException(status_code=404, detail="Source branch not found or inactive")
    if not to_b:
        raise HTTPException(status_code=404, detail="Destination branch not found or inactive")

    # Verify SKU exists
    sku = await fetchone(db, "SELECT id FROM skus WHERE id = %s", (body.sku_id,))
    if not sku:
        raise HTTPException(status_code=404, detail="SKU not found")

    transfer_id = str(uuid.uuid4())
    await execute(db,
        """INSERT INTO stock_transfers
           (id, transfer_date, sku_id, from_branch_id, to_branch_id, quantity, notes, created_by, created_at)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NOW())""",
        (transfer_id, body.transfer_date, body.sku_id, body.from_branch_id,
         body.to_branch_id, body.quantity, body.notes, user["sub"])
    )
    return {"id": transfer_id, "message": "Transfer recorded"}


@router.get("/transfers/log")
async def transfer_log(
    branch_id: str = "",
    sku_id: str = "",
    from_date: str = "",
    to_date: str = "",
    page: int = 1,
    limit: int = 50,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    where, params = "WHERE 1=1", []
    if branch_id:
        where += " AND (st.from_branch_id = %s OR st.to_branch_id = %s)"
        params += [branch_id, branch_id]
    if sku_id:
        where += " AND st.sku_id = %s"; params.append(sku_id)
    if from_date:
        where += " AND st.transfer_date >= %s"; params.append(from_date)
    if to_date:
        where += " AND st.transfer_date <= %s"; params.append(to_date)

    offset = (page - 1) * limit
    rows = await fetchall(db,
        f"""SELECT st.id, st.transfer_date, st.quantity, st.notes, st.created_at,
                   sk.sku_code, sk.sku_name,
                   fb.branch_name AS from_branch_name,
                   tb.branch_name AS to_branch_name
            FROM stock_transfers st
            JOIN skus sk ON sk.id = st.sku_id
            JOIN branches fb ON fb.id = st.from_branch_id
            JOIN branches tb ON tb.id = st.to_branch_id
            {where}
            ORDER BY st.transfer_date DESC, st.created_at DESC
            LIMIT %s OFFSET %s""",
        params + [limit, offset]
    )
    count = await fetchone(db,
        f"SELECT COUNT(*) AS total FROM stock_transfers st {where}", params
    )
    return {"data": [dict(r) for r in rows], "total": count["total"] if count else 0}


# ── Cross-Branch Comparison — Unified endpoint (SRS spec) ────────────────────
# GET /branches/comparison?tab=inventory|sales|profitability|top-skus
# All query params for each tab are also accepted here and forwarded.

@router.get("/comparison")
async def branch_comparison(
    tab: str = "inventory",   # inventory | sales | profitability | top-skus
    # inventory params
    sku_id: str = "", category: str = "", page: int = 1, limit: int = 50,
    # sales params
    period: str = "mtd",
    # top-skus params
    limit_skus: int = 20,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    """Unified branch comparison endpoint. Dispatches to the correct tab handler."""
    from fastapi import HTTPException as _HTTPException
    if tab == "inventory":
        return await branch_stock_comparison(sku_id=sku_id, category=category,
                                             page=page, limit=limit, user=user, db=db)
    elif tab == "sales":
        return await branch_sales_comparison(period=period, category=category, user=user, db=db)
    elif tab == "profitability":
        return await branch_profitability_comparison(period=period, category=category, user=user, db=db)
    elif tab == "top-skus":
        return await branch_top_skus_comparison(period=period, limit_skus=limit_skus, user=user, db=db)
    else:
        raise _HTTPException(status_code=400,
            detail="tab must be one of: inventory, sales, profitability, top-skus")


# ── Cross-Branch Comparison — Individual tab routes (kept for backward compat) ─

@router.get("/comparison/stock")
async def branch_stock_comparison(
    sku_id: str = "",
    category: str = "",
    page: int = 1,
    limit: int = 50,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    """Returns per-branch effective stock for each SKU.
    Effective stock = latest snapshot + purchases_since - sales_since + transfers_in - transfers_out
    """
    where, params = "WHERE sk.is_active = TRUE", []
    if sku_id:
        where += " AND sk.id = %s"; params.append(sku_id)
    if category:
        where += " AND sk.category = %s"; params.append(category)

    offset = (page - 1) * limit

    # Get active branches
    branches = await fetchall(db,
        "SELECT id, branch_code, branch_name FROM branches WHERE is_active = TRUE ORDER BY is_home_branch DESC, branch_name",
        []
    )

    # Get SKUs with per-branch stock figures — paginate SKUs first via CTE
    rows = await fetchall(db,
        f"""WITH paged_skus AS (
                SELECT sk.id, sk.sku_code, sk.sku_name, sk.brand, sk.category
                FROM skus sk {where}
                ORDER BY sk.sku_code
                LIMIT %s OFFSET %s
            )
            SELECT ps.id AS sku_id, ps.sku_code, ps.sku_name, ps.brand, ps.category,
                   b.id AS branch_id, b.branch_name,
                   COALESCE(snap.quantity_on_hand, 0)
                     + COALESCE(pur.qty_since, 0)
                     - COALESCE(sal.qty_since, 0)
                     + COALESCE(tin.qty_in, 0)
                     - COALESCE(tout.qty_out, 0) AS effective_stock,
                   snap.snapshot_date AS last_snapshot_date
            FROM paged_skus ps
            CROSS JOIN branches b
            LEFT JOIN LATERAL (
                SELECT quantity_on_hand, snapshot_date
                FROM inventory_snapshots
                WHERE sku_id = ps.id AND branch_id = b.id
                ORDER BY snapshot_date DESC LIMIT 1
            ) snap ON TRUE
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(quantity), 0) AS qty_since
                FROM purchases
                WHERE sku_id = ps.id AND branch_id = b.id
                  AND (snap.snapshot_date IS NULL OR purchase_date > snap.snapshot_date)
            ) pur ON TRUE
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(quantity), 0) AS qty_since
                FROM sales
                WHERE sku_id = ps.id AND branch_id = b.id
                  AND (snap.snapshot_date IS NULL OR sale_date > snap.snapshot_date)
            ) sal ON TRUE
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(quantity), 0) AS qty_in
                FROM stock_transfers
                WHERE sku_id = ps.id AND to_branch_id = b.id
                  AND (snap.snapshot_date IS NULL OR transfer_date > snap.snapshot_date)
            ) tin ON TRUE
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(quantity), 0) AS qty_out
                FROM stock_transfers
                WHERE sku_id = ps.id AND from_branch_id = b.id
                  AND (snap.snapshot_date IS NULL OR transfer_date > snap.snapshot_date)
            ) tout ON TRUE
            WHERE b.is_active = TRUE
            ORDER BY ps.sku_code, b.branch_name""",
        params + [limit, offset]
    )

    # Pivot: group by SKU, each branch as a column
    sku_map: dict = {}
    for r in rows:
        sid = r["sku_id"]
        if sid not in sku_map:
            sku_map[sid] = {
                "sku_id": sid, "sku_code": r["sku_code"],
                "sku_name": r["sku_name"], "brand": r["brand"],
                "category": r["category"], "branches": {}
            }
        sku_map[sid]["branches"][r["branch_id"]] = {
            "branch_name": r["branch_name"],
            "effective_stock": float(r["effective_stock"] or 0),
            "last_snapshot_date": str(r["last_snapshot_date"]) if r["last_snapshot_date"] else None,
        }

    count = await fetchone(db, f"SELECT COUNT(*) AS total FROM skus sk {where}", params)
    return {
        "branches": [{"id": str(b["id"]), "branch_code": b["branch_code"], "branch_name": b["branch_name"]} for b in branches],
        "data": list(sku_map.values()),
        "total": count["total"] if count else 0,
    }


# ── Branch Column Maps ────────────────────────────────────────────────────────

@router.get("/{branch_id}/column-maps")
async def list_column_maps(
    branch_id: str,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    """List all location-string → branch mappings for this branch."""
    branch = await fetchone(db, "SELECT id FROM branches WHERE id = %s", (branch_id,))
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    rows = await fetchall(db,
        "SELECT id, column_value, created_at FROM branch_column_maps WHERE branch_id = %s ORDER BY column_value",
        (branch_id,)
    )
    return {"data": [dict(r) for r in rows]}


class ColumnMapBody(BaseModel):
    column_value: str


@router.post("/{branch_id}/column-maps", status_code=201)
async def add_column_map(
    branch_id: str,
    body: ColumnMapBody,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    """Add or update a column_value → branch mapping (upsert by column_value)."""
    branch = await fetchone(db, "SELECT id FROM branches WHERE id = %s", (branch_id,))
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    new_id = str(uuid.uuid4())
    await execute(db,
        """INSERT INTO branch_column_maps (id, branch_id, column_value, created_at)
           VALUES (%s, %s, %s, NOW())
           ON CONFLICT (column_value) DO UPDATE SET branch_id = EXCLUDED.branch_id""",
        (new_id, branch_id, body.column_value.strip())
    )
    return {"message": "Column map saved"}


@router.delete("/{branch_id}/column-maps/{map_id}", status_code=204)
async def delete_column_map(
    branch_id: str,
    map_id: str,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    """Remove a specific column map entry."""
    await execute(db,
        "DELETE FROM branch_column_maps WHERE id = %s AND branch_id = %s",
        (map_id, branch_id)
    )


# ── Cross-Branch Comparison: Sales Tab ────────────────────────────────────────

@router.get("/comparison/sales")
async def branch_sales_comparison(
    period: str = "mtd",   # mtd | last_month | last_13w | last_26w
    category: str = "",
    page: int = 1, limit: int = 50,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    """MTD / last-period sales revenue and quantity per SKU per branch."""
    period_map = {
        "mtd":        "EXTRACT(MONTH FROM sl.sale_date)=EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM sl.sale_date)=EXTRACT(YEAR FROM NOW())",
        "last_month": "sl.sale_date >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month' AND sl.sale_date < DATE_TRUNC('month', NOW())",
        "last_13w":   "sl.sale_date >= CURRENT_DATE - INTERVAL '91 days'",
        "last_26w":   "sl.sale_date >= CURRENT_DATE - INTERVAL '182 days'",
    }
    date_filter = period_map.get(period, period_map["mtd"])

    where, params = "WHERE sk.is_active = TRUE", []
    if category:
        where += " AND sk.category = %s"; params.append(category)

    branches = await fetchall(db,
        "SELECT id, branch_code, branch_name FROM branches WHERE is_active = TRUE ORDER BY is_home_branch DESC, branch_name", [])

    offset = (page - 1) * limit
    rows = await fetchall(db,
        f"""WITH paged_skus AS (
                SELECT sk.id, sk.sku_code, sk.sku_name, sk.brand, sk.category
                FROM skus sk {where}
                ORDER BY sk.sku_code
                LIMIT %s OFFSET %s
            )
            SELECT ps.id AS sku_id, ps.sku_code, ps.sku_name, ps.brand, ps.category,
                   b.id AS branch_id,
                   COALESCE(SUM(sl.quantity), 0)    AS qty,
                   COALESCE(SUM(sl.total_value), 0) AS revenue
            FROM paged_skus ps
            CROSS JOIN branches b
            LEFT JOIN sales sl ON sl.sku_id = ps.id AND sl.branch_id = b.id AND {date_filter}
            WHERE b.is_active = TRUE
            GROUP BY ps.id, ps.sku_code, ps.sku_name, ps.brand, ps.category, b.id
            ORDER BY ps.sku_code, b.branch_name""",
        params + [limit, offset]
    )

    sku_map: dict = {}
    for r in rows:
        sid = str(r["sku_id"])
        if sid not in sku_map:
            sku_map[sid] = {"sku_id": sid, "sku_code": r["sku_code"],
                            "sku_name": r["sku_name"], "brand": r["brand"],
                            "category": r["category"], "branches": {}}
        sku_map[sid]["branches"][str(r["branch_id"])] = {
            "qty": float(r["qty"] or 0), "revenue": float(r["revenue"] or 0)}

    count = await fetchone(db, f"SELECT COUNT(*) AS total FROM skus sk {where}", params)
    return {
        "branches": [{"id": str(b["id"]), "branch_code": b["branch_code"], "branch_name": b["branch_name"]} for b in branches],
        "data": list(sku_map.values()),
        "total": count["total"] if count else 0,
        "period": period,
    }


# ── Cross-Branch Comparison: Profitability Tab ────────────────────────────────

@router.get("/comparison/profitability")
async def branch_profitability_comparison(
    period: str = "last_13w",  # last_13w | last_26w | last_52w
    category: str = "",
    page: int = 1, limit: int = 50,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    """Gross margin % per SKU per branch for a rolling period."""
    weeks_map = {"last_13w": 91, "last_26w": 182, "last_52w": 364}
    days = weeks_map.get(period, 91)

    where, params = "WHERE sk.is_active = TRUE AND sk.purchase_cost_decoded IS NOT NULL AND sk.purchase_cost_decoded > 0", []
    if category:
        where += " AND sk.category = %s"; params.append(category)

    branches = await fetchall(db,
        "SELECT id, branch_code, branch_name FROM branches WHERE is_active = TRUE ORDER BY is_home_branch DESC, branch_name", [])

    offset = (page - 1) * limit
    rows = await fetchall(db,
        f"""WITH paged_skus AS (
                SELECT sk.id, sk.sku_code, sk.sku_name, sk.category, sk.purchase_cost_decoded
                FROM skus sk {where}
                ORDER BY sk.sku_code
                LIMIT %s OFFSET %s
            )
            SELECT ps.id AS sku_id, ps.sku_code, ps.sku_name, ps.category,
                   b.id AS branch_id,
                   COALESCE(SUM(sl.total_value), 0) AS revenue,
                   COALESCE(SUM(sl.quantity * ps.purchase_cost_decoded), 0) AS cost
            FROM paged_skus ps
            CROSS JOIN branches b
            LEFT JOIN sales sl ON sl.sku_id = ps.id AND sl.branch_id = b.id
                                  AND sl.sale_date >= CURRENT_DATE - INTERVAL '{days} days'
            WHERE b.is_active = TRUE
            GROUP BY ps.id, ps.sku_code, ps.sku_name, ps.category, b.id
            ORDER BY ps.sku_code, b.branch_name""",
        params + [limit, offset]
    )

    sku_map: dict = {}
    for r in rows:
        sid = str(r["sku_id"])
        if sid not in sku_map:
            sku_map[sid] = {"sku_id": sid, "sku_code": r["sku_code"],
                            "sku_name": r["sku_name"], "category": r["category"], "branches": {}}
        rev = float(r["revenue"] or 0)
        cost = float(r["cost"] or 0)
        margin_pct = round((rev - cost) / rev * 100, 1) if rev > 0 else None
        sku_map[sid]["branches"][str(r["branch_id"])] = {
            "revenue": rev, "cost": cost, "margin_pct": margin_pct}

    count = await fetchone(db, f"SELECT COUNT(*) AS total FROM skus sk {where}", params)
    return {
        "branches": [{"id": str(b["id"]), "branch_code": b["branch_code"], "branch_name": b["branch_name"]} for b in branches],
        "data": list(sku_map.values()),
        "total": count["total"] if count else 0,
        "period": period,
    }


# ── Cross-Branch Comparison: Top SKUs Tab ────────────────────────────────────

@router.get("/comparison/top-skus")
async def branch_top_skus_comparison(
    period: str = "last_13w",
    limit_skus: int = 20,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    """Top N SKUs by total revenue per branch for a rolling period."""
    weeks_map = {"mtd": "EXTRACT(MONTH FROM sl.sale_date)=EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM sl.sale_date)=EXTRACT(YEAR FROM NOW())",
                 "last_13w": f"sl.sale_date >= CURRENT_DATE - INTERVAL '91 days'",
                 "last_26w": f"sl.sale_date >= CURRENT_DATE - INTERVAL '182 days'",
                 "last_52w": f"sl.sale_date >= CURRENT_DATE - INTERVAL '364 days'"}
    date_filter = weeks_map.get(period, weeks_map["last_13w"])

    branches = await fetchall(db,
        "SELECT id, branch_code, branch_name FROM branches WHERE is_active = TRUE ORDER BY is_home_branch DESC, branch_name", [])

    rows = await fetchall(db,
        f"""SELECT b.id AS branch_id,
                   sk.id AS sku_id, sk.sku_code, sk.sku_name, sk.brand, sk.category,
                   COALESCE(SUM(sl.quantity), 0) AS qty,
                   COALESCE(SUM(sl.total_value), 0) AS revenue,
                   RANK() OVER (PARTITION BY b.id ORDER BY COALESCE(SUM(sl.total_value),0) DESC) AS rank
            FROM branches b
            JOIN sales sl ON sl.branch_id = b.id AND {date_filter}
            JOIN skus sk ON sk.id = sl.sku_id AND sk.is_active = TRUE
            WHERE b.is_active = TRUE
            GROUP BY b.id, sk.id, sk.sku_code, sk.sku_name, sk.brand, sk.category
            ORDER BY b.id, revenue DESC""",
        []
    )

    branch_map: dict = {str(b["id"]): {"branch_id": str(b["id"]), "branch_code": b["branch_code"],
                                         "branch_name": b["branch_name"], "top_skus": []} for b in branches}
    for r in rows:
        bid = str(r["branch_id"])
        if bid in branch_map and int(r["rank"]) <= limit_skus:
            branch_map[bid]["top_skus"].append({
                "sku_id": str(r["sku_id"]), "sku_code": r["sku_code"],
                "sku_name": r["sku_name"], "brand": r["brand"], "category": r["category"],
                "qty": float(r["qty"] or 0), "revenue": float(r["revenue"] or 0),
                "rank": int(r["rank"]),
            })

    return {
        "branches": [{"id": str(b["id"]), "branch_code": b["branch_code"], "branch_name": b["branch_name"]} for b in branches],
        "data": list(branch_map.values()),
        "period": period,
    }


# ── Cross-Branch Comparison Exports ──────────────────────────────────────────

def _csv_response(rows: list, headers: list, filename: str) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    for r in rows:
        writer.writerow([r.get(h) for h in headers])
    return StreamingResponse(
        iter([buf.getvalue().encode()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/comparison/stock/export")
async def branch_stock_comparison_export(
    category: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    where, params = "WHERE sk.is_active = TRUE", []
    if category:
        where += " AND sk.category = %s"; params.append(category)
    branches = await fetchall(db, "SELECT id, branch_name FROM branches WHERE is_active = TRUE ORDER BY branch_name", [])
    rows = await fetchall(db,
        f"""SELECT sk.sku_code, sk.sku_name, sk.brand, sk.category, b.branch_name,
                   COALESCE(snap.quantity_on_hand,0)+COALESCE(pur.qty_since,0)
                   -COALESCE(sal.qty_since,0)+COALESCE(tin.qty_in,0)-COALESCE(tout.qty_out,0) AS effective_stock
            FROM skus sk CROSS JOIN branches b
            LEFT JOIN LATERAL (SELECT quantity_on_hand,snapshot_date FROM inventory_snapshots
                WHERE sku_id=sk.id AND branch_id=b.id ORDER BY snapshot_date DESC LIMIT 1) snap ON TRUE
            LEFT JOIN LATERAL (SELECT COALESCE(SUM(quantity),0) AS qty_since FROM purchases
                WHERE sku_id=sk.id AND branch_id=b.id AND (snap.snapshot_date IS NULL OR purchase_date>snap.snapshot_date)) pur ON TRUE
            LEFT JOIN LATERAL (SELECT COALESCE(SUM(quantity),0) AS qty_since FROM sales
                WHERE sku_id=sk.id AND branch_id=b.id AND (snap.snapshot_date IS NULL OR sale_date>snap.snapshot_date)) sal ON TRUE
            LEFT JOIN LATERAL (SELECT COALESCE(SUM(quantity),0) AS qty_in FROM stock_transfers
                WHERE sku_id=sk.id AND to_branch_id=b.id AND (snap.snapshot_date IS NULL OR transfer_date>snap.snapshot_date)) tin ON TRUE
            LEFT JOIN LATERAL (SELECT COALESCE(SUM(quantity),0) AS qty_out FROM stock_transfers
                WHERE sku_id=sk.id AND from_branch_id=b.id AND (snap.snapshot_date IS NULL OR transfer_date>snap.snapshot_date)) tout ON TRUE
            {where} AND b.is_active = TRUE ORDER BY sk.sku_code, b.branch_name""",
        params
    )
    flat = [{"sku_code": r["sku_code"], "sku_name": r["sku_name"], "brand": r["brand"],
              "category": r["category"], "branch_name": r["branch_name"],
              "effective_stock": float(r["effective_stock"] or 0)} for r in rows]
    return _csv_response(flat, ["sku_code", "sku_name", "brand", "category", "branch_name", "effective_stock"],
                         "branch_stock_comparison.csv")


@router.get("/comparison/sales/export")
async def branch_sales_comparison_export(
    period: str = "mtd", category: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    period_map = {
        "mtd":        "EXTRACT(MONTH FROM sl.sale_date)=EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM sl.sale_date)=EXTRACT(YEAR FROM NOW())",
        "last_month": "sl.sale_date >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month' AND sl.sale_date < DATE_TRUNC('month', NOW())",
        "last_13w":   "sl.sale_date >= CURRENT_DATE - INTERVAL '91 days'",
        "last_26w":   "sl.sale_date >= CURRENT_DATE - INTERVAL '182 days'",
    }
    date_filter = period_map.get(period, period_map["mtd"])
    where, params = "WHERE sk.is_active = TRUE", []
    if category:
        where += " AND sk.category = %s"; params.append(category)
    rows = await fetchall(db,
        f"""SELECT sk.sku_code, sk.sku_name, sk.brand, sk.category, b.branch_name,
                   COALESCE(SUM(sl.quantity),0) AS qty, COALESCE(SUM(sl.total_value),0) AS revenue
            FROM skus sk CROSS JOIN branches b
            LEFT JOIN sales sl ON sl.sku_id=sk.id AND sl.branch_id=b.id AND {date_filter}
            {where} AND b.is_active=TRUE
            GROUP BY sk.sku_code,sk.sku_name,sk.brand,sk.category,b.branch_name
            ORDER BY sk.sku_code, b.branch_name""", params)
    flat = [{"sku_code": r["sku_code"], "sku_name": r["sku_name"], "brand": r["brand"],
              "category": r["category"], "branch_name": r["branch_name"],
              "qty": float(r["qty"] or 0), "revenue": float(r["revenue"] or 0)} for r in rows]
    return _csv_response(flat, ["sku_code", "sku_name", "brand", "category", "branch_name", "qty", "revenue"],
                         "branch_sales_comparison.csv")


@router.get("/comparison/profitability/export")
async def branch_profitability_comparison_export(
    period: str = "last_13w", category: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    weeks_map = {"last_13w": 91, "last_26w": 182, "last_52w": 364}
    days = weeks_map.get(period, 91)
    where, params = "WHERE sk.is_active = TRUE AND sk.purchase_cost_decoded IS NOT NULL AND sk.purchase_cost_decoded > 0", []
    if category:
        where += " AND sk.category = %s"; params.append(category)
    rows = await fetchall(db,
        f"""SELECT sk.sku_code, sk.sku_name, sk.category, b.branch_name,
                   COALESCE(SUM(sl.total_value),0) AS revenue,
                   COALESCE(SUM(sl.quantity*sk.purchase_cost_decoded),0) AS cost
            FROM skus sk CROSS JOIN branches b
            LEFT JOIN sales sl ON sl.sku_id=sk.id AND sl.branch_id=b.id
                                  AND sl.sale_date >= CURRENT_DATE - INTERVAL '{days} days'
            {where} AND b.is_active=TRUE
            GROUP BY sk.sku_code,sk.sku_name,sk.category,b.branch_name
            ORDER BY sk.sku_code, b.branch_name""", params)
    flat = []
    for r in rows:
        rev = float(r["revenue"] or 0); cost = float(r["cost"] or 0)
        flat.append({"sku_code": r["sku_code"], "sku_name": r["sku_name"], "category": r["category"],
                     "branch_name": r["branch_name"], "revenue": rev, "cost": cost,
                     "margin_pct": round((rev - cost) / rev * 100, 1) if rev > 0 else ""})
    return _csv_response(flat, ["sku_code", "sku_name", "category", "branch_name", "revenue", "cost", "margin_pct"],
                         "branch_profitability_comparison.csv")


@router.get("/comparison/top-skus/export")
async def branch_top_skus_comparison_export(
    period: str = "last_13w", limit_skus: int = 20,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    weeks_map = {"mtd": "EXTRACT(MONTH FROM sl.sale_date)=EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM sl.sale_date)=EXTRACT(YEAR FROM NOW())",
                 "last_13w": "sl.sale_date >= CURRENT_DATE - INTERVAL '91 days'",
                 "last_26w": "sl.sale_date >= CURRENT_DATE - INTERVAL '182 days'",
                 "last_52w": "sl.sale_date >= CURRENT_DATE - INTERVAL '364 days'"}
    date_filter = weeks_map.get(period, weeks_map["last_13w"])
    rows = await fetchall(db,
        f"""SELECT b.branch_name, sk.sku_code, sk.sku_name, sk.brand, sk.category,
                   COALESCE(SUM(sl.quantity),0) AS qty, COALESCE(SUM(sl.total_value),0) AS revenue,
                   RANK() OVER (PARTITION BY b.id ORDER BY COALESCE(SUM(sl.total_value),0) DESC) AS rank
            FROM branches b JOIN sales sl ON sl.branch_id=b.id AND {date_filter}
            JOIN skus sk ON sk.id=sl.sku_id AND sk.is_active=TRUE
            WHERE b.is_active=TRUE
            GROUP BY b.id, b.branch_name, sk.id, sk.sku_code, sk.sku_name, sk.brand, sk.category
            ORDER BY b.branch_name, revenue DESC""", [])
    flat = [{"branch_name": r["branch_name"], "rank": int(r["rank"]),
              "sku_code": r["sku_code"], "sku_name": r["sku_name"],
              "brand": r["brand"], "category": r["category"],
              "qty": float(r["qty"] or 0), "revenue": float(r["revenue"] or 0)}
             for r in rows if int(r["rank"]) <= limit_skus]
    return _csv_response(flat, ["branch_name", "rank", "sku_code", "sku_name", "brand", "category", "qty", "revenue"],
                         "branch_top_skus_comparison.csv")


# ── Transfer Log Export ───────────────────────────────────────────────────────

@router.get("/transfers/export")
async def transfer_log_export(
    branch_id: str = "", sku_id: str = "",
    from_date: str = "", to_date: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    where, params = "WHERE 1=1", []
    if branch_id:
        where += " AND (st.from_branch_id=%s OR st.to_branch_id=%s)"; params += [branch_id, branch_id]
    if sku_id:
        where += " AND st.sku_id=%s"; params.append(sku_id)
    if from_date:
        where += " AND st.transfer_date>=%s"; params.append(from_date)
    if to_date:
        where += " AND st.transfer_date<=%s"; params.append(to_date)

    rows = await fetchall(db,
        f"""SELECT st.transfer_date, sk.sku_code, sk.sku_name,
                   fb.branch_name AS from_branch, tb.branch_name AS to_branch,
                   st.quantity, st.notes
            FROM stock_transfers st
            JOIN skus sk ON sk.id=st.sku_id
            JOIN branches fb ON fb.id=st.from_branch_id
            JOIN branches tb ON tb.id=st.to_branch_id
            {where} ORDER BY st.transfer_date DESC, st.created_at DESC""", params)
    flat = [{"transfer_date": str(r["transfer_date"]), "sku_code": r["sku_code"],
              "sku_name": r["sku_name"], "from_branch": r["from_branch"],
              "to_branch": r["to_branch"], "quantity": float(r["quantity"] or 0),
              "notes": r["notes"] or ""} for r in rows]
    return _csv_response(flat, ["transfer_date", "sku_code", "sku_name", "from_branch", "to_branch", "quantity", "notes"],
                         "stock_transfer_log.csv")
