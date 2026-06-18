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
    running: false,
    mode:    'user',
    results: [],   // { vehicle, camera, lastComms, slots: [{label, hasImage, url, status}] }
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
        '<div class="hero-sub">Review camera images and mark each as working or not working.</div>',
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

      // Empty state
      '<div id="cc-empty" class="card" style="text-align:center;padding:48px 20px;">',
        '<div style="font-size:40px;margin-bottom:12px;opacity:0.3;">📋</div>',
        '<div style="font-size:14px;font-weight:600;color:var(--ink);margin-bottom:6px;">No data loaded</div>',
        '<p style="font-size:13px;color:var(--muted);margin:0;">Select a mode and click Run to review camera health.</p>',
      '</div>',

      // Summary bar
      '<div id="cc-summary" style="display:none;" class="card">',
        '<div class="data-grid data-grid-4">',
          '<div class="data-item"><span>Total Assets</span><strong id="cc-sum-assets">—</strong></div>',
          '<div class="data-item"><span>Total Camera Slots</span><strong id="cc-sum-slots">—</strong></div>',
          '<div class="data-item"><span>Marked Working</span><strong id="cc-sum-working" style="color:var(--green-600);">—</strong></div>',
          '<div class="data-item"><span>Marked Not Working</span><strong id="cc-sum-broken" style="color:var(--danger);">—</strong></div>',
        '</div>',
      '</div>',

      // Results — card per asset (not table, since images need room)
      '<div id="cc-results" style="display:none;display:flex;flex-direction:column;gap:14px;"></div>',

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

        await Promise.all(cameraDevices.map(function(cd) {
          if (!cd.needsVehicle) return;
          return TGE.api('GET', '/api/tn360/v1/vehicles?pruning=B2B')
            .then(function(r) {
              if (!r.ok) return;
              var vehicles = Array.isArray(r.data) ? r.data : [];
              var v = vehicles.find(function(v) { return v.id === cd.vehicle.id; });
              if (v) cd.vehicle = v;
            }).catch(function(){});
        }));
      }

      if (!cameraDevices.length) throw new Error('No active camera devices found.');

      setMessage('Found ' + cameraDevices.length + ' camera devices — loading device status...', false);

      // Get device stats (for lastEventAt / last comms) — batched
      var statsMap = {};
      var statsDone = 0;
      await batchRun(cameraDevices, function(cv) {
        return TGE.api('GET', '/api/tn360/v1/devices/' + cv.camera.imei + '?pruning=B2B&embed=devicestats')
          .then(function(r) {
            statsDone++;
            setMessage('Checking device status... ' + statsDone + '/' + cameraDevices.length, false);
            if (r.ok && r.data && r.data.deviceStats) {
              statsMap[cv.camera.imei] = r.data.deviceStats.lastEventAt || null;
            }
          }).catch(function(){});
      }, 5, 300);

      setMessage('Loading camera events...', false);

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

      // Build results
      state.results = cameraDevices.map(function(cv) {
        var snap  = snapshotMap[cv.vehicle.id];
        var cam   = cv.camera;
        var slots = cam.model && cam.model.name === 'MultiIQ' ? 5 : 2;
        var mediaFiles = [];

        if (snap) {
          try {
            var ctx = JSON.parse(snap.attributes.context);
            if (ctx && ctx.response && ctx.response.mediaFiles) mediaFiles = ctx.response.mediaFiles;
          } catch(e) {}
        }

        var activeSlots = CAMERA_SLOTS.slice(0, slots);
        var slotData = activeSlots.map(function(slot) {
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
          return { label: slot.label, hasImage: !!(file && file.mediaFile), url: file ? file.mediaFile : null, status: null, sizeKb: null };
        });

        return {
          vehicle:    cv.vehicle,
          camera:     cam,
          lastComms:  statsMap[cam.imei] || null,
          capturedAt: snap ? snap.timeAt : null,
          slots:      slotData,
        };
      });

      renderResults();
      updateSummary();
      setMessage('Checking image sizes...', false);
      activateExports();

      // Fetch image sizes in background (doesn't block display)
      var sizeChecks = [];
      state.results.forEach(function(r, rowIdx) {
        r.slots.forEach(function(slot, slotIdx) {
          if (slot.hasImage && slot.url) {
            sizeChecks.push({ rowIdx: rowIdx, slotIdx: slotIdx, url: slot.url });
          }
        });
      });

      var sizeDone = 0;
      await batchRun(sizeChecks, function(check) {
        return TGE.api('GET', '/api/image-size?url=' + encodeURIComponent(check.url))
          .then(function(r) {
            sizeDone++;
            if (sizeDone % 10 === 0 || sizeDone === sizeChecks.length) {
              setMessage('Checking image sizes... ' + sizeDone + '/' + sizeChecks.length, false);
            }
            if (r.ok && r.data && r.data.sizeKb != null) {
              state.results[check.rowIdx].slots[check.slotIdx].sizeKb = r.data.sizeKb;
            }
          }).catch(function(){});
      }, 5, 300);

      setMessage('');
      renderResults();

    } catch(e) {
      setMessage(e.message || 'Failed.', true);
    } finally {
      state.running = false;
      setBtnState(false);
    }
  }

  // ── Render results as cards ───────────────────────────────────────────────────
  function renderResults() {
    TGE.hide('cc-empty');
    var container = TGE.el('cc-results');
    if (!container) return;
    container.style.display = 'flex';

    container.innerHTML = state.results.map(function(r, idx) {
      var v        = r.vehicle;
      var cam      = r.camera;
      var camModel = cam.model && cam.model.name ? cam.model.name : '—';
      var slots    = cam.model && cam.model.name === 'MultiIQ' ? 5 : 2;

      var lastCommsText = r.lastComms ? formatTs(r.lastComms) : 'Unknown';
      var lastCommsAge   = r.lastComms ? daysAgo(r.lastComms) : null;
      var lastCommsColor = lastCommsAge === null ? 'var(--muted)' : lastCommsAge > 7 ? 'var(--danger)' : lastCommsAge > 2 ? 'var(--warning)' : 'var(--green-600)';

      var slotCells = r.slots.map(function(slot, slotIdx) {
        var imgHtml = slot.hasImage
          ? '<img src="/api/image-proxy?url=' + encodeURIComponent(slot.url) + '" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;border:1px solid var(--line);display:block;" alt="' + slot.label + '" onerror="this.style.opacity=0.3" />'
          : '<div style="aspect-ratio:4/3;background:var(--surface-2);border:1px solid var(--line);border-radius:6px;display:flex;align-items:center;justify-content:center;"><span style="font-size:11px;color:var(--muted);text-align:center;padding:4px;">No image<br>this run</span></div>';

        var sizeLabel = slot.sizeKb != null ? (slot.sizeKb >= 1000 ? (slot.sizeKb/1024).toFixed(1) + ' MB' : slot.sizeKb + ' KB') : '';

        return '<div style="flex:1;min-width:0;">' +
          imgHtml +
          '<div style="font-size:11px;font-weight:600;color:var(--ink-2);text-align:center;margin-top:4px;">' + slot.label + '</div>' +
          (sizeLabel ? '<div style="font-size:10px;color:var(--muted);text-align:center;">' + sizeLabel + '</div>' : '') +
          '<div style="display:flex;gap:4px;justify-content:center;margin-top:4px;">' +
            '<button class="cc-toggle-btn" data-row="' + idx + '" data-slot="' + slotIdx + '" data-val="working" style="flex:1;padding:4px;border-radius:5px;border:1px solid var(--line);background:transparent;cursor:pointer;font-size:11px;">✅</button>' +
            '<button class="cc-toggle-btn" data-row="' + idx + '" data-slot="' + slotIdx + '" data-val="not_working" style="flex:1;padding:4px;border-radius:5px;border:1px solid var(--line);background:transparent;cursor:pointer;font-size:11px;">❌</button>' +
          '</div>' +
        '</div>';
      }).join('');

      var systemDown = r.systemDown === true;

      return '<div class="card" data-row="' + idx + '" style="' + (systemDown ? 'border-color:var(--danger);background:rgba(239,68,68,0.04);' : '') + '">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">' +
          '<div>' +
            '<div style="font-size:14px;font-weight:700;">' + (v.name || '—') + ' <span style="font-size:11px;font-weight:400;color:var(--muted);">— ' + camModel + ' (' + slots + ' slots)</span></div>' +
            '<div style="font-size:11px;color:var(--muted);font-family:monospace;">' + (cam.imei || cam.name || '—') + '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:14px;">' +
            '<div style="text-align:right;">' +
              '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;font-weight:700;">Last Comms</div>' +
              '<div style="font-size:12px;font-weight:600;color:' + lastCommsColor + ';">' + lastCommsText + '</div>' +
            '</div>' +
            '<button class="cc-system-down-btn" data-row="' + idx + '" style="height:32px;padding:0 12px;border-radius:7px;border:1px solid ' + (systemDown ? 'var(--danger)' : 'var(--line)') + ';background:' + (systemDown ? 'var(--danger)' : 'transparent') + ';color:' + (systemDown ? '#fff' : 'var(--ink)') + ';font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">' +
              (systemDown ? '⚠ System Down' : 'Mark System Down') +
            '</button>' +
          '</div>' +
        '</div>' +
        (systemDown
          ? '<div style="padding:14px;background:var(--surface-2);border-radius:8px;text-align:center;font-size:13px;color:var(--danger);font-weight:600;">Camera system flagged as not functioning — no data for an extended period.</div>'
          : '<div style="display:flex;gap:10px;">' + slotCells + '</div>') +
      '</div>';
    }).join('');

    // Wire system-down buttons
    container.querySelectorAll('.cc-system-down-btn').forEach(function(btn) {
      btn.onclick = function() {
        var row = parseInt(btn.dataset.row, 10);
        state.results[row].systemDown = !state.results[row].systemDown;
        renderResults();
        updateSummary();
      };
    });

    // Wire toggle buttons
    container.querySelectorAll('.cc-toggle-btn').forEach(function(btn) {
      btn.onclick = function() {
        var row  = parseInt(btn.dataset.row, 10);
        var slot = parseInt(btn.dataset.slot, 10);
        var val  = btn.dataset.val;
        state.results[row].slots[slot].status = val;

        // Update button styles in this slot group
        var group = btn.parentElement;
        group.querySelectorAll('.cc-toggle-btn').forEach(function(b) {
          var active = b.dataset.val === val;
          b.style.background = active ? (val === 'working' ? 'var(--green-100)' : 'var(--danger-100,#fee2e2)') : 'transparent';
          b.style.borderColor = active ? (val === 'working' ? 'var(--green-600)' : 'var(--danger)') : 'var(--line)';
        });

        updateSummary();
      };
    });
  }

  function updateSummary() {
    var totalAssets = state.results.length;
    var totalSlots  = 0;
    var working     = 0;
    var notWorking  = 0;

    state.results.forEach(function(r) {
      r.slots.forEach(function(s) {
        totalSlots++;
        if (s.status === 'working') working++;
        if (s.status === 'not_working') notWorking++;
      });
    });

    var sumEl = TGE.el('cc-summary');
    if (sumEl) sumEl.style.display = '';
    setText('cc-sum-assets',  totalAssets);
    setText('cc-sum-slots',   totalSlots);
    setText('cc-sum-working', working);
    setText('cc-sum-broken',  notWorking);
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

  function daysAgo(ts) {
    try {
      var diff = Date.now() - new Date(ts).getTime();
      return Math.floor(diff / (1000*60*60*24));
    } catch(e) { return null; }
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

  function statusGlyph(s) {
    if (s === 'working') return 'Working';
    if (s === 'not_working') return 'Not Working';
    return 'Not Reviewed';
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
    var rows = [['Legacy No','IMEI','Camera Model','System Status','Last Comms','Road','Road (KB)','Driver','Driver (KB)','In-Cab','In-Cab (KB)','R.Ext','R.Ext (KB)','L.Ext','L.Ext (KB)','Reviewed By','Date']];
    var user = (TGE.state && TGE.state.user) ? (TGE.state.user.firstName + ' ' + TGE.state.user.lastName) : '';
    state.results.forEach(function(r) {
      var slotStatus = CAMERA_SLOTS.map(function(_, i) {
        var s = r.slots[i];
        return s ? statusGlyph(s.status) : '—';
      });
      var slotSizes = CAMERA_SLOTS.map(function(_, i) {
        var s = r.slots[i];
        return s && s.sizeKb != null ? s.sizeKb : (s ? '' : '—');
      });
      rows.push([
        r.vehicle.name,
        r.camera.imei || r.camera.name,
        r.camera.model && r.camera.model.name,
        r.systemDown ? 'System Down' : 'Operational',
        r.lastComms ? formatTs(r.lastComms) : 'Unknown',
        slotStatus[0], slotSizes[0], slotStatus[1], slotSizes[1], slotStatus[2], slotSizes[2], slotStatus[3], slotSizes[3], slotStatus[4], slotSizes[4],
        user,
        new Date().toLocaleDateString('en-AU'),
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
