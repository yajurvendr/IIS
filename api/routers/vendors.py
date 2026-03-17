"""Vendors router — CRUD for vendor/supplier master."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
import uuid
import io

from config.db import fetchall, fetchone, execute
from middleware.auth import require_role, get_tenant_db

router = APIRouter(prefix="/vendors", tags=["vendors"])


class VendorCreate(BaseModel):
    vendor_name: str
    vendor_code: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


class VendorUpdate(BaseModel):
    vendor_name: Optional[str] = None
    vendor_code: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/")
async def list_vendors(
    search: str = "",
    include_inactive: bool = False,
    page: int = 1,
    limit: int = 50,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    where, params = "WHERE 1=1", []
    if not include_inactive:
        where += " AND is_active = TRUE"
    if search:
        where += " AND (vendor_name ILIKE %s OR vendor_code ILIKE %s OR contact_name ILIKE %s)"
        s = f"%{search}%"
        params += [s, s, s]

    offset = (page - 1) * limit
    rows = await fetchall(db,
        f"""SELECT id, vendor_code, vendor_name, contact_name, phone, email, address, is_active, created_at
            FROM vendors {where}
            ORDER BY vendor_name
            LIMIT %s OFFSET %s""",
        params + [limit, offset]
    )
    count = await fetchone(db, f"SELECT COUNT(*) AS total FROM vendors {where}", params)
    return {"data": [dict(r) for r in rows], "total": count["total"] if count else 0}


@router.get("/{vendor_id}")
async def get_vendor(
    vendor_id: str,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    row = await fetchone(db,
        "SELECT id, vendor_code, vendor_name, contact_name, phone, email, address, is_active, created_at FROM vendors WHERE id = %s",
        (vendor_id,)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return dict(row)


@router.post("/", status_code=201)
async def create_vendor(
    body: VendorCreate,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    if body.vendor_code:
        existing = await fetchone(db, "SELECT id FROM vendors WHERE vendor_code = %s", (body.vendor_code,))
        if existing:
            raise HTTPException(status_code=409, detail="Vendor code already exists")

    vendor_id = str(uuid.uuid4())
    await execute(db,
        """INSERT INTO vendors (id, vendor_code, vendor_name, contact_name, phone, email, address, is_active, created_at)
           VALUES (%s,%s,%s,%s,%s,%s,%s,TRUE,NOW())""",
        (vendor_id, body.vendor_code, body.vendor_name, body.contact_name, body.phone, body.email, body.address)
    )
    return {"id": vendor_id, "message": "Vendor created"}


@router.patch("/{vendor_id}")
async def update_vendor(
    vendor_id: str,
    body: VendorUpdate,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    row = await fetchone(db, "SELECT id FROM vendors WHERE id = %s", (vendor_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Vendor not found")

    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f"{k} = %s" for k in updates)
    await execute(db, f"UPDATE vendors SET {set_clause} WHERE id = %s", list(updates.values()) + [vendor_id])
    return {"message": "Vendor updated"}


@router.delete("/{vendor_id}", status_code=204)
async def delete_vendor(
    vendor_id: str,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    row = await fetchone(db, "SELECT id FROM vendors WHERE id = %s", (vendor_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Vendor not found")

    # Check if vendor is referenced in purchases (by vendor_name match is impractical; skip hard delete if has purchases)
    purch = await fetchone(db,
        "SELECT 1 FROM purchases WHERE vendor_name = (SELECT vendor_name FROM vendors WHERE id = %s) LIMIT 1",
        (vendor_id,)
    )
    if purch:
        raise HTTPException(status_code=400, detail="Vendor has purchase records. Deactivate instead of deleting.")

    await execute(db, "DELETE FROM vendors WHERE id = %s", (vendor_id,))


# POST /vendors/import — bulk import from CSV/XLSX
@router.post("/import", status_code=200)
async def bulk_import_vendors(
    file: UploadFile = File(...),
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    """
    Import vendors from a CSV or XLSX file.
    Expected columns (case-insensitive): vendor_name (required), vendor_code,
    contact_name, phone, email, address.
    Existing vendors matched by vendor_code are updated; new ones are inserted.
    """
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ("csv", "xlsx", "xls"):
        raise HTTPException(status_code=400, detail="File must be CSV or XLSX")

    content = await file.read()

    # Parse rows
    if ext == "csv":
        import csv
        text = content.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        rows = [dict(r) for r in reader]
    else:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        headers = None
        rows = []
        for excel_row in ws.iter_rows(values_only=True):
            if headers is None:
                headers = [str(c).strip() if c is not None else "" for c in excel_row]
                continue
            rows.append(dict(zip(headers, [str(c).strip() if c is not None else "" for c in excel_row])))

    # Normalise header names to lowercase without spaces
    def _norm(row):
        return {k.strip().lower().replace(" ", "_"): (v or "").strip() for k, v in row.items()}

    inserted = updated = skipped = 0
    errors = []
    for i, raw in enumerate(rows, start=2):  # row 2 = first data row
        r = _norm(raw)
        vendor_name = r.get("vendor_name") or r.get("name", "")
        if not vendor_name:
            skipped += 1
            continue

        vendor_code = r.get("vendor_code") or r.get("code") or None
        contact_name = r.get("contact_name") or r.get("contact") or None
        phone   = r.get("phone") or r.get("mobile") or None
        email   = r.get("email") or None
        address = r.get("address") or None

        try:
            if vendor_code:
                existing = await fetchone(db, "SELECT id FROM vendors WHERE vendor_code = %s", (vendor_code,))
                if existing:
                    await execute(db,
                        """UPDATE vendors SET vendor_name=%s, contact_name=%s, phone=%s, email=%s, address=%s
                           WHERE vendor_code=%s""",
                        (vendor_name, contact_name, phone, email, address, vendor_code)
                    )
                    updated += 1
                    continue

            new_id = str(uuid.uuid4())
            await execute(db,
                """INSERT INTO vendors (id, vendor_code, vendor_name, contact_name, phone, email, address, is_active, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,TRUE,NOW())
                   ON CONFLICT (vendor_name) DO UPDATE
                   SET contact_name=EXCLUDED.contact_name, phone=EXCLUDED.phone,
                       email=EXCLUDED.email, address=EXCLUDED.address""",
                (new_id, vendor_code, vendor_name, contact_name, phone, email, address)
            )
            inserted += 1
        except Exception as e:
            errors.append({"row": i, "vendor_name": vendor_name, "error": str(e)})
            skipped += 1

    return {
        "message": f"Import complete: {inserted} inserted, {updated} updated, {skipped} skipped",
        "inserted": inserted, "updated": updated, "skipped": skipped,
        "errors": errors[:20],
    }
