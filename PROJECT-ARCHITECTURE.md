# TGE Asset Snapshot — Project Architecture

Version: 2.0
Last Updated: June 2026

---

## Project Standards

Platform-first architecture. Modules do not duplicate functionality. Shared services provide all common functionality. Business rules live in D1 tables, not in JS code. No hardware names or thresholds hardcoded in module files.

---

## Deployment Architecture

```
GitHub (main branch)
    ↓ push triggers
Cloudflare Build (bun install + npx wrangler deploy)
    ↓
Cloudflare Worker (src/index.js)
    ├── Serves static assets from /public/
    ├── Proxies TN360 API calls (keeps API keys server-side)
    ├── D1 database access (users, permissions, sessions, signatures, control tables)
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
  level: 'error' | 'warn' | 'info' | 'success',
  module: 'module-name',
  action: 'what was attempted',
  status: 'HTTP status or result',
  message: 'human readable description',
  error: 'error string if applicable',
  request: { ...payload sent },
  response: { ...response received }
});
```

### TGE.Progress (tge-progress.js)
Concurrent batch runner for large API operations. Used for progressive loading where results appear as they come back rather than all at once.

```javascript
TGE.Progress.run({
  items: [],           // array to process
  concurrency: 5,      // parallel workers
  delay: 300,          // ms delay between items
  worker: async function(item, index) { return result; },
  onItem: function(result, item, index) { /* add to state */ },
  onProgress: function(done, total, results) { /* update UI */ },
  onError: function(errorObj, item, index) { /* log to diagnostics */ },
  onComplete: function(results) { /* final cleanup */ }
}).promise;
```

Note: onError receives `{ ok: false, error: '...', item: ..., index: ... }` not a raw Error object.

### TGE.PDF (tge-pdf.js)
PDF generation platform. Modules call these — they never generate PDFs themselves.

```javascript
// Download PDF directly
await TGE.PDF.download({
  route: '/api/module-pdf',
  module: 'ModuleName',
  type: 'Report',
  payload: { rows: [...], summary: {...} }
});

// Build PDF as base64 attachment for email
var attachment = await TGE.PDF.attachment({
  route: '/api/module-pdf',
  module: 'ModuleName',
  type: 'Report',
  payload: { rows: [...], summary: {...} }
});
```

PDF layout and styling are defined in tge-pdf.js and the Worker (src/index.js PDF handlers). Modules only pass data.

### TGE.output (tge-output.js)
Export dropdown and file naming platform.

```javascript
// Build export dropdown pill in hero bar
TGE.buildOutputPill('prefix', exportItems())

// Wire export dropdown events
TGE.wireOutputPill('prefix', exportItems())

// Close export dropdown
TGE.closeOutputPill('prefix')

// Generate consistent file name
TGE.outputFileName({ module: 'ModuleName', type: 'Report', extension: 'csv' })
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

Every module is an IIFE (Immediately Invoked Function Expression) in its own file. Modules register themselves with the app via:

```javascript
TGE.onShow['module-name'] = function() { /* called when nav item clicked */ };
```

### Module State Pattern
- State object at the top of the IIFE — all module state lives here, nowhere else
- If a module has multiple modes (e.g. User/Fleet), use separate arrays per mode (e.g. `state.userRows`, `state.fleetRows`) — never share one array between modes
- `onShow` must check if the view is already built before re-rendering:

```javascript
TGE.onShow['module-name'] = function() {
  var alreadyBuilt = !!TGE.el('module-key-element');
  if (!alreadyBuilt) {
    render();
    return;
  }
  // Restore previous state without re-rendering
  if (state.rows && state.rows.length) {
    // show results
  } else {
    // show empty state
  }
};
```

### Navigation Persistence Rule
Data must persist when user navigates away and returns. Refresh button is the only mechanism for clearing data. Re-running clears old data before new data populates. Mode switching never loses data from the other mode.

### Render Pattern
- `render()` builds the full HTML skeleton and calls `wireEvents()`
- `renderRows()` updates only the data section — never rebuilds the skeleton
- Mode switches update only the affected DOM elements (button states, input visibility) — never call `render()`

---

## Control Table Platform (Partially Built — Full Build Pending)

### Current State
One control table exists: CT-001 "Teletrac Navman - Oyster Battery Status" (Asset Track feature, evaluates battCurrent, outputs battStatus). Managed in Admin → Control Tables. NOT yet wired into module code — asset-track.js still uses hardcoded logic.

### Planned Architecture
Rule-driven, table-controlled behaviour. No hardware names or thresholds in module JS files.

**D1 Tables (planned):**
```sql
vendors (id, name, active)
hardware_types (id, vendor_id, name, code, active)
-- e.g. vendor: Teletrac Navman, hardware: AT301, Solar, Hermes, Camera, Tablet
```

**Admin UI flow (planned):**
1. Add vendor in Vendors tab
2. Add hardware types under that vendor
3. Create/edit control table → vendor dropdown and hardware type tabs auto-populate from the above tables
4. Each hardware type tab has its own independent rules
5. Save → app updates immediately, no redeploy

**Table Types (planned):**
- **Battery Status** — voltage ranges → status labels per hardware type per vendor
- **Last Reported** — last-seen age thresholds → status labels (Reporting/Review/Critical) per hardware type
- **Hardware Exclusion** — which hardware types are included/excluded from which feature/run

**Runtime module calls (planned):**
```javascript
TGE.rules.isIncluded('asset-track', device)     // replaces isAssetTrackerDevice()
TGE.rules.evaluate('battery-status', device, v)  // replaces getBatteryStatus()
TGE.rules.getStatus('last-reported', device, ts) // replaces getLastSeenStatus()
```

**Current workarounds (temporary, to be replaced):**
- Battery status: `getBatteryStatus()` / `isOysterTracker()` hardcoded in asset-track.js
- Last-seen: `THRESHOLD_REPORTING_DAYS = 7`, `THRESHOLD_REVIEW_DAYS = 14` hardcoded in asset-track.js
- Hardware inclusion/exclusion: `isAssetTrackerDevice()` hardcoded in asset-track.js

---

## Backend Worker (src/index.js)

Single file handles all backend routes. Growing large — future: consider splitting into route handler modules.

**Key route groups:**
- `/api/auth/*` — login, logout, session
- `/api/tn360/*` — TN360 API proxy (vehicles, devices, meters, events, cameras)
- `/api/mailer/*` — signature CRUD
- `/api/send-email` — Power Automate webhook forwarding
- `/api/camera-fault-pdf` — Camera fault report PDF generation
- `/api/asset-track-pdf` — Asset Track PDF generation
- `/api/image-proxy` — Authenticated image proxy (for on-screen display)
- `/api/sign-image-url` — Signed public URL generator (built, currently unused)
- `/api/public-image` — Public image proxy using signed URLs (built, currently unused)
- `/api/control-tables/*` — Control table CRUD

**PDF generation in Worker:**
Camera fault report PDF uses pdf-lib (npm, bundled by Wrangler). Layout spec is fixed and validated:
- A4 landscape, 4 asset-bands per page
- Fixed-size photo boxes (always calculated for 5 slots, fewer boxes drawn for fewer cameras, centered)
- Full design details in AI-HANDOVER.md

---

## Email System

**Flow:** email-composer.js (client) → /api/send-email (Worker) → Power Automate webhook → OneDrive (file temp storage) → Office 365 Send Email (V2)

**Power Automate workaround:** Direct base64 attachment to Send Email (V2) produces corrupt 262-byte file (confirmed PA bug). Fix: Create file in OneDrive → Get file content using path → attach file content object to Send Email. This works reliably.

**Webhook payload:**
```json
{
  "to": "...", "cc": "...", "bcc": "...",
  "subject": "...", "htmlBody": "...",
  "attachmentName": "file.pdf",     // optional
  "attachmentBase64": "JVBERi..."   // optional
}
```

**Email body structure (no banner, no footer, plain standard email):**
```
{User's typed body text}
{Camera status table — only for Camera Snapshots/Count pages}
{Signature — if inserted via {signature:id} tag}
[PDF attachment — only if checkbox ticked]
```

---

## Permissions System

Permissions are stored in D1 `permissions` table: `(role_id, feature, action, enabled, limit_value)`.

Loaded at login (handleLogin returns full permMap same as handleSession — fix applied, no more first-login-missing-permissions bug).

**In JS:**
```javascript
TGE.can('feature', 'action')           // boolean — can user do this?
TGE.limit('feature', 'action')         // number — what's the limit? (null → Infinity)
```

**Important:** `limit_value` must be on the correct action row. For Asset Track user input limit, it belongs on `user-mode` action, NOT on `run` action. The `|| 500` fallback in old code treated falsy limit values (including 0) as "no limit" — corrected to check `!= null && !== Infinity`.

---

## Module Status

| Module | Status | Notes |
|---|---|---|
| Platform (all tge-*.js) | ✅ Complete | |
| Asset Track | ✅ Locked v1.0 | Reference implementation |
| Snapshot | 🔄 In Progress | Bugs 1+2 fixed, Bugs 3+4 pending |
| Camera Snapshots | 🔄 Active | Email composer wired |
| Camera Count | 🔄 Active | Email composer wired |
| Merge Mail | 🔄 Active | Shared composer, CSV/XLSX import |
| Admin | 🔄 Active | Users, History, API Ref, Mailer Data, Control Tables |
| Camera (camera.js) | ❓ Unknown | Verify: legacy dead code or active utility? |
| Fleet Utilisation | ⏳ Stub | Non-functional, design not started |
| VPM | ❓ Unknown | Verify current state |
| Camera Requests | ⏳ Pending | Not started |
| Workflow Engine | ⏳ Pending | Not started |
| API Management | ⏳ Pending | Not started |

---

## Engineering Rules

**File and Code Standards:**
- Lower-case file names
- CamelCase methods
- Platform namespaces only (TGE.output, TGE.progress, TGE.pdf, TGE.diagnostics)
- No duplicate code — if two modules need the same thing, it belongs in a platform service
- No legacy code — remove during refactoring, not later
- No hardcoded business logic in module files — use Control Tables

**Change Process:**
- Always specify: File / Find (exact text) / Replace / Reason
- One change at a time with confirmation before next change
- No code written until approach is discussed and agreed
- Review every section before making changes

**Module Lifecycle:**
```
Design → Development → Platform Integration → Diagnostics → QA → LOCK → Bug fixes only
```

**QA Requirements (non-negotiable before lock):**
- Full QA checklist must pass (see CURRENT-SPRINT.md)
- Limits must be tested specifically
- No console errors
- Diagnostics must capture all failures (no silent errors)

**Documentation:**
- Update all three markdown files after: 10 bug fixes, major feature, architecture change
- AI-HANDOVER.md must be detailed enough for a new AI to pick up the project without any other context

---

## Long-Term Roadmap

1. ✅ Platform Foundation
2. ✅ Asset Track v1.0
3. 🔄 Snapshot v1.0
4. ⏳ Control Table Platform (vendors, hardware types, rule-driven module logic)
5. ⏳ Fleet Utilisation
6. ⏳ Roles Platform expansion (rate limiting, batch limits, expanded permissions)
7. ⏳ Camera Requests
8. ⏳ Workflow Engine
9. ⏳ API Management
10. ⏳ Production Hardening
11. ⏳ Diagnostics Platform enhancements

Asset Track v1.0 is and remains the reference implementation for all future module development.
