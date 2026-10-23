// TGE Asset Snapshot — Camera Footage Page
// public/screen/screen-camera-footage.js
//
// Requests TN360 video footage for a camera, the same way TN360's own
// "Request Video Footage" dialog does. Renders into #view-camera-footage.
// Backend: GET /api/camfootage/lookup, POST /api/camfootage/request,
// POST /api/camfootage/videos and GET /api/camfootage/clip (TN360_SNAPSHOT_KEY).
// All the camera's channels are requested.
//
// Two tabs:
//  - Request footage: request a window, then "Check for footage" looks only for
//    those parts (same device, start and length) and plays them when ready.
//  - Find footage: any asset (fleet number or IMEI) and a date/time range; lists
//    every video request in it as a compact row, View opens that one's clips.
// Clips are whatever TN360 sends back (2 to 5 cameras, never assumed by model).
// Ticked clips save through the Worker as "<asset> <camera> <date> <time>.mp4".
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
  var state = {
    lookup: null, busy: false,
    sent: [],                                   // parts accepted this session: { ms, len }
    panes: { req: { data: null, rows: [], open: {} }, find: { data: null, rows: [], open: {}, tz: '' } },
    ticks: {}                                   // "<request id>:<clip index>" -> false when unticked
  };

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

      '<div style="display:flex;gap:8px;margin:0 0 14px;">',
        '<button type="button" class="btn btn-primary cf-tab" data-tab="req">Request footage</button>',
        '<button type="button" class="btn cf-tab" data-tab="find">Find footage</button>',
      '</div>',

      '<div id="cf-pane-req">',
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
      '</div>',

      '<div class="card" id="cf-footage-card" style="display:none;">',
        '<div class="card-kicker">Step 3</div>',
        '<div class="card-title">Footage for this request</div>',
        '<p style="font-size:12px;color:var(--muted);margin:0 0 12px;">Looks in TN360 for the parts requested above (same camera, start and length). TN360 usually takes a few minutes; check again until each part is Ready.</p>',
        '<button type="button" class="btn btn-primary" id="cf-check-btn">Check for footage</button>',
        '<div id="cf-footage" data-pane="req" style="margin-top:12px;"></div>',
      '</div>',
      '</div>',

      '<div id="cf-pane-find" style="display:none;">',
      '<div class="card">',
        '<div class="card-kicker">Search</div>',
        '<div class="card-title">Find footage</div>',
        '<p style="font-size:12px;color:var(--muted);margin:0 0 12px;">Any asset\'s video requests in TN360 for a period (up to 31 days). Click an Available row to play, save and combine its clips.</p>',
        '<div id="cf-find-slot" class="data-grid data-grid-4"></div>',
        '<button type="button" class="btn btn-primary" id="cf-find-btn">Search</button>',
        '<div id="cf-find-results" data-pane="find" style="margin-top:12px;"></div>',
      '</div>',
      '</div>'
    ].join('');

    // IMEI field + lookup button (built with createElement)
    var imeiSlot = TGE.el('cf-imei-slot');
    var imeiField = makeField('Fleet number or camera IMEI', 'cf-imei', 'text', { placeholder: 'e.g. 81110 or 862430069551451', autocomplete: 'off' });
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

    // Find footage: asset, zone, from, to
    var findSlot = TGE.el('cf-find-slot');
    findSlot.appendChild(makeField('Fleet number or camera IMEI', 'cf-find-asset', 'text', { placeholder: 'e.g. 81110', autocomplete: 'off' }));
    findSlot.appendChild(makeSelect('Times in', 'cf-find-tz', zoneOpts, prefs.entered || 'Australia/Brisbane'));
    findSlot.appendChild(makeField('From', 'cf-find-from', 'datetime-local', { step: '1' }));
    findSlot.appendChild(makeField('To', 'cf-find-to', 'datetime-local', { step: '1' }));
    var ftz = TGE.el('cf-find-tz').value;
    TGE.el('cf-find-to').value   = utcToWall(Math.floor(Date.now() / 1000) * 1000, ftz);
    TGE.el('cf-find-from').value = utcToWall(Math.floor(Date.now() / 1000) * 1000 - 86400000, ftz);

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
    document.querySelectorAll('#view-camera-footage .cf-tab').forEach(function (b) {
      b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); });
    });
    TGE.on('cf-check-btn', 'click', doCheckFootage);
    TGE.on('cf-find-btn', 'click', doFind);
    TGE.on('cf-find-asset', 'keydown', function (e) { if (e.key === 'Enter') doFind(); });
    ['cf-footage', 'cf-find-results'].forEach(function (id) {
      TGE.on(id, 'click', onFootageClick);
      TGE.on(id, 'change', onFootageChange);
    });
  }

  function showTab(tab) {
    document.querySelectorAll('#view-camera-footage .cf-tab').forEach(function (b) {
      b.classList.toggle('btn-primary', b.getAttribute('data-tab') === tab);
    });
    TGE.el('cf-pane-req').style.display  = tab === 'req' ? '' : 'none';
    TGE.el('cf-pane-find').style.display = tab === 'find' ? '' : 'none';
    setMessage('', false);
  }

  // ── Step 1: lookup ───────────────────────────────────────────────────────────
  async function doLookup() {
    if (state.busy) return;
    var imei = assetQuery(TGE.el('cf-imei').value);
    if (!imei) { setMessage('Enter a fleet number or camera IMEI.', true); return; }
    state.busy = true;
    state.lookup = null;
    TGE.hide('cf-camera');
    TGE.hide('cf-request-card');
    TGE.hide('cf-result-card');
    TGE.hide('cf-footage-card');
    state.sent = [];
    state.panes.req = { data: null, rows: [], open: {} };
    TGE.el('cf-footage').innerHTML = '';
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
        '<div class="data-item"><span>Vehicle</span><strong>' + esc(d.vehicleName || ('ID ' + (d.vehicleId || '—'))) + (d.registration ? ' · ' + esc(d.registration) : '') + '</strong></div>',
        '<div class="data-item"><span>Camera IMEI · device</span><strong>' + esc(d.imei) + ' · ' + esc(d.deviceId) + '</strong></div>',
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
        if (part.ok && part.sent) state.sent.push({ ms: new Date(part.sent.Start).getTime(), len: part.sent.Length });
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
        '<td>' + esc(s.Camera ? s.Camera.join(', ') : 'Road, Driver (built-in)') + '</td>' +
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
      '<p style="font-size:12px;color:var(--muted);margin:10px 0 0;">When TN360 has made the footage, use <b>Check for footage</b> below to play and save it.</p>';
    setMessage(allOk ? 'Footage requested.' : 'Not all requests were accepted.', !allOk);
    if (state.sent.length) TGE.show('cf-footage-card');
  }

  // ── Footage: shared helpers ──────────────────────────────────────────────────
  // An IMEI (digits only), or a fleet number / registration as typed.
  function assetQuery(raw) {
    raw = String(raw || '').trim();
    var digits = raw.replace(/[\s-]/g, '');
    return /^\d{10,20}$/.test(digits) ? digits : raw;
  }

  function paneTz(pane) {
    return pane === 'find' ? TGE.el('cf-find-tz').value : TGE.el('cf-tz-asset').value;
  }

  function paneAsset(pane) {
    var p = state.panes[pane], d = p.data || {}, l = pane === 'req' ? (state.lookup || {}) : {};
    return d.vehicleName || l.vehicleName || ('Vehicle ' + (d.vehicleId || l.vehicleId || ''));
  }

  // "81110 Road 21-10-2026 00-27-30.mp4", in the pane's time zone.
  function clipFileName(pane, q, clip) {
    var stamp = fmtZone(new Date(q.start).getTime(), paneTz(pane)).replace(/\//g, '-').replace(/:/g, '-');
    return paneAsset(pane) + ' ' + clip.label + ' ' + stamp + '.mp4';
  }

  function clipLink(pane, q, clip) {
    return '/api/camfootage/clip?url=' + encodeURIComponent(clip.url) + '&name=' + encodeURIComponent(clipFileName(pane, q, clip));
  }

  function isReady(q) { return q.status === 'AVAILABLE' && q.clips && q.clips.length > 0; }
  function tickKey(q, i) { return q.id + ':' + i; }
  function isTicked(q, i) { return state.ticks[tickKey(q, i)] !== false; }   // ticked unless unticked

  function findRow(pane, id) {
    var rows = state.panes[pane].rows;
    for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(id)) return rows[i];
    return null;
  }

  function fmtTime(iso, tz) {
    var ms = new Date(iso).getTime();
    return isNaN(ms) ? '—' : fmtZone(ms, tz) + ' ' + zoneLabel(tz);
  }

  function dotStatus(q) {
    var c = q.missing ? 'var(--muted-2)' : isReady(q) ? 'var(--green-600)' : (q.status === 'INPROGRESS' || q.status === 'REQUESTED') ? '#e3a008' : 'var(--danger)';
    var t = q.missing ? 'Not listed yet' : isReady(q) ? 'Available' : (q.status === 'INPROGRESS' || q.status === 'REQUESTED') ? 'In progress' : q.status === 'AVAILABLE' ? 'No clips' : (q.status || 'Unknown');
    return '<span style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;"><span style="width:9px;height:9px;border-radius:50%;background:' + c + ';"></span>' + esc(t) + '</span>';
  }

  // Details view for one request (like TN360's Video Request Details): header strip,
  // then a labelled player per camera with tick + Save, then Download selected.
  function detailHtml(pane, q) {
    var tz = paneTz(pane), d = state.panes[pane].data || {};
    var imei = pane === 'find' ? (state.panes.find.imei || '') : ((state.lookup && state.lookup.imei) || '');
    var n = q.clips.filter(function (c, i) { return isTicked(q, i); }).length;
    function item(label, value) { return '<div class="data-item"><span>' + label + '</span><strong>' + value + '</strong></div>'; }
    return '<div style="border:1px solid var(--line);border-radius:12px;background:var(--surface-2);padding:12px;margin-top:10px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">' +
        '<strong style="font-size:13px;color:var(--ink);">Video request details</strong>' +
        '<button type="button" class="btn cf-close" data-id="' + esc(q.id) + '" style="height:28px;padding:0 12px;font-size:12px;">Close</button>' +
      '</div>' +
      '<div class="data-grid data-grid-4" style="margin-bottom:12px;">' +
        item('Vehicle', esc(paneAsset(pane)) + (d.registration ? ' · ' + esc(d.registration) : '')) +
        item('Device', esc(imei || d.deviceId || '—')) +
        item('Clip start', esc(fmtTime(q.start, tz)) + ' · ' + esc(q.length != null ? fmtLength(q.length) : '—')) +
        item('Requested by', esc(q.requestedBy || '—') + (q.requestedAt ? ' · ' + esc(fmtTime(q.requestedAt, tz)) : '')) +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;">' +
      q.clips.map(function (c, i) {
        return '<div style="background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:8px;">' +
          '<div style="position:relative;">' +
            '<video controls preload="none" playsinline style="display:block;width:100%;border-radius:6px;background:#000;aspect-ratio:16/9;"' +
              (c.thumb ? ' poster="' + esc(c.thumb) + '"' : '') + ' src="' + esc(c.url) + '"></video>' +
            '<span style="position:absolute;top:8px;right:8px;background:rgba(15,26,19,0.78);color:#fff;font-size:10.5px;font-weight:700;letter-spacing:.04em;padding:3px 8px;border-radius:6px;pointer-events:none;">' + esc(c.label.toUpperCase()) + '</span>' +
          '</div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:6px;">' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--ink);cursor:pointer;">' +
              '<span class="cf-tick-slot" data-key="' + esc(tickKey(q, i)) + '"></span>' + esc(c.label) + '</label>' +
            '<a class="btn" style="height:26px;padding:0 10px;font-size:11px;display:inline-flex;align-items:center;" href="' + esc(clipLink(pane, q, c)) + '">Save</a>' +
          '</div>' +
        '</div>';
      }).join('') +
      '</div>' +
      '<div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
        '<button type="button" class="btn btn-primary cf-save-sel" data-id="' + esc(q.id) + '"' + (n ? '' : ' disabled') + '>Download selected (' + n + ')</button>' +
        '<span style="font-size:11px;color:var(--muted);">TN360 links last 7 days; search again to refresh them.</span>' +
      '</div>' +
    '</div>';
  }

  // Request tab: one row per part sent, details open under the part.
  // Find tab: a table like TN360's Video Requests page; clicking a ready row opens its details below.
  function renderRows(pane) {
    var p = state.panes[pane];
    var el = TGE.el(pane === 'find' ? 'cf-find-results' : 'cf-footage');
    if (!el) return;
    if (!p.rows.length) {
      el.innerHTML = '<p style="font-size:13px;color:var(--muted);margin:0;">No video requests for ' + esc(paneAsset(pane)) + ' in this period.</p>';
      return;
    }
    var tz = paneTz(pane);
    if (pane === 'find') {
      var openRow = null;
      var body = p.rows.map(function (q) {
        var on = !!p.open[q.id] && isReady(q);
        if (on) openRow = q;
        return '<tr class="cf-row" data-id="' + esc(q.id) + '" style="cursor:' + (isReady(q) ? 'pointer' : 'default') + ';' + (on ? 'background:var(--green-50);' : '') + '">' +
          '<td>' + dotStatus(q) + '</td>' +
          '<td>' + esc(q.requestedAt ? fmtTime(q.requestedAt, tz) : '—') + '</td>' +
          '<td><strong style="font-size:12.5px;">' + esc(fmtTime(q.start, tz)) + '</strong></td>' +
          '<td>' + esc(q.length != null ? fmtLength(q.length) : '—') + '</td>' +
          '<td>' + esc(paneAsset(pane)) + '</td>' +
          '<td>' + esc(q.requestedBy || '—') + '</td>' +
          '<td style="font-size:11.5px;">' + esc((q.cameras || []).join(', ') || '—') + '</td>' +
          '<td style="font-family:monospace;font-size:11px;">' + esc(state.panes.find.imei || '') + '</td>' +
        '</tr>';
      }).join('');
      el.innerHTML =
        '<div class="table-wrap"><table>' +
          '<thead><tr><th>Status</th><th>Request time</th><th>Event time</th><th>Length</th><th>Vehicle</th><th>Requested by</th><th>Cameras</th><th>Device</th></tr></thead>' +
          '<tbody>' + body + '</tbody>' +
        '</table></div>' +
        '<p style="font-size:11px;color:var(--muted);margin:6px 0 0;">Click an Available row to view, select, save and combine its footage.</p>' +
        (openRow ? '<div id="cf-find-detail">' + detailHtml('find', openRow) + '</div>' : '');
    } else {
      el.innerHTML = p.rows.map(function (q, idx) {
        var open = isReady(q) && !!p.open[q.id];
        var head =
          '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">' +
            (p.rows.length > 1 ? '<span style="font-size:12px;color:var(--muted);">Part ' + (idx + 1) + '</span>' : '') +
            '<strong style="font-size:13px;color:var(--ink);">' + esc(fmtTime(q.start, tz)) + '</strong>' +
            '<span style="font-size:12px;color:var(--muted);">' + esc(q.length != null ? fmtLength(q.length) : '—') + '</span>' +
            dotStatus(q) +
            (isReady(q) ? '<span style="font-size:12px;color:var(--muted);">' + q.clips.length + ' camera' + (q.clips.length !== 1 ? 's' : '') + '</span>' : '') +
            (isReady(q) && !open ? '<button type="button" class="btn cf-view" data-id="' + esc(q.id) + '" style="margin-left:auto;height:28px;padding:0 12px;font-size:12px;">View</button>' : '') +
          '</div>';
        var body = open ? detailHtml('req', q)
          : q.missing ? '<p style="font-size:12px;color:var(--muted);margin:6px 0 0;">TN360 hasn\'t listed this part yet. Check again in a few minutes.</p>'
          : (q.status === 'INPROGRESS' || q.status === 'REQUESTED') ? '<p style="font-size:12px;color:var(--muted);margin:6px 0 0;">TN360 is still preparing this footage. Check again in a few minutes.</p>'
          : '';
        return '<div style="border-top:1px solid var(--line);padding:10px 0;">' + head + body + '</div>';
      }).join('');
    }

    // Tick boxes (built with createElement)
    el.querySelectorAll('.cf-tick-slot').forEach(function (slot) {
      var key = slot.getAttribute('data-key');
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'cf-tick';
      box.checked = state.ticks[key] !== false;
      box.setAttribute('data-key', key);
      slot.appendChild(box);
    });
  }

  function paneOf(el) {
    var host = el.closest ? el.closest('[data-pane]') : null;
    return host ? host.getAttribute('data-pane') : 'req';
  }

  function onFootageChange(e) {
    var t = e.target;
    if (!t.classList || !t.classList.contains('cf-tick')) return;
    var pane = paneOf(t);
    state.ticks[t.getAttribute('data-key')] = t.checked;
    var id = t.getAttribute('data-key').split(':')[0];
    var q = findRow(pane, id);
    var btn = t.closest('[data-pane]').querySelector('.cf-save-sel[data-id="' + id + '"]');
    if (q && btn) {
      var n = q.clips.filter(function (c, i) { return isTicked(q, i); }).length;
      btn.textContent = 'Download selected (' + n + ')';
      btn.disabled = !n;
    }
  }

  function onFootageClick(e) {
    var t = e.target;
    if (!t.classList) return;
    var pane = paneOf(t);
    if (t.classList.contains('cf-view') || t.classList.contains('cf-close')) {
      var id = t.getAttribute('data-id');
      state.panes[pane].open[id] = t.classList.contains('cf-view');
      renderRows(pane);
      return;
    }
    var row = t.closest ? t.closest('tr.cf-row') : null;
    if (row && pane === 'find') {
      var q0 = findRow('find', row.getAttribute('data-id'));
      if (!q0 || !isReady(q0)) return;
      state.panes.find.open = {};
      state.panes.find.open[q0.id] = true;   // one request open at a time
      renderRows('find');
      var det = TGE.el('cf-find-detail');
      if (det && det.scrollIntoView) det.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!t.classList.contains('cf-save-sel')) return;
    // Saves each ticked clip, one after another (browsers allow a few downloads in a row).
    var q = findRow(pane, t.getAttribute('data-id'));
    if (!q) return;
    var links = q.clips.filter(function (c, i) { return isTicked(q, i); }).map(function (c) { return clipLink(pane, q, c); });
    links.forEach(function (href, i) {
      setTimeout(function () {
        var a = document.createElement('a');
        a.href = href;
        a.setAttribute('download', '');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, i * 800);
    });
    setMessage('Saving ' + links.length + ' clip' + (links.length !== 1 ? 's' : '') + '...', false);
  }

  function setBtn(id, busy, idle, busyText) {
    var b = TGE.el(id);
    if (b) { b.disabled = busy; b.textContent = busy ? busyText : idle; }
  }

  // ── Request tab: check for the parts just requested ──────────────────────────
  async function doCheckFootage() {
    if (state.busy || !state.lookup || !state.sent.length) return;
    var starts = state.sent.map(function (s) { return s.ms; });
    var ask = {
      imei: state.lookup.imei,
      from: new Date(Math.min.apply(null, starts) - 60000).toISOString(),
      to:   new Date(Math.max.apply(null, starts) + 60000).toISOString()
    };
    state.busy = true;
    setBtn('cf-check-btn', true, 'Check for footage', 'Checking...');
    setMessage('Checking TN360 for this request\'s footage...', false);
    try {
      var r = await TGE.api('POST', '/api/camfootage/videos', ask);
      if (!r.ok) { setMessage((r.data && r.data.error) || 'Footage check failed.', true); return; }
      var list = r.data.requests || [];
      var p = state.panes.req;
      p.data = r.data;
      // Match each part we sent to TN360's entry for it: same start and length.
      p.rows = state.sent.map(function (s, i) {
        for (var j = 0; j < list.length; j++) {
          if (new Date(list[j].start).getTime() === s.ms && Number(list[j].length) === Number(s.len)) return list[j];
        }
        return { id: 'missing-' + i, missing: true, start: new Date(s.ms).toISOString(), length: s.len, clips: [] };
      });
      // A single part opens straight away; several stay closed until View.
      if (p.rows.length === 1 && isReady(p.rows[0])) p.open[p.rows[0].id] = true;
      renderRows('req');
      var ready = p.rows.filter(isReady).length;
      setMessage(ready + ' of ' + p.rows.length + ' part' + (p.rows.length !== 1 ? 's' : '') + ' ready.', false);
    } catch (e) {
      setMessage('Footage check failed: ' + e.message, true);
    } finally {
      state.busy = false;
      setBtn('cf-check-btn', false, 'Check for footage');
    }
  }

  // ── Find tab: any asset, any period ──────────────────────────────────────────
  async function doFind() {
    if (state.busy) return;
    var q = assetQuery(TGE.el('cf-find-asset').value);
    if (!q) { setMessage('Enter a fleet number or camera IMEI.', true); return; }
    var tz = TGE.el('cf-find-tz').value;
    var from = wallToUtc(TGE.el('cf-find-from').value, tz), to = wallToUtc(TGE.el('cf-find-to').value, tz);
    if (isNaN(from) || isNaN(to)) { setMessage('Set both From and To.', true); return; }
    if (to <= from) { setMessage('To must be after From.', true); return; }
    if (to - from > 31 * 86400000) { setMessage('Choose a period of 31 days or less.', true); return; }
    state.busy = true;
    setBtn('cf-find-btn', true, 'Search', 'Searching...');
    setMessage('Finding ' + q + '...', false);
    try {
      var lk = await TGE.api('GET', '/api/camfootage/lookup?imei=' + encodeURIComponent(q));
      if (!lk.ok) { setMessage((lk.data && lk.data.error) || 'Lookup failed.', true); return; }
      setMessage('Searching TN360 video requests...', false);
      var r = await TGE.api('POST', '/api/camfootage/videos', { imei: lk.data.imei, from: new Date(from).toISOString(), to: new Date(to).toISOString() });
      if (!r.ok) { setMessage((r.data && r.data.error) || 'Search failed.', true); return; }
      if (!r.data.vehicleName) r.data.vehicleName = lk.data.vehicleName;
      state.panes.find = { data: r.data, rows: r.data.requests || [], open: {}, imei: lk.data.imei };
      renderRows('find');
      var ready = state.panes.find.rows.filter(isReady).length;
      setMessage(state.panes.find.rows.length + ' request' + (state.panes.find.rows.length !== 1 ? 's' : '') + ' found for ' + paneAsset('find') + ', ' + ready + ' ready to view.', false);
    } catch (e) {
      setMessage('Search failed: ' + e.message, true);
    } finally {
      state.busy = false;
      setBtn('cf-find-btn', false, 'Search');
    }
  }


  // ── Register ─────────────────────────────────────────────────────────────────
  TGE.onShow['camera-footage'] = function () {
    if (!TGE.el('cf-lookup-btn')) render();
  };

})();
