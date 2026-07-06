# TGE Asset Snapshot — AI Handover Document

Version: 4.0
Last Updated: 3 July 2026
Purpose: Full handover document for AI continuity. If starting a new chat, read this entire document before writing any code or making any suggestions. This document reflects the exact current state of the project including completed work, pending items, architectural decisions, and working rules.

---

## Project Overview

TGE Asset Snapshot is an internal fleet telematics web application built for Team Global Express. It is deployed on Cloudflare Workers with a D1 SQLite database. The frontend is vanilla JavaScript (no framework), served as static assets. The backend is a single Cloudflare Worker at `src/index.js`.

**Live URL:** tge-asset-snapshot.blignaut-barend.workers.dev
**Repository:** github.com/BarendBlignaut/TGE-Asset-Snapshot
**Deploy:** GitHub main branch → Cloudflare auto-build (bun install + npx wrangler deploy)
**Database:** Cloudflare D1 (tge-asset-snapshot-db)
**TN360 API:** Teletrac Navman fleet telematics API (proxied through the Cloudflare Worker)

---

## Tech Stack

- **Frontend:** Vanilla JS, one file per page module, no framework
- **Backend:** Cloudflare Worker (ES modules, `src/index.js` + feature route files, e.g. `src/utilisation-static-fleet.js`)
- **Database:** Cloudflare D1 (SQLite)
- **Build:** Bun + Wrangler
- **PDF Generation:** pdf-lib (npm dependency, bundled by Wrangler/esbuild)
- **Excel Export:** SheetJS (xlsx, loaded from CDN) — deferred on Snapshot
- **Email Delivery:** Power Automate webhook → Office 365 "Send an email (V2)"
- **Image Hosting:** TN360 S3 presigned URLs (7-day expiry from query time)

---

## File Structure

```
public/

  index.html                    — Application entry point

  tge-app.js                    — Application bootstrap, navigation, session management, permissions
  tge-diagnostics.js            — Diagnostics Platform
  tge-output.js                 — Output Platform
  tge-pdf.js                    — PDF Platform
  tge-progress.js               — Progress Platform

  service-email.js              — Shared email service

  platform-api-registry.js      — API Registry Platform
  platform-roles.js             — Roles / permissions helper

  screen-admin.js               — Admin module
  screen-vendor.js              — Vendor Platform
  screen-asset-track.js         — Asset Track (LOCKED v1.0)
  screen-asset-snapshot.js      — Asset Snapshot (LOCKED v1.0)
  screen-camera.js              — Camera utilities / camera module
  screen-camera-count.js        — Camera Count
  screen-camera-snapshots.js    — Camera Snapshots
  screen-merge-mail.js          — Merge Mail
  screen-sd-health.js           — SD Health
  screen-utilisation.js         — Fleet Utilisation
  screen-vpm.js                 — VPM

  export-pill.js                — Shared Output Pill Platform (scheduled to migrate into TGE Core)

src/

  index.js                      — Cloudflare Worker (routing, auth, APIs, PDF generation)
  utilisation-static-fleet.js   — Fleet Utilisation backend handlers
  schema.sql                    — Database schema (always validate against live D1 before relying on it)

Root/

  AI-HANDOVER.md                — AI continuity document
  CURRENT-SPRINT.md             — Active sprint and priorities
  PROJECT-ARCHITECTURE.md       — Platform architecture and engineering rules
  fleet-utilisation-spec.md     — Fleet Utilisation design log
  package.json                  — Project dependencies
  wrangler.jsonc                — Cloudflare Worker configuration
  .gitignore
```

### Application Layers

```
index.html
    ↓
tge-*          Core Framework
    ↓
service-*      Shared Services
    ↓
platform-*     Shared Platform Components
    ↓
screen-*       Navigation Screens
```

**Core Framework (`tge-*`)**

Provides the application framework and shared infrastructure.

Examples:

- Navigation
- Session management
- Diagnostics
- Progress
- PDF
- Output
- Shared UI components

Core files never contain business-specific logic.

**Shared Services (`service-*`)**

Reusable operational functionality.

Examples:

- Email
- Import
- Export
- Merge
- PDF generation

Services perform reusable actions and contain no screen-specific rendering.

**Platform Components (`platform-*`)**

Reusable business functionality shared across multiple screens.

Examples:

- API Registry
- Control Tables
- Hardware Types
- Flow Builder
- File Specification
- Import History
- Roles

Platform Components are shared and must never be duplicated.

**Navigation Screens (`screen-*`)**

Each navigation item has one corresponding screen file.

Screens are responsible for:

- Rendering page layout.
- Managing module-specific state.
- Calling Platform Components.
- Calling Shared Services.

Screens should not duplicate business logic already provided by the Platform.
  index.js                        — Cloudflare Worker (all backend routes, PDF generation, email, auth)
  utilisation-static-fleet.js     — Fleet Utilisation static fleet handlers (import, field mappings, exclusions) — LIVE, working with real data
  schema.sql                      — ⚠️ Known to have drifted from live D1 in the past (see Known Issues). Verify against live schema before trusting it, don't assume it's current.

Root:
  AI-HANDOVER.md         — This document
  CURRENT-SPRINT.md      — Current sprint status and task list
  PROJECT-ARCHITECTURE.md — Architecture, rules, module status, Vendor Platform design
  fleet-utilisation-spec.md — Full Fleet Utilisation decision log and open items (separate working doc, not in repo — kept alongside these three)
  package.json           — Dependencies (pdf-lib, wrangler)
  wrangler.jsonc          — Cloudflare Worker config
  .gitignore
```

---

## Platform Services (All Complete)

### tge-diagnostics.js — TGE.diagnostics
Floating, draggable, resizable diagnostics window. Accessible via "Diagnostics" button in the topbar (role-gated). Logs all API calls automatically via TGE.api(). Features: request/response viewer, timing, status, errors, copy, export JSON, open in new browser tab.

### tge-progress.js — TGE.Progress
Progressive batch runner. Used by Asset Track and future modules for concurrent API calls with live UI updates. API:
```javascript
TGE.Progress.run({
  items: [],
  concurrency: 5,
  delay: 300,
  worker: async function(item) { ... },
  onItem: function(result) { ... },
  onProgress: function(done, total) { ... },
  onError: function(err) { ... },
  onComplete: function(results) { ... }
}).promise
```
Note: onError receives a wrapped object `{ ok: false, error: '...', item: ..., index: ... }` not a raw Error.

### tge-pdf.js — TGE.PDF
Shared PDF platform. Modules call TGE.PDF.download() and TGE.PDF.attachment() — they do not generate PDFs themselves. PDF layout and generation are platform concerns in src/index.js.

### export-pill.js — TGE.buildOutputPill / TGE.wireOutputPill
Shared output platform. Provides TGE.buildOutputPill(), TGE.wireOutputPill(), TGE.closeOutputPill(), TGE.outputFileName(). Modules use this for export dropdowns and file naming.

---

## Completed Modules

### Asset Track v1.0 — LOCKED

Status: LOCKED. QA passed. No architectural changes permitted. Bug fixes only.

**What it does:** Looks up asset tracker devices (AT301/Oyster3 and Flex Solar Tracker) assigned to fleet vehicles. Displays battery voltage (base and current), battery status, last seen date, and reporting status. Supports User Mode (specific fleet numbers) and Fleet Mode (all enabled vehicles).

**Key implementation details:**
- State separated per mode: state.userRows / state.fleetRows — switching modes never loses data
- Navigation away and back restores previous state without re-fetching
- Refresh clears both mode arrays and returns to true empty state
- Progressive loading via TGE.Progress.run with setInterval render timer (every 250ms)
- Fleet mode only shows AT301/Solar tracker-equipped vehicles
- User mode shows exception rows for: Fleet Not Found, No Device Assigned, Not Asset Tracker
- All errors and Fleet Not Found events logged to TGE.diagnostics
- Export via TGE.buildOutputPill (CSV, Excel, JSON, PDF, Email PDF)
- File naming via TGE.outputFileName
- Battery status via CT-001 control table (Oyster only; Solar N/A pending vendor data)
- User mode limit: limit_value on user-mode permission row (NOT run action)

**Known deferred items:**
- Solar battery status thresholds — waiting on vendor data from Teletrac
- Control Table platform integration (battery status, last reported) — superseded by Vendor Platform design, see below
- Fleet Mode call rate limiting

---

### Snapshot v1.0 — LOCKED

Status: LOCKED. QA passed. No architectural changes permitted. Bug fixes only.

**What it does:** Loads a full asset snapshot for a single fleet number — vehicle info, assigned devices, live telematics status, engine metrics, GPIO, camera evidence (current snapshots), alignment test (simulation mode), SD card health, location, asset tracker. Supports PDF export, Email PDF, CSV, JSON exports.

**Key implementation details:**

**Navigation and state:**
- TGE.onShow['snapshot'] pattern — navigation away and back restores previous state
- Only Refresh clears data
- Refresh returns to true empty state, hides results

**Vehicle resolution:**
- resolveVehicle() — exact name/rego match → numeric ID match → partial name fallback
- Digit boundary match — "82050" does not match "182050"
- Handles leading zero normalisation

**Device detection:**
- HERMES → Live Status, Engine Metrics, GPIO, Location map
- CAMERA → Evidence (current snapshots), SD Card Health, Camera Diagnostics, Alignment Test button, History button
- IFACE → Driver card
- ATRACKER → Asset Tracker card

**Camera snapshots:**
- Frozen after first load — never updated on navigation return
- MultiIQ = 5 slots, IQCamera = 2 slots
- Current snapshots displayed in snap-camera-grid
- Alignment Test AFTER results displayed in snap-align-result-section (only after test completes and panel closes)

**Alignment test (SIMULATION MODE):**
- All 6 steps tick through with 2 second delays
- AFTER grid uses current frozen snapshots as simulated result
- poll-ignition, trigger, and snapshot steps all simulated
- Replace with real API calls when Teletrac provides camera trigger endpoint
- state.alignCompleted, state.alignAfterSlots, state.alignCompletedAt track result

**History panel:**
- Currently shows "Camera history coming soon." — no API calls made
- Pending Teletrac API direction on 7-day window approach
- toAestIso() is DST-aware (ready for when history is built)

**PDF export — buildSnapshotPdf in src/index.js:**
- Portrait A4, single page always
- Auto-spacing: spare space distributed as equal section gaps between sections
- Photo rows use natural aspect ratio (slot_w × 0.65) — never stretched
- Rounded dark green header (centered title + registration + timestamp in yellow)
- Rounded dark green footer pinned to bottom (centered page info in yellow)
- Green pill section labels with accent lines
- Compact data cards (4 cols, 24pt height, rounded corners, brand green label text)
- Camera photos full width, natural aspect ratio
- Alignment Test AFTER photos included only if state.alignCompleted === true
- No map in PDF (dropped — static map API blocked by Cloudflare Workers)
- No camera diagnostics in PDF (excluded by design)
- Worker route: POST /api/snapshot-pdf
- Payload shape: asset.{ legacyNo, registration, state, vehicleType, generatedAt, sections[] }
- Section shape: { label, cols, rows: [{label, value}], photos: [{label, url}] }

**Export:**
- PDF: TGE.PDF.download() → /api/snapshot-pdf
- Email PDF: TGE.openEmailComposer with attachmentBuilder → TGE.PDF.attachment() → /api/snapshot-pdf
- CSV: platform filename via TGE.outputFileName
- JSON: platform filename via TGE.outputFileName
- XLSX: deferred — currently falls back to CSV (not a blocker)
- All exports via TGE.buildOutputPill / TGE.wireOutputPill

**Diagnostics:**
- TGE.diagnostics.log() in: runSnapshot catch, exportPdf catch, alignmentTest catch (with step state)

**Permissions:**
- snapshot / view — controls access
- snapshot / export-pdf, export-email-pdf, export-csv, export-xlsx, export-json — per export type

**Known deferred items:**
- XLSX export — proper SheetJS implementation (currently falls back to CSV)
- History rewrite — pending Teletrac API direction (7-day events endpoint approach agreed)
- SD Card Health — currently populates from DOM elements; full independent data flow to be reviewed
- Alignment test real API — pending Teletrac camera trigger endpoint (currently simulation)

---

## Fleet Utilisation — Static Fleet Backend (LIVE, real data)

Status changed materially this version — no longer a stub. Full working
design and decision log lives in `fleet-utilisation-spec.md` (a separate
working document, kept alongside these three but not part of the original
handover set — read it for the complete reasoning trail).

**What's live and tested, with the real 11,588-row weekly fleet file:**
- `POST /api/utilisation/static-fleet/import` (in `src/utilisation-static-fleet.js`) — parses rows, self-seeds `utilisation_static_field_defs` for any newly-seen column, upserts into `utilisation_static_fleet`, soft-deletes assets missing from the current file (`status='inactive'`), auto-reactivates assets that reappear. Auth via `X-Import-Key` header (`UTILISATION_IMPORT_KEY` Worker secret) — not session-based, since this is called by Power Automate, not a logged-in user.
- **Chunked import support** — large files are split client-side into sequential POSTs sharing one `batchStartedAt` timestamp; only the request with `isFinalChunk: true` runs the soft-delete comparison (`last_seen_at < batchStartedAt`). Built because a single 11,588-row request risks exceeding the Workers CPU time limit. All D1 writes batched via `env.DB.batch()`, chunked at 100 statements per batch call.
- `GET /api/utilisation/static-fleet` — returns active assets by default, `?history=1` includes inactive. Applies exclusion rules (`utilisation_static_exclusion_rules`, published only) at query time.
- `GET`/`PUT /api/utilisation/static-fields` — field mapping control (identity column, save_to_db, use_as_filter). 13 of 34 real columns currently configured.
- Exclusion rules — draft → preview → publish flow, per-column exact/contains matching. **Resolved design decision:** filtering happens only at query time, never at import — import always saves every row, so a bad exclusion rule can never destructively lose data.
- `utilisation_import_runs` / `utilisation_import_errors` — real audit trail, not placeholders.

**Not yet built:**
- `utilisation_static_fleet_history` — weekly snapshot table (design agreed, not created)
- Any admin UI — everything above is currently only reachable via direct API calls (was tested via curl and browser DevTools console, not a built screen)
- Dashboard grid wiring — `public/utilisation.js` still shows an empty 0/0 UI shell despite live data existing
- Vendor KM ingestion (`utilisation_vendors`, `utilisation_daily_km`) — design only

**Known gotcha found during this work:** no `permissions` rows existed for
the `utilisation` feature for any role, including superuser — this
codebase gives superuser no implicit bypass, every feature/action needs an
explicit row. Had to be seeded manually before testing could proceed.

---

## Vendor Platform (Design Locked — Not Yet Built)

Major architecture decision this version, spanning the whole app, not just
Fleet Utilisation. Full detail in `PROJECT-ARCHITECTURE.md` → Vendor
Platform. Read that section before touching Control Tables, API Registry,
or anything vendor-related.

**Core idea:** Vendor = anyone or anything supplying data, internal or
external (Teletrac Navman, TGE's own internal static fleet export, future
KM-data vendors). Every vendor gets an identical template — Overview, File
Spec, API Registry (Definitions + Flows), Hardware Types, Control Tables,
Import History — always present whether used or not. New capabilities are
added to the shared template, never to one vendor individually.

**Supersedes** the "Control Table Platform" section that existed in prior
versions of this document — that work is not abandoned, it's absorbed into
this bigger design. CT-001 and existing `registry_apis` rows (API-1, etc.)
will migrate into a "Teletrac Navman" vendor record. Safe to do at any
point — Control Tables are confirmed not wired into any live module code
yet (Asset Track still uses hardcoded `getBatteryStatus()` /
`isOysterTracker()`).

**Do not confuse with Fleet Utilisation:** Utilisation is a vendor-agnostic
top-level module. A vendor's File Spec feeds data into it; Utilisation is
not nested inside any vendor.

---

## Shared Infrastructure

### Email Composer (email-composer.js)
Shared across Camera Snapshots, Camera Count, Merge Mail, and Snapshot.

Features:
- To/CC/BCC fields
- Individual mode (one email per row, merge fields substituted) and Combined mode
- Insert merge field at cursor position (works in both Subject and Body fields)
- Signatures loaded live from D1 (mailer_signatures table) via /api/mailer/signatures
- PDF attachment via attachmentBuilder callback — Snapshot passes buildSnapshotPayload() via TGE.PDF.attachment()
- Camera status table appended automatically for camera pages
- Throttled batch send (2.5 second delay between individual sends)
- All sends through /api/send-email → Power Automate webhook

### Camera Fault Report PDF (/api/camera-fault-pdf)
Built in src/index.js using pdf-lib. A4 landscape, 4 asset-bands per page, fixed-size photo boxes, status dots, zebra striping, summary stats strip. LOCKED design.

### Snapshot PDF (/api/snapshot-pdf)
Built in src/index.js using pdf-lib. Portrait A4, single page, auto-spacing, rounded header/footer. See Snapshot v1.0 details above.

### Asset Track PDF (/api/asset-track-pdf)
Built in src/index.js using pdf-lib. A4 landscape tabular report.

### Power Automate Email Flow
Webhook URL stored as Cloudflare Worker secret (POWER_AUTOMATE_WEBHOOK_URL).
Flow receives: to, cc, bcc, subject, htmlBody, attachmentName (optional), attachmentBase64 (optional).
Attachment handling: Create file in OneDrive → Get file content → attach to Send Email (V2). Required workaround for Power Automate base64 attachment bug.

---

## Admin Module

Tabs: Users, Access History, API Reference, Mailer Data, Control Tables.
**Planned change:** API Reference and Control Tables will be removed as
standalone tabs and replaced with a new "Vendor" tab (card grid, click into
a vendor for nested API Registry / Control Tables / etc.) — see Vendor
Platform section above. Not yet built.

### Control Tables Tab (current, pre-Vendor Platform)
One control table exists — CT-001 "Teletrac Navman - Oyster Battery Status". Evaluates battery voltage → outputs Fresh/Good/Low/Critical for DMT Oyster Cellular 3 hardware.

**IMPORTANT:** Control Table platform is partially built in Admin UI but NOT yet wired into asset-track.js. Asset Track still uses hardcoded getBatteryStatus() and isOysterTracker() functions. Integration is now planned as part of the Vendor Platform build, not as a standalone Control Table effort.

### API Reference Tab (current, pre-Vendor Platform)
Table `registry_apis` — API-1 ("User Login Confirmation") is a real
working example of the Definitions concept: each field has `name`, `label`,
`use` (match/filter-rule/display), `path`, `example`, `hardCheck`. Will gain
a `mapsTo` property under the Vendor Platform design, to support merging
multiple vendors' differently-named fields into one standardized module
output field.

---

## D1 Database Schema (Key Tables)

⚠️ **Caution:** `src/schema.sql` in the repo has previously drifted from
the actual deployed D1 schema (discovered this version — see Known Issues).
Do not trust schema.sql blindly; verify against live D1 with a direct query
if a table's exact columns matter for a change.

```sql
users (id, username, first_name, last_name, email, password_hash, role_id, login_type, active)
roles (id, name, active)
sessions (id, user_id, token, expires_at, created_at)
permissions (id, role_id, feature, action, enabled, limit_value)
activity_log (id, user_id, category, action, detail, ip, created_at)
mailer_signatures (id, label, html, active, created_at, updated_at)
control_tables (id, name, feature, output_field, evaluate_field, active, created_at)
control_table_hardware (id, table_id, hardware_type_id, active)
control_table_rules (id, table_id, hardware_type_id, min_value, max_value, output, colour, active)
registry_apis (api_id, label, group_name, method, url, notes, vendor, sample_response, fields, active, updated_at)

-- Fleet Utilisation (live):
utilisation_static_fleet (id, legacy_number, status, field_values, source_file, first_seen_at, last_seen_at, created_at, updated_at)
utilisation_static_field_defs (id, source_column, display_label, save_to_db, is_identity, use_as_filter, filter_label, filter_type, display_order, enabled, created_at, updated_at)
utilisation_static_exclusion_rules (id, status, source_column, match_type, match_value, reason, created_by, created_at, published_at)
utilisation_import_runs (id, feed, source_file, status, row_count, inserted_count, updated_count, failed_count, error_summary, started_at, finished_at)
utilisation_import_errors (id, import_run_id, feed, legacy_number, reason, raw_row, created_at, resolved)

-- Fleet Utilisation (planned, not built):
utilisation_static_fleet_history, utilisation_vendors, utilisation_daily_km, utilisation_non_functional, utilisation_workshop

-- Vendor Platform (planned, not built):
vendors, hardware_types (+ vendor_id added to control_tables / control_table_hardware / registry_apis)
```

---

## Backlog (Prioritised)

1. **Fleet Utilisation — dashboard grid wiring** — wire utilisation.js to live `GET /api/utilisation/static-fleet`
2. **Fleet Utilisation — history table** — build `utilisation_static_fleet_history`, wire snapshot writes into import handler
3. **Vendor Platform — schema build** — vendors, hardware_types, mapsTo, Flows
4. **Vendor Platform — Admin UI** — Vendor tab, card grid, nested detail view
5. **Vendor Platform — migration** — CT-001 + API-1 into a real Teletrac Navman vendor record
6. **SD Card Health — Snapshot** — review data flow, ensure reliable independent population
7. **Fleet Utilisation — vendor KM ingestion** — utilisation_vendors, utilisation_daily_km, first real vendor onboarded
8. **Fleet Utilisation — Analysis tab** — mockup agreed (north-star KPIs, sparklines, heatmap, trend, downtime breakdown, BU movements, cost vs. utilisation), not built
9. **Solar battery status** — waiting on Teletrac vendor data
10. **Asset Track Fleet Mode rate limiting** — max runs per user per time period, server-side
11. **Snapshot XLSX export** — SheetJS implementation (deferred, not a blocker)
12. **History rewrite** — 7-day window, events endpoint direct, expiry check, no storage (pending Teletrac direction)
13. **Roles Platform expansion** — rate limiting, batch limits, expanded permissions
14. **Camera Requests module**
15. **Workflow Engine**
16. **API Management**
17. **Production Hardening**
18. **Diagnostics Platform enhancements**

---

## Working Rules

### Code Rules
- Platform services only — no duplicate functionality
- Lower-case file names, CamelCase methods
- Platform namespaces only (TGE.output, TGE.progress, TGE.pdf, TGE.diagnostics)
- No legacy code — remove during refactoring
- No hardcoded business logic in module JS files — use Control Tables (migrating into Vendor Platform)
- All API calls through TGE.api() — provides automatic diagnostics logging
- All errors must log to TGE.diagnostics — no silent failures
- src/index.js is growing large — feature-specific route handlers should live in their own file (established pattern: `src/utilisation-static-fleet.js`), imported into index.js rather than added inline

### Change Rules
- One change at a time — discuss, confirm, code
- Changes supplied as: File / Find / Replace / Reason
- No redesign of stable/locked code
- Wait for confirmation after every change before continuing
- Full-document rewrites (not sequential find/replace) are acceptable for non-runtime documentation, where reviewing one coherent version is clearer than a stack of interdependent patches — code changes still follow strict File/Find/Replace/Reason
- Where an agreed design drifts from an earlier decision, the drift must be demonstrably better than the current state before being adopted — not change for its own sake

### Vendor Platform Rule
- Every vendor gets an identical template of tabs/tables, always present whether currently used or not. A new capability is added to the shared template, never to one vendor individually. No vendor is ever a special case.

### Process Rules
- QA checklist before locking any module
- QA always includes: Startup, all core functions, all exports, Diagnostics, Roles, Limits, Console Error Check
- Locked modules: bug fixes only — no new features, no redesign
- Documentation updated after: 10 bug fixes, major feature, architecture change, module lock

### Git Rules
- Always commit directly to main branch
- Cloudflare deploys automatically from main on push

### Architecture Rules
- Module code is dumb — calls platform services and passes data
- Platform services own all shared logic
- Business rules live in D1 tables, not JS code
- Every module: Design → Development → Platform Integration → Diagnostics → QA → LOCK → Maintenance only

---

## Known Issues / Technical Debt

1. `camera.js` — unclear if legacy or active. Needs investigation.
2. `utilisation.js` (frontend) — UI shell not yet wired to the now-live backend. Backend itself is functional and tested — this is a frontend gap, not a backend one.
3. `src/index.js` — growing large. Pattern for splitting into route handler modules now established (`src/utilisation-static-fleet.js`) — extend this pattern for future features rather than adding more inline handlers.
4. Signed image URL system — built but unused. Remove when confirmed not needed.
5. Asset Track hardcoded business logic — will be replaced by Vendor Platform (supersedes the standalone Control Table platform plan).
6. Power Automate OneDrive temp files — accumulate, no cleanup mechanism.
7. Snapshot XLSX — falls back to CSV currently.
8. Snapshot history — stub holding message, pending Teletrac API direction.
9. Snapshot alignment test — simulation mode only, pending Teletrac camera trigger endpoint.
10. **`src/schema.sql` drift** — discovered this version: the repo's schema.sql for Fleet Utilisation tables did not match the actual deployed D1 schema (someone had migrated D1 directly at some point without updating the file). Caused a live import bug (`import_run_id` column referenced in code but not present in real D1). Treat schema.sql with caution until reconciled — verify against live D1 directly for anything schema-sensitive.
11. **Permissions seeding** — no default `permissions` rows exist for new features until manually inserted, for any role including superuser. Discovered via Fleet Utilisation testing. No automated seeding process exists yet for provisioning a new feature's permissions.

---

## TN360 API Notes

- Base URL: https://api-au.telematics.com/v1/
- All TN360 calls proxied through the Cloudflare Worker
- Camera image URLs: S3 presigned URLs, valid ~7 days (X-Amz-Expires=604800)
- Attachment content endpoint (/v1/attachments/{id}/content) — returns 401. Awaiting Teletrac API key scope expansion.
- Camera trigger endpoint (API-6) — returns 405. Awaiting Teletrac fix.
- Camera model → slot count hardcoded: MultiIQ=5, IQCamera=2
- History approach agreed: 7-day window, events endpoint direct, S3 URL expiry check (X-Amz-Date + X-Amz-Expires), display valid images only, no storage


evrything above is the previous update.
New update below 06/07/2026

# AI-HANDOVER.md
**Updated: 6 July 2026 — post Vendor Platform build session**
Read this first. Then PROJECT-ARCHITECTURE.md, then CURRENT-SPRINT.md.

## What this project is
TGE Asset Snapshot — a Cloudflare Worker (vanilla JS frontend, D1 database)
fleet operations platform. One worker: `tge-asset-snapshot`
(blignaut-barend.workers.dev). Deploys automatically on push to `main`
(GitHub: BarendBlignaut/TGE-Asset-Snapshot — PRIVATE; owner shares files
into chat, attachments of .js/.md files often arrive empty — request
plain-text paste or true file upload; images work).

## The owner and how to work with him
- Non-developer building a production system. Explain plainly, define
  jargon on first use, give click-by-click steps for anything in a UI.
- **Process (strict): one change at a time — ask, answer, discuss,
  confirm, move on.** One question per message. Do not stack
  evaluations or bundle multiple open questions. He will pull you back
  if you drift; do not make him.
- **No code until the approach is agreed.**
- Code changes delivered as **File / Find / Replace / Reason**. Find
  blocks must be verbatim from his actual files — ask for a paste when
  a file may have drifted from your copy.
- For deletions spanning many lines: give the exact first line, exact
  last line, and the first line that must remain after.
- He edits by hand: paste artifacts happen (doubled lines, lost
  braces). After any manual splice, expect a possible SyntaxError; the
  browser console names the line.

## The three consoles (keep this map in every session)
| Window | Where | Speaks | Used for |
|---|---|---|---|
| F12 console | browser, in the app | JavaScript | `await TGE.api(...)` checks |
| D1 console | Cloudflare dash → D1 | SQL only | SELECT/INSERT/UPDATE, verification |
| Terminal | VS Code bottom panel | commands | `npx wrangler ...` (secrets, d1 --file) |
Plus: Workers → Logs → **Begin log stream** = point-and-click `wrangler tail`.

## Standing engineering rules
1. **No hardcoding of vendors, hardware, or screens.** Vendor tables
   dictate; flows align; code consumes by tag.
2. **No legacy code** — remove during refactoring; one way to do one
   thing (duplicated features get consolidated, loser deleted).
3. **Every new feature gets tick-and-flick permissions** (roles.js →
   platform-roles.js FEATURES). New features start OFF for all roles,
   including superuser (no implicit bypass). Export pill assigned to a
   screen ⇒ ALL export actions visible as toggles (shared
   EXPORT_ACTIONS constant — never retype the list).
4. **Database changes only via numbered migration files** in
   `src/migrations/` (001, 002, 003...), run once against live D1,
   committed as the permanent record. D1 console rejects comments and
   sometimes multi-statement pastes — run statements one at a time.
   ALTER TABLE lines are not re-runnable.
5. **Version bump rule:** any changed .js file gets its `?v=` bumped
   in index.html in the same commit. Only bump what changed; never
   bump backwards.
6. **Verify at the source:** after any save that matters, a D1 SELECT
   is the proof — the re-rendered card list is not (ghost cards have
   happened three times).
7. **Sample = shape, not volume:** API sample responses are 1–5
   complete records. Worker guard refuses >100KB. Use the test modal's
   record picker.
8. **Naming standard:** display labels ("display as" tags) come from
   `projectdocs/standard-output-names.md`. One spelling everywhere —
   the label is what merges multi-vendor data into one screen column.
   New names get added to the doc the moment they're invented.
9. **Capture rule (the 433 lesson):** vendor identifiers (type/model
   ids and names) are recorded verbatim from real API responses only —
   never from code comments or memory. Hardware rows are created only
   for hardware actually seen. (Hardcoded belief said 85/433 =
   oyster/at301; reality: 85 = Flex Solar Tracker, 433 = DMT Oyster
   Cellular 3; "AT301" does not exist in TN360.)
10. **First-save practice:** before saving a NEW definition/record of
    a kind that has failed before, arm the Cloudflare log stream. A
    recurring transient pattern exists: first save of large registry
    inserts sometimes 500s, identical retry succeeds. Backlog item:
    wrap registry create/update handlers in try/catch returning the
    error as JSON (makes failures self-naming).

## Security model
- API keys NEVER in D1, screens, exports, or logs. Keys live as
  Cloudflare Worker secrets (`npx wrangler secret put NAME`). The app
  stores only the secret's NAME (auth profile `secret_ref`). The test
  endpoint redacts key values from reported URLs.
- Known accepted risk (backlog): a vendor:manage user could point a
  definition URL anywhere and the worker would send the key there.
  Hardening = per-profile allowed-domain check, not yet built.

## Session-continuity notes
- These three docs are the memory between chats. Update them at the
  end of any session that changes state.
- The schema source of truth is the live D1 dump + migration files;
  `src/schema.sql` is STALE (utilisation-only) — parity rebuild is a
  backlog task; `db:init` in package.json is currently unsafe for
  fresh environments.
- Attachment quirk: this owner's chat attachments of text files often
  arrive empty. Images and genuine file-uploads work. Ask for
  plain-text paste when in doubt.

