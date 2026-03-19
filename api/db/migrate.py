#!/usr/bin/env python3
"""Run public schema migration (001_public_schema.sql) — PostgreSQL."""
import os
import sys
import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import settings
from services.password_service import pwd_ctx as _pwd_ctx

SCHEMA_PATH   = os.path.join(os.path.dirname(__file__), "migrations", "001_public_schema.sql")
MIGRATION_003 = os.path.join(os.path.dirname(__file__), "migrations", "003_busy_schedule.sql")
MIGRATION_004 = os.path.join(os.path.dirname(__file__), "migrations", "004_performance_indexes.sql")


def migrate():
    print(f'[migrate] Connecting to PostgreSQL database "{settings.DB_NAME}"...')
    # First connect without a schema to create the schema + extension
    conn = psycopg2.connect(
        host=settings.DB_HOST, port=settings.DB_PORT,
        user=settings.DB_USER, password=settings.DB_PASSWORD,
        dbname=settings.DB_NAME,
    )
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
        cur.execute(f"CREATE SCHEMA IF NOT EXISTS {settings.DB_SCHEMA_PUBLIC};")
    conn.close()

    # Reconnect with search_path baked in at the connection level
    conn = psycopg2.connect(
        host=settings.DB_HOST, port=settings.DB_PORT,
        user=settings.DB_USER, password=settings.DB_PASSWORD,
        dbname=settings.DB_NAME,
        options=f"-c search_path={settings.DB_SCHEMA_PUBLIC},public",
    )
    conn.autocommit = True
    with conn.cursor() as cur:
        # Belt-and-suspenders: also set search_path explicitly in the session
        cur.execute(f"SET search_path TO {settings.DB_SCHEMA_PUBLIC}, public;")

        with open(SCHEMA_PATH, "r") as f:
            sql = f.read()

        for stmt in sql.split(";"):
            # Strip leading whitespace/comments (inline comments bleed into next segment)
            lines = [ln for ln in stmt.splitlines() if ln.strip() and not ln.strip().startswith("--")]
            stmt = "\n".join(lines).strip()
            if not stmt:
                continue
            sl = stmt.lower()
            if sl.startswith("set search_path") or sl.startswith("create schema") or sl.startswith("create extension"):
                continue
            try:
                cur.execute(stmt)
            except psycopg2.errors.DuplicateTable:
                pass  # table exists — OK
            except psycopg2.errors.DuplicateObject:
                pass  # index/extension exists — OK
            except Exception as e:
                if "already exists" in str(e).lower():
                    pass
                else:
                    print(f"[migrate] WARN: {e!r} in stmt: {stmt[:80]}")

        # Migration 003 — busy schedule columns (ALTER TABLE IF NOT EXISTS cols)
        with open(MIGRATION_003, "r") as f:
            m3 = f.read()
        for stmt in m3.split(";"):
            lines = [ln for ln in stmt.splitlines() if ln.strip() and not ln.strip().startswith("--")]
            stmt = "\n".join(lines).strip()
            if not stmt:
                continue
            try:
                cur.execute(stmt)
            except Exception as e:
                if "already exists" in str(e).lower():
                    pass
                else:
                    print(f"[migrate] WARN (003): {e!r}")

        # Migration 004 — performance indexes (applied per tenant schema)
        with open(MIGRATION_004, "r") as f:
            m4 = f.read()
        cur.execute("SELECT db_name FROM tenants")
        tenant_schemas = [r[0] for r in cur.fetchall()]
        for schema in tenant_schemas:
            cur.execute(f"SET search_path TO {schema}, public;")
            for stmt in m4.split(";"):
                lines = [ln for ln in stmt.splitlines() if ln.strip() and not ln.strip().startswith("--")]
                stmt = "\n".join(lines).strip()
                if not stmt:
                    continue
                try:
                    cur.execute(stmt)
                except Exception as e:
                    if "already exists" in str(e).lower():
                        pass
                    else:
                        print(f"[migrate] WARN (004/{schema}): {e!r}")
            cur.execute(f"SET search_path TO {settings.DB_SCHEMA_PUBLIC}, public;")
        if tenant_schemas:
            print(f"[migrate] Performance indexes applied to {len(tenant_schemas)} tenant schema(s).")

        # Seed default super admin
        pw_hash = _pwd_ctx.hash("Admin@123")
        cur.execute(
            """
            INSERT INTO super_admin_users (id, email, password_hash, name)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (email) DO NOTHING
            """,
            ("00000000-0000-0000-0000-000000000001", "admin@iis.in", pw_hash, "Platform Admin"),
        )

    conn.close()
    print(f"[migrate] Schema '{settings.DB_SCHEMA_PUBLIC}' ready in database '{settings.DB_NAME}'.")
    print("[migrate] Default super admin: admin@iis.in / Admin@123")


if __name__ == "__main__":
    migrate()
