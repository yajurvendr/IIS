# IIS — Inventory Intelligence System

A multi-tenant SaaS platform for automobile parts retailers. Tracks inventory, forecasts demand, recommends purchase orders, and decodes Busy accounting software exports.

## Architecture

| Layer | Technology | Port |
|-------|-----------|------|
| REST API | Python · FastAPI · asyncpg | 4000 |
| Tenant Portal | Next.js 14+ · App Router | 3000 |
| Admin Portal | Next.js 14+ · App Router | 3001 |
| Database | PostgreSQL · schema-based multi-tenancy | 5432 |
| Scheduler | APScheduler (embedded in API process) | — |

## Key Features

- **Multi-tenant** — each tenant gets an isolated PostgreSQL schema (`tenant_*`)
- **Demand Forecasting** — 4-week / 13-week / 52-week DRR, seasonal uplift, WOI health (Red/Amber/Green)
- **PO Advisor** — auto-calculates suggested order quantities based on DRR × 12-week horizon
- **Busy Integration** — imports CSV/XLSX exports from Busy accounting software; decodes encoded costs
- **Branch Management** — per-branch stock, MSL, forecasting, and comparison reports
- **Outstanding Ledger** — tracks customer payables with ageing buckets + automated follow-ups
- **WhatsApp Notifications** — configurable templates via WATI or custom gateway

## Quick Start

See [QUICKSTART.md](QUICKSTART.md) for step-by-step setup.

## Default Super Admin

| Email | Password | URL |
|-------|----------|-----|
| admin@iis.in | Admin@123 | http://localhost:3001 |

> Change the password immediately after first login.

## Environment Variables

Copy `api/.env.example` to `api/.env` and fill in:

| Variable | Description |
|----------|-------------|
| `DB_PASSWORD` | PostgreSQL password |
| `JWT_SECRET` | Random 32+ character string |
| `REFRESH_SECRET` | Different random 32+ character string |
| `SMTP_*` | Email credentials (use Mailtrap for dev) |
| `WHATSAPP_API_URL` | Optional — leave blank to disable |

## Database

- Single PostgreSQL database: `iis`
- `platform` schema — shared tables (tenants, plans, super admin, audit log)
- `tenant_{short_id}` schema — per-tenant (users, SKUs, sales, inventory, etc.)
- Run `python db/migrate.py` to initialize and apply all migrations

## Nightly Scheduler

The API embeds APScheduler — no separate process needed:

| Time (IST) | Job |
|------------|-----|
| 02:00 | Nightly forecasting (all tenants) |
| 03:00 | Reorder delivery check |
| 03:15 | Outstanding auto-close |
| 03:30 | Missed payment alerts |
| 03:45 | Snooze expiry cleanup |
