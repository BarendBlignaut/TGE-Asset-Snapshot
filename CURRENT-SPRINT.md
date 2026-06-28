# TGE Asset Snapshot — Current Sprint

Sprint: 02
Status: IN PROGRESS
Last Updated: June 2026

---

## Phase Status

Phase 1 — Platform Foundation
✓ COMPLETE

Phase 2 — Asset Track
✓ LOCKED v1.0 — QA Passed

Phase 3 — Snapshot
IN PROGRESS

---

## Current Task

Complete Snapshot (Asset Snapshot) module development.

---

## Snapshot Development Status

### Bugs Fixed This Session
✅ Bug 1 — Page name: nav button now shows "Asset Snapshot" (was "Snapshot")
✅ Bug 2 — Refresh button: now correctly clears all data and returns to true empty state (was re-running the search and leaving empty table shell visible)

### Bugs Confirmed, Not Yet Fixed
❌ Bug 3 — PDF export: currently calls window.print() — dumps raw app UI. Must be replaced with real PDF generation via tge-pdf.js. Root cause confirmed.
❌ Bug 4 — Email PDF: currently a placeholder alert(). Must be wired to shared TGE.openEmailComposer(). Root cause confirmed.

### Snapshot Development Order (Remaining)
1. Fix Bug 3 — PDF export (migrate to tge-pdf.js)
2. Fix Bug 4 — Email PDF (wire to shared email composer)
3. Review Startup and Initialisation
4. Resolve Fleet Input browser autocomplete issue (Chrome fills field with login username)
5. Review Vehicle Resolution
6. Review Snapshot Workflow
7. Review History
8. Review Camera Alignment
9. Review Asset Tracker Logic
10. Review Map
11. Integrate TGE.progress (replace manual loading logic / setMessage / setBtnState)
12. Integrate TGE.output (replace local export functions and file naming)
13. Cleanup (dead code, unused variables, duplicate helpers, legacy references)
14. QA (full checklist — see QA section below)
15. Lock Snapshot v1.0

### Snapshot Stable Sections (Do Not Redesign)
- History
- Camera Alignment
- Device Detection
- Snapshot Workflow
- Roles Integration
- Diagnostics Integration (already uses TGE.api())

---

## QA Checklist (Used For All Modules)

Every module must pass all items before locking:

- [ ] Startup
- [ ] Vehicle Search
- [ ] Snapshot Request
- [ ] Snapshot Images
- [ ] Camera Selection
- [ ] History
- [ ] Camera Alignment
- [ ] Asset Tracker Logic
- [ ] Map
- [ ] CSV Export
- [ ] Excel Export
- [ ] JSON Export
- [ ] PDF Export
- [ ] Email PDF
- [ ] Diagnostics (all API calls logged, all errors logged, no silent failures)
- [ ] Roles (permissions respected, feature access gated correctly)
- [ ] Limits (input limits enforced, batch limits enforced — verify limit_value is on the correct permission action row)
- [ ] Refresh (clears all data, returns to true empty state, no table shell remaining)
- [ ] Console Error Check (no red errors, no unexpected warnings in DevTools)

---

## Backlog (Ordered by Priority)

### After Snapshot is Locked

1. **Control Table Platform — Full Build**
   - Build vendors D1 table (vendor name, active)
   - Build hardware_types D1 table (linked to vendor, name, code, active)
   - Build Admin UI: Vendors tab, hardware type management per vendor
   - Update Control Tables Admin tab: vendor dropdown auto-populates, hardware type tabs auto-populate from linked hardware types
   - Build table types: Battery Status, Last Reported, Hardware Exclusion
   - Wire asset-track.js into Control Table platform (replace all hardcoded logic)
   - Target: no hardware names or business thresholds in any module JS file

2. **Solar Battery Status**
   - Waiting on vendor data from Teletrac Navman
   - Once received: either add Solar to existing CT-001 table (if ranges match Oyster) or create CT-002 (if ranges differ)
   - No code change needed — will be managed entirely through Control Table Admin UI

3. **Asset Track — Fleet Mode Call Rate Limiting**
   - Prevent users from running fleet-wide pulls too frequently (e.g. max X runs per Y hours)
   - Must be enforced server-side in the Worker, not just client-side
   - Part of Roles Platform expansion

4. **PDF Layout Refinement (tge-pdf.js)**
   - Asset Track PDF layout needs improvement
   - Fix is in tge-pdf.js not asset-track.js (platform concern, not module concern)

5. **Mail Merge Improvements (email-composer.js)**
   - Specific changes TBD — flagged during testing

6. **camera.js Investigation**
   - Unclear if camera.js is legacy dead code or active shared utility
   - Must be resolved before Snapshot work touches any camera functionality
   - If legacy: remove. If active: document what it provides.

7. **Fleet Utilisation Module (utilisation.js)**
   - Currently a non-functional stub in main branch
   - Design not yet started
   - Data source: TN360 API (vehicle/device data, GPS, ignition events)
   - Output: per-asset utilisation metrics (% time in use, idle time, distance) and/or fleet-wide aggregates
   - Time period: TBD (user-selected date range vs rolling period)

8. **Roles Platform Expansion**
   - Separate batch limit from usage limit (currently conflated in limit_value)
   - Time-based rate limiting (X calls per Y hours per user)
   - Expanded permissions for: exports, diagnostics, API access, module permissions
   - Fix: limit_value must be on the correct action row (e.g. user-mode for Asset Track input limit, not run)

9. **Consolidated Export Dropdown (Common Pattern)**
   - Replace individual export buttons on remaining pages with single dropdown button (arrow-down icon)
   - This is the new standard — Asset Track already implements it via TGE.buildOutputPill
   - Pages still needing migration: Snapshot, Camera Snapshots, Camera Count (verify current state)

### Medium Term

10. Camera Requests module
11. Workflow Engine
12. API Management
13. Production Hardening

### Long Term

14. Diagnostics Platform enhancements:
    - Runtime Event logging
    - Module Event logging
    - System Health page
    - Performance dashboard
    - Role management integration

---

## Completed This Sprint

✓ Shared platform architecture (tge-output.js, tge-progress.js, tge-pdf.js, tge-diagnostics.js)
✓ Asset Track v1.0 — developed, QA passed, LOCKED
✓ Asset Track — mode-separated state (userRows/fleetRows — data persists across mode switches and navigation)
✓ Asset Track — progressive loading with live render timer
✓ Asset Track — Fleet Not Found logging to TGE.diagnostics
✓ Asset Track — last-seen status thresholds (7/14 day, hardcoded interim)
✓ Asset Track — fleet mode hardware filtering (AT301/Solar only)
✓ Asset Track — user mode exception rows (Fleet Not Found, No Device Assigned, Not Asset Tracker)
✓ Asset Track — battery status via control table (CT-001, Oyster only — Solar pending)
✓ Asset Track — user mode limit working (limit_value on user-mode permission row)
✓ Documentation standards established
✓ QA process established (checklist includes Limits as standard item)
✓ Module lock process established
✓ Snapshot Bug 1 and Bug 2 fixed
✓ Email composer shared platform (Camera Snapshots, Camera Count, Merge Mail)
✓ Camera Fault Report PDF (pdf-lib, A4 landscape, 4-per-page grid, smart centering)
✓ Power Automate email flow with PDF attachment (OneDrive workaround for base64 attachment bug)
✓ Mailer Data admin tab (D1-backed signatures, live preview, add/edit/deactivate)
✓ Control Tables admin tab (partially built — CT-001 Oyster Battery Status active)
✓ Merge Mail page (drag-drop CSV/XLSX import, shared composer)
✓ Admin → Mailer Data tab with signature management
✓ Login permission timing fixed (handleLogin now returns full permMap same as handleSession)

---

## Blockers

None currently.

Waiting on (external):
- Teletrac Navman: solar tracker battery voltage specification
- Teletrac Navman: API key scope expansion for attachment content endpoint (/v1/attachments/{id}/content) — currently returns 401
- Teletrac Navman: camera trigger endpoint fix — currently returns 405
