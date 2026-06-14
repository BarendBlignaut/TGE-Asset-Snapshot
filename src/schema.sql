-- TGE Asset Snapshot — D1 Schema
-- Run with: npm run db:init

-- ── ROLES ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  description TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  first_name    TEXT    NOT NULL,
  last_name     TEXT    NOT NULL,
  email         TEXT,
  role_id       INTEGER NOT NULL REFERENCES roles(id),
  status        TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── PERMISSIONS ──────────────────────────────────────────────────────────────
-- One row per feature+action per role
-- feature:  snapshot | asset-track | vpm | camera-snapshots | sd-health |
--           new-request | admin | registry
-- action:   view | run | user-mode | fleet-mode |
--           export-pdf | export-email-pdf | export-csv | export-xlsx | export-json
-- limit_value: null = unlimited, number = max items (e.g. 5 IMEIs)
CREATE TABLE IF NOT EXISTS permissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id     INTEGER NOT NULL REFERENCES roles(id),
  feature     TEXT    NOT NULL,
  action      TEXT    NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  limit_value INTEGER,
  UNIQUE(role_id, feature, action)
);

-- ── ACTIVITY LOG ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  feature    TEXT    NOT NULL,
  action     TEXT    NOT NULL,
  detail     TEXT,
  ip         TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── REQUESTS ─────────────────────────────────────────────────────────────────
-- New request / driver applications
CREATE TABLE IF NOT EXISTS requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER REFERENCES users(id),
  type         TEXT    NOT NULL CHECK(type IN ('driver','user','other')),
  first_name   TEXT    NOT NULL,
  last_name    TEXT    NOT NULL,
  email        TEXT,
  phone        TEXT,
  detail       TEXT,
  status       TEXT    NOT NULL DEFAULT 'submitted'
                       CHECK(status IN ('submitted','in-review','approved','rejected')),
  reviewed_by  INTEGER REFERENCES users(id),
  reviewed_at  TEXT,
  notes        TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── SESSIONS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT    NOT NULL,
  ip         TEXT
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED DATA
-- ─────────────────────────────────────────────────────────────────────────────

-- Default roles
INSERT OR IGNORE INTO roles (id, name, description) VALUES
  (1, 'superuser', 'Full access to all features and settings'),
  (2, 'admin',     'Access to most features, user management'),
  (3, 'user',      'Limited access based on assigned permissions');

-- Superuser account
-- Username: bare1234
-- Password: 12345678
-- Password hash is SHA-256 of "12345678" — worker will verify this
INSERT OR IGNORE INTO users (id, username, password_hash, first_name, last_name, email, role_id, status)
VALUES (
  1,
  'bare1234',
  '1b4f0e9851971998e732078544c96b36c3d01cedf7caa332359d6f1d83567014',
  'Barend',
  'Blignaut',
  '',
  1,
  'active'
);

-- Superuser gets all permissions enabled with no limits
INSERT OR IGNORE INTO permissions (role_id, feature, action, enabled, limit_value)
SELECT 1, f.feature, a.action, 1, NULL
FROM (
  SELECT 'snapshot'          AS feature UNION ALL
  SELECT 'asset-track'                  UNION ALL
  SELECT 'vpm'                          UNION ALL
  SELECT 'camera-snapshots'             UNION ALL
  SELECT 'sd-health'                    UNION ALL
  SELECT 'new-request'                  UNION ALL
  SELECT 'admin'                        UNION ALL
  SELECT 'registry'
) f
CROSS JOIN (
  SELECT 'view'             AS action UNION ALL
  SELECT 'run'                        UNION ALL
  SELECT 'user-mode'                  UNION ALL
  SELECT 'fleet-mode'                 UNION ALL
  SELECT 'export-pdf'                 UNION ALL
  SELECT 'export-email-pdf'           UNION ALL
  SELECT 'export-csv'                 UNION ALL
  SELECT 'export-xlsx'                UNION ALL
  SELECT 'export-json'
) a;
