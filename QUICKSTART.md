# IIS — Inventory Intelligence System — Quick Start

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.11+ | Use 3.11 or 3.12 for best compatibility |
| Node.js | 20+ | For the web and admin portals |
| PostgreSQL | 15+ | Running locally on port 5432 |

---

## 1. Database Setup

```bash
# Create the database (run once)
createdb iis
# OR using psql:
psql -U postgres -c "CREATE DATABASE iis;"
```

---

## 2. API Setup

```bash
cd api

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate          # Mac/Linux
# venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Open .env and set:
#   DB_PASSWORD=your_postgres_password
#   JWT_SECRET=any_32+_char_random_string
#   REFRESH_SECRET=any_32+_char_random_string

# Run migrations (creates platform schema, seeds super admin)
python db/migrate.py

# Start the API
uvicorn main:app --host 0.0.0.0 --port 4000 --reload
```

The API will be available at **http://localhost:4000**

---

## 3. Tenant Portal

```bash
cd web
npm install
npm run dev       # http://localhost:3000
```

---

## 4. Super Admin Portal

```bash
cd admin
npm install
npm run dev       # http://localhost:3001
```

---

## Default Credentials

| Role        | Email        | Password  | Portal URL            |
|-------------|--------------|-----------|-----------------------|
| Super Admin | admin@iis.in | Admin@123 | http://localhost:3001 |

To create a tenant: log in to the admin portal → **Tenants → New Tenant**.
The tenant admin can then log in at http://localhost:3000.

---

## Workflow

1. **Super Admin** provisions a tenant (auto-creates schema + admin user)
2. **Tenant Admin** logs in at `:3000`, uploads CSV/XLSX exports from Busy
3. Background scheduler (embedded in API process) runs nightly at 2:00 AM IST
4. Dashboard shows KPI widgets; Inventory health table shows Red/Amber/Green WOI status
5. PO Advisor recommends order quantities based on DRR × 12-week target
6. Cost Decoder translates encoded purchase costs from Busy exports

---

## Project Structure

```
api/                            # FastAPI backend (Python)
  config/                       # settings.py, db.py (asyncpg pools)
  db/migrations/                # SQL migrations (001–004)
  middleware/                   # auth (JWT), tenant DB resolver
  routers/                      # auth, skus, imports, reports, dashboard, ...
  services/                     # forecasting, import, cost decoder, export
  workers/                      # scheduler.py (APScheduler), import_tasks.py
  main.py                       # FastAPI app entry point

web/src/app/(portal)/           # Tenant portal (Next.js)
  dashboard/                    # KPI widgets
  import/                       # File upload + history
  inventory/                    # WOI health table
  skus/                         # SKU master + detail + bulk-tag
  po-advisor/                   # Purchase order recommendations
  seasonal/                     # Pre-season alerts
  profitability/                # 4-tab analytics
  outstanding/                  # Ageing ledger + export
  settings/                     # Cost decoder, WhatsApp templates

admin/src/app/(portal)/         # Super admin portal (Next.js)
  tenants/                      # Tenant CRUD + provisioning
  plans/                        # Subscription plan management
  users/                        # Cross-tenant user list
  announcements/                # Platform-wide broadcasts
  audit/                        # Immutable audit log
```
