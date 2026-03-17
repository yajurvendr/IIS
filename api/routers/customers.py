from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from config.db import fetchall, fetchone, execute
from middleware.auth import require_role, get_tenant_db

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("/")
async def list_customers(
    search: str = "", page: int = 1, limit: int = 50,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    offset = (page - 1) * limit
    where, params = "WHERE 1=1", []
    if search:
        where += " AND (customer_name ILIKE %s OR phone ILIKE %s OR customer_code ILIKE %s)"
        params += [f"%{search}%"] * 3

    rows = await fetchall(db,
        f"SELECT * FROM customers {where} ORDER BY customer_name LIMIT %s OFFSET %s",
        params + [limit, offset]
    )
    total_row = await fetchone(db, f"SELECT COUNT(*) AS total FROM customers {where}", params)
    return {"data": rows, "total": total_row["total"], "page": page, "limit": limit}


class CustomerUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_code: Optional[str] = None
    phone: Optional[str] = None
    whatsapp_number: Optional[str] = None


# PATCH /customers/{customer_id}
@router.patch("/{customer_id}")
async def update_customer(
    customer_id: str,
    body: CustomerUpdate,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    existing = await fetchone(db, "SELECT id FROM customers WHERE id = %s", (customer_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Customer not found")
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    await execute(db, f"UPDATE customers SET {set_clause} WHERE id = %s",
                  list(updates.values()) + [customer_id])
    return {"message": "Customer updated"}


@router.get("/{customer_id}/outstanding")
async def customer_outstanding(
    customer_id: str,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    # Raw ledger entries for this customer
    ledger = await fetchall(db,
        """SELECT ol.id, ol.transaction_date, ol.transaction_type,
                  ol.amount, ol.reference_no, ol.created_at
           FROM outstanding_ledger ol
           WHERE ol.customer_id = %s
           ORDER BY ol.transaction_date DESC""",
        (customer_id,)
    )
    # Net outstanding (invoices - payments - credits)
    total_row = await fetchone(db,
        """SELECT COALESCE(SUM(CASE WHEN transaction_type='invoice' THEN amount ELSE -amount END), 0) AS total_outstanding
           FROM outstanding_ledger WHERE customer_id = %s""",
        (customer_id,)
    )
    return {"data": ledger, "total_outstanding": float(total_row["total_outstanding"] or 0)}
