"""Outstanding Follow-up module (SRS Note v2 §3 / SRS §11.4).

Append-only audit trail of follow-up actions per invoice.
Active status = most recent row per invoice_ref.
NEVER UPDATE existing rows — always INSERT a new row for each action.

Statuses:
  followup_pending       — no action, invoice overdue
  customer_promised      — finance spoke to customer, promised_payment_dt set
  reminder_snoozed       — alert suppressed until snoozed_until
  escalation_required    — flagged for escalation, notifies Tenant Admin
  auto_closed            — payment received via Busy sync (system-only)
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from datetime import date

from config.db import fetchall, fetchone, execute
from middleware.auth import require_role, get_tenant_db
from config.mailer import send_mail

router = APIRouter(prefix="/outstanding", tags=["outstanding-followups"])


# ── Pydantic models ───────────────────────────────────────────────────────────

class FollowupCreate(BaseModel):
    invoice_ref: str
    customer_id: Optional[str] = None
    comment: Optional[str] = None
    promised_payment_dt: Optional[str] = None   # YYYY-MM-DD


class SnoozeBody(BaseModel):
    invoice_ref: str
    snoozed_until: str   # YYYY-MM-DD


class EscalateBody(BaseModel):
    invoice_ref: str
    comment: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _latest_followup(db, invoice_ref: str) -> dict | None:
    return await fetchone(db,
        """SELECT * FROM outstanding_followups
           WHERE invoice_ref = %s
           ORDER BY created_at DESC LIMIT 1""",
        (invoice_ref,)
    )


async def _insert_followup(db, invoice_ref, customer_id, comment,
                           promised_payment_dt, snoozed_until,
                           followup_status, created_by):
    await execute(db,
        """INSERT INTO outstanding_followups
               (invoice_ref, customer_id, comment, promised_payment_dt,
                snoozed_until, followup_status, created_by, created_at, updated_at)
           VALUES (%s,%s,%s,%s,%s,%s,%s,NOW(),NOW())""",
        (invoice_ref, customer_id, comment, promised_payment_dt,
         snoozed_until, followup_status, created_by)
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

# GET /outstanding/followups?invoice_ref=X
@router.get("/followups")
async def get_followups(
    invoice_ref: str,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    """Full follow-up history for an invoice, newest first."""
    rows = await fetchall(db,
        """SELECT f.id, f.invoice_ref, f.customer_id, f.comment,
                  f.promised_payment_dt, f.snoozed_until, f.followup_status,
                  f.created_at, u.name AS created_by_name
           FROM outstanding_followups f
           LEFT JOIN users u ON u.id = f.created_by
           WHERE f.invoice_ref = %s
           ORDER BY f.created_at DESC""",
        (invoice_ref,)
    )
    return {"data": rows, "count": len(rows)}


# POST /outstanding/followups  — add/update comment + promised date
@router.post("/followups")
async def create_followup(
    body: FollowupCreate,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    status = "customer_promised" if body.promised_payment_dt else "followup_pending"
    await _insert_followup(
        db,
        invoice_ref=body.invoice_ref,
        customer_id=body.customer_id,
        comment=body.comment,
        promised_payment_dt=body.promised_payment_dt,
        snoozed_until=None,
        followup_status=status,
        created_by=user["userId"],
    )
    return {"message": "Follow-up recorded", "status": status}


# POST /outstanding/followups/snooze
@router.post("/followups/snooze")
async def snooze_followup(
    body: SnoozeBody,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    latest = await _latest_followup(db, body.invoice_ref)
    await _insert_followup(
        db,
        invoice_ref=body.invoice_ref,
        customer_id=(latest or {}).get("customer_id"),
        comment=(latest or {}).get("comment"),
        promised_payment_dt=(latest or {}).get("promised_payment_dt"),
        snoozed_until=body.snoozed_until,
        followup_status="reminder_snoozed",
        created_by=user["userId"],
    )
    return {"message": "Follow-up snoozed until " + body.snoozed_until}


# POST /outstanding/followups/escalate
@router.post("/followups/escalate")
async def escalate_followup(
    body: EscalateBody,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    latest = await _latest_followup(db, body.invoice_ref)
    await _insert_followup(
        db,
        invoice_ref=body.invoice_ref,
        customer_id=(latest or {}).get("customer_id"),
        comment=body.comment or (latest or {}).get("comment"),
        promised_payment_dt=None,
        snoozed_until=None,
        followup_status="escalation_required",
        created_by=user["userId"],
    )

    # Fire-and-forget email to Tenant Admin
    customer_id = (latest or {}).get("customer_id")
    customer_name = ""
    if customer_id:
        cust = await fetchone(db, "SELECT customer_name FROM customers WHERE id = %s", (customer_id,))
        customer_name = (cust or {}).get("customer_name", "")

    async def _send_escalation():
        try:
            admin = await fetchone(db,
                "SELECT email, name FROM users WHERE role='tenant_admin' AND is_active=TRUE LIMIT 1")
            if admin and admin.get("email"):
                await send_mail(
                    to=admin["email"],
                    subject=f"[IIS] Outstanding Escalated — Invoice {body.invoice_ref}",
                    html=(
                        f"<p>Invoice <b>{body.invoice_ref}</b> for customer "
                        f"<b>{customer_name}</b> has been escalated for immediate follow-up.</p>"
                        f"<p><b>Comment:</b> {body.comment or 'No comment provided'}</p>"
                    ),
                )
        except Exception as e:
            print(f"[escalate] email failed: {e}")

    background_tasks.add_task(_send_escalation)
    return {"message": "Escalation recorded, admin notified"}
