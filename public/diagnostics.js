// TGE Asset Snapshot — Snapshot Diagnostics
// public/diagnostics.js

(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────
  var state = {
    running:     false,
    events:      [],
    attachRows:  [],
    callLog:     [],
    callSeq:     0,
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('diag-styles')) return;
    var s = document.createElement('style');
    s.id = 'diag-styles';
    s.textContent = [
      // Layout
      '.diag-wrap{display:grid;grid-template-columns:300px 1fr;gap:0;min-height:calc(100vh - 52px);margin:-20px;overflow:hidden;}',
      '.diag-sidebar{background:var(--surface);border-right:1px solid var(--line);padding:16px;display:flex;flex-direction:column;gap:16px;overflow-y:auto;max-height:calc(100vh - 52px);position:sticky;top:0;}',
      '.diag-main{padding:20px;overflow-y:auto;display:flex;flex-direction:column;gap:16px;}',

      // Section label
      '.diag-label{font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-bottom:8px;display:flex;align-items:center;gap:8px;}',
      '.diag-label::after{content:"";flex:1;height:1px;background:var(--line);}',

      // Tabs
      '.diag-tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);margin-bottom:16px;}',
      '.diag-tab{padding:8px 14px;font-size:12px;font-weight:500;cursor:pointer;border:none;background:none;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px;transition:all 140ms;}',
      '.diag-tab.active{color:var(--green-600);border-bottom-color:var(--green-600);}',

      // Status bar
      '.diag-status{padding:9px 12px;border-radius:8px;font-size:12px;display:flex;align-items:center;gap:8px;}',
      '.diag-status.ok{background:var(--green-100);border:1px solid rgba(0,166,81,0.2);color:var(--green-700);}',
      '.diag-status.err{background:var(--danger-bg);border:1px solid rgba(192,57,43,0.2);color:var(--danger);}',
      '.diag-status.loading{background:rgba(180,83,9,0.06);border:1px solid rgba(180,83,9,0.2);color:var(--warning);}',

      // Spinner
      '.diag-spin{width:12px;height:12px;border:2px solid rgba(180,83,9,0.3);border-top-color:var(--warning);border-radius:50%;animation:diag-spin 0.7s linear infinite;flex-shrink:0;}',
      '@keyframes diag-spin{to{transform:rotate(360deg);}}',

      // Progress
      '.diag-prog-track{background:var(--line);border-radius:999px;height:4px;overflow:hidden;margin-top:4px;}',
      '.diag-prog-fill{height:100%;background:var(--green-600);border-radius:999px;transition:width 0.3s;}',
      '.diag-prog-label{font-size:11px;color:var(--muted);}',

      // Call cards (request inspector)
      '.diag-call{background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-bottom:10px;}',
      '.diag-call-hdr{padding:9px 12px;display:flex;align-items:center;gap:8px;cursor:pointer;background:var(--surface-2);}',
      '.diag-call-hdr:hover{background:var(--surface-3);}',
      '.diag-call.collapsed .diag-call-body{display:none;}',
      '.diag-call.collapsed .diag-chev{transform:rotate(-90deg);}',
      '.diag-chev{color:var(--muted-2);transition:transform 0.2s;font-size:14px;flex-shrink:0;}',
      '.diag-method{font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;font-family:monospace;}',
      '.diag-method-post{background:rgba(180,83,9,0.1);color:var(--warning);}',
      '.diag-method-get{background:var(--green-100);color:var(--green-700);}',
      '.diag-call-url{font-family:monospace;font-size:11px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink-2);}',
      '.diag-call-ms{font-size:10px;color:var(--muted-2);flex-shrink:0;}',
      '.diag-call-body{padding:12px;display:flex;flex-direction:column;gap:10px;}',
      '.diag-call-section{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);margin-bottom:5px;}',
      '.diag-raw{background:var(--surface-3);border:1px solid var(--line);border-radius:7px;padding:9px 11px;font-family:monospace;font-size:10px;color:var(--ink-2);white-space:pre-wrap;word-break:break-all;max-height:240px;overflow-y:auto;}',

      // Badges
      '.diag-badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700;}',
      '.diag-badge-ok{background:var(--green-100);color:var(--green-700);}',
      '.diag-badge-err{background:var(--danger-bg);color:var(--danger);}',
      '.diag-badge-pending{background:rgba(180,83,9,0.1);color:var(--warning);}',

      // Event cards
      '.diag-ev{background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden;}',
      '.diag-ev-hdr{padding:9px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;background:var(--surface-2);}',
      '.diag-ev-hdr:hover{background:var(--surface-3);}',
      '.diag-ev.collapsed .diag-ev-body{display:none;}',
      '.diag-ev.collapsed .diag-ev-chev{transform:rotate(-90deg);}',
      '.diag-ev-chev{color:var(--muted-2);transition:transform 0.2s;font-size:14px;}',
      '.diag-ev-time{font-size:12px;font-weight:700;flex:1;color:var(--ink);}',
      '.diag-ev-id{font-family:monospace;font-size:10px;color:var(--muted);}',
      '.diag-ev-body{padding:14px;}',

      // Image grid
      '.diag-img-grid{display:grid;gap:10px;}',
      '.diag-img-cell{display:flex;flex-direction:column;gap:4px;}',
      '.diag-img-wrap{aspect-ratio:16/9;border-radius:7px;overflow:hidden;background:var(--surface-2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;position:relative;cursor:zoom-in;}',
      '.diag-img-wrap img{width:100%;height:100%;object-fit:cover;display:block;}',
      '.diag-img-wrap.loading{border-style:dashed;}',
      '.diag-img-wrap.err{border-color:rgba(192,57,43,0.4);}',
      '.diag-img-spin{width:16px;height:16px;border:2px solid var(--line);border-top-color:var(--green-600);border-radius:50%;animation:diag-spin 0.7s linear infinite;}',
      '.diag-img-label{font-size:10px;font-weight:600;color:var(--ink-2);text-align:center;}',
      '.diag-img-id{font-size:9px;color:var(--muted);text-align:center;font-family:monospace;}',
      '.diag-img-url{font-size:9px;color:var(--muted-2);font-family:monospace;word-break:break-all;margin-top:2px;}',

      // Attachment table
      '.diag-att-table{width:100%;border-collapse:collapse;font-size:11px;}',
      '.diag-att-table th{text-align:left;padding:5px 8px;color:var(--muted);font-weight:700;border-bottom:1px solid var(--line);font-size:10px;text-transform:uppercase;letter-spacing:0.05em;}',
      '.diag-att-table td{padding:6px 8px;border-bottom:1px solid var(--line-2);vertical-align:top;}',
      '.diag-att-table tr:last-child td{border-bottom:none;}',
      '.diag-att-table td.mono{font-family:monospace;font-size:10px;color:var(--muted);}',
      '.diag-att-table td.url{font-family:monospace;font-size:9px;color:var(--green-600);word-break:break-all;max-width:260px;}',
      '.diag-att-table td.url.pending{color:var(--muted-2);}',
      '.diag-att-table td.url.err{color:var(--danger);}',

      // Log
      '.diag-log{max-height:180px;overflow-y:auto;}',
      '.diag-log-row{display:flex;gap:8px;padding:3px 0;border-bottom:1px solid var(--line-2);font-size:10px;font-family:monospace;}',
      '.diag-log-row:last-child{border-bottom:none;}',
      '.diag-log-t{color:var(--muted-2);flex-shrink:0;}',
      '.diag-log-m{color:var(--muted);}',
      '.diag-log-m.ok{color:var(--green-600);}',
      '.diag-log-m.err{color:var(--danger);}',
      '.diag-log-m.warn{color:var(--warning);}',

      // Empty
      '.diag-empty{text-align:center;padding:48px 20px;color:var(--muted-2);}',
      '.diag-empty-icon{font-size:32px;margin-bottom:10px;}',

      // Lightbox
      '.diag-lb{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;align-items:center;justify-content:center;cursor:zoom-out;}',
      '.diag-lb.open{display:flex;}',
      '.diag-lb img{max-width:92vw;max-height:92vh;object-fit:contain;border-radius:8px;cursor:default;}',
      '.diag-lb-close{position:fixed;top:16px;right:16px;background:rgba(255,255,255,0.1);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── Position labels ───────────────────────────────────────────────────────
  var POS_LABEL = {
    FRONT:'Road (Front)', ROAD_FACING:'Road (Front)',
    DRIVER:'Driver', DRIVER_FACING:'Driver',
    LEFT_PASSENGER:'Left / TVI1', LEFT:'Left / TVI1',
    RIGHT_DRIVER:'Right / TVI2', RIGHT:'Right / TVI2',
    UVC:'UVC',
  };
  function posLabel(p) { return POS_LABEL[String(p||'').toUpperCase()] || p || '?'; }

  // ── Render shell ──────────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-diagnostics');
    if (!view) return;
    injectStyles();

    view.innerHTML = [
      '<div class="diag-wrap">',

        // ── Sidebar ──
        '<div class="diag-sidebar">',

          '<div>',
            '<div class="diag-label">Vehicle</div>',
            '<div class="field" style="margin-bottom:8px;">',
              '<label>Vehicle ID</label>',
              '<input type="text" id="diag-vehicle-id" placeholder="e.g. 381634" autocomplete="off">',
            '</div>',
            '<div class="field" style="margin-bottom:0;">',
              '<label>Device ID</label>',
              '<input type="text" id="diag-device-id" placeholder="e.g. 518241" autocomplete="off">',
            '</div>',
          '</div>',

          '<div>',
            '<div class="diag-label">Date Range (AEST)</div>',
            '<div class="field" style="margin-bottom:8px;">',
              '<label>From</label>',
              '<input type="date" id="diag-from">',
            '</div>',
            '<div class="field" style="margin-bottom:8px;">',
              '<label>To</label>',
              '<input type="date" id="diag-to">',
            '</div>',
            '<div class="field" style="margin-bottom:0;">',
              '<label>Max events</label>',
              '<select id="diag-limit">',
                '<option value="5">5 — quick test</option>',
                '<option value="10" selected>10</option>',
                '<option value="25">25</option>',
                '<option value="50">50</option>',
                '<option value="100">100</option>',
              '</select>',
            '</div>',
          '</div>',

          '<div style="display:flex;flex-direction:column;gap:8px;">',
            '<button class="btn btn-primary" id="diag-run-btn" style="width:100%;" type="button">▶ Run test</button>',
            '<button class="btn" id="diag-clear-btn" style="width:100%;font-size:12px;" type="button">Clear</button>',
          '</div>',

          '<div id="diag-status" class="diag-status" style="display:none;"></div>',

          '<div id="diag-prog-wrap" style="display:none;">',
            '<div class="diag-prog-label" id="diag-prog-label"></div>',
            '<div class="diag-prog-track"><div class="diag-prog-fill" id="diag-prog-fill" style="width:0%"></div></div>',
          '</div>',

          '<div>',
            '<div class="diag-label">Activity log</div>',
            '<div class="diag-log" id="diag-log"></div>',
          '</div>',

        '</div>',

        // ── Main ──
        '<div class="diag-main">',

          '<div class="diag-tabs">',
            '<button class="diag-tab active" data-diag-view="images" type="button">Images</button>',
            '<button class="diag-tab" data-diag-view="requests" type="button">Request Inspector</button>',
            '<button class="diag-tab" data-diag-view="attachments" type="button">Attachment Detail</button>',
          '</div>',

          '<div id="diag-view-images">',
            '<div class="diag-empty" id="diag-empty">',
              '<div class="diag-empty-icon">📷</div>',
              '<p>Enter a vehicle ID, device ID and date range, then hit Run.</p>',
            '</div>',
            '<div id="diag-events-list" style="display:flex;flex-direction:column;gap:12px;"></div>',
          '</div>',

          '<div id="diag-view-requests" style="display:none;">',
            '<div class="diag-empty" id="diag-empty-requests">',
              '<div class="diag-empty-icon">🔍</div>',
              '<p>Run a test to see all API calls and responses.</p>',
            '</div>',
            '<div id="diag-calls-list"></div>',
          '</div>',

          '<div id="diag-view-attachments" style="display:none;">',
            '<div class="diag-empty" id="diag-empty-attachments">',
              '<div class="diag-empty-icon">🔗</div>',
              '<p>Run a test to see attachment resolution detail.</p>',
            '</div>',
            '<div id="diag-att-list" style="display:flex;flex-direction:column;gap:12px;"></div>',
          '</div>',

        '</div>',

      '</div>',

      // Lightbox
      '<div class="diag-lb" id="diag-lb">',
        '<button class="diag-lb-close" id="diag-lb-close">✕</button>',
        '<img id="diag-lb-img" src="" alt="">',
      '</div>',
    ].join('');

    wireEvents();
  }

  // ── Wire events ───────────────────────────────────────────────────────────
  function wireEvents() {
    TGE.on('diag-run-btn',   'click', runDiag);
    TGE.on('diag-clear-btn', 'click', clearAll);
    TGE.on('diag-lb-close',  'click', closeLb);
    TGE.on('diag-lb',        'click', function(e) { if (e.target.id === 'diag-lb') closeLb(); });

    var tabs = document.querySelectorAll('.diag-tab');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() { switchView(tab.getAttribute('data-diag-view')); });
    });

    // Default dates
    var today = new Date();
    var from  = new Date(today); from.setDate(today.getDate() - 7);
    var fmt   = function(d) { return d.toISOString().slice(0,10); };
    var fromEl = TGE.el('diag-from');
    var toEl   = TGE.el('diag-to');
    if (fromEl) fromEl.value = fmt(from);
    if (toEl)   toEl.value   = fmt(today);

    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeLb(); });
  }

  // ── View switching ────────────────────────────────────────────────────────
  function switchView(v) {
    ['images','requests','attachments'].forEach(function(name) {
      var el  = TGE.el('diag-view-' + name);
      var tab = document.querySelector('[data-diag-view="' + name + '"]');
      if (el)  el.style.display  = name === v ? '' : 'none';
      if (tab) tab.classList.toggle('active', name === v);
    });
  }

  // ── Logging ───────────────────────────────────────────────────────────────
  function diagLog(msg, type) {
    var now = new Date().toLocaleTimeString('en-AU', { hour12:false });
    var row = document.createElement('div');
    row.className = 'diag-log-row';
    row.innerHTML = '<span class="diag-log-t">' + now + '</span>'
      + '<span class="diag-log-m ' + (type||'') + '">' + esc(msg) + '</span>';
    var log = TGE.el('diag-log');
    if (log) { log.appendChild(row); log.scrollTop = log.scrollHeight; }
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  // ── Status ────────────────────────────────────────────────────────────────
  function setStatus(msg, type) {
    var el = TGE.el('diag-status');
    if (!el) return;
    el.className = 'diag-status ' + (type || 'loading');
    el.innerHTML = (!type || type === 'loading' ? '<div class="diag-spin"></div>' : '') + '<span>' + esc(msg) + '</span>';
    el.style.display = '';
  }
  function clearStatus() { var el = TGE.el('diag-status'); if (el) el.style.display = 'none'; }

  function setProgress(done, total) {
    var wrap = TGE.el('diag-prog-wrap');
    if (!total) { if (wrap) wrap.style.display = 'none'; return; }
    if (wrap) wrap.style.display = '';
    var fill  = TGE.el('diag-prog-fill');
    var label = TGE.el('diag-prog-label');
    var pct   = Math.round(done / total * 100);
    if (fill)  fill.style.width = pct + '%';
    if (label) label.textContent = 'Images: ' + done + ' / ' + total;
  }
  function hideProgress() { var el = TGE.el('diag-prog-wrap'); if (el) el.style.display = 'none'; }

  // ── API call wrapper — records everything ─────────────────────────────────
  async function diagCall(label, method, path, body) {
    var id     = ++state.callSeq;
    var url    = path; // relative — same origin
    var start  = Date.now();
    var rec    = { id:id, label:label, method:method, url:url, reqBody:body||null, status:null, resBody:null, ms:null, error:null };
    state.callLog.push(rec);

    // Add pending card to request inspector immediately
    var callsEl = TGE.el('diag-calls-list');
    var emptyReq = TGE.el('diag-empty-requests');
    if (emptyReq) emptyReq.style.display = 'none';
    var card = buildCallCard(rec);
    if (callsEl) callsEl.appendChild(card);

    try {
      var result = await TGE.api(method, path, body || undefined);
      rec.status  = result.status;
      rec.resBody = result.data;
      rec.ms      = Date.now() - start;
      updateCallCard(id, rec);
      if (!result.ok) throw new Error((result.data && result.data.error) || 'HTTP ' + result.status);
      return result.data;
    } catch(e) {
      rec.status = rec.status || 0;
      rec.ms     = Date.now() - start;
      rec.error  = e.message;
      updateCallCard(id, rec);
      throw e;
    }
  }

  // ── Call cards ────────────────────────────────────────────────────────────
  function buildCallCard(rec) {
    var card = document.createElement('div');
    card.className = 'diag-call collapsed';
    card.id = 'diag-call-' + rec.id;
    card.innerHTML = callCardInner(rec);
    card.querySelector('.diag-call-hdr').onclick = function() { card.classList.toggle('collapsed'); };
    return card;
  }

  function updateCallCard(id, rec) {
    var card = TGE.el('diag-call-' + id);
    if (!card) return;
    var wasCollapsed = card.classList.contains('collapsed');
    card.innerHTML = callCardInner(rec);
    if (wasCollapsed) card.classList.add('collapsed');
    card.querySelector('.diag-call-hdr').onclick = function() { card.classList.toggle('collapsed'); };
  }

  function callCardInner(rec) {
    var mCls    = rec.method === 'POST' ? 'diag-method-post' : 'diag-method-get';
    var sBadge  = rec.status === null
      ? '<span class="diag-badge diag-badge-pending">pending</span>'
      : (rec.status >= 200 && rec.status < 300)
        ? '<span class="diag-badge diag-badge-ok">HTTP ' + rec.status + '</span>'
        : '<span class="diag-badge diag-badge-err">HTTP ' + (rec.status || 'ERR') + '</span>';
    var msHtml  = rec.ms !== null ? '<span class="diag-call-ms">' + rec.ms + 'ms</span>' : '';
    var shortUrl = rec.url.replace('/api/', '/api/');

    return '<div class="diag-call-hdr">'
      + '<span class="diag-method ' + mCls + '">' + rec.method + '</span>'
      + '<span class="diag-call-url" title="' + esc(rec.url) + '">' + esc(rec.label + ' — ' + shortUrl) + '</span>'
      + sBadge + msHtml
      + '<span class="diag-chev">›</span>'
      + '</div>'
      + '<div class="diag-call-body">'
      + (rec.reqBody ? '<div><div class="diag-call-section">Request body</div><div class="diag-raw">' + esc(JSON.stringify(rec.reqBody, null, 2)) + '</div></div>' : '')
      + '<div><div class="diag-call-section">Response' + (rec.error ? ' — ' + esc(rec.error) : '') + '</div>'
      + '<div class="diag-raw">' + esc(rec.resBody ? JSON.stringify(rec.resBody, null, 2) : (rec.error || 'pending…')) + '</div></div>'
      + '</div>';
  }

  // ── Main run ──────────────────────────────────────────────────────────────
  async function runDiag() {
    if (state.running) return;

    var vehicleId = (TGE.el('diag-vehicle-id') || {}).value || '';
    var deviceId  = (TGE.el('diag-device-id')  || {}).value || '';
    var fromDate  = (TGE.el('diag-from')        || {}).value || '';
    var toDate    = (TGE.el('diag-to')          || {}).value || '';
    var limit     = parseInt((TGE.el('diag-limit') || {}).value || '10');

    vehicleId = vehicleId.trim();
    deviceId  = deviceId.trim();

    if (!vehicleId || !deviceId) { setStatus('Enter vehicle ID and device ID.', 'err'); return; }
    if (!fromDate || !toDate)    { setStatus('Select a date range.', 'err'); return; }

    clearAll();
    state.running = true;
    document.getElementById('diag-run-btn').disabled = true;

    var fromISO = fromDate + 'T00:00:00+10:00';
    var toISO   = toDate   + 'T23:59:59+10:00';

    try {
      // ── Step 1: snapshot events ──────────────────────────────────────────
      setStatus('Step 1 — fetching snapshot events…');
      diagLog('POST /api/historical-snapshots', 'warn');

      var evData = await diagCall(
        'Step 1: Snapshot events',
        'POST',
        '/api/historical-snapshots',
        { vehicleId: vehicleId, deviceId: deviceId, from: fromISO, to: toISO, limit: limit }
      );

      var events = evData.events || evData || [];
      if (!Array.isArray(events)) events = [];
      state.events = events;

      diagLog('Got ' + events.length + ' event(s)' + (evData.totalCount ? ' — totalCount=' + evData.totalCount : ''), 'ok');

      if (!events.length) {
        setStatus('No snapshot events found. Check vehicle/device ID and date range.', 'err');
        return;
      }

      var totalAtts = 0;
      events.forEach(function(ev) { totalAtts += (ev.attachments || []).length; });
      diagLog('Total attachments to resolve: ' + totalAtts, 'warn');
      setProgress(0, totalAtts);

      var empty = TGE.el('diag-empty');
      if (empty) empty.style.display = 'none';

      // ── Step 2: resolve attachments per event ────────────────────────────
      var doneCount = 0;

      for (var ei = 0; ei < events.length; ei++) {
        var ev  = events[ei];
        var atts = ev.attachments || [];

        setStatus('Event ' + (ei+1) + '/' + events.length + ' — resolving ' + atts.length + ' image(s)…');

        // Build image event card shell
        var evCard = buildEventShell(ev);
        var evList = TGE.el('diag-events-list');
        if (evList) evList.appendChild(evCard);

        // Build attachment detail card shell
        var attCard = buildAttDetailShell(ev);
        var attEmpty = TGE.el('diag-empty-attachments');
        if (attEmpty) attEmpty.style.display = 'none';
        var attList = TGE.el('diag-att-list');
        if (attList) attList.appendChild(attCard);

        // Resolve all attachments for this event in parallel
        var imgGrid = evCard.querySelector('.diag-img-grid');
        var promises = atts.map(function(att) {
          return resolveOneAttachment(ev, att, imgGrid, attCard);
        });
        var results = await Promise.allSettled(promises);
        results.forEach(function() { doneCount++; setProgress(doneCount, totalAtts); });
      }

      clearStatus();
      setStatus('Done — ' + doneCount + ' image(s) processed across ' + events.length + ' event(s).', 'ok');
      diagLog('Complete: ' + doneCount + ' attachments processed.', 'ok');

    } catch(e) {
      setStatus(e.message, 'err');
      diagLog(e.message, 'err');
    } finally {
      state.running = false;
      hideProgress();
      var btn = TGE.el('diag-run-btn');
      if (btn) btn.disabled = false;
    }
  }

  // ── Resolve one attachment ────────────────────────────────────────────────
  async function resolveOneAttachment(ev, att, imgGrid, attCard) {
    var attachId = String(att.attachmentId);
    var timeAt   = att.timeAt || ev.timeAt || '';
    var d        = new Date(timeAt);
    var year     = d.getFullYear() || new Date().getFullYear();
    var month    = (d.getMonth() + 1) || 1;
    var position = att.cameraPosition || att.cameraPositionName || 'UNKNOWN';
    var start    = Date.now();

    var imgCell = imgGrid && imgGrid.querySelector('[data-att-id="' + attachId + '"]');
    var detRow  = attCard && attCard.querySelector('[data-det-id="' + attachId + '"]');

    var url = null;
    try {
      var res = await diagCall(
        'Attachment ' + attachId + ' (' + position + ')',
        'POST',
        '/api/historical-snapshots/attachments',
        { attachmentId: attachId, year: year, month: month }
      );

      url = res.attachmentLink || res.url || null;
      if (!url) throw new Error('No URL returned');

      // Update image cell
      if (imgCell) {
        var wrap = imgCell.querySelector('.diag-img-wrap');
        if (wrap) {
          wrap.className = 'diag-img-wrap';
          wrap.innerHTML = '<img src="/api/image-proxy?url=' + encodeURIComponent(url)
            + '" alt="' + esc(position)
            + '" onerror="this.parentElement.classList.add(\'err\');this.parentElement.innerHTML=\'<span style=\\\"font-size:11px;color:var(--muted);\\\">Failed to load</span>\';">';
          wrap.onclick = (function(u, p) {
            return function() { openLb(u, p); };
          })(url, posLabel(position));
        }
        var urlEl = imgCell.querySelector('.diag-img-url');
        if (urlEl) urlEl.textContent = url;
      }

      // Update detail row
      if (detRow) {
        var urlTd = detRow.querySelector('.url');
        var stTd  = detRow.querySelector('.st');
        var msTd  = detRow.querySelector('.ms');
        if (urlTd) { urlTd.className = 'url'; urlTd.textContent = url; }
        if (stTd)  stTd.innerHTML = '<span class="diag-badge diag-badge-ok">OK</span>';
        if (msTd)  msTd.textContent = (Date.now() - start) + 'ms';
      }

      diagLog('✓ ' + attachId + ' (' + position + ')', 'ok');

    } catch(e) {
      if (imgCell) {
        var wrap2 = imgCell.querySelector('.diag-img-wrap');
        if (wrap2) { wrap2.className = 'diag-img-wrap err'; wrap2.innerHTML = '<span style="font-size:11px;color:var(--danger);">✕ Failed</span>'; wrap2.onclick = null; }
        var urlEl2 = imgCell.querySelector('.diag-img-url');
        if (urlEl2) { urlEl2.textContent = e.message; urlEl2.style.color = 'var(--danger)'; }
      }
      if (detRow) {
        var urlTd2 = detRow.querySelector('.url');
        var stTd2  = detRow.querySelector('.st');
        var msTd2  = detRow.querySelector('.ms');
        if (urlTd2) { urlTd2.className = 'url err'; urlTd2.textContent = e.message; }
        if (stTd2)  stTd2.innerHTML = '<span class="diag-badge diag-badge-err">ERR</span>';
        if (msTd2)  msTd2.textContent = (Date.now() - start) + 'ms';
      }
      diagLog('✗ ' + attachId + ': ' + e.message, 'err');
    }

    state.attachRows.push({ eventId: ev.id, attachmentId: attachId, position: position, timeAt: timeAt, url: url });
  }

  // ── Event card shell ──────────────────────────────────────────────────────
  function buildEventShell(ev) {
    var atts    = ev.attachments || [];
    var timeAt  = (atts[0] && atts[0].timeAt) || ev.timeAt || '';
    var timeFmt = timeAt ? new Date(timeAt).toLocaleString('en-AU', {
      day:'2-digit', month:'short', year:'numeric',
      hour:'2-digit', minute:'2-digit', second:'2-digit'
    }) : '—';

    var card = document.createElement('div');
    card.className = 'diag-ev';

    var hdr = document.createElement('div');
    hdr.className = 'diag-ev-hdr';
    hdr.innerHTML = '<span class="diag-ev-time">' + esc(timeFmt) + '</span>'
      + '<span class="diag-ev-id">Event ' + esc(ev.id) + ' · device ' + esc(ev.deviceId) + '</span>'
      + '<span style="font-size:11px;color:var(--muted);margin-left:auto;">' + atts.length + ' camera' + (atts.length !== 1 ? 's' : '') + '</span>'
      + '<span class="diag-ev-chev">›</span>';
    hdr.onclick = function() { card.classList.toggle('collapsed'); };

    var body = document.createElement('div');
    body.className = 'diag-ev-body';

    var grid = document.createElement('div');
    grid.className = 'diag-img-grid';
    grid.style.gridTemplateColumns = 'repeat(' + Math.min(atts.length, 5) + ', minmax(0,1fr))';

    atts.forEach(function(att) {
      var pos = att.cameraPosition || att.cameraPositionName || '?';
      var cell = document.createElement('div');
      cell.className = 'diag-img-cell';
      cell.setAttribute('data-att-id', att.attachmentId);
      cell.innerHTML = '<div class="diag-img-wrap loading"><div class="diag-img-spin"></div></div>'
        + '<div class="diag-img-label">' + esc(posLabel(pos)) + '</div>'
        + '<div class="diag-img-id">' + esc(att.attachmentId) + '</div>'
        + '<div class="diag-img-url">resolving…</div>';
      grid.appendChild(cell);
    });

    body.appendChild(grid);
    card.appendChild(hdr);
    card.appendChild(body);
    return card;
  }

  // ── Attachment detail shell ───────────────────────────────────────────────
  function buildAttDetailShell(ev) {
    var atts   = ev.attachments || [];
    var timeAt = (atts[0] && atts[0].timeAt) || '';
    var timeFmt = timeAt ? new Date(timeAt).toLocaleString('en-AU', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';

    var wrap = document.createElement('div');
    wrap.className = 'diag-ev';

    var hdr = document.createElement('div');
    hdr.className = 'diag-ev-hdr';
    hdr.style.cursor = 'default';
    hdr.innerHTML = '<span class="diag-ev-time">' + esc(timeFmt) + '</span>'
      + '<span class="diag-ev-id">Event ' + esc(ev.id) + '</span>';

    var body = document.createElement('div');
    body.className = 'diag-ev-body';

    var table = document.createElement('table');
    table.className = 'diag-att-table';
    table.innerHTML = '<thead><tr><th>Position</th><th>Attachment ID</th><th>Year</th><th>Month</th><th>Status</th><th>Time</th><th>Resolved URL</th></tr></thead>';

    var tbody = document.createElement('tbody');
    atts.forEach(function(att) {
      var pos   = att.cameraPosition || '?';
      var tAt   = att.timeAt || '';
      var d     = new Date(tAt);
      var year  = d.getFullYear() || '?';
      var month = (d.getMonth() + 1) || '?';
      var tr    = document.createElement('tr');
      tr.setAttribute('data-det-id', att.attachmentId);
      tr.innerHTML = '<td>' + esc(posLabel(pos)) + '</td>'
        + '<td class="mono">' + esc(att.attachmentId) + '</td>'
        + '<td class="mono">' + esc(year) + '</td>'
        + '<td class="mono">' + esc(month) + '</td>'
        + '<td class="st"><span class="diag-badge diag-badge-pending">…</span></td>'
        + '<td class="ms mono">—</td>'
        + '<td class="url pending">resolving…</td>';
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    body.appendChild(table);
    wrap.appendChild(hdr);
    wrap.appendChild(body);
    return wrap;
  }

  // ── Lightbox ──────────────────────────────────────────────────────────────
  function openLb(url, caption) {
    var lb  = TGE.el('diag-lb');
    var img = TGE.el('diag-lb-img');
    if (!lb || !img) return;
    img.src = '/api/image-proxy?url=' + encodeURIComponent(url);
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeLb() {
    var lb  = TGE.el('diag-lb');
    var img = TGE.el('diag-lb-img');
    if (lb)  lb.classList.remove('open');
    if (img) img.src = '';
    document.body.style.overflow = '';
  }

  // ── Clear ─────────────────────────────────────────────────────────────────
  function clearAll() {
    state.events     = [];
    state.attachRows = [];
    state.callLog    = [];
    state.callSeq    = 0;
    state.running    = false;

    var ids = ['diag-events-list','diag-calls-list','diag-att-list','diag-log'];
    ids.forEach(function(id) { var el = TGE.el(id); if (el) el.innerHTML = ''; });

    ['diag-empty','diag-empty-requests','diag-empty-attachments'].forEach(function(id) {
      var el = TGE.el(id); if (el) el.style.display = '';
    });

    clearStatus();
    hideProgress();
    var btn = TGE.el('diag-run-btn');
    if (btn) btn.disabled = false;
  }

  // ── Register ──────────────────────────────────────────────────────────────
  var _orig = TGE.onAppReady;
  TGE.onAppReady = function () {
    if (typeof _orig === 'function') _orig();
    render();
  };

  TGE.onShow['diagnostics'] = function() {
    var el = TGE.el('diag-vehicle-id');
    if (el) el.focus();
  };

})();
