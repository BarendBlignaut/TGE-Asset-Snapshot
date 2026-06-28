# TGE Asset Snapshot — AI Handover Document

Version: 3.0
Last Updated: 28 June 2026
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
- **Backend:** Cloudflare Worker (ES modules, `src/index.js`)
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
  admin.js              — Admin page (Users, Access History, API Reference, Mailer Data, Control Tables)
  api.js                — Frontend API helper
  app.js                — Application bootstrap, session management, navigation, permissions
  asset-track.js        — Asset Track module (LOCKED v1.0)
  camera-count.js       — Camera Count module
  camera-snapshots.js   — Camera Snapshots module
  camera.js             — Camera shared utilities (verify if legacy or active)
  email-composer.js     — Shared email composer (used by Camera Snapshots, Camera Count, Merge Mail, Snapshot)
  export-pill.js        — Shared output pill (TGE.buildOutputPill, TGE.wireOutputPill, TGE.closeOutputPill)
  index.html            — Main HTML shell, nav, view containers, script tags
  merge-mail.js         — Merge Mail module
  roles.js              — Roles/permissions helper
  snapshot.js           — Asset Snapshot module (LOCKED v1.0)
  tge-diagnostics.js    — Diagnostics Platform (COMPLETE)
  tge-output.js         — Output Platform (COMPLETE)
  tge-pdf.js            — PDF Platform (COMPLETE)
  tge-progress.js       — Progress Platform (COMPLETE)
  utilisation.js        — Fleet Utilisation module (STUB — not yet functional)
  vpm.js                — VPM module

src/
  index.js              — Cloudflare Worker (all backend routes, PDF generation, email, auth)

Root:
  AI-HANDOVER.md        — This document
  CURRENT-SPRINT.md     — Current sprint status and task list
  PROJECT-ARCHITECTURE.md — Architecture, rules, module status
  package.json          — Dependencies (pdf-lib, wrangler)
  wrangler.jsonc        — Cloudflare Worker config
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
- Control Table platform integration (battery status, last reported)
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

### Control Tables Tab
One control table exists — CT-001 "Teletrac Navman - Oyster Battery Status". Evaluates battery voltage → outputs Fresh/Good/Low/Critical for DMT Oyster Cellular 3 hardware.

**IMPORTANT:** Control Table platform is partially built in Admin UI but NOT yet wired into asset-track.js. Asset Track still uses hardcoded getBatteryStatus() and isOysterTracker() functions. Integration is planned next.

**Planned Control Table Platform (full design agreed, not yet built):**
Three new D1 tables: vendors, hardware_types, and expanded control_table_rules. Modules call TGE.rules.isIncluded() and TGE.rules.evaluate(). All business logic lives in D1 tables — change a table, app changes without redeploy.

Table types planned: Battery Status, Last Reported, Hardware Exclusion.

Current workarounds to be replaced:
- Battery status: hardcoded getBatteryStatus() / isOysterTracker() in asset-track.js
- Last-seen status: hardcoded THRESHOLD_REPORTING_DAYS=7, THRESHOLD_REVIEW_DAYS=14
- Hardware inclusion/exclusion: hardcoded isAssetTrackerDevice() in asset-track.js

---

## D1 Database Schema (Key Tables)

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
-- Planned: vendors, hardware_types
```

---

## Backlog (Prioritised)

1. **SD Card Health — Snapshot** — review data flow, ensure reliable independent population
2. **Control Table Platform** — vendors table, hardware_types table, Admin UI, wire into asset-track.js
3. **Solar battery status** — waiting on Teletrac vendor data
4. **Asset Track Fleet Mode rate limiting** — max runs per user per time period, server-side
5. **Snapshot XLSX export** — SheetJS implementation (deferred, not a blocker)
6. **History rewrite** — 7-day window, events endpoint direct, expiry check, no storage (pending Teletrac direction)
7. **Fleet Utilisation module** (utilisation.js — stub, design not started)
8. **Roles Platform expansion** — rate limiting, batch limits, expanded permissions
9. **Camera Requests module**
10. **Workflow Engine**
11. **API Management**
12. **Production Hardening**
13. **Diagnostics Platform enhancements**

---

## Working Rules

### Code Rules
- Platform services only — no duplicate functionality
- Lower-case file names, CamelCase methods
- Platform namespaces only (TGE.output, TGE.progress, TGE.pdf, TGE.diagnostics)
- No legacy code — remove during refactoring
- No hardcoded business logic in module JS files — use Control Tables
- All API calls through TGE.api() — provides automatic diagnostics logging
- All errors must log to TGE.diagnostics — no silent failures
- src/index.js is growing large — watch for need to split into route handlers

### Change Rules
- One change at a time — discuss, confirm, code
- Changes supplied as: File / Find / Replace / Reason
- No redesign of stable/locked code
- Wait for confirmation after every change before continuing

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
2. `utilisation.js` — non-functional stub in main branch.
3. `src/index.js` — growing large. Future: split into route handler modules.
4. Signed image URL system — built but unused. Remove when confirmed not needed.
5. Asset Track hardcoded business logic — will be replaced by Control Table platform.
6. Power Automate OneDrive temp files — accumulate, no cleanup mechanism.
7. Snapshot XLSX — falls back to CSV currently.
8. Snapshot history — stub holding message, pending Teletrac API direction.
9. Snapshot alignment test — simulation mode only, pending Teletrac camera trigger endpoint.

---

## TN360 API Notes

- Base URL: https://api-au.telematics.com/v1/
- All TN360 calls proxied through the Cloudflare Worker
- Camera image URLs: S3 presigned URLs, valid ~7 days (X-Amz-Expires=604800)
- Attachment content endpoint (/v1/attachments/{id}/content) — returns 401. Awaiting Teletrac API key scope expansion.
- Camera trigger endpoint (API-6) — returns 405. Awaiting Teletrac fix.
- Camera model → slot count hardcoded: MultiIQ=5, IQCamera=2
- History approach agreed: 7-day window, events endpoint direct, S3 URL expiry check (X-Amz-Date + X-Amz-Expires), display valid images only, no storage
