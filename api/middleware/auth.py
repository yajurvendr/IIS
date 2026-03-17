"""
JWT authentication dependencies for FastAPI.
"""
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from config import settings

bearer_scheme = HTTPBearer(auto_error=False)


def decode_token(token: str, secret: str) -> dict:
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    return decode_token(creds.credentials, settings.JWT_SECRET)


async def require_super_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    return user


def require_role(*roles: str):
    """Factory: returns a dependency that checks user role."""
    async def _check(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail=f"Required role: {', '.join(roles)}")
        return user
    return _check


async def get_tenant_db(user: dict = Depends(get_current_user)):
    """Attach tenant pool to request. Not for super_admin routes."""
    from config.db import get_tenant_pool
    db_name = user.get("tenantDbName")
    if not db_name:
        raise HTTPException(status_code=403, detail="Tenant context required")
    return await get_tenant_pool(db_name)
