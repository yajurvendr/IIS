# IIS — Inventory Intelligence System — Quick Start

## Prerequisites
- Node.js 20+
- MySQL 8 running locally
- Redis running locally (default port 6379)

---

## 1. API Setup

```bash
cd api
cp .env.example .env
# Edit .env — set DB_PASSWORD and any secrets
npm install
npm run migrate          # Creates iis_public DB and runs migrations
                         # Seeds default super admin: admin@iis.in / Admin@123
npm run dev              # API starts on http://localhost:4000
```

In a separate terminal, start the background workers:
```bash
cd api
npm run worker           # BullMQ import + forecast workers
```

---

## 2. Tenant Portal

```bash
cd web
cp .env.local.example .env.local
npm install
npm run dev              # http://localhost:3000
```

---

## 3. Super Admin Portal

```bash
cd admin
cp .env.local.example .env.local
npm install
npm run dev              # http://localhost:3001
```

---

## Default Credentials

| Role        | Email           | Password   | Portal |
|-------------|-----------------|------------|--------|
| Super Admin | admin@iis.in    | Admin@123  | :3001  |

To create a tenant, log in to the admin portal and go to **Tenants → New Tenant**.

---

## Workflow

1. **Super Admin** provisions a tenant (creates MySQL DB + admin user + sends onboarding email)
2. **Tenant Admin** logs in at `:3000`, uploads sales/purchase/inventory CSV exports from Busy
3. BullMQ worker processes the import, runs forecasting engine for all SKUs
4. Dashboard shows 16 KPI widgets; inventory health table shows Red/Amber/Green WOI
5. PO Advisor recommends order quantities based on DRR × 12-week target
6. Cost Decoder translates encoded purchase costs from Busy exports

---

## File Structure

```
api/
  src/routes/         # auth, imports, skus, forecasting, reports, dashboard, settings, admin
  src/services/       # forecastingService, importService, costDecoderService, provisionService, exportService
  src/workers/        # importWorker, forecastWorker (BullMQ)
  src/middleware/     # auth (JWT), tenant (DB attach), rbac (role guard)
  db/migrations/      # 001_public_schema.sql, 002_tenant_schema.sql

web/src/app/(portal)/
  dashboard/          # 16-widget dashboard
  import/             # Upload + history
  inventory/          # WOI health table
  skus/               # SKU master, detail, bulk-tag
  po-advisor/         # PO recommendations + urgent
  seasonal/           # Pre-season alerts + calendar
  profitability/      # 4-tab analytics
  outstanding/        # Ageing + export
  settings/           # General + cost-decoder + whatsapp-templates

admin/src/app/(portal)/
  dashboard/          # Platform KPIs
  tenants/            # Full CRUD + provisioning
  plans/              # Subscription plans
  users/              # Cross-tenant user list + password reset
  announcements/      # Broadcast
  audit/              # Immutable audit log
  health/             # DB + Redis status
```
