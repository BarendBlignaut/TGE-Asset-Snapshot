// TGE Asset Snapshot — Camera Footage Page
// public/screen/screen-camera-footage.js
//
// Requests TN360 video footage for a camera, the same way TN360's own
// "Request Video Footage" dialog does. Renders into #view-camera-footage.
// Backend: GET /api/camfootage/lookup and POST /api/camfootage/request
// (TN360_SNAPSHOT_KEY). All the camera's channels are requested; clips over
// 2 minutes go as back-to-back 2-minute requests (max 15 minutes).
//
// Delete this file + its script tag + its nav item + its view div to remove.

(function () {
  'use strict';

  var MAX_SECONDS  = 900;   // keep in step with CAMFOOTAGE_MAX_SECONDS
  var PART_SECONDS = 120;   // keep in step with CAMFOOTAGE_PART_SECONDS

  var state = { lookup: null, busy: false };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Date -> "YYYY-MM-DDTHH:MM:SS" in the browser's local time (datetime-local value).
  function toLocalValue(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function fmtLocal(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-AU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
    } catch (e) { return iso; }
  }

  function fmtLength(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m ? (m + ' min' + (s ? ' ' + s + ' s' : '')) : (s + ' s');
  }

  function tzName() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'; } catch (e) { return 'local time'; }
  }

  function setMessage(text, isError) {
    var el = TGE.el('cf-message');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', !!isError);
  }

  function makeField(label, id, type, attrs) {
    var wrap = document.createElement('div');
    wrap.className = 'field';
    var lab = document.createElement('label');
    lab.setAttribute('for', id);
    lab.textContent = label;
    var inp = document.createElement('input');
    inp.id = id;
    inp.type = type;
    Object.keys(attrs || {}).forEach(function (k) { inp.setAttribute(k, attrs[k]); });
    wrap.appendChild(lab);
    wrap.appendChild(inp);
    return wrap;
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-camera-footage');
    if (!view) return;
    var canRun = TGE.can('camera-footage', 'run');

    view.innerHTML = [
      '<div class="hero">',
        '<div class="hero-kicker">Camera</div>',
        '<div class="hero-title">Camera Footage</div>',
        '<div class="hero-sub">Request video footage from a camera in TN360. All the camera\'s channels are requested.</div>',
        '<p class="hero-message" id="cf-message"></p>',
      '</div>',

      '<div class="card">',
        '<div class="card-kicker">Step 1</div>',
        '<div class="card-title">Camera</div>',
        '<div id="cf-imei-slot" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;"></div>',
        '<div id="cf-camera" style="display:none;"></div>',
      '</div>',

      '<div class="card" id="cf-request-card" style="display:none;">',
        '<div class="card-kicker">Step 2</div>',
        '<div class="card-title">Footage window</div>',
        '<p style="font-size:12px;color:var(--muted);margin:0 0 12px;">Times are in ' + esc(tzName()) + '. Up to 15 minutes; anything over 2 minutes is sent to TN360 as back-to-back 2-minute requests.</p>',
        '<div id="cf-time-slot" class="data-grid data-grid-2"></div>',
        '<div id="cf-summary" style="font-size:13px;color:var(--ink);margin:4px 0 14px;"></div>',
        canRun
          ? '<button class="btn btn-primary" id="cf-request-btn" type="button">Request footage</button>'
          : '<p style="font-size:12px;color:var(--muted);margin:0;">You can look up cameras but not request footage (needs the Camera Footage run permission).</p>',
      '</div>',

      '<div class="card" id="cf-result-card" style="display:none;">',
        '<div class="card-kicker">Result</div>',
        '<div class="card-title" id="cf-result-title">TN360 response</div>',
        '<div id="cf-result"></div>',
      '</div>'
    ].join('');

    // IMEI field + lookup button (built with createElement)
    var imeiSlot = TGE.el('cf-imei-slot');
    var imeiField = makeField('Camera IMEI', 'cf-imei', 'text', { inputmode: 'numeric', placeholder: 'e.g. 862430069551451', autocomplete: 'off' });
    imeiField.style.flex = '1 1 260px';
    imeiField.style.marginBottom = '0';
    imeiSlot.appendChild(imeiField);
    var lookupBtn = document.createElement('button');
    lookupBtn.className = 'btn';
    lookupBtn.id = 'cf-lookup-btn';
    lookupBtn.type = 'button';
    lookupBtn.textContent = 'Look up';
    imeiSlot.appendChild(lookupBtn);

    // Start / end fields (seconds precision)
    var timeSlot = TGE.el('cf-time-slot');
    timeSlot.appendChild(makeField('Start', 'cf-start', 'datetime-local', { step: '1' }));
    timeSlot.appendChild(makeField('End', 'cf-end', 'datetime-local', { step: '1' }));

    TGE.on('cf-lookup-btn', 'click', doLookup);
    TGE.on('cf-imei', 'keydown', function (e) { if (e.key === 'Enter') doLookup(); });
    TGE.on('cf-start', 'change', updateSummary);
    TGE.on('cf-end', 'change', updateSummary);
    TGE.on('cf-start', 'input', updateSummary);
    TGE.on('cf-end', 'input', updateSummary);
    if (canRun) TGE.on('cf-request-btn', 'click', doRequest);
  }

  // ── Step 1: lookup ───────────────────────────────────────────────────────────
  async function doLookup() {
    if (state.busy) return;
    var imei = (TGE.el('cf-imei').value || '').replace(/\D/g, '');
    if (!imei) { setMessage('Enter the camera IMEI.', true); return; }
    state.busy = true;
    state.lookup = null;
    TGE.hide('cf-camera');
    TGE.hide('cf-request-card');
    TGE.hide('cf-result-card');
    setMessage('Looking up camera ' + imei + '...', false);
    try {
      var r = await TGE.api('GET', '/api/camfootage/lookup?imei=' + encodeURIComponent(imei));
      if (!r.ok) { setMessage((r.data && r.data.error) || 'Lookup failed.', true); return; }
      state.lookup = r.data;
      renderCamera(r.data);
      prefillTimes();
      TGE.show('cf-request-card');
      updateSummary();
      setMessage('Camera found. Set the footage window and request it.', false);
    } catch (e) {
      setMessage('Lookup failed: ' + e.message, true);
    } finally {
      state.busy = false;
    }
  }

  function renderCamera(d) {
    var st = d.status || {};
    var dvr = st.dataPlan && st.dataPlan.DVR_UPLOADED;
    // ROAD and DRIVER are the IQ camera's built-in lenses: always recorded,
    // never listed by the channels call.
    var cams = ['Road (built-in)', 'Driver-facing (built-in)'].concat((d.channels || []).map(function (c) {
      return (c.name || c.channel) + ' (' + c.channel + ')';
    }));
    var el = TGE.el('cf-camera');
    el.innerHTML = [
      '<div class="data-grid data-grid-4" style="margin-top:14px;">',
        '<div class="data-item"><span>Device ID</span><strong>' + esc(d.deviceId) + '</strong></div>',
        '<div class="data-item"><span>Vehicle ID</span><strong>' + esc(d.vehicleId || '—') + '</strong></div>',
        '<div class="data-item"><span>Camera</span><strong>' + esc(st.state || '—') + ' · ignition ' + esc(st.ignitionStatus || '—') + '</strong></div>',
        '<div class="data-item"><span>DVR uploads used</span><strong>' + (dvr ? esc(dvr.count) + ' / ' + esc(dvr.max) : '—') + '</strong></div>',
      '</div>',
      '<p style="font-size:12px;color:var(--muted);margin:10px 0 0;">Last update ' + esc(fmtLocal(st.lastUpdated)) + '. Cameras requested: ' + esc(cams.join(', ')) + '.</p>'
    ].join('');
    TGE.show('cf-camera');
  }

  function prefillTimes() {
    var s = TGE.el('cf-start'), e = TGE.el('cf-end');
    if (s.value && e.value) return;
    var start = new Date(Date.now() - 10 * 60 * 1000);
    start.setMilliseconds(0);
    s.value = toLocalValue(start);
    e.value = toLocalValue(new Date(start.getTime() + 10 * 1000));
  }

  // ── Step 2: window summary + request ─────────────────────────────────────────
  function readWindow() {
    var sv = TGE.el('cf-start').value, ev = TGE.el('cf-end').value;
    if (!sv || !ev) return { error: 'Set both start and end.' };
    var s = new Date(sv), e = new Date(ev);
    if (isNaN(s) || isNaN(e)) return { error: 'Start or end is not a valid date/time.' };
    var len = Math.round((e - s) / 1000);
    if (len < 1) return { error: 'End must be after start.' };
    if (len > MAX_SECONDS) return { error: 'Maximum is 15 minutes (this window is ' + fmtLength(len) + ').' };
    return { start: s, end: e, length: len, parts: Math.ceil(len / PART_SECONDS) };
  }

  function updateSummary() {
    var el = TGE.el('cf-summary');
    if (!el) return;
    var w = readWindow();
    if (w.error) { el.innerHTML = '<span style="color:var(--danger);">' + esc(w.error) + '</span>'; return; }
    el.innerHTML = 'Length <strong>' + esc(fmtLength(w.length)) + '</strong> · ' +
      w.parts + ' TN360 request' + (w.parts !== 1 ? 's' : '') +
      ' · sent as UTC ' + esc(w.start.toISOString()) + ' to ' + esc(w.end.toISOString());
  }

  async function doRequest() {
    if (state.busy || !state.lookup) return;
    var w = readWindow();
    if (w.error) { setMessage(w.error, true); return; }
    var ok = window.confirm(
      'Request ' + fmtLength(w.length) + ' of footage from camera ' + state.lookup.imei + '?\n\n' +
      'This sends ' + w.parts + ' request' + (w.parts !== 1 ? 's' : '') + ' to TN360 and uses the camera\'s upload allowance.'
    );
    if (!ok) return;

    state.busy = true;
    var btn = TGE.el('cf-request-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Requesting...'; }
    setMessage('Sending ' + w.parts + ' request' + (w.parts !== 1 ? 's' : '') + ' to TN360...', false);
    try {
      var r = await TGE.api('POST', '/api/camfootage/request', {
        imei: state.lookup.imei,
        start: w.start.toISOString(),
        end: w.end.toISOString()
      });
      renderResult(r);
    } catch (e) {
      setMessage('Request failed: ' + e.message, true);
    } finally {
      state.busy = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Request footage'; }
    }
  }

  function renderResult(r) {
    var d = r.data || {};
    var parts = Array.isArray(d.parts) ? d.parts : [];
    TGE.show('cf-result-card');
    if (!parts.length) {
      TGE.setText('cf-result-title', 'Request not sent');
      TGE.el('cf-result').innerHTML = '<p style="font-size:13px;color:var(--danger);margin:0;">' + esc(d.error || ('HTTP ' + r.status)) + '</p>';
      setMessage(d.error || 'Request not sent.', true);
      return;
    }
    TGE.setText('cf-result-title', d.ok
      ? 'Submitted: ' + parts.length + ' request' + (parts.length !== 1 ? 's' : '') + ' accepted by TN360'
      : 'TN360 refused a request');
    var rows = parts.map(function (p, i) {
      var s = p.sent || {};
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(fmtLocal(s.Start)) + '</td>' +
        '<td>' + esc(s.Length) + ' s</td>' +
        '<td>' + esc((s.Camera || []).join(', ')) + '</td>' +
        '<td>' + (p.ok
          ? '<span class="badge badge-green">Accepted</span>'
          : '<span class="badge badge-red">HTTP ' + esc(p.tn360Status) + '</span> <span style="font-size:11px;color:var(--muted);">' + esc(p.tn360Body) + '</span>') +
        '</td>' +
      '</tr>';
    }).join('');
    TGE.el('cf-result').innerHTML =
      '<div class="table-wrap"><table>' +
        '<thead><tr><th>#</th><th>Start</th><th>Length</th><th>Channels</th><th>TN360</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>' +
      '<p style="font-size:12px;color:var(--muted);margin:10px 0 0;">Track progress and view the clips on TN360\'s Video Requests page.</p>';
    setMessage(d.ok ? 'Footage requested.' : 'TN360 refused a request; later parts were not sent.', !d.ok);
  }

  // ── Register ─────────────────────────────────────────────────────────────────
  TGE.onShow['camera-footage'] = function () {
    if (!TGE.el('cf-lookup-btn')) render();
  };

})();
