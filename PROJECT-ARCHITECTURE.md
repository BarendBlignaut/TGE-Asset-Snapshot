# TGE Asset Snapshot — Project Architecture

Version: 3.0
Last Updated: 28 June 2026

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

## Control Table Platform (Partially Built — Full Build Pending)

### Current State
CT-001 "Teletrac Navman - Oyster Battery Status" exists and is active. Admin UI for control tables is built. NOT yet wired into module code.

### Planned Architecture
```sql
vendors (id, name, active)
hardware_types (id, vendor_id, name, code, active)
```

**Runtime module calls (planned):**
```javascript
TGE.rules.isIncluded('asset-track', device)
TGE.rules.evaluate('battery-status', device, value)
TGE.rules.getStatus('last-reported', device, timestamp)
```

**Current workarounds to be replaced:**
- `getBatteryStatus()` / `isOysterTracker()` hardcoded in asset-track.js
- `THRESHOLD_REPORTING_DAYS = 7`, `THRESHOLD_REVIEW_DAYS = 14` hardcoded
- `isAssetTrackerDevice()` hardcoded in asset-track.js

---

## Backend Worker Routes (src/index.js)

```
/api/auth/*                     — login, logout, session
/api/admin/users/*              — user CRUD
/api/admin/roles/*              — role CRUD
/api/admin/permissions/*        — permissions CRUD
/api/admin/activity             — activity log
/api/admin/control-tables/*     — control table CRUD
/api/admin/camera-history/*     — camera history admin
/api/registry/*                 — API registry CRUD
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
/api/utilisation/*              — Utilisation module routes
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
| Admin | 🔄 Active | Users, History, API Ref, Mailer Data, Control Tables |
| camera.js | ❓ Unknown | Verify: legacy dead code or active utility? |
| Fleet Utilisation | ⏳ Stub | Non-functional, design not started |
| VPM | ❓ Unknown | Verify current state |
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
- No hardcoded business logic in module files — use Control Tables
- All errors must log to TGE.diagnostics — no silent failures

**Change Process:**
- One change at a time with confirmation before next
- Always specify: File / Find / Replace / Reason
- No code until approach is agreed

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

---

## Long-Term Roadmap

1. ✅ Platform Foundation
2. ✅ Asset Track v1.0
3. ✅ Snapshot v1.0
4. ⏳ SD Card Health review (Snapshot)
5. ⏳ Control Table Platform (vendors, hardware types, rule-driven module logic)
6. ⏳ Fleet Utilisation
7. ⏳ Roles Platform expansion (rate limiting, batch limits)
8. ⏳ Camera Requests
9. ⏳ Workflow Engine
10. ⏳ API Management
11. ⏳ Production Hardening
12. ⏳ Diagnostics Platform enhancements

Asset Track v1.0 is and remains the reference implementation for all future module development.
