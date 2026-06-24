// TGE Asset Snapshot — Snapshot Page
// public/snapshot.js

(function () {
  'use strict';

  var DEVICE = { HERMES:'HERMES', CAMERA:'CAMERA', IFACE:'IFACE', ATRACKER:'ATRACKER' };

  var CAMERA_SLOTS = [
    { id:'road',   label:'Road Facing',    source:'ROAD_FACING',  sources:['ROAD']   },
    { id:'driver', label:'Driver Facing',  source:'DRIVER_FACING',sources:['DRIVER'] },
    { id:'incab',  label:'In-Cab Driver',  source:'MDVR',         sources:['UVC']    },
    { id:'ext1',   label:'Right External', source:'MDVR',         sources:['TVI2']   },
    { id:'ext2',   label:'Left External',  source:'MDVR',         sources:['TVI1']   },
  ];

  var state = {
    running: false,
    asset:   null,
    devices: { hermes:null, camera:null, iface:null, tracker:null },
    data:    defaultData(),
  };

  // ── Alignment test ───────────────────────────────────────────────────────────
  // NOTE: This feature is intentionally frozen/inert. The UI (button, panel,
  // BEFORE/AFTER comparison, Test Procedure steps) stays exactly as-is, but no
  // backend actions run from it, pending the correct trigger process being
  // confirmed with the Teletrac vendor. Do not wire, unwire, or modify any of
  // this code as part of unrelated fixes — revisit only once that process
  // exists.
  var alignState = { running:false, steps:{}, vehicleId:null };

  var ALIGN_STEPS = [
    { id:'step-ign-on',   label:'Confirm ignition ON',           type:'poll-ignition', expect:'ON',  timeout:120 },
    { id:'step-trigger',  label:'Send alignment trigger',         type:'trigger'                                  },
    { id:'step-ign-off',  label:'Confirm ignition OFF',          type:'poll-ignition', expect:'OFF', timeout:120 },
    { id:'step-ign-on2',  label:'Confirm ignition ON (restart)', type:'poll-ignition', expect:'ON',  timeout:120 },
    { id:'step-wait',     label:'Wait 30s for camera to reset',  type:'wait',          seconds:30               },
    { id:'step-snapshot', label:'Pull new camera snapshots',      type:'snapshot'                                },
  ];

  // ── Styles (Standard 1: export dropdown — rounded trigger, yellow icon) ────
  // Injected once per session, the same pattern utilisation.js uses for its
  // own page-specific styles. Reuses the app's existing CSS variables
  // (--green-*, --yellow, --surface, --ink, --muted, --line, --radius) so it
  // matches the established theme rather than introducing new colors.
  function injectStyles() {
    if (document.getElementById('snap-styles')) return;
    var style = document.createElement('style');
    style.id = 'snap-styles';
    style.textContent = [
      '.hero-menu{position:relative;display:inline-flex;}',
      '.hero-menu-trigger{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.10);color:#fff;font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s ease;}',
      '.hero-menu-trigger:hover{background:rgba(255,255,255,0.18);}',
      '.hero-menu-trigger:focus-visible{outline:2px solid var(--yellow,#d4f026);outline-offset:2px;}',
      '.hero-menu-icon{color:var(--yellow,#d4f026);flex-shrink:0;}',
      '.hero-menu-caret{transition:transform 0.15s ease;flex-shrink:0;}',
      '.hero-menu.open .hero-menu-caret{transform:rotate(180deg);}',
      // position:fixed (not absolute) so the panel escapes any ancestor's
      // overflow:hidden (the .hero banner clips its own decorative circle
      // this way) — its exact top/left coordinates are set in JS each time
      // it opens, based on the trigger button's real screen position.
      '.hero-menu-panel{display:none;position:fixed;min-width:200px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:0 12px 32px rgba(0,0,0,0.28);z-index:300;overflow:hidden;padding:6px;}',
      '.hero-menu.open .hero-menu-panel{display:block;}',
      '.hero-menu-item{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;height:36px;padding:0 10px;border:none;background:transparent;border-radius:7px;color:var(--ink);font:inherit;font-size:13px;text-align:left;cursor:pointer;transition:background 0.12s ease;}',
      '.hero-menu-item:hover{background:var(--surface-2);}',
      '.hero-menu-item span:last-child{font-size:11px;color:var(--muted);}',
    ].join('');
    document.head.appendChild(style);
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  function render() {
    injectStyles();
    var view = TGE.el('view-snapshot');
    if (!view) return;

    view.innerHTML = [
      '<div class="hero">',
        '<div class="hero-kicker">Operations</div>',
        '<div class="hero-title">Asset Snapshot</div>',
        '<div class="hero-sub">Enter a fleet number to load current location, metrics, diagnostics and camera evidence.</div>',
        '<div class="hero-bar">',
          '<div class="hero-bar-left">',
            '<input id="snap-fleet-input" type="text" placeholder="Fleet number e.g. 82050" autocomplete="off" style="height:34px;border:1px solid rgba(255,255,255,0.25);border-radius:7px;padding:0 12px;background:rgba(255,255,255,0.10);color:#fff;font:inherit;font-size:13px;min-width:180px;" />',
            '<button class="hero-run-btn" id="snap-run-btn" type="button">Run</button>',
            '<button class="hero-action-btn" id="snap-refresh-btn" type="button" style="display:none;">Refresh</button>',
          '</div>',
          '<div class="hero-bar-right">',
            '<div class="hero-divider"></div>',
            buildExportMenu(),
          '</div>',
        '</div>',
        '<p class="hero-message" id="snap-message"></p>',
      '</div>',

      '<div id="snap-empty" class="card" style="text-align:center;padding:48px 20px;">',
        '<div style="font-size:40px;margin-bottom:12px;opacity:0.3;">🚛</div>',
        '<div style="font-size:14px;font-weight:600;color:var(--ink);margin-bottom:6px;">No asset loaded</div>',
        '<p style="font-size:13px;color:var(--muted);margin:0;">Enter a fleet number above and click Run to load the full asset snapshot.</p>',
      '</div>',

      '<div id="snap-results" style="display:none;">',

        // 1 — Vehicle Info (always shown once a snapshot has run — not device-gated)
        '<div class="card" id="snap-vehicle-card">',
          '<div class="card-kicker">Vehicle Information</div>',
          '<div id="snap-vehicle-title" class="card-title">—</div>',
          '<div class="data-grid data-grid-4" style="margin-bottom:14px;">',
            di('snap-fleet-no',  'Fleet Number'),
            di('snap-rego',      'Registration'),
            di('snap-state',     'State'),
            di('snap-vin',       'VIN'),
            di('snap-make',      'Make'),
            di('snap-model',     'Model'),
            di('snap-year',      'Year'),
            di('snap-veh-type',  'Vehicle Type'),
          '</div>',
          '<div class="data-grid data-grid-3" id="snap-device-cards"></div>',
        '</div>',

        // 2 — Driver (locked layout: always visible, "No data" if iFace absent/empty)
        '<div class="card" id="snap-driver-card">',
          '<div class="card-kicker">Driver</div>',
          '<div class="card-title">Currently Logged In</div>',
          '<div class="data-grid data-grid-4">',
            di('snap-driver-name',    'Driver Name'),
            di('snap-driver-user',    'Username'),
            di('snap-driver-licence', 'Licence Number'),
            di('snap-driver-state',   'Licence State'),
          '</div>',
        '</div>',

        // 3 — Live Status (locked layout: always visible)
        '<div class="card" id="snap-status-card">',
          '<div class="card-kicker">Live Status</div>',
          '<div class="card-title">Current Position &amp; State</div>',
          '<div class="data-grid data-grid-4">',
            di('snap-ignition',  'Ignition'),
            di('snap-movement',  'Movement'),
            di('snap-speed',     'Speed'),
            di('snap-odometer',  'Odometer'),
            di('snap-address',   'Location'),
            di('snap-gps-time',  'Last GPS'),
            di('snap-lat',       'Latitude'),
            di('snap-lng',       'Longitude'),
          '</div>',
        '</div>',

        // 4 — VPM (locked layout: always visible)
        '<div class="card" id="snap-vpm-card">',
          '<div class="card-kicker">Engine Metrics</div>',
          '<div class="card-title">VPM — Last Reading</div>',
          '<div class="data-grid data-grid-4">',
            di('snap-rpm',          'RPM'),
            di('snap-engine-speed', 'Speed (CAN)'),
            di('snap-engine-hrs',   'Engine Hours'),
            di('snap-fuel-total',   'Total Fuel Used'),
            di('snap-oil-temp',     'Oil Temperature'),
            di('snap-oil-press',    'Oil Pressure'),
            di('snap-engine-load',  'Engine Load'),
            di('snap-vpm-time',     'VPM Recorded'),
          '</div>',
        '</div>',

        // 5 — GPIO (locked layout: always visible)
        '<div class="card" id="snap-gpio-card">',
          '<div class="card-kicker">GPIO</div>',
          '<div class="card-title">Input / Output Status</div>',
          '<div class="data-grid data-grid-4" id="snap-gpio-grid">',
            '<div class="data-item" style="color:var(--muted);font-size:12px;grid-column:span 4;">No GPIO data.</div>',
          '</div>',
        '</div>',

        // 6 — Cameras (locked layout: always visible)
        '<div class="card" id="snap-camera-card">',
          '<div class="card-kicker">Evidence</div>',
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">',
            '<div class="card-title" style="margin:0;">Camera Snapshots</div>',
            '<div style="display:flex;gap:8px;">',
            '<button class="btn" id="snap-align-btn" style="height:32px;font-size:12px;background:var(--green-100);color:var(--green-700);border-color:var(--green-600);">⚙ Alignment Test</button>',
            '<button class="btn" id="snap-history-btn" style="height:32px;font-size:12px;">History</button>',
          '</div>',
       '</div>',
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:8px;" id="snap-cam-pre-label">Current Snapshots</div>',
          '<div id="snap-camera-grid" style="display:grid;gap:10px;grid-template-columns:repeat(5,minmax(0,1fr));"></div>',
          '<p id="snap-cam-time" style="margin-top:6px;margin-bottom:16px;font-size:11px;color:var(--muted);"></p>',
          '<div id="snap-cam-post-section" style="display:none;">',
            '<div style="border-top:2px dashed var(--green-600);margin:0 0 16px;"></div>',
            '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--green-600);margin-bottom:8px;">Post Alignment Test</div>',
            '<div id="snap-camera-grid-post" style="display:grid;gap:10px;"></div>',
            '<p id="snap-cam-post-time" style="margin-top:6px;font-size:11px;color:var(--muted);"></p>',
          '</div>',

          // SD Card health (locked layout: always visible)
          '<div style="border-top:1px solid var(--line);margin-top:16px;padding-top:14px;" id="snap-sd-section">',
            '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:8px;">SD Card Health</div>',
            '<div class="data-grid data-grid-3">',
              di('snap-sd1',        'SD Card 1'),
              di('snap-sd2',        'SD Card 2'),
              di('snap-sd-overall', 'Overall Status'),
              di('snap-sd1-size',   'SD Card 1 Size'),
              di('snap-sd2-size',   'SD Card 2 Size'),
            '</div>',
          '</div>',

          // Camera faults (locked layout: always visible)
          '<div style="border-top:1px solid var(--line);margin-top:14px;padding-top:14px;" id="snap-faults-section">',
            '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:8px;">Camera Diagnostics</div>',
            '<div class="data-grid data-grid-3" id="snap-faults-grid">',
              '<div class="data-item" style="color:var(--muted);font-size:12px;grid-column:span 3;">No fault data reported.</div>',
            '</div>',
          '</div>',
        '</div>',

        // 7 — Map (locked layout: always visible)
        '<div class="card" id="snap-map-card">',
          '<div class="card-kicker">Location</div>',
          '<div class="card-title">Last Known Position</div>',
          '<div class="data-grid data-grid-3" style="margin-bottom:12px;">',
            di('snap-map-address', 'Address'),
            di('snap-map-lat',     'Latitude'),
            di('snap-map-lng',     'Longitude'),
          '</div>',
          '<div id="snap-map" style="height:300px;border-radius:var(--radius);overflow:hidden;border:1px solid var(--line);background:var(--surface-2);display:flex;align-items:center;justify-content:center;">',
            '<span style="color:var(--muted);font-size:13px;">No map data for this asset</span>',
          '</div>',
        '</div>',

      '</div>',// end snap-results

    ].join('');

    wireEvents();
    injectAlignPanel();
    injectSnapshotHistoryPanel();
    resetCameraGrid();
  }

  // Renders five empty camera slot placeholders (the maximum slot count,
  // matching MultiIQ) so the locked layout always shows real slot boxes
  // rather than a generic text message — even before any data has loaded
  // or when an asset genuinely has no camera device.
  function resetCameraGrid() {
    var grid = TGE.el('snap-camera-grid');
    if (grid) {
      grid.style.gridTemplateColumns = 'repeat(5,minmax(0,1fr))';
      grid.innerHTML = buildCameraGrid([], CAMERA_SLOTS.slice(0, 5));
    }
  }

  function di(id, label) {
    return '<div class="data-item"><span>' + label + '</span><strong id="' + id + '">—</strong></div>';
  }

  function defaultData() {
    return {
      vehicle: null,
      deviceStats: null,
      vpm: null,
      gpio: null,
      cameras: null,
    };
  }

  // ── Export menu (Standard 1: export actions grouped under one dropdown) ───────
  function buildExportMenu() {
    var items = [
      TGE.can('snapshot','export-pdf')       ? '<button class="hero-menu-item" id="snap-pdf-btn" type="button"><span>Snapshot PDF</span><span>PDF</span></button>' : '',
      TGE.can('snapshot','export-email-pdf') ? '<button class="hero-menu-item" id="snap-email-btn" type="button"><span>Email PDF</span><span>Send</span></button>' : '',
      TGE.can('snapshot','export-csv')       ? '<button class="hero-menu-item" id="snap-csv-btn" type="button"><span>CSV</span><span>.csv</span></button>' : '',
      TGE.can('snapshot','export-xlsx')      ? '<button class="hero-menu-item" id="snap-xlsx-btn" type="button"><span>Excel</span><span>.xlsx</span></button>' : '',
      TGE.can('snapshot','export-json')      ? '<button class="hero-menu-item" id="snap-json-btn" type="button"><span>JSON</span><span>.json</span></button>' : '',
    ].filter(Boolean).join('');
    if (!items) return '';
    return '<div class="hero-menu" id="snap-export-menu">' +
        '<button class="hero-menu-trigger" id="snap-export-trigger" type="button" aria-haspopup="true" aria-expanded="false" title="Export">' +
          '<svg class="hero-menu-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">' +
            '<path d="M8 1.5v8M5 6.5l3 3 3-3M2.5 11.5v2A1 1 0 0 0 3.5 14.5h9a1 1 0 0 0 1-1v-2"/>' +
          '</svg>' +
          '<span>Export</span>' +
          '<svg class="hero-menu-caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M4 6l4 4 4-4"/></svg>' +
        '</button>' +
        '<div class="hero-menu-panel" role="menu">' + items + '</div>' +
      '</div>';
  }

  function injectAlignPanel() {
    var existing = document.getElementById('snap-align-panel');
    if (existing) existing.remove();
    var panel = document.createElement('div');
    panel.id = 'snap-align-panel';
    panel.style.cssText = 'display:none;position:fixed;bottom:0;left:0;right:0;height:85vh;background:var(--surface);border-top:3px solid var(--green-600);z-index:400;flex-direction:column;box-shadow:0 -8px 32px rgba(0,0,0,0.2);';
    panel.innerHTML = [
      '<div style="padding:14px 20px;background:var(--green-900);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">',
        '<div>',
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:rgba(212,240,38,0.7);">Camera Alignment Test</div>',
          '<div style="font-size:15px;font-weight:700;color:#fff;" id="snap-align-title">Fleet —</div>',
        '</div>',
        '<button id="snap-align-close" style="border:none;background:rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:16px;cursor:pointer;width:30px;height:30px;">✕</button>',
      '</div>',
      '<div style="flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:20px;">',
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">',
          '<div><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">BEFORE</div>',
          '<div id="snap-align-before" style="display:grid;gap:6px;"></div></div>',
          '<div><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--green-600);margin-bottom:8px;">AFTER</div>',
          '<div id="snap-align-after" style="display:grid;gap:6px;"></div>',
          '<p id="snap-align-after-msg" style="font-size:12px;color:var(--muted);margin-top:8px;font-style:italic;">Images will appear after test completes</p>',
          '</div>',
        '</div>',
        '<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:16px;">',
          '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:12px;">Test Procedure</div>',
          '<div id="snap-align-steps" style="display:flex;flex-direction:column;gap:8px;"></div>',
        '</div>',
      '</div>',
      '<div style="padding:12px 20px;border-top:1px solid var(--line);display:flex;gap:8px;flex-shrink:0;background:var(--surface-2);">',
        '<button id="snap-align-start" class="btn btn-primary" style="height:36px;">Start Test</button>',
        '<button id="snap-align-cancel" class="btn" style="height:36px;">Close</button>',
        '<span id="snap-align-status" style="font-size:12px;color:var(--muted);align-self:center;margin-left:8px;"></span>',
      '</div>',
    ].join('');
    document.body.appendChild(panel);
  }

function injectSnapshotHistoryPanel() {
  var existing = document.getElementById('snap-history-panel');
  if (existing) existing.remove();

  var panel = document.createElement('div');
  panel.id = 'snap-history-panel';
  panel.style.cssText = 'display:none;position:fixed;bottom:0;left:0;right:0;height:85vh;background:var(--surface);border-top:3px solid var(--green-600);z-index:400;flex-direction:column;box-shadow:0 -8px 32px rgba(0,0,0,0.2);';

  panel.innerHTML = [
    '<div style="padding:14px 20px;background:var(--green-900);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">',
      '<div>',
        '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:rgba(212,240,38,0.7);">Camera History</div>',
        '<div style="font-size:15px;font-weight:700;color:#fff;" id="snap-history-title">Snapshot History</div>',
      '</div>',
      '<button id="snap-history-close" style="border:none;background:rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:16px;cursor:pointer;width:30px;height:30px;">✕</button>',
    '</div>',
    '<div style="flex:1;overflow-y:auto;padding:16px;" id="snap-history-body">',
      '<div style="text-align:center;color:var(--muted);padding:40px;">No snapshot history available.</div>',
    '</div>'
  ].join('');

  document.body.appendChild(panel);

  var close = TGE.el('snap-history-close');
  if (close) close.onclick = function () {
    panel.style.display = 'none';
  };
}

async function openSnapshotHistoryPanel() {
  var vehicle = state.data.vehicle;
  if (!vehicle) return;

  var panel = TGE.el('snap-history-panel');
  var body = TGE.el('snap-history-body');
  var title = TGE.el('snap-history-title');

  if (title) title.textContent = vehicle.name + ' — Snapshot History';
  if (body) body.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px;">Loading history...</div>';
  if (panel) panel.style.display = 'flex';

  try {
    var windows = buildHistoryWindows();
    var allEvents = [];

    for (var i = 0; i < windows.length; i++) {
      if (body) {
        body.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px;">Loading history window ' +
          (i + 1) + ' of ' + windows.length + '...</div>';
      }

var url = '/api/camera-history-events' +
  '?from=' + encodeURIComponent(windows[i].from) +
  '&to=' + encodeURIComponent(windows[i].to);

      var r = await TGE.api('GET', url);
      if (!r.ok) continue;

      var events = Array.isArray(r.data) ? r.data : [];
      events.forEach(function(e) {
        if (
          String(e.vehicleId) === String(vehicle.id) &&
          e.attributes &&
          e.attributes.status === 'available'
        ) {
          allEvents.push(e);
        }
      });
    }

    if (!allEvents.length) {
      body.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px;">No snapshot history available.</div>';
      return;
    }

    allEvents.sort(function(a, b) {
      return new Date(b.timeAt) - new Date(a.timeAt);
    });

    var cam = state.devices.camera;
    var model = cam && cam.model && cam.model.name;
    var slots = model === 'MultiIQ' ? 5 : 2;
    var activeSlots = CAMERA_SLOTS.slice(0, slots);

    body.innerHTML = allEvents.map(function(e) {
      var mediaFiles = [];

      try {
        var ctx = JSON.parse(e.attributes.context || '{}');
        if (ctx && ctx.response && ctx.response.mediaFiles) {
          mediaFiles = ctx.response.mediaFiles;
        }
      } catch(err) {}

      return '<div style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid var(--line-2);">' +
        '<div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px;">' + formatTs(e.timeAt) + '</div>' +
        '<div style="display:grid;gap:10px;grid-template-columns:repeat(' + slots + ',minmax(0,1fr));">' +
          buildCameraGrid(mediaFiles, activeSlots) +
        '</div>' +
      '</div>';
    }).join('');

  } catch(e) {
    if (body) {
      body.innerHTML = '<div style="text-align:center;color:var(--danger);padding:40px;">' +
        (e.message || 'Failed to load camera history') +
      '</div>';
    }
  }
}
  
  // ── Wire events ───────────────────────────────────────────────────────────────
  function wireEvents() {
    TGE.on('snap-run-btn',     'click', runSnapshot);
    // Refresh = full reset only. It must NOT re-run the lookup — it clears
    // the screen so the user can run a fresh asset. To reload the SAME asset
    // with updated data, the user just clicks Run again.
    TGE.on('snap-refresh-btn', 'click', resetSnapshot);
    TGE.on('snap-fleet-input', 'keydown', function(e) { if (e.key === 'Enter') runSnapshot(); });

    var exportTrigger = TGE.el('snap-export-trigger');
    var exportMenu    = TGE.el('snap-export-menu');
    var exportPanel   = TGE.el('snap-export-menu') ? TGE.el('snap-export-menu').querySelector('.hero-menu-panel') : null;

    function positionExportPanel() {
      if (!exportTrigger || !exportPanel) return;
      var rect = exportTrigger.getBoundingClientRect();
      exportPanel.style.top   = (rect.bottom + 8) + 'px';
      exportPanel.style.left  = 'auto';
      // Align the panel's right edge with the trigger's right edge.
      exportPanel.style.right = (window.innerWidth - rect.right) + 'px';
    }

    if (exportTrigger && exportMenu) {
      exportTrigger.onclick = function(e) {
        e.stopPropagation();
        var open = !exportMenu.classList.contains('open');
        if (open) positionExportPanel();
        exportMenu.classList.toggle('open', open);
        exportTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
      document.addEventListener('click', function(e) {
        if (!exportMenu.contains(e.target)) closeExportMenu();
      });
      window.addEventListener('scroll', function() {
        if (exportMenu.classList.contains('open')) positionExportPanel();
      }, true);
      window.addEventListener('resize', function() {
        if (exportMenu.classList.contains('open')) positionExportPanel();
      });
    }
  }

  // ── Run snapshot ──────────────────────────────────────────────────────────────
  async function runSnapshot() {
    if (state.running) return;
    var fleetNo = (TGE.el('snap-fleet-input') || {}).value || '';
    fleetNo = fleetNo.trim();
    if (!fleetNo) { setMessage('Enter a fleet number first.', true); return; }

    state.running = true;
    state.devices = { hermes:null, camera:null, iface:null, tracker:null };
    state.data    = defaultData();
    resetCardContent();
    setMessage('Looking up fleet ' + fleetNo + '...', false);
    setBtnState(true);

    try {
      // Step 1 — Find vehicle
      var vRes = await TGE.api('GET', '/api/tn360/v1/vehicles?pruning=B2B');
      if (!vRes.ok) throw new Error('Vehicle lookup failed');
      var vehicles = Array.isArray(vRes.data) ? vRes.data : [];
      var vehicle  = vehicles.find(function(v) {
        return String(v.name || '').trim().toLowerCase() === fleetNo.toLowerCase();
      });
      if (!vehicle) throw new Error('Fleet number ' + fleetNo + ' not found');

      state.data.vehicle = vehicle;
      populateVehicle(vehicle);
      showResults();
      setMessage('Loading devices...', false);

      // Step 2 — Get devices
      var dRes = await TGE.api('GET', '/api/tn360/v1/vehicles/' + vehicle.id + '/devices?pruning=B2B');
      if (!dRes.ok) throw new Error('Device lookup failed');
      var devices = (Array.isArray(dRes.data) ? dRes.data : []).filter(function(d) { return !d.outServiceAt; });

      devices.forEach(function(d) {
        var code = (d.type && d.type.code) || '';
        if (code === DEVICE.HERMES)   state.devices.hermes  = d;
        if (code === DEVICE.CAMERA)   state.devices.camera  = d;
        if (code === DEVICE.IFACE)    state.devices.iface   = d;
        if (code === DEVICE.ATRACKER) state.devices.tracker = d;
      });

      populateDeviceCards(devices);
      setMessage('Loading data...', false);

      var promises = [];

      if (state.devices.hermes) {
        promises.push(
          TGE.api('GET', '/api/tn360/v1/devices/' + state.devices.hermes.imei + '?pruning=B2B&embed=devicestats')
            .then(function(r) { if (r.ok) processHermesStats(r.data); })
        );
      }

      if (state.devices.iface) {
        promises.push(
          TGE.api('GET', '/api/tn360/v1/devices/' + state.devices.iface.imei + '?pruning=B2B&embed=devicestats')
            .then(function(r) { if (r.ok) processIfaceStats(r.data); })
        );
      }

      if (state.devices.camera) {
        promises.push(
          TGE.api('GET', '/api/tn360/v1/events?pruning=B2B&types=camera&vehicle_ids=' + vehicle.id)
            .then(function(r) { if (r.ok) processCameraEvents(r.data, vehicle.id); })
        );
        promises.push(
          TGE.api('GET', '/api/tn360/v1/devices/' + state.devices.camera.imei + '?pruning=B2B&embed=devicestats')
            .then(function(r) { if (r.ok) processCameraDeviceStats(r.data); })
        );
      }

      await Promise.all(promises);
      setMessage('');
      TGE.el('snap-refresh-btn').style.display = '';
      activateExports();

    } catch(e) {
      setMessage(e.message || 'Failed to load asset.', true);
    } finally {
      state.running = false;
      setBtnState(false);
    }
  }

  // ── Process functions ─────────────────────────────────────────────────────────
  // NOTE: locked layout means these functions no longer call show()/hide() on
  // their card containers — every card is always visible once results exist.
  // Each function still only writes data when the relevant device/data
  // exists; fields fall back to their existing "No data" states otherwise,
  // so a genuinely absent device still surfaces as a visible "No data" card
  // rather than disappearing — by design, so missing data on assets that
  // should report it doesn't go unnoticed.
  function processHermesStats(d) {
    var ds = d.deviceStats || {};
    state.data.deviceStats = ds;

    setText('snap-ignition', ds.ignition, 'No data');
    setText('snap-movement', ds.movement, 'No data');
    setText('snap-address',  ds.location, 'Location unavailable');
    setText('snap-gps-time', ds.gpsAt ? formatTs(ds.gpsAt) : null, 'No GPS fix');
    setText('snap-odometer', ds.odometer ? Number(ds.odometer).toLocaleString() + ' km' : null, 'No odometer data');

    var gps = ds.gps || {};
    if (gps.Lat != null && gps.Lng != null) {
      setText('snap-lat', Number(gps.Lat).toFixed(6));
      setText('snap-lng', Number(gps.Lng).toFixed(6));
      try {
        var pr = JSON.parse(ds.attrs && ds.attrs.last_pr || '{}');
        setText('snap-speed', pr.Spd ? pr.Spd + ' km/h' : null, 'No data');
      } catch(e) { setText('snap-speed', null, 'No data'); }
      setText('snap-map-address', ds.location || null, 'No data');
      setText('snap-map-lat', Number(gps.Lat).toFixed(6));
      setText('snap-map-lng', Number(gps.Lng).toFixed(6));
      renderMap('snap-map', gps.Lat, gps.Lng);
    } else {
      setText('snap-speed', null, 'No data');
    }

    try {
      var vpm = JSON.parse(ds.lastVpm || '{}');
      state.data.vpm = vpm;
      setText('snap-rpm',          vpm.rpm    != null && vpm.rpm    !== -1 ? vpm.rpm + ' rpm'    : null, 'No engine data');
      setText('snap-engine-speed', vpm.speed  != null && vpm.speed  !== -1 ? vpm.speed + ' km/h' : null, 'No data');
      setText('snap-engine-hrs',   vpm.hours  != null && vpm.hours  !== -1 ? Number(vpm.hours).toLocaleString() + ' hrs' : null, 'No data');
      setText('snap-fuel-total',   vpm.fuelconsumption != null && vpm.fuelconsumption !== -1 ? Number(vpm.fuelconsumption).toLocaleString() + ' L' : null, 'No data');
      setText('snap-oil-temp',     vpm.oiltemp    != null && vpm.oiltemp    !== -1 ? vpm.oiltemp + ' °C'       : null, 'No data');
      setText('snap-oil-press',    vpm.oilpressure != null && vpm.oilpressure !== -1 ? vpm.oilpressure + ' kPa' : null, 'No data');
      setText('snap-engine-load',  vpm.engineload  != null && vpm.engineload  !== -1 ? vpm.engineload + ' %'    : null, 'No data');
      setText('snap-vpm-time',     ds.lastVpmAt ? formatTs(ds.lastVpmAt) : null, 'No VPM recorded');
    } catch(e) {}

    try {
      var gpio = JSON.parse(ds.lastGpio || '{}');
      state.data.gpio = gpio;
      populateGpio(gpio);
    } catch(e) {}
  }

  function processIfaceStats(d) {
    var ds = d.deviceStats || {};
    var cu = ds.currentUser;
    if (!cu) return;
    setText('snap-driver-name',    ((cu.firstName || '') + ' ' + (cu.lastName || '')).trim(), 'No data');
    setText('snap-driver-user',    cu.username || null, 'No data');
    setText('snap-driver-licence', cu.licenceNumber || null, 'No data');
    setText('snap-driver-state',   cu.licenceState || null, 'No data');
  }

  function processCameraDeviceStats(d) {
    var attrs = (d.deviceStats && d.deviceStats.attrs) || {};

    var sd1     = attrs['lm.sd_card.1']       || '';
    var sd2     = attrs['lm.sd_card.2']       || '';
    var sd1size = attrs['lm.sd_card.1_total_size_bytes'] || '';
    var sd2size = attrs['lm.sd_card.2_total_size_bytes'] || '';
    var sdOver  = attrs['lm.sd_card.overall_status']     || '';

    function fmtSd(val) {
      if (!val) return null;
      if (val === 'sdCardPresent') return 'Present';
      if (val === 'sdCardAbsent')  return 'Not Present';
      if (val === 'sdCardFailed')  return 'Failed';
      return val;
    }
    function fmtBytes(b) {
      if (!b) return null;
      var n = parseFloat(b);
      if (isNaN(n)) return null;
      if (n >= 1e12) return (n/1e12).toFixed(1) + ' TB';
      if (n >= 1e9)  return (n/1e9).toFixed(1)  + ' GB';
      if (n >= 1e6)  return (n/1e6).toFixed(1)  + ' MB';
      return n + ' B';
    }

    setText('snap-sd1',        fmtSd(sd1),    'No data');
    setText('snap-sd2',        fmtSd(sd2),    'No data');
    setText('snap-sd-overall', sdOver ? sdOver.toUpperCase() : null, 'No data');
    setText('snap-sd1-size',   fmtBytes(sd1size), 'No data');
    setText('snap-sd2-size',   fmtBytes(sd2size), 'No data');

    var faultKeys = Object.keys(attrs).filter(function(k) { return k.indexOf('lm.ongoing_faults.') === 0 && !k.endsWith('_at'); });
    var faultsGrid = TGE.el('snap-faults-grid');
    if (faultsGrid) {
      if (faultKeys.length) {
        faultsGrid.innerHTML = faultKeys.map(function(k) {
          var label = k.replace('lm.ongoing_faults.', '').replace(/_/g,' ').replace(/\w/g, function(c){ return c.toUpperCase(); });
          var val   = attrs[k];
          var isBad = val === 'true' || (val && val !== 'false' && val !== 'CLOSED' && val !== 'ok');
          var color = isBad ? 'var(--danger)' : 'var(--green-600)';
          var icon  = isBad ? '⚠️' : '✅';
          return '<div class="data-item"><span>' + label + '</span>' +
            '<strong style="color:' + color + ';">' + icon + ' ' + val + '</strong></div>';
        }).join('');
      } else {
        faultsGrid.innerHTML = '<div class="data-item" style="color:var(--muted);font-size:12px;grid-column:span 3;">No fault data reported.</div>';
      }
    }
  }

  function processCameraEvents(events, vehicleId) {
    var grid = TGE.el('snap-camera-grid');
    if (!Array.isArray(events) || !events.length) return;
    var available = events.filter(function(e) {
      return String(e.vehicleId) === String(vehicleId) &&
             e.attributes && e.attributes.status === 'available';
    });
    if (!available.length) return;
    available.sort(function(a,b) { return new Date(b.timeAt) - new Date(a.timeAt); });
    var latest = available[0];

    var cam   = state.devices.camera;
    var model = cam && cam.model && cam.model.name;
    var slots = model === 'MultiIQ' ? 5 : 2;
    var ctx;
    try { ctx = JSON.parse(latest.attributes.context); } catch(e) { return; }
    if (!ctx || !ctx.response || !ctx.response.mediaFiles) return;

    var mediaFiles  = ctx.response.mediaFiles;
    state.data.cameras = mediaFiles;
    var activeSlots = CAMERA_SLOTS.slice(0, slots);

    if (grid) {
      grid.style.gridTemplateColumns = 'repeat(' + slots + ',minmax(0,1fr))';
      grid.innerHTML = buildCameraGrid(mediaFiles, activeSlots);
    }
    var camTime = TGE.el('snap-cam-time');
    if (camTime) camTime.textContent = 'Snapshot captured: ' + formatTs(latest.timeAt);

     var alignBtn = TGE.el('snap-align-btn');
    if (alignBtn) alignBtn.onclick = openAlignPanel;

    var historyBtn = TGE.el('snap-history-btn');
    if (historyBtn) historyBtn.onclick = openSnapshotHistoryPanel;
  }

  function findCameraFile(mediaFiles, slot) {
    if (!Array.isArray(mediaFiles)) return null;
    if (slot.source === 'MDVR') {
      return mediaFiles.find(function(f) {
        return f.source === 'MDVR' &&
               f.imageDetails && f.imageDetails.sources &&
               f.imageDetails.sources.some(function(s) { return slot.sources.indexOf(s) !== -1; }) &&
               f.status === 'FINISHED';
      }) || null;
    }
    return mediaFiles.find(function(f) { return f.source === slot.source && f.status === 'FINISHED'; }) || null;
  }

  function buildCameraGrid(mediaFiles, activeSlots) {
    return activeSlots.map(function(slot) {
      var file = findCameraFile(mediaFiles, slot);
      var hasImage = file && file.mediaFile;
      return '<div>' +
        '<div style="aspect-ratio:4/3;border-radius:8px;overflow:hidden;background:var(--surface-2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;">' +
          (hasImage ? '<img src="/api/image-proxy?url=' + encodeURIComponent(file.mediaFile) + '" style="width:100%;height:100%;object-fit:cover;" alt="' + slot.label + '" onerror="this.parentElement.innerHTML=\'<span style=&quot;font-size:11px;color:var(--muted);&quot;>Unavailable</span>\'" />' : '<span style="font-size:11px;color:var(--muted);">No image</span>') +
        '</div>' +
        '<div style="padding-top:5px;font-size:11px;font-weight:600;color:var(--ink-2);">' + slot.label + '</div>' +
        '<div style="font-size:10px;color:var(--muted);">' + (hasImage ? 'FINISHED' : 'Unavailable') + '</div>' +
      '</div>';
    }).join('');
  }

  function populateGpio(gpio) {
    var grid = TGE.el('snap-gpio-grid');
    if (!grid) return;
    var keys = Object.keys(gpio);
    if (!keys.length) {
      grid.innerHTML = '<div class="data-item" style="color:var(--muted);font-size:12px;grid-column:span 4;">No GPIO data.</div>';
      return;
    }
    grid.innerHTML = keys.map(function(k) {
      var g = gpio[k];
      var noun  = g.noun || k;
      var verb  = g.verb || '—';
      var which = g.which && g.which !== 'unknown' ? ' (' + g.which + ')' : '';
      var ok    = ['fastened','closed','off'].indexOf(verb) !== -1;
      var warn  = ['unfastened','open','on'].indexOf(verb) !== -1;
      var color = ok ? 'var(--green-600)' : warn ? 'var(--danger)' : 'var(--ink)';
      var label = noun.charAt(0).toUpperCase() + noun.slice(1) + which;
      return '<div class="data-item"><span>' + label + '</span><strong style="color:' + color + ';">' + verb + '</strong></div>';
    }).join('');
  }

  function populateVehicle(v) {
    var ovm   = v.operationalVehicleModel || {};
    var make  = ovm.make  || v.make  || '—';
    var model = ovm.model || v.model || '—';
    var year  = ovm.yearOfManufacture || '';
    setText('snap-vehicle-title', v.name + ' — ' + make + ' ' + model);
    setText('snap-fleet-no', v.name);
    setText('snap-rego',     v.registration);
    setText('snap-state',    v.registrationState);
    setText('snap-vin',      v.vin);
    setText('snap-make',     make);
    setText('snap-model',    model);
    setText('snap-year',     year);
    setText('snap-veh-type', v.type && v.type.name);
  }

  function populateDeviceCards(devices) {
    var el = TGE.el('snap-device-cards');
    if (!el) return;
    if (!devices.length) {
      el.innerHTML = '<div class="data-item" style="color:var(--muted);font-size:12px;grid-column:span 3;">No active devices on this asset.</div>';
      return;
    }
    el.innerHTML = devices.map(function(d) {
      var code  = (d.type && d.type.code)  || '—';
      var model = (d.model && d.model.name) || '—';
      return '<div class="data-item">' +
        '<span>' + code + ' / ' + model + '</span>' +
        '<strong style="font-family:monospace;font-size:11px;">' + (d.imei || '—') + '</strong>' +
        '<span style="font-size:10px;color:var(--muted);">S/N: ' + (d.serialNumber || '—') + '</span>' +
      '</div>';
    }).join('');
  }

  // ── Alignment test — UNCHANGED, frozen pending vendor trigger process ───────
  function openAlignPanel() {
    var vehicle = state.data.vehicle;
    if (!vehicle) return;
    alignState.running   = false;
    alignState.steps     = {};
    alignState.vehicleId = vehicle.id;

    var cam   = state.devices.camera;
    var model = cam && cam.model && cam.model.name;
    var slots = model === 'MultiIQ' ? 5 : 2;

    setText('snap-align-title', vehicle.name + ' — ' + (vehicle.make || ''));

    var beforeGrid  = TGE.el('snap-align-before');
    var currentGrid = TGE.el('snap-camera-grid');
    if (beforeGrid && currentGrid) {
      beforeGrid.innerHTML = currentGrid.innerHTML;
      beforeGrid.style.gridTemplateColumns = 'repeat(' + slots + ',minmax(0,1fr))';
    }

    var afterGrid = TGE.el('snap-align-after');
    if (afterGrid) {
      afterGrid.innerHTML = '';
      afterGrid.style.gridTemplateColumns = 'repeat(' + slots + ',minmax(0,1fr))';
    }

    var afterMsg = TGE.el('snap-align-after-msg');
    if (afterMsg) afterMsg.style.display = '';

    renderAlignSteps();

    var startBtn = TGE.el('snap-align-start');
    if (startBtn) { startBtn.textContent = 'Start Test'; startBtn.disabled = false; startBtn.onclick = startAlignTest; }
    setText('snap-align-status', '');

    var panel = TGE.el('snap-align-panel');
    if (panel) panel.style.display = 'flex';

    TGE.el('snap-align-close').onclick  = closeAlignPanel;
    TGE.el('snap-align-cancel').onclick = closeAlignPanel;
  }

  function closeAlignPanel() {
    alignState.running = false;
    var panel = TGE.el('snap-align-panel');
    if (panel) panel.style.display = 'none';
  }

  function renderAlignSteps() {
    var el = TGE.el('snap-align-steps');
    if (!el) return;
    el.innerHTML = ALIGN_STEPS.map(function(s) {
      var status = alignState.steps[s.id] || 'pending';
      var icon   = { pending:'⬜', running:'⏳', done:'✅', error:'❌' }[status] || '⬜';
      var color  = { pending:'var(--muted)', running:'var(--ink)', done:'var(--green-600)', error:'var(--danger)' }[status];
      var msg    = alignState.steps[s.id + '_msg'] || '';
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:7px;background:' + (status==='running'?'var(--green-50,#f0faf4)':'transparent') + ';">' +
        '<span style="font-size:16px;">' + icon + '</span>' +
        '<span style="font-size:13px;font-weight:' + (status==='running'?'700':'400') + ';color:' + color + ';">' + s.label + '</span>' +
        (msg ? '<span style="font-size:11px;color:var(--muted);margin-left:auto;">' + msg + '</span>' : '') +
      '</div>';
    }).join('');
  }

  function setAlignStep(id, status, msg) {
    alignState.steps[id] = status;
    if (msg) alignState.steps[id + '_msg'] = msg;
    renderAlignSteps();
  }

async function startAlignTest() {
  if (alignState.running) return;

  alignState.running = true;
  alignState.steps = {};

  var startBtn = TGE.el('snap-align-start');
  if (startBtn) {
    startBtn.textContent = 'Running Simulation...';
    startBtn.disabled = true;
  }

  setText('snap-align-status', 'Simulation running — API trigger pending Teletrac confirmation');

  for (var i = 0; i < ALIGN_STEPS.length; i++) {
    if (!alignState.running) return;

    var step = ALIGN_STEPS[i];

    setAlignStep(step.id, 'running', 'Checking...');
    await delay(900);

    setAlignStep(step.id, 'done', 'Event Found');
    await delay(500);
  }

  completeSimulatedAlignmentTest();

  alignState.running = false;

  if (startBtn) {
    startBtn.textContent = 'Retest';
    startBtn.disabled = false;
  }

  setText('snap-align-status', '✅ Simulation complete');
}

  async function pollIgnition(imei, expect, timeoutSecs) {
    if (!imei) return true;
    var deadline = Date.now() + timeoutSecs * 1000;
    while (Date.now() < deadline) {
      try {
        var r = await TGE.api('GET', '/api/tn360/v1/devices/' + imei + '?pruning=B2B&embed=devicestats');
        if (r.ok && r.data.deviceStats && r.data.deviceStats.ignition === expect) return true;
      } catch(e) {}
      await delay(5000);
    }
    return false;
  }

  async function countdownWait(stepId, seconds) {
    for (var i = seconds; i > 0; i--) {
      if (!alignState.running) return;
      alignState.steps[stepId + '_msg'] = i + 's remaining';
      renderAlignSteps();
      await delay(1000);
    }
  }

  async function pullPostSnapshots() {
    var vid = alignState.vehicleId;
    var r = await TGE.api('GET', '/api/tn360/v1/events?pruning=B2B&types=camera&vehicle_ids=' + vid);
    if (!r.ok) throw new Error('Camera fetch failed');

    var available = (Array.isArray(r.data) ? r.data : []).filter(function(e) {
      return String(e.vehicleId) === String(vid) && e.attributes && e.attributes.status === 'available';
    });
    if (!available.length) throw new Error('No new snapshots available yet');
    available.sort(function(a,b) { return new Date(b.timeAt) - new Date(a.timeAt); });
    var latest = available[0];

    var ctx;
    try { ctx = JSON.parse(latest.attributes.context); } catch(e) { throw new Error('Could not parse camera context'); }
    if (!ctx || !ctx.response || !ctx.response.mediaFiles) throw new Error('No media files in response');

    var mediaFiles  = ctx.response.mediaFiles;
    var cam         = state.devices.camera;
    var model       = cam && cam.model && cam.model.name;
    var slots       = model === 'MultiIQ' ? 5 : 2;
    var activeSlots = CAMERA_SLOTS.slice(0, slots);
    var html        = buildCameraGrid(mediaFiles, activeSlots);

    var afterGrid = TGE.el('snap-align-after');
    if (afterGrid) { afterGrid.innerHTML = html; afterGrid.style.gridTemplateColumns = 'repeat(' + slots + ',minmax(0,1fr))'; }
    var afterMsg = TGE.el('snap-align-after-msg');
    if (afterMsg) afterMsg.style.display = 'none';

    var postGrid = TGE.el('snap-camera-grid-post');
    if (postGrid) { postGrid.innerHTML = html; postGrid.style.gridTemplateColumns = 'repeat(' + slots + ',minmax(0,1fr))'; }
    var postSection = TGE.el('snap-cam-post-section');
    if (postSection) postSection.style.display = '';
    var postTime = TGE.el('snap-cam-post-time');
    if (postTime) postTime.textContent = 'Post alignment — captured: ' + formatTs(latest.timeAt);
    var preLabel = TGE.el('snap-cam-pre-label');
    if (preLabel) preLabel.textContent = 'PRE — Alignment Test';
  }

  function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function setText(id, val, noDataMsg) {
    var el = TGE.el(id);
    if (!el) return;
    if (val != null && val !== '' && val !== '—') {
      el.textContent = val;
      el.style.color = '';
    } else {
      el.textContent = noDataMsg || '—';
      el.style.color = 'var(--muted)';
    }
  }

  function setMessage(msg, isError) {
    var el = TGE.el('snap-message');
    if (!el) return;
    el.textContent = msg || '';
    el.className   = 'hero-message' + (isError ? ' error' : '');
  }

  function setBtnState(loading) {
    var btn = TGE.el('snap-run-btn');
    if (btn) { btn.textContent = loading ? 'Loading...' : 'Run'; btn.disabled = loading; }
  }

  function showResults() { TGE.hide('snap-empty'); TGE.show('snap-results'); }

  function closeExportMenu() {
    var exportMenu    = TGE.el('snap-export-menu');
    var exportTrigger = TGE.el('snap-export-trigger');
    if (exportMenu)    exportMenu.classList.remove('open');
    if (exportTrigger) exportTrigger.setAttribute('aria-expanded', 'false');
  }

  // Resets every card's inner content back to its empty/"No data" state,
  // without hiding the cards themselves — used before a fresh run starts,
  // so stale data from a previous asset never lingers while the new lookup
  // is in flight.
  function resetCardContent() {
    var driverFields = ['snap-driver-name','snap-driver-user','snap-driver-licence','snap-driver-state'];
    var statusFields  = ['snap-ignition','snap-movement','snap-speed','snap-odometer','snap-address','snap-gps-time','snap-lat','snap-lng'];
    var vpmFields     = ['snap-rpm','snap-engine-speed','snap-engine-hrs','snap-fuel-total','snap-oil-temp','snap-oil-press','snap-engine-load','snap-vpm-time'];
    var mapFields     = ['snap-map-address','snap-map-lat','snap-map-lng'];
    var sdFields      = ['snap-sd1','snap-sd2','snap-sd-overall','snap-sd1-size','snap-sd2-size'];

    driverFields.concat(statusFields, vpmFields, mapFields, sdFields).forEach(function(id) {
      setText(id, null, 'No data');
    });

    var gpioGrid = TGE.el('snap-gpio-grid');
    if (gpioGrid) gpioGrid.innerHTML = '<div class="data-item" style="color:var(--muted);font-size:12px;grid-column:span 4;">No GPIO data.</div>';

    var faultsGrid = TGE.el('snap-faults-grid');
    if (faultsGrid) faultsGrid.innerHTML = '<div class="data-item" style="color:var(--muted);font-size:12px;grid-column:span 3;">No fault data reported.</div>';

    var cameraGrid = TGE.el('snap-camera-grid');
    if (cameraGrid) resetCameraGrid();

    var camTime = TGE.el('snap-cam-time');
    if (camTime) camTime.textContent = '';

    var postSection = TGE.el('snap-cam-post-section');
    if (postSection) postSection.style.display = 'none';

    var map = TGE.el('snap-map');
    if (map) map.innerHTML = '<span style="color:var(--muted);font-size:13px;">No map data for this asset</span>';

    var deviceCards = TGE.el('snap-device-cards');
    if (deviceCards) deviceCards.innerHTML = '';
  }

  // Refresh button: full reset back to the pre-run empty state. Does NOT
  // call the API — the user re-runs by typing a fleet number and clicking
  // Run again.
  function resetSnapshot() {
    if (state.running) return;
    state.devices = { hermes:null, camera:null, iface:null, tracker:null };
    state.data    = defaultData();
    alignState     = { running:false, steps:{}, vehicleId:null };

    var input = TGE.el('snap-fleet-input');
    if (input) { input.value = ''; input.focus(); }

    resetCardContent();
    TGE.hide('snap-results');
    TGE.show('snap-empty');

    var refreshBtn = TGE.el('snap-refresh-btn');
    if (refreshBtn) refreshBtn.style.display = 'none';

    setMessage('');
    closeExportMenu();
  }

  function activateExports() {
    var csvBtn   = TGE.el('snap-csv-btn');
    var jsonBtn  = TGE.el('snap-json-btn');
    var pdfBtn   = TGE.el('snap-pdf-btn');
    var xlsxBtn  = TGE.el('snap-xlsx-btn');
    var emailBtn = TGE.el('snap-email-btn');
    if (csvBtn)   csvBtn.onclick   = function() { closeExportMenu(); exportCsv(); };
    if (jsonBtn)  jsonBtn.onclick  = function() { closeExportMenu(); exportJson(); };
    if (pdfBtn)   pdfBtn.onclick   = function() { closeExportMenu(); exportPdf(); };
    if (xlsxBtn)  xlsxBtn.onclick  = function() { closeExportMenu(); exportXlsx(); };
    if (emailBtn) emailBtn.onclick = function() { closeExportMenu(); openEmailPdfComposer(); };
  }

  function renderMap(containerId, lat, lng) {
    var el = TGE.el(containerId);
    if (!el) return;
    lat = Number(lat); lng = Number(lng);
    if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      el.innerHTML = '<span style="color:var(--muted);font-size:13px;">Map unavailable — invalid coordinates</span>';
      return;
    }
    el.innerHTML = '<iframe title="Last known position map" style="width:100%;height:100%;border:none;" loading="lazy" ' +
      'src="https://www.openstreetmap.org/export/embed.html?bbox=' +
      (lng-0.02) + '%2C' + (lat-0.02) + '%2C' + (lng+0.02) + '%2C' + (lat+0.02) +
      '&layer=mapnik&marker=' + lat + '%2C' + lng + '"></iframe>';
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

function buildHistoryWindows() {
  var end = new Date();
  end.setHours(23, 59, 59, 999);

  var start = new Date(end);
  start.setDate(start.getDate() - 27);
  start.setHours(0, 0, 0, 0);

  var windows = [];

  for (var i = 0; i < 4; i++) {
    var from = new Date(start);
    from.setDate(start.getDate() + (i * 7));
    from.setHours(0, 0, 0, 0);

    var to = new Date(start);
    to.setDate(start.getDate() + (i * 7) + 6);
    to.setHours(23, 59, 59, 999);

    if (to > end) {
      to = new Date(end);
    }

    windows.push({
      from: from.toISOString(),
      to: to.toISOString()
    });
  }

  console.table(windows);

  return windows;
}
  
  function ensureSnapshotLoaded() {
    if (state.data && state.data.vehicle) return true;
    setMessage('Run an asset snapshot before exporting.', true);
    return false;
  }

  function safeFileSegment(name) {
    return String(name || 'asset').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'asset';
  }

  function downloadBlob(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }

  // ── Snapshot PDF payload — scrapes the rendered cards into structured data
  // for the server-side PDF builder. Reused by both exportPdf() and the
  // Email PDF composer's attachment builder, so the two stay in sync.
  function collectCardRows(cardId) {
    var card = TGE.el(cardId);
    if (!card) return [];
    return Array.prototype.slice.call(card.querySelectorAll('.data-item')).map(function(item) {
      var labelEl = item.querySelector('span');
      var valueEl = item.querySelector('strong');
      return {
        label: labelEl ? labelEl.textContent.trim() : '',
        value: valueEl ? valueEl.textContent.trim() : '—',
      };
    }).filter(function(row) { return row.label; });
  }

  function collectCardSection(cardId, fallbackTitle) {
    var card = TGE.el(cardId);
    if (!card) return null;
    var kicker = card.querySelector('.card-kicker');
    var title  = card.querySelector('.card-title');
    var rows   = collectCardRows(cardId);
    if (!rows.length) return null;
    return {
      kicker: kicker ? kicker.textContent.trim() : fallbackTitle,
      title:  title  ? title.textContent.trim()  : fallbackTitle,
      rows:   rows,
    };
  }

  function buildSnapshotPdfPayload() {
    var v = state.data.vehicle || {};

    // Build camera photos array from state.data.cameras if available.
    // Each photo gets a label (slot name) and a proxied URL the Worker can fetch.
    // Camera Diagnostics (fault grid) is deliberately excluded per user request.
    var cam     = state.devices.camera;
    var model   = cam && cam.model && cam.model.name;
    var slots   = model === 'MultiIQ' ? 5 : 2;
    var mediaFiles = state.data.cameras;
    var photos = [];
    if (Array.isArray(mediaFiles) && mediaFiles.length) {
      var activeSlots = CAMERA_SLOTS.slice(0, slots);
      activeSlots.forEach(function(slot) {
        var file = findCameraFile(mediaFiles, slot);
        if (file && file.mediaFile) {
          // Use the raw TN360 URL directly — the Worker fetches images from
          // the CDN itself via fetchImageForPdf(), the same way camera-fault-pdf
          // does. The proxied URL (/api/image-proxy) requires a browser session
          // cookie and can't be used in server-side fetches.
          photos.push({
            label: slot.label,
            url: file.mediaFile,
          });
        } else {
          photos.push({ label: slot.label, url: null });
        }
      });
    }

    // SD Card Health — scrape directly from the individual field elements
    // rather than the whole snap-camera-card (which also contains the fault
    // grid we're deliberately excluding).
    var sdRows = [
      { label: 'SD Card 1',      value: (TGE.el('snap-sd1')        || {}).textContent || '—' },
      { label: 'SD Card 2',      value: (TGE.el('snap-sd2')        || {}).textContent || '—' },
      { label: 'Overall Status', value: (TGE.el('snap-sd-overall') || {}).textContent || '—' },
      { label: 'SD Card 1 Size', value: (TGE.el('snap-sd1-size')   || {}).textContent || '—' },
      { label: 'SD Card 2 Size', value: (TGE.el('snap-sd2-size')   || {}).textContent || '—' },
    ].filter(function(r) { return r.value && r.value !== '—' && r.value !== 'No data'; });

    var sections = [
      collectCardSection('snap-vehicle-card', 'Vehicle Information'),
      collectCardSection('snap-driver-card',  'Driver'),
      collectCardSection('snap-status-card',  'Live Status'),
      collectCardSection('snap-vpm-card',     'Engine Metrics'),
      collectCardSection('snap-gpio-card',    'GPIO'),
      collectCardSection('snap-map-card',     'Location'),
      // Evidence — camera snapshots + SD card health
      // Photos are embedded as images by the Worker; SD rows as label/value cells.
      // Camera Diagnostics fault grid is intentionally excluded.
      (photos.length || sdRows.length) ? {
        kicker: 'Evidence',
        title:  'Camera Snapshots',
        rows:   sdRows,
        photos: photos,
      } : null,
    ].filter(Boolean);

    return {
      legacyNo:    v.name || 'asset',
      title:       'Asset ' + (v.name || '—') + ' Snapshot',
      generatedAt: new Date().toISOString(),
      sections:    sections,
    };
  }

  // Calls the server-side PDF builder. NOTE: this endpoint (/api/snapshot-pdf)
  // needs to exist in the Worker for this to succeed — if it returns an
  // error or isn't deployed yet, this surfaces a clear message rather than
  // failing silently.
  async function buildSnapshotAttachment(rows) {
    var row = rows && rows[0];
    var payload = row && row.pdfPayload ? row.pdfPayload : buildSnapshotPdfPayload();
    var r = await TGE.api('POST', '/api/snapshot-pdf', { asset: payload });
    if (!r.ok || !r.data || !r.data.base64) {
      throw new Error(r.data && r.data.error ? r.data.error : 'Snapshot PDF generation failed — the snapshot-pdf endpoint may not be deployed yet.');
    }
    return { base64: r.data.base64, name: r.data.fileName || ('Asset ' + safeFileSegment(payload.legacyNo) + ' snapshot.pdf') };
  }

  function base64ToBlob(base64, type) {
    var bin = atob(base64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: type });
  }

  async function exportPdf() {
    if (!ensureSnapshotLoaded()) return;
    setMessage('Building snapshot PDF...', false);
    try {
      var attachment = await buildSnapshotAttachment([{ pdfPayload: buildSnapshotPdfPayload() }]);
      downloadBlob(base64ToBlob(attachment.base64, 'application/pdf'), attachment.name);
      setMessage('Snapshot PDF downloaded.', false);
    } catch(e) {
      setMessage(e.message || 'PDF export failed.', true);
    }
  }

  function openEmailPdfComposer() {
    if (!ensureSnapshotLoaded()) return;
    var v  = state.data.vehicle || {};
    var ds = state.data.deviceStats || {};
    var row = {
      legacyNo:     v.name || '—',
      registration: v.registration || '—',
      state:        v.registrationState || '—',
      location:     ds.location || '—',
      lastGps:      (TGE.el('snap-gps-time') || {}).textContent || '—',
      pdfPayload:   buildSnapshotPdfPayload(),
    };

    TGE.openEmailComposer({
      rows: [row],
      fields: [
        { key:'legacyNo',     label:'Legacy No' },
        { key:'registration', label:'Registration' },
        { key:'state',        label:'State' },
        { key:'location',     label:'Location' },
        { key:'lastGps',      label:'Last GPS' },
      ],
      attachmentBuilder: buildSnapshotAttachment,
      attachmentLabel:   'Attach asset snapshot PDF',
      attachByDefault:   true,
      onSent: function() { setMessage('Snapshot email sent.', false); },
    });
  }

  function exportJson() {
    if (!ensureSnapshotLoaded()) return;
    var json = JSON.stringify(state.data, null, 2);
    downloadBlob(new Blob([json], { type:'application/json' }), 'snapshot-' + safeFileSegment(state.data.vehicle.name) + '.json');
  }

  function snapshotRows() {
    var v   = state.data.vehicle;
    var ds  = state.data.deviceStats || {};
    var vpm = state.data.vpm || {};
    return [
      ['Field','Value'],
      ['Fleet Number', v.name], ['Registration', v.registration], ['State', v.registrationState],
      ['VIN', v.vin], ['Make', v.make], ['Model', v.model],
      ['Ignition', ds.ignition], ['Movement', ds.movement], ['Odometer (km)', ds.odometer],
      ['Location', ds.location], ['RPM', vpm.rpm], ['Speed (km/h)', vpm.speed],
      ['Engine Hours', vpm.hours], ['Oil Temp (C)', vpm.oiltemp],
      ['Oil Pressure (kPa)', vpm.oilpressure], ['Fuel Used (L)', vpm.fuelconsumption],
    ];
  }

  function exportCsv() {
    if (!ensureSnapshotLoaded()) return;
    var rows = snapshotRows();
    var csv = rows.map(function(r) {
      return r.map(function(c) { return '"' + String(c==null?'':c).replace(/"/g,'""') + '"'; }).join(',');
    }).join('\n');
    downloadBlob(new Blob([csv], { type:'text/csv' }), 'snapshot-' + safeFileSegment(state.data.vehicle.name) + '.csv');
  }

  // XLSX export — client-side via SheetJS, matching the same "no server
  // round-trip" approach already used for CSV. Loads the library from CDN
  // on first use only (not bundled), so pages that never export XLSX never
  // pay the load cost.
  var _xlsxLoading = null;
  function loadXlsxLib() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (_xlsxLoading) return _xlsxLoading;
    _xlsxLoading = new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      script.onload = function() { resolve(window.XLSX); };
      script.onerror = function() { reject(new Error('Could not load the Excel export library.')); };
      document.head.appendChild(script);
    });
    return _xlsxLoading;
  }

  async function exportXlsx() {
    if (!ensureSnapshotLoaded()) return;
    setMessage('Preparing Excel file...', false);
    try {
      var XLSX = await loadXlsxLib();
      var rows = snapshotRows();
      var sheet = XLSX.utils.aoa_to_sheet(rows);
      var workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Snapshot');
      var arrayBuffer = XLSX.write(workbook, { bookType:'xlsx', type:'array' });
      downloadBlob(new Blob([arrayBuffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'snapshot-' + safeFileSegment(state.data.vehicle.name) + '.xlsx');
      setMessage('');
    } catch(e) {
      setMessage(e.message || 'Excel export failed.', true);
    }
  }

  // ── Register ──────────────────────────────────────────────────────────────────
  var _orig = TGE.onAppReady;
  TGE.onAppReady = function () {
    if (typeof _orig === 'function') _orig();
    render();
  };

  TGE.onShow['snapshot'] = function() {
    var inp = TGE.el('snap-fleet-input');
    if (inp) inp.focus();
  };

})();
