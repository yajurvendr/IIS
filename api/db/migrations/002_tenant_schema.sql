-- IIS Tenant Schema — PostgreSQL
-- Executed per-tenant; {schema} placeholder is replaced by provision_service.py.
-- Uses the 'iis' database with schema isolation.

-- schema is pre-created by provision_service before running this file.
SET search_path TO {schema};

CREATE TABLE IF NOT EXISTS users (
  id            UUID          NOT NULL DEFAULT gen_random_uuid(),
  email         VARCHAR(255)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  name          VARCHAR(255),
  role          VARCHAR(30)   NOT NULL DEFAULT 'tenant_user'
                  CHECK (role IN ('tenant_admin','tenant_user')),
  is_active     BOOLEAN       DEFAULT TRUE,
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  PRIMARY KEY (id),
  UNIQUE (email)
);

-- ─── Branches ────────────────────────────────────────────────────────────────
-- Must be created before tables that reference it (sales, purchases, etc.)
CREATE TABLE IF NOT EXISTS branches (
  id              UUID          NOT NULL DEFAULT gen_random_uuid(),
  branch_code     VARCHAR(20)   NOT NULL,
  branch_name     VARCHAR(200)  NOT NULL,
  address         TEXT,
  is_home_branch  BOOLEAN       DEFAULT FALSE,
  is_active       BOOLEAN       DEFAULT TRUE,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (branch_code)
);
CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(is_active);

-- ─── Godowns ──────────────────────────────────────────────────────────────────
-- Physical storage locations within a branch (e.g. "Front Rack", "Cold Store").
-- godown_id is optional in sku_msl and reorder — NULL means branch-level only.
CREATE TABLE IF NOT EXISTS godowns (
  id           UUID          NOT NULL DEFAULT gen_random_uuid(),
  branch_id    UUID          NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  godown_code  VARCHAR(20)   NOT NULL,
  godown_name  VARCHAR(200)  NOT NULL,
  is_active    BOOLEAN       DEFAULT TRUE,
  created_at   TIMESTAMPTZ   DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (branch_id, godown_code)
);
CREATE INDEX IF NOT EXISTS idx_godowns_branch ON godowns(branch_id);

CREATE TABLE IF NOT EXISTS skus (
  id                    UUID           NOT NULL DEFAULT gen_random_uuid(),
  sku_code              VARCHAR(100)   NOT NULL,
  sku_name              VARCHAR(500)   NOT NULL,
  brand                 VARCHAR(200),
  category              VARCHAR(200),
  unit                  VARCHAR(20)    DEFAULT 'PCS',
  is_focus_sku          BOOLEAN        DEFAULT FALSE,
  busy_item_code        VARCHAR(100),
  season_tags           JSONB          DEFAULT '[]'::JSONB,
  purchase_cost_encoded VARCHAR(50),
  purchase_cost_decoded NUMERIC(12,2),
  last_selling_price    NUMERIC(12,2),
  is_active             BOOLEAN        DEFAULT TRUE,
  created_at            TIMESTAMPTZ    DEFAULT NOW(),
  updated_at            TIMESTAMPTZ    DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (sku_code)
);
CREATE INDEX IF NOT EXISTS idx_skus_sku_code ON skus(sku_code);

-- ─── SKU MSL (Minimum Stock Level) ──────────────────────────────────────────
-- MSL is now stored at SKU + Branch + Godown granularity (Note v2 §1).
-- Old skus.msl_busy and skus.msl_override columns are deprecated (dropped below).
-- LOOKUP RULE: SELECT msl FROM sku_msl WHERE sku_id=X AND branch_id=Y AND godown_id=Z.
-- If no row → msl=0 (excluded from alerts). msl=0 → excluded.
CREATE TABLE IF NOT EXISTS sku_msl (
  id          SERIAL        PRIMARY KEY,
  sku_id      UUID          NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  branch_id   UUID          NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  godown_id   UUID          REFERENCES godowns(id) ON DELETE CASCADE,
  msl         INT           NOT NULL DEFAULT 0,
  updated_by  UUID          REFERENCES users(id),
  updated_at  TIMESTAMPTZ   DEFAULT NOW()
);
-- Partial unique indexes handle NULL godown_id correctly in PostgreSQL
CREATE UNIQUE INDEX IF NOT EXISTS idx_sku_msl_no_godown
  ON sku_msl(sku_id, branch_id) WHERE godown_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sku_msl_with_godown
  ON sku_msl(sku_id, branch_id, godown_id) WHERE godown_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sku_msl_sku    ON sku_msl(sku_id);
CREATE INDEX IF NOT EXISTS idx_sku_msl_branch ON sku_msl(branch_id);

-- ─── Reorder Orders ──────────────────────────────────────────────────────────
-- Tracks "Order Placed" actions from the /reorder screen (Note v2 §2.4).
-- Once an order is placed, daily reorder alerts are suppressed for that
-- SKU+Branch+Godown until delivered or cancelled.
CREATE TABLE IF NOT EXISTS skus_reorder_orders (
  id                   SERIAL        PRIMARY KEY,
  sku_id               UUID          NOT NULL REFERENCES skus(id),
  branch_id            UUID          NOT NULL REFERENCES branches(id),
  godown_id            UUID          REFERENCES godowns(id),
  ordered_qty          INT           NOT NULL,
  order_placed_at      TIMESTAMPTZ   DEFAULT NOW(),
  placed_by            UUID          REFERENCES users(id),
  use_system_lead_time BOOLEAN       DEFAULT TRUE,
  expected_delivery_dt DATE,
  status               TEXT          NOT NULL DEFAULT 'order_placed'
                         CHECK (status IN ('order_placed','pending_delivery','delivered','cancelled')),
  notes                TEXT,
  created_at           TIMESTAMPTZ   DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sro_sku        ON skus_reorder_orders(sku_id);
CREATE INDEX IF NOT EXISTS idx_sro_branch     ON skus_reorder_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_sro_status     ON skus_reorder_orders(status);
CREATE INDEX IF NOT EXISTS idx_sro_delivery   ON skus_reorder_orders(expected_delivery_dt);

CREATE TABLE IF NOT EXISTS sales (
  id              BIGSERIAL     PRIMARY KEY,
  sku_id          UUID          NOT NULL,
  branch_id       UUID          REFERENCES branches(id),
  sale_date       DATE          NOT NULL,
  quantity        NUMERIC(12,3) NOT NULL,
  rate            NUMERIC(12,2),
  total_value     NUMERIC(14,2),
  customer_id     UUID,
  import_batch_id UUID,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sales_sku_date    ON sales(sku_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date   ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_branch      ON sales(branch_id);

CREATE TABLE IF NOT EXISTS purchases (
  id              BIGSERIAL     PRIMARY KEY,
  sku_id          UUID,
  branch_id       UUID          REFERENCES branches(id),
  purchase_date   DATE          NOT NULL,
  quantity        NUMERIC(12,3) NOT NULL,
  rate_encoded    VARCHAR(50),
  rate_decoded    NUMERIC(12,2),
  total_value     NUMERIC(14,2),
  vendor_name     VARCHAR(255),
  import_batch_id UUID,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchases_sku_date ON purchases(sku_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchases_branch   ON purchases(branch_id);

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id               BIGSERIAL     PRIMARY KEY,
  sku_id           UUID          NOT NULL,
  branch_id        UUID          REFERENCES branches(id),
  snapshot_date    DATE          NOT NULL,
  quantity_on_hand NUMERIC(12,3) NOT NULL DEFAULT 0,
  import_batch_id  UUID,
  created_at       TIMESTAMPTZ   DEFAULT NOW()
  -- Uniqueness enforced by partial indexes below (handles NULL branch_id correctly)
);
-- One consolidated snapshot per SKU per date (branch_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_snap_sku_date_consolidated
  ON inventory_snapshots(sku_id, snapshot_date) WHERE branch_id IS NULL;
-- One per-branch snapshot per SKU per date per branch
CREATE UNIQUE INDEX IF NOT EXISTS idx_snap_sku_branch_date
  ON inventory_snapshots(sku_id, branch_id, snapshot_date) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_snap_date   ON inventory_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_snap_branch ON inventory_snapshots(branch_id);

CREATE TABLE IF NOT EXISTS customers (
  id               UUID          NOT NULL DEFAULT gen_random_uuid(),
  customer_code    VARCHAR(100),
  customer_name    VARCHAR(300)  NOT NULL,
  phone            VARCHAR(20),
  whatsapp_number  VARCHAR(20),
  created_at       TIMESTAMPTZ   DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (customer_code)
);

CREATE TABLE IF NOT EXISTS outstanding_ledger (
  id               BIGSERIAL     PRIMARY KEY,
  customer_id      UUID          NOT NULL,
  transaction_date DATE          NOT NULL,
  transaction_type VARCHAR(20)   NOT NULL
                     CHECK (transaction_type IN ('invoice','payment','credit_note')),
  amount           NUMERIC(14,2) NOT NULL,
  reference_no     VARCHAR(100),
  import_batch_id  UUID,
  created_at       TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ol_customer ON outstanding_ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_ol_date     ON outstanding_ledger(transaction_date);

-- ─── Outstanding Follow-ups ───────────────────────────────────────────────────
-- Append-only audit trail of follow-up actions per invoice (Note v2 §3).
-- Active status = most recent row per invoice_ref.
-- NEVER UPDATE existing rows — always INSERT a new row for each action.
CREATE TABLE IF NOT EXISTS outstanding_followups (
  id                  SERIAL        PRIMARY KEY,
  invoice_ref         TEXT          NOT NULL,
  customer_id         UUID          REFERENCES customers(id),
  comment             TEXT,
  promised_payment_dt DATE,
  snoozed_until       DATE,
  followup_status     TEXT          NOT NULL DEFAULT 'followup_pending'
                        CHECK (followup_status IN (
                          'followup_pending','customer_promised',
                          'reminder_snoozed','escalation_required','auto_closed'
                        )),
  created_by          UUID          REFERENCES users(id),
  created_at          TIMESTAMPTZ   DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_of_invoice_ref ON outstanding_followups(invoice_ref);
CREATE INDEX IF NOT EXISTS idx_of_customer    ON outstanding_followups(customer_id);
CREATE INDEX IF NOT EXISTS idx_of_status      ON outstanding_followups(followup_status);
CREATE INDEX IF NOT EXISTS idx_of_created     ON outstanding_followups(created_at);

CREATE TABLE IF NOT EXISTS import_batches (
  id               UUID         NOT NULL DEFAULT gen_random_uuid(),
  branch_id        UUID         REFERENCES branches(id),
  data_type        VARCHAR(30)  NOT NULL
                     CHECK (data_type IN ('sales','purchases','inventory','outstanding','msl','urgent_skus',
                                          'sales_invoices','payment_receipts')),
  file_name        VARCHAR(300) NOT NULL,
  file_path        VARCHAR(500) NOT NULL,
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  records_total    INT,
  records_imported INT,
  records_skipped  INT,
  new_masters_created INT,
  error_log        JSONB,
  import_notes     TEXT,
  uploaded_by      UUID,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_ib_status   ON import_batches(status);
CREATE INDEX IF NOT EXISTS idx_ib_created  ON import_batches(created_at);
CREATE INDEX IF NOT EXISTS idx_ib_branch   ON import_batches(branch_id);

CREATE TABLE IF NOT EXISTS cost_decode_formulas (
  id             UUID         NOT NULL DEFAULT gen_random_uuid(),
  char_map       JSONB        NOT NULL,
  math_operation VARCHAR(20)  NOT NULL DEFAULT 'none'
                   CHECK (math_operation IN ('none','divide','multiply','add','subtract')),
  math_value     NUMERIC(10,4),
  is_active      BOOLEAN      DEFAULT TRUE,
  created_by     UUID,
  created_at     TIMESTAMPTZ  DEFAULT NOW(),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_cdf_active ON cost_decode_formulas(is_active);

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id            UUID         NOT NULL DEFAULT gen_random_uuid(),
  template_name VARCHAR(100) NOT NULL,
  message_body  TEXT         NOT NULL,
  is_default    BOOLEAN      DEFAULT FALSE,
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (template_name)
);

-- ─── Forecasting Cache ───────────────────────────────────────────────────────
-- branch_id = NULL means consolidated (all branches aggregated).
-- Per-branch rows have branch_id set to a specific branch.
CREATE TABLE IF NOT EXISTS forecasting_cache (
  id                  UUID           NOT NULL DEFAULT gen_random_uuid(),
  sku_id              UUID           NOT NULL,
  branch_id           UUID           REFERENCES branches(id),
  computed_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  drr_4w              NUMERIC(10,4),
  drr_13w             NUMERIC(10,4),
  drr_52w             NUMERIC(10,4),
  drr_recommended     NUMERIC(10,4),
  drr_seasonal        NUMERIC(10,4),
  seasonal_uplift_pct NUMERIC(8,2),
  woi                 NUMERIC(8,2),
  woi_status          VARCHAR(10)    DEFAULT 'green'
                        CHECK (woi_status IN ('red','amber','green')),
  msl_suggested       INT,
  target_12w_qty      INT,
  suggested_order_qty INT,
  pre_season_alert    BOOLEAN        DEFAULT FALSE,
  latest_order_date   DATE,
  current_stock       NUMERIC(12,3)  DEFAULT 0,
  last_snapshot_date  DATE,
  PRIMARY KEY (id)
);
-- One consolidated row per SKU (branch_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fc_sku_consolidated
  ON forecasting_cache(sku_id) WHERE branch_id IS NULL;
-- One per-branch row per SKU + branch combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_fc_sku_branch
  ON forecasting_cache(sku_id, branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fc_woi_status ON forecasting_cache(woi_status);
CREATE INDEX IF NOT EXISTS idx_fc_branch     ON forecasting_cache(branch_id);

-- ─── Sales Invoices (for computed outstanding method) ────────────────────────
-- Imported from Busy sales invoice export. Paired with payment_receipts to
-- derive customer outstanding without a manual ledger upload.
CREATE TABLE IF NOT EXISTS sales_invoices (
  id               BIGSERIAL     PRIMARY KEY,
  customer_id      UUID          NOT NULL REFERENCES customers(id),
  invoice_no       VARCHAR(100),
  invoice_date     DATE          NOT NULL,
  due_date         DATE,
  amount           NUMERIC(14,2) NOT NULL,
  import_batch_id  UUID,
  created_at       TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_si_customer    ON sales_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_si_date        ON sales_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_si_invoice_no  ON sales_invoices(invoice_no);

-- ─── Payment Receipts (for computed outstanding method) ───────────────────────
-- Imported from Busy receipts export. Represents payments received against invoices.
CREATE TABLE IF NOT EXISTS payment_receipts (
  id               BIGSERIAL     PRIMARY KEY,
  customer_id      UUID          NOT NULL REFERENCES customers(id),
  receipt_no       VARCHAR(100),
  receipt_date     DATE          NOT NULL,
  amount           NUMERIC(14,2) NOT NULL,
  import_batch_id  UUID,
  created_at       TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pr_customer    ON payment_receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_pr_date        ON payment_receipts(receipt_date);

-- ─── Stock Transfers ─────────────────────────────────────────────────────────
-- Records inter-branch stock movements. Does NOT mutate inventory_snapshots.
-- Effective stock = snapshot + purchases_since - sales_since + transfers_in - transfers_out
CREATE TABLE IF NOT EXISTS stock_transfers (
  id             UUID           NOT NULL DEFAULT gen_random_uuid(),
  transfer_date  DATE           NOT NULL,
  sku_id         UUID           NOT NULL REFERENCES skus(id),
  from_branch_id UUID           NOT NULL REFERENCES branches(id),
  to_branch_id   UUID           NOT NULL REFERENCES branches(id),
  quantity       NUMERIC(12,3)  NOT NULL CHECK (quantity > 0),
  notes          TEXT,
  created_by     UUID,
  created_at     TIMESTAMPTZ    DEFAULT NOW(),
  PRIMARY KEY (id),
  CONSTRAINT chk_different_branches CHECK (from_branch_id <> to_branch_id)
);
CREATE INDEX IF NOT EXISTS idx_st_date         ON stock_transfers(transfer_date);
CREATE INDEX IF NOT EXISTS idx_st_sku          ON stock_transfers(sku_id);
CREATE INDEX IF NOT EXISTS idx_st_from_branch  ON stock_transfers(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_st_to_branch    ON stock_transfers(to_branch_id);

-- ─── Vendors ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id           UUID          NOT NULL DEFAULT gen_random_uuid(),
  vendor_code  VARCHAR(50),
  vendor_name  VARCHAR(200)  NOT NULL,
  contact_name VARCHAR(200),
  phone        VARCHAR(30),
  email        VARCHAR(200),
  address      TEXT,
  is_active    BOOLEAN       DEFAULT TRUE,
  created_at   TIMESTAMPTZ   DEFAULT NOW(),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_vendors_name   ON vendors(vendor_name);
CREATE INDEX IF NOT EXISTS idx_vendors_active ON vendors(is_active);

-- ─── Import Column Mappings ───────────────────────────────────────────────────
-- Stores tenant-specific column alias overrides per import type + field.
CREATE TABLE IF NOT EXISTS import_column_mappings (
  id          UUID         NOT NULL DEFAULT gen_random_uuid(),
  import_type VARCHAR(30)  NOT NULL,
  field_name  VARCHAR(50)  NOT NULL,
  aliases     JSONB        NOT NULL DEFAULT '[]'::JSONB,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (import_type, field_name)
);
CREATE INDEX IF NOT EXISTS idx_icm_type ON import_column_mappings(import_type);

-- ─── branch_column_maps ───────────────────────────────────────────────────────
-- Maps raw location strings from import files (e.g. "Showroom 1") to branch IDs.
-- Used by the branch auto-detection import flow (SRS §4.3.3).
CREATE TABLE IF NOT EXISTS branch_column_maps (
  id           UUID          NOT NULL DEFAULT gen_random_uuid(),
  branch_id    UUID          NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  column_value VARCHAR(300)  NOT NULL,
  created_at   TIMESTAMPTZ   DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (column_value)
);
CREATE INDEX IF NOT EXISTS idx_bcm_branch ON branch_column_maps(branch_id);

-- ─── Alter existing tenant schemas (safe to re-run) ─────────────────────────
-- These statements are skipped for fresh schemas (columns already exist).
-- Run manually against existing tenant schemas after upgrading this file.
ALTER TABLE sales              ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE purchases          ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE inventory_snapshots ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE import_batches     ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE forecasting_cache  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
-- Drop old single-column unique on forecasting_cache and rely on partial indexes above
ALTER TABLE forecasting_cache  DROP CONSTRAINT IF EXISTS forecasting_cache_sku_id_key;
-- Branch auto-detection columns (migration 003)
ALTER TABLE branches ADD COLUMN IF NOT EXISTS source_label VARCHAR(200);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS auto_created BOOLEAN NOT NULL DEFAULT FALSE;

-- Migration 004: allow 'cancelled' status + new data_types on import_batches
ALTER TABLE import_batches DROP CONSTRAINT IF EXISTS import_batches_status_check;
ALTER TABLE import_batches ADD CONSTRAINT import_batches_status_check
  CHECK (status IN ('pending','processing','completed','failed','cancelled'));
ALTER TABLE import_batches DROP CONSTRAINT IF EXISTS import_batches_data_type_check;
ALTER TABLE import_batches ADD CONSTRAINT import_batches_data_type_check
  CHECK (data_type IN ('sales','purchases','inventory','outstanding','msl','urgent_skus',
                       'sales_invoices','payment_receipts'));

-- Migration 004: sales_invoices + payment_receipts tables (for computed outstanding)
CREATE TABLE IF NOT EXISTS sales_invoices (
  id               BIGSERIAL     PRIMARY KEY,
  customer_id      UUID          NOT NULL REFERENCES customers(id),
  invoice_no       VARCHAR(100),
  invoice_date     DATE          NOT NULL,
  due_date         DATE,
  amount           NUMERIC(14,2) NOT NULL,
  import_batch_id  UUID,
  created_at       TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_si_customer   ON sales_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_si_date       ON sales_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_si_invoice_no ON sales_invoices(invoice_no);

CREATE TABLE IF NOT EXISTS payment_receipts (
  id               BIGSERIAL     PRIMARY KEY,
  customer_id      UUID          NOT NULL REFERENCES customers(id),
  receipt_no       VARCHAR(100),
  receipt_date     DATE          NOT NULL,
  amount           NUMERIC(14,2) NOT NULL,
  import_batch_id  UUID,
  created_at       TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pr_customer ON payment_receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_pr_date     ON payment_receipts(receipt_date);

-- Migration 004: fix inventory_snapshots uniqueness for NULL branch_id
ALTER TABLE inventory_snapshots DROP CONSTRAINT IF EXISTS inventory_snapshots_sku_id_branch_id_snapshot_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_snap_sku_date_consolidated
  ON inventory_snapshots(sku_id, snapshot_date) WHERE branch_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_snap_sku_branch_date
  ON inventory_snapshots(sku_id, branch_id, snapshot_date) WHERE branch_id IS NOT NULL;

-- ─── Migration 005: Note v2 breaking changes + Busy Web Service sync ──────────

-- 1. Seed sku_msl from old msl columns BEFORE dropping them.
--    Wrapped in a DO block so it only runs when the old columns exist.
--    Uses home branch + NULL godown. Safe to re-run (ON CONFLICT DO NOTHING).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='skus' AND column_name='msl_busy'
  ) THEN
    INSERT INTO sku_msl (sku_id, branch_id, godown_id, msl, updated_at)
    SELECT s.id, b.id, NULL, COALESCE(s.msl_override, s.msl_busy, 0), NOW()
    FROM skus s
    CROSS JOIN (SELECT id FROM branches WHERE is_home_branch = TRUE LIMIT 1) b
    WHERE COALESCE(s.msl_override, s.msl_busy, 0) > 0
    ON CONFLICT DO NOTHING;
  END IF;
END$$;

-- 2. Drop deprecated MSL columns from skus (replaced by sku_msl table)
ALTER TABLE skus DROP COLUMN IF EXISTS msl_busy;
ALTER TABLE skus DROP COLUMN IF EXISTS msl_override;

-- 3. Add busy_item_code to skus (unique Busy item identifier for sync)
ALTER TABLE skus ADD COLUMN IF NOT EXISTS busy_item_code VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_skus_busy_item_code ON skus(busy_item_code) WHERE busy_item_code IS NOT NULL;

-- 4. Add busy_account_code to customers and vendors
ALTER TABLE customers ADD COLUMN IF NOT EXISTS busy_account_code VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_busy_code ON customers(busy_account_code) WHERE busy_account_code IS NOT NULL;

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS busy_account_code VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_busy_code ON vendors(busy_account_code) WHERE busy_account_code IS NOT NULL;

-- 5. Add busy_vch_code to transactional tables
ALTER TABLE sales              ADD COLUMN IF NOT EXISTS busy_vch_code BIGINT;
ALTER TABLE purchases          ADD COLUMN IF NOT EXISTS busy_vch_code BIGINT;
ALTER TABLE sales_invoices     ADD COLUMN IF NOT EXISTS busy_vch_code BIGINT;
ALTER TABLE payment_receipts   ADD COLUMN IF NOT EXISTS busy_vch_code BIGINT;
ALTER TABLE stock_transfers    ADD COLUMN IF NOT EXISTS busy_vch_code BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_busy_vch      ON sales(busy_vch_code) WHERE busy_vch_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_busy_vch  ON purchases(busy_vch_code) WHERE busy_vch_code IS NOT NULL;

-- 6. Add data_ingestion_source to import_batches
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS data_ingestion_source TEXT DEFAULT 'manual_upload'
  CHECK (data_ingestion_source IN ('manual_upload','busy_api'));

-- 7. Sync log — tracks each Busy sync job per tenant schema
CREATE TABLE IF NOT EXISTS sync_log (
  id              SERIAL        PRIMARY KEY,
  sync_type       TEXT          NOT NULL
                    CHECK (sync_type IN ('full','delta_transactions','delta_masters')),
  status          TEXT          NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running','completed','failed')),
  records_fetched INT           DEFAULT 0,
  records_saved   INT           DEFAULT 0,
  error_message   TEXT,
  started_at      TIMESTAMPTZ   DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sync_log_type   ON sync_log(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_log_status ON sync_log(status);
CREATE INDEX IF NOT EXISTS idx_sync_log_start  ON sync_log(started_at);

-- ════════════════════════════════════════════════════════════════════════════
-- Migration 006 — Fix busy_vch_code unique constraints for multi-line vouchers
-- A single BUSY voucher (VchCode) contains multiple item lines.
-- The old single-column unique index would prevent storing >1 item per voucher.
-- Replace with composite (busy_vch_code, sku_id) partial unique index.
-- ════════════════════════════════════════════════════════════════════════════
DROP INDEX IF EXISTS idx_sales_busy_vch;
DROP INDEX IF EXISTS idx_purchases_busy_vch;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_busy_vch_sku
    ON sales(busy_vch_code, sku_id) WHERE busy_vch_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_busy_vch_sku
    ON purchases(busy_vch_code, sku_id) WHERE busy_vch_code IS NOT NULL;

-- Also add data_ingestion_source to sales and purchases
-- (was only added to import_batches in Migration 005)
ALTER TABLE sales      ADD COLUMN IF NOT EXISTS data_ingestion_source TEXT DEFAULT 'manual_upload'
    CHECK (data_ingestion_source IN ('manual_upload','busy_api'));
ALTER TABLE purchases  ADD COLUMN IF NOT EXISTS data_ingestion_source TEXT DEFAULT 'manual_upload'
    CHECK (data_ingestion_source IN ('manual_upload','busy_api'));
