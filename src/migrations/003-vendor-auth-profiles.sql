-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 003 — Vendor Auth Profiles + API call constraints
-- Executed against live D1: 4 July 2026 (statements run individually).
--
-- vendor_auth_profiles: named auth recipes per vendor. The app stores
-- only the SECRET'S NAME (secret_ref → a Cloudflare Worker secret set
-- via `wrangler secret put`); key values never touch D1, screens,
-- exports, or logs. auth_type is open TEXT validated in the worker:
-- query_param | header_bearer | header_token | header_custom |
-- session_passthrough | none.
--
-- registry_apis.auth_profile_id: which recipe a definition calls with.
-- registry_apis.call_spec: JSON call constraints — dateFormat, timezone,
-- maxRangeDays, notes — read by the flow engine to format params and
-- auto-chunk ranged requests.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vendor_auth_profiles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id   INTEGER NOT NULL REFERENCES vendors(id),
  name        TEXT    NOT NULL,
  auth_type   TEXT    NOT NULL,
  auth_name   TEXT,
  secret_ref  TEXT,
  notes       TEXT,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (vendor_id, name)
);

ALTER TABLE registry_apis ADD COLUMN auth_profile_id INTEGER REFERENCES vendor_auth_profiles(id);
ALTER TABLE registry_apis ADD COLUMN call_spec TEXT;

CREATE INDEX IF NOT EXISTS idx_auth_profiles_vendor ON vendor_auth_profiles(vendor_id);
