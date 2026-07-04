-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 001 — Vendor Platform foundation
-- Written against live D1 DDL (dumped 4 July 2026). ADDITIVE ONLY.
--
-- Creates: vendors, hardware_types, flows, flow_steps   (all empty — no
--          vendors are seeded; vendors are only ever created through the UI)
-- Alters:  control_tables  + vendor_id (nullable)
--          registry_apis   + vendor_id (nullable)
--
-- Per closed decisions:
--   Q1: control_table_rules and control_table_hardware do NOT gain
--       vendor_id — children inherit vendor via control_table_id.
--   Q2: flows are in scope now; a flow step can reference an API
--       definition, a control table, a hardware type, or future rule
--       types (step_type is open TEXT, validated in the worker).
--   Q4: existing tables are kept and extended, never replaced.
--
-- No rows are touched. Old screens keep working unchanged.
-- registry_apis.vendor (free text) is deliberately NOT dropped here —
-- it dies in the final cleanup migration once vendor_id is authoritative.
--
-- Run once:
--   npx wrangler d1 execute tge-asset-snapshot-db --remote --file=src/migrations/001-vendor-platform.sql
-- Note: the two ALTER lines are not re-runnable (SQLite has no
-- ADD COLUMN IF NOT EXISTS). Running the file twice errors harmlessly.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── VENDORS ──────────────────────────────────────────────────────────────────
-- Anyone or anything supplying data, internal or external (Teletrac Navman,
-- TGE Static Fleet, Geotab, ...). Every vendor gets the identical template.
-- No vendor is ever hardcoded anywhere — this table alone dictates vendors.
CREATE TABLE IF NOT EXISTS vendors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  notes       TEXT,
  created_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT    DEFAULT CURRENT_TIMESTAMP
);

-- ── HARDWARE TYPES ───────────────────────────────────────────────────────────
-- Hardware a vendor supplies. code = short machine identifier ('oyster',
-- 'at301', 'hermes'). applies_to_feature = which module recognises it
-- ('asset-track', 'snapshot', 'camera-count'); NULL = all modules.
CREATE TABLE IF NOT EXISTS hardware_types (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id           INTEGER NOT NULL REFERENCES vendors(id),
  name                TEXT    NOT NULL,
  code                TEXT    NOT NULL,
  applies_to_feature  TEXT,
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at          TEXT    DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (vendor_id, code)
);

CREATE INDEX IF NOT EXISTS idx_hardware_types_vendor
  ON hardware_types(vendor_id);

-- ── FLOWS ────────────────────────────────────────────────────────────────────
-- A flow is a vendor's named, ordered run-and-validate sequence, tagged by
-- the module that consumes its output (e.g. "Asset Track — Teletrac").
-- At runtime a module asks for every active flow tagged for it, across all
-- vendors, runs them all, and merges results by asset. Execution wiring is
-- a later step — this table and its UI come now so the template is whole.
CREATE TABLE IF NOT EXISTS flows (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id    INTEGER NOT NULL REFERENCES vendors(id),
  name         TEXT    NOT NULL,
  module_tag   TEXT    NOT NULL,
  notes        TEXT,
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at   TEXT    DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (vendor_id, name)
);

CREATE INDEX IF NOT EXISTS idx_flows_vendor
  ON flows(vendor_id);
CREATE INDEX IF NOT EXISTS idx_flows_module_tag
  ON flows(module_tag);

-- ── FLOW STEPS ───────────────────────────────────────────────────────────────
-- Ordered steps in a flow: run api 1 → api 2 → api 7 → ct001.
-- step_type: 'api_definition' | 'control_table' | 'hardware_type' | future
--            rule types (open TEXT on purpose — validated in the worker so
--            new step types never need a schema change).
-- step_ref:  the referenced item's key as TEXT (registry_apis.api_id is
--            TEXT, other tables use INTEGER ids — TEXT holds both).
CREATE TABLE IF NOT EXISTS flow_steps (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  flow_id      INTEGER NOT NULL REFERENCES flows(id),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  step_type    TEXT    NOT NULL,
  step_ref     TEXT    NOT NULL,
  notes        TEXT,
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at   TEXT    DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_flow_steps_flow
  ON flow_steps(flow_id, sort_order);

-- ── VENDOR LINKS ON EXISTING TABLES ─────────────────────────────────────────
-- Nullable on purpose: existing rows (CT-001, API-1...) stay valid and the
-- old screens keep working until deleted. vendor_id is assigned through
-- the new Vendor UI when data is re-aligned under its vendor.
ALTER TABLE control_tables ADD COLUMN vendor_id INTEGER REFERENCES vendors(id);
ALTER TABLE registry_apis  ADD COLUMN vendor_id INTEGER REFERENCES vendors(id);

CREATE INDEX IF NOT EXISTS idx_control_tables_vendor
  ON control_tables(vendor_id);
CREATE INDEX IF NOT EXISTS idx_registry_apis_vendor
  ON registry_apis(vendor_id);
