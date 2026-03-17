"""
WhatsApp send router.
Uses the requests library to call the WhatsApp Business API (or a gateway like Twilio/WATI).
Gateway URL and token are read from environment / settings.
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import re

from config.db import fetchone, fetchall, get_public_pool
from middleware.auth import require_role, get_tenant_db

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


# ── Config helpers ────────────────────────────────────────────────────────────

def _gateway_configured() -> bool:
    from config import settings as cfg
    return bool(getattr(cfg, "WHATSAPP_API_URL", None) and getattr(cfg, "WHATSAPP_API_TOKEN", None))


def _render_template(template: str, variables: dict) -> str:
    """Replace {{variable_name}} placeholders in a template with actual values.
    Unknown variables are left as-is so nothing is silently dropped."""
    def replacer(m):
        key = m.group(1).strip()
        return str(variables.get(key, m.group(0)))
    return re.sub(r"\{\{([^}]+)\}\}", replacer, template)


def _send_message(phone: str, message: str) -> dict:
    """Send a WhatsApp message via the configured gateway.
    Raises RuntimeError if not configured or if the gateway returns an error."""
    from config import settings as cfg
    import requests as _req

    url   = cfg.WHATSAPP_API_URL
    token = cfg.WHATSAPP_API_TOKEN

    # Normalise phone: strip non-digits, ensure country code
    phone_clean = re.sub(r"\D", "", phone)
    if not phone_clean:
        raise ValueError("Invalid phone number")

    resp = _req.post(
        url,
        json={"to": phone_clean, "type": "text", "text": {"body": message}},
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        timeout=10,
    )
    if not resp.ok:
        raise RuntimeError(f"Gateway error {resp.status_code}: {resp.text[:200]}")
    return resp.json()


# ── Endpoints ─────────────────────────────────────────────────────────────────

class SendRequest(BaseModel):
    customer_id: str
    template_id: Optional[str] = None
    message: Optional[str] = None          # raw message override
    phone_override: Optional[str] = None   # send to this number instead of customer's


@router.post("/send")
async def send_whatsapp(
    body: SendRequest,
    user: dict = Depends(require_role("tenant_admin", "tenant_user")),
    db=Depends(get_tenant_db),
):
    """
    Send a WhatsApp message to a customer.
    Either template_id or message must be provided.
    """
    if not body.template_id and not body.message:
        raise HTTPException(status_code=400, detail="Provide either template_id or message")

    if not _gateway_configured():
        raise HTTPException(
            status_code=503,
            detail="WhatsApp gateway not configured. Set WHATSAPP_API_URL and WHATSAPP_API_TOKEN in .env"
        )

    # Resolve customer
    customer = await fetchone(db,
        "SELECT id, customer_name, phone, whatsapp_number FROM customers WHERE id = %s",
        (body.customer_id,)
    )
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    phone = body.phone_override or customer.get("whatsapp_number") or customer.get("phone")
    if not phone:
        raise HTTPException(
            status_code=400,
            detail="Customer has no phone/WhatsApp number on record. Update the customer first."
        )

    # Resolve message text
    if body.template_id:
        tpl = await fetchone(db,
            "SELECT message_body FROM whatsapp_templates WHERE id = %s", (body.template_id,))
        if not tpl:
            raise HTTPException(status_code=404, detail="Template not found")
        # Build variable context: customer fields + tenant business name
        pub = await get_public_pool()
        tenant_row = await fetchone(pub,
            "SELECT business_name FROM tenants WHERE id = %s", (user["tenantId"],))
        # Outstanding balance for this customer (from ledger)
        outstanding_row = await fetchone(db,
            """SELECT COALESCE(SUM(CASE WHEN transaction_type='invoice' THEN amount ELSE -amount END),0) AS balance
               FROM outstanding_ledger WHERE customer_id = %s""",
            (body.customer_id,)
        )
        variables = {
            "customer_name":      customer.get("customer_name", ""),
            "phone":              phone,
            "business_name":      (tenant_row or {}).get("business_name", ""),
            "outstanding_amount": str(round(float((outstanding_row or {}).get("balance") or 0), 2)),
        }
        message_text = _render_template(tpl["message_body"], variables)
    else:
        message_text = body.message

    try:
        result = _send_message(phone, message_text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {
        "message": "Sent",
        "customer_id": body.customer_id,
        "customer_name": customer["customer_name"],
        "phone": phone,
        "gateway_response": result,
    }


class BulkSendRequest(BaseModel):
    customer_ids: List[str]
    template_id: str


@router.post("/send-bulk")
async def send_whatsapp_bulk(
    body: BulkSendRequest,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    """Send the same WhatsApp template to multiple customers (outstanding reminders, etc.)."""
    if not body.customer_ids:
        raise HTTPException(status_code=400, detail="customer_ids required")
    if not _gateway_configured():
        raise HTTPException(status_code=503, detail="WhatsApp gateway not configured")

    tpl = await fetchone(db, "SELECT message_body FROM whatsapp_templates WHERE id = %s", (body.template_id,))
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    template_body = tpl["message_body"]

    pub = await get_public_pool()
    tenant_row = await fetchone(pub,
        "SELECT business_name FROM tenants WHERE id = %s", (user["tenantId"],))
    business_name = (tenant_row or {}).get("business_name", "")

    sent, failed = [], []
    for cid in body.customer_ids:
        customer = await fetchone(db,
            "SELECT id, customer_name, phone, whatsapp_number FROM customers WHERE id = %s", (cid,))
        if not customer:
            failed.append({"customer_id": cid, "error": "Customer not found"})
            continue
        phone = customer.get("whatsapp_number") or customer.get("phone")
        if not phone:
            failed.append({"customer_id": cid, "error": "No phone number"})
            continue
        try:
            outstanding_row = await fetchone(db,
                """SELECT COALESCE(SUM(CASE WHEN transaction_type='invoice' THEN amount ELSE -amount END),0) AS balance
                   FROM outstanding_ledger WHERE customer_id = %s""", (cid,))
            variables = {
                "customer_name":      customer.get("customer_name", ""),
                "phone":              phone,
                "business_name":      business_name,
                "outstanding_amount": str(round(float((outstanding_row or {}).get("balance") or 0), 2)),
            }
            message_text = _render_template(template_body, variables)
            _send_message(phone, message_text)
            sent.append({"customer_id": cid, "customer_name": customer["customer_name"], "phone": phone})
        except Exception as e:
            failed.append({"customer_id": cid, "error": str(e)})

    return {"sent": len(sent), "failed": len(failed), "details_sent": sent, "details_failed": failed}
