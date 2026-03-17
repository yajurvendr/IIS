"""Provision a new tenant: create schema, run DDL, seed admin, send email."""
import uuid
import os
import json
import re
import psycopg2
import psycopg2.extras
from config import settings
from config.db import get_public_pool, fetchone, execute

SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "..", "db", "migrations", "002_tenant_schema.sql")


async def provision_tenant(opts: dict) -> dict:
    business_name  = opts["business_name"]
    slug           = opts["slug"]
    contact_email  = opts["contact_email"]
    contact_phone  = opts.get("contact_phone")
    contact_name   = opts.get("contact_name", business_name)
    plan_id        = opts.get("plan_id")
    admin_name     = opts.get("admin_name", "Admin")
    admin_email    = opts["admin_email"]
    admin_password = opts["admin_password"]
    created_by     = opts.get("created_by", "system")

    pub = await get_public_pool()

    from fastapi import HTTPException
    existing = await fetchone(pub, "SELECT id FROM tenants WHERE slug = %s", (slug,))
    if existing:
        raise HTTPException(status_code=409, detail=f'Slug "{slug}" is already taken')

    tenant_id   = str(uuid.uuid4())
    short_id    = tenant_id.replace("-", "")[:12]
    schema_name = f"tenant_{short_id}"   # PostgreSQL schema name
    db_name     = schema_name             # stored in tenants.db_name for JWT lookup

    # Resolve plan
    if not plan_id:
        plan_row = await fetchone(pub, "SELECT id FROM plans LIMIT 1")
        plan_id  = plan_row["id"] if plan_row else None

    sync_conn = None
    try:
        # 1. Insert tenant record
        await execute(pub,
            """INSERT INTO tenants
               (id, business_name, slug, contact_name, email, phone, plan_id, db_name, status, trial_ends_at, created_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'trial', NOW() + INTERVAL '30 days', NOW())""",
            (tenant_id, business_name, slug, contact_name, contact_email, contact_phone, plan_id, db_name)
        )

        # 2. Create PostgreSQL schema (using sync psycopg2 — schema DDL outside transaction)
        sync_conn = psycopg2.connect(
            host=settings.DB_HOST, port=settings.DB_PORT,
            user=settings.DB_USER, password=settings.DB_PASSWORD,
            dbname=settings.DB_NAME,
        )
        sync_conn.autocommit = True
        with sync_conn.cursor() as cur:
            cur.execute(f"CREATE SCHEMA IF NOT EXISTS {schema_name}")

        # 3. Run tenant schema DDL
        with open(SCHEMA_PATH, "r") as f:
            schema_sql = f.read()

        # Replace {schema} placeholder in the SQL
        schema_sql = schema_sql.replace("{schema}", schema_name)

        with sync_conn.cursor() as cur:
            cur.execute(f"SET search_path TO {schema_name}")
            # Strip all -- comments before splitting so semicolons inside
            # comments don't produce false statement boundaries.
            sql_no_comments = re.sub(r'--[^\n]*', '', schema_sql)
            for stmt in sql_no_comments.split(";"):
                stmt = stmt.strip()
                if stmt:
                    try:
                        cur.execute(stmt)
                    except psycopg2.errors.DuplicateTable:
                        pass
                    except psycopg2.errors.DuplicateObject:
                        pass
                    except Exception as e:
                        if "already exists" not in str(e).lower():
                            raise

        # 4. Create admin user in tenant schema
        user_id = str(uuid.uuid4())
        from services.password_service import pwd_ctx
        pw_hash = pwd_ctx.hash(admin_password)
        with sync_conn.cursor() as cur:
            cur.execute(f"SET search_path TO {schema_name}")
            cur.execute(
                "INSERT INTO users (id, name, email, password_hash, role, is_active, created_at) VALUES (%s,%s,%s,%s,'tenant_admin',TRUE,NOW())",
                (user_id, admin_name, admin_email, pw_hash)
            )

        # 4b. Create default Home Branch
        branch_id = str(uuid.uuid4())
        with sync_conn.cursor() as cur:
            cur.execute(f"SET search_path TO {schema_name}")
            cur.execute(
                "INSERT INTO branches (id, branch_code, branch_name, is_home_branch, is_active, created_at) VALUES (%s,'HQ',%s,TRUE,TRUE,NOW())",
                (branch_id, business_name)
            )

        # 5. Audit log
        await execute(pub,
            "INSERT INTO audit_log (user_id, user_role, action, entity, entity_id, details) VALUES (%s,'super_admin','provision_tenant','tenant',%s,%s)",
            (created_by, tenant_id, json.dumps({"schema_name": schema_name, "admin_email": admin_email}))
        )

        # 6. Onboarding email (best-effort)
        try:
            from config.mailer import send_mail
            await send_mail(
                to=admin_email,
                subject=f"Welcome to IIS — Your account for {business_name} is ready",
                html=f"""<h2>Welcome to Inventory Intelligence System</h2>
                    <p>Hi {admin_name},</p>
                    <p>Your account for <strong>{business_name}</strong> has been created.</p>
                    <p><strong>Login URL:</strong> {settings.WEB_ORIGIN}/login</p>
                    <p><strong>Email:</strong> {admin_email}</p>
                    <p><strong>Temporary Password:</strong> {admin_password}</p>
                    <p>Please change your password after first login. Your 30-day trial is active.</p>""",
            )
        except Exception as e:
            print(f"[Provision] Email failed: {e}")

        return {
            "tenant_id": tenant_id, "schema_name": schema_name, "slug": slug,
            "admin_user_id": user_id, "message": "Tenant provisioned successfully",
        }

    except Exception as e:
        # Rollback: remove tenant record
        try:
            await execute(pub, "DELETE FROM tenants WHERE id = %s", (tenant_id,))
        except Exception:
            pass
        if sync_conn:
            try:
                with sync_conn.cursor() as cur:
                    cur.execute(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE")
            except Exception:
                pass
        raise e
    finally:
        if sync_conn:
            sync_conn.close()
