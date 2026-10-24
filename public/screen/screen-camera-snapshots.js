// TGE Asset Snapshot — Camera Snapshots Page
// public/camera-snapshots.js

(function () {
  'use strict';

  var CAMERA_SLOTS = [
    { id:'road',   label:'Road Facing',   source:'ROAD_FACING',  sources:['ROAD']   },
    { id:'driver', label:'Driver Facing', source:'DRIVER_FACING',sources:['DRIVER'] },
    { id:'incab',  label:'In-Cab Driver', source:'MDVR',         sources:['UVC']    },
    { id:'ext1',   label:'Right External',source:'MDVR',         sources:['TVI2']   },
    { id:'ext2',   label:'Left External', source:'MDVR',         sources:['TVI1']   },
  ];

  var state = {
    running: false,
    mode:    'user',
    rows:    [],
  };

  // Set at render time after permissions load
  var userLimit = 500;
  var canUser   = false;
  var canFleet  = false;

  // ── Render ─────────────────────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-camera-snapshots');
    if (!view) return;

    // Evaluate permissions now (session is loaded)
    userLimit = TGE.limit('camera-snapshots', 'user-mode') || 500;
    canUser   = TGE.can('camera-snapshots', 'user-mode');
    canFleet  = TGE.can('camera-snapshots', 'fleet-mode');

    // Default mode
    state.mode = canUser ? 'user' : 'fleet';

    view.innerHTML = [
      '<div class="hero">',
        '<div class="hero-kicker">Camera</div>',
        '<div class="hero-title">Camera Snapshots</div>',
        '<div class="hero-sub">Load latest camera images by IMEI or full fleet.</div>',
        '<div class="hero-bar">',
          '<div class="hero-bar-left">',
            canUser  ? '<button class="hero-mode-btn' + (state.mode==='user'?' active':'') + '" id="cam-mode-user" type="button">User Mode</button>' : '',
            canFleet ? '<button class="hero-mode-btn' + (state.mode==='fleet'?' active':'') + '" id="cam-mode-fleet" type="button">Fleet Mode</button>' : '',
            '<button class="hero-run-btn" id="cam-run-btn" type="button">Run</button>',
            '<button class="hero-action-btn" id="cam-sel-all-btn" type="button" style="display:none;">Select All</button>',
            '<button class="hero-action-btn" id="cam-desel-btn" type="button" style="display:none;">Deselect All</button>',
            '<button class="hero-action-btn" id="cam-email-selected-btn" type="button" style="display:none;">✉ Email Selected</button>',
          '</div>',
          '<div class="hero-bar-right">',
            '<div class="hero-divider"></div>',
            TGE.can('camera-snapshots','export-pdf')       ? '<button class="hero-export-btn" id="cam-pdf-btn">PDF</button>'        : '',
            TGE.can('camera-snapshots','export-email-pdf') ? '<button class="hero-export-btn" id="cam-email-btn">Email PDF</button>' : '',
            TGE.can('camera-snapshots','export-csv')       ? '<button class="hero-export-btn" id="cam-csv-btn">CSV</button>'        : '',
            TGE.can('camera-snapshots','export-xlsx')      ? '<button class="hero-export-btn" id="cam-xlsx-btn">XLSX</button>'      : '',
            TGE.can('camera-snapshots','export-json')      ? '<button class="hero-export-btn" id="cam-json-btn">JSON</button>'      : '',
          '</div>',
        '</div>',
        '<p class="hero-message" id="cam-message"></p>',
      '</div>',

      // User mode IMEI input (shown when user mode active)
      '<div id="cam-user-input" class="card" style="' + (state.mode==='user' && canUser ? '' : 'display:none;') + '">',
        '<div class="card-kicker">User Mode — IMEI Input</div>',
        '<div class="card-title">Enter Camera IMEIs</div>',
        '<p style="font-size:13px;color:var(--muted);margin-bottom:10px;">Enter one IMEI per line. Maximum ' + userLimit + ' devices.</p>',
        '<textarea id="cam-imei-input" rows="6" placeholder="867734081081214&#10;867734081112373&#10;869409067001548" ',
          'style="width:100%;font-family:monospace;font-size:12px;border:1px solid var(--line);border-radius:8px;padding:10px;resize:vertical;background:var(--surface);color:var(--ink);"></textarea>',
        '<p id="cam-imei-count" style="font-size:12px;color:var(--muted);margin-top:6px;">0 IMEIs entered</p>',
      '</div>',

      // Empty state
      '<div id="cam-empty" class="card" style="text-align:center;padding:48px 20px;">',
        '<div style="font-size:40px;margin-bottom:12px;opacity:0.3;">📷</div>',
        '<div style="font-size:14px;font-weight:600;color:var(--ink);margin-bottom:6px;">No snapshots loaded</div>',
        '<p style="font-size:13px;color:var(--muted);margin:0;">',
          canUser  ? 'Enter IMEIs above and click Run, ' : '',
          canFleet ? 'or select Fleet Mode and click Run.' : '',
        '</p>',
      '</div>',

      // Results table
      '<div id="cam-results" style="display:none;">',
        '<div class="card" style="padding:0;overflow:hidden;">',
          '<div style="overflow-x:auto;">',
            '<table id="cam-table" style="width:100%;border-collapse:collapse;min-width:900px;">',
              '<thead>',
                '<tr style="background:var(--surface-2);border-bottom:2px solid var(--line);">',
                  '<th style="padding:10px 12px;width:36px;"><input type="checkbox" id="cam-check-all" style="width:15px;height:15px;cursor:pointer;" /></th>',
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);white-space:nowrap;">Legacy No</th>',
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">Type</th>',
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">Camera</th>',
                  '<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">Road</th>',
                  '<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">Driver</th>',
                  '<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">In-Cab</th>',
                  '<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">R.Ext</th>',
                  '<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">L.Ext</th>',
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">Captured</th>',
                '</tr>',
              '</thead>',
              '<tbody id="cam-tbody"></tbody>',
            '</table>',
          '</div>',
        '</div>',
      '</div>',

      // History slide-up panel
      '<div id="cam-history-panel" style="display:none;position:fixed;bottom:0;left:0;right:0;height:88vh;background:var(--surface);border-top:3px solid var(--green-600);z-index:400;flex-direction:column;box-shadow:0 -8px 32px rgba(0,0,0,0.2);">',
        '<div style="padding:14px 20px;background:var(--green-900);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">',
          '<div>',
            '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:rgba(212,240,38,0.7);">Snapshot History — Last 30</div>',
            '<div style="font-size:15px;font-weight:700;color:#fff;" id="cam-history-title">—</div>',
          '</div>',
          '<button id="cam-history-close" style="border:none;background:rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:16px;cursor:pointer;width:30px;height:30px;">✕</button>',
        '</div>',
        '<div style="flex:1;overflow-y:auto;padding:16px;" id="cam-history-body">',
          '<div style="text-align:center;color:var(--muted);padding:40px;">Loading history...</div>',
        '</div>',
      '</div>',

    ].join('');

    wireEvents();
  }

  // ── Wire events ───────────────────────────────────────────────────────────────
  function wireEvents() {
    TGE.on('cam-run-btn', 'click', runCameraSnapshots);

    // Mode buttons
    var userBtn  = TGE.el('cam-mode-user');
    var fleetBtn = TGE.el('cam-mode-fleet');
    if (userBtn) userBtn.onclick = function() { setMode('user'); };
    if (fleetBtn) fleetBtn.onclick = function() { setMode('fleet'); };

    // IMEI counter
    var imeiInput = TGE.el('cam-imei-input');
    if (imeiInput) imeiInput.addEventListener('input', updateImeiCount);

    // Select all checkbox
    var checkAll = TGE.el('cam-check-all');
    if (checkAll) checkAll.onchange = function() {
      document.querySelectorAll('.cam-row-check').forEach(function(cb) { cb.checked = checkAll.checked; });
    };

    TGE.on('cam-sel-all-btn', 'click', function() { document.querySelectorAll('.cam-row-check').forEach(function(cb){cb.checked=true;}); });
    TGE.on('cam-desel-btn',   'click', function() { document.querySelectorAll('.cam-row-check').forEach(function(cb){cb.checked=false;}); });

    var histClose = TGE.el('cam-history-close');
    if (histClose) histClose.onclick = closeHistory;
  }

  function setMode(mode) {
    state.mode = mode;
    var userBtn   = TGE.el('cam-mode-user');
    var fleetBtn  = TGE.el('cam-mode-fleet');
    var userInput = TGE.el('cam-user-input');
    if (userBtn)   userBtn.classList.toggle('active',  mode === 'user');
    if (fleetBtn)  fleetBtn.classList.toggle('active', mode === 'fleet');
    if (userInput) userInput.style.display = mode === 'user' ? '' : 'none';
  }

  function updateImeiCount() {
    var input = TGE.el('cam-imei-input');
    var count = TGE.el('cam-imei-count');
    if (!input || !count) return;
    var imeis = parseImeis(input.value);
    var over  = imeis.length > userLimit;
    count.textContent = imeis.length + ' IMEI' + (imeis.length !== 1 ? 's' : '') + ' entered' +
      (over ? ' — max ' + userLimit + ' allowed' : '');
    count.style.color = over ? 'var(--danger)' : 'var(--muted)';
  }

  function parseImeis(raw) {
    return raw.split(/[\n,\s]+/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 5; });
  }

  // ── Run ───────────────────────────────────────────────────────────────────────
  async function runCameraSnapshots() {
    if (state.running) return;

    var imeis = [];
    if (state.mode === 'user') {
      var input = TGE.el('cam-imei-input');
      imeis = parseImeis(input ? input.value : '');
      if (!imeis.length) { setMessage('Enter at least one IMEI.', true); return; }
      if (imeis.length > userLimit) { setMessage('Maximum ' + userLimit + ' IMEIs allowed.', true); return; }
    }

    state.running = true;
    state.rows    = [];
    setMessage('Loading...', false);
    setBtnState(true);

    try {
      var cameraDevices = [];

      if (state.mode === 'fleet') {
        // Fleet mode — get all vehicles then find camera devices
        setMessage('Loading all vehicles...', false);
        var vRes = await TGE.api('GET', '/api/tn360/v1/vehicles?pruning=B2B');
        if (!vRes.ok) throw new Error('Vehicle lookup failed');
        var vehicles = (Array.isArray(vRes.data) ? vRes.data : []).filter(function(v) { return v.status === 'ENABLED'; });

        setMessage('Checking ' + vehicles.length + ' vehicles for camera devices...', false);
        var checked = 0;
        var allResults = await batchRun(vehicles, function(v) {
          return TGE.api('GET', '/api/tn360/v1/vehicles/' + v.id + '/devices?pruning=B2B')
            .then(function(r) {
              checked++;
              if (checked % 10 === 0) setMessage('Checking devices... ' + checked + '/' + vehicles.length, false);
              if (!r.ok) return null;
              var devices = Array.isArray(r.data) ? r.data : [];
              var camDev  = devices.find(function(d) {
                return d.type && d.type.code === 'CAMERA' && d.vehicleId;
              });
              if (!camDev) return null;
              return { vehicle: v, camera: camDev };
            }).catch(function() { return null; });
        }, 5, 300);
        allResults.forEach(function(r) { if (r) cameraDevices.push(r); });

      } else {
        // User mode — look up each IMEI directly
        setMessage('Looking up ' + imeis.length + ' camera device' + (imeis.length!==1?'s':'') + '...', false);
        var results = await Promise.all(imeis.map(function(imei) {
          return TGE.api('GET', '/api/tn360/v1/devices/' + imei + '?pruning=B2B&embed=devicestats')
            .then(function(r) {
              if (!r.ok) return null;
              var d = r.data;
              if (!d.vehicleId) return null; // no vehicle assigned
              if (d.outServiceAt) return null; // out of service
              if (!d.type || d.type.code !== 'CAMERA') return null; // not a camera
              // Build a minimal vehicle object from device data
              var vehicle = { id: d.vehicleId, name: '—', type: { name: '—' }, status: 'ENABLED' };
              return { vehicle: vehicle, camera: d, needsVehicle: true };
            }).catch(function() { return null; });
        }));
        results.forEach(function(r) { if (r) cameraDevices.push(r); });

        // Fetch vehicle details for user mode results
        await Promise.all(cameraDevices.map(function(cd) {
          if (!cd.needsVehicle) return;
          return TGE.api('GET', '/api/tn360/v1/vehicles?pruning=B2B')
            .then(function(r) {
              if (!r.ok) return;
              var vehicles = Array.isArray(r.data) ? r.data : [];
              var v = vehicles.find(function(v) { return v.id === cd.vehicle.id; });
              if (v) { cd.vehicle = v; }
            }).catch(function(){});
        }));
      }

      if (!cameraDevices.length) throw new Error('No active camera devices found.');

      setMessage('Found ' + cameraDevices.length + ' camera device' + (cameraDevices.length!==1?'s':'') + ' — loading snapshots...', false);

      // Show empty table while loading
      showResults();
      renderRows(cameraDevices, {});

      // Load snapshots in batches of 5 with 500ms delay to avoid rate limiting
      var snapshotMap = {};
      var done = 0;
      await batchRun(cameraDevices, function(cv) {
        return TGE.api('GET', '/api/tn360/v1/events?pruning=B2B&types=camera&vehicle_ids=' + cv.vehicle.id)
          .then(function(r) {
            done++;
            setMessage('Loading snapshots... ' + done + '/' + cameraDevices.length, false);
            if (!r.ok) return;
            var events    = Array.isArray(r.data) ? r.data : [];
            var available = events.filter(function(e) { return e.attributes && e.attributes.status === 'available'; });
            if (!available.length) return;
            available.sort(function(a,b) { return new Date(b.timeAt) - new Date(a.timeAt); });
            var latest = available[0];
            snapshotMap[cv.vehicle.id] = latest;
            TGE.api('POST', '/api/camera-history/' + cv.vehicle.id, {
              eventId:      String(latest.id),
              capturedAt:   latest.timeAt,
              snapshotData: latest.attributes.context,
            }).catch(function(){});
          }).catch(function(){});
      }, 5, 500);

      renderRows(cameraDevices, snapshotMap);
      setMessage('');
      activateControls();

    } catch(e) {
      setMessage(e.message || 'Failed to load snapshots.', true);
    } finally {
      state.running = false;
      setBtnState(false);
    }
  }

  // ── Render rows ───────────────────────────────────────────────────────────────
  function renderRows(cameraDevices, snapshotMap) {
    var tbody = TGE.el('cam-tbody');
    if (!tbody) return;
    // Store for export
    state.rows = cameraDevices.map(function(cv) {
      return { vehicle: cv.vehicle, camera: cv.camera, capturedAt: snapshotMap[cv.vehicle.id] ? snapshotMap[cv.vehicle.id].timeAt : null };
    });

    tbody.innerHTML = cameraDevices.map(function(cv, idx) {
      var v        = cv.vehicle;
      var cam      = cv.camera;
      var snap     = snapshotMap[v.id];
      var slots    = cam.model && cam.model.name === 'MultiIQ' ? 5 : 2;
      var typeName = v.type && v.type.name ? v.type.name : '—';
      var camModel = cam.model && cam.model.name ? cam.model.name : '—';

      var mediaFiles = [];
      if (snap) {
        try {
          var ctx = JSON.parse(snap.attributes.context);
          if (ctx && ctx.response && ctx.response.mediaFiles) mediaFiles = ctx.response.mediaFiles;
        } catch(e) {}
      }

      var imgCells = CAMERA_SLOTS.map(function(slot, slotIdx) {
        if (slotIdx >= slots) {
          return '<td style="padding:6px 8px;text-align:center;"><span style="font-size:10px;color:var(--muted-2);">—</span></td>';
        }
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
          return '<td style="padding:6px 8px;text-align:center;">' +
            '<div style="width:110px;height:75px;background:var(--surface-2);border:1px solid var(--line);border-radius:6px;display:flex;align-items:center;justify-content:center;margin:0 auto;">' +
              '<span style="font-size:10px;color:var(--muted);">No image</span>' +
            '</div></td>';
        }
        return '<td style="padding:6px 8px;text-align:center;">' +
          '<img src="/api/image-proxy?url=' + encodeURIComponent(file.mediaFile) + '" ' +
          'style="width:110px;height:75px;object-fit:cover;border-radius:6px;border:1px solid var(--line);display:block;margin:0 auto;" ' +
          'onerror="this.parentElement.innerHTML=\'<div style=&quot;width:110px;height:75px;background:var(--surface-2);border:1px solid var(--line);border-radius:6px;display:flex;align-items:center;justify-content:center;margin:0 auto;&quot;><span style=&quot;font-size:10px;color:var(--muted);&quot;>Unavailable</span></div>\'" ' +
          'alt="' + slot.label + '" /></td>';
      }).join('');

      var capturedAt = snap ? formatTs(snap.timeAt) : '<span style="font-size:11px;color:var(--muted);">No snapshot</span>';

      return '<tr style="border-bottom:1px solid var(--line-2);" ' +
        'onmouseover="this.style.background=\'var(--surface-2)\'" ' +
        'onmouseout="this.style.background=\'\'" ' +
        'onclick="TGE.camOpenHistory(' + v.id + ',\'' + (v.name||'—') + '\')">' +
        '<td style="padding:8px 12px;" onclick="event.stopPropagation();">' +
          '<input type="checkbox" class="cam-row-check" data-vid="' + v.id + '" style="width:15px;height:15px;cursor:pointer;" />' +
        '</td>' +
        '<td style="padding:8px 12px;white-space:nowrap;">' +
          '<div style="font-weight:700;font-size:13px;">' + (v.name || '—') + '</div>' +
          '<div style="font-size:10px;color:var(--muted);font-family:monospace;">' + (cam.imei || cam.name || '—') + '</div>' +
        '</td>' +
        '<td style="padding:8px 12px;font-size:12px;white-space:nowrap;">' + typeName + '</td>' +
        '<td style="padding:8px 12px;font-size:12px;">' + camModel + '</td>' +
        imgCells +
        '<td style="padding:8px 12px;font-size:11px;white-space:nowrap;">' + capturedAt + '</td>' +
      '</tr>';
    }).join('');
  }

  // ── History panel ─────────────────────────────────────────────────────────────
  TGE.camOpenHistory = async function(vehicleId, vehicleName) {
    var panel = TGE.el('cam-history-panel');
    var body  = TGE.el('cam-history-body');
    var title = TGE.el('cam-history-title');
    if (title) title.textContent = vehicleName + ' — Last 30 Snapshots';
    if (body)  body.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px;">Loading...</div>';
    if (panel) panel.style.display = 'flex';

    try {
      var r = await TGE.api('GET', '/api/camera-history/' + vehicleId);
      if (!r.ok) throw new Error('Failed to load history');
      var history = Array.isArray(r.data) ? r.data : [];

      if (!history.length) {
        body.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px;">No snapshot history yet.</div>';
        return;
      }

      body.innerHTML = history.map(function(h) {
        var mediaFiles = [];
        try {
          var ctx = JSON.parse(h.snapshot_data || '{}');
          if (ctx && ctx.response && ctx.response.mediaFiles) mediaFiles = ctx.response.mediaFiles;
        } catch(e) {}

        var imgs = CAMERA_SLOTS.map(function(slot) {
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
            return '<div style="flex:1;min-width:0;">' +
              '<div style="aspect-ratio:16/9;background:var(--surface-2);border:1px solid var(--line);border-radius:6px;display:flex;align-items:center;justify-content:center;">' +
                '<span style="font-size:10px;color:var(--muted);">No image</span>' +
              '</div>' +
              '<div style="font-size:10px;color:var(--muted);text-align:center;margin-top:3px;">' + slot.label + '</div>' +
            '</div>';
          }
          return '<div style="flex:1;min-width:0;">' +
            '<img src="/api/image-proxy?url=' + encodeURIComponent(file.mediaFile) + '" ' +
            'style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;border:1px solid var(--line);display:block;" ' +
            'alt="' + slot.label + '" />' +
            '<div style="font-size:10px;color:var(--muted);text-align:center;margin-top:3px;">' + slot.label + '</div>' +
          '</div>';
        }).join('');

        return '<div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--line-2);">' +
          '<div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px;">' + formatTs(h.captured_at) + '</div>' +
          '<div style="display:flex;gap:8px;">' + imgs + '</div>' +
        '</div>';
      }).join('');

    } catch(e) {
      if (body) body.innerHTML = '<div style="text-align:center;color:var(--danger);padding:40px;">' + e.message + '</div>';
    }
  };

  function closeHistory() {
    var panel = TGE.el('cam-history-panel');
    if (panel) panel.style.display = 'none';
  }

  // ── Email selected rows ─────────────────────────────────────────────────────
  function openEmailForSelected() {
    var checked = Array.prototype.slice.call(document.querySelectorAll('.cam-row-check:checked'));
    if (!checked.length) { setMessage('Select at least one row first.', true); return; }

    var vids = checked.map(function(cb) { return cb.dataset.vid; });
    var rows = state.rows.filter(function(r) { return vids.indexOf(String(r.vehicle.id)) !== -1; });

    var emailRows = rows.map(function(r) {
      var slotCount = r.camera.model && r.camera.model.name === 'MultiIQ' ? 5 : 2;
      var slotLabels = ['Road','Driver','In-Cab','R.Ext','L.Ext'];

      // Camera Snapshots doesn't do pass/fail review (that's Camera Count) —
      // any slot with a real captured image is shown as 'working' so the
      // standard status table still has something meaningful to display.
      var rowEl = document.querySelector('tr[onclick*="' + r.vehicle.id + '"]');
      var imgUrls = [];
      if (rowEl) {
        rowEl.querySelectorAll('img').forEach(function(img) {
          // Pull the RAW TN360/S3 url back out of our proxy src, since the
          // email/PDF must use the direct TN360 link (no login, ~7 day validity).
          var src = img.src;
          var marker = '/api/image-proxy?url=';
          var idx = src.indexOf(marker);
          imgUrls.push(idx !== -1 ? decodeURIComponent(src.slice(idx + marker.length)) : src);
        });
      }

      var slots = [];
      for (var i = 0; i < 5; i++) {
        if (i >= slotCount) { slots.push(null); continue; }
        var url = imgUrls[i] || null;
        slots.push({ label: slotLabels[i], url: url, status: url ? 'working' : null });
      }

      return {
        legacyNo:    r.vehicle.name || '—',
        imei:        r.camera.imei || r.camera.name || '—',
        cameraModel: r.camera.model && r.camera.model.name || '—',
        vehicleType: r.vehicle.type && r.vehicle.type.name || '—',
        capturedAt:  r.capturedAt ? formatTs(r.capturedAt) : 'No snapshot',
        lastComms:   r.capturedAt ? formatTs(r.capturedAt) : 'Unknown',
        systemDown:  false,
        slots:       slots,
      };
    });

    TGE.openEmailComposer({
      rows: emailRows,
      fields: [
        { key:'legacyNo',    label:'Legacy No' },
        { key:'imei',        label:'IMEI' },
        { key:'cameraModel', label:'Camera Model' },
        { key:'vehicleType', label:'Vehicle Type' },
        { key:'capturedAt',  label:'Captured At' },
      ],
      imagesField: null, // images are no longer embedded inline — see PDF attachment + slots[] on each row
      onSent: function() {
        setMessage('Email batch complete.', false);
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function showResults() { TGE.hide('cam-empty'); TGE.show('cam-results'); }

  function setMessage(msg, isError) {
    var el = TGE.el('cam-message');
    if (!el) return;
    el.textContent = msg || '';
    el.className   = 'hero-message' + (isError ? ' error' : '');
  }

  function setBtnState(loading) {
    var btn = TGE.el('cam-run-btn');
    if (btn) { btn.textContent = loading ? 'Loading...' : 'Run'; btn.disabled = loading; }
  }

  function activateControls() {
    ['cam-sel-all-btn','cam-desel-btn','cam-email-selected-btn'].forEach(function(id) {
      var el = TGE.el(id); if (el) el.style.display = '';
    });
    var emailBtn = TGE.el('cam-email-selected-btn');
    if (emailBtn) emailBtn.onclick = openEmailForSelected;
    ['cam-pdf-btn','cam-email-btn','cam-csv-btn','cam-xlsx-btn','cam-json-btn'].forEach(function(id) {
      var el = TGE.el(id); if (el) el.classList.add('active');
    });
    var csvBtn   = TGE.el('cam-csv-btn');
    var jsonBtn  = TGE.el('cam-json-btn');
    var xlsxBtn  = TGE.el('cam-xlsx-btn');
    var pdfBtn   = TGE.el('cam-pdf-btn');
    var emailBtn = TGE.el('cam-email-btn');
    if (csvBtn)   csvBtn.onclick   = exportCsv;
    if (jsonBtn)  jsonBtn.onclick  = exportJson;
    if (xlsxBtn)  xlsxBtn.onclick  = exportCsv;
    if (pdfBtn)   pdfBtn.onclick   = function() { window.print(); };
    if (emailBtn) emailBtn.onclick = function() { alert('Email PDF — coming soon.'); };
  }

  function exportJson() {
    if (!state.rows || !state.rows.length) return;
    var json = JSON.stringify(state.rows, null, 2);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type:'application/json' }));
    a.download = 'camera-snapshots-' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function exportCsv() {
    if (!state.rows || !state.rows.length) return;
    var rows = [['Legacy No','IMEI','Camera Model','Vehicle Type','Captured']];
    state.rows.forEach(function(r) {
      rows.push([r.vehicle.name, r.camera.imei, r.camera.model && r.camera.model.name, r.vehicle.type && r.vehicle.type.name, r.capturedAt || '']);
    });
    var csv = rows.map(function(r) {
      return r.map(function(c) { return '"' + String(c||'').replace(/"/g,'""') + '"'; }).join(',');
    }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }));
    a.download = 'camera-snapshots-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // Throttled batch executor — runs promises in batches with delay between
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

  function formatTs(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('en-AU', {
        timeZone:'Australia/Sydney', day:'2-digit', month:'2-digit', year:'numeric',
        hour:'2-digit', minute:'2-digit', hour12:true
      });
    } catch(e) { return ts; }
  }

  // ── Register ──────────────────────────────────────────────────────────────────
  var _orig = TGE.onAppReady;
  TGE.onAppReady = function () {
    if (typeof _orig === 'function') _orig();
    render();
  };

  TGE.onShow['camera-snapshots'] = function() {};

})();
