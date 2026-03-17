-- Migration 004: Performance indexes on tenant schema tables
-- Applied per-tenant by migrate.py after iterating platform.tenants
-- Safe to re-run: CREATE INDEX IF NOT EXISTS

CREATE INDEX IF NOT EXISTS idx_fc_sku_branch      ON forecasting_cache(sku_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_sku_date      ON sales(sku_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_sku_date        ON inventory_snapshots(sku_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_sku_date  ON purchases(sku_id, purchase_date DESC);
