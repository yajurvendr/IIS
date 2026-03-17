import asyncio
import uuid
import os
import json
from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile, File, Form, HTTPException
from typing import Optional

import aiofiles

from config import settings
from config.db import fetchall, fetchone, execute
from middleware.auth import require_role, get_tenant_db

router = APIRouter(prefix="/imports", tags=["imports"])

ALLOWED_EXT  = {".csv", ".xlsx", ".xls"}
ALLOWED_TYPES = {"sales", "purchases", "inventory", "outstanding", "msl", "urgent_skus",
                 "sales_invoices", "payment_receipts"}
MAX_SIZE_MB   = 10


@router.post("/detect-branches")
async def detect_branches(
    file: UploadFile = File(...),
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    """
    Pre-scan a sales/inventory file for a location column.
    Returns: detected location values + which ones are already mapped to a branch.
    If no location column is found, returns {has_location_column: false}.
    """
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Only CSV/XLSX/XLS files allowed")

    content = await file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File too large (max {MAX_SIZE_MB}MB)")

    # Save temporarily to parse
    tmp_id   = str(uuid.uuid4())
    tmp_path = os.path.join(settings.UPLOAD_DIR, f"tmp_{tmp_id}{ext}")
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    async with aiofiles.open(tmp_path, "wb") as f:
        await f.write(content)

    try:
        from services.import_service import parse_file, detect_location_column, scan_location_values
        rows = await asyncio.to_thread(parse_file, tmp_path)
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass

    if not rows:
        return {"has_location_column": False, "location_values": []}

    location_col = detect_location_column(list(rows[0].keys()))
    if not location_col:
        return {"has_location_column": False, "location_column": None, "location_values": []}

    distinct_values = scan_location_values(rows, location_col)

    # Check which values already have a branch mapping
    mappings = []
    branches = await fetchall(db, "SELECT id, branch_code, branch_name FROM branches WHERE is_active = TRUE ORDER BY branch_name", [])
    branch_list = [{"id": str(b["id"]), "branch_code": b["branch_code"], "branch_name": b["branch_name"]} for b in branches]

    for val in distinct_values:
        existing = await fetchone(db,
            "SELECT branch_id FROM branch_column_maps WHERE column_value = %s", (val,))
        mappings.append({
            "column_value": val,
            "mapped_branch_id": str(existing["branch_id"]) if existing else None,
        })

    return {
        "has_location_column": True,
        "location_column": location_col,
        "location_values": mappings,
        "branches": branch_list,
    }


@router.post("/upload")
async def upload_import(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    data_type: str   = Form("sales"),
    import_notes: str = Form(""),
    branch_id: Optional[str] = Form(None),
    branch_mappings: Optional[str] = Form(None),  # JSON: {"Location A": "branch-uuid", ...}
    auto_create_branches: bool = Form(False),
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Only CSV/XLSX/XLS files allowed")
    if data_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"data_type must be one of: {', '.join(ALLOWED_TYPES)}")

    content = await file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File too large (max {MAX_SIZE_MB}MB)")

    # Parse branch_mappings JSON if provided
    parsed_mappings = {}
    if branch_mappings:
        try:
            parsed_mappings = json.loads(branch_mappings)
        except Exception:
            raise HTTPException(status_code=400, detail="branch_mappings must be valid JSON")

    batch_id    = str(uuid.uuid4())
    stored_name = f"{batch_id}{ext}"
    dest_path   = os.path.join(settings.UPLOAD_DIR, stored_name)

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    async with aiofiles.open(dest_path, "wb") as f:
        await f.write(content)

    await execute(db,
        """INSERT INTO import_batches
             (id, data_type, file_name, file_path, status, branch_id, import_notes, uploaded_by, created_at)
           VALUES (%s,%s,%s,%s,'pending',%s,%s,%s,NOW())""",
        (batch_id, data_type, file.filename, stored_name, branch_id or None, import_notes or None, user["userId"])
    )

    from workers.import_tasks import process_import
    background_tasks.add_task(process_import, {
        "batch_id":            batch_id,
        "tenant_id":           user.get("tenantId"),
        "tenant_db_name":      user["tenantDbName"],
        "file_path":           dest_path,
        "data_type":           data_type,
        "branch_id":           branch_id or None,
        "branch_mappings":     parsed_mappings,
        "auto_create_branches": auto_create_branches,
        "uploaded_by":         user["userId"],
    })

    return {"batch_id": batch_id, "status": "pending", "message": "Import queued"}


@router.get("/")
async def list_imports(
    page: int  = 1,
    limit: int = 20,
    status: str    = "",
    data_type: str = "",
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    offset = (page - 1) * limit
    where  = []
    params = []
    if status:
        where.append("status=%s"); params.append(status)
    if data_type:
        where.append("data_type=%s"); params.append(data_type)
    clause = ("WHERE " + " AND ".join(where)) if where else ""

    rows = await fetchall(db,
        f"""SELECT id, data_type, file_name, status,
                   records_total, records_imported, records_skipped,
                   new_masters_created, import_notes, uploaded_by,
                   created_at, completed_at
            FROM import_batches {clause}
            ORDER BY created_at DESC LIMIT %s OFFSET %s""",
        params + [limit, offset]
    )
    total_row = await fetchone(db, f"SELECT COUNT(*) AS total FROM import_batches {clause}", params)
    return {"data": rows, "total": total_row["total"], "page": page, "limit": limit}


@router.get("/{batch_id}")
async def get_import(
    batch_id: str,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    row = await fetchone(db,
        """SELECT id, data_type, file_name, file_path, status,
                  records_total, records_imported, records_skipped,
                  new_masters_created, error_log, import_notes,
                  uploaded_by, created_at, completed_at
           FROM import_batches WHERE id=%s""",
        (batch_id,)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Batch not found")
    return row


@router.post("/{batch_id}/cancel")
async def cancel_import(
    batch_id: str,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    row = await fetchone(db, "SELECT id, status FROM import_batches WHERE id = %s", (batch_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Batch not found")
    if row["status"] not in ("pending", "processing"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel a batch with status '{row['status']}'")
    await execute(db,
        "UPDATE import_batches SET status = 'cancelled', completed_at = NOW() WHERE id = %s",
        (batch_id,)
    )
    return {"message": "Import cancelled"}


@router.post("/{batch_id}/reprocess")
async def reprocess_import(
    batch_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    row = await fetchone(db,
        "SELECT id, data_type, file_path, status, branch_id FROM import_batches WHERE id = %s",
        (batch_id,)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Batch not found")
    if row["status"] in ("pending", "processing"):
        raise HTTPException(status_code=400, detail="Batch is already pending/processing")

    await execute(db,
        """UPDATE import_batches
           SET status='pending', records_imported=0, records_skipped=0,
               error_log=NULL, completed_at=NULL
           WHERE id=%s""",
        (batch_id,)
    )

    from workers.import_tasks import process_import
    background_tasks.add_task(process_import, {
        "batch_id":       batch_id,
        "tenant_id":      user.get("tenantId"),
        "tenant_db_name": user["tenantDbName"],
        "file_path":      row["file_path"],
        "data_type":      row["data_type"],
        "branch_id":      str(row["branch_id"]) if row.get("branch_id") else None,
        "uploaded_by":    user["userId"],
    })
    return {"message": "Import requeued", "batch_id": batch_id}
