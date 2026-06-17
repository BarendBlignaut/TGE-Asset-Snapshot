// TGE Asset Snapshot — Camera Snapshots Page
// public/camera-snapshots.js

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
    running:   false,
    vehicles:  [],   // all vehicles with camera devices
    rows:      [],   // rendered row data
  };

  // ── Render ─────────────────────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-camera-snapshots');
    if (!view) return;

    view.innerHTML = [
      '<div class="hero">',
        '<div class="hero-kicker">Camera</div>',
        '<div class="hero-title">Camera Snapshots</div>',
        '<div class="hero-sub">Latest snapshot images for all active camera-equipped assets.</div>',
        '<div class="hero-bar">',
          '<div class="hero-bar-left">',
            '<button class="hero-run-btn" id="cam-run-btn" type="button">Run</button>',
            '<button class="hero-action-btn" id="cam-sel-all-btn" type="button" style="display:none;">Select All</button>',
            '<button class="hero-action-btn" id="cam-desel-btn" type="button" style="display:none;">Deselect All</button>',
          '</div>',
          '<div class="hero-bar-right">',
            '<div class="hero-divider"></div>',
            TGE.can('camera-snapshots','export-pdf')       ? '<button class="hero-export-btn" id="cam-pdf-btn">PDF</button>'       : '',
            TGE.can('camera-snapshots','export-email-pdf') ? '<button class="hero-export-btn" id="cam-email-btn">Email PDF</button>': '',
            TGE.can('camera-snapshots','export-csv')       ? '<button class="hero-export-btn" id="cam-csv-btn">CSV</button>'       : '',
            TGE.can('camera-snapshots','export-xlsx')      ? '<button class="hero-export-btn" id="cam-xlsx-btn">XLSX</button>'     : '',
            TGE.can('camera-snapshots','export-json')      ? '<button class="hero-export-btn" id="cam-json-btn">JSON</button>'     : '',
          '</div>',
        '</div>',
        '<p class="hero-message" id="cam-message"></p>',
      '</div>',

      // Empty state
      '<div id="cam-empty" class="card" style="text-align:center;padding:48px 20px;">',
        '<div style="font-size:40px;margin-bottom:12px;opacity:0.3;">📷</div>',
        '<div style="font-size:14px;font-weight:600;color:var(--ink);margin-bottom:6px;">No snapshots loaded</div>',
        '<p style="font-size:13px;color:var(--muted);margin:0;">Click Run to load the latest camera snapshots for all active assets.</p>',
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
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">IMEI</th>',
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
            '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:rgba(212,240,38,0.7);">Snapshot History</div>',
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

    var checkAll = TGE.el('cam-check-all');
    if (checkAll) checkAll.onchange = function() {
      document.querySelectorAll('.cam-row-check').forEach(function(cb) { cb.checked = checkAll.checked; });
    };

    var selAll = TGE.el('cam-sel-all-btn');
    var desel  = TGE.el('cam-desel-btn');
    if (selAll) selAll.onclick = function() { document.querySelectorAll('.cam-row-check').forEach(function(cb){cb.checked=true;}); };
    if (desel)  desel.onclick  = function() { document.querySelectorAll('.cam-row-check').forEach(function(cb){cb.checked=false;}); };

    var histClose = TGE.el('cam-history-close');
    if (histClose) histClose.onclick = closeHistory;
  }

  // ── Run ───────────────────────────────────────────────────────────────────────
  async function runCameraSnapshots() {
    if (state.running) return;
    state.running = true;
    state.rows    = [];
    setMessage('Loading all vehicles...', false);
    setBtnState(true);

    try {
      // Get all vehicles
      var vRes = await TGE.api('GET', '/api/tn360/v1/vehicles?pruning=B2B');
      if (!vRes.ok) throw new Error('Vehicle lookup failed');
      var vehicles = Array.isArray(vRes.data) ? vRes.data : [];
      vehicles = vehicles.filter(function(v) { return v.status === 'ENABLED'; });

      setMessage('Found ' + vehicles.length + ' vehicles — loading camera devices...', false);

      // Get devices for all vehicles in batches
      var cameraVehicles = [];
      var batchSize = 10;
      for (var i = 0; i < vehicles.length; i += batchSize) {
        var batch = vehicles.slice(i, i + batchSize);
        var results = await Promise.all(batch.map(function(v) {
          return TGE.api('GET', '/api/tn360/v1/vehicles/' + v.id + '/devices?pruning=B2B')
            .then(function(r) {
              if (!r.ok) return null;
              var devices = Array.isArray(r.data) ? r.data : [];
              var camDev  = devices.find(function(d) {
                return d.type && d.type.code === 'CAMERA' && !d.outServiceAt && d.vehicleId;
              });
              if (!camDev) return null;
              return { vehicle: v, camera: camDev };
            }).catch(function() { return null; });
        }));
        results.forEach(function(r) { if (r) cameraVehicles.push(r); });
        setMessage('Checking devices... ' + Math.min(i + batchSize, vehicles.length) + '/' + vehicles.length, false);
      }

      setMessage('Found ' + cameraVehicles.length + ' camera assets — loading snapshots...', false);

      // Render empty rows first
      showResults();
      renderRows(cameraVehicles, {});

      // Load snapshots for all camera vehicles
      var snapshotMap = {};
      await Promise.all(cameraVehicles.map(function(cv) {
        return TGE.api('GET', '/api/tn360/v1/events?pruning=B2B&types=camera&vehicle_ids=' + cv.vehicle.id)
          .then(function(r) {
            if (!r.ok) return;
            var events = Array.isArray(r.data) ? r.data : [];
            var available = events.filter(function(e) {
              return e.attributes && e.attributes.status === 'available';
            });
            if (!available.length) return;
            available.sort(function(a,b) { return new Date(b.timeAt) - new Date(a.timeAt); });
            var latest = available[0];
            snapshotMap[cv.vehicle.id] = latest;

            // Save to D1 history
            TGE.api('POST', '/api/camera-history/' + cv.vehicle.id, {
              eventId:      String(latest.id),
              capturedAt:   latest.timeAt,
              snapshotData: latest.attributes.context,
            }).catch(function(){});
          }).catch(function(){});
      }));

      renderRows(cameraVehicles, snapshotMap);
      setMessage('');
      activateControls();

    } catch(e) {
      setMessage(e.message || 'Failed to load camera snapshots.', true);
    } finally {
      state.running = false;
      setBtnState(false);
    }
  }

  // ── Render rows ───────────────────────────────────────────────────────────────
  function renderRows(cameraVehicles, snapshotMap) {
    var tbody = TGE.el('cam-tbody');
    if (!tbody) return;

    tbody.innerHTML = cameraVehicles.map(function(cv, idx) {
      var v       = cv.vehicle;
      var cam     = cv.camera;
      var snap    = snapshotMap[v.id];
      var slots   = cam.model && cam.model.name === 'MultiIQ' ? 5 : 2;
      var typeName = v.type && v.type.name ? v.type.name : '—';

      // Parse media files
      var mediaFiles = [];
      if (snap) {
        try {
          var ctx = JSON.parse(snap.attributes.context);
          if (ctx && ctx.response && ctx.response.mediaFiles) mediaFiles = ctx.response.mediaFiles;
        } catch(e) {}
      }

      // Build image cells
      var imgCells = CAMERA_SLOTS.map(function(slot, slotIdx) {
        if (slotIdx >= slots) {
          return '<td style="padding:6px;text-align:center;"><span style="font-size:10px;color:var(--muted-2);">—</span></td>';
        }
        var file = null;
        if (slot.source === 'MDVR') {
          file = mediaFiles.find(function(f) {
            return f.source === 'MDVR' &&
                   f.imageDetails && f.imageDetails.sources &&
                   f.imageDetails.sources.some(function(s) { return slot.sources.indexOf(s) !== -1; }) &&
                   f.status === 'FINISHED';
          });
        } else {
          file = mediaFiles.find(function(f) { return f.source === slot.source && f.status === 'FINISHED'; });
        }

        if (!file || !file.mediaFile) {
          return '<td style="padding:6px;text-align:center;"><div style="width:120px;height:80px;background:var(--surface-2);border:1px solid var(--line);border-radius:6px;display:flex;align-items:center;justify-content:center;margin:0 auto;"><span style="font-size:10px;color:var(--muted);">No image</span></div></td>';
        }

        return '<td style="padding:6px;text-align:center;">' +
          '<img src="/api/image-proxy?url=' + encodeURIComponent(file.mediaFile) + '" ' +
          'style="width:120px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--line);display:block;margin:0 auto;cursor:pointer;" ' +
          'onerror="this.parentElement.innerHTML=\'<div style=&quot;width:120px;height:80px;background:var(--surface-2);border:1px solid var(--line);border-radius:6px;display:flex;align-items:center;justify-content:center;margin:0 auto;&quot;><span style=&quot;font-size:10px;color:var(--muted);&quot;>Unavailable</span></div>\'" ' +
          'alt="' + slot.label + '" /></td>';
      }).join('');

      var capturedAt = snap ? formatTs(snap.timeAt) : '<span style="color:var(--muted);font-size:11px;">No snapshot</span>';

      return '<tr style="border-bottom:1px solid var(--line-2);cursor:pointer;" id="cam-row-' + idx + '" onclick="TGE.camOpenHistory(' + v.id + ',\'' + v.name + '\')">' +
        '<td style="padding:8px 12px;" onclick="event.stopPropagation();">' +
          '<input type="checkbox" class="cam-row-check" data-vid="' + v.id + '" style="width:15px;height:15px;cursor:pointer;" />' +
        '</td>' +
        '<td style="padding:8px 12px;white-space:nowrap;">' +
          '<div style="font-weight:700;font-size:13px;">' + (v.name || '—') + '</div>' +
          '<div style="font-size:10px;color:var(--muted);font-family:monospace;">' + (cam.imei || '—') + '</div>' +
        '</td>' +
        '<td style="padding:8px 12px;font-size:12px;white-space:nowrap;">' + typeName + '</td>' +
        '<td style="padding:8px 12px;font-size:11px;font-family:monospace;color:var(--muted);">' + (cam.model && cam.model.name || '—') + '</td>' +
        imgCells +
        '<td style="padding:8px 12px;font-size:11px;white-space:nowrap;">' + capturedAt + '</td>' +
      '</tr>';
    }).join('');

    // Hover effect
    document.querySelectorAll('#cam-tbody tr').forEach(function(row) {
      row.addEventListener('mouseover', function() { this.style.background = 'var(--surface-2)'; });
      row.addEventListener('mouseout',  function() { this.style.background = ''; });
    });
  }

  // ── History panel ─────────────────────────────────────────────────────────────
  TGE.camOpenHistory = async function(vehicleId, vehicleName) {
    var panel = TGE.el('cam-history-panel');
    var body  = TGE.el('cam-history-body');
    var title = TGE.el('cam-history-title');

    if (title) title.textContent = vehicleName + ' — Last 30 Snapshots';
    if (body)  body.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px;">Loading history...</div>';
    if (panel) panel.style.display = 'flex';

    try {
      var r = await TGE.api('GET', '/api/camera-history/' + vehicleId);
      if (!r.ok) throw new Error('Failed to load history');
      var history = Array.isArray(r.data) ? r.data : [];

      if (!history.length) {
        body.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px;">No snapshot history yet — run the page to load snapshots.</div>';
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
              return f.source === 'MDVR' &&
                     f.imageDetails && f.imageDetails.sources &&
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
            'onerror="this.style.display=\'none\'" alt="' + slot.label + '" />' +
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

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function showResults() {
    TGE.hide('cam-empty');
    TGE.show('cam-results');
  }

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
    ['cam-sel-all-btn','cam-desel-btn'].forEach(function(id) {
      var el = TGE.el(id);
      if (el) el.style.display = '';
    });
    ['cam-pdf-btn','cam-email-btn','cam-csv-btn','cam-xlsx-btn','cam-json-btn'].forEach(function(id) {
      var el = TGE.el(id);
      if (el) el.classList.add('active');
    });
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

  // ── Register ──────────────────────────────────────────────────────────────────
  var _orig = TGE.onAppReady;
  TGE.onAppReady = function () {
    if (typeof _orig === 'function') _orig();
    render();
  };

  TGE.onShow['camera-snapshots'] = function() {};

})();
