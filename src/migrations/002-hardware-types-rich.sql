-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 002 — Hardware Types: adopt rich device detail
--
-- Decision (4 July 2026): keep migration 001's hardware_types as THE
-- hardware table, extended with the device-detail columns the Discover
-- feature captures. The parallel-build table vendor_hardware_types
-- (created directly in D1, no migration — drift) is dropped, rows and
-- all, per the rebuild-fresh approach. Manual entries simply leave the
-- detail columns empty — rich is permitted, never forced.
--
-- All new columns nullable. Existing hardware_types rows (none expected)
-- are unaffected. The ALTER lines are not re-runnable — run once.
--
-- Run once:
--   npx wrangler d1 execute tge-asset-snapshot-db --remote --file=src/migrations/002-hardware-types-rich.sql
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE hardware_types ADD COLUMN device_type  TEXT;
ALTER TABLE hardware_types ADD COLUMN type_id      TEXT;
ALTER TABLE hardware_types ADD COLUMN type_code    TEXT;
ALTER TABLE hardware_types ADD COLUMN type_name    TEXT;
ALTER TABLE hardware_types ADD COLUMN model_id     TEXT;
ALTER TABLE hardware_types ADD COLUMN model_name   TEXT;
ALTER TABLE hardware_types ADD COLUMN category     TEXT;
ALTER TABLE hardware_types ADD COLUMN family       TEXT;
ALTER TABLE hardware_types ADD COLUMN capabilities TEXT;   -- JSON array
ALTER TABLE hardware_types ADD COLUMN raw_example  TEXT;   -- sample device payload

DROP TABLE IF EXISTS vendor_hardware_types;
