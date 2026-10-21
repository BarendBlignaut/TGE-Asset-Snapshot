// TGE Asset Snapshot — Camera Footage Page
// public/screen/screen-camera-footage.js
//
// Requests TN360 video footage for a camera, the same way TN360's own
// "Request Video Footage" dialog does. Renders into #view-camera-footage.
// Backend: GET /api/camfootage/lookup and POST /api/camfootage/request
// (TN360_SNAPSHOT_KEY). All the camera's channels are requested.
//
// Times: the user types wall-clock times in a chosen zone ("Times entered in")
// and picks the asset's zone; the page converts to UTC with daylight saving
// handled by the browser's time zone data, and shows both local times.
// Splitting: 10/30/60/120 s parts (TN360's dialog options) or one request for
// the full window. The page sends one call per part so it can show progress.
//
// Delete this file + its script tag + its nav item + its view div to remove.

(function () {
  'use strict';

  var MAX_SECONDS = 900;   // keep in step with CAMFOOTAGE_MAX_SECONDS

  var ZONES = [
    { tz: 'Australia/Brisbane',  label: 'QLD' },
    { tz: 'Australia/Sydney',    label: 'NSW / ACT' },
    { tz: 'Australia/Melbourne', label: 'VIC' },
    { tz: 'Australia/Hobart',    label: 'TAS' },
    { tz: 'Australia/Adelaide',  label: 'SA' },
    { tz: 'Australia/Darwin',    label: 'NT' },
    { tz: 'Australia/Perth',     label: 'WA' },
    { tz: 'UTC',                 label: 'UTC' }
  ];

  var SPLITS = [
    { value: '10',  label: '10 second parts' },
    { value: '30',  label: '30 second parts' },
    { value: '60',  label: '60 second parts' },
    { value: '120', label: '120 second parts (TN360 limit)' },
    { value: '0',   label: 'One request for the full window' }
  ];

  var PREF_KEY = 'tge.camfootage.prefs';
  var state = { lookup: null, busy: false };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function zoneLabel(tz) {
    for (var i = 0; i < ZONES.length; i++) if (ZONES[i].tz === tz) return ZONES[i].label;
    return tz;
  }

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch (e) { return {}; }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        entered: TGE.el('cf-tz-entered').value,
        asset:   TGE.el('cf-tz-asset').value,
        split:   TGE.el('cf-split').value
      }));
    } catch (e) {}
  }

  // Wall-clock parts of a UTC instant in a zone.
  function partsInZone(ms, tz) {
    var out = {};
    new Intl.DateTimeFormat('en-AU', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(ms)).forEach(function (p) { out[p.type] = p.value; });
    return {
      y: +out.year, mo: +out.month, d: +out.day,
      h: +out.hour % 24, mi: +out.minute, s: +out.second
    };
  }

  // Zone offset (ms) at a UTC instant, e.g. +10 h for Brisbane.
  function offsetAt(ms, tz) {
    var p = partsInZone(ms, tz);
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
  }

  // "YYYY-MM-DDTHH:MM(:SS)" typed in zone tz -> UTC ms (daylight saving aware).
  function wallToUtc(value, tz) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value || '');
    if (!m) return NaN;
    var guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    var ms = guess - offsetAt(guess, tz);
    return guess - offsetAt(ms, tz);
  }

  // UTC ms -> "YYYY-MM-DDTHH:MM:SS" wall clock in zone tz (datetime-local value).
  function utcToWall(ms, tz) {
    var p = partsInZone(ms, tz);
    return p.y + '-' + pad(p.mo) + '-' + pad(p.d) + 'T' + pad(p.h) + ':' + pad(p.mi) + ':' + pad(p.s);
  }

  function fmtZone(ms, tz) {
    var p = partsInZone(ms, tz);
    return pad(p.d) + '/' + pad(p.mo) + '/' + p.y + ' ' + pad(p.h) + ':' + pad(p.mi) + ':' + pad(p.s);
  }

  function fmtLength(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m ? (m + ' min' + (s ? ' ' + s + ' s' : '')) : (s + ' s');
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

  function makeSelect(label, id, options, selected) {
    var wrap = document.createElement('div');
    wrap.className = 'field';
    var lab = document.createElement('label');
    lab.setAttribute('for', id);
    lab.textContent = label;
    var sel = document.createElement('select');
    sel.id = id;
    options.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      if (o.value === selected) opt.selected = true;
      sel.appendChild(opt);
    });
    wrap.appendChild(lab);
    wrap.appendChild(sel);
    return wrap;
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-camera-footage');
    if (!view) return;
    var canRun = TGE.can('camera-footage', 'run');
    var prefs  = loadPrefs();

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
        '<p style="font-size:12px;color:var(--muted);margin:0 0 12px;">Type the times as you see them, choose which time zone that is, and the asset\'s time zone. Daylight saving is applied by date. Up to 15 minutes.</p>',
        '<div id="cf-zone-slot" class="data-grid data-grid-2"></div>',
        '<div id="cf-time-slot" class="data-grid data-grid-2"></div>',
        '<div id="cf-split-slot" class="data-grid data-grid-2"></div>',
        '<div id="cf-summary" class="data-item" style="font-size:13px;color:var(--ink);margin:0 0 14px;"></div>',
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

    // Time zones
    var zoneOpts = ZONES.map(function (z) { return { value: z.tz, label: z.label + ' (' + z.tz + ')' }; });
    var zoneSlot = TGE.el('cf-zone-slot');
    zoneSlot.appendChild(makeSelect('Times entered in', 'cf-tz-entered', zoneOpts, prefs.entered || 'Australia/Brisbane'));
    zoneSlot.appendChild(makeSelect('Asset time zone', 'cf-tz-asset', zoneOpts, prefs.asset || 'Australia/Brisbane'));

    // Start / end fields (seconds precision)
    var timeSlot = TGE.el('cf-time-slot');
    timeSlot.appendChild(makeField('Start', 'cf-start', 'datetime-local', { step: '1' }));
    timeSlot.appendChild(makeField('End', 'cf-end', 'datetime-local', { step: '1' }));

    // Split
    TGE.el('cf-split-slot').appendChild(makeSelect('Split into', 'cf-split', SPLITS, prefs.split || '120'));

    TGE.on('cf-lookup-btn', 'click', doLookup);
    TGE.on('cf-imei', 'keydown', function (e) { if (e.key === 'Enter') doLookup(); });
    ['cf-start', 'cf-end'].forEach(function (id) {
      TGE.on(id, 'change', updateSummary);
      TGE.on(id, 'input', updateSummary);
    });
    ['cf-tz-entered', 'cf-tz-asset', 'cf-split'].forEach(function (id) {
      TGE.on(id, 'change', function () { savePrefs(); updateSummary(); });
    });
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
    var tz = TGE.el('cf-tz-entered') ? TGE.el('cf-tz-entered').value : 'Australia/Brisbane';
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
      '<p style="font-size:12px;color:var(--muted);margin:10px 0 0;">Last update ' +
        esc(st.lastUpdated ? fmtZone(new Date(st.lastUpdated).getTime(), tz) + ' ' + zoneLabel(tz) : '—') +
        '. Cameras requested: ' + esc(cams.join(', ')) + '.</p>'
    ].join('');
    TGE.show('cf-camera');
  }

  function prefillTimes() {
    var s = TGE.el('cf-start'), e = TGE.el('cf-end');
    if (s.value && e.value) return;
    var tz = TGE.el('cf-tz-entered').value;
    var start = Math.floor((Date.now() - 10 * 60 * 1000) / 1000) * 1000;
    s.value = utcToWall(start, tz);
    e.value = utcToWall(start + 10 * 1000, tz);
  }

  // ── Step 2: window summary + request ─────────────────────────────────────────
  function readWindow() {
    var tzIn    = TGE.el('cf-tz-entered').value;
    var tzAsset = TGE.el('cf-tz-asset').value;
    var split   = Number(TGE.el('cf-split').value);
    var sv = TGE.el('cf-start').value, ev = TGE.el('cf-end').value;
    if (!sv || !ev) return { error: 'Set both start and end.' };
    var s = wallToUtc(sv, tzIn), e = wallToUtc(ev, tzIn);
    if (isNaN(s) || isNaN(e)) return { error: 'Start or end is not a valid date/time.' };
    var len = Math.round((e - s) / 1000);
    if (len < 0) return { error: 'End can\'t be before start.' };
    if (len > MAX_SECONDS) return { error: 'Maximum is 15 minutes (this window is ' + fmtLength(len) + ').' };
    var size = split === 0 ? len : split;
    var parts = len === 0 ? [{ start: s, end: s }] : [];   // 0 s = snapshot test
    for (var off = 0; off < len; off += size) {
      parts.push({ start: s + off * 1000, end: s + Math.min(off + size, len) * 1000 });
    }
    return { start: s, end: e, length: len, split: split, parts: parts, tzIn: tzIn, tzAsset: tzAsset };
  }

  function updateSummary() {
    var el = TGE.el('cf-summary');
    if (!el) return;
    var w = readWindow();
    if (w.error) { el.innerHTML = '<b style="color:var(--danger);font-weight:600;">' + esc(w.error) + '</b>'; return; }
    function line(label, ms) {
      return '<div style="margin-top:4px;"><strong style="display:inline-block;min-width:44px;font-size:13px;">' + label + '</strong> ' +
        esc(fmtZone(ms, w.tzIn)) + ' ' + esc(zoneLabel(w.tzIn)) +
        ' &nbsp;=&nbsp; <strong style="display:inline;font-size:13px;">' + esc(fmtZone(ms, w.tzAsset)) + ' ' + esc(zoneLabel(w.tzAsset)) + ' (asset)</strong>' +
        ' &nbsp;=&nbsp; ' + esc(new Date(ms).toISOString().replace('.000Z', 'Z')) + ' UTC sent</div>';
    }
    el.innerHTML =
      '<span>Check before sending</span>' +
      line('Start', w.start) + line('End', w.end) +
      '<div style="margin-top:8px;">Length <strong style="display:inline;font-size:13px;">' + esc(fmtLength(w.length)) + '</strong> · ' +
        w.parts.length + ' TN360 request' + (w.parts.length !== 1 ? 's' : '') +
        (w.split === 0 && w.length > 120 ? ' · <b style="color:var(--danger);font-weight:600;">over TN360\'s 2-minute limit, it may be refused</b>' : '') +
      '</div>';
  }

  function friendlyError(body) {
    var t = String(body || '');
    if (/trip end time/i.test(t)) return 'Too recent: TN360 doesn\'t have this part of the trip yet. Try again in a few minutes.';
    return '';
  }

  async function doRequest() {
    if (state.busy || !state.lookup) return;
    var w = readWindow();
    if (w.error) { setMessage(w.error, true); return; }
    var n = w.parts.length;
    var ok = window.confirm(
      'Request ' + fmtLength(w.length) + ' of footage from camera ' + state.lookup.imei + '?\n\n' +
      'Start ' + fmtZone(w.start, w.tzAsset) + ' ' + zoneLabel(w.tzAsset) + ' (asset time)\n\n' +
      'This sends ' + n + ' request' + (n !== 1 ? 's' : '') + ' to TN360 and uses the camera\'s upload allowance.'
    );
    if (!ok) return;

    state.busy = true;
    var btn = TGE.el('cf-request-btn');
    if (btn) btn.disabled = true;
    var results = [];
    var stopped = '';
    try {
      for (var i = 0; i < n; i++) {
        if (btn) btn.textContent = 'Requesting ' + (i + 1) + ' of ' + n + '...';
        setMessage('Sending request ' + (i + 1) + ' of ' + n + ' to TN360...', false);
        var p = w.parts[i];
        var r = await TGE.api('POST', '/api/camfootage/request', {
          imei: state.lookup.imei,
          start: new Date(p.start).toISOString(),
          end: new Date(p.end).toISOString(),
          partSeconds: 0
        });
        var d = r.data || {};
        var part = Array.isArray(d.parts) && d.parts.length ? d.parts[0] : null;
        if (!part) { stopped = d.error || ('HTTP ' + r.status); break; }
        results.push(part);
        if (!part.ok) break;   // stop on the first refusal so we don't burn allowance
      }
    } catch (e) {
      stopped = e.message;
    } finally {
      state.busy = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Request footage'; }
    }
    renderResult(results, n, stopped, w);
  }

  function renderResult(results, total, stopped, w) {
    TGE.show('cf-result-card');
    var accepted = results.filter(function (p) { return p.ok; }).length;
    var allOk = accepted === total;
    TGE.setText('cf-result-title', allOk
      ? 'Submitted: ' + accepted + ' request' + (accepted !== 1 ? 's' : '') + ' accepted by TN360'
      : accepted + ' of ' + total + ' requests accepted; the rest were not sent');

    var rows = results.map(function (p, i) {
      var s = p.sent || {};
      var ms = new Date(s.Start).getTime();
      var hint = p.ok ? '' : friendlyError(p.tn360Body);
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(fmtZone(ms, w.tzAsset)) + ' ' + esc(zoneLabel(w.tzAsset)) + '</td>' +
        '<td>' + esc(fmtZone(ms, w.tzIn)) + ' ' + esc(zoneLabel(w.tzIn)) + '</td>' +
        '<td>' + esc(s.Length) + ' s</td>' +
        '<td>' + esc((s.Camera || []).join(', ')) + '</td>' +
        '<td>' + (p.ok
          ? '<span class="badge badge-green">Accepted</span>'
          : '<span class="badge badge-red">HTTP ' + esc(p.tn360Status) + '</span> <span style="font-size:11px;color:var(--muted);">' + esc(hint || p.tn360Body) + '</span>') +
        '</td>' +
      '</tr>';
    }).join('');

    TGE.el('cf-result').innerHTML =
      (results.length
        ? '<div class="table-wrap"><table>' +
            '<thead><tr><th>#</th><th>Start (asset)</th><th>Start (entered)</th><th>Length</th><th>Channels</th><th>TN360</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table></div>'
        : '') +
      (stopped ? '<p style="font-size:13px;color:var(--danger);margin:10px 0 0;">' + esc(stopped) + '</p>' : '') +
      '<p style="font-size:12px;color:var(--muted);margin:10px 0 0;">Track progress and view the clips on TN360\'s Video Requests page (it shows times in your TN360 time zone).</p>';
    setMessage(allOk ? 'Footage requested.' : 'Not all requests were accepted.', !allOk);
  }

  // ── Register ─────────────────────────────────────────────────────────────────
  TGE.onShow['camera-footage'] = function () {
    if (!TGE.el('cf-lookup-btn')) render();
  };

})();
