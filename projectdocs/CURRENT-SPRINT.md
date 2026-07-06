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


Everything above was previous updated

everything below is current update 06/07/2026

# CURRENT-SPRINT.md
**Updated: 6 July 2026 — end of Vendor Platform definition-layer build**

## Where we are (one paragraph)
The Vendor Platform is built and verified end to end at the definition
layer: vendors, auth profiles (secrets by name only), API definitions
with test-and-lock workflow and record-picker sampling, rich hardware
types with hardware sets, vendor-scoped control tables, and the flow
builder. Vendor 3 = Teletrac Navman carries the first complete data
set: 3 tested API definitions (vehicles/devices/meters), 11 hardware
types (2 routed to asset-track), CT-001 reassigned under the vendor,
and flow id 1 "Asset Track — Teletrac Navman" (5 steps). The old
hardcoded Asset Track pipeline still runs production — by design —
until the flow engine exists. TGE Static Fleet exists as vendor id
(see grid); its File Spec tab is the future home of utilisation
mappings and container/trailer exclusions.

## Completed this session (4–6 July)
- Migrations 001–003 (vendors/flows/flow_steps/hardware_types base;
  hardware rich columns + drop of parallel vendor_hardware_types;
  vendor_auth_profiles + auth_profile_id + call_spec) — all in
  src/migrations/, all applied to live D1.
- Vendor screen: card grid, create/edit panel, hero tab shell.
- Permissions: `vendor` feature (view/manage/import + full export
  pill); EXPORT_ACTIONS shared constant fixed camera-snapshots &
  sd-health missing export-json toggles.
- Worker: vendors CRUD, hardware-types (repointed + applies_to_feature
  + gating + dupe check), vendor control-tables route with COALESCE
  vendor protection, flows CRUD (step validation incl. hardware_set),
  auth-profiles list, registry create/update carrying vendor_id /
  auth_profile_id / call_spec + resolve-or-create profiles (name-clash
  updates in place) + 100KB sample guard, test endpoint (auth
  assembly, {param} substitution, parsed records, key redaction).
- Registry frontend: normalizeApiRow (fixed edit-500/undefined-row
  bug), auth & call-constraint editor sections, test consolidation
  (modal only; legacy TN360-proxy path deleted), record picker,
  Expand Array capture (Stage 1), auto-trim/refuse sampling.
- Hardware form: type/model ids, type name, applies-to-feature.
- Control Tables platform module (free-text hardware matches replacing
  admin's hardcoded checkboxes; working +Add Rule; dedupe; save guard).
- Flows platform module (Power-Automate-style builder, dynamic
  Operations+Camera screen targets from nav, hardware_set steps).
- Data: 11 TN360 hardware types (verbatim taxonomy), 3 API definitions
  tested green, CT-001 → vendor 3, flow 1 saved and verified in D1.
- Truth correction: model 85 = Flex Solar Tracker, 433 = DMT Oyster
  Cellular 3; "AT301" does not exist. Old code's comments were wrong.
- Docs: standard-output-names.md created (commit to projectdocs/).

## NEXT PHASE — Flow Engine (do not start without ask-answer-confirm)
Goal: modules consume flows; hardcoded pipelines retire at cutover.
1. Engine core in worker: load flow by module_tag → execute steps —
   api_definition via the test-endpoint assembly (batched/per-asset
   per definition), hardware_set matching devices on type_code/
   model_id, control_table application, tag-driven output mapping to
   standard names. Respect call_spec (dates, chunking) and Constraint
   Notes (map iteration).
2. First consumer: Asset Track behind a comparison switch (run flow,
   compare against hardcoded output, then cut over and DELETE
   getBatteryStatus/isOysterTracker/findAssetTrackerDevice + direct
   TN360 calls in that module).
3. Discover Hardware: replace API-1-by-convention with "run this
   vendor's hardware-discovery flow"; harvest/refresh hardware rows.
4. Stage 3 living definitions: unseen-structure queue on definitions.

## Backlog (ordered-ish)
- try/catch wrap on registry create/update → self-naming errors
  (recurring transient first-save 500; log-stream ritual until then).
- Vendor UI polish: Delete/deactivate for control tables; prettier
  hardware `code` generation; paste raw_example + capabilities into
  the 4 hardware rows with captured specimens; capabilities input UI.
- Datalist suggestions on "display as" (Option A naming aid); output
  dictionary (Option B) lands with the engine's mapsTo work.
- Stage 2 sub-value definitions — build against first GPIO/camera
  specimen.
- Test-endpoint hardening: per-profile allowed-domain check.
- Record picker for map-shaped responses.
- File Spec tab (TGE Static Fleet mappings, container/trailer tick-
  and-flick) + Import History tab (utilisation_import_runs surface).
- schema.sql full parity rebuild from live D1 (db:init currently
  unsafe); commit standard-output-names.md to projectdocs/.
- Multi-set hardware membership (applies_to_feature → list/join) when
  first real dual-screen device appears.
- Utilisation permissions: add manage-field-mappings /
  manage-static-sanitising toggles to FEATURES when File Spec UI lands.

## Clear-out list (only after flow-engine cutover per item)
- Admin > Control Tables tab (incl. broken duplicate
  addControlTableRuleRow) and Admin > API Reference tab (hardcoded
  API_REFS docs).
- Standalone API Registry screen/nav (functionality lives in vendor).
- Dead `registry` permission toggles in FEATURES.
- registry_apis free-text `vendor` column (vendor_id authoritative).
- Hardcoded TN360 proxy routes as modules cut over to flows.
- Old data wipe: owner deletes remaining pre-vendor rows in
  registry_apis/control tables when ready (rows only, tables stay) —
  export files from 4 July are the safety net.
- Verify camera.js / vpm.js status (docs flag: unknown/legacy).
- Stale ?v= audit (tge-app.js at v=3 predates restructure changes);
  fix stray unclosed </button> near Fleet Utilisation nav item;
  update view-container comments to new filenames.

## Known issues / quirks
- Transient first-save 500 on large registry inserts (retry works;
  see backlog fix). Arm CF log stream before first saves.
- D1 console: no comments, prefers one statement at a time; ALTERs
  not re-runnable.
- Owner's chat attachments of text files often arrive empty — use
  plain-text paste or true file upload; images fine.
- Sample rule: 1–5 records; worker refuses >100KB.
- Flow display paths for array-filter tags embed a literal example
  map key — engine must use structured filterKey/filterVal/
  extractField + Constraint Notes, not the display path.
