from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import jwt
import uuid
from datetime import datetime, timezone, timedelta
from config import settings
from config.db import get_public_pool, get_tenant_pool, fetchone, fetchall, execute
from services.password_service import pwd_ctx, UnknownHashError

router = APIRouter(prefix="/auth", tags=["auth"])


def sign_access(payload: dict) -> str:
    data = {**payload, "exp": datetime.now(timezone.utc) + timedelta(seconds=settings.JWT_EXPIRES_IN)}
    return jwt.encode(data, settings.JWT_SECRET, algorithm="HS256")


def sign_refresh(payload: dict) -> str:
    data = {**payload, "exp": datetime.now(timezone.utc) + timedelta(seconds=settings.REFRESH_EXPIRES_IN)}
    return jwt.encode(data, settings.REFRESH_SECRET, algorithm="HS256")


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


# POST /auth/login
@router.post("/login")
async def login(body: LoginRequest):
    pub = await get_public_pool()

    # 1. Check super admin
    sa = await fetchone(pub,
        "SELECT * FROM super_admin_users WHERE email = %s AND is_active = TRUE",
        (body.email,)
    )
    if sa:
        stored = sa["password_hash"]
        try:
            ok = pwd_ctx.verify(body.password, stored)
        except UnknownHashError:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not ok:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if pwd_ctx.needs_update(stored):
            new_hash = pwd_ctx.hash(body.password)
            await execute(pub,
                "UPDATE super_admin_users SET password_hash = %s WHERE id = %s",
                (new_hash, sa["id"])
            )
        payload = {"userId": str(sa["id"]), "email": sa["email"], "role": "super_admin"}
        access_token  = sign_access(payload)
        refresh_token = sign_refresh(payload)
        await execute(pub,
            "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (%s,%s,%s, NOW() + INTERVAL '7 days')",
            (str(uuid.uuid4()), str(sa["id"]), refresh_token)
        )
        return {
            "access_token": access_token, "refresh_token": refresh_token,
            "role": "super_admin",
            "user": {"id": str(sa["id"]), "name": sa["name"], "email": sa["email"]},
        }

    # 2. Search tenant schemas
    tenants = await fetchall(pub, "SELECT * FROM tenants WHERE status != 'churned'")
    for tenant in tenants:
        try:
            pool = await get_tenant_pool(tenant["db_name"])
            u = await fetchone(pool,
                "SELECT * FROM users WHERE email = %s AND is_active = TRUE",
                (body.email,)
            )
        except Exception as e:
            print(f"[Login] Skipping tenant {tenant['slug']} ({tenant['db_name']}): {type(e).__name__}: {e}")
            continue
        if not u:
            continue
        stored = u["password_hash"]
        try:
            ok = pwd_ctx.verify(body.password, stored)
        except UnknownHashError as e:
            print(f"[Login] UnknownHashError for {body.email} in {tenant['slug']}: {e}")
            continue
        if not ok:
            continue
        if pwd_ctx.needs_update(stored):
            new_hash = pwd_ctx.hash(body.password)
            await execute(pool,
                "UPDATE users SET password_hash = %s WHERE id = %s",
                (new_hash, str(u["id"]))
            )

        await execute(pool, "UPDATE users SET last_login_at = NOW() WHERE id = %s", (str(u["id"]),))
        await execute(pub,  "UPDATE tenants SET last_login_at = NOW() WHERE id = %s", (str(tenant["id"]),))

        payload = {
            "userId": str(u["id"]), "email": u["email"], "role": u["role"],
            "tenantId": str(tenant["id"]), "tenantDbName": tenant["db_name"],
            "tenantSlug": tenant["slug"], "tenantName": tenant["business_name"],
        }
        access_token  = sign_access(payload)
        refresh_token = sign_refresh(payload)
        await execute(pub,
            "INSERT INTO refresh_tokens (id, user_id, tenant_id, token_hash, expires_at) VALUES (%s,%s,%s,%s, NOW() + INTERVAL '7 days')",
            (str(uuid.uuid4()), str(u["id"]), str(tenant["id"]), refresh_token)
        )
        return {
            "access_token": access_token, "refresh_token": refresh_token,
            "role": u["role"],
            "user": {"id": str(u["id"]), "name": u["name"], "email": u["email"]},
            "tenant": {"id": str(tenant["id"]), "slug": tenant["slug"], "name": tenant["business_name"], "status": tenant["status"]},
        }

    raise HTTPException(status_code=401, detail="Invalid credentials")


# POST /auth/refresh
@router.post("/refresh")
async def refresh(body: RefreshRequest):
    try:
        decoded = jwt.decode(body.refresh_token, settings.REFRESH_SECRET, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    pub = await get_public_pool()
    row = await fetchone(pub,
        "SELECT * FROM refresh_tokens WHERE token_hash = %s AND revoked_at IS NULL AND expires_at > NOW()",
        (body.refresh_token,)
    )
    if not row:
        raise HTTPException(status_code=401, detail="Refresh token expired or revoked")

    await execute(pub, "UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = %s", (str(row["id"]),))

    payload = {k: decoded.get(k) for k in ["userId", "email", "role", "tenantId", "tenantDbName", "tenantSlug", "tenantName"]}
    access_token  = sign_access(payload)
    new_refresh   = sign_refresh(payload)

    await execute(pub,
        "INSERT INTO refresh_tokens (id, user_id, tenant_id, token_hash, expires_at) VALUES (%s,%s,%s,%s, NOW() + INTERVAL '7 days')",
        (str(uuid.uuid4()), decoded["userId"], decoded.get("tenantId"), new_refresh)
    )
    return {"access_token": access_token, "refresh_token": new_refresh}


# POST /auth/logout
@router.post("/logout")
async def logout(body: LogoutRequest):
    if body.refresh_token:
        pub = await get_public_pool()
        await execute(pub,
            "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = %s",
            (body.refresh_token,)
        )
    return {"message": "Logged out"}
