-- IIS Public Schema — shared tables (PostgreSQL)
-- Run once; creates the 'platform' schema inside the 'iis' database.

CREATE SCHEMA IF NOT EXISTS platform;
SET search_path TO platform;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS plans (
  id               UUID           NOT NULL DEFAULT gen_random_uuid(),
  name             VARCHAR(100)   NOT NULL,
  price_monthly    NUMERIC(10,2)  DEFAULT 0,
  price_annual     NUMERIC(10,2)  DEFAULT 0,
  max_users        INT            NOT NULL DEFAULT 5,
  max_skus         INT            NOT NULL DEFAULT 3000,
  retention_months INT            NOT NULL DEFAULT 24,
  feature_profitability  BOOLEAN  DEFAULT TRUE,
  feature_whatsapp       BOOLEAN  DEFAULT TRUE,
  is_active        BOOLEAN        DEFAULT TRUE,
  created_at       TIMESTAMPTZ    DEFAULT NOW(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS tenants (
  id             UUID          NOT NULL DEFAULT gen_random_uuid(),
  slug           VARCHAR(100)  NOT NULL,
  business_name  VARCHAR(255)  NOT NULL,
  contact_name   VARCHAR(100)  NOT NULL,
  email          VARCHAR(255)  NOT NULL,
  phone          VARCHAR(30),
  plan_id        UUID,
  status         VARCHAR(20)   NOT NULL DEFAULT 'trial'
                   CHECK (status IN ('active','trial','suspended','churned')),
  trial_ends_at  TIMESTAMPTZ,
  db_name        VARCHAR(100)  NOT NULL,
  lead_time_days INT           DEFAULT 105,
  country_code   VARCHAR(10)   DEFAULT '91',
  created_at     TIMESTAMPTZ   DEFAULT NOW(),
  last_login_at  TIMESTAMPTZ,
  PRIMARY KEY (id),
  UNIQUE (slug),
  UNIQUE (email),
  UNIQUE (db_name),
  CONSTRAINT fk_tenant_plan FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS super_admin_users (
  id            UUID          NOT NULL DEFAULT gen_random_uuid(),
  email         VARCHAR(255)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  name          VARCHAR(255),
  is_active     BOOLEAN       DEFAULT TRUE,
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID         NOT NULL DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL,
  tenant_id   UUID,
  token_hash  TEXT         NOT NULL,
  expires_at  TIMESTAMPTZ  NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_rt_user  ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_rt_token ON refresh_tokens(token_hash);

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL    PRIMARY KEY,
  tenant_id   UUID,
  user_id     UUID,
  user_role   VARCHAR(50),
  action      VARCHAR(255) NOT NULL,
  entity      VARCHAR(100),
  entity_id   UUID,
  details     JSONB,
  ip_address  VARCHAR(60),
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_al_tenant  ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_al_created ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS announcements (
  id             UUID         NOT NULL DEFAULT gen_random_uuid(),
  title          VARCHAR(255) NOT NULL,
  body           TEXT         NOT NULL,
  type           VARCHAR(20)  NOT NULL DEFAULT 'info'
                   CHECK (type IN ('info','warning','maintenance')),
  target_tenant  UUID,
  display_from   TIMESTAMPTZ  NOT NULL,
  display_until  TIMESTAMPTZ  NOT NULL,
  created_by     UUID,
  created_at     TIMESTAMPTZ  DEFAULT NOW(),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_ann_active ON announcements(display_from, display_until);

-- ── Seed default plans ─────────────────────────────────────────────────────────
INSERT INTO plans (id, name, price_monthly, price_annual, max_users, max_skus, retention_months)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Starter', 2999.00, 29999.00, 3, 1000, 12),
  ('a0000000-0000-0000-0000-000000000002', 'Growth',  5999.00, 59999.00, 8, 5000, 24),
  ('a0000000-0000-0000-0000-000000000003', 'Pro',     9999.00, 99999.00, 20, 20000, 36)
ON CONFLICT (id) DO NOTHING;

-- Super admin seed is handled by migrate.py (bcrypt hash generated at migration time)
