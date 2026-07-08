-- Migration 005 — registry_apis.module_tag
-- Binds each API definition to the ONE data screen it serves
-- (asset-track, vpm, snapshot...). Same vocabulary as flows.module_tag,
-- so the engine sees one screen-tag concept across flows and definitions.
-- Nullable: pre-vendor rows being cleared out stay valid; new definitions
-- set it via the editor's Screen / Category selector.
ALTER TABLE registry_apis ADD COLUMN module_tag TEXT;

CREATE INDEX IF NOT EXISTS idx_registry_apis_module_tag
  ON registry_apis(module_tag);
