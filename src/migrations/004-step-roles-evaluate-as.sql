-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 004 — Explicit step roles + CT evaluation modes
--
-- flow_steps.step_role: declares each step's funnel role instead of the
-- engine inferring from data shape. Open TEXT, validated per step type
-- in the worker: api_definition → seed | join | enrich (first API step
-- must be seed); hardware_set → filter | annotate (default filter);
-- control_table → grade (default). New roles = worker word, no migration.
--
-- control_tables.evaluate_as: how the evaluate field is judged.
-- number (default, existing behaviour) | days_since (parse date, judge
-- days elapsed to now — e.g. CT-004 Last Seen reporting rules).
-- Future modes (hours_since, boolean, text) are worker words.
--
-- Both nullable: existing rows unaffected; engine applies defaults.
-- Run once (statements individually in the D1 console):
--   ALTER TABLE flow_steps ADD COLUMN step_role TEXT;
--   ALTER TABLE control_tables ADD COLUMN evaluate_as TEXT;
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE flow_steps ADD COLUMN step_role TEXT;
ALTER TABLE control_tables ADD COLUMN evaluate_as TEXT;
