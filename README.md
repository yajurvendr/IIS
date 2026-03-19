# IIS — Inventory Intelligence System

Multi-tenant SaaS platform for automobile parts retailers. Tracks inventory, forecasts demand, manages reorders, monitors profitability, and follows up on outstanding payments.

---

## Architecture

| Layer | Technology | Port |
|---|---|---|
| Frontend (web portal + admin panel) | Next.js 14, App Router, plain JS | 3000 |
| Backend API | Python FastAPI, Uvicorn | 4000 |
| Database | PostgreSQL 15 (schema-based multi-tenancy) | 5432 |
| Scheduler | APScheduler (embedded inside FastAPI) | — |

There is **one** frontend application (`web/`) serving both tenant users and the super admin. There is no separate admin portal.

---

## Quick Start

### Terminal 1 — PostgreSQL

```bash
brew services start postgresql@15
```

### Terminal 2 — API

```bash
cd "/Users/admin/Downloads/Personal/Inventory V2/api"
source venv/bin/activate
python db/migrate.py   # first run only — creates schemas and seeds super admin
uvicorn main:app --host 0.0.0.0 --port 4000 --reload
```

### Terminal 3 — Frontend

```bash
cd "/Users/admin/Downloads/Personal/Inventory V2/web"
npm run dev
```

Open: **http://localhost:3000**

---

## Default Credentials

| Role | Email | Password |
|---|---|---|
| Super Admin | admin@iis.in | Admin@123 |

Log in at **http://localhost:3000/login**. The super admin is redirected to `/admin/dashboard`; tenant users are redirected to `/dashboard`.

To create a tenant: log in as super admin → **Tenants → New Tenant**.

---

## Workflow

1. **Super Admin** provisions a tenant (creates PostgreSQL schema + admin user + sends onboarding email)
2. **Tenant Admin** logs in, uploads sales/purchase/inventory CSV exports from Busy ERP
3. Import service processes the file, validates rows, inserts into the tenant schema
4. APScheduler runs the forecasting engine nightly (2 AM IST) for all SKUs
5. Dashboard shows 19 KPI widgets; inventory health table shows Red/Amber/Green WOI
6. PO Advisor recommends order quantities based on blended DRR × target weeks
7. Cost Decoder translates encoded purchase costs from Busy exports

---

## Route Structure

### Tenant Portal
`/dashboard`, `/skus`, `/inventory`, `/import`, `/po-advisor`, `/outstanding`, `/reports`, `/settings`, `/branches`, `/profitability`, `/seasonal`, `/reorder`, `/users`

### Super Admin Pages (same app, same port)
`/admin/dashboard`, `/admin/tenants`, `/admin/plans`, `/admin/users`, `/admin/announcements`, `/admin/audit`, `/admin/health`

---

## File Structure

```
api/
  routers/            # auth, skus, imports, forecasting, dashboard, reports, branches,
                      # reorder, outstanding, customers, vendors, whatsapp, settings, admin, users
  services/           # forecastingService, importService, costDecoderService,
                      # provisionService, exportService
  workers/            # APScheduler nightly forecast job
  middleware/         # auth (JWT), tenant (DB attach), rbac (role guard)
  config/             # db.py (asyncpg pools + psycopg2), settings.py
  db/migrations/      # 001_public_schema.sql, 002_tenant_schema.sql
  venv/               # Python 3.14 virtual environment (MUST activate before running)

web/src/app/
  (public)/login/     # Single login page for all user types
  (portal)/           # Tenant portal pages (auth-guarded)
    dashboard/
    import/
    inventory/
    skus/
    po-advisor/
    seasonal/
    profitability/
    outstanding/
    reorder/
    branches/
    reports/
    users/
    settings/
  admin/              # Super admin pages (role-guarded)
    dashboard/
    tenants/
    plans/
    users/
    announcements/
    audit/
    health/
```

---

## Database

Single PostgreSQL database `iis` with schema-based multi-tenancy:

```
database: iis
├── schema: platform            ← shared (tenants, plans, super_admin_users, etc.)
└── schema: tenant_{short_id}   ← one per tenant (skus, sales, purchases, etc.)
```

Migration files:
- `api/db/migrations/001_public_schema.sql` — platform schema DDL + super admin seed
- `api/db/migrations/002_tenant_schema.sql` — per-tenant schema DDL template
- `api/db/migrate.py` — migration runner
