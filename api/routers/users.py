"""
Tenant user management — CRUD for users within a tenant.
Only tenant_admin may manage users.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from config.db import fetchall, fetchone, execute
from middleware.auth import require_role, get_tenant_db
from services.password_service import pwd_ctx as _crypt

router  = APIRouter(prefix="/users", tags=["users"])

MAX_NAME_LEN  = 100
MAX_EMAIL_LEN = 255


class UserCreate(BaseModel):
    email: EmailStr
    name:  str
    role:  str = "tenant_user"   # tenant_admin | tenant_user
    password: str


class UserUpdate(BaseModel):
    name:      str | None = None
    role:      str | None = None
    is_active: bool | None = None


class PasswordReset(BaseModel):
    new_password: str


# GET /users
@router.get("/")
async def list_users(
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    rows = await fetchall(db,
        "SELECT id, email, name, role, is_active, created_at, last_login_at FROM users ORDER BY created_at ASC"
    )
    return {"data": rows}


# POST /users
@router.post("/", status_code=201)
async def create_user(
    body: UserCreate,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    if body.role not in ("tenant_admin", "tenant_user"):
        raise HTTPException(status_code=400, detail="role must be tenant_admin or tenant_user")
    if len(body.name) > MAX_NAME_LEN:
        raise HTTPException(status_code=400, detail=f"name too long (max {MAX_NAME_LEN})")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="password must be at least 8 characters")

    existing = await fetchone(db, "SELECT id FROM users WHERE email=%s", (body.email,))
    if existing:
        raise HTTPException(status_code=409, detail="Email already in use")

    # Check plan user limit
    from config.db import get_public_pool, fetchone as pub_fetchone
    pub_pool = await get_public_pool()
    tenant_id = user.get("tenantId")
    if tenant_id:
        plan_row = await pub_fetchone(pub_pool,
            "SELECT p.max_users FROM tenants t JOIN plans p ON p.id=t.plan_id WHERE t.id=%s",
            (tenant_id,)
        )
        if plan_row:
            count_row = await fetchone(db, "SELECT COUNT(*) AS c FROM users WHERE is_active=TRUE")
            if count_row and (count_row["c"] or 0) >= plan_row["max_users"]:
                raise HTTPException(status_code=403, detail=f"User limit reached ({plan_row['max_users']} max on your plan)")

    new_id = str(uuid.uuid4())
    pw_hash = _crypt.hash(body.password)
    await execute(db,
        "INSERT INTO users (id, email, name, role, password_hash, is_active, created_at) VALUES (%s,%s,%s,%s,%s,TRUE,NOW())",
        (new_id, body.email, body.name, body.role, pw_hash)
    )
    return {"id": new_id, "email": body.email, "name": body.name, "role": body.role}


# PATCH /users/:id
@router.patch("/{user_id}")
async def update_user(
    user_id: str,
    body: UserUpdate,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    target = await fetchone(db, "SELECT id, role FROM users WHERE id=%s", (user_id,))
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent demoting self
    if user_id == user.get("userId") and body.role and body.role != "tenant_admin":
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    fields, vals = [], []
    if body.name is not None:
        fields.append("name=%s"); vals.append(body.name)
    if body.role is not None:
        if body.role not in ("tenant_admin", "tenant_user"):
            raise HTTPException(status_code=400, detail="Invalid role")
        fields.append("role=%s"); vals.append(body.role)
    if body.is_active is not None:
        fields.append("is_active=%s"); vals.append(body.is_active)

    if not fields:
        raise HTTPException(status_code=400, detail="Nothing to update")

    vals.append(user_id)
    await execute(db, f"UPDATE users SET {', '.join(fields)} WHERE id=%s", vals)
    return {"updated": True}


# POST /users/:id/reset-password
@router.post("/{user_id}/reset-password")
async def reset_password(
    user_id: str,
    body: PasswordReset,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    target = await fetchone(db, "SELECT id FROM users WHERE id=%s", (user_id,))
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    pw_hash = _crypt.hash(body.new_password)
    await execute(db, "UPDATE users SET password_hash=%s WHERE id=%s", (pw_hash, user_id))
    return {"updated": True}


# DELETE /users/:id
@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    user: dict = Depends(require_role("tenant_admin")),
    db=Depends(get_tenant_db),
):
    if user_id == user.get("userId"):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    target = await fetchone(db, "SELECT id FROM users WHERE id=%s", (user_id,))
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    # Soft-delete
    await execute(db, "UPDATE users SET is_active=FALSE WHERE id=%s", (user_id,))
    return {"deleted": True}
