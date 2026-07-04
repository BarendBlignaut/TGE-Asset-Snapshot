# TGE Asset Snapshot — Current Sprint

Sprint: 04
Status: IN PROGRESS
Last Updated: 3 July 2026

---

## Phase Status

Phase 1 — Platform Foundation
✓ COMPLETE

Phase 2 — Asset Track
✓ LOCKED v1.0 — QA Passed

Phase 3 — Snapshot
✓ LOCKED v1.0 — QA Passed

Phase 4 — SD Card Health + Control Table Platform
PAUSED — see note below

Phase 5 — Fleet Utilisation — Static Fleet
IN PROGRESS — backend live, real data loaded

Phase 6 — Vendor Platform
ACTIVE DEVELOPMENT

Architecture locked.

Current objective:

- Convert API Registry into a reusable Platform Component.
- Render Platform API Registry inside Vendor.
- Remove duplicate Admin implementation once validated.

Next:

- Control Tables
- Hardware Types
- Flow Builder
---

## Current Task

Fleet Utilisation backend is live and proven with real data. Immediate
candidates for next task (not yet selected):
- Wire `public/utilisation.js` dashboard grid to `GET /api/utilisation/static-fleet` (currently shows empty 0/0 shell despite 11,588 live assets in D1)
- Build `utilisation_static_fleet_history` migration + wire snapshot writes into the import handler
- Begin Vendor Platform schema build (`vendors`, `hardware_types` tables)

---

## Fleet Utilisation — Static Fleet Backend — LIVE ✅

Real progress this sprint, tested against the actual 11,588-row weekly
fleet file (not a sample):

✅ Fixed a live bug — `handleImportStaticFleet` was writing to a column
   (`import_run_id`) that didn't exist in the deployed D1 schema, silently
   failing every import. Root cause: `schema.sql` in the repo had drifted
   out of sync with the actual live database (someone had migrated D1
   directly without updating the file). Rewritten to match live D1.
✅ Soft-delete / reactivate implemented — assets missing from a weekly
   import are marked `inactive` (not deleted); assets that reappear
   auto-reactivate. Static fleet file is always treated as source of truth.
✅ Exclusion rules moved to query-time only — resolved a design flaw where
   filtering at import time would have made a bad rule destructively drop
   data with no way back except waiting a full week for the next import.
   Import now saves every row unconditionally; filtering happens only on
   `GET /api/utilisation/static-fleet`.
✅ `utilisation_import_runs` now writes real stats (inserted/updated/failed
   counts, finished_at, correct status) instead of a hardcoded placeholder.
✅ Rows with no identity value now log to `utilisation_import_errors`
   instead of being silently counted and discarded.
✅ Chunked import mechanism built and tested — large files are split
   client-side into sequential requests sharing one `batchStartedAt`
   timestamp; only the final chunk (`isFinalChunk: true`) evaluates
   soft-delete, based on `last_seen_at` vs. batch start time. Needed
   because a single 11,588-row request risks exceeding Cloudflare Workers'
   per-request CPU time limit. Single-shot imports still work unchanged.
✅ Field mappings set for 13 of the 34 real source columns (Legacy Number
   as identity, BU Name/Equip Type/Operator State/Operator Name as filters,
   plus Description/Rego/Make/Model/Home Location/Equipment Status/
   Ownership/BU saved for future use) via the existing (already-built)
   `PUT /api/utilisation/static-fields` endpoint.
✅ Found and fixed a permissions gap — no `utilisation.*` permission rows
   existed for any role, including superuser (which gets no implicit
   bypass in this codebase). Seeded manually; worth automating for future
   environments.
✅ **Live result:** full 11,588-row static fleet file imported successfully
   end-to-end, verified via direct API query. Real, working, in production
   D1 — not a stub, not a sample.

**Deferred items (not blockers, but real gaps):**
- No admin UI yet — field mappings, exclusion rules, and import history are
  currently only editable via direct API calls (browser console / curl).
- `utilisation_static_fleet_history` (weekly snapshot table for the History
  toggle and BU-movement report) — designed, not built.
- Dashboard grid (`utilisation.js`) not yet wired to live data.
- Vendor KM ingestion — no vendors onboarded, design only.

---

## Vendor Platform — Design Locked, Not Yet Built

Significant architecture discussion this sprint resolved how vendors,
hardware types, API definitions, and flows relate across the whole app —
not just Fleet Utilisation. Full design captured in
PROJECT-ARCHITECTURE.md → Vendor Platform. Summary:

- Vendor = anyone or anything supplying data, internal or external. Every
  vendor gets an identical template (Overview, File Spec, API Registry,
  Hardware Types, Control Tables, Import History) — always present, used
  or not. New capabilities are added to the shared template, never to one
  vendor individually.
- Existing Control Tables (CT-001) and API Registry (API-1) become nested
  inside vendor records rather than standalone Admin tabs — planned
  migration, safe to do at any time since neither is wired into live
  module code yet.
- `registry_apis.fields` gains a `mapsTo` property so different vendors'
  differently-named fields (e.g. `battVolt` vs. `voltage_reading`) can
  merge into one standardized module output field (e.g. `battery_voltage`).
- Flows chain API Definitions and are tagged by which module consumes
  them; a module runs every Flow tagged for it and merges results by
  asset. This is the eventual replacement for hardcoded functions like
  `isOysterTracker()` in asset-track.js.
- Fleet Utilisation is explicitly **not** owned by or nested under any
  vendor — it's a vendor-agnostic top-level module that vendor File Specs
  feed data into.

**Not yet built:** `vendors` / `hardware_types` schema, `mapsTo` field
addition, Flows table, new Admin "Vendor" tab (card grid, matching the
existing Role Management UI pattern), Control Table / API Registry
migration.

---

## Next Items

### 1. Fleet Utilisation — dashboard wiring
Wire `public/utilisation.js` to call `GET /api/utilisation/static-fleet`
and render real assets in the grid, replacing the current empty 0/0 shell.

### 2. Fleet Utilisation — history table
Build `utilisation_static_fleet_history` migration, wire snapshot writes
into `handleImportStaticFleet` (one row per asset per weekly import,
capturing all save_to_db field values + status).

### 3. Vendor Platform — schema build
`vendors` + `hardware_types` tables, `mapsTo` addition to
`registry_apis.fields`, first two vendor rows (Teletrac Navman migrated
from existing data, TGE Static Fleet pointed at existing working
endpoints).

### 4. SD Card Health — Snapshot (carried over, untouched this sprint)
SD Card Health currently populates by reading DOM element text content
from snap-sd1, snap-sd2 etc. This is fragile — if the DOM hasn't fully
populated before PDF export is triggered, values may be missing. Still
needs review.

---

## Backlog (Ordered by Priority)

1. Fleet Utilisation — dashboard grid wiring
2. Fleet Utilisation — history table + snapshot writes
3. Vendor Platform — schema build (vendors, hardware_types, mapsTo, Flows)
4. Vendor Platform — Admin UI (Vendor tab, card grid, nested detail view)
5. Vendor Platform — migrate CT-001 + API-1 into Teletrac Navman vendor record
6. SD Card Health — Snapshot data flow review
7. Fleet Utilisation — vendor KM ingestion (utilisation_vendors, utilisation_daily_km, first real vendor onboarded)
8. Fleet Utilisation — Analysis tab (mockup agreed, not built)
9. Solar battery status — waiting on Teletrac vendor data
10. Asset Track Fleet Mode rate limiting — server-side, max runs per user per time period
11. Snapshot XLSX export — SheetJS implementation
12. History rewrite — 7-day window, events endpoint direct, S3 URL expiry check, no storage (pending Teletrac direction)
13. Roles Platform expansion — rate limiting, batch limits, expanded permissions
14. Camera Requests module
15. Workflow Engine
16. API Management
17. Production Hardening
18. Diagnostics Platform enhancements

---

## QA Checklist (Used For All Modules)

Every module must pass all items before locking:

- [ ] Startup
- [ ] Vehicle Search / Input
- [ ] Core function (snapshot run / asset track run / etc)
- [ ] All data sections populate correctly
- [ ] All exports (CSV, Excel, JSON, PDF, Email PDF)
- [ ] Diagnostics (all API calls logged, all errors logged, no silent failures)
- [ ] Roles (permissions respected, feature access gated correctly)
- [ ] Limits (input limits enforced, limit_value on correct permission action row)
- [ ] Refresh (clears all data, returns to true empty state)
- [ ] Navigation persistence (data survives nav away/back, only Refresh clears)
- [ ] Console Error Check (no red errors, no unexpected warnings)

---

## Completed This Sprint

### Sprint 02 (earlier)
✓ Shared platform architecture (export-pill.js, tge-progress.js, tge-pdf.js, tge-diagnostics.js)
✓ Asset Track v1.0 — developed, QA passed, LOCKED
✓ Email composer shared platform
✓ Camera Fault Report PDF (locked design)
✓ Power Automate email flow with PDF attachment
✓ Mailer Data admin tab
✓ Control Tables admin tab (CT-001 Oyster Battery Status active)
✓ Merge Mail page
✓ Login permission timing fixed

### Sprint 03 (earlier)
✓ Snapshot v1.0 — all fixes applied, QA passed, LOCKED
✓ Snapshot PDF — portrait A4, auto-spacing, rounded header/footer, full layout
✓ Snapshot alignment simulation — full visual flow, AFTER images on main page
✓ Snapshot history — cleaned out broken API calls, holding message
✓ Snapshot exports — PDF, Email PDF, CSV, JSON all working
✓ Snapshot diagnostics — logging in all catch blocks
✓ Platform file naming (TGE.outputFileName) for CSV and JSON
✓ DST-aware toAestIso() ready for history build
✓ Documentation updated (v3.0)

### Sprint 04 (this sprint)
✓ Fleet Utilisation static fleet — fixed live import_run_id bug (schema drift between repo schema.sql and deployed D1)
✓ Fleet Utilisation static fleet — soft-delete / reactivate logic implemented
✓ Fleet Utilisation static fleet — exclusion filtering moved to query-time only (resolved a data-loss-risk design flaw)
✓ Fleet Utilisation static fleet — import_runs / import_errors now log real data
✓ Fleet Utilisation static fleet — chunked import mechanism built, tested against real 11,588-row file
✓ Fleet Utilisation static fleet — field mappings set for 13 real columns
✓ Fleet Utilisation — utilisation.* permissions seeded (gap found: no implicit superuser bypass)
✓ Fleet Utilisation — full 11,588-row live import verified end-to-end
✓ Vendor Platform — full design agreed (vendors, hardware_types, mapsTo, Flows, Admin UI pattern, migration plan for Control Tables/API Registry)
✓ Documentation — PROJECT-ARCHITECTURE.md rewritten (v4.0)
✓ Documentation — CURRENT-SPRINT.md rewritten (this document)

---

## Blockers

None currently on Fleet Utilisation or Vendor Platform work.

Waiting on (external):
- Teletrac Navman: solar tracker battery voltage specification
- Teletrac Navman: API key scope expansion for attachment content endpoint — currently returns 401
- Teletrac Navman: camera trigger endpoint fix — currently returns 405
- Teletrac Navman: direction on camera history API approach (7-day window confirmed, implementation TBD)
