# TGE Asset Snapshot — Project Architecture

Version: 4.0
Last Updated: 3 July 2026

---

## Project Standards

Platform-first architecture. Modules do not duplicate functionality. Shared services provide all common functionality. Business rules live in D1 tables, not in JS code. No hardware names or thresholds hardcoded in module files.

---
Immediately after that heading insert:

## Application Architecture

The application follows a layered architecture.


index.html
↓
tge-* (Core Framework)
↓
service-* (Shared Services)
↓
platform-* (Reusable Platform Components)
↓
screen-* (Navigation Screens)


### Layer Definitions

**index.html**
- Application entry point.
- Loads the application in the correct order.

**tge-***
- Shared application framework.
- Navigation.
- Diagnostics.
- Output.
- PDF.
- Progress.
- Shared UI components (Pill, etc.).

**service-***
- Reusable operational functions.
- Email.
- Import.
- Export.
- Merge.
- PDF generation.
- Any reusable action.

**platform-***
- Shared business components.
- API Registry.
- Control Tables.
- Hardware Types.
- Flow Builder.
- File Specification.
- Import History.
- Roles.

Platform components never belong to a screen.

**screen-***
- One file per navigation item.
- Contains page layout.
- Contains module-specific business logic.
- Calls Platform Components and Services.
- 
## Deployment Architecture

```
GitHub (main branch)
    ↓ push triggers
Cloudflare Build (bun install + npx wrangler deploy)
    ↓
Cloudflare Worker (src/index.js)
    ├── Serves static assets from /public/
    ├── Proxies TN360 API calls (keeps API keys server-side)
    ├── D1 database access (users, permissions, sessions, signatures, control tables, utilisation)
    ├── PDF generation (pdf-lib, bundled by Wrangler/esbuild)
    └── Email via Power Automate webhook
```

**Never commit directly to a branch other than main.** If GitHub web UI creates a branch, merge it to main immediately via PR.

---

## Platform Services

All modules must use these services. No module reimplements any of these.

### TGE.diagnostics (tge-diagnostics.js)
Runtime diagnostics. Floating window, draggable, resizable. Logs all TGE.api() calls automatically. All module errors must call TGE.diagnostics.log() — no silent console.warn in production code.

Log format:
```javascript
TGE.diagnostics.log({
  category: 'Module Name',
  level: 'Error' | 'Warn' | 'Info' | 'Success',
  module: 'module-name',
  action: 'what was attempted',
  message: 'human readable description',
  error: errorObject,      // optional
  request: { ...payload }, // optional
  response: { ...data },   // optional
  step: { ...stepState },  // optional — alignment test step state
});
```

### TGE.Progress (tge-progress.js)
Concurrent batch runner for large API operations.

```javascript
TGE.Progress.run({
  items: [],
  concurrency: 5,
  delay: 300,
  worker: async function(item, index) { return result; },
  onItem: function(result, item, index) { },
  onProgress: function(done, total, results) { },
  onError: function(errorObj, item, index) { },
  onComplete: function(results) { }
}).promise;
```
Note: onError receives `{ ok: false, error: '...', item: ..., index: ... }` not a raw Error.

### TGE.PDF (tge-pdf.js)
PDF generation platform. Modules call these — they never generate PDFs themselves.

```javascript
// Download PDF directly
await TGE.PDF.download({
  route: '/api/module-pdf',
  module: 'ModuleName',
  type: 'Report',
  payload: { ... }
});

// Build PDF as base64 attachment for email
var attachment = await TGE.PDF.attachment({
  route: '/api/module-pdf',
  module: 'ModuleName',
  type: 'Report',
  payload: { ... }
});
```

PDF layout and styling are defined in src/index.js PDF handlers. Modules only pass data.

### export-pill.js — TGE.buildOutputPill / TGE.wireOutputPill
Export dropdown and file naming platform.

```javascript
TGE.buildOutputPill('prefix', exportItems())   // build dropdown HTML
TGE.wireOutputPill('prefix', exportItems())    // wire events
TGE.closeOutputPill('prefix')                  // close dropdown
TGE.outputFileName({ module:'Name', type:'Report', extension:'csv' })
```

Export items format:
```javascript
[
  { id:'prefix-csv-btn', label:'CSV', suffix:'.csv', icon:'📑',
    permission:['feature','action'], action: exportCsv }
]
```

---

## Module Architecture

Every module is an IIFE in its own file. Modules register via:
```javascript
TGE.onShow['module-name'] = function() { };
```

### Module State Pattern
- State object at top of IIFE — all module state lives here
- Multiple modes: separate arrays per mode (e.g. state.userRows, state.fleetRows)
- onShow checks if view already built before re-rendering:

```javascript
TGE.onShow['module-name'] = function() {
  var alreadyBuilt = !!TGE.el('module-key-element');
  if (!alreadyBuilt) { render(); return; }
  // Restore previous state without re-rendering
  if (state.data.vehicle) { TGE.show('results'); } else { TGE.show('empty'); }
};
```

### Navigation Persistence Rule
Data persists when user navigates away and returns. Refresh is the only mechanism for clearing data. Mode switching never loses data from the other mode.

### Render Pattern
- `render()` builds full HTML skeleton and calls `wireEvents()`
- Data population functions update only data sections — never rebuild the skeleton
- Mode switches update only affected DOM elements — never call `render()`

---

## PDF Architecture (src/index.js)

### Camera Fault Report — /api/camera-fault-pdf
A4 landscape, 4 asset-bands per page, fixed-size photo boxes (5 slots always calculated, fewer boxes drawn and centered for fewer cameras), status dots, zebra striping, summary stats strip. Design LOCKED.

### Snapshot Report — /api/snapshot-pdf
Portrait A4, single page always, auto-spacing.

**Layout engine — two-pass:**
1. Measure all fixed-height content (header, footer, labels, data cards, photo rows at natural aspect ratio)
2. Calculate spare space: `usableH - fixedH`
3. Distribute spare space as equal section gaps: `secGap = spare / numSections`
4. Photos never stretched — natural aspect ratio: `slotW × 0.65`

**Design spec:**
- Rounded dark green header (DARK = #003c1f) — centered white title + yellow subtitle
- Rounded dark green footer — centered yellow page info
- Green pill section labels (LGREEN = #e8f5ee bg, BRAND = #14532d text) with accent line
- Data cards: SURF = #f0faf4 bg, LINE = #c8ddd0 border, 4pt radius, 24pt height, 4 columns default
- Photo boxes: 5pt radius, dark bg, scaleToFit preserving aspect ratio

**Payload shape (from buildSnapshotPayload in snapshot.js):**
```javascript
{
  asset: {
    legacyNo, registration, state, vehicleType, title, generatedAt,
    sections: [{
      label,           // section header text (green pill)
      cols,            // number of columns (default 4)
      rows: [{ label, value }],
      photos: [{ label, url }]  // null if no photos
    }]
  }
}
```

**Sections included:**
Vehicle Information, Assigned Devices, Live Status, Engine Metrics, GPIO, Evidence (camera photos), Alignment Test After (only if state.alignCompleted === true), SD Card Health, Location

### Asset Track Report — /api/asset-track-pdf
A4 landscape tabular report with summary cards, data rows, zebra striping.

---

## Vendor Platform (Design Locked — Not Yet Built)

Supersedes the vendor-scoping originally described under "Control Table
Platform" in earlier versions of this document. Control Tables and API
Registry become nested inside this system rather than standalone Admin
concepts — see Migration Note below.

### Core principle

Vendor = anyone or anything supplying us data, internal or external
(Teletrac Navman, a fuel-card provider, TGE's own internal static fleet
export). Every vendor gets an identical template of sub-structures, always
present regardless of whether that vendor currently uses them. Adding a new
capability means adding it to the shared template — every existing and
future vendor gets it automatically, populated or not. No vendor is ever a
special case with tabs or tables others don't have. This is what makes a
new vendor go live with zero code changes, once the platform itself is
built: create the vendor, define its hardware and API mappings, and every
module that queries by feature tag picks it up automatically.

Standard vendor template (all vendors, always present):
- **Overview** — name, active/inactive, notes
- **File Spec** — flat-file ingestion mapping (only populated where relevant,
  e.g. weekly Excel/CSV feeds; empty for vendors integrated purely via API)
- **API Registry** → **Definitions** + **Flows** (see below)
- **Hardware Types** — with module-applicability tagging (see below)
- **Control Tables** — hardware evaluation rules (battery status, thresholds,
  hardware exclusion, etc.)
- **Import History** — every run, success/partial/failed, error drill-down

### Data model (planned, not yet built)

```sql
vendors (id, name, active, notes, created_at, updated_at)
hardware_types (id, vendor_id, name, code, applies_to_feature, active)
-- control_tables, control_table_hardware, control_table_rules gain vendor_id
-- registry_apis.vendor (currently free text) becomes vendor_id (FK)
```

`hardware_types.applies_to_feature` declares which module(s) recognize this
hardware (e.g. AT301 / Flex Solar Tracker → `asset-track`; Hermes Camera →
`snapshot`). Modules query hardware by feature tag at runtime — they never
hardcode vendor or hardware names. This is the mechanism that replaces the
hardcoded `isOysterTracker()` / `isAssetTrackerDevice()` functions currently
in asset-track.js (see Known Issues / Technical Debt).

### API Definitions — standardized output mapping

Existing `registry_apis.fields` entries (see API-1, "User Login
Confirmation," for a real working example) gain one new property: `mapsTo`
— the standardized module-level output field this source field feeds. Two
different vendors' wildly different field names (e.g. `battVolt` vs.
`voltage_reading`) both declare `mapsTo: "battery_voltage"`, so their data
lands in the same output column regardless of vendor-specific naming. This
requires a defined output schema per module (e.g. Asset Track expects:
`battery_voltage`, `last_seen`, `device_status`) that every vendor's
relevant API Definition must map into.

### Flows — module-tagged, multi-vendor merge

A Flow chains one or more API Definitions into a named, reusable outcome
(e.g. "Asset Track — Teletrac," "Asset Track — PowerFleet"). Flows are
tagged with which module consumes them. At runtime, a module looks up every
Flow tagged for it, runs all of them, and merges results **by asset**
(legacy number) into one output table — an asset with data from only one
vendor's flow simply shows that vendor's data; no error, no special case.

### Two-phase ingestion pattern (applies to any vendor)

- **Phase 1 (file-based):** vendor sends data via email/Power Automate push
  to a Worker endpoint, governed by that vendor's File Spec. No outbound API
  call involved — File Spec sits outside the Definitions/Flows framework.
- **Phase 2 (API-based):** vendor migrates to direct API polling. Gets a
  real API Definition + Flow, replacing the file-push mechanism. Everything
  downstream of "we have parsed rows of identifying data" is agnostic to
  which phase supplied it — no rebuild required when a vendor migrates from
  Phase 1 to Phase 2.

### Admin UI (not yet built)

New "Vendor" tab in Admin, card grid matching the existing Role Management
pattern (see admin.js — cards with an action button, dashed "+ Create New"
card). One card per vendor. Click a card → detail view with the nested tab
set described above.

**Migration note:** once built, the existing standalone "Control Tables"
and "API Reference" Admin tabs are removed — their content and data move
inside each vendor's detail view. CT-001 (Oyster Battery Status) and
existing registry_apis rows (API-1, etc.) get backfilled with a vendor_id
pointing to a new "Teletrac Navman" vendor row. Safe to do at any point —
per Module Status below, Control Tables are not yet wired into any live
module code, so this is a data/UI restructure, not a live-breaking change.

**Fleet Utilisation relationship — do not conflate:** Fleet Utilisation is
a vendor-agnostic, top-level module in its own right (own nav entry, own
dashboard, own D1 tables), not owned by or nested under any vendor. A
vendor's File Spec (e.g. "TGE Static Fleet," or a future KM-data vendor)
feeds data into Utilisation's tables — it does not live inside Utilisation,
and Utilisation does not live inside any one vendor.

---

## Fleet Utilisation Module

Full working design and decision log lives in a dedicated document:
`fleet-utilisation-spec.md`. Summary of current state as of this version:

**Live and working:**
- Static fleet import — `POST /api/utilisation/static-fleet/import`. Tested
  end-to-end with the real 11,588-row weekly fleet file, via a chunked
  multi-request pattern (large files split client-side; only the final
  chunk triggers soft-delete evaluation, based on `last_seen_at` vs. a
  shared batch start time — see fleet-utilisation-spec.md §1f).
- Soft-delete / reactivate — assets missing from the current weekly file
  are marked `inactive` (not hard-deleted); assets that reappear are
  auto-reactivated. Static fleet file is always treated as source of truth.
- Field mappings — `GET`/`PUT /api/utilisation/static-fields`. Self-seeding:
  any new source column encountered on import is auto-inserted as a
  disabled stub, no manual seed step required. 13 of the 34 real columns
  currently flagged as save/filter (Legacy Number as identity + filter,
  BU/BU Name/Equip Type/Operator State/Operator Name as filters, plus
  Description/Rego/Make/Model/Home Location/Equipment Status/Ownership
  saved for future use).
- Exclusion rules — `utilisation_static_exclusion_rules`, draft → preview →
  publish. Per-column, exact/contains match. Resolved this session:
  filtering happens **only at query time** (`GET
  /api/utilisation/static-fleet`), never at import — import always saves
  every row unconditionally, so a bad rule can never destructively drop
  data that would otherwise require a week's wait to recover.
- Import audit trail — `utilisation_import_runs` / `utilisation_import_errors`
  now write real counts (inserted/updated/failed) and error rows, not
  placeholder values.

**Not yet built:**
- `utilisation_static_fleet_history` — weekly snapshot table for the
  History toggle and BU/location movement tracking. Design agreed, table
  not yet created.
- Any admin UI — field mappings, exclusion rules, and import history are
  currently only editable via direct API calls (browser console / curl).
  Per the Vendor Platform design above, this will live as "TGE Static
  Fleet"'s File Spec + Import History tabs once the Vendor Admin UI exists.
- Dashboard grid wiring — `public/utilisation.js` does not yet call
  `GET /api/utilisation/static-fleet`; the dashboard UI shell still shows
  an empty 0/0 state despite live data existing in D1.
- Vendor KM ingestion (`utilisation_vendors`, `utilisation_daily_km`) —
  design only, no vendors onboarded yet. Layouts vary per vendor; no fixed
  set of "types" assumed.
- Analysis tab — mockup only (north-star KPIs, sparkline grid, utilisation
  rate, outliers, BU × equip type heatmap, trend, downtime breakdown, BU
  movements, cost vs. utilisation pending a cost-per-asset data source).
- Permissions for the `utilisation` feature (`view`,
  `manage-field-mappings`, `manage-static-sanitising`) were not seeded for
  any role by default — including superuser, which gets no implicit bypass
  in this codebase. Had to be inserted manually before any testing could
  proceed. Worth adding to whatever process provisions a new environment.

---

## Backend Worker Routes (src/index.js)

```
/api/auth/*                     — login, logout, session
/api/admin/users/*              — user CRUD
/api/admin/roles/*              — role CRUD
/api/admin/permissions/*        — permissions CRUD
/api/admin/activity             — activity log
/api/admin/control-tables/*     — control table CRUD (migrating into Vendor Platform)
/api/admin/camera-history/*     — camera history admin
/api/registry/*                 — API registry CRUD (migrating into Vendor Platform)
/api/tn360/*                    — TN360 API proxy
/api/mailer/signatures/*        — email signature CRUD
/api/send-email                 — Power Automate webhook forwarding
/api/camera-fault-pdf           — Camera fault report PDF
/api/snapshot-pdf               — Snapshot report PDF
/api/asset-track-pdf            — Asset Track report PDF
/api/image-proxy                — Authenticated image proxy (on-screen display)
/api/image-size                 — Image size check
/api/sign-image-url             — Signed public URL generator (built, currently unused)
/api/public-image               — Public image proxy (built, currently unused)
/api/historical-snapshots       — Historical snapshot events (requires TN360_SNAPSHOT_KEY)
/api/historical-snapshots/attachments — Attachment content fetch
/api/utilisation/static-fleet/import      — Static fleet import (X-Import-Key auth, not session)
/api/utilisation/static-fleet             — Get current fleet (session auth)
/api/utilisation/static-fields            — GET/PUT field mappings
/api/utilisation/static-exclusions        — Get exclusion rules (draft/published)
/api/utilisation/static-exclusions/draft  — PUT draft rules
/api/utilisation/static-exclusions/preview — POST preview exclusion impact
/api/utilisation/static-exclusions/publish — POST publish draft → live
/api/ping                       — Health check
```

---

## Email System

**Flow:** email-composer.js → /api/send-email → Power Automate → OneDrive → Office 365

**Power Automate workaround:** Direct base64 attachment to Send Email (V2) produces corrupt 262-byte file (confirmed PA bug). Fix: Create file in OneDrive → Get file content → attach file content object to Send Email.

**Webhook payload:**
```json
{
  "to": "...", "cc": "...", "bcc": "...",
  "subject": "...", "htmlBody": "...",
  "attachmentName": "file.pdf",
  "attachmentBase64": "JVBERi..."
}
```

---

## Permissions System

```javascript
TGE.can('feature', 'action')    // boolean
TGE.limit('feature', 'action')  // number (null → Infinity)
```

`limit_value` must be on the correct action row. For Asset Track user input limit: `user-mode` action, NOT `run` action.

**Important:** superuser does not get an implicit bypass — every feature/action combination must have an explicit row in `permissions` for every role, including superuser. Discovered during Fleet Utilisation testing (July 2026) when superuser received "Access denied" on `utilisation.*` routes with no rows seeded. Any new feature must seed its permissions for all relevant roles as part of setup, not assume superuser is exempt.

---

## Module Status

| Module | Status | Notes |
|---|---|---|
| Platform (all tge-*.js + export-pill.js) | ✅ Complete | |
| Asset Track | ✅ Locked v1.0 | Reference implementation |
| Snapshot | ✅ Locked v1.0 | PDF, Email PDF, exports, alignment sim |
| Camera Snapshots | 🔄 Active | Email composer wired |
| Camera Count | 🔄 Active | Email composer wired |
| Merge Mail | 🔄 Active | Shared composer, CSV/XLSX import |
| Admin | 🔄 Active | Users, History, API Ref, Mailer Data, Control Tables — API Ref/Control Tables migrating into Vendor Platform |
| camera.js | ❓ Unknown | Verify: legacy dead code or active utility? |
| Fleet Utilisation | 🔄 Active — backend live | Static fleet import, soft-delete/reactivate, field mappings, exclusion rules, import audit trail all working with real data (11,588 assets). Dashboard grid wiring, history table, admin UI, vendor KM ingestion, and Analysis tab not yet built. No longer a stub — see Fleet Utilisation Module section above |
| VPM | ❓ Unknown | Verify current state |
| Vendor Platform | ⏳ Design locked, not built | See Vendor Platform section above |
| Camera Requests | ⏳ Pending | Not started |
| Workflow Engine | ⏳ Pending | Not started |
| API Management | ⏳ Pending | Not started |

---

## Engineering Rules

**File and Code Standards:**
- Lower-case file names, CamelCase methods
- Platform namespaces only (TGE.output, TGE.progress, TGE.pdf, TGE.diagnostics)
- No duplicate code — if two modules need the same thing, it's a platform service
- No legacy code — remove during refactoring
- No hardcoded business logic in module files — use Control Tables (migrating into Vendor Platform)
- All errors must log to TGE.diagnostics — no silent failures

**Change Process:**
- One change at a time with confirmation before next
- Always specify: File / Find / Replace / Reason
- No code until approach is agreed
- Full-document rewrites (rather than sequential find/replace) are acceptable for non-runtime documentation files where a coherent single review is clearer than a stack of interdependent patches — code changes still follow strict File/Find/Replace/Reason
- Where the agreed design drifts from an earlier decision, the drift must be a clear improvement over the current state before it's adopted — not change for its own sake

**Vendor Platform Rule (new):**
- Every vendor gets the identical template of tabs/tables, always, whether
  currently used or not. A new capability is added to the shared template,
  never to one vendor individually. No vendor is ever a special case.

**Module Lifecycle:**
```
Design → Development → Platform Integration → Diagnostics → QA → LOCK → Bug fixes only
```

**QA Requirements:**
- Full QA checklist must pass before lock
- Limits must be tested specifically
- No console errors
- All failures captured in diagnostics

**Documentation:**
- Update all three markdown files after: 10 bug fixes, major feature, architecture change, module lock

### File Responsibility Rule

Every new file must belong to one architectural layer.

- index.html
- tge-*
- service-*
- platform-*
- screen-*

If a file does not naturally belong to one of these layers, stop and review the design before creating it.
---

## Long-Term Roadmap

1. ✅ Platform Foundation
2. ✅ Asset Track v1.0
3. ✅ Snapshot v1.0
4. ⏳ SD Card Health review (Snapshot)
5. 🔄 Fleet Utilisation — static fleet backend live; dashboard wiring, history table, admin UI, vendor KM ingestion, Analysis tab remaining
6. ⏳ Vendor Platform — vendors + hardware_types schema, mapsTo field mapping, Flows, Admin UI, Control Table/API Registry migration
7. ⏳ Control Table Platform full wiring — rebuilt on top of Vendor Platform rather than standalone (supersedes prior roadmap item)
8. ⏳ Roles Platform expansion (rate limiting, batch limits)
9. ⏳ Camera Requests
10. ⏳ Workflow Engine
11. ⏳ API Management
12. ⏳ Production Hardening
13. ⏳ Diagnostics Platform enhancements

Asset Track v1.0 is and remains the reference implementation for all future module development.



evrything above was previouse update,

everything below is current update 06/07/2026

# PROJECT-ARCHITECTURE.md
**Updated: 6 July 2026 — Vendor Platform built end to end (definition layer complete)**

## The core model (LOCKED)
Business rules live in D1, not JS. No vendor, hardware, or screen name
is hardcoded anywhere. The vendor tables dictate; flows align; modules
consume by tag. Adding a vendor is pure data entry: create vendor →
auth profile → API definitions → hardware types → control tables →
flow. Zero code.

## Runtime model (LOCKED — engine not yet built)
A screen module asks: "give me every active flow tagged for me"
(`flows.module_tag` = screen key, e.g. `asset-track`). It runs each
vendor's flow, merges results per asset, renders. Flows REPLACE direct
API calls and direct CT lookups at runtime; the definition tabs are
the reusable parts library, flows are the assembly, modules consume
only flows. A control table with no flow referencing it does nothing.

A flow = ordered steps. Step types (open list, worker-validated —
new types are one string, never a migration):
- `api_definition` — call this definition (auth profile + call_spec applied)
- `control_table` — apply these rules to gathered data
- `hardware_type` — reference one hardware row (surgical cases)
- `hardware_set` — reference ALL hardware rows where
  `applies_to_feature = <tag>`; membership is data, so new hardware
  joins every referencing flow by insertion alone
Steps are lenses/calls in declared order; the engine may optimise
(e.g. hardware filtering before later calls).

## Vendor template (identical for every vendor, used or not)
Card grid (screen-vendor.js) → detail with tabs:
Overview · File Spec · API Registry (Definitions) · Hardware Types ·
Control Tables · Flows · Import History.
Built and live: Overview, API Registry, Hardware Types, Control
Tables, Flows. Placeholder: File Spec, Import History (File Spec's
first real use = TGE Static Fleet mappings + container/trailer
"tick and flick" exclusions — deferred by design).

## Data model — as deployed (source of truth: live D1 + src/migrations/)
**Migration 001:** `vendors` (id, name, active, notes, timestamps) ·
`flows` (vendor_id, name, module_tag, notes, active; UNIQUE(vendor_id,
name)) · `flow_steps` (flow_id, sort_order, step_type TEXT open,
step_ref TEXT — holds text api_ids and numeric ids) · `hardware_types`
(base) · `control_tables.vendor_id` + `registry_apis.vendor_id`
(nullable; children inherit vendor via parent — rules/hardware tables
deliberately do NOT carry vendor_id).
**Migration 002:** `hardware_types` rich device identity — device_type,
type_id, type_code, type_name, model_id, model_name, category, family,
capabilities (JSON), raw_example. Vendor identifiers verbatim from the
vendor's API. `applies_to_feature` = hardware-set tag (screen keys as
vocabulary; NULL = identified, not yet routed). UNIQUE(vendor_id,
code). Future need logged: multi-set membership (list or join table)
when one device serves two screens. (`vendor_hardware_types` from a
parallel build was dropped here.)
**Migration 003:** `vendor_auth_profiles` (vendor_id, name, auth_type,
auth_name, secret_ref, active; UNIQUE(vendor_id, name)) ·
`registry_apis.auth_profile_id` · `registry_apis.call_spec` (JSON:
dateFormat, timezone, maxRangeDays, notes).

`registry_apis.fields` (JSON) tag schema: {name, label, use
(display|feeds-next|filter-rule|match|internal), description, path,
example, hardCheck} + array-filter tags add {isArrayFilter,
arrayPath, filterKey, filterVal, extractField} — engine executes the
structured filter, not the display path (display paths may embed a
literal map key; Constraint Notes carry map-iteration instructions).

## Auth profiles (how calls authenticate)
Recipe per key, defined once per vendor, selected per definition
(inline "+ New" in the editor auto-creates; deduped on recipe;
same-name-different-recipe updates in place). auth_type open list:
query_param | header_bearer | header_token | header_custom |
session_passthrough | none. secret_ref = NAME of a Cloudflare Worker
secret; value never touches the app. TN360 reality: at least three
profiles (REST Key ?key= / TN360_API_KEY; Token token="…" styles on
TN360_PERSONAL_KEY and TN360_SNAPSHOT_KEY; plus per-user session
passthrough for history).

## Definition workflow (LOCKED): define → save → test → lock
Test modal (one test feature; legacy /api/tn360 proxy path in the
modal was removed) executes the SAVED definition via
POST /api/registry/apis/{id}/test — worker assembles URL + profile +
secret, substitutes {placeholder} params from the modal's inputs,
returns status + body (display-truncated 60KB) + first 25 parsed
records for array responses. Record picker: default first 2, any
range, max 5 → "Use as Sample" saves straight to the definition.
Non-array/oversized refused politely; worker guard 400s >100KB.

## Capture tooling
Bulk tag editor (tick/label/use per field) + **Expand Array** (Stage
1, built): arrays of objects render grouped by auto-detected
discriminator (prefers a field named/like `type`; overridable),
every leaf tickable with inline label+use, one save emits structured
conditional tags. Stage 2 (specced, not built): sub-value definitions
— split packed strings (GPIO/camera lines) into tagged segments; build
against the first real specimen. Stage 3 (specced, flow-engine era):
structure learning — engine diffs live responses vs definitions,
queues unseen kinds/keys on the definition for tagging ("living
definitions").

## Worker route pattern (all new endpoints follow it)
Vendor-scoped REST: /api/vendors/{id}/… (hardware-types, control-
tables, flows, auth-profiles) + /api/registry/apis[…]. Every handler:
requireSession → hasPermission('vendor','view'|'manage') → work →
logActivity on writes. Duplicate prechecks return clean 400s. Old
admin endpoints (session-only) remain until clear-out.

## Permissions
Feature `vendor`: view, manage, import + EXPORT_ACTIONS (full pill).
FEATURES composes the shared EXPORT_ACTIONS constant — pill assigned
⇒ all options toggleable. New features dark until ticked per role.

## First flow (exists as data — flow id 1)
"Asset Track — Teletrac Navman", module_tag asset-track:
API-1 (vehicles) → API-2 (devices) → API-3 (meters) →
hardware_set:asset-track (Oyster 433 + Flex Solar 85) → CT-001.
Semantics: fetch vehicles → fetch devices → fetch meters → keep the
asset-track hardware → apply battery rules → feed the screen.
The hardcoded runAssetTrack()/getBatteryStatus()/isOysterTracker()
pipeline remains LIVE and untouched until the flow engine replaces it
(deliberate duplication as safety net; deletion happens at cutover).

## Flow engine (NEXT PHASE — parts already exist)
Call primitive = the test endpoint's assembly (auth + params).
call_spec drives date formatting and range chunking (camera-history's
hardcoded chunking becomes generic). Tags drive output mapping: labels
are the standard names (projectdocs/standard-output-names.md) that
merge multi-vendor data into screen columns (the mapsTo concept).
Hardware sets matched via type_code/model_id discriminators. Map-
shaped responses iterated per Constraint Notes. Undefined-structure
queue = Stage 3.
