-- ── UTILISATION: IMPORT RUNS ──────────────────────────────────────────────────
-- Audit trail for every static fleet import
CREATE TABLE IF NOT EXISTS utilisation_import_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  feed        TEXT    NOT NULL,
  source_file TEXT,
  status      TEXT    NOT NULL DEFAULT 'success'
                      CHECK(status IN ('success','error')),
  row_count   INTEGER NOT NULL DEFAULT 0,
  error       TEXT,
  started_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── UTILISATION: STATIC FIELD DEFINITIONS ────────────────────────────────────
-- One row per column found in imported CSV/JSON — controls labels, filtering,
-- identity column, and which columns are persisted to the fleet table
CREATE TABLE IF NOT EXISTS utilisation_static_field_defs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  source_column  TEXT    NOT NULL UNIQUE,
  display_label  TEXT    NOT NULL,
  save_to_db     INTEGER NOT NULL DEFAULT 0  CHECK(save_to_db  IN (0,1)),
  is_identity    INTEGER NOT NULL DEFAULT 0  CHECK(is_identity IN (0,1)),
  use_as_filter  INTEGER NOT NULL DEFAULT 0  CHECK(use_as_filter IN (0,1)),
  filter_label   TEXT,
  filter_type    TEXT    NOT NULL DEFAULT 'select',
  display_order  INTEGER NOT NULL DEFAULT 999,
  enabled        INTEGER NOT NULL DEFAULT 1  CHECK(enabled IN (0,1)),
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── UTILISATION: STATIC FLEET ────────────────────────────────────────────────
-- One row per unique legacy number — upserted on each import
CREATE TABLE IF NOT EXISTS utilisation_static_fleet (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_number  TEXT    NOT NULL UNIQUE,
  field_values   TEXT    NOT NULL DEFAULT '{}',   -- JSON blob of save_to_db fields
  import_run_id  INTEGER REFERENCES utilisation_import_runs(id),
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── UTILISATION: STATIC EXCLUSION RULES ──────────────────────────────────────
-- Draft + published rulesets that filter vehicles from the fleet view
CREATE TABLE IF NOT EXISTS utilisation_static_exclusion_rules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  status        TEXT    NOT NULL DEFAULT 'draft'
                        CHECK(status IN ('draft','published')),
  source_column TEXT    NOT NULL,
  match_type    TEXT    NOT NULL DEFAULT 'exact'
                        CHECK(match_type IN ('exact','contains')),
  match_value   TEXT    NOT NULL,
  reason        TEXT,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  published_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_util_fleet_legacy
  ON utilisation_static_fleet(legacy_number);

CREATE INDEX IF NOT EXISTS idx_util_excl_status
  ON utilisation_static_exclusion_rules(status);
