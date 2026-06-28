# TGE Asset Snapshot — AI Handover Document

Version: 2.0
Last Updated: June 2026
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
- **Excel Export:** SheetJS (xlsx, loaded from CDN)
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
  email-composer.js     — Shared email composer (used by Camera Snapshots, Camera Count, Merge Mail)
  index.html            — Main HTML shell, nav, view containers, script tags
  merge-mail.js         — Merge Mail module
  roles.js              — Roles/permissions helper
  snapshot.js           — Asset Snapshot module (IN PROGRESS)
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

Future enhancements (not yet built): Runtime Event logging, Module Event logging, System Health page, Performance dashboard.

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
Shared PDF platform. Modules call TGE.PDF.download() and TGE.PDF.attachment() — they do not generate PDFs themselves. PDF layout and generation are platform concerns, not module concerns.

### tge-output.js — TGE.output
Shared output platform. Provides TGE.buildOutputPill(), TGE.wireOutputPill(), TGE.closeOutputPill(), TGE.outputFileName(). Modules use this for export dropdowns and file naming — they do not build their own export menus.

---

## Completed Modules

### Asset Track v1.0 — LOCKED

Status: LOCKED. QA passed. No architectural changes permitted. Bug fixes only.

This is the reference implementation for all future modules.

**What it does:** Looks up asset tracker devices (AT301/Oyster3 and Flex Solar Tracker) assigned to fleet vehicles. Displays battery voltage (base and current), battery status, last seen date, and reporting status. Supports User Mode (specific fleet numbers) and Fleet Mode (all enabled vehicles).

**Key implementation details:**
- State is separated per mode: `state.userRows` and `state.fleetRows` — switching modes never loses data from the other mode
- Navigation away and back restores the previous state (results or empty state) without re-fetching
- Refresh clears both mode arrays and returns to true empty state
- Progressive loading via TGE.Progress.run with a setInterval render timer (every 250ms)
- Fleet mode only shows AT301/Solar tracker-equipped vehicles — all other hardware silently excluded
- User mode shows exception rows for: Fleet Not Found, No Device Assigned, Not Asset Tracker
- All errors and Fleet Not Found events logged to TGE.diagnostics
- Export via TGE.buildOutputPill (CSV, Excel, JSON, PDF, Email PDF)
- File naming via TGE.outputFileName

**Battery status logic (hardcoded — temporary):**
- `isOysterTracker()` — identifies AT301/Oyster3 by model name or model ID (85, 433). Excludes solar.
- Voltage thresholds: Fresh ≥5.2V, Good ≥4.85V, Low ≥3.8V, Critical <3.8V
- Solar tracker: battery value displays, status shows N/A (pending vendor data)
- TODO: Replace hardcoded logic with Control Table platform lookup when built

**Last-seen status logic (hardcoded — temporary):**
- Reporting: within 7 days
- Review: within 14 days
- Not Reporting: 15+ days
- TODO: Replace with "Last Reported" Control Table when Control Table platform is built

**Permissions/limits:**
- `asset-track / user-mode` — limit_value controls max assets per User Mode run (currently 10 for restricted roles, 500 default fallback)
- `asset-track / fleet-mode` — controls Fleet Mode access
- `asset-track / run` — controls run access (limit_value on this action is NOT the user input limit — limit belongs on user-mode action)
- Rate limiting per user per time period (e.g. max fleet runs per hour) is a backlog item — not yet built

**Known deferred items:**
- Solar battery status thresholds — waiting on vendor data from Teletrac
- Control Table platform integration (battery status, last reported)
- Fleet Mode call rate limiting
- PDF layout refinement (tge-pdf.js)

**QA Checklist (passed):**
Startup, Vehicle Search User Mode, Vehicle Search Fleet Mode, Snapshot Request, Battery Status, Last Seen Status, Refresh, Mode Switch, Navigation Persistence, CSV Export, Excel Export, JSON Export, PDF Export, Email PDF, Diagnostics, Roles, Limits, Console Error Check.

---

## In Progress Modules

### Snapshot (Asset Snapshot) — IN PROGRESS

Status: In development. Not yet QA'd. Not locked.

Known bugs identified (partially fixed):
1. ✅ Page name — nav button now correctly shows "Asset Snapshot" (was "Snapshot")
2. ✅ Refresh button — now correctly clears all data and returns to true empty state (was re-running the search)
3. ❌ PDF export — currently calls window.print() which dumps the raw app UI. Needs real PDF generation via tge-pdf.js
4. ❌ Email PDF — currently a placeholder alert(). Needs wiring to shared email composer

Remaining work per the Snapshot v1.0 Review and Development Plan:
- Review Startup and Initialisation
- Resolve Fleet Input browser autocomplete issue (Chrome fills fleet number field with login username)
- Review Vehicle Resolution
- Review Snapshot Workflow
- Review History
- Review Camera Alignment
- Review Asset Tracker Logic
- Review Map
- Migrate PDF to TGE.pdf platform (replace window.print())
- Complete Email PDF via shared composer
- Integrate TGE.progress (replace manual loading logic)
- Integrate TGE.output (replace local export functions)
- Cleanup (dead code, unused variables, duplicate helpers)
- QA
- Lock Snapshot v1.0

Stable sections (do not redesign): History, Camera Alignment, Device Detection, Snapshot Workflow, Roles Integration, Diagnostics Integration.

---

## Shared Infrastructure

### Email Composer (email-composer.js)
Shared across Camera Snapshots, Camera Count, and Merge Mail. NOT used by Asset Track (Asset Track uses TGE.openEmailComposer directly).

Features:
- To/CC/BCC fields
- Individual mode (one email per row, merge fields substituted) and Combined mode (one email, all rows)
- Insert merge field at cursor position (works in both Subject and Body fields)
- Signatures loaded live from D1 (mailer_signatures table) via /api/mailer/signatures
- PDF attachment checkbox (camera pages only) — builds PDF via /api/camera-fault-pdf, attaches via Power Automate
- Camera status table appended automatically (Asset ID, IMEI, Cam 1-5 status, Last Comms) for camera pages
- Merge Mail pages get no auto-appended table — email body is purely the user's typed text with merge fields substituted
- Throttled batch send (2.5 second delay between individual sends)
- All sends go through /api/send-email → Power Automate webhook

### Camera Fault Report PDF (/api/camera-fault-pdf)
Built in src/index.js using pdf-lib. Full design spec (locked in after visual validation):
- A4 landscape
- 4 asset-bands per page (mathematically calculated, never overlaps)
- Compact inline header: Asset name/model, IMEI, Last Comms or NON-FUNCTIONAL all on one line
- Brand-green accent line under each band header (red if system-down)
- Photo boxes: fixed size always calculated for 5 slots, only as many boxes drawn as the asset has cameras (centered, no n/a placeholders)
- Status shown as colored dot + short label (OK/FAULT)
- Zebra striping on alternating bands
- System-down bands: red-tinted background, neutral grey photo borders
- Outer page border/frame
- Summary stats strip (X Assets, X Cameras, X Working, X Not Working)
- Footer: Page X of Y — Generated [timestamp]
- Title: "Camera Fault Report" (centered, bold)

### Power Automate Email Flow
Webhook URL stored as Cloudflare Worker secret (POWER_AUTOMATE_WEBHOOK_URL).
Flow receives: to, cc, bcc, subject, htmlBody, attachmentName (optional), attachmentBase64 (optional).
Attachment handling: Create file in OneDrive → Get file content → attach to Send Email (V2). This workaround is required because the Send Email action has a known bug with directly-passed base64 content (262 bytes received instead of full file — confirmed Power Automate bug, not our code).

### Signed Image URLs (/api/sign-image-url, /api/public-image)
Built in src/index.js. Generates HMAC-signed public URLs valid 7 days for embedding camera images in emails without requiring app login. Currently unused (superseded by the direct TN360 S3 URL approach for the camera fault PDF — images are fetched server-side at PDF generation time). Code remains in place as harmless dead code.

---

## Admin Module

Tabs: Users, Access History, API Reference, Mailer Data, Control Tables.

### Mailer Data Tab
Manages email signatures stored in D1 (mailer_signatures table). Superuser can add, edit, deactivate, reactivate signatures. Raw HTML editor with live preview. Signatures are loaded live by the email composer — no hardcoded signatures in any JS file.

### Control Tables Tab
Current state: One control table exists — "Teletrac Navman - Oyster Battery Status" (CT-001). Evaluates battery voltage (battCurrent field) → outputs battery status label (Fresh/Good/Low/Critical) for DMT Oyster Cellular 3 hardware.

**IMPORTANT — Control Table Platform is partially built in Admin UI but NOT yet wired into asset-track.js.** Asset Track still uses hardcoded `getBatteryStatus()` and `isOysterTracker()` functions. The integration between the Control Table platform and module code is a planned future session.

**Planned Control Table Platform (full design agreed, not yet built):**

The goal is rule-driven, table-controlled behaviour. No hardware names hardcoded in any module JS file. Modules call platform methods like `TGE.rules.isIncluded('asset-track', device)` and `TGE.rules.evaluate('battery-status', device, value)`. All business logic lives in D1 tables managed by the superuser. Change a table, the app changes — no redeploy needed.

Three new D1 tables planned:
1. `vendors` — vendor name, active flag (e.g. Teletrac Navman)
2. `hardware_types` — linked to vendor, hardware name, code, active flag (e.g. AT301, Solar, Hermes, Camera, Tablet)
3. Control table rules — linked to hardware type, table type (battery-status, last-reported, hardware-exclusion, etc), min/max/output/colour/period

Admin UI flow (planned):
- Vendors tab: add/manage vendors
- When creating a control table, vendor dropdown auto-populates from vendors table, hardware type tabs auto-populate from hardware_types linked to that vendor
- Each hardware type tab has its own independent set of rules
- Superuser adds rules per hardware type per table — app updates immediately

**Table types planned:**
- **Battery Status** — voltage ranges → status labels per hardware type per vendor
- **Last Reported** — last-seen age thresholds → status labels (Reporting/Review/Critical) per hardware type per vendor
- **Hardware Exclusion** — which hardware types are included/excluded from which feature/run (e.g. Asset Track includes AT301/Solar, excludes Hermes/Camera/Tablet)

**Current workarounds (to be replaced by Control Table platform):**
- Battery status: hardcoded in `getBatteryStatus()` / `isOysterTracker()` in asset-track.js
- Last-seen status: hardcoded constants `THRESHOLD_REPORTING_DAYS = 7`, `THRESHOLD_REVIEW_DAYS = 14` in asset-track.js
- Hardware inclusion/exclusion: hardcoded in `isAssetTrackerDevice()` in asset-track.js

---

## D1 Database Schema (Key Tables)

```sql
-- Users and auth
users (id, username, first_name, last_name, email, password_hash, role_id, login_type, active)
roles (id, name, active)
sessions (id, user_id, token, expires_at, created_at)
permissions (id, role_id, feature, action, enabled, limit_value)
activity_log (id, user_id, category, action, detail, ip, created_at)

-- Email
mailer_signatures (id, label, html, active, created_at, updated_at)

-- Control tables (partially built)
control_tables (id, name, feature, output_field, evaluate_field, active, created_at)
control_table_hardware (id, table_id, hardware_type_id, active)
control_table_rules (id, table_id, hardware_type_id, min_value, max_value, output, colour, active)

-- Planned (not yet built)
vendors (id, name, active)
hardware_types (id, vendor_id, name, code, active)
```

---

## Backlog (Prioritised)

### Immediate (next session)
1. Snapshot module — complete development, QA, lock v1.0
2. Camera module review — camera.js vs camera-snapshots.js vs camera-count.js (verify if camera.js is legacy/dead code)

### Short Term
3. Control Table platform — vendors table, hardware_types table, wire into asset-track.js (replace hardcoded logic)
4. Solar battery status thresholds — add to Control Table once vendor data received
5. Asset Track Fleet Mode call rate limiting (max runs per user per time period)
6. Snapshot PDF — proper generated PDF via tge-pdf.js (currently window.print())
7. Snapshot Email PDF — wire to shared email composer
8. PDF layout refinement for Asset Track (tge-pdf.js)
9. Mail merge improvements to email-composer.js

### Medium Term
10. Fleet Utilisation module (utilisation.js — currently stub/non-functional)
11. Roles Platform expansion:
    - Separate batch limit from usage limit
    - Time-based rate limiting (X calls per Y hours per user)
    - Expanded permissions for exports, diagnostics, API access
12. Camera Requests module
13. Consolidated export dropdown for remaining pages that still have individual export buttons (common pattern — arrow-down icon, click to reveal options)

### Long Term
14. Workflow Engine
15. API Management
16. Production Hardening
17. Diagnostics Platform enhancements (Runtime Events, Module Events, System Health, Performance Dashboard)

---

## Working Rules (Established During Development)

### Code Rules
- Platform services only — no duplicate functionality
- Lower-case file names
- CamelCase methods
- Platform namespaces only (TGE.output, TGE.progress, TGE.pdf, TGE.diagnostics)
- No legacy code — remove during refactoring
- No hardcoded business logic in module JS files — use Control Tables
- Shared services for: output, progress, PDF, diagnostics, email composer
- All API calls go through TGE.api() — this provides automatic diagnostics logging
- All errors must log to TGE.diagnostics — no silent console.warn for production errors
- src/index.js is growing large — watch for need to split into route handlers

### Change Rules
- Changes supplied as: File / Find (starts with... ends with...) / Replace / Reason
- Review every section before making changes
- No redesign of stable/locked code
- Wait for confirmation after every change before continuing
- One bug at a time — discuss, confirm approach, then code

### Process Rules
- Log all bugs first, confirm list, then fix one at a time
- No testing until all bugs in a batch are coded
- QA checklist must be completed before any module is locked
- QA checklist always includes: Startup, all core functions, all exports, Diagnostics, Roles, Limits, Console Error Check
- Locked modules receive bug fixes only — no new features, no redesign
- Documentation updated after: 10 bug fixes, major feature, architecture change

### Git Rules
- Always commit directly to main branch — never create new branches via GitHub web UI
- If a branch is accidentally created, merge via PR immediately
- Cloudflare deploys automatically from main branch on push

### Architecture Rules
- Module code is dumb — it calls platform services and passes data
- Platform services own all shared logic (PDF layout, progress tracking, output formatting, diagnostics)
- Business rules live in D1 tables, not in JS code
- Every module follows: Design → Development → Platform Integration → Diagnostics → QA → LOCK → Maintenance only

---

## Known Issues / Technical Debt

1. `camera.js` — unclear if this is legacy or active. Needs investigation before Snapshot work resumes.
2. `utilisation.js` — non-functional stub in main branch. Should either be removed or clearly marked.
3. `src/index.js` — growing large with all routes in one file. Future: split into route handler modules.
4. Signed image URL system (`/api/sign-image-url`, `/api/public-image`) — built but currently unused. Left in place as harmless dead code. Remove when confirmed not needed.
5. Asset Track hardcoded business logic — battery thresholds, last-seen thresholds, hardware inclusion/exclusion all hardcoded. Will be replaced by Control Table platform.
6. Power Automate OneDrive file created for each email attachment but never deleted — temp files accumulate in `/PowerAutomate-Temp/`. No cleanup mechanism exists yet.
7. Chrome autofills the Fleet Number field in Snapshot with the user's login username — browser compatibility issue, needs investigation.

---

## TN360 API Notes

- Base URL: https://api-au.telematics.com/v1/
- All TN360 calls proxied through the Cloudflare Worker to keep API keys server-side
- Camera image URLs: S3 presigned URLs, valid ~7 days from query time (X-Amz-Expires=604800)
- Re-querying refreshes the 7-day window from that new query time
- Attachment content endpoint (/v1/attachments/{id}/content) requires TN360 session token — not API key. Currently returns 401. Awaiting Teletrac to extend API key scope.
- Camera trigger endpoint (API-6) returns 405 — also awaiting Teletrac.
- Camera model → slot count is currently hardcoded (MultiIQ = 5 slots, IQCamera = 2 slots). May need admin table when IQCamera grows to 3 slots.
