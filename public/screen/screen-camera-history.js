// TGE Asset Snapshot — Camera History Page
// public/screen/screen-camera-history.js
//
// ISOLATED reproduction of James Robinson's TN360 "Camera Snapshot & History
// Checker". Renders into #view-camera-history. All TN360 traffic goes through
// the isolated /api/camchk/ routes, which run on TN360_SNAPSHOT_KEY only.
//
// Structure:
//   1) Scoped <style> (James's Tailwind converted to prefixed CSS — cannot leak).
//   2) render() writes James's page markup into the view container.
//   3) Auth shim — maps James's five Auth.apiCall actions to /api/camchk/ routes,
//      throwing on non-2xx and returning res.data (mirrors James's Auth.apiCall).
//   4) James's logic, pasted verbatim.
//   5) TGE.onShow['camera-history'] renders on first show.
//
// Delete this file + its <script> tag + its nav item + its view div to remove.

(function () {
  'use strict';

  // ── 1) Scoped styles (prefix .cam-hist so nothing leaks into the app) ────────
  var STYLE_ID = 'cam-hist-styles';
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.cam-hist { --tn-green:#99ca49; --tn-dark:#88b93a; font-family:Inter,system-ui,sans-serif; color:#1f2937; }',
      '.cam-hist * { box-sizing:border-box; }',
      '.cam-hist .ch-head { margin-bottom:1.25rem; }',
      '.cam-hist .ch-title { font-size:1.25rem; font-weight:700; color:#1f2937; }',
      '.cam-hist .ch-sub { font-size:0.875rem; color:#6b7280; margin-top:0.125rem; }',
      '.cam-hist .ch-card { background:#fff; border-radius:1rem; border:1px solid #f3f4f6; box-shadow:0 1px 3px rgba(0,0,0,0.06); padding:1.25rem; }',
      '.cam-hist .ch-toolbar { display:flex; flex-wrap:wrap; gap:0.75rem; align-items:center; margin-bottom:1.25rem; }',
      '.cam-hist .ch-btn { display:inline-flex; align-items:center; gap:0.5rem; padding:0 1.25rem; height:2.75rem; font-size:0.875rem; font-weight:600; border-radius:0.75rem; cursor:pointer; transition:background 0.15s,border-color 0.15s; border:none; }',
      '.cam-hist .ch-btn-primary { background:var(--tn-green); color:#fff; }',
      '.cam-hist .ch-btn-primary:hover { background:var(--tn-dark); }',
      '.cam-hist .ch-btn-outline { background:#fff; border:2px solid #e5e7eb; color:#374151; font-weight:500; }',
      '.cam-hist .ch-btn-outline:hover:not(:disabled) { background:#f9fafb; }',
      '.cam-hist .ch-btn:disabled { opacity:0.4; cursor:not-allowed; }',
      '.cam-hist .ch-right { display:flex; align-items:center; gap:0.5rem; margin-left:auto; }',
      '.cam-hist .ch-label { font-size:0.75rem; font-weight:500; color:#6b7280; white-space:nowrap; }',
      '.cam-hist .ch-select { height:2.25rem; padding:0 0.625rem; border:2px solid #e5e7eb; border-radius:0.75rem; font-size:0.875rem; color:#374151; background:#fff; }',
      '.cam-hist .ch-select:focus { outline:none; border-color:var(--tn-green); }',
      '.cam-hist .ch-field-label { display:block; font-size:0.875rem; font-weight:500; color:#374151; margin-bottom:0.25rem; }',
      '.cam-hist .ch-field-hint { color:#9ca3af; font-weight:400; }',
      '.cam-hist textarea.ch-input { width:100%; padding:0.625rem 0.75rem; border:2px solid #e5e7eb; border-radius:0.75rem; font-size:0.875rem; font-family:monospace; resize:vertical; }',
      '.cam-hist textarea.ch-input:focus { outline:none; border-color:var(--tn-green); }',
      '.cam-hist .ch-tip { font-size:0.75rem; color:#9ca3af; margin-top:0.25rem; }',
      '.cam-hist .ch-status { display:flex; align-items:center; gap:0.5rem; padding:0.75rem 1rem; background:#eff6ff; border:1px solid #dbeafe; border-radius:0.75rem; font-size:0.875rem; color:#1d4ed8; margin-bottom:1rem; }',
      '.cam-hist .ch-error { padding:0.75rem 1rem; background:#fef2f2; border:1px solid #fecaca; border-radius:0.75rem; font-size:0.875rem; color:#b91c1c; margin-bottom:1rem; }',
      '.cam-hist .ch-hidden { display:none !important; }',

      // Spinner
      '.cam-hist .bulk-ico--spin { display:inline-block; width:1em; height:1em; border:2px solid rgba(255,255,255,0.35); border-top-color:#fff; border-radius:50%; animation:ch-spin 0.7s linear infinite; vertical-align:-0.15em; }',
      '@keyframes ch-spin { to { transform:rotate(360deg); } }',

      // Progress overlay
      '.cam-hist-overlay { display:none; position:fixed; inset:0; z-index:5000; background:rgba(249,250,251,0.72); align-items:center; justify-content:center; backdrop-filter:blur(2px); }',
      '.cam-hist-overlay.is-visible { display:flex; }',
      '.cam-hist-overlay .pc-panel { background:#fff; padding:1.35rem 1.75rem; border-radius:0.75rem; box-shadow:0 10px 40px rgba(0,0,0,0.12); border:1px solid #e5e7eb; text-align:center; min-width:260px; max-width:92vw; }',
      '.cam-hist-overlay .pc-visual { position:relative; width:112px; height:112px; margin:0 auto 0.75rem; }',
      '.cam-hist-overlay .pc-svg { width:112px; height:112px; display:block; }',
      '.cam-hist-overlay .pc-ring-bg { fill:none; stroke:#e5e7eb; stroke-width:8; }',
      '.cam-hist-overlay .pc-ring-fg { fill:none; stroke:#99ca49; stroke-width:8; stroke-linecap:round; transition:stroke-dashoffset 0.25s ease-out; }',
      '.cam-hist-overlay .pc-pct { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:1.05rem; font-weight:700; color:#1f2937; }',
      '.cam-hist-overlay .pc-track { height:8px; background:#e5e7eb; border-radius:999px; overflow:hidden; margin:0 auto 0.85rem; max-width:260px; }',
      '.cam-hist-overlay .pc-fill { height:100%; width:0%; background:linear-gradient(to right,#99ca49,#88b93a); border-radius:999px; transition:width 0.25s ease-out; }',
      '.cam-hist-overlay .pc-text { margin:0; font-size:0.875rem; color:#374151; font-weight:600; }',
      '.cam-hist-overlay .pc-sub { margin:0.35rem 0 0; font-size:0.75rem; color:#6b7280; }',

      // Snapshot table
      '.cam-hist .snap-table { width:100%; border-collapse:collapse; background:#fff; border-radius:0.5rem; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08); font-size:0.75rem; table-layout:fixed; }',
      '.cam-hist .snap-table thead { background:linear-gradient(to right,#99ca49,#88b93a); color:#fff; }',
      '.cam-hist .snap-table th { padding:0.5rem 0.3rem; text-align:center; font-weight:600; vertical-align:middle; line-height:1.2; }',
      '.cam-hist .snap-table th:first-child { text-align:left; width:8rem; }',
      '.cam-hist .snap-th-main { display:block; font-weight:600; }',
      '.cam-hist .snap-th-sub { display:block; font-size:0.62rem; font-weight:500; opacity:0.92; margin-top:0.15rem; }',
      '.cam-hist .snap-table td { padding:0.4rem; border-bottom:1px solid #e5e7eb; vertical-align:middle; text-align:center; }',
      '.cam-hist .snap-table td:first-child { text-align:left; font-weight:600; color:#1f2937; word-break:break-word; }',
      '.cam-hist .snap-table tbody tr:hover { background:#f9fafb; }',
      '.cam-hist .snap-table tbody tr:last-child td { border-bottom:none; }',
      '.cam-hist .snap-col-stack { display:flex; flex-direction:column; align-items:center; gap:0.35rem; max-width:100%; padding:0.15rem 0; }',
      '.cam-hist .snap-thumb-block { width:100%; display:flex; flex-direction:column; align-items:center; }',
      '.cam-hist .thumb-wrap img { max-width:100%; max-height:100px; width:auto; height:auto; object-fit:contain; border-radius:0.25rem; cursor:zoom-in; border:1px solid #e5e7eb; background:#f3f4f6; }',
      '.cam-hist .thumb-wrap img:hover { border-color:#99ca49; box-shadow:0 2px 8px rgba(153,202,73,0.3); }',
      '.cam-hist .snap-time { display:block; font-size:0.65rem; font-weight:500; color:#6b7280; margin-top:0.2rem; text-align:center; line-height:1.2; word-break:break-word; }',
      '.cam-hist .snap-failed { display:block; font-size:0.62rem; font-weight:700; color:#dc2626; margin-top:0.2rem; text-align:center; }',
      '.cam-hist .snap-not-found { display:block; font-size:0.72rem; font-weight:700; color:#dc2626; text-align:center; padding:0.35rem 0.2rem; }',
      '.cam-hist .snap-not-found-detail { display:block; font-weight:500; font-size:0.68rem; color:#991b1b; margin-top:0.25rem; line-height:1.25; }',
      '.cam-hist .thumb-missing { color:#9ca3af; font-size:0.75rem; padding:0.35rem; }',
      '.cam-hist .unsure-hint { font-size:0.6rem; color:#6b7280; max-width:100%; word-break:break-word; text-align:center; margin-top:0.1rem; }',

      // Historical fallback cells
      '.cam-hist .snap-hist-badge { display:block; font-size:0.6rem; font-weight:800; color:#92400e; background:#fef3c7; border:1px solid #fcd34d; border-radius:9999px; padding:0.05rem 0.45rem; margin-top:0.2rem; text-align:center; letter-spacing:0.04em; }',
      '.cam-hist .snap-hist-time { display:block; font-size:0.62rem; font-weight:600; color:#b45309; margin-top:0.1rem; text-align:center; }',
      '.cam-hist .snap-hist-wrap { border:2px solid #f59e0b !important; border-radius:0.3rem; }',
      '@keyframes ch-hist-pulse { 0%,100%{border-color:#f59e0b;} 50%{border-color:#fcd34d;} }',
      '.cam-hist .snap-hist-searching { border:2px solid #f59e0b !important; border-radius:0.3rem; animation:ch-hist-pulse 1s ease-in-out infinite; }',
      '.cam-hist .snap-searching-badge { display:block; font-size:0.6rem; font-weight:800; color:#92400e; background:#fef3c7; border:1px solid #fcd34d; border-radius:9999px; padding:0.05rem 0.45rem; margin-top:0.2rem; text-align:center; letter-spacing:0.04em; }',

      // Historical search bar
      '.cam-hist-search-bar { display:none; position:fixed; bottom:0; left:0; right:0; z-index:4900; align-items:center; gap:0.75rem; padding:0.75rem 1.25rem; background:#fffbeb; border-top:2px solid #fde68a; font-size:0.875rem; color:#78350f; box-shadow:0 -4px 12px rgba(0,0,0,0.06); }',
      '.cam-hist-search-bar.is-visible { display:flex; }',

      // Fullscreen viewer
      '.cam-hist-fs { display:none; position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.92); align-items:center; justify-content:center; padding:1rem; cursor:zoom-out; }',
      '.cam-hist-fs.is-open { display:flex; }',
      '.cam-hist-fs img { max-width:100vw; max-height:100vh; width:auto; height:auto; object-fit:contain; cursor:default; border-radius:0.25rem; }',
      '.cam-hist-fs.is-historical img { border:4px solid #f59e0b; border-radius:0.35rem; box-shadow:0 0 0 4px rgba(245,158,11,0.25),0 0 32px rgba(245,158,11,0.2); }',
      '.cam-hist-fs .fs-caption.is-historical { background:rgba(245,158,11,0.22); border:1px solid rgba(245,158,11,0.5); border-radius:0.4rem; padding:0.25rem 0.85rem; color:#fef3c7; }',
      '.cam-hist-fs .fs-nav { position:fixed; top:50%; transform:translateY(-50%); z-index:10002; width:3rem; height:3rem; border-radius:50%; border:none; background:rgba(255,255,255,0.92); color:#111827; font-size:1.75rem; line-height:1; cursor:pointer; box-shadow:0 2px 14px rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center; padding:0; }',
      '.cam-hist-fs .fs-nav:hover:not(:disabled) { background:#fff; }',
      '.cam-hist-fs .fs-nav:disabled { opacity:0.22; cursor:default; }',
      '.cam-hist-fs .fs-nav-prev { left:0.75rem; }',
      '.cam-hist-fs .fs-nav-next { right:0.75rem; }',
      '.cam-hist-fs .fs-close { position:fixed; top:1rem; right:1rem; z-index:10001; background:#fff; color:#111; border:none; width:2.5rem; height:2.5rem; border-radius:9999px; font-size:1.5rem; line-height:1; cursor:pointer; font-weight:700; box-shadow:0 2px 12px rgba(0,0,0,0.3); padding:0; }',
      '.cam-hist-fs .fs-close:hover { background:#f3f4f6; }',
            '.cam-hist-fs .fs-caption { position:fixed; bottom:1rem; left:50%; transform:translateX(-50%); color:#e5e7eb; font-size:0.875rem; text-align:center; max-width:90vw; pointer-events:none; }',

      // ── App theme ── restyles the page above to match the rest of the app
      // (colours, header, cards, buttons, table). Same selectors, so these win.
      // The amber "historical" highlights are kept: they mean something.
      '.cam-hist { font-family:inherit; color:var(--ink); }',
      '.cam-hist .ch-head { background:linear-gradient(135deg, var(--green-900) 0%, var(--green-800) 100%); border-radius:var(--radius-lg); padding:20px 24px; margin-bottom:16px; }',
      '.cam-hist .ch-title { font-size:18px; font-weight:700; color:#fff; }',
      '.cam-hist .ch-sub { font-size:12px; color:rgba(255,255,255,0.55); margin-top:2px; }',
      '.cam-hist .ch-card { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-lg); box-shadow:none; padding:20px; }',
      '.cam-hist .ch-btn { height:38px; padding:0 16px; border-radius:8px; font-size:13px; font-weight:600; }',
      '.cam-hist .ch-btn-primary { background:var(--green-700); color:var(--yellow); border:1px solid var(--green-700); }',
      '.cam-hist .ch-btn-primary:hover { background:var(--green-800); }',
      '.cam-hist .ch-btn-outline { background:var(--surface); border:1px solid var(--line); color:var(--ink-2); font-weight:600; }',
      '.cam-hist .ch-btn-outline:hover:not(:disabled) { background:var(--surface-3); }',
      '.cam-hist .ch-label, .cam-hist .ch-field-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:var(--muted); }',
      '.cam-hist .ch-field-label { margin-bottom:6px; }',
      '.cam-hist .ch-field-hint { color:var(--muted-2); text-transform:none; letter-spacing:0; font-weight:400; }',
      '.cam-hist .ch-select { height:38px; border:1px solid var(--line); border-radius:8px; font-size:13px; color:var(--ink); background:var(--surface); }',
      '.cam-hist textarea.ch-input { border:1px solid var(--line); border-radius:8px; font-size:13px; color:var(--ink); background:var(--surface); }',
      '.cam-hist .ch-select:focus, .cam-hist textarea.ch-input:focus { border-color:var(--green-600); }',
      '.cam-hist .ch-tip { color:var(--muted-2); }',
      '.cam-hist .ch-status { background:var(--green-50); border:1px solid var(--line); border-radius:8px; color:var(--green-700); font-size:13px; }',
      '.cam-hist .ch-status .bulk-ico--spin { border-color:rgba(0,122,59,0.25) !important; border-top-color:var(--green-700) !important; }',
      '.cam-hist .ch-error { background:var(--danger-bg); border:1px solid rgba(192,57,43,0.3); border-radius:8px; color:var(--danger); font-size:13px; }',
      '.cam-hist-overlay { background:rgba(240,244,241,0.75); }',
      '.cam-hist-overlay .pc-panel { border:1px solid var(--line); border-radius:var(--radius-lg); }',
      '.cam-hist-overlay .pc-ring-bg { stroke:var(--line-2); }',
      '.cam-hist-overlay .pc-ring-fg { stroke:var(--green-600); }',
      '.cam-hist-overlay .pc-pct, .cam-hist-overlay .pc-text { color:var(--ink); }',
      '.cam-hist-overlay .pc-sub { color:var(--muted); }',
      '.cam-hist-overlay .pc-track { background:var(--line-2); }',
      '.cam-hist-overlay .pc-fill { background:linear-gradient(to right, var(--green-700), var(--green-600)); }',
      '.cam-hist .snap-table { border:1px solid var(--line); border-radius:var(--radius); box-shadow:none; background:var(--surface); }',
      '.cam-hist .snap-table thead { background:var(--surface-2); color:var(--muted); }',
      '.cam-hist .snap-table th { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; padding:9px 6px; border-bottom:1px solid var(--line); }',
      '.cam-hist .snap-th-sub { text-transform:none; letter-spacing:0; color:var(--muted-2); }',
      '.cam-hist .snap-table td { border-bottom:1px solid var(--line-2); }',
      '.cam-hist .snap-table td:first-child { color:var(--ink); }',
      '.cam-hist .snap-table tbody tr:hover { background:var(--surface-2); }',
      '.cam-hist .thumb-wrap img { border:1px solid var(--line); background:var(--surface-3); }',
      '.cam-hist .thumb-wrap img:hover { border-color:var(--green-600); box-shadow:0 2px 8px rgba(0,166,81,0.25); }',
      '.cam-hist .snap-time, .cam-hist .unsure-hint { color:var(--muted); }',
      '.cam-hist .thumb-missing { color:var(--muted-2); }',
      '.cam-hist .snap-failed, .cam-hist .snap-not-found { color:var(--danger); }',
      '.cam-hist .snap-not-found-detail { color:var(--danger); }',
      // History search, TGE style
      '.cam-hist .snap-hist-wrap { border:2px solid var(--warning) !important; border-radius:6px; }',
      '.cam-hist .snap-hist-badge { display:inline-block; font-size:10px; font-weight:700; letter-spacing:0.06em; color:var(--warning); background:#fdf3e7; border:1px solid #f1d3ae; padding:2px 9px; margin-top:5px; }',
      '.cam-hist .snap-hist-time { font-size:10.5px; font-weight:600; color:var(--warning); margin-top:3px; }',
      '.cam-hist .snap-hist-searching { border:1px dashed var(--line) !important; border-radius:6px; animation:none; background:var(--surface-2) !important; flex-direction:column; gap:6px; }',
      '.cam-hist .snap-searching-badge { font-size:10.5px; font-weight:600; letter-spacing:0; color:var(--muted); background:none; border:none; padding:0; margin-top:4px; }',
      '.cam-hist .ch-hist-spin { display:block; width:16px; height:16px; border:2px solid var(--green-100); border-top-color:var(--green-600); border-radius:50%; animation:ch-spin 0.7s linear infinite; }',
      '.cam-hist .snap-hist-searching .ch-hist-wk { font-size:11px; font-weight:600; color:var(--muted); }',
      '.cam-hist .snap-hist-none { display:block; font-size:11px; font-weight:600; color:var(--muted-2); }',
      '.cam-hist-search-bar { flex-direction:column; align-items:stretch; gap:10px; padding:12px 20px; background:var(--surface); border-top:3px solid var(--green-600); box-shadow:0 -6px 18px rgba(10,40,20,0.08); color:var(--ink); font-size:13px; }',
      '.cam-hist-search-bar .hs-top { display:flex; align-items:center; gap:14px; }',
      '.cam-hist-search-bar .hs-kicker { font-size:10px; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; color:var(--green-700); }',
      '.cam-hist-search-bar .hs-title { font-size:13px; font-weight:700; color:var(--ink); }',
      '.cam-hist-search-bar .hs-track { flex:1; height:8px; background:var(--line-2); border-radius:999px; overflow:hidden; }',
      '.cam-hist-search-bar .hs-fill { height:100%; width:0%; background:linear-gradient(90deg, var(--green-700), var(--green-600)); transition:width 0.25s ease-out; }',
      '.cam-hist-search-bar .hs-pct { min-width:40px; text-align:right; font-size:13px; font-weight:700; color:var(--green-700); }',
      '.cam-hist-search-bar .hs-stop { height:32px; padding:0 14px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--ink-2); font-size:12px; font-weight:600; cursor:pointer; }',
      '.cam-hist-search-bar .hs-stop:hover { background:var(--surface-3); }',
      '.cam-hist-search-bar .hs-chips { display:flex; flex-wrap:wrap; gap:6px; max-height:58px; overflow-y:auto; }',
      '.cam-hist-search-bar .hs-chip { font-size:11px; font-weight:600; padding:3px 9px; border-radius:999px; background:var(--surface-2); border:1px solid var(--line); color:var(--ink-2); white-space:nowrap; }',
      '.cam-hist-search-bar .hs-chip b { font-weight:600; color:var(--muted); }',
      '.cam-hist-search-bar .hs-chip.is-done { background:var(--green-50); border-color:#bfe3cd; color:var(--green-700); }',
      '.cam-hist-search-bar .hs-chip.is-found { background:var(--green-700); border-color:var(--green-700); color:var(--yellow); }',
      // Selection, marking and email (same idea as Camera Count)
      '.cam-hist .ch-veh { display:flex; align-items:flex-start; gap:8px; }',
      '.cam-hist .ch-veh .ch-sel { width:16px; height:16px; margin-top:1px; cursor:pointer; accent-color:var(--green-700); flex-shrink:0; }',
      '.cam-hist .ch-sysdown { display:block; margin-top:8px; height:26px; padding:0 10px; border-radius:6px; border:1px solid var(--line); background:var(--surface); color:var(--ink-2); font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap; }',
      '.cam-hist .ch-sysdown.on { background:var(--danger); border-color:var(--danger); color:#fff; }',
      '.cam-hist .snap-table tbody tr.is-down { background:var(--danger-bg); }',
      '.cam-hist .snap-table tbody tr.is-down:hover { background:var(--danger-bg); }',
      '.cam-hist .ch-mark { display:flex; gap:4px; justify-content:center; margin-top:6px; }',
      '.cam-hist .ch-mark-btn { flex:1; max-width:72px; height:24px; padding:0 6px; border-radius:6px; border:1px solid var(--line); background:var(--surface); color:var(--muted); font-size:10.5px; font-weight:700; cursor:pointer; }',
      '.cam-hist .ch-mark-btn.is-good.on { background:var(--green-100); border-color:var(--green-600); color:var(--green-700); }',
      '.cam-hist .ch-mark-btn.is-bad.on { background:var(--danger-bg); border-color:var(--danger); color:var(--danger); }',
      '.cam-hist .ch-sel-count { font-size:12px; font-weight:600; color:var(--muted); }',
      '.cam-hist .ch-head { position:relative; }',
      '.cam-hist .ch-head-pill { position:absolute; top:20px; right:24px; }',
      // Multi run lists
      '.cam-hist .ch-btn-outline.on { background:var(--green-50); border-color:var(--green-600); color:var(--green-700); }',
      '.cam-hist .ch-list-tabs { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 8px; }',
      '.cam-hist .ch-list-tab, .cam-hist .ch-list-add { display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 12px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--ink-2); font-size:12px; font-weight:700; cursor:pointer; }',
      '.cam-hist .ch-list-tab small { font-size:11px; font-weight:600; color:var(--muted); }',
      '.cam-hist .ch-list-tab.on { background:var(--green-700); border-color:var(--green-700); color:var(--yellow); }',
      '.cam-hist .ch-list-tab.on small { color:#cfe9d8; }',
      '.cam-hist .ch-list-x { margin-left:2px; padding:0 2px; font-size:14px; line-height:1; opacity:0.6; }',
      '.cam-hist .ch-list-x:hover { opacity:1; }',
      '.cam-hist .ch-list-add { border-style:dashed; color:var(--green-700); }',
      '.cam-hist .ch-multi-line { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin:0 0 10px; font-size:12px; font-weight:600; color:var(--ink-2); }',
      '.cam-hist .ch-multi-line .ml-title { font-weight:700; margin-right:4px; }',
      '.cam-hist .ch-multi-line .ml-chip { padding:3px 9px; border-radius:999px; border:1px solid var(--line); background:var(--surface-2); color:var(--muted); white-space:nowrap; }',
      '.cam-hist .ch-multi-line .ml-chip.is-run { border-color:var(--green-600); background:var(--green-50); color:var(--green-700); }',
      '.cam-hist .ch-multi-line .ml-chip.is-done { border-color:var(--green-700); background:var(--green-700); color:var(--yellow); }',
      '.cam-hist .ch-list-tag { display:inline-block; margin-top:3px; font-size:10px; font-weight:700; color:var(--green-700); background:var(--green-50); border:1px solid #bfe3cd; border-radius:999px; padding:0 7px; }',
      // SD card strip under each vehicle
      '.cam-hist .snap-table tbody tr.ch-has-sd td { border-bottom:none; }',
      '.cam-hist .snap-table tbody tr.ch-sd-row td { padding:0 0.5rem 0.65rem; border-bottom:1px solid var(--line-2); text-align:left; }',
      '.cam-hist .snap-table tbody tr.ch-sd-row:hover { background:transparent; }',
      '.cam-hist .snap-table tbody tr.is-down + tr.ch-sd-row { background:var(--danger-bg); }',
      '.cam-hist .ch-sd-strip { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:6px 10px; background:var(--surface-2); border:1px solid var(--line-2); border-radius:8px; font-size:11px; color:var(--ink-2); }',
      '.cam-hist .ch-sd-k { font-size:9.5px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--muted); }',
      '.cam-hist .ch-sd-v { font-weight:600; }',
      '.cam-hist .ch-sd-mono { font-family:ui-monospace,Menlo,monospace; color:var(--muted); font-weight:500; }',
      '.cam-hist .ch-sd-sep { width:1px; height:16px; background:var(--line); }',
      '.cam-hist .ch-sd-chip { display:inline-flex; align-items:center; gap:6px; padding:2px 3px 2px 9px; border-radius:999px; border:1px solid #bfe3cd; background:var(--green-50); color:var(--green-700); font-weight:700; }',
      '.cam-hist .ch-sd-chip.bad { border-color:rgba(192,57,43,0.35); background:var(--danger-bg); color:var(--danger); }',
      '.cam-hist .ch-sd-chip small { font-size:10.5px; font-weight:600; color:var(--muted); }',
      '.cam-hist .ch-sd-tg { display:inline-flex; border:1px solid var(--line); border-radius:999px; overflow:hidden; background:var(--surface); }',
      '.cam-hist .ch-sd-btn { border:none; background:none; font-size:10px; font-weight:700; padding:1px 7px; color:var(--muted); cursor:pointer; }',
      '.cam-hist .ch-sd-btn.on-g { background:var(--green-100); color:var(--green-700); }',
      '.cam-hist .ch-sd-btn.on-b { background:var(--danger-bg); color:var(--danger); }',
      '.cam-hist .ch-sd-note { color:var(--muted); font-style:italic; }',
      '.cam-hist .ch-sd-last { margin-left:auto; color:var(--muted); }',
      '.cam-hist .ch-sd-last b { font-weight:600; color:var(--ink-2); }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── 2) render() — James's markup into the view container ─────────────────────
  function render() {
    var view = TGE.el('view-camera-history');
    if (!view) return;
    injectStyles();

    view.innerHTML = [
      '<div class="cam-hist">',
          '<div class="ch-head">',
          '<div class="hero-kicker">Camera</div>',
          '<div class="ch-title">Camera Snapshot &amp; History Checker</div>',
                   '<div class="ch-sub">Verify camera snapshots are valid and automatically search history to find when a camera last worked.</div>',
          '<div class="ch-head-pill">' + (TGE.buildOutputPill ? TGE.buildOutputPill('ch', chExportItems(), { theme: 'dark' }) : '') + '</div>',
        '</div>',

        '<div class="ch-card">',
          '<div class="ch-toolbar">',
            '<button type="button" id="ch-btnLoad" class="ch-btn ch-btn-primary">Check snapshots</button>',
            '<button type="button" id="ch-btnSelAll" class="ch-btn ch-btn-outline" style="display:none;">Select all</button>',
            '<button type="button" id="ch-btnSelNone" class="ch-btn ch-btn-outline" style="display:none;">Clear</button>',
            '<button type="button" id="ch-btnMulti" class="ch-btn ch-btn-outline" title="Queue several lists and run them one after another">Multi run</button>',
            '<span id="ch-selCount" class="ch-sel-count"></span>',
            '<div class="ch-right">',
              '<label for="ch-histWeeksSel" class="ch-label">History search period</label>',
              '<select id="ch-histWeeksSel" class="ch-select">',
                '<option value="13">13 weeks</option>',
                '<option value="26">26 weeks</option>',
                '<option value="52" selected>1 year</option>',
                '<option value="78">1.5 years</option>',
                '<option value="104">2 years</option>',
                '<option value="9999">All time</option>',
              '</select>',
            '</div>',
          '</div>',

          '<div style="margin-bottom:1.25rem;">',
          '<label class="ch-field-label">Vehicles to check <span class="ch-field-hint">(one per line)</span></label>',
            '<div id="ch-listTabs" class="ch-list-tabs ch-hidden"></div>',
            '<textarea id="ch-fleetFilter" rows="5" class="ch-input" placeholder="Fleet number, vehicle name, registration, or numeric vehicle ID — one per line" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>',
            '<p class="ch-tip">Tip: Ctrl+Enter to start the check</p>',
          '</div>',

          '<div id="ch-statusMsg" class="ch-status ch-hidden">',
            '<span class="bulk-ico--spin" style="border-color:rgba(29,78,216,0.25);border-top-color:#1d4ed8;" aria-hidden="true"></span>',
            '<span id="ch-statusText">Loading…</span>',
          '</div>',

          '<div id="ch-errorMsg" class="ch-error ch-hidden"></div>',
          '<div id="ch-multiLine" class="ch-multi-line ch-hidden"></div>',

          '<div style="overflow-x:auto;">',
            '<table class="snap-table" id="ch-snapTable" aria-label="Camera snapshots by vehicle">',
              '<thead>',
                '<tr>',
                  '<th>Vehicle</th>',
                  '<th>ROAD</th>',
                  '<th>DRIVER</th>',
                  '<th><span class="snap-th-main">TVI1</span><span class="snap-th-sub">Left</span></th>',
                  '<th><span class="snap-th-main">TVI2</span><span class="snap-th-sub">Right</span></th>',
                  '<th><span class="snap-th-main">UVC</span><span class="snap-th-sub">Additional</span></th>',
                  '<th>Unsure</th>',
                '</tr>',
              '</thead>',
              '<tbody id="ch-snapTableBody"></tbody>',
            '</table>',
          '</div>',
        '</div>',
      '</div>',

      // Progress overlay
      '<div id="ch-persistCheckOverlay" class="cam-hist-overlay" role="status" aria-live="polite">',
        '<div class="pc-panel">',
          '<div class="pc-visual">',
            '<svg class="pc-svg" viewBox="0 0 100 100" aria-hidden="true">',
              '<circle class="pc-ring-bg" cx="50" cy="50" r="40"/>',
              '<circle id="ch-persistRingFg" class="pc-ring-fg" cx="50" cy="50" r="40" transform="rotate(-90 50 50)"/>',
            '</svg>',
            '<span id="ch-persistProgressPct" class="pc-pct">0%</span>',
          '</div>',
          '<div class="pc-track"><div id="ch-persistProgressBarFill" class="pc-fill"></div></div>',
          '<p class="pc-text">Checking image sizes</p>',
          '<p id="ch-persistProgressCount" class="pc-sub">Preparing…</p>',
        '</div>',
      '</div>',

      // Historical search bar
      '<div id="ch-histSearchBar" class="cam-hist-search-bar" aria-live="polite" role="status">',
        '<div class="hs-top">',
          '<div><div class="hs-kicker">Searching history</div><div id="ch-histSearchText" class="hs-title">Searching history for unknown cameras…</div></div>',
          '<div class="hs-track"><div id="ch-histSearchFill" class="hs-fill"></div></div>',
          '<span id="ch-histSearchPct" class="hs-pct">0%</span>',
          '<button type="button" id="ch-btnStopHist" class="hs-stop">Stop</button>',
        '</div>',
        '<div id="ch-histSearchChips" class="hs-chips"></div>',
      '</div>',

      // Fullscreen viewer
      '<div id="ch-fsOverlay" class="cam-hist-fs" role="dialog" aria-modal="true" aria-label="Fullscreen image">',
        '<button type="button" class="fs-close" id="ch-fsClose" aria-label="Close">&times;</button>',
        '<button type="button" class="fs-nav fs-nav-prev" id="ch-fsPrev" aria-label="Previous image" disabled>&#8249;</button>',
        '<button type="button" class="fs-nav fs-nav-next" id="ch-fsNext" aria-label="Next image" disabled>&#8250;</button>',
        '<img id="ch-fsImage" src="" alt="Snapshot fullscreen">',
        '<div id="ch-fsCaption" class="fs-caption"></div>',
      '</div>'
    ].join('');

    wireEvents();
    renderTable();
  }

  // ── 3) Auth shim — James's five actions → /api/camchk/ routes ────────────────
  // Mirrors James's Auth.apiCall: returns the response body on 2xx, throws on
  // non-2xx. TGE.api returns { ok, status, data }; we unwrap it here so all of
  // James's logic below runs unchanged.
  var Auth = {
    getSelectedCompany: function () {
      return { id: '432639', shortName: 'TGE', fullName: 'Team Global Express' };
    },
    apiCall: async function (action, payload) {
      payload = payload || {};

      if (action === 'teletrac_proxy_get') {
        var path = String(payload.path || '');
        if (path === '/v1/vehicles') {
          var vr = await TGE.api('GET', '/api/camchk/vehicles');
          if (!vr.ok) throw new Error((vr.data && vr.data.error) || 'Vehicle lookup failed');
          return vr.data;
        }
        if (path === '/v1/events') {
          var q = new URLSearchParams();
          var p = payload.params || {};
          Object.keys(p).forEach(function (k) { if (p[k] != null && p[k] !== '') q.set(k, p[k]); });
          var er = await TGE.api('GET', '/api/camchk/events' + (q.toString() ? '?' + q.toString() : ''));
          if (!er.ok) throw new Error((er.data && er.data.error) || 'Events lookup failed');
          return er.data;
        }
        throw new Error('Unsupported proxy path: ' + path);
      }

      if (action === 'fetch_hist_snapshots') {
        var sr = await TGE.api('POST', '/api/camchk/snapshots', {
          vehicleId: payload.vehicleId,
          deviceId:  payload.deviceId,
          from:      payload.from,
          to:        payload.to
        });
        if (!sr.ok) throw new Error((sr.data && sr.data.error) || 'Snapshot history fetch failed');
        return sr.data; // { events, totalCount }
      }

      if (action === 'snapshot_check_sizes') {
        var snap = payload.snapshot || {};
        var u = new URLSearchParams();
        u.set('url', snap.url || '');
        if (snap.filename) u.set('filename', snap.filename);
        var ir = await TGE.api('GET', '/api/camchk/image-size?' + u.toString());
        if (!ir.ok) throw new Error((ir.data && ir.data.error) || 'Image size check failed');
        return ir.data; // { filename, bytes, tooSmall }
      }

      if (action === 'log_activity') {
        return Promise.resolve({ ok: true }); // fire-and-forget, no-op
      }

      throw new Error('Unknown Auth action: ' + action);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 4) James's logic — pasted verbatim, with element IDs prefixed "ch-" to match
  //    the render() markup above. Logic is otherwise unchanged.
  // ══════════════════════════════════════════════════════════════════════════

  var selectedCompanyId = '';
  var allRows           = [];
  var lastSnapshotSaveMessage    = '';
  var lastSnapshotSmallFileByKey = {};
  var lastLoadStats = { totalEvents:0, fleetCameraEventsRaw:0, eventsWithContext:0, snapshotEventsWithMedia:0 };

  var fsGallery = [], fsIndex = 0;
  var SOURCES = ['ROAD', 'DRIVER', 'TVI1', 'TVI2', 'UVC'];
  var histStopRequested = false;

  var HIST_POSITION_MAP = {
    'FRONT':'ROAD', 'ROAD':'ROAD', 'ROAD_FACING':'ROAD',
    'DRIVER':'DRIVER', 'DRIVER_FACING':'DRIVER',
    'LEFT_PASSENGER':'TVI1', 'LEFT':'TVI1', 'TVI1':'TVI1',
    'RIGHT_DRIVER':'TVI2', 'RIGHT':'TVI2', 'TVI2':'TVI2',
    'UVC':'UVC'
  };

  function parseFreshEvent(ev) {
    if (!ev || !Array.isArray(ev.attachments)) return null;
    var urls = { ROAD:'', DRIVER:'', TVI1:'', TVI2:'', UVC:'' };
    var hasMedia = false;
    for (var i = 0; i < ev.attachments.length; i++) {
      var att = ev.attachments[i];
      var url = att.url || '';
      if (!url || !/^https?:\/\//i.test(url)) continue;
      hasMedia = true;
      var pos = String(att.position || '').toUpperCase();
      var col = HIST_POSITION_MAP[pos] || null;
      if (col && !urls[col]) urls[col] = url;
    }
    if (!hasMedia) return null;
    return { timeAt: ev.timeAt || '', urls: urls };
  }

  function showHistSearchBar(show, msg) {
    var bar = document.getElementById('ch-histSearchBar');
    if (!bar) return;
    if (show) {
      bar.classList.add('is-visible');
      if (msg != null) document.getElementById('ch-histSearchText').textContent = msg;
    } else {
      bar.classList.remove('is-visible');
    }
  }

  async function historicalFallback(deviceIdByVehicleId) {
    deviceIdByVehicleId = deviceIdByVehicleId || {};
    var toSearch = [];
        var scopeRows = batchRows || allRows;
    for (var ri = 0; ri < scopeRows.length; ri++) {
      var row = scopeRows[ri];
      if (row.notFound) continue;
      var unknownSrcs = SOURCES.filter(function(src) {
        var cell = row.cols[src];
        if (!cell || !cell.url) return true;
        if (colSnapshotFileTooSmall(row.vehicleId, src, cell.timeAt)) return true;
        return false;
      });
      if (unknownSrcs.length) {
        row.histCells = {};
        row.histSearching = {};
        toSearch.push({ row: row, srcs: unknownSrcs });
      }
    }
    scopeRows.forEach(function(r) { if (!r.histSearching) r.chDone = true; });   // nothing to search = finished
    if (!toSearch.length) { renderTable(); return; }

    var weekMs   = 7 * 24 * 60 * 60 * 1000;
    var maxWeeks = parseInt(document.getElementById('ch-histWeeksSel').value, 10) || 52;
    var now      = Date.now();
    var total    = toSearch.length;
    var doneCount = 0;
    var weekByVehicle = {};

        var foundCount = 0;

    function updateHistBar() {
      var chips = [], doneN = 0, weeksDone = 0;
      for (var vid in weekByVehicle) {
        if (!Object.prototype.hasOwnProperty.call(weekByVehicle, vid)) continue;
        var s = weekByVehicle[vid];
        if (s.done) doneN++;
        weeksDone += s.done ? maxWeeks : Math.max(s.week - 1, 0);
        var cls = s.found ? ' is-found' : (s.done ? ' is-done' : '');
        var txt = s.done ? (s.found ? ' ✓ found' : ' ✓ done') : ' <b>wk ' + s.week + '/' + maxWeeks + '</b>';
        chips.push('<span class="hs-chip' + cls + '">' + esc(s.name) + txt + '</span>');
      }
      var pct = total ? Math.round(weeksDone / (total * maxWeeks) * 100) : 0;
      showHistSearchBar(true, doneN + ' of ' + total + ' vehicle' + (total === 1 ? '' : 's') + ' done · ' + foundCount + ' camera' + (foundCount === 1 ? '' : 's') + ' found');
      document.getElementById('ch-histSearchFill').style.width = pct + '%';
      document.getElementById('ch-histSearchPct').textContent = pct + '%';
      document.getElementById('ch-histSearchChips').innerHTML = chips.join('');
      var wkEls = document.querySelectorAll('.cam-hist .ch-hist-wk');
      for (var wi = 0; wi < wkEls.length; wi++) {
        var ws = weekByVehicle[wkEls[wi].getAttribute('data-vid')];
        if (ws && !ws.done) wkEls[wi].textContent = 'Searching wk ' + ws.week + ' of ' + maxWeeks;
      }
    }

    histStopRequested = false;
    showHistSearchBar(true, 'Searching history for ' + total + ' vehicle' + (total === 1 ? '' : 's') + ' with unknown cameras…');

    async function searchVehicle(item) {
      var row2         = item.row;
      var stillUnknown = item.srcs.slice();
      var vid          = row2.vehicleId;
      var vname        = (row2.vehicleName || vid).slice(0, 20);

      weekByVehicle[vid] = { name: vname, week: 0, done: false };
      stillUnknown.forEach(function(src) { row2.histSearching[src] = true; });
      renderTable();

      for (var week = 0; week < maxWeeks && stillUnknown.length > 0; week++) {
        if (histStopRequested) break;
        weekByVehicle[vid].week = week + 1;
        row2.histWkLabel = 'Searching wk ' + (week + 1) + ' of ' + maxWeeks;
        if (!histStopRequested) updateHistBar();

        var weekEndMs   = now - (week * weekMs);
        var weekStartMs = weekEndMs - weekMs;
        var fromStr = new Date(weekStartMs).toISOString();
        var toStr   = new Date(weekEndMs).toISOString();

        var weekDeviceId = deviceIdByVehicleId[row2.vehicleId] || null;
        if (!weekDeviceId) {
          try {
            var weekEvData    = await telematicsApiGet('/events', { types: 'camera', from: fromStr, to: toStr });
            var weekScopedEvs = filterCameraEventsToScopedVehicles(normalizeEventsResponse(weekEvData), [row2.vehicleId]);
            for (var di = 0; di < weekScopedEvs.length; di++) {
              var ev  = weekScopedEvs[di];
              var did = ev.deviceId || (ev.device && ev.device.id) || (ev.attributes && ev.attributes.deviceId);
              if (did) { weekDeviceId = String(did); deviceIdByVehicleId[row2.vehicleId] = weekDeviceId; break; }
            }
          } catch(e) {}
        }

        if (weekDeviceId) {
            var weekSnapResult, weekFreshEvs;
            try {
              weekSnapResult = await Auth.apiCall('fetch_hist_snapshots', {
                companyId: selectedCompanyId,
                vehicleId: row2.vehicleId,
                deviceId:  weekDeviceId,
                from:      fromStr,
                to:        toStr
              });
              weekFreshEvs = Array.isArray(weekSnapResult && weekSnapResult.events)
                ? weekSnapResult.events.map(parseFreshEvent).filter(Boolean)
                : [];
            } catch(e) { weekFreshEvs = []; }

            weekFreshEvs.sort(function(a, b) { return new Date(b.timeAt) - new Date(a.timeAt); });

            var remaining = [], foundAny = false;
            for (var si2 = 0; si2 < stillUnknown.length; si2++) {
              var src = stillUnknown[si2], accepted = false;
              for (var ei = 0; ei < weekFreshEvs.length; ei++) {
                var candUrl = weekFreshEvs[ei].urls[src];
                if (!candUrl) continue;
                try {
                  var sizeRes = await Auth.apiCall('snapshot_check_sizes', {
                    snapshot: { filename: 'hist-' + row2.vehicleId + '-' + src + '.jpg', url: candUrl }
                  });
                  if (!sizeRes.tooSmall) {
                    row2.histCells[src] = { url: candUrl, timeAt: weekFreshEvs[ei].timeAt };
                    delete row2.histSearching[src];
                    foundCount++;
                    weekByVehicle[vid].found = true;
                    foundAny = true;
                    accepted = true;
                    break;
                  }
                } catch(e) { /* size check failed, skip this candidate */ }
              }
              if (!accepted) remaining.push(src);
            }
            stillUnknown = remaining;
            if (foundAny) renderTable();
          }
      }

      row2.histSearching = {};
      if (!histStopRequested && stillUnknown.length) {
        row2.histNone = {};
        stillUnknown.forEach(function(src) { row2.histNone[src] = maxWeeks; });
      }
      weekByVehicle[vid].done = true;
      row2.chDone = true;
      renderTable();
      doneCount++;
      if (!histStopRequested) updateHistBar();
    }

    await Promise.all(toSearch.map(function(item) { return searchVehicle(item); }));

    showHistSearchBar(false);
    renderTable();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function setStatus(msg) {
    document.getElementById('ch-statusText').textContent = msg;
    document.getElementById('ch-statusMsg').classList.remove('ch-hidden');
  }
  function clearStatus() { document.getElementById('ch-statusMsg').classList.add('ch-hidden'); }
  function showError(msg) { var el = document.getElementById('ch-errorMsg'); el.textContent = msg; el.classList.remove('ch-hidden'); }
  function clearError()   { document.getElementById('ch-errorMsg').classList.add('ch-hidden'); }

  function sourceCaptionTitle(src) {
    if (src === 'TVI1') return 'TVI1 (Left)';
    if (src === 'TVI2') return 'TVI2 (Right)';
    if (src === 'UVC')  return 'UVC (Additional Camera)';
    return src;
  }

  function setPersistCheckBusy(show) {
    var el = document.getElementById('ch-persistCheckOverlay');
    if (!el) return;
    if (show) { el.classList.add('is-visible'); el.setAttribute('aria-hidden', 'false'); }
    else       { el.classList.remove('is-visible'); el.setAttribute('aria-hidden', 'true'); updatePersistDownloadProgress(0, 0); }
  }

  function updatePersistDownloadProgress(done, total, statusOverride) {
    var ring    = document.getElementById('ch-persistRingFg');
    var pctEl   = document.getElementById('ch-persistProgressPct');
    var countEl = document.getElementById('ch-persistProgressCount');
    var barFill = document.getElementById('ch-persistProgressBarFill');
    var R = 40, C = 2 * Math.PI * R;
    var p = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
    if (ring)   { ring.style.strokeDasharray = String(C); ring.style.strokeDashoffset = String(C * (1 - p)); }
    if (pctEl)  { pctEl.textContent = total > 0 ? String(Math.round(p * 100)) + '%' : '—'; }
    if (countEl) {
      if (statusOverride != null && statusOverride !== '') countEl.textContent = statusOverride;
      else if (total <= 0) countEl.textContent = '';
      else countEl.textContent = 'Checked ' + done + ' of ' + total + ' image' + (total === 1 ? '' : 's');
    }
    if (barFill) { barFill.style.width = total > 0 ? String(Math.round(p * 100)) + '%' : '0%'; }
  }

  async function telematicsApiGet(endpoint, params) {
    if (!selectedCompanyId) throw new Error('No company selected.');
    var payload = { companyId: selectedCompanyId, path: '/v1' + endpoint };
    if (params && Object.keys(params).length > 0) payload.params = params;
    return await Auth.apiCall('teletrac_proxy_get', payload);
  }

  function normalizeVehiclesResponse(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.vehicles)) return data.vehicles;
    if (data && Array.isArray(data.data))     return data.data;
    return [];
  }

  function normalizeEventsResponse(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.events)) return data.events;
    if (data && Array.isArray(data.data))   return data.data;
    if (data && Array.isArray(data.items))  return data.items;
    return [];
  }

  function getVehicleIdFromEvent(ev) {
    if (!ev || typeof ev !== 'object') return '';
    if (ev._tnRequestVehicleId != null && String(ev._tnRequestVehicleId).trim() !== '') return String(ev._tnRequestVehicleId).trim();
    if (ev.vehicleId != null && String(ev.vehicleId).trim() !== '') return String(ev.vehicleId).trim();
    if (ev.vehicleID != null && String(ev.vehicleID).trim() !== '') return String(ev.vehicleID).trim();
    if (ev.vehicle && ev.vehicle.id != null) return String(ev.vehicle.id);
    var a = ev.attributes;
    if (a && typeof a === 'object') {
      if (a.vehicleId != null && String(a.vehicleId).trim() !== '') return String(a.vehicleId).trim();
      if (a.vehicle && a.vehicle.id != null) return String(a.vehicle.id);
    }
    return '';
  }

  function getDeclaredVehicleIdFromEvent(ev) {
    if (!ev || typeof ev !== 'object') return '';
    if (ev.vehicleId != null && String(ev.vehicleId).trim() !== '') return String(ev.vehicleId).trim();
    if (ev.vehicleID != null && String(ev.vehicleID).trim() !== '') return String(ev.vehicleID).trim();
    if (ev.vehicle && ev.vehicle.id != null) return String(ev.vehicle.id);
    var a = ev.attributes;
    if (a && typeof a === 'object') {
      if (a.vehicleId != null && String(a.vehicleId).trim() !== '') return String(a.vehicleId).trim();
      if (a.vehicle && a.vehicle.id != null) return String(a.vehicle.id);
    }
    return '';
  }

  function vehicleIdsMatch(a, b) {
    if (a == null || b == null) return false;
    var sa = String(a).trim(), sb = String(b).trim();
    if (!sa || !sb) return false;
    if (sa === sb) return true;
    if (sa.toLowerCase() === sb.toLowerCase()) return true;
    if (/^\d+$/.test(sa) && /^\d+$/.test(sb)) {
      var i = 0;
      while (i < sa.length - 1 && sa.charAt(i) === '0') i++;
      sa = sa.slice(i); i = 0;
      while (i < sb.length - 1 && sb.charAt(i) === '0') i++;
      sb = sb.slice(i);
      return sa === sb;
    }
    return false;
  }

  function canonicalScopedIdForDeclared(declared, scopedIds) {
    if (!declared || !scopedIds || !scopedIds.length) return '';
    var d = String(declared).trim();
    if (!d) return '';
    for (var i = 0; i < scopedIds.length; i++) {
      var sid = String(scopedIds[i]).trim();
      if (sid && vehicleIdsMatch(sid, d)) return sid;
    }
    return '';
  }

  function filterCameraEventsToScopedVehicles(events, scopedIds) {
    if (!Array.isArray(events) || !scopedIds || !scopedIds.length) return [];
    var out = [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var canon = canonicalScopedIdForDeclared(getDeclaredVehicleIdFromEvent(ev), scopedIds);
      if (!canon) continue;
      ev._tnRequestVehicleId = canon;
      out.push(ev);
    }
    return dedupeEventsById(out);
  }

  function getContextObject(event) {
    if (!event || !event.attributes) return null;
    var c = event.attributes.context;
    if (c == null || c === '') return null;
    if (typeof c === 'object') return c;
    if (typeof c === 'string') { try { return JSON.parse(c); } catch(e) { return null; } }
    return null;
  }

  function mediaUrlFromEntry(m) {
    if (!m) return '';
    var u = '';
    if (m.mediaFile) u = String(m.mediaFile).trim();
    else if (m.url)  u = String(m.url).trim();
    else if (m.uri)  u = String(m.uri).trim();
    else return '';
    if (/^\/\//.test(u)) u = 'https:' + u;
    return u;
  }

  function normSource(s) { return String(s == null ? '' : s).trim().toUpperCase(); }

  function mediaEntryHintString(m) {
    if (!m || typeof m !== 'object') return '';
    var parts = [], k, v;
    for (k in m) {
      if (!Object.prototype.hasOwnProperty.call(m, k)) continue;
      v = m[k];
      if (typeof v === 'string') {
        v = v.trim();
        if (!v || v.length > 200 || /^https?:\/\//i.test(v)) continue;
        parts.push(v);
      } else if (typeof v === 'number' && isFinite(v)) {
        parts.push(String(v));
      }
    }
    return parts.join(' ');
  }

  function mapSourceToColumnFromText(full) {
    if (!String(full || '').trim()) return null;
    var u = String(full).trim().toUpperCase();
    var t = u.replace(/[\s_\-\/\.#]/g, '');
    var s = normSource(u);
    if (SOURCES.indexOf(s) !== -1) return s;
    s = normSource(t);
    if (SOURCES.indexOf(s) !== -1) return s;
    if (u.indexOf('ROAD_FACING') !== -1 || t.indexOf('ROADFACING') !== -1) return 'ROAD';
    if (u.indexOf('DRIVER_FACING') !== -1 || t.indexOf('DRIVERFACING') !== -1) return 'DRIVER';
    if (/\bTVI_?2\b|TVI2|VIDEO_?INPUT_?2|TELEMATICS_?VIDEO_?INPUT_?2|CH2TVI|TVI_B\b|CAM(ERA)?_?2TVI|STREAM_?2TVI|INPUT_?2TVI/i.test(u)) return 'TVI2';
    if (/\bTVI_?1\b|TVI1|VIDEO_?INPUT_?1|TELEMATICS_?VIDEO_?INPUT_?1|CH1TVI|TVI_A\b|CAM(ERA)?_?1TVI|STREAM_?1TVI|INPUT_?1TVI/i.test(u)) return 'TVI1';
    if (t.indexOf('TVI2') !== -1) return 'TVI2';
    if (t.indexOf('TVI1') !== -1) return 'TVI1';
    if (/UVC|ULTRAVIOLET|UV[_\s]?CAM(?:ERA)?|ULTRA[_\s]?VIOLET|OMNI[_\s]?CAM|CABIN[_\s]?360|INTERIOR[_\s]?360/i.test(u)) return 'UVC';
    if (t.indexOf('UVC') !== -1) return 'UVC';
    if (t.indexOf('DRIVER') !== -1 || t.indexOf('DMS') !== -1 || t.indexOf('INCAB') !== -1) return 'DRIVER';
    if (/\bCAB\b/i.test(u) && !/CABIN/i.test(u)) return 'DRIVER';
    if (t.indexOf('ROAD') !== -1 || t === 'FRONT' || t.indexOf('FORWARD') !== -1) return 'ROAD';
    return null;
  }

  function mapSourceToColumnFromMedia(m) {
    return mapSourceToColumnFromText([m.source, mediaEntryHintString(m)].join(' '));
  }

  function getImageDetailsObject(m) {
    if (!m || m.imageDetails == null) return null;
    var d = m.imageDetails;
    if (typeof d === 'string') { try { return JSON.parse(d); } catch(e) { return null; } }
    if (typeof d === 'object') return d;
    return null;
  }

  function resolveTeletracNavmanColumn(m) {
    if (!m || typeof m !== 'object') return { column: null, unsureHint: '' };
    var src = normSource(m.source);
    if (src === 'ROAD_FACING')   return { column: 'ROAD',   unsureHint: '' };
    if (src === 'DRIVER_FACING') return { column: 'DRIVER', unsureHint: '' };
    if (src === 'MDVR') {
      var details = getImageDetailsObject(m);
      if (details && Array.isArray(details.sources) && details.sources.length > 0) {
        var raw = details.sources[0];
        var sub = normSource(raw);
        if (sub === 'UVC')  return { column: 'UVC',  unsureHint: '' };
        if (sub === 'TVI1') return { column: 'TVI1', unsureHint: '' };
        if (sub === 'TVI2') return { column: 'TVI2', unsureHint: '' };
        return { column: null, unsureHint: String(raw != null ? raw : '').trim() || 'MDVR' };
      }
      return { column: null, unsureHint: 'MDVR' };
    }
    return { column: null, unsureHint: '' };
  }

  function hintForUnsure(m) {
    var parts = [];
    if (m.source != null && String(m.source).trim()) parts.push(String(m.source).trim());
    var h = mediaEntryHintString(m);
    if (h && parts.join(' ').indexOf(h) === -1) parts.push(h);
    var s = parts.join(' · ').trim();
    if (s.length > 120) s = s.slice(0, 117) + '…';
    return s || '(no label)';
  }

  function mergeUrlsFromContext(context) {
    var out = { ROAD: '', DRIVER: '', TVI1: '', TVI2: '', UVC: '' };
    var unsure = [], hasMedia = false;
    function addList(list) {
      if (!Array.isArray(list)) return;
      for (var i = 0; i < list.length; i++) {
        var m = list[i], url = mediaUrlFromEntry(m);
        if (!url || !/^https?:\/\//i.test(url)) continue;
        hasMedia = true;
        var r = resolveTeletracNavmanColumn(m);
        if (r.column)          { out[r.column] = url; }
        else if (r.unsureHint) { unsure.push({ url: url, hint: r.unsureHint }); }
        else {
          var col = mapSourceToColumnFromMedia(m);
          if (col) out[col] = url;
          else unsure.push({ url: url, hint: hintForUnsure(m) });
        }
      }
    }
    addList(context.mediaFiles);
    if (context.response) addList(context.response.mediaFiles);
    for (var k in context) {
      if (!Object.prototype.hasOwnProperty.call(context, k)) continue;
      if (k === 'mediaFiles' || k === 'response') continue;
      var sub = context[k];
      if (sub && typeof sub === 'object' && Array.isArray(sub.mediaFiles)) addList(sub.mediaFiles);
    }
    return { urls: out, unsure: unsure, hasMedia: hasMedia };
  }

  function isSnapshotAction(ev) {
    if (!ev || ev.action == null) return false;
    return String(ev.action).trim().toUpperCase() === 'SNAPSHOT';
  }

  function eventTimeMs(iso) { var d = new Date(iso), t = d.getTime(); return isNaN(t) ? 0 : t; }

  function formatSnapTime(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleString('en-AU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });
    } catch(e) { return String(iso); }
  }

  function safeSnapshotFilePart(s) {
    var t = String(s == null ? '' : s).replace(/[/\\:*?"<>|#\s]+/g, '_').replace(/_+/g, '_');
    if (t.length > 64) t = t.slice(0, 64);
    return t || 'x';
  }

  function normalizeSearch(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

  function nameContainsDigitFleetBoundary(name, digits) {
    if (!name || !digits) return false;
    var escaped = String(digits).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(?:^|[^0-9])' + escaped + '(?:[^0-9]|$)').test(String(name));
  }

  function resolveLineToVehicle(line, vehicles) {
    var t = String(line || '').trim();
    if (!t || !Array.isArray(vehicles)) return { id: null, ambiguousLabels: [] };
    var search = normalizeSearch(t), i, v, name, reg, nm, hits, labels;

    function exactNameOrReg() {
      for (i = 0; i < vehicles.length; i++) {
        v = vehicles[i];
        if (v.id == null) continue;
        name = normalizeSearch(v.name); reg = normalizeSearch(v.registration);
        if (name === search || reg === search) return String(v.id).trim();
      }
      return null;
    }

    if (/^\d+$/.test(t)) {
      for (i = 0; i < vehicles.length; i++) {
        v = vehicles[i];
        if (v.id == null) continue;
        if (vehicleIdsMatch(t, v.id)) return { id: String(v.id).trim(), ambiguousLabels: [] };
      }
      var ex = exactNameOrReg();
      if (ex) return { id: ex, ambiguousLabels: [] };
      for (i = 0; i < vehicles.length; i++) {
        v = vehicles[i]; if (v.id == null) continue;
        nm = String(v.name != null ? v.name : '').trim();
        if (nm && /^\d+$/.test(nm) && vehicleIdsMatch(nm, t)) return { id: String(v.id).trim(), ambiguousLabels: [] };
      }
      hits = [];
      for (i = 0; i < vehicles.length; i++) {
        v = vehicles[i]; if (v.id == null) continue;
        nm = v.name != null ? String(v.name).trim() : '';
        if (nm && nameContainsDigitFleetBoundary(nm, t)) hits.push(v);
      }
      if (hits.length === 1) return { id: String(hits[0].id).trim(), ambiguousLabels: [] };
      if (hits.length > 1) {
        labels = hits.map(function(hv) {
          var hn = hv.name != null ? String(hv.name).trim() : '';
          var hr = hv.registration != null ? String(hv.registration).trim() : '';
          return (hn || ('ID ' + hv.id)) + (hr ? ' (' + hr + ')' : '');
        });
        return { id: null, ambiguousLabels: labels };
      }
      return { id: null, ambiguousLabels: [] };
    }

    var ex2 = exactNameOrReg();
    if (ex2) return { id: ex2, ambiguousLabels: [] };
    if (search.length >= 2) {
      for (i = 0; i < vehicles.length; i++) {
        v = vehicles[i]; if (v.id == null) continue;
        name = (v.name != null ? String(v.name).trim() : '').toLowerCase();
        if (name.indexOf(search) !== -1) return { id: String(v.id).trim(), ambiguousLabels: [] };
      }
    }
    return { id: null, ambiguousLabels: [] };
  }

  function dedupeEventsById(arr) {
    var seen = {}, out = [];
    if (!Array.isArray(arr)) return out;
    for (var i = 0; i < arr.length; i++) {
      var ev = arr[i], id = ev && ev.id != null ? ev.id : null;
      if (id != null) { if (seen[id]) continue; seen[id] = true; }
      out.push(ev);
    }
    return out;
  }

  function buildNameMap(vehicles) {
    var nameById = {};
    if (!Array.isArray(vehicles)) return nameById;
    for (var i = 0; i < vehicles.length; i++) {
      var v = vehicles[i];
      if (v.id == null) continue;
      var vid = String(v.id), nm = v.name != null ? String(v.name).trim() : '';
      nameById[vid] = nm || ('ID ' + vid);
    }
    return nameById;
  }

  function makeNotFoundRow(inputLine, detailNote, uniqueIdx) {
    var display = String(inputLine || '').trim() || '(blank line)';
    return {
      vehicleId:      '__nf_' + uniqueIdx + '_' + safeSnapshotFilePart(display).slice(0, 40),
      vehicleName:    display,
      registration:   '',
      notFound:       true,
      notFoundDetail: detailNote != null ? String(detailNote) : '',
      cols:           { ROAD: null, DRIVER: null, TVI1: null, TVI2: null, UVC: null },
      unsure:         []
    };
  }

  function mergeSnapshotRowsWithNotFound(builtRows, rowEntries) {
    var byId = {}, out = [], nfSeq = 0;
    for (var i = 0; i < builtRows.length; i++) {
      var r = builtRows[i];
      if (r && r.vehicleId != null) byId[String(r.vehicleId).trim()] = r;
    }
    for (i = 0; i < rowEntries.length; i++) {
      var e = rowEntries[i];
      if (e.kind === 'matched')  { r = byId[String(e.id).trim()]; if (r) out.push(r); }
      else if (e.kind === 'notfound') { out.push(makeNotFoundRow(e.line, e.detail, nfSeq++)); }
    }
    return out;
  }

  function extFromSnapshotUrl(url) {
    try { var path = new URL(url).pathname, m = path.match(/\.(jpe?g|png|gif|webp)$/i); return m ? ('.' + m[1].toLowerCase()) : '.jpg'; }
    catch(e) { return '.jpg'; }
  }

  function snapshotDownloadKeyCol(vehicleId, src, timeAt) {
    return String(vehicleId) + '\t' + String(src) + '\t' + String(timeAt || '');
  }

  function snapshotDownloadKeyUnsure(vehicleId, hint, timeAt) {
    return String(vehicleId) + '\tunsure\t' + String(hint || '') + '\t' + String(timeAt || '');
  }

  function enumerateSnapshotDownloadDescriptors(rows) {
    var out = [], used = {};
    function addDesc(url, fname, meta) {
      if (!url || !/^https?:\/\//i.test(url)) return;
      var base = fname, n = 0;
      while (used[base]) {
        n++;
        var dot = fname.lastIndexOf('.'), stem = dot > 0 ? fname.slice(0, dot) : fname, ext = dot > 0 ? fname.slice(dot) : '';
        base = stem + '_' + n + ext;
      }
      used[base] = true;
      var rec = { url: url, filename: base };
      for (var k in meta) { if (Object.prototype.hasOwnProperty.call(meta, k)) rec[k] = meta[k]; }
      out.push(rec);
    }
    for (var ri = 0; ri < rows.length; ri++) {
      var row = rows[ri];
      if (row.notFound) continue;
      var slug = safeSnapshotFilePart(row.vehicleName) + '_vid' + safeSnapshotFilePart(row.vehicleId);
      var vid = row.vehicleId;
      for (var j = 0; j < SOURCES.length; j++) {
        var src = SOURCES[j], cell = row.cols[src];
        if (!cell || !cell.url) continue;
        var tpart = cell.timeAt ? safeSnapshotFilePart(String(cell.timeAt).replace(/[:.]/g, '-')) : String(ri);
        addDesc(cell.url, slug + '_' + src + '_' + tpart + extFromSnapshotUrl(cell.url), { kind:'col', vehicleId:vid, src:src, timeAt:cell.timeAt, hint:'' });
      }
      var uns = row.unsure || [];
      for (j = 0; j < uns.length; j++) {
        var item = uns[j];
        if (!item || !item.url) continue;
        var hintSlug = safeSnapshotFilePart(item.hint || 'unsure');
        tpart = item.timeAt ? safeSnapshotFilePart(String(item.timeAt).replace(/[:.]/g, '-')) : String(j);
        addDesc(item.url, slug + '_unsure_' + hintSlug + '_' + tpart + extFromSnapshotUrl(item.url), { kind:'unsure', vehicleId:vid, src:'', timeAt:item.timeAt, hint: item.hint != null ? String(item.hint) : '' });
      }
    }
    return out;
  }

  function applySnapshotFileSizeResults(descriptors, results) {
    if (!batchRows) lastSnapshotSmallFileByKey = {};   // keep earlier lists' results in a multi run
    if (!descriptors || !descriptors.length) return;
    var byFile = {};
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      if (r && r.filename) byFile[r.filename] = !!r.tooSmall;
    }
    for (i = 0; i < descriptors.length; i++) {
      var d = descriptors[i], fn = d.filename;
      if (!fn || !byFile[fn]) continue;
      if (d.kind === 'col')   lastSnapshotSmallFileByKey[snapshotDownloadKeyCol(d.vehicleId, d.src, d.timeAt)]         = true;
      if (d.kind === 'unsure') lastSnapshotSmallFileByKey[snapshotDownloadKeyUnsure(d.vehicleId, d.hint, d.timeAt)] = true;
    }
  }

  function colSnapshotFileTooSmall(vehicleId, src, timeAt)    { return !!lastSnapshotSmallFileByKey[snapshotDownloadKeyCol(vehicleId, src, timeAt)]; }
  function unsureSnapshotFileTooSmall(vehicleId, hint, timeAt) { return !!lastSnapshotSmallFileByKey[snapshotDownloadKeyUnsure(vehicleId, hint, timeAt)]; }

  function colSnapshotStatusLabel(vehicleId, src, cell, row) {
    if (row && row.notFound) return 'NOT FOUND';
    if (!cell || !cell.url) {
      var hist = row && row.histCells && row.histCells[src];
      if (hist) return 'HISTORICAL (' + formatSnapTime(hist.timeAt) + ')';
      return 'UNKNOWN';
    }
    if (colSnapshotFileTooSmall(vehicleId, src, cell.timeAt)) {
      var hist2 = row && row.histCells && row.histCells[src];
      if (hist2) return 'HISTORICAL (' + formatSnapTime(hist2.timeAt) + ')';
      return 'FAILED';
    }
    return 'GOOD';
  }

  function unsureColumnStatusForCsv(row) {
    if (row && row.notFound) return 'NOT FOUND';
    var items = row.unsure || [];
    if (!items.length) return 'UNKNOWN';
    var parts = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || !it.url) { parts.push('UNKNOWN'); continue; }
      var st = unsureSnapshotFileTooSmall(row.vehicleId, it.hint != null ? String(it.hint) : '', it.timeAt) ? 'FAILED' : 'GOOD';
      var label = (it.hint != null ? String(it.hint) : '').replace(/[\r\n|]/g, ' ').replace(/;/g, ',').trim();
      if (!label) label = 'Unsure_' + (i + 1);
      parts.push(label + ':' + st);
    }
    return parts.join(' | ');
  }

  function csvEscapeField(value) {
    var t = String(value == null ? '' : value);
    return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }

  function exportSnapshotsToCsv() {
    if (!allRows.length) { alert('Load snapshots first, then export.'); return; }
    var headers = ['Vehicle name', 'Registration', 'ROAD', 'DRIVER', 'TVI1', 'TVI2', 'UVC', 'Unsure'];
    var lines = [headers.map(csvEscapeField).join(',')];
    for (var ri = 0; ri < allRows.length; ri++) {
      var row = allRows[ri], vid = row.vehicleId;
      var cells = [
        row.vehicleName    != null ? String(row.vehicleName)    : '',
        row.registration   != null ? String(row.registration)   : ''
      ];
      for (var j = 0; j < SOURCES.length; j++) {
        var src = SOURCES[j], cell = row.cols[src];
        cells.push(colSnapshotStatusLabel(vid, src, cell, row));
      }
      cells.push(unsureColumnStatusForCsv(row));
      lines.push(cells.map(csvEscapeField).join(','));
    }
    var csv  = '\ufeff' + lines.join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url  = URL.createObjectURL(blob);
    var stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    var a = document.createElement('a');
    a.href = url; a.download = 'camera-history-' + stamp + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function buildAllSnapshotRows(vehicles, events, scopedIds) {
    var nameById = buildNameMap(vehicles);
    var regById  = {};
    if (Array.isArray(vehicles)) {
      for (var qi = 0; qi < vehicles.length; qi++) {
        var vx = vehicles[qi];
        if (vx.id == null) continue;
        regById[String(vx.id)] = vx.registration != null ? String(vx.registration).trim() : '';
      }
    }
    var ag = {};
    for (var si = 0; si < scopedIds.length; si++) {
      var sid = String(scopedIds[si]).trim();
      if (!sid) continue;
      ag[sid] = { vehicleId: sid, vehicleName: nameById[sid] || ('ID ' + sid), registration: regById[sid] || '',
                  cols: { ROAD:null, DRIVER:null, TVI1:null, TVI2:null, UVC:null }, unsureByHint: {} };
    }

    var stats = { totalEvents: events.length, eventsWithContext:0, snapshotEventsWithMedia:0 };
    var evSorted = events.slice().sort(function(a, b) { return eventTimeMs(b.timeAt) - eventTimeMs(a.timeAt); });

    for (var i = 0; i < evSorted.length; i++) {
      var ev = evSorted[i];
      if (!isSnapshotAction(ev)) continue;
      var ctx = getContextObject(ev);
      if (!ctx) continue;
      stats.eventsWithContext++;
      var vId = getVehicleIdFromEvent(ev), key = vId ? String(vId) : '';
      if (!key || !ag[key]) continue;
      var parsed = mergeUrlsFromContext(ctx);
      if (!parsed.hasMedia) continue;
      stats.snapshotEventsWithMedia++;
      var tm = eventTimeMs(ev.timeAt);
      for (var j = 0; j < SOURCES.length; j++) {
        var src = SOURCES[j], u = parsed.urls[src];
        if (!u || !/^https?:\/\//i.test(u)) continue;
        var cur = ag[key].cols[src];
        if (!cur || tm > eventTimeMs(cur.timeAt)) ag[key].cols[src] = { url:u, timeAt:ev.timeAt };
      }
      var un = parsed.unsure;
      if (un && un.length) {
        for (j = 0; j < un.length; j++) {
          u = un[j].url;
          if (!u || !/^https?:\/\//i.test(u)) continue;
          var hintKey = un[j].hint != null ? String(un[j].hint) : '';
          cur = ag[key].unsureByHint[hintKey];
          if (!cur || tm > eventTimeMs(cur.timeAt)) ag[key].unsureByHint[hintKey] = { url:u, timeAt:ev.timeAt, hint:hintKey };
        }
      }
    }

    var rows = [];
    for (si = 0; si < scopedIds.length; si++) {
      sid = String(scopedIds[si]).trim();
      if (!ag[sid]) continue;
      var bucket = ag[sid], unsureArr = [];
      for (var hk in bucket.unsureByHint) {
        if (!Object.prototype.hasOwnProperty.call(bucket.unsureByHint, hk)) continue;
        unsureArr.push(bucket.unsureByHint[hk]);
      }
      unsureArr.sort(function(x, y) { var hx = (x.hint||'').toLowerCase(), hy = (y.hint||'').toLowerCase(); return hx<hy?-1:hx>hy?1:0; });
      bucket.unsure = unsureArr;
      rows.push(bucket);
    }
    return { rows: rows, stats: stats };
  }

  async function persistSnapshotsAfterLoad() {
       var descriptors = enumerateSnapshotDownloadDescriptors(batchRows || allRows);
    var total = descriptors.length;

    if (total === 0) {
      if (!batchRows) lastSnapshotSmallFileByKey = {};
      lastSnapshotSaveMessage = 'No images to check.';
      renderTable();
      return;
    }

    updatePersistDownloadProgress(0, total, null);
    var results = [];

    for (var idx = 0; idx < total; idx++) {
      updatePersistDownloadProgress(idx, total, null);
      var d = descriptors[idx];
      try {
        var res = await Auth.apiCall('snapshot_check_sizes', { snapshot: { filename: d.filename, url: d.url } });
        results.push(res);
      } catch(e) {
        results.push({ filename: d.filename, bytes: null, tooSmall: false, error: e.message });
      }
    }

    updatePersistDownloadProgress(total, total, null);
    applySnapshotFileSizeResults(descriptors, results);

    var smallCount = results.filter(function(r){ return r.tooSmall; }).length;
    var okCount    = results.filter(function(r){ return r.bytes != null && !r.tooSmall; }).length;
    var errCount   = results.filter(function(r){ return r.bytes == null; }).length;
    lastSnapshotSaveMessage = okCount + ' OK' + (smallCount ? ', ' + smallCount + ' failed (too small)' : '') + (errCount ? ', ' + errCount + ' unreachable' : '') + '.';

    renderTable();
  }

  function renderHistCell(hist, row, columnLabel) {
    var hvn = row.vehicleName, hvid = row.vehicleId;
    var hcap = esc(hvn + ' · ' + columnLabel + ' · ' + formatSnapTime(hist.timeAt) + ' [HISTORICAL]');
    return '<div class="snap-col-stack"><div class="snap-thumb-block">' +
      '<div class="thumb-wrap snap-hist-wrap"><img src="' + esc(hist.url) + '" alt="" data-full="' + esc(hist.url) + '" data-caption="' + hcap + '" data-vehicle-id="' + esc(String(hvid)) + '" data-vehicle-name="' + esc(hvn) + '"></div>' +
      '<span class="snap-hist-badge">HISTORICAL</span>' +
      '<span class="snap-hist-time">' + esc(formatSnapTime(hist.timeAt)) + '</span>' +
      '</div></div>';
  }

  function renderColCell(cell, row, src, columnLabel) {
    if (row && row.notFound) return '<span class="snap-not-found">NOT FOUND</span>';
    if (!cell || !cell.url) {
      var hist = row.histCells && row.histCells[src];
      if (hist) return renderHistCell(hist, row, columnLabel);
      if (row.histSearching && row.histSearching[src]) {
        return '<div class="snap-col-stack"><div class="snap-thumb-block">' +
          '<div class="thumb-wrap snap-hist-searching" style="width:100%;min-height:88px;display:flex;align-items:center;justify-content:center;">' +
          '<span class="ch-hist-spin" aria-hidden="true"></span>' +
          '<span class="ch-hist-wk" data-vid="' + esc(String(row.vehicleId)) + '">' + esc(row.histWkLabel || 'Searching history') + '</span></div>' +
          '</div></div>';
      }
      if (row.histNone && row.histNone[src]) return '<span class="snap-hist-none">Not found in ' + row.histNone[src] + ' wks</span>';
      return '<span class="thumb-missing">UNKNOWN</span>';
    }
    var vehicleName = row.vehicleName, vehicleId = row.vehicleId;
    var fail      = colSnapshotFileTooSmall(vehicleId, src, cell.timeAt);
    var hist2     = fail && row.histCells && row.histCells[src];
    if (hist2) return renderHistCell(hist2, row, columnLabel);
    var searching = fail && row.histSearching && row.histSearching[src];
    var cap  = esc(vehicleName + ' · ' + columnLabel + ' · ' + formatSnapTime(cell.timeAt));
    return '<div class="snap-col-stack">' +
      '<div class="snap-thumb-block">' +
      '<div class="thumb-wrap ' + (searching ? 'snap-hist-searching' : '') + '"><img src="' + esc(cell.url) + '" alt="" data-full="' + esc(cell.url) + '" data-caption="' + cap + '" data-vehicle-id="' + esc(String(vehicleId)) + '" data-vehicle-name="' + esc(vehicleName) + '"></div>' +
      '<span class="snap-time">' + esc(formatSnapTime(cell.timeAt)) + '</span>' +
      (fail ? '<span class="snap-failed">FAILED</span>' : '') +
            (searching ? '<span class="snap-searching-badge ch-hist-wk" data-vid="' + esc(String(vehicleId)) + '">' + esc(row.histWkLabel || 'Searching history') + '</span>' : '') +
      '</div></div>';
  }

  function renderUnsureStack(items, row) {
    if (row && row.notFound) return '<span class="snap-not-found">NOT FOUND</span>';
    if (!items || !items.length) return '<span class="thumb-missing">UNKNOWN</span>';
    var vehicleName = row.vehicleName, vehicleId = row.vehicleId;
    var parts = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var cap  = esc(vehicleName + ' · Unsure · ' + (item.hint || '') + ' · ' + formatSnapTime(item.timeAt));
      var fail = unsureSnapshotFileTooSmall(vehicleId, item.hint != null ? String(item.hint) : '', item.timeAt);
      parts.push(
        '<div class="snap-thumb-block">' +
        '<div class="thumb-wrap"><img src="' + esc(item.url) + '" alt="" data-full="' + esc(item.url) + '" data-caption="' + cap + '" data-vehicle-id="' + esc(String(vehicleId)) + '" data-vehicle-name="' + esc(vehicleName) + '"></div>' +
        '<span class="snap-time">' + esc(formatSnapTime(item.timeAt)) + '</span>' +
        (fail ? '<span class="snap-failed">FAILED</span>' : '') +
        '<span class="unsure-hint">' + esc(item.hint || '') + '</span>' +
        '</div>'
      );
    }
    return '<div class="snap-col-stack">' + parts.join('') + '</div>';
  }

  function renderTable() {
    var tbody = document.getElementById('ch-snapTableBody');
    if (!tbody) return;
    if (!allRows.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:2rem;font-size:0.875rem;">No results. Enter fleet numbers or vehicle names (one per line), then check snapshots.</td></tr>';
      return;
    }
    tbody.innerHTML = allRows.map(function(row) {
      var cells = SOURCES.map(function(src) {
    return '<td>' + renderColCell(row.cols[src], row, src, sourceCaptionTitle(src)) + markButtonsHtml(row, src) + '</td>';
      }).join('');
      var unsureCell = '<td>' + renderUnsureStack(row.unsure, row) + '</td>';
            var sub = row.registration ? '<br><span style="font-weight:500;font-size:0.7rem;color:#6b7280;">' + esc(row.registration) + '</span>' : '';
      if (row.listNo) sub += '<br><span class="ch-list-tag">List ' + row.listNo + '</span>';
      if (row.notFound) {
        sub += '<br><span class="snap-not-found-detail">Not found in fleet for this company.</span>';
        if (row.notFoundDetail) sub += '<br><span class="snap-not-found-detail">' + esc(row.notFoundDetail) + '</span>';
      }
           if (!row.notFound) {
        sub += '<br><button type="button" class="ch-sysdown' + (row.systemDown ? ' on' : '') + '" data-vid="' + esc(String(row.vehicleId)) + '">' + (row.systemDown ? '⚠ System Down' : 'Mark System Down') + '</button>';
      }
      return '<tr' + (row.systemDown ? ' class="is-down"' : '') + '><td><div class="ch-veh"><span class="ch-sel-slot" data-vid="' + esc(String(row.vehicleId)) + '"></span><div>' + esc(row.vehicleName) + sub + '</div></div></td>' + cells + unsureCell + '</tr>';
    }).join('');
       wireTableImages();
    addSelectBoxes();
    updateMultiLine();
  }

  // ── Selection, Good/Failed marking and Email Selected (as in Camera Count) ──
  // Ticks and marks live on each row in allRows, so the table can redraw
  // during the history search without losing them.
  function findRow(vid) {
    for (var i = 0; i < allRows.length; i++) { if (String(allRows[i].vehicleId) === String(vid)) return allRows[i]; }
    return null;
  }

  // What the camera is showing right now, before anyone marks it:
  // a good current image = Good; a failed image or a historical one = Failed;
  // nothing at all (or still searching) = not reviewed.
  function defaultMark(row, src) {
    var cell = row.cols[src];
    var failed = cell && cell.url && colSnapshotFileTooSmall(row.vehicleId, src, cell.timeAt);
    if (cell && cell.url && !failed) return 'working';
    if (row.histSearching && row.histSearching[src]) return null;
    if (failed || (row.histCells && row.histCells[src])) return 'not_working';
    return null;
  }

  function getMark(row, src) {
    if (row.marks && Object.prototype.hasOwnProperty.call(row.marks, src)) return row.marks[src];
    return defaultMark(row, src);
  }

  function markButtonsHtml(row, src) {
    if (row.notFound || row.systemDown) return '';
    var m = getMark(row, src), vid = esc(String(row.vehicleId));
    return '<div class="ch-mark">' +
      '<button type="button" class="ch-mark-btn is-good' + (m === 'working' ? ' on' : '') + '" data-vid="' + vid + '" data-src="' + src + '" data-val="working">✓ Good</button>' +
      '<button type="button" class="ch-mark-btn is-bad' + (m === 'not_working' ? ' on' : '') + '" data-vid="' + vid + '" data-src="' + src + '" data-val="not_working">✗ Failed</button>' +
      '</div>';
  }

  function addSelectBoxes() {
    document.querySelectorAll('#ch-snapTableBody .ch-sel-slot').forEach(function(slot) {
      var row = findRow(slot.getAttribute('data-vid'));
      if (!row || row.notFound) return;
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'ch-sel';
      box.title = 'Select for email';
      box.checked = !!row.selected;
      box.setAttribute('data-vid', String(row.vehicleId));
      slot.appendChild(box);
    });
    updateSelectionControls();
  }

  function updateSelectionControls() {
    var show = allRows.some(function(r) { return !r.notFound; });
    ['ch-btnSelAll', 'ch-btnSelNone', 'ch-btnEmailSel'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = show ? '' : 'none';
    });
    var n = allRows.filter(function(r) { return r.selected; }).length;
    var cnt = document.getElementById('ch-selCount');
    if (cnt) cnt.textContent = show && n ? n + ' selected' : '';
  }

  function setAllSelected(on) {
    allRows.forEach(function(r) { if (!r.notFound) r.selected = on; });
    renderTable();
  }

  function onTableClick(e) {
    var t = e.target;
    if (t.classList.contains('ch-sel')) {
      var r0 = findRow(t.getAttribute('data-vid'));
      if (r0) r0.selected = t.checked;
      updateSelectionControls();
      return;
    }
    if (t.classList.contains('ch-sysdown')) {
      var r1 = findRow(t.getAttribute('data-vid'));
      if (r1) { r1.systemDown = !r1.systemDown; renderTable(); }
      return;
    }
    if (t.classList.contains('ch-sd-btn')) {
      var r3 = findRow(t.getAttribute('data-vid'));
      if (!r3) return;
      var n = t.getAttribute('data-sd'), v = t.getAttribute('data-val');
      r3.sdMarks = r3.sdMarks || {};
      r3.sdMarks[n] = getSdMark(r3, n) === v ? null : v;   // click the active one again to clear it
      refreshSdStrip(r3);
      return;
    }
    if (t.classList.contains('ch-sd-btn')) {
      var r3 = findRow(t.getAttribute('data-vid'));
      if (!r3) return;
      var n = t.getAttribute('data-sd'), v = t.getAttribute('data-val');
      r3.sdMarks = r3.sdMarks || {};
      r3.sdMarks[n] = getSdMark(r3, n) === v ? null : v;   // click the active one again to clear it
      refreshSdStrip(r3);
      return;
    }
    if (t.classList.contains('ch-sd-btn')) {
      var r3 = findRow(t.getAttribute('data-vid'));
      if (!r3) return;
      var n = t.getAttribute('data-sd'), v = t.getAttribute('data-val');
      r3.sdMarks = r3.sdMarks || {};
      r3.sdMarks[n] = getSdMark(r3, n) === v ? null : v;   // click the active one again to clear it
      refreshSdStrip(r3);
      return;
    }
    if (t.classList.contains('ch-sd-btn')) {
      var r3 = findRow(t.getAttribute('data-vid'));
      if (!r3) return;
      var n = t.getAttribute('data-sd'), v = t.getAttribute('data-val');
      r3.sdMarks = r3.sdMarks || {};
      r3.sdMarks[n] = getSdMark(r3, n) === v ? null : v;   // click the active one again to clear it
      refreshSdStrip(r3);
      return;
    }
    if (t.classList.contains('ch-mark-btn')) {
      var r2 = findRow(t.getAttribute('data-vid'));
      if (!r2) return;
      var src = t.getAttribute('data-src'), val = t.getAttribute('data-val');
      r2.marks = r2.marks || {};
      r2.marks[src] = getMark(r2, src) === val ? null : val;   // click the active one again to clear it
      renderTable();
    }
  }

  // Same row shape as Camera Count, so the composer's status table and the
  // camera PDF attachment work unchanged. Slot order matches Camera Count.
  var EMAIL_SLOTS = [
    { src: 'ROAD',   label: 'Road' },
    { src: 'DRIVER', label: 'Driver' },
    { src: 'UVC',    label: 'In-Cab' },
    { src: 'TVI2',   label: 'R.Ext' },
    { src: 'TVI1',   label: 'L.Ext' }
  ];

  function openEmailForSelected() {
    var selected = allRows.filter(function(r) { return r.selected && !r.notFound; });
    if (!selected.length) { showError('Tick at least one vehicle first.'); return; }
    clearError();

    var emailRows = selected.map(emailRowFor);

    TGE.openEmailComposer({
      rows: emailRows,
      fields: [
        { key: 'legacyNo',     label: 'Legacy No' },
        { key: 'registration', label: 'Registration' },
        { key: 'lastComms',    label: 'Last Snapshot' },
        { key: 'working',      label: 'Cameras Working' },
        { key: 'notWorking',   label: 'Cameras Not Working' }
      ],
      imagesField: null
    });
  }

  // Builds one composer/PDF row (Camera Count shape) for a vehicle.
  function emailRowFor(row) {
    var latest = '';
    var slots = EMAIL_SLOTS.map(function(s) {
      var cell = row.cols[s.src], hist = row.histCells && row.histCells[s.src];
      var failed = cell && cell.url && colSnapshotFileTooSmall(row.vehicleId, s.src, cell.timeAt);
      if (cell && cell.timeAt && !failed && cell.timeAt > latest) latest = cell.timeAt;
      var url = (cell && cell.url && !failed) ? cell.url : (hist ? hist.url : (cell && cell.url) || null);
      var status = getMark(row, s.src);
      if (!url && !status) return null;   // this camera isn't fitted / never seen
      return { label: s.label, url: url, status: status };
    });
    var working = slots.filter(function(s) { return s && s.status === 'working'; }).length;
    var notWorking = slots.filter(function(s) { return s && s.status === 'not_working'; }).length;
    return {
      legacyNo:     row.vehicleName || '—',
      registration: row.registration || '—',
      imei:         '—',
      cameraModel:  '—',
      lastComms:    latest ? formatSnapTime(latest) : 'Unknown',
      systemDown:   !!row.systemDown,
      working:      working,
      notWorking:   notWorking,
      slots:        slots
    };
  }

  // ── Export pill (shared TGE.buildOutputPill, same as the other screens) ─────
  function chExportItems() {
    return [
      { id:'ch-pdf-btn',   label:'Camera PDF', suffix:'PDF',  icon:'📄', permission:['camera-history','export-pdf'],       action: exportCameraPdf },
      { id:'ch-email-btn', label:'Email PDF',  suffix:'Send', icon:'✉️', permission:['camera-history','export-email-pdf'], action: openEmailForSelected },
      { id:'ch-csv-btn',   label:'CSV',        suffix:'.csv', icon:'📑', permission:['camera-history','export-csv'],       action: function() { exportHistoryTable('csv'); } },
      { id:'ch-xlsx-btn',  label:'Excel',      suffix:'.xlsx',icon:'📊', permission:['camera-history','export-xlsx'],      action: function() { exportHistoryTable('xlsx'); } },
      { id:'ch-json-btn',  label:'JSON',       suffix:'.json',icon:'{}', permission:['camera-history','export-json'],      action: function() { exportHistoryTable('json'); } }
    ];
  }

  // Ticked vehicles, or every vehicle found when none are ticked.
  function rowsForOutput() {
    var found = allRows.filter(function(r) { return !r.notFound; });
    var ticked = found.filter(function(r) { return r.selected; });
    return ticked.length ? ticked : found;
  }

  function markLabel(m) { return m === 'working' ? 'Good' : m === 'not_working' ? 'Failed' : ''; }

  function exportHistoryTable(format) {
    if (!allRows.length) { alert('Check snapshots first, then export.'); return; }
    var header = ['Vehicle name', 'Registration', 'System down'];
    SOURCES.forEach(function(src) { header.push(src, src + ' marked'); });
    header.push('Unsure');
    var rows = allRows.map(function(row) {
      var out = [row.vehicleName || '', row.registration || '', row.systemDown ? 'Yes' : ''];
      SOURCES.forEach(function(src) {
        out.push(colSnapshotStatusLabel(row.vehicleId, src, row.cols[src], row));
        out.push(row.notFound ? '' : markLabel(getMark(row, src)));
      });
      out.push(unsureColumnStatusForCsv(row));
      return out;
    });
    TGE.exportTable({ header: header, rows: rows, sheetName: 'Camera History' }, format, { module: 'CameraHistory', type: 'Snapshots' });
  }

  async function exportCameraPdf() {
    var rows = rowsForOutput();
    if (!rows.length) { alert('Check snapshots first, then export.'); return; }
    if (rows.length > 200) { alert('The PDF takes up to 200 vehicles. Tick the ones you need.'); return; }
    setStatus('Building camera PDF…');
    try {
      var assets = rows.map(emailRowFor).map(function(r) {
        return { legacyNo: r.legacyNo, imei: r.imei, model: r.cameraModel, lastComms: r.lastComms, systemDown: r.systemDown,
                 slots: r.slots.filter(function(s) { return s != null; }) };
      });
      var res = await TGE.api('POST', '/api/camera-fault-pdf', { assets: assets });
      if (!res.ok || !res.data || !res.data.base64) throw new Error((res.data && res.data.error) || 'PDF could not be built.');
      var bin = atob(res.data.base64), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      var a = document.createElement('a');
      a.href = url;
      a.download = TGE.outputFileName({ module: 'CameraHistory', type: 'CameraReport', extension: 'pdf' });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    } catch (e) {
      showError('Camera PDF: ' + e.message);
    } finally {
      clearStatus();
    }
  }

  function wireTableImages() {
    document.querySelectorAll('#ch-snapTableBody img[data-full]').forEach(function(img) {
      img.addEventListener('click', function(e) { e.stopPropagation(); openFsFromImg(img); });
    });
  }

  // ── SD card strip (same TN360 data as the SD Health page) ───────────────────
  // Uses the /api/tn360 proxy, like SD Health: one call for the camera device
  // list, then one devicestats call per camera, 5 at a time. It runs after the
  // history search has finished, as its own step.
  var sdLoadGen = 0, sdRun = null, sdProgress = null;

  function sdLabel(val) {
    if (val === 'sdCardPresent') return 'Present';
    if (val === 'sdCardAbsent')  return 'Not Present';
    if (val === 'sdCardFailed')  return 'Failed';
    return val || '—';
  }

  function sdBytes(b) {
    var n = parseFloat(b);
    if (!b || isNaN(n)) return '';
    if (n >= 1e12) return (n / 1e12).toFixed(1) + ' TB';
    if (n >= 1e9)  return (n / 1e9).toFixed(1) + ' GB';
    if (n >= 1e6)  return (n / 1e6).toFixed(1) + ' MB';
    return n + ' B';
  }

  function sdTime(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', day: '2-digit', month: '2-digit',
        year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) { return String(ts); }
  }

  // Present = Good; Not Present or Failed = Failed, until someone marks it.
  function getSdMark(row, n) {
    if (row.sdMarks && Object.prototype.hasOwnProperty.call(row.sdMarks, n)) return row.sdMarks[n];
    var v = row.sd && row.sd['sd' + n];
    if (v === 'sdCardPresent') return 'working';
    if (v === 'sdCardAbsent' || v === 'sdCardFailed') return 'not_working';
    return null;
  }

  function sdChipHtml(row, n) {
    var v = row.sd['sd' + n], size = sdBytes(row.sd['sd' + n + 'Bytes']);
    var m = getSdMark(row, n), vid = esc(String(row.vehicleId));
    var bad = v === 'sdCardAbsent' || v === 'sdCardFailed';
    return '<span class="ch-sd-chip' + (bad ? ' bad' : '') + '">SD ' + n + ' · ' + esc(sdLabel(v)) + (size ? ' <small>' + esc(size) + '</small>' : '') +
      '<span class="ch-sd-tg">' +
      '<button type="button" class="ch-sd-btn' + (m === 'working' ? ' on-g' : '') + '" data-vid="' + vid + '" data-sd="' + n + '" data-val="working" title="Mark SD ' + n + ' Good">✓</button>' +
      '<button type="button" class="ch-sd-btn' + (m === 'not_working' ? ' on-b' : '') + '" data-vid="' + vid + '" data-sd="' + n + '" data-val="not_working" title="Mark SD ' + n + ' Failed">✗</button>' +
      '</span></span>';
  }

  function sdStripHtml(row) {
    var sd = row.sd, body;
    if (!sd) body = '<span class="ch-sd-note">SD card details load after the history search</span>';
    else if (sd.state === 'loading') body = '<span class="ch-sd-note">Loading camera details…</span>';
    else if (sd.state === 'none') body = '<span class="ch-sd-note">No camera device found in TN360</span>';
    else if (sd.state === 'error') body = '<span class="ch-sd-note">Camera details unavailable</span>';
    else body = '<span class="ch-sd-k">Camera</span><span class="ch-sd-v">' + esc(sd.model || '—') + '</span>' +
      '<span class="ch-sd-mono">' + esc(sd.imei || '—') + '</span><span class="ch-sd-sep"></span>' +
      sdChipHtml(row, 1) + sdChipHtml(row, 2) +
      '<span class="ch-sd-last">Last connected <b>' + esc(sdTime(sd.lastEventAt)) + '</b></span>';
    return '<tr class="ch-sd-row" data-vid="' + esc(String(row.vehicleId)) + '"><td></td><td colspan="6"><div class="ch-sd-strip">' + body + '</div></td></tr>';
  }

  // Redraws one vehicle's strip in place, so the snapshot images aren't reloaded.
  function refreshSdStrip(row) {
    var trs = document.querySelectorAll('#ch-snapTableBody tr.ch-sd-row');
    for (var i = 0; i < trs.length; i++) {
      if (trs[i].getAttribute('data-vid') === String(row.vehicleId)) { trs[i].outerHTML = sdStripHtml(row); return; }
    }
  }

  // For email merge fields, e.g. "Present 495.1 GB (Good)".
  function sdSummary(row, n) {
    if (!row.sd || row.sd.state !== 'ok') return '—';
    var size = sdBytes(row.sd['sd' + n + 'Bytes']), mark = markLabel(getSdMark(row, n));
    return sdLabel(row.sd['sd' + n]) + (size ? ' ' + size : '') + (mark ? ' (' + mark + ')' : '');
  }

  // Model, IMEI, SD 1, SD 1 size, SD 1 marked, SD 2, SD 2 size, SD 2 marked, Last connected.
  function sdExportCells(row) {
    var sd = row.sd;
    if (row.notFound || !sd || sd.state !== 'ok') return ['', '', '', '', '', '', '', '', ''];
    return [sd.model || '', sd.imei || '',
      sdLabel(sd.sd1), sdBytes(sd.sd1Bytes), markLabel(getSdMark(row, '1')),
      sdLabel(sd.sd2), sdBytes(sd.sd2Bytes), markLabel(getSdMark(row, '2')),
      sd.lastEventAt ? sdTime(sd.lastEventAt) : ''];
  }

  // rows = the vehicles just checked (one list in a multi run). Waits until
  // every camera is done, so a multi run only moves on once SD is filled in.
  async function loadSdDetails(rows) {
    var gen = ++sdLoadGen;
    if (sdRun) { sdRun.cancel(); sdRun = null; }
    rows = (rows || []).filter(function(r) { return !r.notFound; });
    if (!rows.length) return;
    rows.forEach(function(r) { r.sd = { state: 'loading' }; refreshSdStrip(r); });
    setStatus('Loading SD card details…');

    var res = null;
    try { res = await TGE.api('GET', '/api/tn360/v1/devices?pruning=B2B'); } catch (e) { res = null; }
    if (gen !== sdLoadGen) return;
    if (!res || !res.ok || !Array.isArray(res.data)) {
      rows.forEach(function(r) { r.sd = { state: 'error' }; refreshSdStrip(r); });
      clearStatus();
      return;
    }

    var camByVid = {};
    res.data.forEach(function(d) {
      if (!d || !d.type || d.type.code !== 'CAMERA' || d.outServiceAt || !d.vehicleId) return;
      camByVid[String(d.vehicleId)] = d;
    });
    var todo = [];
    rows.forEach(function(r) {
      var d = camByVid[String(r.vehicleId)];
      if (d) { todo.push({ row: r, device: d }); return; }
      r.sd = { state: 'none' };
      refreshSdStrip(r);
    });

    sdProgress = { done: 0, total: todo.length };
    updateMultiLine();
    sdRun = TGE.Progress.run({
      items: todo,
      concurrency: 5,
      delay: 300,
      worker: async function(it) {
        var imei = it.device.imei || it.device.serialNumber;
        var url = '/api/tn360/v1/devices/' + encodeURIComponent(imei) + '?pruning=B2B&embed=devicestats';
        var r = await TGE.api('GET', url);
        if (!r.ok) {   // one retry after a short pause before giving up
          await new Promise(function(ok) { setTimeout(ok, 1500); });
          r = await TGE.api('GET', url);
        }
        if (!r.ok) throw new Error('Device stats failed for ' + imei);
        return r.data;
      },
      onItem: function(data, it) {
        if (gen !== sdLoadGen) return;
        var stats = (data && data.deviceStats) || {}, attrs = stats.attrs || {};
        it.row.sd = {
          state:       'ok',
          imei:        it.device.imei || '',
          model:       (it.device.model && it.device.model.name) || '',
          sd1:         attrs['lm.sd_card.1'] || '',
          sd1Bytes:    attrs['lm.sd_card.1_total_size_bytes'] || '',
          sd2:         attrs['lm.sd_card.2'] || '',
          sd2Bytes:    attrs['lm.sd_card.2_total_size_bytes'] || '',
          overall:     attrs['lm.sd_card.overall_status'] || '',
          lastEventAt: stats.lastEventAt || null
        };
        refreshSdStrip(it.row);
      },
      onError: function(err, it) {
        if (gen !== sdLoadGen) return;
        it.row.sd = { state: 'error' };
        refreshSdStrip(it.row);
      },
      onProgress: function(done, total) {
        if (gen !== sdLoadGen) return;
        sdProgress = { done: done, total: total };
        setStatus('Loading SD card details — ' + done + ' of ' + total + '…');
        updateMultiLine();
      }
    });
    await sdRun.promise;
    if (gen !== sdLoadGen) return;
    sdRun = null;
    sdProgress = null;
    clearStatus();
    updateMultiLine();
  }

  // ── Multi run: several lists, run one after another into the one table ────
  // Each list goes through the normal check (same calls, same speed). Rows from
  // earlier lists stay in the table; image checks and the history search only
  // run for the list being run (batchRows).
  var multiOn = false, multiLists = [''], multiActive = 0;
  var multiStopRequested = false, multiState = null, batchRows = null;

  function linesOf(text) {
    return String(text || '').split(/\r?\n/).map(function(s) { return s.trim(); }).filter(Boolean);
  }

  function saveActiveList() {
    var ta = document.getElementById('ch-fleetFilter');
    if (ta && multiOn) multiLists[multiActive] = ta.value;
  }

  function renderListTabs() {
    var btn = document.getElementById('ch-btnMulti');
    if (btn) btn.classList.toggle('on', multiOn);
    var box = document.getElementById('ch-listTabs');
    if (!box) return;
    box.classList.toggle('ch-hidden', !multiOn);
    if (!multiOn) { box.innerHTML = ''; return; }
    box.innerHTML = multiLists.map(function(txt, i) {
      return '<button type="button" class="ch-list-tab' + (i === multiActive ? ' on' : '') + '" data-list="' + i + '">List ' + (i + 1) +
        ' <small>' + linesOf(txt).length + '</small>' +
        (i > 0 ? '<span class="ch-list-x" data-del="' + i + '" title="Remove this list">×</span>' : '') + '</button>';
    }).join('') + '<button type="button" class="ch-list-add" id="ch-listAdd">+ Add list</button>';
  }

  function showList(i) {
    multiActive = i;
    document.getElementById('ch-fleetFilter').value = multiLists[i] || '';
    renderListTabs();
  }

  // Turning Multi run off puts every list back into the one box, so nothing is lost.
  function toggleMulti() {
    var ta = document.getElementById('ch-fleetFilter');
    if (!multiOn) {
      multiOn = true;
      multiLists = [ta.value];
      showList(0);
    } else {
      saveActiveList();
      multiOn = false;
      ta.value = multiLists.map(function(t) { return linesOf(t).join('\n'); }).filter(Boolean).join('\n');
      multiLists = [''];
      multiActive = 0;
      renderListTabs();
    }
  }

  function onListTabsClick(e) {
    var t = e.target;
    if (t.id === 'ch-listAdd') {
      saveActiveList();
      multiLists.push('');
      showList(multiLists.length - 1);
      document.getElementById('ch-fleetFilter').focus();
      return;
    }
    var del = t.getAttribute('data-del');
    if (del != null) {
      var d = parseInt(del, 10);
      saveActiveList();
      if (linesOf(multiLists[d]).length && !confirm('Remove List ' + (d + 1) + '?')) return;
      multiLists.splice(d, 1);
      showList(Math.min(multiActive > d ? multiActive - 1 : multiActive, multiLists.length - 1));
      return;
    }
    var tab = t.closest ? t.closest('.ch-list-tab') : null;
    if (tab) { saveActiveList(); showList(parseInt(tab.getAttribute('data-list'), 10)); }
  }

  function onRunClick() {
    if (multiOn) runMultiLists(); else checkSnapshots();
  }

  async function runMultiLists() {
    if (multiState && multiState.running) return;
    saveActiveList();
    var lists = [];
    multiLists.forEach(function(txt, i) {
      var lines = linesOf(txt);
      if (lines.length) lists.push({ listNo: i + 1, text: lines.join('\n'), count: lines.length });
    });
    if (!lists.length) { showError('Add fleet numbers to at least one list.'); return; }
    multiStopRequested = false;
    multiState = { running: true, lists: lists, current: 0, totalLists: lists[lists.length - 1].listNo };
    for (var i = 0; i < lists.length; i++) {
      if (multiStopRequested) break;
      multiState.current = i;
      updateMultiLine();
      await checkSnapshots({ isBatch: true, first: i === 0, text: lists[i].text, listNo: lists[i].listNo });
      lists[i].finished = true;
      lists[i].failed = !allRows.some(function(r) { return r.listNo === lists[i].listNo; });
    }
    multiState.running = false;
    multiState.stopped = multiStopRequested;
    batchRows = null;
    updateMultiLine();
  }

  // The line above the table: "List 2 of 4 · 37 of 200 completed", plus a chip per list.
  function updateMultiLine() {
    var el = document.getElementById('ch-multiLine');
    if (!el) return;
    if (!multiState) { el.classList.add('ch-hidden'); el.innerHTML = ''; return; }
    var s = multiState, title;
    var chips = s.lists.map(function(l, i) {
      var rows = allRows.filter(function(r) { return r.listNo === l.listNo; });
      var total = rows.length || l.count;
      var done = rows.filter(function(r) { return r.chDone; }).length;
      l.done = done; l.total = total;
      if (l.failed) return '<span class="ml-chip">List ' + l.listNo + ' · not loaded</span>';
      if (l.finished) return done >= total
        ? '<span class="ml-chip is-done">List ' + l.listNo + ' ✓ ' + done + ' of ' + total + '</span>'
        : '<span class="ml-chip">List ' + l.listNo + ' · stopped at ' + done + ' of ' + total + '</span>';
      if (s.running && i === s.current) return '<span class="ml-chip is-run">List ' + l.listNo + ' · ' + done + ' of ' + total + '</span>';
      return '<span class="ml-chip">List ' + l.listNo + (i > s.current || s.running ? ' · waiting' : ' · not run') + '</span>';
    });
    var cur = s.lists[s.current];
    if (s.running && sdProgress) title = 'List ' + cur.listNo + ' of ' + s.totalLists + ' · SD cards ' + sdProgress.done + ' of ' + sdProgress.total;
    else if (s.running) title = 'List ' + cur.listNo + ' of ' + s.totalLists + ' · ' + cur.done + ' of ' + cur.total + ' completed';
    else if (s.stopped) title = 'Stopped after List ' + cur.listNo;
    else {
      var failedN = s.lists.filter(function(l) { return l.failed; }).length;
      title = failedN ? 'Finished · ' + failedN + ' list' + (failedN === 1 ? '' : 's') + ' not loaded' : 'All lists completed';
    }
    el.innerHTML = '<span class="ml-title">' + esc(title) + '</span>' + chips.join('');
    el.classList.remove('ch-hidden');
  }

   // batch (multi run only): { isBatch, first, text, listNo }. A normal run passes nothing.
  async function checkSnapshots(batch) {
    batch = (batch && batch.isBatch) ? batch : null;
    var input = batch ? batch.text : document.getElementById('ch-fleetFilter').value.trim();
    if (!input) { showError('Enter at least one fleet number, vehicle name, registration, or vehicle ID.'); return; }

    var _company = Auth.getSelectedCompany();
    selectedCompanyId = _company ? _company.id : '';
    if (!selectedCompanyId) { showError('No company selected.'); return; }

    histStopRequested = true;
    showHistSearchBar(false);
    clearError();
    if (!batch) { multiState = null; multiStopRequested = false; }
    var keptRows = (batch && !batch.first) ? allRows : [];
    var keptIds = {};
    keptRows.forEach(function(r) { if (!r.notFound) keptIds[String(r.vehicleId).trim()] = true; });
    batchRows = null;
    allRows = keptRows;
    lastSnapshotSaveMessage   = '';
    if (!keptRows.length) lastSnapshotSmallFileByKey = {};
    renderTable();

    var fleetLines = input.split(/\r?\n/).map(function(s){ return s.trim(); }).filter(Boolean);

    var btn = document.getElementById('ch-btnLoad');
    var origBtnHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="bulk-ico--spin" style="margin-right:0.375rem;" aria-hidden="true"></span>Checking…';

    var deviceIdByVehicleId = {};

    try {
      setStatus('Loading vehicle list…');
      var vehData  = await telematicsApiGet('/vehicles');
      var vehicles = normalizeVehiclesResponse(vehData);

      var ids = [], rowEntries = [], ambiguousAlerts = [];
      for (var i = 0; i < fleetLines.length; i++) {
        var line = fleetLines[i];
        var resolved = resolveLineToVehicle(line, vehicles);
                if (resolved.id && keptIds[String(resolved.id).trim()]) continue;   // already in the table from an earlier list
        if (resolved.id) {
          if (ids.indexOf(resolved.id) === -1) ids.push(resolved.id);
          rowEntries.push({ kind: 'matched', id: String(resolved.id).trim() });
        } else if (resolved.ambiguousLabels && resolved.ambiguousLabels.length) {
          ambiguousAlerts.push(line + ' — multiple vehicles: ' + resolved.ambiguousLabels.join('; '));
          rowEntries.push({ kind: 'notfound', line: line, detail: 'Multiple matches — use registration or vehicle ID: ' + resolved.ambiguousLabels.join('; ') });
        } else {
          rowEntries.push({ kind: 'notfound', line: line });
        }
      }

      var rawEvents = [], fleetCameraEventsRaw = 0;
      if (ids.length > 0) {
        setStatus('Loading fleet camera events…');
        var evData = await telematicsApiGet('/events', { types: 'camera' });
        var fleetEvents = normalizeEventsResponse(evData);
        fleetCameraEventsRaw = fleetEvents.length;
        rawEvents = filterCameraEventsToScopedVehicles(fleetEvents, ids);
      }

      for (var di2 = 0; di2 < rawEvents.length; di2++) {
        var re = rawEvents[di2];
        var rvid = getVehicleIdFromEvent(re);
        if (!rvid || deviceIdByVehicleId[rvid]) continue;
        var rdid = re.deviceId || (re.device && re.device.id) || (re.attributes && re.attributes.deviceId);
        if (rdid) deviceIdByVehicleId[rvid] = String(rdid);
      }

      var built = buildAllSnapshotRows(vehicles, rawEvents, ids);
            var newRows = mergeSnapshotRowsWithNotFound(built.rows, rowEntries);
      if (batch) newRows.forEach(function(r) {
        r.listNo = batch.listNo;
        if (r.notFound) r.vehicleId = 'L' + batch.listNo + r.vehicleId;   // keep not-found ids unique across lists
      });
      batchRows = keptRows.length ? newRows : null;
      allRows = keptRows.concat(newRows);
      lastLoadStats = {
        totalEvents:             rawEvents.length,
        fleetCameraEventsRaw:    fleetCameraEventsRaw,
        eventsWithContext:       built.stats.eventsWithContext,
        snapshotEventsWithMedia: built.stats.snapshotEventsWithMedia
      };

      setStatus('Building results…');
      renderTable();

      Auth.apiCall('log_activity', { type: 'snapshot_check', page: '/camera-history/', details: 'Camera history check — ' + fleetLines.length + ' vehicle(s)' }).catch(function(){});

            // A multi run carries on unattended, so these pop-ups are skipped there
      // (not-found and multiple-match lines still show in the table).
      if (!batch) {
        if (rawEvents.length === 0 && fleetCameraEventsRaw > 0) {
          alert('The API returned ' + fleetCameraEventsRaw + ' camera event(s), but none matched the selected vehicles. Nothing to show.');
        }
        if (ambiguousAlerts.length) {
          alert('Some lines matched multiple vehicles — fix these, then reload:\n\n' + ambiguousAlerts.join('\n'));
        }
        if (built.stats.snapshotEventsWithMedia === 0 && built.stats.eventsWithContext > 0) {
          alert('No snapshot images were found in SNAPSHOT context for these vehicles.\n\nCamera events: ' + lastLoadStats.totalEvents + '\nSNAPSHOT with parseable context: ' + built.stats.eventsWithContext);
        }
      }

            if (allRows.length > 0) {
        btn.disabled = true;
        setPersistCheckBusy(true);
        try {
          await persistSnapshotsAfterLoad();
        } finally {
          setPersistCheckBusy(false);
        }
      }

    } catch(e) {
      clearStatus();
      showError('Error: ' + e.message);
    } finally {
      clearStatus();
      btn.disabled = false;
      btn.innerHTML = origBtnHTML;
    }

    if (allRows.length > 0) {
      try { await historicalFallback(deviceIdByVehicleId); } catch(e) { showHistSearchBar(false); }
    }
  }

  // ── Fullscreen viewer ─────────────────────────────────────────────────────────

  function buildGalleryForVehicleId(vehicleId) {
    var row = null;
    for (var i = 0; i < allRows.length; i++) { if (vehicleIdsMatch(allRows[i].vehicleId, vehicleId)) { row = allRows[i]; break; } }
    if (!row || row.notFound) return [];
    var list = [];
    for (var si = 0; si < SOURCES.length; si++) {
      var src = SOURCES[si], item = row.cols[src];
      var isFailed = item && item.url && colSnapshotFileTooSmall(row.vehicleId, src, item.timeAt);
      var hc = row.histCells && row.histCells[src];
      if (hc && (!item || !item.url || isFailed)) {
        list.push({ url: hc.url, caption: row.vehicleName + ' · ' + sourceCaptionTitle(src) + ' · ' + formatSnapTime(hc.timeAt) + ' [HISTORICAL]', timeMs: eventTimeMs(hc.timeAt), historical: true });
      } else if (item && item.url && !isFailed) {
        list.push({ url: item.url, caption: row.vehicleName + ' · ' + sourceCaptionTitle(src) + ' · ' + formatSnapTime(item.timeAt), timeMs: eventTimeMs(item.timeAt) });
      }
    }
    var arr = row.unsure || [];
    for (var j = 0; j < arr.length; j++) {
      item = arr[j];
      list.push({ url: item.url, caption: row.vehicleName + ' · Unsure · ' + (item.hint || '') + ' · ' + formatSnapTime(item.timeAt), timeMs: eventTimeMs(item.timeAt) });
    }
    return list.map(function(x){ return { url: x.url, caption: x.caption, historical: !!x.historical }; });
  }

  function updateFsNav() {
    var prev = document.getElementById('ch-fsPrev'), next = document.getElementById('ch-fsNext');
    if (!prev || !next) return;
    var one = fsGallery.length <= 1;
    prev.disabled = one; next.disabled = one;
  }

  function showFsAt(i) {
    if (!fsGallery.length) return;
    var n = fsGallery.length;
    fsIndex = ((i % n) + n) % n;
    var item = fsGallery[fsIndex];
    document.getElementById('ch-fsImage').src = item.url;
    var capEl = document.getElementById('ch-fsCaption');
    capEl.textContent = (item.caption || '') + '  ·  ' + (fsIndex + 1) + ' / ' + n;
    var overlay = document.getElementById('ch-fsOverlay');
    if (item.historical) { overlay.classList.add('is-historical'); capEl.classList.add('is-historical'); }
    else                 { overlay.classList.remove('is-historical'); capEl.classList.remove('is-historical'); }
    updateFsNav();
  }

  function openFsFromImg(img) {
    var url     = img.getAttribute('data-full');
    var caption = img.getAttribute('data-caption') || '';
    var vid     = img.getAttribute('data-vehicle-id') || '';
    fsGallery = buildGalleryForVehicleId(vid);
    fsIndex   = 0;
    if (fsGallery.length === 0) { fsGallery = [{ url: url, caption: caption }]; }
    else { for (var j = 0; j < fsGallery.length; j++) { if (fsGallery[j].url === url) { fsIndex = j; break; } } }
    document.getElementById('ch-fsOverlay').classList.add('is-open');
    document.body.style.overflow = 'hidden';
    showFsAt(fsIndex);
  }

  function closeFs() {
    var overlay = document.getElementById('ch-fsOverlay');
    overlay.classList.remove('is-open');
    document.getElementById('ch-fsImage').removeAttribute('src');
    fsGallery = []; fsIndex = 0; updateFsNav();
    document.body.style.overflow = '';
  }

  // ── 5) Event wiring + onShow registration ────────────────────────────────────

  function wireEvents() {
    TGE.on('ch-btnLoad', 'click', onRunClick);
    if (TGE.wireOutputPill) TGE.wireOutputPill('ch', chExportItems());
    TGE.on('ch-fleetFilter', 'keydown', function(e) { if (e.ctrlKey && e.key === 'Enter') onRunClick(); });
    TGE.on('ch-fleetFilter', 'input', function() { if (multiOn) { saveActiveList(); renderListTabs(); } });
    TGE.on('ch-btnMulti', 'click', toggleMulti);
    TGE.on('ch-listTabs', 'click', onListTabsClick);
    TGE.on('ch-btnStopHist', 'click', function() { histStopRequested = true; multiStopRequested = true; showHistSearchBar(false); });
    TGE.on('ch-btnSelAll', 'click', function() { setAllSelected(true); });
    TGE.on('ch-btnSelNone', 'click', function() { setAllSelected(false); });
    TGE.on('ch-snapTableBody', 'click', onTableClick);

    TGE.on('ch-fsClose', 'click', closeFs);
    TGE.on('ch-fsPrev', 'click', function(e) { e.stopPropagation(); if (fsGallery.length > 1) showFsAt(fsIndex - 1); });
    TGE.on('ch-fsNext', 'click', function(e) { e.stopPropagation(); if (fsGallery.length > 1) showFsAt(fsIndex + 1); });
    TGE.on('ch-fsOverlay', 'click', function(e) { if (e.target.id === 'ch-fsOverlay') closeFs(); });

    document.addEventListener('keydown', function(e) {
      var overlay = document.getElementById('ch-fsOverlay');
      if (!overlay || !overlay.classList.contains('is-open')) return;
      if (e.key === 'Escape') { closeFs(); return; }
      if (fsGallery.length <= 1) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); showFsAt(fsIndex - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); showFsAt(fsIndex + 1); }
    });
  }

  // Render once when the view is first shown, and on each show if not yet built.
  var built = false;
  TGE.onShow['camera-history'] = function () {
    if (!built) { render(); built = true; }
  };

})();
