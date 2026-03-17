from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import time

from config import settings
from config.db import get_public_pool, close_all_pools

from routers.auth import router as auth_router
from routers.imports import router as imports_router
from routers.skus import router as skus_router
from routers.forecasting import router as forecasting_router
from routers.reports import router as reports_router
from routers.customers import router as customers_router
from routers.dashboard import router as dashboard_router
from routers.settings_router import router as settings_router
from routers.admin import router as admin_router
from routers.users import router as users_router
from routers.branches import router as branches_router
from routers.vendors import router as vendors_router
from routers.whatsapp import router as whatsapp_router
from routers.reorder import router as reorder_router
from routers.outstanding_followups import router as outstanding_followups_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_public_pool()
    from workers.scheduler import start_scheduler, stop_scheduler
    start_scheduler()
    print(f"[IIS] API started on port {settings.PORT}")
    yield
    stop_scheduler()
    await close_all_pools()
    print("[IIS] API shut down")


limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

app = FastAPI(
    title="IIS API",
    version="1.0.0",
    description="Inventory Intelligence System — Multi-tenant REST API",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.WEB_ORIGIN, settings.ADMIN_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(imports_router)
app.include_router(skus_router)
app.include_router(forecasting_router)
app.include_router(reports_router)
app.include_router(customers_router)
app.include_router(dashboard_router)
app.include_router(settings_router)
app.include_router(admin_router)
app.include_router(users_router)
app.include_router(branches_router)
app.include_router(vendors_router)
app.include_router(whatsapp_router)
app.include_router(reorder_router)
app.include_router(outstanding_followups_router)


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


# ── Global error handler ──────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    print(f"[Error] {request.method} {request.url} — {type(exc).__name__}: {exc}")
    traceback.print_exc()
    # Manually add CORS headers as a safety net (Starlette can drop them on unhandled exceptions)
    origin = request.headers.get("origin", "")
    extra_headers = {}
    if origin in (settings.WEB_ORIGIN, settings.ADMIN_ORIGIN):
        extra_headers["Access-Control-Allow-Origin"] = origin
        extra_headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(status_code=500, content={"detail": f"{type(exc).__name__}: {exc}"}, headers=extra_headers)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.PORT, reload=True)
