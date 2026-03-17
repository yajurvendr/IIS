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

CREATE TABLE IF NOT EXISTS skus (
  id                    UUID           NOT NULL DEFAULT gen_random_uuid(),
  sku_code              VARCHAR(100)   NOT NULL,
  sku_name              VARCHAR(500)   NOT NULL,
  brand                 VARCHAR(200),
  category              VARCHAR(200),
  unit                  VARCHAR(20)    DEFAULT 'PCS',
  is_focus_sku          BOOLEAN        DEFAULT FALSE,
  msl_busy              INT,
  msl_override          INT,
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

CREATE TABLE IF NOT EXISTS sales (
  id              BIGSERIAL     PRIMARY KEY,
  sku_id          UUID          NOT NULL,
  sale_date       DATE          NOT NULL,
  quantity        NUMERIC(12,3) NOT NULL,
  rate            NUMERIC(12,2),
  total_value     NUMERIC(14,2),
  customer_id     UUID,
  import_batch_id UUID,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sales_sku_date  ON sales(sku_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);

CREATE TABLE IF NOT EXISTS purchases (
  id              BIGSERIAL     PRIMARY KEY,
  sku_id          UUID,
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

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id               BIGSERIAL     PRIMARY KEY,
  sku_id           UUID          NOT NULL,
  snapshot_date    DATE          NOT NULL,
  quantity_on_hand NUMERIC(12,3) NOT NULL DEFAULT 0,
  import_batch_id  UUID,
  created_at       TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE (sku_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_snap_date ON inventory_snapshots(snapshot_date);

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

CREATE TABLE IF NOT EXISTS import_batches (
  id               UUID         NOT NULL DEFAULT gen_random_uuid(),
  data_type        VARCHAR(30)  NOT NULL
                     CHECK (data_type IN ('sales','purchases','inventory','outstanding','msl','urgent_skus')),
  file_name        VARCHAR(300) NOT NULL,
  file_path        VARCHAR(500) NOT NULL,
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','processing','completed','failed')),
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
CREATE INDEX IF NOT EXISTS idx_ib_status  ON import_batches(status);
CREATE INDEX IF NOT EXISTS idx_ib_created ON import_batches(created_at);

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

CREATE TABLE IF NOT EXISTS forecasting_cache (
  id                  UUID           NOT NULL DEFAULT gen_random_uuid(),
  sku_id              UUID           NOT NULL,
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
  PRIMARY KEY (id),
  UNIQUE (sku_id)
);
CREATE INDEX IF NOT EXISTS idx_fc_woi_status ON forecasting_cache(woi_status);
