# TGE Asset Snapshot — Current Sprint

Sprint: 03
Status: IN PROGRESS
Last Updated: 28 June 2026

---

## Phase Status

Phase 1 — Platform Foundation
✓ COMPLETE

Phase 2 — Asset Track
✓ LOCKED v1.0 — QA Passed

Phase 3 — Snapshot
✓ LOCKED v1.0 — QA Passed

Phase 4 — SD Card Health + Control Table Platform
IN PROGRESS

---

## Current Task

SD Card Health — review and verify independent data flow in Snapshot module.

---

## Snapshot v1.0 — LOCKED ✅

All items completed and QA passed:

✅ A1/A2 — onShow pattern and navigation persistence
✅ A5/A6 — removed duplicate local helpers (show() removed, TGE.show() used directly)
✅ P1 — export dropdown using TGE.buildOutputPill/wireOutputPill
✅ P2/P3 — CSV/JSON use TGE.outputFileName for platform file naming
✅ P6 — diagnostics logging in all catch blocks (runSnapshot, exportPdf, alignmentTest)
✅ AL3 — alignment step state included in diagnostics log
✅ H2 — DST-aware toAestIso() (ready for history build)
✅ Bug 1 — nav button shows "Asset Snapshot"
✅ Bug 2 — Refresh correctly clears all data, returns to true empty state
✅ Bug 3 — PDF export via TGE.PDF.download() → /api/snapshot-pdf
✅ Bug 4 — Email PDF wired to TGE.openEmailComposer with attachmentBuilder
✅ Alignment simulation — all 6 steps tick through 2s delays, AFTER images populate, main page updates on close
✅ History panel — no API calls, clean "Camera history coming soon." message
✅ PDF layout — portrait A4, single page, auto-spacing, rounded header/footer, green pill labels, compact data cards, natural aspect ratio photos, alignment after section (conditional)
✅ PDF payload — all sections: Vehicle Info, Devices, Live Status, Engine Metrics, GPIO, Evidence (camera photos), Alignment Test After (if completed), SD Card Health, Location
✅ Export pill — PDF, Email PDF, CSV, JSON, Excel (Excel falls back to CSV — XLSX deferred)

**Deferred items (not blockers for lock):**
- XLSX export — SheetJS implementation (backlog item 5)
- History rewrite — pending Teletrac API direction (backlog item 6)
- Alignment real API — pending Teletrac camera trigger endpoint

---

## Next Items

### 1. SD Card Health — Snapshot (CURRENT)
SD Card Health currently populates by reading DOM element text content from snap-sd1, snap-sd2 etc. This is fragile — if the DOM hasn't fully populated before PDF export is triggered, values may be missing. Need to verify:
- Does SD Card data always populate before Export is available?
- Should SD Card data be stored in state rather than read from DOM at export time?
- Is the current approach reliable in practice?

### 2. Control Table Platform
- Build vendors D1 table
- Build hardware_types D1 table
- Update Admin UI: Vendors tab, hardware type management
- Update Control Tables tab: vendor dropdown, hardware type tabs auto-populate
- Build table types: Battery Status, Last Reported, Hardware Exclusion
- Wire asset-track.js into Control Table platform (replace hardcoded logic)

---

## Backlog (Ordered by Priority)

1. SD Card Health — Snapshot data flow review (CURRENT)
2. Control Table Platform — full build (vendors, hardware_types, wire asset-track.js)
3. Solar battery status — waiting on Teletrac vendor data
4. Asset Track Fleet Mode rate limiting — server-side, max runs per user per time period
5. Snapshot XLSX export — SheetJS implementation
6. History rewrite — 7-day window, events endpoint direct, S3 URL expiry check, no storage (pending Teletrac direction)
7. Fleet Utilisation module (utilisation.js — stub, design not started)
8. Roles Platform expansion — rate limiting, batch limits, expanded permissions
9. Camera Requests module
10. Workflow Engine
11. API Management
12. Production Hardening
13. Diagnostics Platform enhancements

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

### Sprint 02 (previous)
✓ Shared platform architecture (export-pill.js, tge-progress.js, tge-pdf.js, tge-diagnostics.js)
✓ Asset Track v1.0 — developed, QA passed, LOCKED
✓ Email composer shared platform
✓ Camera Fault Report PDF (locked design)
✓ Power Automate email flow with PDF attachment
✓ Mailer Data admin tab
✓ Control Tables admin tab (CT-001 Oyster Battery Status active)
✓ Merge Mail page
✓ Login permission timing fixed

### Sprint 03 (this sprint)
✓ Snapshot v1.0 — all fixes applied, QA passed, LOCKED
✓ Snapshot PDF — portrait A4, auto-spacing, rounded header/footer, full layout
✓ Snapshot alignment simulation — full visual flow, AFTER images on main page
✓ Snapshot history — cleaned out broken API calls, holding message
✓ Snapshot exports — PDF, Email PDF, CSV, JSON all working
✓ Snapshot diagnostics — logging in all catch blocks
✓ Platform file naming (TGE.outputFileName) for CSV and JSON
✓ DST-aware toAestIso() ready for history build
✓ Documentation updated (v3.0)

---

## Blockers

None currently.

Waiting on (external):
- Teletrac Navman: solar tracker battery voltage specification
- Teletrac Navman: API key scope expansion for attachment content endpoint — currently returns 401
- Teletrac Navman: camera trigger endpoint fix — currently returns 405
- Teletrac Navman: direction on camera history API approach (7-day window confirmed, implementation TBD)
- 
