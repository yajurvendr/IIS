"""
PostgreSQL connection pool factory.
Public pool (platform schema) + per-tenant pools (lazy-created, schema-isolated).
asyncpg for async (FastAPI); psycopg2 for sync (Celery workers).
"""
from __future__ import annotations
import re
import asyncpg
import psycopg2
import psycopg2.extras
from config import settings

_public_pool = None
_tenant_pools: dict = {}


def _to_pg(query: str, args: tuple | list | None) -> tuple[str, list]:
    """Convert %s-style placeholders to $1, $2, ... for asyncpg."""
    if not args:
        return query, []
    idx = 0
    def _repl(_):
        nonlocal idx
        idx += 1
        return f"${idx}"
    return re.sub(r"%s", _repl, query), list(args)


# ── Async pool helpers (FastAPI) ───────────────────────────────────────────────

async def get_public_pool():
    global _public_pool
    if _public_pool is None:
        _public_pool = await asyncpg.create_pool(
            host=settings.DB_HOST, port=settings.DB_PORT,
            user=settings.DB_USER, password=settings.DB_PASSWORD,
            database=settings.DB_NAME,
            server_settings={"search_path": settings.DB_SCHEMA_PUBLIC},
            min_size=2, max_size=10,
        )
    return _public_pool


async def get_tenant_pool(schema_name: str):
    """schema_name e.g. 'tenant_abc123'"""
    if schema_name not in _tenant_pools:
        _tenant_pools[schema_name] = await asyncpg.create_pool(
            host=settings.DB_HOST, port=settings.DB_PORT,
            user=settings.DB_USER, password=settings.DB_PASSWORD,
            database=settings.DB_NAME,
            server_settings={"search_path": schema_name},
            min_size=1, max_size=10,
        )
    return _tenant_pools[schema_name]


async def close_all_pools():
    global _public_pool
    if _public_pool:
        await _public_pool.close()
        _public_pool = None
    for pool in _tenant_pools.values():
        await pool.close()
    _tenant_pools.clear()


# ── Query helpers (async) ──────────────────────────────────────────────────────

async def fetchall(pool, query: str, args=None) -> list[dict]:
    q, a = _to_pg(query, args)
    async with pool.acquire() as conn:
        rows = await conn.fetch(q, *a)
        return [dict(r) for r in rows]


async def fetchone(pool, query: str, args=None) -> dict | None:
    q, a = _to_pg(query, args)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(q, *a)
        return dict(row) if row else None


async def execute(pool, query: str, args=None) -> int:
    """Execute INSERT/UPDATE/DELETE. Returns rowcount."""
    q, a = _to_pg(query, args)
    async with pool.acquire() as conn:
        result = await conn.execute(q, *a)
        # asyncpg returns e.g. "INSERT 0 1" or "UPDATE 3"
        try:
            return int(result.split()[-1])
        except (ValueError, IndexError):
            return 0


async def fetchval(pool, query: str, args=None):
    """Fetch a single scalar value."""
    q, a = _to_pg(query, args)
    async with pool.acquire() as conn:
        return await conn.fetchval(q, *a)


# ── Sync helpers (Celery workers) ─────────────────────────────────────────────

def get_sync_conn(schema_name: str):
    """schema_name e.g. 'tenant_abc123' or 'platform'"""
    conn = psycopg2.connect(
        host=settings.DB_HOST, port=settings.DB_PORT,
        user=settings.DB_USER, password=settings.DB_PASSWORD,
        dbname=settings.DB_NAME,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(f"SET search_path TO {schema_name}")
    return conn


def sync_fetchall(conn, query: str, args=None) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(query, args or ())
        return [dict(r) for r in cur.fetchall()]


def sync_fetchone(conn, query: str, args=None) -> dict | None:
    with conn.cursor() as cur:
        cur.execute(query, args or ())
        row = cur.fetchone()
        return dict(row) if row else None


def sync_execute(conn, query: str, args=None) -> int:
    with conn.cursor() as cur:
        cur.execute(query, args or ())
        return cur.rowcount
