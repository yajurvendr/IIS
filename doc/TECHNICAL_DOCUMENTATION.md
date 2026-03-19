# IIS — Inventory Intelligence System
## Complete Technical Documentation

**Version:** 2.0
**Last Updated:** March 2026
**Prepared for:** Developers & Technical Stakeholders

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Database Design](#3-database-design)
4. [Authentication & Security](#4-authentication--security)
5. [Backend Modules (API)](#5-backend-modules-api)
6. [Frontend Modules (Web Portal)](#6-frontend-modules-web-portal)
7. [Core Business Algorithms](#7-core-business-algorithms)
8. [Background Jobs & Scheduling](#8-background-jobs--scheduling)
9. [File Import System](#9-file-import-system)
10. [Integrations](#10-integrations)
11. [Settings & Configuration](#11-settings--configuration)
12. [Deployment & Environment](#12-deployment--environment)
13. [Startup Guide](#13-startup-guide)
14. [Technology Stack (Detailed)](#14-technology-stack-detailed)
15. [Database Schema (Full Detail)](#15-database-schema-full-detail)
16. [API Reference (Request / Response Examples)](#16-api-reference-request--response-examples)

---

## 1. Project Overview

### Purpose

IIS (Inventory Intelligence System) is a multi-tenant SaaS platform built for automobile parts retailers. It helps retail businesses track inventory, forecast demand, manage reorders, monitor profitability, and follow up on outstanding payments — all from a single web-based portal.

### Problem it Solves

Automobile parts retailers manage thousands of SKUs (Stock Keeping Units) across multiple branches. The common challenges are:

- **Overstocking** slow-moving parts, tying up capital
- **Stockouts** on fast-moving parts, losing sales
- **No visibility** across branches — stock imbalance goes unnoticed
- **Manual reorder decisions** — buyers guess instead of using data
- **Opaque costing** — vendors encode purchase prices (e.g., using letter substitution), making margin calculation difficult
- **Disconnected data** — sales, purchases, and stock exist in separate files or ERPs

### What IIS Provides

| Module | What it does |
|---|---|
| **Inventory Health** | Real-time stock view with WOI (Weeks of Inventory) traffic lights |
| **PO Advisor** | AI-assisted purchase order recommendations based on DRR |
| **Smart Reorder** | Two-bucket reorder engine with target stock calculation |
| **Branch Comparison** | Cross-branch matrix of stock, sales, margin, and top SKUs |
| **Sales Forecast** | SKU-level demand projection using blended DRR |
| **Profitability** | Gross margin per SKU with cost decoded from vendor encoding |
| **Outstanding Followups** | AR collection workflow with status tracking and WhatsApp alerts |
| **Data Import** | Bulk CSV/XLSX ingestion for sales, purchases, stock, MSL lists |
| **Cost Decoder** | Decodes vendor-encoded purchase prices automatically |
| **Reports** | Exportable Excel reports covering all domains |
| **Settings** | Full tenant configuration: targets, branch maps, WhatsApp, Busy sync |

### High-Level Workflow

```
Data Entry (CSV/XLSX import or Busy Web Service sync)
        ↓
Import Service validates → inserts into tenant DB schema
        ↓
APScheduler nightly job (2 AM IST) runs forecasting engine
        → computes DRR, WOI, MSL, seasonal flags
        → writes to forecasting_cache table
        ↓
Frontend pages query API → display dashboards, reports, alerts
        ↓
User actions: create POs, log transfers, follow up on outstanding
```

---

## 2. System Architecture

### Overview

The system consists of one backend API and one frontend application:

```
┌─────────────────────────────────────────────────────────────────────┐
│  web/   Next.js 14  port 3000                                        │
│  ├── /login              Single login for all users                  │
│  ├── /dashboard ...      Tenant portal pages                         │
│  └── /admin/dashboard .. Super admin pages (same app, same port)     │
└────────────────────────────┬────────────────────────────────────────┘
                             │ REST/JSON (Axios + JWT)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  api/   FastAPI  port 4000                                           │
│  └── APScheduler (embedded) — nightly forecast at 2 AM IST          │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ asyncpg (async routes)
                            │ psycopg2 (migrations only)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PostgreSQL database: iis                                            │
│  ├── schema: platform            (shared — tenants, plans, etc.)     │
│  └── schema: tenant_{short_id}   (one per tenant)                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology |
|---|---|
| Web Portal (tenant + admin) | Next.js 14, App Router, React, plain CSS (no TypeScript) |
| API | Python 3.14, FastAPI, Pydantic, Uvicorn |
| Database | PostgreSQL 15+ |
| Async DB driver | asyncpg (FastAPI routes) |
| Sync DB driver | psycopg2 (migration runner only) |
| Scheduler | APScheduler (embedded inside FastAPI process) |
| Rate limiting | slowapi (200 req/min per IP) |
| HTTP client | Axios (frontend) |
| File uploads | aiofiles (local filesystem → api/uploads/) |
| Excel export | openpyxl |
| Email | aiosmtplib (async SMTP — configurable) |
| WhatsApp | WATI / Twilio gateway (configurable URL + token) |

### CORS Policy

The API allows requests from the web portal origin, configured via environment variable:

```
WEB_ORIGIN = http://localhost:3000
```

---

## 3. Database Design

### Multi-Tenancy Model

A **single PostgreSQL database** (`iis`) with **multiple schemas**. Each tenant gets an isolated schema. This provides strong data isolation without the overhead of separate databases.

```
database: iis
├── schema: platform            ← shared across all tenants
└── schema: tenant_{short_id}   ← one per tenant (e.g. tenant_abc123ef0123)
```

When a tenant is provisioned:
1. A new schema is created: `CREATE SCHEMA tenant_{short_id}`
2. The full DDL from `002_tenant_schema.sql` is applied with `{schema}` replaced
3. A default `tenant_admin` user is created for that tenant

The tenant's schema name is stored in `platform.tenants.db_name` and embedded in the JWT token on login as `tenantDbName`. The API resolves this to the correct asyncpg connection pool for every request.

### Platform Schema Tables (`platform`)

| Table | Purpose |
|---|---|
| `tenants` | One row per customer company. Stores name, email, phone, plan, status (active/trial/suspended), short_id, db_name |
| `plans` | Subscription plan definitions (name, price, features) |
| `super_admin_users` | Platform admin accounts (separate from tenant users) |
| `refresh_tokens` | JWT refresh token store for rotation |
| `audit_log` | Platform-level audit trail |
| `announcements` | Banner messages displayed in tenant portal header |

### Tenant Schema Tables (`tenant_{id}`)

| Table | Key Columns | Notes |
|---|---|---|
| `users` | id, name, email, role, password_hash | Roles: tenant_admin, tenant_user |
| `branches` | id, branch_code, branch_name, is_home_branch, is_active | Home branch = default/HQ |
| `skus` | sku_code, sku_name, brand, category, unit, is_focus_sku, msl_busy, msl_override, purchase_cost_decoded, season_tags | Master product list |
| `sales` | sku_id, branch_id, quantity, total_value, sale_date | All transactions, `quantity` not `qty` |
| `purchases` | sku_id, branch_id, quantity, total_value, vendor_name, purchase_date | `total_value` not `total_amount` |
| `inventory_snapshots` | sku_id, branch_id, quantity_on_hand, snapshot_date | Periodic stock counts |
| `stock_transfers` | sku_id, from_branch_id, to_branch_id, quantity, transfer_date | Inter-branch movement |
| `customers` | customer_name, phone, email | `customer_name` not `name` |
| `outstanding_ledger` | transaction_date, transaction_type, amount, reference_no | No balance/due_date/invoice_no columns |
| `forecasting_cache` | sku_id, branch_id, drr_4w, drr_13w, drr_52w, drr_seasonal, drr_recommended, current_stock, woi, computed_at | Pre-computed by scheduler |
| `import_batches` | data_type, file_name, records_total, records_imported, status | Upload history |
| `cost_decode_formulas` | char_map (JSON), math_operation, math_value | Vendor encoding rules |
| `whatsapp_templates` | template_name, body | Message templates |
| `branch_column_maps` | branch_id, column_value | Maps CSV "location" strings → branch |

### Effective Stock Calculation

The system does not maintain a running stock counter. Instead, it computes effective stock on-the-fly as:

```
effective_stock = latest_snapshot
               + purchases_since_snapshot
               - sales_since_snapshot
               + transfers_in_since_snapshot
               - transfers_out_since_snapshot
```

This is done via SQL `LATERAL` joins for performance and correctness across branches.

---

## 4. Authentication & Security

### JWT Token Flow

```
POST /auth/login
  → validates email/password (bcrypt)
  → returns { access_token (24h), refresh_token (7d) }

POST /auth/refresh
  → validates refresh_token (stored in DB)
  → rotates: old token invalidated, new pair issued

POST /auth/logout
  → deletes refresh_token from DB
```

Tokens are signed with HS256. Secrets configured in environment:
- `JWT_SECRET` — signs access tokens
- `REFRESH_SECRET` — signs refresh tokens

### Token Payload

```json
{
  "sub": "user-uuid",
  "role": "tenant_admin",
  "tenantId": "tenant-uuid",
  "tenantDbName": "tenant_abc123ef0123",
  "name": "John Smith",
  "exp": 1234567890
}
```

The `tenantDbName` field is the most critical — it tells the API which PostgreSQL schema to query.

### FastAPI Dependencies (middleware/auth.py)

| Dependency | What it does |
|---|---|
| `get_current_user` | Decodes JWT, returns payload dict. 401 if missing/invalid/expired |
| `get_tenant_db` | Extracts `tenantDbName` → resolves asyncpg pool for that schema |
| `require_role(*roles)` | Factory — raises 403 if user role not in allowed list |
| `require_super_admin` | Checks role == "super_admin" — used on admin-only routes |

### Frontend Auth (web/src/lib/auth.js)

- Tokens stored in `localStorage`
- `api.js` Axios instance attaches `Authorization: Bearer <token>` on every request
- On 401 response: silently calls `/auth/refresh`, retries original request
- On refresh failure: clears localStorage, redirects to `/login`
- `getTenant()` / `getUser()` read from localStorage — wrapped in `useEffect` to avoid SSR/hydration mismatch

### Roles

| Role | Access |
|---|---|
| `super_admin` | Admin pages (`/admin/*`). Cannot access tenant portal pages |
| `tenant_admin` | Full access to all tenant features + settings + user management |
| `tenant_user` | Read/write access to operational features; cannot manage settings or users |

### Login Flow

All users log in at **http://localhost:3000/login** (one login page for all roles):
- Super admin credentials → redirected to `/admin/dashboard`
- Tenant admin / user credentials → redirected to `/dashboard`

---

## 5. Backend Modules (API)

### Router Overview

Each router file handles one domain. All routes are prefixed and included in `main.py`.

#### `/auth` — Authentication
- `POST /auth/login` — email/password login
- `POST /auth/refresh` — rotate refresh token
- `POST /auth/logout` — invalidate refresh token
- `GET /auth/me` — return current user info

#### `/skus` — SKU Master
- CRUD for the product master list
- `POST /skus/bulk-tag` — apply season tags to multiple SKUs at once
- `GET /skus/{id}` — SKU detail with forecasting data attached

#### `/imports` — Data Import
- `POST /imports/upload` — upload CSV or XLSX file
- Pre-scans file for "location" column values to detect branch mapping needs
- Runs import processing asynchronously via FastAPI background tasks
- `GET /imports/batches` — list import history with status and record counts
- Supports 8 data types: sales, purchases, inventory, outstanding, MSL, urgent_skus, invoices, payment_receipts

#### `/dashboard` — Home Dashboard
Aggregates 19 KPI widgets in a single API call:
- Total / focus / red / amber / green SKU counts
- MTD sales, purchases, gross margin
- WOI summary (how many SKUs in each health band)
- Top 5 SKUs by revenue and by margin
- Outstanding aging buckets (0-30, 31-60, 61-90, 90+ days)
- Data freshness (last import date per type)
- Cross-branch stock imbalances
- Seasonal pre-order alerts

#### `/forecasting` — Forecast Data
- `GET /forecasting` — paginated DRR/WOI/MSL data per SKU per branch
- `GET /forecasting/alerts` — SKUs below WOI threshold
- `POST /forecasting/recompute` — trigger recomputation for one or all SKUs

#### `/reports` — Excel Reports
All reports are downloadable as Excel files via streaming response:

| Endpoint | Report |
|---|---|
| `/reports/po-recommendations` | PO advisor output |
| `/reports/inventory-woi` | Full WOI health report |
| `/reports/msl-review` | MSL gap analysis |
| `/reports/profitability` | SKU-level margin report |
| `/reports/pre-season` | Seasonal alert report |
| `/reports/volume-profit-divergence` | SKUs where volume rank ≠ profit rank |
| `/reports/sales-forecast` | DRR projections |
| `/reports/top-300` | Top 300 SKUs by revenue |
| `/reports/focus-sku` | Focus SKU list with KPIs |
| `/reports/transfer-log` | Inter-branch transfer history |

#### `/branches` — Branch Management & Comparison
- CRUD for branches (create, update, set-home, deactivate, delete)
- `POST /branches/transfers` — log inter-branch stock transfer
- `GET /branches/transfers/log` — paginated transfer history
- **Comparison tabs** (all return SKU × Branch matrix):
  - `GET /branches/comparison/stock` — effective stock per branch
  - `GET /branches/comparison/sales` — revenue + quantity per branch
  - `GET /branches/comparison/profitability` — gross margin % per branch
  - `GET /branches/comparison/top-skus` — top N SKUs ranked per branch
- Each comparison endpoint has a corresponding `/export` CSV export

#### `/reorder` — Smart Reorder
Two-bucket analysis engine:

- **Bucket 1** — Active SKUs (sold in last 7 days + MSL > 0)
  Suggested qty = `MAX(0, target_stock − current_stock)`
  where `target_stock = DRR × lead_time × 1.2`

- **Bucket 2** — At-risk SKUs (below WOI threshold, no recent sales)

- `POST /reorder/orders` — save a confirmed reorder
- `PATCH /reorder/orders/{id}` — update order status / delivery date

#### `/outstanding_followups` — AR Collection
Append-only workflow — each status change is a new row, never an update:

| Status | Meaning |
|---|---|
| `followup_pending` | Due but not yet actioned |
| `customer_promised` | Customer gave a payment commitment date |
| `reminder_snoozed` | Snooze until a future date |
| `escalation_required` | Triggers email to tenant admin |
| `auto_closed` | Closed via Busy sync / payment received |

#### `/customers` — Customer Master
- CRUD for customer records
- Used by outstanding module for payment followup

#### `/vendors` — Vendor Management
- CRUD for vendor records
- Optional: linked to purchase records for analysis

#### `/whatsapp` — Messaging
- `POST /whatsapp/send` — single message (template or raw)
- `POST /whatsapp/bulk-send` — same template to multiple customers
- Variable interpolation: `{{customer_name}}`, `{{outstanding_amount}}`, `{{due_date}}`
- Phone normalisation before sending

#### `/settings_router` — Tenant Configuration
Covers all configurable aspects:
- Business details (name, email, phone)
- Lead time (days) — used in reorder calculations
- WOI thresholds (red/amber cutoffs)
- Outstanding method (direct_upload vs. computed)
- Cost decoder formulas (char substitution map + math operation)
- WhatsApp template management
- Branch column mapping (maps CSV location strings → branch IDs)
- Busy Web Service sync settings

#### `/admin` — Super Admin
- Accessible only with `super_admin` role
- Tenant management: list, create, suspend, provision
- Plan management
- Announcement management (banner shown in tenant portal)
- Platform-wide audit log
- Health check endpoint (DB status, scheduler status)

#### `/users` — User Management
- `GET /users` — list tenant users
- `POST /users` — create user (tenant_admin or tenant_user)
- `PATCH /users/{id}` — update role or details
- `DELETE /users/{id}` — deactivate user

---

## 6. Frontend Modules (Web Portal)

### Route Structure

The web portal is a single Next.js application serving all user types. Authenticated pages live under `web/src/app/(portal)/` and share a layout with:
- **Authentication guard** — redirects to `/login` if no valid JWT in localStorage
- **Sidebar** — navigation, tenant name, branch selector, user avatar
- **AnnouncementBanner** — shows active platform announcements

Super admin pages live under `web/src/app/admin/` and are role-guarded (super_admin only).

```
/login                          Public — single login page for all user types

/dashboard                      Tenant — Home — 19 KPI widgets
/import                         Tenant — Data Import — CSV/XLSX upload with column preview
/skus                           Tenant — SKU Master list with search/filter
/skus/bulk-tag                  Tenant — Bulk apply season tags to multiple SKUs
/skus/[id]                      Tenant — SKU detail page
/inventory                      Tenant — Inventory Health — WOI traffic light table
/branches/comparison            Tenant — Cross-branch matrix (4 tabs: Stock/Sales/Profit/TopSKUs)
/branches/transfer/new          Tenant — Log a new inter-branch transfer
/branches/transfer/log          Tenant — Transfer history log
/po-advisor                     Tenant — PO Advisor — suggested purchase quantities
/po-advisor/urgent              Tenant — Pre-season urgent SKU alert
/reorder                        Tenant — Smart Reorder — two-bucket analysis
/reports/sales-forecast         Tenant — DRR projection report
/reports/top-300                Tenant — Top 300 SKUs by revenue
/reports/focus-sku              Tenant — Focus SKU list
/reports/msl-review             Tenant — MSL gap review
/reports/volume-profit-divergence  Tenant — Volume vs. profit divergence
/seasonal/pre-season-alert      Tenant — Seasonal pre-order alerts
/profitability                  Tenant — Gross margin per SKU
/outstanding                    Tenant — AR outstanding ledger with followup workflow
/users                          Tenant — User management (tenant_admin only)
/settings/general               Tenant — Business name, contact info
/settings/inventory-targets     Tenant — WOI thresholds + lead time
/settings/outstanding-method    Tenant — Upload vs. computed mode
/settings/cost-decoder          Tenant — Vendor encoding rules
/settings/whatsapp-templates    Tenant — WhatsApp message templates
/settings/column-mappings       Tenant — Branch name → CSV value mappings
/settings/vendors               Tenant — Vendor master
/settings/branches              Tenant — Branch management
/settings/busy-sync             Tenant — Busy Web Service sync configuration

/admin/dashboard                Super Admin — Platform KPIs
/admin/tenants                  Super Admin — Tenant management (CRUD + provisioning)
/admin/plans                    Super Admin — Subscription plans
/admin/users                    Super Admin — Cross-tenant user list + password reset
/admin/announcements            Super Admin — Broadcast announcements
/admin/audit                    Super Admin — Immutable audit log
/admin/health                   Super Admin — DB + scheduler status
```

### Shared UI Components

All components are in `web/src/components/`:

| Component | Purpose |
|---|---|
| `layout/Sidebar.js` | Fixed dark sidebar: nav groups, branch selector dropdown, user avatar, logout |
| `layout/Topbar.js` | Page header: title, subtitle, optional back link, action buttons |
| `ui/DataTable.js` | MUI-style self-contained card table: title, toolbar, loading spinner, empty state, expandable rows, footer slot for pagination |
| `ui/Pagination.js` | Page prev/next with total count |
| `ui/Toast.js` | Non-blocking notification system (success/error/info) |
| `ui/AnnouncementBanner.js` | Platform-wide announcement bar at top of every page |

### Branch Context (Global State)

The sidebar contains a branch selector that changes the active branch for the entire session. This is implemented without Redux using a module-level variable pattern in `Sidebar.js`:

```js
let _activeBranch = null;  // null = all branches (consolidated)
const _listeners  = new Set();

export function getActiveBranch() { return _activeBranch; }
export function setActiveBranch(b) { _activeBranch = b; _listeners.forEach(fn => fn(b)); }
export function useActiveBranch() { /* useState + listener subscription */ }
```

Pages import `getActiveBranch()` and pass `branch_id` as a query parameter to the API when a specific branch is selected.

### CSS Architecture

All styling is in `web/src/styles/globals.css` using CSS custom properties:

```css
/* Core variables */
--accent            /* primary brand colour (indigo) */
--surface / --surface2   /* card backgrounds */
--border            /* border colour */
--text / --text2 / --text3  /* text hierarchy */

/* Semantic colours */
--red / --red-bg    /* danger / low stock */
--amber / --amber-bg  /* warning / near reorder */
--green / --green-bg  /* healthy stock */
--blue / --blue-bg    /* informational / totals */

/* Sidebar-specific */
--sb-bg / --sb-border / --sb-text / --sb-active-bg / --sb-active-text
```

---

## 7. Core Business Algorithms

### DRR (Daily Run Rate)

DRR is the primary demand signal. It blends three time windows:

```
DRR = (DRR_4w × 0.50) + (DRR_13w × 0.35) + (DRR_52w × 0.15)
```

Each window is only included if it has ≥ 14 days with actual sales data. If a window has insufficient history, weights are redistributed to available windows.

- `DRR_4w`  = total units sold in last 28 days ÷ 28
- `DRR_13w` = total units sold in last 91 days ÷ 91
- `DRR_52w` = total units sold in last 364 days ÷ 364

A seasonal variant `drr_seasonal` is also computed for SKUs with season tags (compared against same season in prior year).

### WOI (Weeks of Inventory)

```
WOI = current_stock / (DRR × 7)
```

Traffic light thresholds (configurable per tenant):

| Colour | Condition |
|---|---|
| Red | WOI < 4 weeks (default) |
| Amber | WOI < 8 weeks (default) |
| Green | WOI >= 8 weeks |

### MSL (Minimum Stock Level)

```
MSL = ceil(DRR × lead_time × 1.2)
```

Where `lead_time` is set in tenant settings (default: 14 days). The 1.2 factor is a 20% safety buffer.

Two MSL columns exist on SKUs:
- `msl_busy` — imported directly from Busy ERP
- `msl_override` — manually overridden in IIS (takes precedence if set)

### Seasonal Pre-Order Alert (5-Step Algorithm)

1. Identify SKU season tags (e.g., "Summer", "Monsoon")
2. Look up the date range of that season in the current year
3. Check if the start of the season is within the next 140 days
4. Compare current DRR against the same season in the prior year
5. If prior-year seasonal DRR shows a significant uplift, flag as pre-order alert

### Cost Decoder

Vendors often encode purchase prices to prevent buyers from knowing their markup. IIS decodes them using configurable rules:

**Step 1 — Character substitution:**
A mapping of letters/characters to digits, e.g. `{ "A": "1", "B": "2", ... }`.
The encoded string (e.g., `"ABC"`) is converted to a number (`"123"`).

**Step 2 — Math operation:**
Optional arithmetic applied to the decoded number:
- `divide` by scalar (e.g., ÷ 10 to convert paise to rupees)
- `multiply`, `add`, `subtract`

The result is stored in `skus.purchase_cost_decoded` and used for margin calculations everywhere in the system.

### Gross Margin Calculation

```
margin_pct = (revenue - cost) / revenue × 100

where:
  revenue = SUM(sales.total_value)
  cost    = SUM(sales.quantity × skus.purchase_cost_decoded)
```

---

## 8. Background Jobs & Scheduling

### APScheduler (Embedded in FastAPI)

The nightly forecast job is scheduled using **APScheduler**, which runs inside the FastAPI process. There is no separate worker process, no Redis broker, and no Celery.

APScheduler is started when the FastAPI application starts up, and the scheduled job runs automatically at the configured time.

### Nightly Forecast Job

Scheduled at **2:00 AM IST** every night (20:30 UTC):

The job:
1. Fetches all active tenants from `platform.tenants`
2. For each tenant, queries that tenant's schema
3. Runs the forecasting engine for every active SKU × branch combination
4. Writes results to `forecasting_cache`
5. Updates `computed_at` timestamp

### Manual Recomputation

Users can trigger a recompute from the UI (`POST /forecasting/recompute`). This runs synchronously for a single SKU or asynchronously (FastAPI background task) for all SKUs in the tenant.

---

## 9. File Import System

### Supported Data Types

| Type | What gets imported |
|---|---|
| `sales` | Sales transactions: SKU, branch, date, qty, value |
| `purchases` | Purchase records: SKU, branch, date, qty, value, vendor |
| `inventory` | Stock snapshots: SKU, branch, qty_on_hand, date |
| `outstanding` | Outstanding ledger entries |
| `MSL` | MSL values — updates `skus.msl_busy` |
| `urgent_skus` | Marks SKUs as `is_focus_sku = TRUE` |
| `invoices` | Invoice records linked to customers |
| `payment_receipts` | Payments linked to outstanding entries |

### Import Flow

```
1. User uploads CSV or XLSX via /imports/upload
2. API pre-scans file for "location" column values
3. If location column found: checks branch_column_maps for matching branch
4. If unmapped values found: frontend shows branch mapping UI
5. User confirms mappings (saved to branch_column_maps)
6. Import task handed off to FastAPI background task
7. import_service.py processes file row by row:
   - Validates required columns
   - Maps column names (handles Busy's column naming)
   - Inserts valid rows into the appropriate table
   - Tracks success/failure counts
8. import_batches row updated with final status + record counts
```

### Column Name Handling

Busy ERP exports use different column names than the IIS schema. `import_service.py` normalises common variants:

- `qty` / `quantity` / `Quantity` → `quantity`
- `amount` / `total_amount` / `total_value` → `total_value`
- `supplier` / `supplier_name` / `vendor_name` → `vendor_name`
- `stock` / `stock_qty` / `quantity_on_hand` → `quantity_on_hand`

---

## 10. Integrations

### Busy Web Service

Busy is an Indian accounting and inventory ERP widely used by automobile parts retailers. IIS can sync data from Busy via its Web Service API:

- **SKU master** — imports product list from Busy
- **Sales** — pulls transaction history
- **MSL** — imports minimum stock levels from Busy
- **Outstanding** — pulls ledger data

Sync configuration is managed in Settings → Busy Sync (URL, credentials, sync frequency).

### WhatsApp Business (WATI / Twilio)

WhatsApp is used for outstanding payment reminders. Configuration:

```
WHATSAPP_API_URL   = https://live-mt-server.wati.io/api/v1/sendSessionMessage
WHATSAPP_API_TOKEN = <bearer token>
```

The system supports:
- Template-based messages with variable interpolation
- Bulk sending to multiple customers
- Single targeted messages with custom body

### SMTP Email

Used for:
- Escalation alerts (when outstanding followup status = `escalation_required`)
- Tenant onboarding emails (provisioned by super admin)

Configurable via: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`

---

## 11. Settings & Configuration

All tenant-level settings are managed through the Settings section. Below is a reference:

| Setting | Location | Effect |
|---|---|---|
| Business name | General | Displayed in sidebar and reports |
| Contact email / phone | General | Used in emails |
| Lead time (days) | Inventory Targets | Used in MSL calculation |
| WOI red threshold | Inventory Targets | Below this = red alert |
| WOI amber threshold | Inventory Targets | Below this = amber alert |
| Outstanding method | Outstanding Method | direct_upload or computed from sales/purchases |
| Cost decode char map | Cost Decoder | Letter → digit substitution map |
| Cost decode math op | Cost Decoder | divide/multiply/add/subtract + scalar |
| WhatsApp templates | WhatsApp Templates | Message bodies with `{{variable}}` syntax |
| Branch column maps | Column Mappings | CSV "location" value → branch ID |
| Busy sync URL | Busy Sync | Busy Web Service API endpoint |
| Busy sync credentials | Busy Sync | Username / password / company name |

---

## 12. Deployment & Environment

### Environment Variables (`api/.env`)

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | 127.0.0.1 | PostgreSQL host |
| `DB_PORT` | 5432 | PostgreSQL port |
| `DB_USER` | admin | PostgreSQL user |
| `DB_PASSWORD` | — | PostgreSQL password |
| `DB_NAME` | iis | Database name |
| `DB_SCHEMA_PUBLIC` | platform | Platform schema name |
| `JWT_SECRET` | change_me | Access token signing secret |
| `JWT_EXPIRES_IN` | 86400 | Access token TTL (seconds) |
| `REFRESH_SECRET` | change_me_refresh | Refresh token signing secret |
| `REFRESH_EXPIRES_IN` | 604800 | Refresh token TTL (seconds) |
| `PORT` | 4000 | API port |
| `UPLOAD_DIR` | ./uploads | File upload directory |
| `SMTP_HOST` | smtp.mailtrap.io | Email SMTP host |
| `SMTP_PORT` | 2525 | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `MAIL_FROM` | noreply@iis.local | From email address |
| `WEB_ORIGIN` | http://localhost:3000 | Allowed CORS origin (web portal) |
| `WHATSAPP_API_URL` | — | WATI / Twilio endpoint |
| `WHATSAPP_API_TOKEN` | — | WhatsApp gateway auth token |

### Frontend Environment (`web/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | API base URL (e.g. http://localhost:4000) |

### Default Super Admin Credentials

Created automatically by the migration seeder:

```
Email:    admin@iis.in
Password: Admin@123
```

> **Change this immediately in production.**

---

## 13. Startup Guide

### Prerequisites

- PostgreSQL 15+
- Python 3.11+ (venv located at `api/venv/`)
- Node.js 18+

### Python Virtual Environment

> **REQUIRED:** The Python virtual environment must be activated every time you open a new terminal before running any API commands.

```bash
# macOS / Linux
source venv/bin/activate

# Windows
venv\Scripts\activate
```

Your prompt must show `(venv)` before running `python` or `uvicorn` commands.

### Step-by-Step Setup

```bash
# Terminal 1 — PostgreSQL (macOS with Homebrew)
brew services start postgresql@15

# Terminal 2 — API
cd "/Users/admin/Downloads/Personal/Inventory V2/api"
source venv/bin/activate          # REQUIRED every time

# First run only:
createdb iis                      # create the database
python db/migrate.py              # create schemas, seed super admin

# Start the API
uvicorn main:app --host 0.0.0.0 --port 4000 --reload

# Terminal 3 — Frontend
cd "/Users/admin/Downloads/Personal/Inventory V2/web"
npm run dev
```

Open: **http://localhost:3000**

### First Login

1. Open `http://localhost:3000/login`
2. Login with `admin@iis.in` / `Admin@123` — redirected to `/admin/dashboard`
3. Create a new tenant under **Tenants → New Tenant** (generates isolated PostgreSQL schema)
4. Tenant admin logs in at the same `http://localhost:3000/login` URL — redirected to `/dashboard`

### Key Files Reference

| File | Purpose |
|---|---|
| `api/main.py` | App entry point, router registration, middleware, APScheduler startup |
| `api/config/settings.py` | All environment variable bindings |
| `api/config/db.py` | asyncpg + psycopg2 pool management, %s→$n converter |
| `api/middleware/auth.py` | JWT decode + role check FastAPI dependencies |
| `api/services/forecasting_service.py` | DRR / WOI / MSL / seasonal engine |
| `api/services/import_service.py` | CSV/XLSX import with column normalisation |
| `api/services/cost_decoder_service.py` | Vendor encoding decoder |
| `api/services/provision_service.py` | New tenant schema creation |
| `api/db/migrations/001_public_schema.sql` | Platform schema DDL + super admin seed |
| `api/db/migrations/002_tenant_schema.sql` | Per-tenant schema DDL template |
| `web/src/lib/api.js` | Axios instance with JWT injection + refresh logic |
| `web/src/lib/auth.js` | localStorage helpers: getUser, getTenant, logout |
| `web/src/styles/globals.css` | All CSS variables, component styles, utilities |
| `web/src/components/ui/DataTable.js` | Reusable table/card component |
| `web/src/components/layout/Sidebar.js` | Navigation + branch context |

---

## 14. Technology Stack (Detailed)

### Backend

| Library | Version | Purpose |
|---|---|---|
| `fastapi` | 0.111.0 | Web framework — async REST API, dependency injection, OpenAPI docs |
| `uvicorn[standard]` | 0.30.1 | ASGI server — runs the FastAPI app |
| `python-dotenv` | 1.0.1 | Loads `.env` file into `os.environ` |
| `asyncpg` | 0.29.0 | Async PostgreSQL driver — used by all FastAPI route handlers |
| `psycopg2-binary` | 2.9.9 | Sync PostgreSQL driver — used by migration runner |
| `PyJWT` | 2.8.0 | Encodes and decodes JWT tokens (HS256) |
| `passlib[argon2]` | 1.7.4 | Password hashing — bcrypt/argon2 for secure password storage |
| `python-multipart` | 0.0.9 | Enables file upload parsing (`multipart/form-data`) in FastAPI |
| `apscheduler` | 3.x | Embedded scheduler — nightly forecast job (no Redis/Celery needed) |
| `openpyxl` | 3.1.5 | Read/write `.xlsx` files — Excel report generation and import parsing |
| `xlrd` | 2.0.1 | Read legacy `.xls` files (older Busy exports) |
| `aiofiles` | 23.2.1 | Async file I/O — saves uploaded files without blocking the event loop |
| `aiosmtplib` | 3.0.1 | Async SMTP client — sends emails (escalation alerts, onboarding) |
| `slowapi` | 0.1.9 | Rate limiting middleware for FastAPI (200 req/min per IP) |
| `psutil` | 5.9.8 | System resource monitoring (CPU, memory) for health checks |
| `httpx` | 0.27.0 | Async HTTP client — calls Busy Web Service API and WhatsApp gateway |

### Frontend (web/)

| Library | Version | Purpose |
|---|---|---|
| `next` | 16.1.6 | React meta-framework — App Router, SSR/SSG, file-based routing |
| `react` | 18.3.1 | UI component library |
| `react-dom` | 18.3.1 | React DOM renderer |
| `axios` | 1.7.2 | HTTP client — API calls with interceptors for JWT attach + refresh |
| `js-cookie` | 3.0.5 | Cookie utilities (available but localStorage is primary auth store) |
| `eslint` | 9.39.3 | JavaScript linter |
| `eslint-config-next` | 16.1.6 | Next.js recommended ESLint rules |

### Database & Infrastructure

| Technology | Purpose |
|---|---|
| PostgreSQL 15+ | Primary relational database. Schema-based multi-tenancy |
| No ORM | Raw SQL via asyncpg/psycopg2. `%s`→`$n` conversion handled in `config/db.py` |
| APScheduler | Embedded in FastAPI process — no external broker or worker processes needed |

---

## 15. Database Schema (Full Detail)

### Platform Schema (`platform`)

#### `plans`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | Plan identifier |
| name | VARCHAR(100) | NOT NULL | Plan name (Starter, Growth, Pro) |
| price_monthly | NUMERIC(10,2) | DEFAULT 0 | Monthly price in INR |
| price_annual | NUMERIC(10,2) | DEFAULT 0 | Annual price in INR |
| max_users | INT | NOT NULL, DEFAULT 5 | Max tenant users allowed |
| max_skus | INT | NOT NULL, DEFAULT 3000 | Max SKU count allowed |
| retention_months | INT | NOT NULL, DEFAULT 24 | Data retention period |
| feature_profitability | BOOLEAN | DEFAULT TRUE | Profitability module enabled |
| feature_whatsapp | BOOLEAN | DEFAULT TRUE | WhatsApp module enabled |
| is_active | BOOLEAN | DEFAULT TRUE | Plan availability |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

#### `tenants`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK | Tenant identifier |
| slug | VARCHAR(100) | UNIQUE, NOT NULL | URL-friendly tenant name |
| business_name | VARCHAR(255) | NOT NULL | Company name |
| contact_name | VARCHAR(100) | NOT NULL | Primary contact person |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Contact email |
| phone | VARCHAR(30) | | Contact phone |
| plan_id | UUID | FK → plans(id) | Subscription plan |
| status | VARCHAR(20) | CHECK (active/trial/suspended/churned) | Account status |
| trial_ends_at | TIMESTAMPTZ | | Trial expiry date |
| db_name | VARCHAR(100) | UNIQUE, NOT NULL | Schema name (e.g. tenant_abc123) |
| lead_time_days | INT | DEFAULT 105 | Days of lead time for reorder |
| outstanding_method | VARCHAR(20) | CHECK (direct_upload/computed) | How outstanding is tracked |
| woi_red_threshold | NUMERIC(5,2) | DEFAULT 4.0 | WOI below this = red alert |
| woi_amber_threshold | NUMERIC(5,2) | DEFAULT 8.0 | WOI below this = amber alert |
| target_woi_weeks | NUMERIC(5,2) | DEFAULT 12.0 | Target stock coverage weeks |
| busy_host | VARCHAR(200) | | Busy Web Service host |
| busy_port | INT | DEFAULT 981 | Busy Web Service port |
| busy_username | VARCHAR(100) | | Busy API username |
| busy_password_enc | TEXT | | Busy API password (encrypted) |
| busy_enabled | BOOLEAN | DEFAULT FALSE | Busy sync active |
| busy_last_sync_at | TIMESTAMPTZ | | Last successful sync timestamp |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Tenant creation timestamp |

#### `super_admin_users`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK | Admin user identifier |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Login email |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt/argon2 hash |
| name | VARCHAR(255) | | Display name |
| is_active | BOOLEAN | DEFAULT TRUE | Account active flag |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

#### `refresh_tokens`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK | Token record identifier |
| user_id | UUID | NOT NULL | References user (tenant or super admin) |
| tenant_id | UUID | | NULL for super admin tokens |
| token_hash | TEXT | NOT NULL | SHA hash of the refresh token |
| expires_at | TIMESTAMPTZ | NOT NULL | Token expiry time |
| revoked_at | TIMESTAMPTZ | | Set when token is invalidated |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Issuance timestamp |

#### `audit_log`
| Column | Type | Description |
|---|---|---|
| id | BIGSERIAL PK | Log entry identifier |
| tenant_id | UUID | Which tenant this action belongs to |
| user_id | UUID | Who performed the action |
| user_role | VARCHAR(50) | Role at time of action |
| action | VARCHAR(255) NOT NULL | Action description |
| entity | VARCHAR(100) | Affected entity type |
| entity_id | UUID | Affected entity ID |
| details | JSONB | Additional structured context |
| ip_address | VARCHAR(60) | Request IP |
| created_at | TIMESTAMPTZ | Event timestamp |

#### `announcements`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK | Announcement identifier |
| title | VARCHAR(255) | NOT NULL | Banner heading |
| body | TEXT | NOT NULL | Full announcement text |
| type | VARCHAR(20) | CHECK (info/warning/maintenance) | Visual styling type |
| target_tenant | UUID | | NULL = shown to all tenants |
| display_from | TIMESTAMPTZ | NOT NULL | When to start showing |
| display_until | TIMESTAMPTZ | NOT NULL | When to stop showing |
| created_by | UUID | | Super admin who created it |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

---

### Tenant Schema (`tenant_{id}`)

#### `users`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | User identifier |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Login email |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt/argon2 hash |
| name | VARCHAR(255) | | Display name |
| role | VARCHAR(30) | CHECK (tenant_admin/tenant_user) | Access role |
| is_active | BOOLEAN | DEFAULT TRUE | Account active flag |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| last_login_at | TIMESTAMPTZ | | Last successful login |

#### `branches`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK | Branch identifier |
| branch_code | VARCHAR(20) | UNIQUE, NOT NULL | Short code (e.g. "HQ", "MUM") |
| branch_name | VARCHAR(200) | NOT NULL | Full branch name |
| address | TEXT | | Physical address |
| is_home_branch | BOOLEAN | DEFAULT FALSE | Marks HQ / default branch |
| is_active | BOOLEAN | DEFAULT TRUE | Branch operational flag |
| source_label | VARCHAR(200) | | Original label from import file |
| auto_created | BOOLEAN | DEFAULT FALSE | Created automatically by import |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

#### `godowns`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK | Godown identifier |
| branch_id | UUID | FK → branches(id) ON DELETE CASCADE | Parent branch |
| godown_code | VARCHAR(20) | UNIQUE per branch | Short code |
| godown_name | VARCHAR(200) | NOT NULL | Storage location name |
| is_active | BOOLEAN | DEFAULT TRUE | Active flag |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

#### `skus`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK | SKU identifier |
| sku_code | VARCHAR(100) | UNIQUE, NOT NULL | Product code (from Busy/ERP) |
| sku_name | VARCHAR(500) | NOT NULL | Product description |
| brand | VARCHAR(200) | | Brand name |
| category | VARCHAR(200) | | Product category |
| unit | VARCHAR(20) | DEFAULT 'PCS' | Unit of measure |
| is_focus_sku | BOOLEAN | DEFAULT FALSE | Marked as focus/priority SKU |
| busy_item_code | VARCHAR(100) | UNIQUE WHERE NOT NULL | Busy ERP item code for sync |
| season_tags | JSONB | DEFAULT '[]' | Array of season tags e.g. ["Summer","Monsoon"] |
| purchase_cost_encoded | VARCHAR(50) | | Vendor-encoded purchase price string |
| purchase_cost_decoded | NUMERIC(12,2) | | Decoded purchase cost in INR |
| last_selling_price | NUMERIC(12,2) | | Most recent selling price |
| is_active | BOOLEAN | DEFAULT TRUE | Active in system |
| created_at / updated_at | TIMESTAMPTZ | DEFAULT NOW() | Timestamps |

#### `sku_msl` (Minimum Stock Level)
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | SERIAL | PK | Record identifier |
| sku_id | UUID | FK → skus(id) ON DELETE CASCADE | SKU reference |
| branch_id | UUID | FK → branches(id) ON DELETE CASCADE | Branch reference |
| godown_id | UUID | FK → godowns(id), nullable | NULL = branch-level MSL |
| msl | INT | NOT NULL, DEFAULT 0 | Minimum stock level units |
| updated_by | UUID | FK → users(id) | Who last updated |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update time |

*Unique constraints: one row per (sku_id, branch_id) when godown_id IS NULL; one row per (sku_id, branch_id, godown_id) when godown_id IS NOT NULL.*

#### `skus_reorder_orders`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | SERIAL | PK | Order record identifier |
| sku_id | UUID | FK → skus(id) | Ordered SKU |
| branch_id | UUID | FK → branches(id) | Ordering branch |
| godown_id | UUID | FK → godowns(id), nullable | Specific godown if applicable |
| ordered_qty | INT | NOT NULL | Quantity ordered |
| order_placed_at | TIMESTAMPTZ | DEFAULT NOW() | When order was placed |
| placed_by | UUID | FK → users(id) | User who placed order |
| use_system_lead_time | BOOLEAN | DEFAULT TRUE | Use tenant lead_time_days setting |
| expected_delivery_dt | DATE | | Expected delivery date |
| status | TEXT | CHECK (order_placed/pending_delivery/delivered/cancelled) | Order status |
| notes | TEXT | | Free text notes |

#### `sales`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | BIGSERIAL | PK | Transaction identifier |
| sku_id | UUID | NOT NULL | FK → skus(id) |
| branch_id | UUID | FK → branches(id) | Branch where sold |
| sale_date | DATE | NOT NULL | Date of sale |
| quantity | NUMERIC(12,3) | NOT NULL | Units sold |
| rate | NUMERIC(12,2) | | Unit selling price |
| total_value | NUMERIC(14,2) | | Total sale value (qty × rate) |
| customer_id | UUID | | FK → customers(id), optional |
| import_batch_id | UUID | | FK → import_batches(id) |
| busy_vch_code | BIGINT | UNIQUE with sku_id WHERE NOT NULL | Busy voucher code for dedup |
| data_ingestion_source | TEXT | CHECK (manual_upload/busy_api) | How this record arrived |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Insert timestamp |

#### `purchases`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | BIGSERIAL | PK | Transaction identifier |
| sku_id | UUID | | FK → skus(id) |
| branch_id | UUID | FK → branches(id) | Branch where purchased |
| purchase_date | DATE | NOT NULL | Date of purchase |
| quantity | NUMERIC(12,3) | NOT NULL | Units purchased |
| rate_encoded | VARCHAR(50) | | Raw encoded vendor price string |
| rate_decoded | NUMERIC(12,2) | | Decoded unit purchase price |
| total_value | NUMERIC(14,2) | | Total purchase value |
| vendor_name | VARCHAR(255) | | Supplier name |
| import_batch_id | UUID | | FK → import_batches(id) |
| busy_vch_code | BIGINT | UNIQUE with sku_id WHERE NOT NULL | Busy voucher code for dedup |
| data_ingestion_source | TEXT | CHECK (manual_upload/busy_api) | How this record arrived |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Insert timestamp |

#### `inventory_snapshots`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | BIGSERIAL | PK | Snapshot identifier |
| sku_id | UUID | NOT NULL | FK → skus(id) |
| branch_id | UUID | FK → branches(id), nullable | NULL = consolidated snapshot |
| snapshot_date | DATE | NOT NULL | Date of physical count |
| quantity_on_hand | NUMERIC(12,3) | NOT NULL, DEFAULT 0 | Counted stock quantity |
| import_batch_id | UUID | | FK → import_batches(id) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Insert timestamp |

*Unique: one consolidated row per (sku_id, snapshot_date) when branch_id IS NULL; one per (sku_id, branch_id, snapshot_date) otherwise.*

#### `customers`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK | Customer identifier |
| customer_code | VARCHAR(100) | UNIQUE | Busy customer code |
| customer_name | VARCHAR(300) | NOT NULL | Full name |
| phone | VARCHAR(20) | | Contact phone |
| whatsapp_number | VARCHAR(20) | | WhatsApp number (may differ from phone) |
| busy_account_code | VARCHAR(100) | UNIQUE WHERE NOT NULL | Busy account code for sync |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

#### `outstanding_ledger`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | BIGSERIAL | PK | Ledger entry identifier |
| customer_id | UUID | NOT NULL, FK → customers(id) | Customer reference |
| transaction_date | DATE | NOT NULL | Date of transaction |
| transaction_type | VARCHAR(20) | CHECK (invoice/payment/credit_note) | Entry type |
| amount | NUMERIC(14,2) | NOT NULL | Transaction amount in INR |
| reference_no | VARCHAR(100) | | Invoice/receipt reference number |
| import_batch_id | UUID | | FK → import_batches(id) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Insert timestamp |

#### `outstanding_followups`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | SERIAL | PK | Follow-up record identifier |
| invoice_ref | TEXT | NOT NULL | Invoice reference number |
| customer_id | UUID | FK → customers(id) | Customer reference |
| comment | TEXT | | Follow-up note/comment |
| promised_payment_dt | DATE | | Date customer promised to pay |
| snoozed_until | DATE | | Reminder suppressed until this date |
| followup_status | TEXT | CHECK (followup_pending/customer_promised/reminder_snoozed/escalation_required/auto_closed) | Current status |
| created_by | UUID | FK → users(id) | User who logged this action |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | When action was logged |

*Append-only — never UPDATE rows. Active status = most recent row per invoice_ref.*

#### `import_batches`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK | Batch identifier |
| branch_id | UUID | FK → branches(id) | Target branch for this import |
| data_type | VARCHAR(30) | CHECK (sales/purchases/inventory/outstanding/msl/urgent_skus/sales_invoices/payment_receipts) | Type of data |
| file_name | VARCHAR(300) | NOT NULL | Original filename |
| file_path | VARCHAR(500) | NOT NULL | Server storage path |
| status | VARCHAR(20) | CHECK (pending/processing/completed/failed/cancelled) | Processing status |
| records_total | INT | | Total rows in file |
| records_imported | INT | | Successfully imported rows |
| records_skipped | INT | | Skipped/duplicate rows |
| new_masters_created | INT | | New SKUs/customers auto-created |
| error_log | JSONB | | Structured error details |
| data_ingestion_source | TEXT | CHECK (manual_upload/busy_api) | Upload method |
| uploaded_by | UUID | | FK → users(id) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Upload timestamp |
| completed_at | TIMESTAMPTZ | | When processing finished |

#### `forecasting_cache`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK | Cache entry identifier |
| sku_id | UUID | NOT NULL | FK → skus(id) |
| branch_id | UUID | FK → branches(id), nullable | NULL = consolidated all-branch |
| computed_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | When last computed |
| drr_4w | NUMERIC(10,4) | | Daily Run Rate — 4-week window |
| drr_13w | NUMERIC(10,4) | | Daily Run Rate — 13-week window |
| drr_52w | NUMERIC(10,4) | | Daily Run Rate — 52-week window |
| drr_recommended | NUMERIC(10,4) | | Blended DRR used for recommendations |
| drr_seasonal | NUMERIC(10,4) | | Seasonal-adjusted DRR |
| seasonal_uplift_pct | NUMERIC(8,2) | | % uplift vs normal DRR |
| woi | NUMERIC(8,2) | | Weeks of Inventory at current DRR |
| woi_status | VARCHAR(10) | CHECK (red/amber/green) | Traffic light status |
| msl_suggested | INT | | System-suggested MSL |
| target_12w_qty | INT | | Stock needed for 12 weeks of cover |
| suggested_order_qty | INT | | Reorder suggestion = target − current |
| pre_season_alert | BOOLEAN | DEFAULT FALSE | Season approaching flag |
| latest_order_date | DATE | | Latest date to place pre-season order |
| current_stock | NUMERIC(12,3) | DEFAULT 0 | Stock at time of computation |
| last_snapshot_date | DATE | | Date of the latest snapshot used |

#### `stock_transfers`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK | Transfer identifier |
| transfer_date | DATE | NOT NULL | Date of transfer |
| sku_id | UUID | NOT NULL, FK → skus(id) | Transferred product |
| from_branch_id | UUID | NOT NULL, FK → branches(id) | Source branch |
| to_branch_id | UUID | NOT NULL, FK → branches(id) | Destination branch |
| quantity | NUMERIC(12,3) | NOT NULL, CHECK > 0 | Units transferred |
| notes | TEXT | | Optional notes |
| created_by | UUID | | FK → users(id) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Record creation time |
| busy_vch_code | BIGINT | | Busy voucher reference |

*Constraint: from_branch_id ≠ to_branch_id enforced at DB level.*

#### `vendors`
| Column | Type | Description |
|---|---|---|
| id | UUID PK | Vendor identifier |
| vendor_code | VARCHAR(50) | Short vendor code |
| vendor_name | VARCHAR(200) NOT NULL | Full vendor name |
| contact_name | VARCHAR(200) | Contact person |
| phone | VARCHAR(30) | Phone number |
| email | VARCHAR(200) | Email address |
| address | TEXT | Physical address |
| busy_account_code | VARCHAR(100) | Busy account code for sync |
| is_active | BOOLEAN DEFAULT TRUE | Active flag |
| created_at | TIMESTAMPTZ | Creation timestamp |

#### `cost_decode_formulas`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK | Formula identifier |
| char_map | JSONB | NOT NULL | Character substitution map e.g. {"A":"1","B":"2"} |
| math_operation | VARCHAR(20) | CHECK (none/divide/multiply/add/subtract) | Post-substitution math |
| math_value | NUMERIC(10,4) | | Scalar operand for the math operation |
| is_active | BOOLEAN | DEFAULT TRUE | Active formula flag |
| created_by | UUID | | FK → users(id) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

#### `whatsapp_templates`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK | Template identifier |
| template_name | VARCHAR(100) | UNIQUE, NOT NULL | Template identifier name |
| message_body | TEXT | NOT NULL | Message text with `{{variable}}` placeholders |
| is_default | BOOLEAN | DEFAULT FALSE | Default template flag |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

#### `sales_invoices`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | BIGSERIAL | PK | Invoice identifier |
| customer_id | UUID | NOT NULL, FK → customers(id) | Customer reference |
| invoice_no | VARCHAR(100) | | Invoice number |
| invoice_date | DATE | NOT NULL | Invoice date |
| due_date | DATE | | Payment due date |
| amount | NUMERIC(14,2) | NOT NULL | Invoice amount |
| import_batch_id | UUID | | FK → import_batches(id) |
| busy_vch_code | BIGINT | | Busy voucher reference |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Insert timestamp |

#### `payment_receipts`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | BIGSERIAL | PK | Receipt identifier |
| customer_id | UUID | NOT NULL, FK → customers(id) | Customer reference |
| receipt_no | VARCHAR(100) | | Receipt number |
| receipt_date | DATE | NOT NULL | Payment receipt date |
| amount | NUMERIC(14,2) | NOT NULL | Amount received |
| import_batch_id | UUID | | FK → import_batches(id) |
| busy_vch_code | BIGINT | | Busy voucher reference |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Insert timestamp |

#### `sync_log`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | SERIAL | PK | Log entry identifier |
| sync_type | TEXT | CHECK (full/delta_transactions/delta_masters) | Type of Busy sync |
| status | TEXT | CHECK (running/completed/failed) | Sync job status |
| records_fetched | INT | DEFAULT 0 | Records pulled from Busy |
| records_saved | INT | DEFAULT 0 | Records written to DB |
| error_message | TEXT | | Error details if failed |
| started_at | TIMESTAMPTZ | DEFAULT NOW() | Job start time |
| completed_at | TIMESTAMPTZ | | Job completion time |

#### `branch_column_maps`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK | Mapping identifier |
| branch_id | UUID | NOT NULL, FK → branches(id) ON DELETE CASCADE | Target branch |
| column_value | VARCHAR(300) | UNIQUE, NOT NULL | Raw value from CSV (e.g. "Showroom 1") |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

#### `import_column_mappings`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | UUID | PK | Mapping identifier |
| import_type | VARCHAR(30) | NOT NULL | Data type (sales, purchases, etc.) |
| field_name | VARCHAR(50) | NOT NULL | Canonical field name |
| aliases | JSONB | NOT NULL, DEFAULT '[]' | Array of accepted column name variants |
| created_at / updated_at | TIMESTAMPTZ | DEFAULT NOW() | Timestamps |

### Entity Relationships Summary

```
plans ──< tenants (one plan → many tenants)

[Within each tenant schema:]
branches ──< godowns           (branch → multiple storage locations)
branches ──< sales             (branch → sales records)
branches ──< purchases         (branch → purchase records)
branches ──< inventory_snapshots
branches ──< stock_transfers (from_branch_id, to_branch_id)
branches ──< import_batches
branches ──< sku_msl

skus ──< sales
skus ──< purchases
skus ──< inventory_snapshots
skus ──< stock_transfers
skus ──< sku_msl
skus ──< forecasting_cache
skus ──< skus_reorder_orders

customers ──< outstanding_ledger
customers ──< outstanding_followups
customers ──< sales_invoices
customers ──< payment_receipts

users ──< outstanding_followups (created_by)
users ──< sku_msl (updated_by)
users ──< skus_reorder_orders (placed_by)
```

---

## 16. API Reference (Request / Response Examples)

### Authentication

#### `POST /auth/login`
**Request:**
```json
{ "email": "manager@store.com", "password": "YourPassword" }
```
**Response:**
```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",
  "user": { "id": "uuid", "name": "Store Manager", "role": "tenant_admin" }
}
```

#### `POST /auth/refresh`
**Request:**
```json
{ "refresh_token": "eyJhbGci..." }
```
**Response:**
```json
{ "access_token": "eyJhbGci...", "refresh_token": "eyJhbGci..." }
```

### SKUs

#### `GET /skus?page=1&limit=50&search=brake&category=Brakes&brand=Bosch`
**Response:**
```json
{
  "data": [
    {
      "id": "uuid", "sku_code": "BRK-001", "sku_name": "Front Brake Pad",
      "brand": "Bosch", "category": "Brakes", "unit": "PCS",
      "is_focus_sku": true, "season_tags": ["Monsoon"],
      "purchase_cost_decoded": 245.50, "last_selling_price": 380.00,
      "is_active": true
    }
  ],
  "total": 842, "page": 1, "limit": 50
}
```

#### `POST /skus/bulk-tag`
**Request:**
```json
{ "sku_ids": ["uuid1", "uuid2"], "season_tags": ["Summer", "Festival"] }
```
**Response:**
```json
{ "updated": 2 }
```

### Dashboard

#### `GET /dashboard?branch_id=uuid` *(branch_id optional)*
**Response (abbreviated):**
```json
{
  "total_skus": 842, "focus_skus": 134,
  "red_skus": 47, "amber_skus": 123, "green_skus": 672,
  "mtd_sales": 2847500.00, "mtd_purchases": 1234000.00,
  "gross_margin_pct": 28.4,
  "top_skus_revenue": [...],
  "top_skus_margin": [...],
  "outstanding_aging": { "0_30": 145000, "31_60": 67000, "61_90": 23000, "90_plus": 8000 },
  "data_freshness": { "sales": "2026-03-17", "purchases": "2026-03-15", "inventory": "2026-03-10" }
}
```

### Forecasting

#### `GET /forecasting?branch_id=uuid&page=1&limit=50`
**Response:**
```json
{
  "data": [
    {
      "sku_code": "BRK-001", "sku_name": "Front Brake Pad",
      "drr_4w": 2.14, "drr_13w": 1.98, "drr_52w": 1.75, "drr_recommended": 2.04,
      "current_stock": 45, "woi": 3.1, "woi_status": "red",
      "msl_suggested": 29, "suggested_order_qty": 18,
      "computed_at": "2026-03-18T02:00:00Z"
    }
  ],
  "total": 842, "page": 1, "limit": 50
}
```
