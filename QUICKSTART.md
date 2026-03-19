# IIS — Inventory Intelligence System — Quick Start

## Prerequisites

- Python 3.14 (venv already created at `api/venv/`)
- Node.js 20+
- PostgreSQL 15 running locally

---

## 1. Start PostgreSQL

```bash
brew services start postgresql@15
```

---

## 2. API Setup

```bash
cd "/Users/admin/Downloads/Personal/Inventory V2/api"
source venv/bin/activate
```

> **IMPORTANT:** You must run `source venv/bin/activate` every time you open a new terminal.
> Your prompt should show `(venv)` at the start. If it does not, the API will fail to start.

First run only — create the database and run migrations:

```bash
# Create the database (first time only)
createdb iis

# Run migrations — creates schemas and seeds default super admin
python db/migrate.py
```

You should see:
```
[migrate] Schema 'platform' ready in database 'iis'.
[migrate] Default super admin: admin@iis.in / Admin@123
```

Start the API:

```bash
uvicorn main:app --host 0.0.0.0 --port 4000 --reload
```

The API runs on **http://localhost:4000**. Visit **http://localhost:4000/docs** for interactive API documentation.

---

## 3. Frontend

Open a **new terminal tab**:

```bash
cd "/Users/admin/Downloads/Personal/Inventory V2/web"
npm run dev
```

Open: **http://localhost:3000**

---

## Default Credentials

| Role | Email | Password | Login URL |
|---|---|---|---|
| Super Admin | admin@iis.in | Admin@123 | http://localhost:3000/login |

Log in at **http://localhost:3000/login** — all user types use the same login page.
- Super admin is redirected to `/admin/dashboard`
- Tenant users are redirected to `/dashboard`

To create a tenant: log in as super admin → **Tenants → New Tenant**.

---

## Restarting After Reboot

```bash
# Terminal 1 — PostgreSQL
brew services start postgresql@15

# Terminal 2 — API
cd "/Users/admin/Downloads/Personal/Inventory V2/api"
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 4000 --reload

# Terminal 3 — Frontend
cd "/Users/admin/Downloads/Personal/Inventory V2/web"
npm run dev
```

---

## File Structure (Summary)

```
api/            Python FastAPI REST API  (port 4000)
  venv/         Python virtual environment — MUST activate before running
web/            Next.js 14 web portal    (port 3000)
                Serves both tenant portal and super admin panel
```

---

## Workflow

1. Super Admin provisions a tenant (creates PostgreSQL schema + admin user)
2. Tenant Admin logs in, uploads sales/purchase/inventory CSV exports from Busy ERP
3. Import service validates and inserts rows into the tenant schema
4. APScheduler runs the forecasting engine nightly at 2 AM IST for all SKUs
5. Dashboard shows 19 KPI widgets; inventory table shows Red/Amber/Green WOI status
6. PO Advisor recommends order quantities based on blended DRR × target weeks
7. Cost Decoder translates encoded purchase costs from Busy exports
