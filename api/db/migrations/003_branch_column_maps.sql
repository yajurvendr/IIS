-- Migration 003: Branch auto-detection support
-- Adds source_label + auto_created to branches, and creates branch_column_maps table.
-- Safe to re-run (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- Add auto-detection columns to branches
ALTER TABLE branches ADD COLUMN IF NOT EXISTS source_label VARCHAR(200);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS auto_created BOOLEAN NOT NULL DEFAULT FALSE;

-- branch_column_maps: maps raw location strings (from import files) to branch IDs.
-- e.g. "Showroom 1" → branch UUID, so future imports auto-assign rows to the right branch.
CREATE TABLE IF NOT EXISTS branch_column_maps (
  id           UUID          NOT NULL DEFAULT gen_random_uuid(),
  branch_id    UUID          NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  column_value VARCHAR(300)  NOT NULL,   -- exact string as it appears in the import file
  created_at   TIMESTAMPTZ   DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (column_value)
);
CREATE INDEX IF NOT EXISTS idx_bcm_branch ON branch_column_maps(branch_id);
