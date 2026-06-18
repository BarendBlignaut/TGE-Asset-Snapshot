// TGE Asset Snapshot — Camera Count Page
// public/camera-count.js

(function () {
  'use strict';

  var CAMERA_SLOTS = [
    { id:'road',   label:'Road',    source:'ROAD_FACING',  sources:['ROAD']   },
    { id:'driver', label:'Driver',  source:'DRIVER_FACING',sources:['DRIVER'] },
    { id:'incab',  label:'In-Cab',  source:'MDVR',         sources:['UVC']    },
    { id:'ext1',   label:'R.Ext',   source:'MDVR',         sources:['TVI2']   },
    { id:'ext2',   label:'L.Ext',   source:'MDVR',         sources:['TVI1']   },
  ];

  var state = {
    running:  false,
    mode:     'user',
    results:  [], // { vehicle, camera, slots: [{label, sizeBytes, sizeKb}] }
  };

  var userLimit = 500;
  var canUser   = false;
  var canFleet  = false;

  // ── Render ─────────────────────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-camera-count');
    if (!view) return;

    userLimit = TGE.limit('camera-count', 'user-mode') || 500;
    canUser   = TGE.can('camera-count', 'user-mode');
    canFleet  = TGE.can('camera-count', 'fleet-mode');
    state.mode = canUser ? 'user' : 'fleet';

    view.innerHTML = [
      '<div class="hero">',
        '<div class="hero-kicker">Camera</div>',
        '<div class="hero-title">Camera Count</div>',
        '<div class="hero-sub">Audit camera health across the fleet by image file size.</div>',
        '<div class="hero-bar">',
          '<div class="hero-bar-left">',
            canUser  ? '<button class="hero-mode-btn' + (state.mode==='user'?' active':'') + '" id="cc-mode-user">User Mode</button>' : '',
            canFleet ? '<button class="hero-mode-btn' + (state.mode==='fleet'?' active':'') + '" id="cc-mode-fleet">Fleet Mode</button>' : '',
            '<button class="hero-run-btn" id="cc-run-btn">Run</button>',
          '</div>',
          '<div class="hero-bar-right">',
            '<div class="hero-divider"></div>',
            TGE.can('camera-count','export-pdf')       ? '<button class="hero-export-btn" id="cc-pdf-btn">PDF</button>'        : '',
            TGE.can('camera-count','export-email-pdf') ? '<button class="hero-export-btn" id="cc-email-btn">Email PDF</button>' : '',
            TGE.can('camera-count','export-csv')       ? '<button class="hero-export-btn" id="cc-csv-btn">CSV</button>'        : '',
            TGE.can('camera-count','export-xlsx')      ? '<button class="hero-export-btn" id="cc-xlsx-btn">XLSX</button>'      : '',
            TGE.can('camera-count','export-json')      ? '<button class="hero-export-btn" id="cc-json-btn">JSON</button>'      : '',
          '</div>',
        '</div>',
        '<p class="hero-message" id="cc-message"></p>',
      '</div>',

      // User mode IMEI input
      '<div id="cc-user-input" class="card" style="' + (state.mode==='user' && canUser ? '' : 'display:none;') + '">',
        '<div class="card-kicker">User Mode — IMEI Input</div>',
        '<div class="card-title">Enter Camera IMEIs</div>',
        '<p style="font-size:13px;color:var(--muted);margin-bottom:10px;">Enter one IMEI per line. Maximum ' + userLimit + ' devices.</p>',
        '<textarea id="cc-imei-input" rows="5" placeholder="867734081081214&#10;867734081112373" ',
          'style="width:100%;font-family:monospace;font-size:12px;border:1px solid var(--line);border-radius:8px;padding:10px;resize:vertical;background:var(--surface);color:var(--ink);"></textarea>',
        '<p id="cc-imei-count" style="font-size:12px;color:var(--muted);margin-top:6px;">0 IMEIs entered</p>',
      '</div>',

      // Notice banner
      '<div class="card" style="background:var(--green-50);border-color:var(--green-600);">',
        '<div style="display:flex;align-items:center;gap:10px;">',
          '<span style="font-size:20px;">🔬</span>',
          '<div>',
            '<div style="font-size:12px;font-weight:700;color:var(--green-700);">Trial Run Mode</div>',
            '<div style="font-size:12px;color:var(--muted);">Showing raw image sizes — no thresholds applied yet. Review the data to define Good / Bad / Missing size boundaries.</div>',
          '</div>',
        '</div>',
      '</div>',

      // Empty state
      '<div id="cc-empty" class="card" style="text-align:center;padding:48px 20px;">',
        '<div style="font-size:40px;margin-bottom:12px;opacity:0.3;">📊</div>',
        '<div style="font-size:14px;font-weight:600;color:var(--ink);margin-bottom:6px;">No data loaded</div>',
        '<p style="font-size:13px;color:var(--muted);margin:0;">Select a mode and click Run to audit camera sizes.</p>',
      '</div>',

      // Summary bar (shown after run)
      '<div id="cc-summary" style="display:none;" class="card">',
        '<div class="data-grid data-grid-4">',
          '<div class="data-item"><span>Total Assets</span><strong id="cc-sum-assets">—</strong></div>',
          '<div class="data-item"><span>Total Cameras</span><strong id="cc-sum-cameras">—</strong></div>',
          '<div class="data-item"><span>With Images</span><strong id="cc-sum-with">—</strong></div>',
          '<div class="data-item"><span>No Image</span><strong id="cc-sum-without">—</strong></div>',
        '</div>',
      '</div>',

      // Results table
      '<div id="cc-results" style="display:none;">',
        '<div class="card" style="padding:0;overflow:hidden;">',
          '<div style="overflow-x:auto;">',
            '<table style="width:100%;border-collapse:collapse;min-width:900px;">',
              '<thead>',
                '<tr style="background:var(--surface-2);border-bottom:2px solid var(--line);">',
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);white-space:nowrap;">Legacy No</th>',
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">IMEI</th>',
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">Model</th>',
                  '<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">Road</th>',
                  '<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">Driver</th>',
                  '<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">In-Cab</th>',
                  '<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">R.Ext</th>',
                  '<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">L.Ext</th>',
                  '<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">Active</th>',
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">Captured</th>',
                '</tr>',
              '</thead>',
              '<tbody id="cc-tbody"></tbody>',
            '</table>',
          '</div>',
        '</div>',
      '</div>',

    ].join('');

    wireEvents();
  }

  // ── Wire events ───────────────────────────────────────────────────────────────
  function wireEvents() {
    TGE.on('cc-run-btn', 'click', runCount);

    var userBtn  = TGE.el('cc-mode-user');
    var fleetBtn = TGE.el('cc-mode-fleet');
    if (userBtn)  userBtn.onclick  = function() { setMode('user'); };
    if (fleetBtn) fleetBtn.onclick = function() { setMode('fleet'); };

    var imeiInput = TGE.el('cc-imei-input');
    if (imeiInput) imeiInput.addEventListener('input', updateImeiCount);
  }

  function setMode(mode) {
    state.mode = mode;
    var userBtn   = TGE.el('cc-mode-user');
    var fleetBtn  = TGE.el('cc-mode-fleet');
    var userInput = TGE.el('cc-user-input');
    if (userBtn)   userBtn.classList.toggle('active',  mode === 'user');
    if (fleetBtn)  fleetBtn.classList.toggle('active', mode === 'fleet');
    if (userInput) userInput.style.display = mode === 'user' ? '' : 'none';
  }

  function updateImeiCount() {
    var input = TGE.el('cc-imei-input');
    var count = TGE.el('cc-imei-count');
    if (!input || !count) return;
    var imeis = parseImeis(input.value);
    var over  = imeis.length > userLimit;
    count.textContent = imeis.length + ' IMEI' + (imeis.length !== 1 ? 's' : '') + ' entered' + (over ? ' — max ' + userLimit + ' allowed' : '');
    count.style.color = over ? 'var(--danger)' : 'var(--muted)';
  }

  function parseImeis(raw) {
    return raw.split(/[\n,\s]+/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 5; });
  }

  // ── Run ───────────────────────────────────────────────────────────────────────
  async function runCount() {
    if (state.running) return;

    var imeis = [];
    if (state.mode === 'user') {
      var input = TGE.el('cc-imei-input');
      imeis = parseImeis(input ? input.value : '');
      if (!imeis.length) { setMessage('Enter at least one IMEI.', true); return; }
      if (imeis.length > userLimit) { setMessage('Maximum ' + userLimit + ' IMEIs allowed.', true); return; }
    }

    state.running = true;
    state.results = [];
    setMessage('Loading...', false);
    setBtnState(true);

    try {
      var cameraDevices = [];

      if (state.mode === 'fleet') {
        setMessage('Loading all vehicles...', false);
        var vRes = await TGE.api('GET', '/api/tn360/v1/vehicles?pruning=B2B');
        if (!vRes.ok) throw new Error('Vehicle lookup failed');
        var vehicles = (Array.isArray(vRes.data) ? vRes.data : []).filter(function(v) { return v.status === 'ENABLED'; });

        var checked = 0;
        var allDevResults = await batchRun(vehicles, function(v) {
          return TGE.api('GET', '/api/tn360/v1/vehicles/' + v.id + '/devices?pruning=B2B')
            .then(function(r) {
              checked++;
              if (checked % 10 === 0) setMessage('Checking devices... ' + checked + '/' + vehicles.length, false);
              if (!r.ok) return null;
              var devices = Array.isArray(r.data) ? r.data : [];
              var camDev = devices.find(function(d) { return d.type && d.type.code === 'CAMERA' && !d.outServiceAt && d.vehicleId; });
              if (!camDev) return null;
              return { vehicle: v, camera: camDev };
            }).catch(function() { return null; });
        }, 5, 300);
        allDevResults.forEach(function(r) { if (r) cameraDevices.push(r); });

      } else {
        var devResults = await Promise.all(imeis.map(function(imei) {
          return TGE.api('GET', '/api/tn360/v1/devices/' + imei + '?pruning=B2B&embed=devicestats')
            .then(function(r) {
              if (!r.ok) return null;
              var d = r.data;
              if (!d.vehicleId || d.outServiceAt || !d.type || d.type.code !== 'CAMERA') return null;
              return { vehicle: { id: d.vehicleId, name: '—', type: { name: '—' } }, camera: d, needsVehicle: true };
            }).catch(function() { return null; });
        }));
        devResults.forEach(function(r) { if (r) cameraDevices.push(r); });
      }

      if (!cameraDevices.length) throw new Error('No active camera devices found.');

      setMessage('Found ' + cameraDevices.length + ' camera devices — loading events...', false);
      showResults();

      // Get events for all camera vehicles
      var snapshotMap = {};
      var done = 0;
      await batchRun(cameraDevices, function(cv) {
        return TGE.api('GET', '/api/tn360/v1/events?pruning=B2B&types=camera&vehicle_ids=' + cv.vehicle.id)
          .then(function(r) {
            done++;
            setMessage('Loading events... ' + done + '/' + cameraDevices.length, false);
            if (!r.ok) return;
            var events    = Array.isArray(r.data) ? r.data : [];
            var available = events.filter(function(e) { return e.attributes && e.attributes.status === 'available'; });
            if (!available.length) return;
            available.sort(function(a,b) { return new Date(b.timeAt) - new Date(a.timeAt); });
            snapshotMap[cv.vehicle.id] = available[0];
          }).catch(function(){});
      }, 5, 500);

      // Now get image sizes for each device
      setMessage('Checking image sizes...', false);
      var sizesDone = 0;
      await batchRun(cameraDevices, function(cv) {
        var snap = snapshotMap[cv.vehicle.id];
        var cam  = cv.camera;
        var slots = cam.model && cam.model.name === 'MultiIQ' ? 5 : 2;
        var mediaFiles = [];

        if (snap) {
          try {
            var ctx = JSON.parse(snap.attributes.context);
            if (ctx && ctx.response && ctx.response.mediaFiles) mediaFiles = ctx.response.mediaFiles;
          } catch(e) {}
        }

        var activeSlots = CAMERA_SLOTS.slice(0, slots);

        return Promise.all(activeSlots.map(function(slot) {
          var file = null;
          if (slot.source === 'MDVR') {
            file = mediaFiles.find(function(f) {
              return f.source === 'MDVR' && f.imageDetails && f.imageDetails.sources &&
                     f.imageDetails.sources.some(function(s) { return slot.sources.indexOf(s) !== -1; }) &&
                     f.status === 'FINISHED';
            });
          } else {
            file = mediaFiles.find(function(f) { return f.source === slot.source && f.status === 'FINISHED'; });
          }

          if (!file || !file.mediaFile) {
            return { label: slot.label, sizeBytes: null, sizeKb: null, url: null };
          }

          return TGE.api('GET', '/api/image-size?url=' + encodeURIComponent(file.mediaFile))
            .then(function(r) {
              if (!r.ok || !r.data) return { label: slot.label, sizeBytes: null, sizeKb: null, url: file.mediaFile };
              return { label: slot.label, sizeBytes: r.data.sizeBytes, sizeKb: r.data.sizeKb, url: file.mediaFile };
            }).catch(function() {
              return { label: slot.label, sizeBytes: null, sizeKb: null, url: null };
            });
        })).then(function(slotSizes) {
          sizesDone++;
          setMessage('Checking sizes... ' + sizesDone + '/' + cameraDevices.length, false);
          state.results.push({
            vehicle:     cv.vehicle,
            camera:      cv.camera,
            capturedAt:  snap ? snap.timeAt : null,
            slots:       slotSizes,
          });
          renderRows();
        });
      }, 3, 300);

      updateSummary();
      setMessage('');
      activateExports();

    } catch(e) {
      setMessage(e.message || 'Failed.', true);
    } finally {
      state.running = false;
      setBtnState(false);
    }
  }

  // ── Render rows ───────────────────────────────────────────────────────────────
  function renderRows() {
    var tbody = TGE.el('cc-tbody');
    if (!tbody) return;

    tbody.innerHTML = state.results.map(function(r) {
      var cam      = r.camera;
      var v        = r.vehicle;
      var slots    = cam.model && cam.model.name === 'MultiIQ' ? 5 : 2;
      var camModel = cam.model && cam.model.name ? cam.model.name : '—';
      var active   = 0;

      var slotCells = CAMERA_SLOTS.map(function(slot, idx) {
        if (idx >= slots) {
          return '<td style="padding:8px;text-align:center;font-size:11px;color:var(--muted-2);">—</td>';
        }
        var s = r.slots[idx] || {};
        if (!s.sizeKb && s.sizeKb !== 0) {
          return '<td style="padding:8px;text-align:center;">' +
            '<span style="font-size:11px;color:var(--muted);">No image</span>' +
          '</td>';
        }
        active++;
        var kb    = s.sizeKb;
        var label = kb >= 1000 ? (kb/1024).toFixed(1) + ' MB' : kb + ' KB';
        return '<td style="padding:8px;text-align:center;">' +
          '<div style="font-size:12px;font-weight:600;color:var(--ink);">' + label + '</div>' +
          '<div style="font-size:10px;color:var(--muted);">' + slot.label + '</div>' +
        '</td>';
      }).join('');

      var capturedAt = r.capturedAt ? formatTs(r.capturedAt) : '<span style="color:var(--muted);">No snapshot</span>';

      return '<tr style="border-bottom:1px solid var(--line-2);" ' +
        'onmouseover="this.style.background=\'var(--surface-2)\'" ' +
        'onmouseout="this.style.background=\'\'">' +
        '<td style="padding:8px 12px;font-weight:700;font-size:13px;white-space:nowrap;">' + (v.name || '—') + '</td>' +
        '<td style="padding:8px 12px;font-size:11px;font-family:monospace;color:var(--muted);">' + (cam.imei || cam.name || '—') + '</td>' +
        '<td style="padding:8px 12px;font-size:12px;">' + camModel + '</td>' +
        slotCells +
        '<td style="padding:8px;text-align:center;">' +
          '<strong style="font-size:13px;color:' + (active === slots ? 'var(--green-600)' : active === 0 ? 'var(--danger)' : 'var(--warning)') + ';">' + active + '/' + slots + '</strong>' +
        '</td>' +
        '<td style="padding:8px 12px;font-size:11px;white-space:nowrap;">' + capturedAt + '</td>' +
      '</tr>';
    }).join('');
  }

  function updateSummary() {
    var totalAssets  = state.results.length;
    var totalCams    = 0;
    var withImages   = 0;
    var withoutImages = 0;

    state.results.forEach(function(r) {
      var slots = r.camera.model && r.camera.model.name === 'MultiIQ' ? 5 : 2;
      totalCams += slots;
      r.slots.forEach(function(s) {
        if (s && s.sizeKb) withImages++;
        else withoutImages++;
      });
    });

    var sumEl = TGE.el('cc-summary');
    if (sumEl) sumEl.style.display = '';
    setText('cc-sum-assets',   totalAssets);
    setText('cc-sum-cameras',  totalCams);
    setText('cc-sum-with',     withImages);
    setText('cc-sum-without',  withoutImages);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  async function batchRun(items, fn, batchSize, delayMs) {
    var results = [];
    for (var i = 0; i < items.length; i += batchSize) {
      var batch = items.slice(i, i + batchSize);
      var batchResults = await Promise.all(batch.map(fn));
      results = results.concat(batchResults);
      if (i + batchSize < items.length) await delay(delayMs);
    }
    return results;
  }

  function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  function showResults() {
    TGE.hide('cc-empty');
    TGE.show('cc-results');
  }

  function setMessage(msg, isError) {
    var el = TGE.el('cc-message');
    if (!el) return;
    el.textContent = msg || '';
    el.className   = 'hero-message' + (isError ? ' error' : '');
  }

  function setBtnState(loading) {
    var btn = TGE.el('cc-run-btn');
    if (btn) { btn.textContent = loading ? 'Loading...' : 'Run'; btn.disabled = loading; }
  }

  function setText(id, val) {
    var el = TGE.el(id);
    if (el) el.textContent = val != null ? val : '—';
  }

  function formatTs(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('en-AU', {
        timeZone:'Australia/Sydney', day:'2-digit', month:'2-digit', year:'numeric',
        hour:'2-digit', minute:'2-digit', hour12:true
      });
    } catch(e) { return ts; }
  }

  function activateExports() {
    ['cc-pdf-btn','cc-email-btn','cc-csv-btn','cc-xlsx-btn','cc-json-btn'].forEach(function(id) {
      var el = TGE.el(id); if (el) el.classList.add('active');
    });
    var csvBtn  = TGE.el('cc-csv-btn');
    var jsonBtn = TGE.el('cc-json-btn');
    var xlsxBtn = TGE.el('cc-xlsx-btn');
    var pdfBtn  = TGE.el('cc-pdf-btn');
    var emailBtn = TGE.el('cc-email-btn');
    if (csvBtn)   csvBtn.onclick   = exportCsv;
    if (jsonBtn)  jsonBtn.onclick  = exportJson;
    if (xlsxBtn)  xlsxBtn.onclick  = exportCsv;
    if (pdfBtn)   pdfBtn.onclick   = function() { window.print(); };
    if (emailBtn) emailBtn.onclick = function() { alert('Email PDF — coming soon.'); };
  }

  function exportJson() {
    if (!state.results.length) return;
    var json = JSON.stringify(state.results, null, 2);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type:'application/json' }));
    a.download = 'camera-count-' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function exportCsv() {
    if (!state.results.length) return;
    var rows = [['Legacy No','IMEI','Camera Model','Vehicle Type','Road (KB)','Driver (KB)','In-Cab (KB)','R.Ext (KB)','L.Ext (KB)','Active Cameras','Total Slots','Captured']];
    state.results.forEach(function(r) {
      var slots = r.camera.model && r.camera.model.name === 'MultiIQ' ? 5 : 2;
      var slotSizes = CAMERA_SLOTS.slice(0, 5).map(function(s, i) {
        if (i >= slots) return '—';
        var slot = r.slots[i];
        return slot && slot.sizeKb ? slot.sizeKb : 'No image';
      });
      var active = r.slots.filter(function(s) { return s && s.sizeKb; }).length;
      rows.push([
        r.vehicle.name,
        r.camera.imei || r.camera.name,
        r.camera.model && r.camera.model.name,
        r.vehicle.type && r.vehicle.type.name,
        slotSizes[0], slotSizes[1], slotSizes[2], slotSizes[3], slotSizes[4],
        active, slots,
        r.capturedAt ? formatTs(r.capturedAt) : '',
      ]);
    });
    var csv = rows.map(function(r) {
      return r.map(function(c) { return '"' + String(c||'').replace(/"/g,'""') + '"'; }).join(',');
    }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }));
    a.download = 'camera-count-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ── Register ──────────────────────────────────────────────────────────────────
  var _orig = TGE.onAppReady;
  TGE.onAppReady = function () {
    if (typeof _orig === 'function') _orig();
    render();
  };

  TGE.onShow['camera-count'] = function() {};

})();
