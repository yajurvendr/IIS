-- Migration 003: per-tenant Busy sync schedule configuration
-- Run once: python db/migrate.py (migrate.py will be updated to run this file too)

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS busy_transactions_hour    SMALLINT NOT NULL DEFAULT 23,
  ADD COLUMN IF NOT EXISTS busy_transactions_minute  SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS busy_masters_hour         SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS busy_masters_minute       SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS busy_masters_day          VARCHAR(10) NOT NULL DEFAULT 'sun';
