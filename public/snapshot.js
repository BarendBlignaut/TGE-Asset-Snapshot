// TGE Asset Snapshot — Snapshot Page
// public/snapshot.js

(function () {
  'use strict';

  var DEVICE = { HERMES:'HERMES', CAMERA:'CAMERA', IFACE:'IFACE', ATRACKER:'ATRACKER' };

  // Camera position map — matches the new historical snapshots API response
  var POSITION_MAP = {
    'FRONT':                         'road',
    'ROAD':                          'road',
    'ROAD_FACING':                   'road',
    'DRIVER':                        'driver',
    'DRIVER_FACING':                 'driver',
    'LEFT_PASSENGER':                'ext2',
    'LEFT':                          'ext2',
    'TVI1':                          'ext2',
    'RIGHT_DRIVER':                  'ext1',
    'RIGHT':                         'ext1',
    'TVI2':                          'ext1',
    'UVC':                           'incab',
    'LEFT_BLIND_SPOT':               'incab',
    'RIGHT_BLIND_SPOT':              'ext1',
    'ADDITIONAL_REAR_FACING_CAMERA': 'ext2',
    'UNKNOWN':                       'unsure1',
  };

 var CAMERA_SLOTS = [
    { id:'road',    label:'Road Facing',    source:'ROAD_FACING',  sources:['ROAD']   },
    { id:'driver',  label:'Driver Facing',  source:'DRIVER_FACING',sources:['DRIVER'] },
    { id:'incab',   label:'In-Cab Driver',  source:'MDVR',         sources:['UVC']    },
    { id:'ext1',    label:'Right External', source:'MDVR',         sources:['TVI2']   },
    { id:'ext2',    label:'Left External',  source:'MDVR',         sources:['TVI1']   },
    { id:'unsure1', label:'Additional 1',   source:'',             sources:[]         },
    { id:'unsure2', label:'Additional 2',   source:'',             sources:[]         },
    { id:'unsure3', label:'Additional 3',   source:'',             sources:[]         },
  ];

  var state = {
    running:          false,
    asset:            null,
    devices:          { hermes:null, camera:null, iface:null, tracker:null },
    data:             { vehicle:null, deviceStats:null, vpm:null, gpio:null, cameras:null },
    cameraSlots:      [],       // active slots for this device (2 or 5)
    cameraCapturedAt: null,     // frozen — never updated after initial load
    alignCompleted:   false,    // true only when test ran to completion and panel closed
    alignAfterSlots:  null,     // after-images from completed alignment test
    alignCompletedAt: null,     // timestamp of completed alignment test
  };

  var alignState = { running:false, steps:{}, vehicleId:null };

  var historyState = { loading:false };

  var ALIGN_STEPS = [
    { id:'step-ign-on',   label:'Confirm ignition ON',           type:'poll-ignition', expect:'ON',  timeout:120 },
    { id:'step-trigger',  label:'Send alignment trigger',         type:'trigger'                                  },
    { id:'step-ign-off',  label:'Confirm ignition OFF',          type:'poll-ignition', expect:'OFF', timeout:120 },
    { id:'step-ign-on2',  label:'Confirm ignition ON (restart)', type:'poll-ignition', expect:'ON',  timeout:120 },
    { id:'step-wait',     label:'Wait 30s for camera to reset',  type:'wait',          seconds:30               },
    { id:'step-snapshot', label:'Pull new camera snapshots',      type:'snapshot'                                },
  ];

  // ── Styles ────────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('snap-styles')) return;
    var style = document.createElement('style');
    style.id = 'snap-styles';
    style.textContent = [
      // Export dropdown
      '.snap-hero-menu{position:relative;display:inline-flex;align-items:center;}',
      '.snap-menu-trigger{height:34px;display:inline-flex;align-items:center;gap:8px;padding:0 11px;border-radius:999px;border:1px solid rgba(255,255,255,0.20);background:rgba(255,255,255,0.10);color:rgba(255,255,255,0.82);font-size:11px;font-weight:700;cursor:pointer;transition:background 140ms,border-color 140ms,color 140ms;}',
      '.snap-menu-trigger:hover,.snap-hero-menu.open .snap-menu-trigger{background:rgba(255,255,255,0.18);border-color:rgba(255,255,255,0.34);color:#fff;}',
      '.snap-menu-caret{width:10px;height:10px;opacity:0.75;transition:transform 140ms;}',
      '.snap-hero-menu.open .snap-menu-caret{transform:rotate(180deg);}',
      '.snap-menu-panel{position:fixed;min-width:190px;padding:6px;border-radius:12px;background:#fff;border:1px solid rgba(15,26,19,0.10);box-shadow:0 18px 42px rgba(10,45,20,0.22);display:none;z-index:500;}',
      '.snap-hero-menu.open .snap-menu-panel{display:block;}',
      '.snap-menu-item{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px;border:none;border-radius:9px;background:transparent;color:var(--ink-2);font-size:12px;font-weight:600;text-align:left;cursor:pointer;opacity:0.4;pointer-events:none;}',
      '.snap-menu-item.active{opacity:1;pointer-events:auto;}',
      '.snap-menu-item.active:hover{background:var(--green-50);color:var(--green-800);}',
      // History panel image grid
      '.snap-hist-group{margin-bottom:24px;}',
      '.snap-hist-time{font-size:12px;font-weight:700;color:var(--ink);margin-bottom:8px;}',
      '.snap-hist-grid{display:grid;gap:8px;}',
      '.snap-hist-thumb{aspect-ratio:4/3;border-radius:8px;overflow:hidden;background:var(--surface-2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;}',
      '.snap-hist-thumb img{width:100%;height:100%;object-fit:cover;}',
      '.snap-hist-label{font-size:10px;font-weight:600;color:var(--ink-2);padding-top:4px;}',
      '.snap-hist-status{font-size:10px;color:var(--muted);}',
      // History loading bar
      '.snap-hist-progress{margin-bottom:16px;padding:12px 14px;background:var(--surface-2);border:1px solid var(--line);border-radius:10px;}',
      '.snap-hist-progress-bar{height:4px;background:var(--line);border-radius:999px;margin-top:8px;overflow:hidden;}',
      '.snap-hist-progress-fill{height:100%;background:var(--green-600);border-radius:999px;transition:width 300ms;}',
    ].join('');
    document.head.appendChild(style);
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-snapshot');
    if (!view) return;
    injectStyles();

    view.innerHTML = [
      '<div class="hero">',
        '<div class="hero-kicker">Operations</div>',
        '<div class="hero-title">Asset Snapshot</div>',
        '<div class="hero-sub" style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:2px;">Enter a fleet number to load current location, metrics, diagnostics and camera evidence.</div>',
        '<div class="hero-bar" style="margin-top:12px;">',
          '<div class="hero-bar-left">',
 '<input id="snap-fleet-input"' +
' type="search"' +
' name="snapshot-fleet"' +
' placeholder="Fleet number e.g. 82050"' +
' autocomplete="new-password"' +
' autocorrect="off"' +
' autocapitalize="off"' +
' spellcheck="false"' +
' readonly' +
' onfocus="this.removeAttribute(\'readonly\')"' +
' style="height:34px;border:1px solid rgba(255,255,255,0.25);border-radius:7px;padding:0 12px;background:rgba(255,255,255,0.10);color:#fff;font:inherit;font-size:13px;min-width:180px;" />',
            '<button class="hero-run-btn" id="snap-run-btn" type="button">Run</button>',
            '<button class="hero-action-btn" id="snap-refresh-btn" type="button" style="display:none;">Refresh</button>',
          '</div>',
          '<div class="hero-bar-right">',
            '<div class="hero-divider"></div>',
            TGE.buildOutputPill ? TGE.buildOutputPill('snap', snapshotExportItems()) : '',
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

        // 1 — Vehicle Info
        '<div class="card">',
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

        // 2 — Driver (iFace only)
        '<div class="card" id="snap-driver-card" style="display:none;">',
          '<div class="card-kicker">Driver</div>',
          '<div class="card-title">Currently Logged In</div>',
          '<div class="data-grid data-grid-4">',
            di('snap-driver-name',    'Driver Name'),
            di('snap-driver-user',    'Username'),
            di('snap-driver-licence', 'Licence Number'),
            di('snap-driver-state',   'Licence State'),
          '</div>',
        '</div>',

        // 3 — Live Status (HERMES only)
        '<div class="card" id="snap-status-card" style="display:none;">',
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

        // 4 — VPM (HERMES only)
        '<div class="card" id="snap-vpm-card" style="display:none;">',
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

        // 5 — GPIO (HERMES only)
        '<div class="card" id="snap-gpio-card" style="display:none;">',
          '<div class="card-kicker">GPIO</div>',
          '<div class="card-title">Input / Output Status</div>',
          '<div class="data-grid data-grid-4" id="snap-gpio-grid">',
            '<div class="data-item" style="color:var(--muted);font-size:12px;grid-column:span 4;">Loading GPIO...</div>',
          '</div>',
        '</div>',

        // 6 — Cameras (CAMERA device only)
        '<div class="card" id="snap-camera-card" style="display:none;">',
          '<div class="card-kicker">Evidence</div>',
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">',
            '<div class="card-title" style="margin:0;">Camera Snapshots</div>',
            '<div style="display:flex;gap:8px;">',
              '<button class="btn" id="snap-align-btn" style="height:32px;font-size:12px;background:var(--green-100);color:var(--green-700);border-color:var(--green-600);">⚙ Alignment Test</button>',
              '<button class="btn" id="snap-history-btn" style="height:32px;font-size:12px;">History</button>',
            '</div>',
          '</div>',
          // Current Snapshots — frozen after first load, never updated
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:8px;">Current Snapshots</div>',
          '<div id="snap-camera-grid" style="display:grid;gap:10px;"></div>',
          '<p id="snap-cam-time" style="margin-top:6px;margin-bottom:0;font-size:11px;color:var(--muted);"></p>',

          // Alignment result section — only shown after test completes and panel closes
          '<div id="snap-align-result-section" style="display:none;margin-top:16px;">',
            '<div style="border-top:2px dashed var(--green-600);margin:0 0 16px;"></div>',
            '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--green-600);margin-bottom:4px;">Alignment Test — After</div>',
            '<p id="snap-align-result-time" style="font-size:11px;color:var(--muted);margin-bottom:8px;"></p>',
            '<div id="snap-align-result-grid" style="display:grid;gap:10px;"></div>',
          '</div>',

          // SD Card health
          '<div style="border-top:1px solid var(--line);margin-top:16px;padding-top:14px;" id="snap-sd-section" style="display:none;">',
            '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:8px;">SD Card Health</div>',
            '<div class="data-grid data-grid-3">',
              di('snap-sd1',        'SD Card 1'),
              di('snap-sd2',        'SD Card 2'),
              di('snap-sd-overall', 'Overall Status'),
              di('snap-sd1-size',   'SD Card 1 Size'),
              di('snap-sd2-size',   'SD Card 2 Size'),
            '</div>',
          '</div>',

          // Camera faults
          '<div style="border-top:1px solid var(--line);margin-top:14px;padding-top:14px;" id="snap-faults-section" style="display:none;">',
            '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:8px;">Camera Diagnostics</div>',
            '<div class="data-grid data-grid-3" id="snap-faults-grid"></div>',
          '</div>',
        '</div>',

        // 7 — Map (HERMES only)
        '<div class="card" id="snap-map-card" style="display:none;">',
          '<div class="card-kicker">Location</div>',
          '<div class="card-title">Last Known Position</div>',
          '<div class="data-grid data-grid-3" style="margin-bottom:12px;">',
            di('snap-map-address', 'Address'),
            di('snap-map-lat',     'Latitude'),
            di('snap-map-lng',     'Longitude'),
          '</div>',
          '<div id="snap-map" style="height:300px;border-radius:var(--radius);overflow:hidden;border:1px solid var(--line);background:var(--surface-2);display:flex;align-items:center;justify-content:center;">',
            '<span style="color:var(--muted);font-size:13px;">Map loads after fetch</span>',
          '</div>',
        '</div>',

        // 8 — Asset tracker (ATRACKER only)
        '<div class="card" id="snap-tracker-card" style="display:none;">',
          '<div class="card-kicker">Asset Tracker</div>',
          '<div class="card-title">Last Known Position</div>',
          '<div class="data-grid data-grid-3" style="margin-bottom:14px;">',
            di('snap-tracker-address', 'Location'),
            di('snap-tracker-lat',     'Latitude'),
            di('snap-tracker-lng',     'Longitude'),
            di('snap-tracker-time',    'Last Seen'),
            di('snap-tracker-battery', 'Battery'),
            di('snap-tracker-model',   'Device Model'),
          '</div>',
          '<div id="snap-tracker-map" style="height:280px;border-radius:var(--radius);overflow:hidden;border:1px solid var(--line);background:var(--surface-2);"></div>',
        '</div>',

      '</div>',// end snap-results

    ].join('');

   wireEvents();
    injectAlignPanel();
    injectHistoryPanel();
    injectLightbox();
  }

  function di(id, label) {
    return '<div class="data-item"><span>' + label + '</span><strong id="' + id + '">—</strong></div>';
  }

  // ── Export menu (Export Standard 1) ───────────────────────────────────────────
function snapshotExportItems() {
    return [
      { id:'snap-pdf-btn',   label:'Snapshot PDF', suffix:'PDF',  icon:'📄', permission:['snapshot','export-pdf'],       action: exportPdf },
      { id:'snap-email-btn', label:'Email PDF',    suffix:'Send', icon:'✉️', permission:['snapshot','export-email-pdf'], action: openEmailPdfComposer },
      { id:'snap-csv-btn',   label:'CSV',          suffix:'.csv', icon:'📑', permission:['snapshot','export-csv'],       action: exportCsv },
      { id:'snap-xlsx-btn',  label:'Excel',        suffix:'.xlsx',icon:'📊', permission:['snapshot','export-xlsx'],      action: exportCsv },
      { id:'snap-json-btn',  label:'JSON',         suffix:'.json',icon:'{}', permission:['snapshot','export-json'],      action: exportJson },
    ];
  }

function closeExportMenu() {
    if (TGE.closeOutputPill) TGE.closeOutputPill('snap');
  }

  // ── Inject panels ──────────────────────────────────────────────────────────────
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
         '<div style="font-size:15px;font-weight:700;color:rgba(212,240,38,0.9);" id="snap-hist-title">Fleet — Snapshot History</div>',
        '</div>',
        '<button id="snap-align-close" style="border:none;background:rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:16px;cursor:pointer;width:30px;height:30px;">✕</button>',
      '</div>',
      '<div style="flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:20px;">',
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">',
          // BEFORE — frozen copy of current snapshots
          '<div>',
            '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">BEFORE</div>',
            '<div id="snap-align-before" style="display:grid;gap:6px;"></div>',
          '</div>',
          // AFTER — pre-rendered empty slots, fill when test completes
          '<div>',
            '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--green-600);margin-bottom:8px;">AFTER</div>',
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

function injectLightbox() {
    var existing = document.getElementById('snap-lightbox');
    if (existing) existing.remove();
    var lb = document.createElement('div');
    lb.id = 'snap-lightbox';
    lb.style.cssText = 'display:none;position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.92);flex-direction:column;align-items:center;justify-content:center;';
    lb.innerHTML = [
      '<button id="snap-lb-close" style="position:fixed;top:16px;right:16px;background:rgba(255,255,255,0.15);border:none;border-radius:50%;color:#fff;font-size:22px;width:40px;height:40px;cursor:pointer;z-index:9001;">✕</button>',
      '<button id="snap-lb-prev" style="position:fixed;left:16px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);border:none;border-radius:50%;color:#fff;font-size:28px;width:48px;height:48px;cursor:pointer;z-index:9001;">‹</button>',
      '<button id="snap-lb-next" style="position:fixed;right:16px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);border:none;border-radius:50%;color:#fff;font-size:28px;width:48px;height:48px;cursor:pointer;z-index:9001;">›</button>',
      '<img id="snap-lb-img" src="" style="max-width:90vw;max-height:85vh;object-fit:contain;border-radius:8px;" />',
      '<div id="snap-lb-caption" style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:12px;text-align:center;"></div>',
      '<div id="snap-lb-counter" style="color:rgba(255,255,255,0.5);font-size:11px;margin-top:4px;"></div>',
    ].join('');
    document.body.appendChild(lb);

    lb.addEventListener('click', function(e) { if (e.target === lb) closeLightbox(); });
    document.getElementById('snap-lb-close').onclick = closeLightbox;
    document.getElementById('snap-lb-prev').onclick  = function() { lbNavigate(-1); };
    document.getElementById('snap-lb-next').onclick  = function() { lbNavigate(1); };

    document.addEventListener('keydown', function(e) {
      var lb = TGE.el('snap-lightbox');
      if (!lb || lb.style.display === 'none') return;
      if (e.key === 'Escape')     closeLightbox();
      if (e.key === 'ArrowLeft')  lbNavigate(-1);
      if (e.key === 'ArrowRight') lbNavigate(1);
    });
  }

  var lbGallery = [], lbIndex = 0;

  function openLightbox(images, startIndex) {
    lbGallery = images;
    lbIndex   = startIndex || 0;
    var lb = TGE.el('snap-lightbox');
    if (!lb) return;
    lb.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    lbShow();
  }

  function closeLightbox() {
    var lb = TGE.el('snap-lightbox');
    if (lb) lb.style.display = 'none';
    document.body.style.overflow = '';
    lbGallery = []; lbIndex = 0;
  }

  function lbNavigate(dir) {
    lbIndex = (lbIndex + dir + lbGallery.length) % lbGallery.length;
    lbShow();
  }

  function lbShow() {
    var item    = lbGallery[lbIndex];
    var img     = TGE.el('snap-lb-img');
    var caption = TGE.el('snap-lb-caption');
    var counter = TGE.el('snap-lb-counter');
    if (img)     img.src             = item.url;
    if (caption) caption.textContent = item.label || '';
    if (counter) counter.textContent = (lbIndex + 1) + ' of ' + lbGallery.length;
    var prev = TGE.el('snap-lb-prev');
    var next = TGE.el('snap-lb-next');
    if (prev) prev.style.display = lbGallery.length > 1 ? '' : 'none';
    if (next) next.style.display = lbGallery.length > 1 ? '' : 'none';
  }

  function injectHistoryPanel() {
    var existing = document.getElementById('snap-history-panel');
    if (existing) existing.remove();
    var panel = document.createElement('div');
    panel.id = 'snap-history-panel';
    panel.style.cssText = 'display:none;position:fixed;bottom:0;left:0;right:0;height:90vh;background:var(--surface);border-top:3px solid var(--green-600);z-index:400;flex-direction:column;box-shadow:0 -8px 32px rgba(0,0,0,0.2);';
    panel.innerHTML = [
      '<div style="padding:14px 20px;background:var(--green-900);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">',
        '<div>',
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:rgba(212,240,38,0.7);">Camera History</div>',
          '<div style="font-size:15px;font-weight:700;color:#fff;" id="snap-hist-title">Fleet — Snapshot History</div>',
        '</div>',
        '<button id="snap-hist-close" style="border:none;background:rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:16px;cursor:pointer;width:30px;height:30px;">✕</button>',
      '</div>',
      '<div style="flex:1;overflow-y:auto;padding:20px;" id="snap-hist-body">',
        '<div style="text-align:center;color:var(--muted);padding:40px;font-size:13px;">Loading history...</div>',
      '</div>',
    ].join('');
    document.body.appendChild(panel);
    document.getElementById('snap-hist-close').onclick = closeHistoryPanel;
  }

  // ── Wire events ───────────────────────────────────────────────────────────────
  function wireEvents() {
    TGE.on('snap-run-btn',     'click', runSnapshot);
    TGE.on('snap-refresh-btn', 'click', resetSnapshot);
    TGE.on('snap-fleet-input', 'keydown', function(e) { if (e.key === 'Enter') runSnapshot(); });
    TGE._lbOpen    = function(idx) { openLightbox(TGE._lbGallery || [], idx); };
    TGE._lbGallery = [];

if (TGE.wireOutputPill) {
      TGE.wireOutputPill('snap', snapshotExportItems());
    }
 }

  function resetSnapshot(options) {
    options = options || {};
    var keepInput = options.keepInput === true;

    if (state.running) return;

    state.asset = null;
    state.devices = { hermes:null, camera:null, iface:null, tracker:null };
    state.data = { vehicle:null, deviceStats:null, vpm:null, gpio:null, cameras:null };
    state.cameraSlots = [];
    state.cameraCapturedAt = null;
    state.alignCompleted = false;
    state.alignAfterSlots = null;
    state.alignCompletedAt = null;

    alignState = { running:false, steps:{}, vehicleId:null };
    historyState = { loading:false };

    var input = TGE.el('snap-fleet-input');
    if (input) {
      if (!keepInput) input.value = '';
      input.focus();
    }

    setMessage('');

    TGE.hide('snap-results');
    TGE.show('snap-empty');

    var refreshBtn = TGE.el('snap-refresh-btn');
    if (refreshBtn) refreshBtn.style.display = 'none';

    closeExportMenu();

    var alignPanel = TGE.el('snap-align-panel');
    if (alignPanel) alignPanel.style.display = 'none';

    var historyPanel = TGE.el('snap-history-panel');
    if (historyPanel) historyPanel.style.display = 'none';
  }
  

  // ── Vehicle resolution (improved — checklist item) ────────────────────────────
  function normaliseSearch(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

  function vehicleIdsMatch(a, b) {
    var sa = String(a).trim(), sb = String(b).trim();
    if (!sa || !sb) return false;
    if (sa.toLowerCase() === sb.toLowerCase()) return true;
    // Numeric leading-zero normalisation
    if (/^\d+$/.test(sa) && /^\d+$/.test(sb)) {
      return parseInt(sa, 10) === parseInt(sb, 10);
    }
    return false;
  }

  function resolveVehicle(query, vehicles) {
    var search = normaliseSearch(query);
    if (!search || !Array.isArray(vehicles)) return { vehicle: null, ambiguous: [] };
    var i, v, name, reg;

    // 1 — exact name or registration match
    for (i = 0; i < vehicles.length; i++) {
      v = vehicles[i];
      name = normaliseSearch(v.name);
      reg  = normaliseSearch(v.registration);
      if (name === search || reg === search) return { vehicle: v, ambiguous: [] };
    }

    // 2 — numeric ID match
    if (/^\d+$/.test(query)) {
      for (i = 0; i < vehicles.length; i++) {
        v = vehicles[i];
        if (vehicleIdsMatch(String(v.id), query)) return { vehicle: v, ambiguous: [] };
        // Name is purely numeric — compare as fleet number
        if (/^\d+$/.test(String(v.name || '')) && vehicleIdsMatch(v.name, query)) return { vehicle: v, ambiguous: [] };
      }
      // Digit boundary match — "82050" should not match "182050"
      var hits = vehicles.filter(function(vv) {
        var nm = String(vv.name || '').trim();
        return nm && new RegExp('(?:^|[^0-9])' + query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '(?:[^0-9]|$)').test(nm);
      });
      if (hits.length === 1) return { vehicle: hits[0], ambiguous: [] };
      if (hits.length > 1) {
        return { vehicle: null, ambiguous: hits.map(function(hv) {
          return (hv.name || ('ID ' + hv.id)) + (hv.registration ? ' (' + hv.registration + ')' : '');
        })};
      }
    }

    // 3 — partial name fallback (minimum 2 chars)
    if (search.length >= 2) {
      for (i = 0; i < vehicles.length; i++) {
        v = vehicles[i];
        if (normaliseSearch(v.name).indexOf(search) !== -1) return { vehicle: v, ambiguous: [] };
      }
    }

    return { vehicle: null, ambiguous: [] };
  }

  function clearSnapshotOutputForRun() {
    [
      'snap-driver-card',
      'snap-status-card',
      'snap-vpm-card',
      'snap-gpio-card',
      'snap-camera-card',
      'snap-map-card',
      'snap-tracker-card',
      'snap-align-result-section',
      'snap-sd-section',
      'snap-faults-section'
    ].forEach(function(id) {
      var el = TGE.el(id);
      if (el) el.style.display = 'none';
    });

    [
      'snap-camera-grid',
      'snap-align-result-grid',
      'snap-device-cards',
      'snap-gpio-grid',
      'snap-faults-grid'
    ].forEach(function(id) {
      var el = TGE.el(id);
      if (el) el.innerHTML = '';
    });

    [
      'snap-cam-time',
      'snap-align-result-time',
      'snap-message'
    ].forEach(function(id) {
      var el = TGE.el(id);
      if (el) el.textContent = '';
    });

    var map = TGE.el('snap-map');
    if (map) map.innerHTML = '<span style="color:var(--muted);font-size:13px;">Map loads after fetch</span>';

    var trackerMap = TGE.el('snap-tracker-map');
    if (trackerMap) trackerMap.innerHTML = '';

    closeExportMenu();

    var alignPanel = TGE.el('snap-align-panel');
    if (alignPanel) alignPanel.style.display = 'none';

    var historyPanel = TGE.el('snap-history-panel');
    if (historyPanel) historyPanel.style.display = 'none';
  }
  
  // ── Run snapshot ──────────────────────────────────────────────────────────────
  async function runSnapshot() {
    if (state.running) return;
    var fleetNo = (TGE.el('snap-fleet-input') || {}).value || '';
    fleetNo = fleetNo.trim();
    if (!fleetNo) { setMessage('Enter a fleet number first.', true); return; }

    clearSnapshotOutputForRun();
    resetSnapshot({ keepInput: true });

    state.running        = false; // reset
    state.running        = true;
    state.devices        = { hermes:null, camera:null, iface:null, tracker:null };
    state.data           = { vehicle:null, deviceStats:null, vpm:null, gpio:null, cameras:null };
    state.cameraSlots    = [];
    state.cameraCapturedAt = null;
    state.alignCompleted = false;
    state.alignAfterSlots = null;
    state.alignCompletedAt = null;

    setMessage('Looking up fleet ' + fleetNo + '...', false);
    setBtnState(true);

    // Reset alignment result section
    var alignResult = TGE.el('snap-align-result-section');
    if (alignResult) alignResult.style.display = 'none';

    try {
      // Step 1 — Find vehicle (improved resolution)
      var vRes = await TGE.api('GET', '/api/tn360/v1/vehicles?pruning=B2B');
      if (!vRes.ok) throw new Error('Vehicle lookup failed — ' + (vRes.data && vRes.data.error ? vRes.data.error : 'HTTP ' + vRes.status));
      var vehicles = Array.isArray(vRes.data) ? vRes.data : [];
      if (!vehicles.length) throw new Error('No vehicles returned from TN360.');

      var resolved = resolveVehicle(fleetNo, vehicles);
      if (!resolved.vehicle) {
        if (resolved.ambiguous.length) {
          throw new Error('Multiple vehicles match "' + fleetNo + '" — be more specific: ' + resolved.ambiguous.join('; '));
        }
        throw new Error('Fleet number "' + fleetNo + '" not found. Check the fleet number and try again.');
      }
      var vehicle = resolved.vehicle;

      state.data.vehicle = vehicle;
      populateVehicle(vehicle);
      showResults();
      setMessage('Loading devices...', false);

      // Step 2 — Get devices
      var dRes = await TGE.api('GET', '/api/tn360/v1/vehicles/' + vehicle.id + '/devices?pruning=B2B');
      if (!dRes.ok) throw new Error('Device lookup failed — ' + (dRes.data && dRes.data.error ? dRes.data.error : 'HTTP ' + dRes.status));
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
        ensureCameraCardVisible();
        promises.push(
          TGE.api('GET', '/api/tn360/v1/events?pruning=B2B&types=camera&vehicle_ids=' + vehicle.id)
            .then(function(r) { if (r.ok) processCameraEvents(r.data, vehicle.id); })
        );
        promises.push(
          TGE.api('GET', '/api/tn360/v1/devices/' + state.devices.camera.imei + '?pruning=B2B&embed=devicestats')
            .then(function(r) { if (r.ok) processCameraDeviceStats(r.data); })
        );
      }

      if (state.devices.tracker) {
        promises.push(
          TGE.api('GET', '/api/tn360/v1/devices/' + state.devices.tracker.imei + '?pruning=B2B&embed=devicestats')
            .then(function(r) { if (r.ok) processTrackerStats(r.data); })
        );
      }

      await Promise.all(promises);
      setMessage('');
      var refreshBtn = TGE.el('snap-refresh-btn');
      if (refreshBtn) refreshBtn.style.display = '';
      activateExports();

} catch(e) {
      setMessage(e.message || 'Failed to load asset.', true);
      TGE.diagnostics.log({ category:'Snapshot', level:'Error', module:'snapshot', action:'runSnapshot', message: e.message, error: e });
    } finally {
      state.running = false;
      setBtnState(false);
    }
  }

  // ── Process functions ─────────────────────────────────────────────────────────
  function extractGpsCoords(ds, lastPr) {
    // Defensively check many possible field name/casing variations
    ds = ds || {}; lastPr = lastPr || {};
    var gps = ds.gps || {};
    var pos = ds.position || {};
    function firstFinite(vals) {
      for (var i = 0; i < vals.length; i++) {
        var n = parseFloat(vals[i]);
        if (isFinite(n) && !isNaN(n)) return n;
      }
      return null;
    }
    var lat = firstFinite([gps.Lat, gps.lat, gps.latitude, gps.Latitude, pos.Lat, pos.lat, ds.Lat, ds.lat, lastPr.Lat, lastPr.lat]);
    var lng = firstFinite([gps.Lng, gps.lng, gps.lon, gps.long, gps.longitude, gps.Longitude, pos.Lng, pos.lng, ds.Lng, ds.lng, lastPr.Lng, lastPr.lng]);
    if (lat == null || lng == null) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat: lat, lng: lng };
  }

  function processHermesStats(d) {
    var ds = d.deviceStats || {};
    state.data.deviceStats = ds;

    TGE.show('snap-status-card');
    TGE.show('snap-vpm-card');
    TGE.show('snap-gpio-card');

    setText('snap-ignition', ds.ignition, 'No data');
    setText('snap-movement', ds.movement, 'No data');
    setText('snap-address',  ds.location, 'Location unavailable');
    setText('snap-gps-time', ds.gpsAt ? formatTs(ds.gpsAt) : null, 'No GPS fix');
    setText('snap-odometer', ds.odometer ? Number(ds.odometer).toLocaleString() + ' km' : null, 'No odometer data');

    var lastPr = {};
    try { lastPr = JSON.parse(ds.attrs && (ds.attrs.last_pr || ds.attrs.lastPr) || '{}'); } catch(e) {}
    var coords = extractGpsCoords(ds, lastPr);
    if (coords) {
      setText('snap-lat', coords.lat.toFixed(6));
      setText('snap-lng', coords.lng.toFixed(6));
      setText('snap-speed', lastPr.Spd != null && lastPr.Spd !== '' ? lastPr.Spd + ' km/h' : '—');
     TGE.show('snap-map-card');
      setText('snap-map-address', ds.location || '—');
      setText('snap-map-lat', coords.lat.toFixed(6));
      setText('snap-map-lng', coords.lng.toFixed(6));
      renderMap('snap-map', coords.lat, coords.lng);
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
    TGE.show('snap-driver-card');
    setText('snap-driver-name',    (cu.firstName || '') + ' ' + (cu.lastName || ''));
    setText('snap-driver-user',    cu.username || '—');
    setText('snap-driver-licence', cu.licenceNumber || '—');
    setText('snap-driver-state',   cu.licenceState || '—');
  }

function ensureCameraCardVisible() {
    var card = TGE.el('snap-camera-card');
    if (card) card.style.display = '';
    var alignBtn = TGE.el('snap-align-btn');
    if (alignBtn) alignBtn.onclick = openAlignPanel;
    var histBtn = TGE.el('snap-history-btn');
    if (histBtn) histBtn.onclick = openHistoryPanel;
  }
  
  function processCameraDeviceStats(d) {
    var attrs = (d.deviceStats && d.deviceStats.attrs) || {};

    var sd1     = attrs['lm.sd_card.1']       || '';
    var sd2     = attrs['lm.sd_card.2']       || '';
    var sd1size = attrs['lm.sd_card.1_total_size_bytes'] || '';
    var sd2size = attrs['lm.sd_card.2_total_size_bytes'] || '';
    var sdOver  = attrs['lm.sd_card.overall_status']     || '';

    function fmtSd(val) {
      if (!val) return 'No data';
      if (val === 'sdCardPresent') return 'Present';
      if (val === 'sdCardAbsent')  return 'Not Present';
      if (val === 'sdCardFailed')  return 'Failed';
      return val;
    }
    function fmtBytes(b) {
      if (!b) return '—';
      var n = parseFloat(b);
      if (isNaN(n)) return '—';
      if (n >= 1e12) return (n/1e12).toFixed(1) + ' TB';
      if (n >= 1e9)  return (n/1e9).toFixed(1)  + ' GB';
      if (n >= 1e6)  return (n/1e6).toFixed(1)  + ' MB';
      return n + ' B';
    }

    setText('snap-sd1',        fmtSd(sd1));
    setText('snap-sd2',        fmtSd(sd2));
    setText('snap-sd-overall', sdOver ? sdOver.toUpperCase() : '—');
    setText('snap-sd1-size',   fmtBytes(sd1size));
    setText('snap-sd2-size',   fmtBytes(sd2size));

    var sdSection = TGE.el('snap-sd-section');
    if (sdSection) sdSection.style.display = '';

    var faultKeys = Object.keys(attrs).filter(function(k) { return k.indexOf('lm.ongoing_faults.') === 0; });
    if (faultKeys.length) {
      var faultsGrid    = TGE.el('snap-faults-grid');
      var faultsSection = TGE.el('snap-faults-section');
      if (faultsGrid) {
        faultsGrid.innerHTML = faultKeys.map(function(k) {
          if (k.endsWith('_at')) return '';
          var label = k.replace('lm.ongoing_faults.', '').replace(/_/g,' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
          var val   = attrs[k];
          var isBad = val === 'true' || (val && val !== 'false' && val !== 'CLOSED' && val !== 'ok');
          var color = isBad ? 'var(--danger)' : 'var(--green-600)';
          var icon  = isBad ? '⚠️' : '✅';
          return '<div class="data-item"><span>' + label + '</span>' +
            '<strong style="color:' + color + ';">' + icon + ' ' + val + '</strong></div>';
        }).filter(Boolean).join('');
      }
      if (faultsSection) faultsSection.style.display = '';
    }
  }

  function processTrackerStats(d) {
    var ds = d.deviceStats || {};
    TGE.show('snap-tracker-card');
    setText('snap-tracker-address', ds.location || '—');
    setText('snap-tracker-time',    ds.lastEventAt ? formatTs(ds.lastEventAt) : '—');
    setText('snap-tracker-model',   (d.model && d.model.name) || '—');

    var lastPr = {};
    try { lastPr = JSON.parse(ds.attrs && (ds.attrs.last_pr || ds.attrs.lastPr) || '{}'); } catch(e) {}
    var coords = extractGpsCoords(ds, lastPr);
    if (coords) {
      setText('snap-tracker-lat', coords.lat.toFixed(6));
      setText('snap-tracker-lng', coords.lng.toFixed(6));
      renderMap('snap-tracker-map', coords.lat, coords.lng);
    }
  }

  function processCameraEvents(events, vehicleId) {
    if (!Array.isArray(events) || !events.length) return;

    // Deduplicate by event ID (checklist item)
    var seen = {}, deduped = [];
    events.forEach(function(e) {
      if (e.id != null && seen[e.id]) return;
      if (e.id != null) seen[e.id] = true;
      deduped.push(e);
    });

    var available = deduped.filter(function(e) {
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
    state.cameraSlots = activeSlots;
    state.cameraCapturedAt = latest.timeAt;

   var alignBtn = TGE.el('snap-align-btn');
    if (alignBtn) alignBtn.onclick = openAlignPanel;
    var histBtn = TGE.el('snap-history-btn');
    if (histBtn) histBtn.onclick = openHistoryPanel;

    // Render current snapshots — these are now frozen and never updated
    var grid = TGE.el('snap-camera-grid');
    if (grid) {
      grid.style.gridTemplateColumns = 'repeat(' + slots + ',minmax(0,1fr))';
      // Build gallery for lightbox
      var gallery = activeSlots.map(function(slot) {
        var file = findCameraFile(mediaFiles, slot);
        return { url: file && file.mediaFile ? '/api/image-proxy?url=' + encodeURIComponent(file.mediaFile) : '', label: slot.label };
      }).filter(function(g) { return !!g.url; });
      TGE._lbGallery = gallery;
      TGE._lbOpen = function(idx) { openLightbox(TGE._lbGallery, idx); };
      grid.innerHTML = buildCameraGrid(mediaFiles, activeSlots, gallery, 0);
    }
    var camTime = TGE.el('snap-cam-time');
    if (camTime) camTime.textContent = 'Snapshot captured: ' + formatTs(latest.timeAt);
  }

  function buildCameraGrid(mediaFiles, activeSlots, galleryImages, galleryOffset) {
    return activeSlots.map(function(slot, i) {
      var file     = findCameraFile(mediaFiles, slot);
      var hasImage = file && file.mediaFile;
      var proxyUrl = hasImage ? '/api/image-proxy?url=' + encodeURIComponent(file.mediaFile) : '';
      var galleryIdx = (galleryOffset || 0) + i;
      return '<div>' +
        '<div style="aspect-ratio:4/3;border-radius:8px;overflow:hidden;background:var(--surface-2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;cursor:' + (hasImage?'zoom-in':'default') + ';" ' +
          (hasImage ? 'onclick="TGE._lbOpen(' + galleryIdx + ')"' : '') + '>' +
          (hasImage
            ? '<img src="' + proxyUrl + '" style="width:100%;height:100%;object-fit:cover;" alt="' + slot.label + '" onerror="this.parentElement.innerHTML=\'<span style=&quot;font-size:11px;color:var(--muted);&quot;>Unavailable</span>\'" />'
            : '<span style="font-size:11px;color:var(--muted);">No image</span>') +
        '</div>' +
        '<div style="padding-top:5px;font-size:11px;font-weight:600;color:var(--ink-2);">' + slot.label + '</div>' +
        '<div style="font-size:10px;color:var(--muted);">' + (hasImage ? 'FINISHED' : 'Unavailable') + '</div>' +
      '</div>';
    }).join('');
  }

  // Build camera grid from fresh-URL attachments (history/alignment after)
  function buildCameraGridFromAttachments(attachments, activeSlots, galleryImages, galleryOffset) {
    var bySlotId = {};
    var unmapped = [];
    attachments.forEach(function(att) {
      var slotId = POSITION_MAP[String(att.position || '').toUpperCase()];
      if (slotId) {
        bySlotId[slotId] = att.url;
      } else if (att.url) {
        unmapped.push({ url: att.url, position: att.position || 'Unknown' });
      }
    });
    var unsureIdx  = 0;
    var unsureSlots = ['unsure1', 'unsure2', 'unsure3'];
    unmapped.forEach(function(u) {
      if (unsureIdx < unsureSlots.length) {
        bySlotId[unsureSlots[unsureIdx]] = u.url;
        unsureIdx++;
      }
    });
    return activeSlots.map(function(slot, i) {
      var url = bySlotId[slot.id];
      var proxyUrl = url ? '/api/image-proxy?url=' + encodeURIComponent(url) : '';
      var galleryIdx = (galleryOffset || 0) + i;
      return '<div>' +
        '<div style="aspect-ratio:4/3;border-radius:8px;overflow:hidden;background:var(--surface-2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;cursor:' + (url?'zoom-in':'default') + ';" ' +
          (url ? 'onclick="TGE._lbOpen(' + galleryIdx + ')"' : '') + '>' +
          (url
            ? '<img src="' + proxyUrl + '" style="width:100%;height:100%;object-fit:cover;" alt="' + slot.label + '" onerror="this.parentElement.innerHTML=\'<span style=&quot;font-size:11px;color:var(--muted);&quot;>Unavailable</span>\'" />'
            : '<span style="font-size:11px;color:var(--muted);">No image</span>') +
        '</div>' +
        '<div style="padding-top:5px;font-size:11px;font-weight:600;color:var(--ink-2);">' + slot.label + '</div>' +
        '<div style="font-size:10px;color:var(--muted);">' + (url ? 'FINISHED' : 'Unavailable') + '</div>' +
      '</div>';
    }).join('');
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

  // ── Alignment test ────────────────────────────────────────────────────────────
  function openAlignPanel() {
    var vehicle = state.data.vehicle;
    if (!vehicle) return;
    alignState.running   = false;
    alignState.steps     = {};
    alignState.vehicleId = vehicle.id;

    var cam   = state.devices.camera;
    var model = cam && cam.model && cam.model.name;
    var slots = model === 'MultiIQ' ? 5 : 2;
    var activeSlots = CAMERA_SLOTS.slice(0, slots);

    setText('snap-align-title', vehicle.name + ' — Alignment Test');

    // BEFORE — clone frozen current snapshots grid
    var beforeGrid  = TGE.el('snap-align-before');
    var currentGrid = TGE.el('snap-camera-grid');
    if (beforeGrid && currentGrid) {
      beforeGrid.innerHTML = currentGrid.innerHTML;
      beforeGrid.style.gridTemplateColumns = 'repeat(' + slots + ',minmax(0,1fr))';
    }

    // AFTER — pre-render empty placeholder slots (correct count for device)
    var afterGrid = TGE.el('snap-align-after');
    if (afterGrid) {
      afterGrid.style.gridTemplateColumns = 'repeat(' + slots + ',minmax(0,1fr))';
      afterGrid.innerHTML = activeSlots.map(function(slot) {
        return '<div>' +
          '<div style="aspect-ratio:4/3;border-radius:8px;overflow:hidden;background:var(--surface-2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;">' +
            '<span style="font-size:11px;color:var(--muted-2);">Waiting...</span>' +
          '</div>' +
          '<div style="padding-top:5px;font-size:11px;font-weight:600;color:var(--ink-2);">' + slot.label + '</div>' +
          '<div style="font-size:10px;color:var(--muted);">Pending</div>' +
        '</div>';
      }).join('');
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
    // Stop any running polls immediately
    alignState.running = false;

    var panel = TGE.el('snap-align-panel');
    if (panel) panel.style.display = 'none';

    // If test completed, show after images on main page
    if (state.alignCompleted && state.alignAfterSlots) {
      var cam     = state.devices.camera;
      var model   = cam && cam.model && cam.model.name;
      var slots   = model === 'MultiIQ' ? 5 : 2;
      var activeSlots = CAMERA_SLOTS.slice(0, slots);

      var resultGrid = TGE.el('snap-align-result-grid');
      if (resultGrid) {
        resultGrid.style.gridTemplateColumns = 'repeat(' + slots + ',minmax(0,1fr))';
        resultGrid.innerHTML = buildCameraGridFromAttachments(state.alignAfterSlots, activeSlots);
      }
      var resultTime = TGE.el('snap-align-result-time');
      if (resultTime) resultTime.textContent = 'Captured: ' + formatTs(state.alignCompletedAt);

      var resultSection = TGE.el('snap-align-result-section');
      if (resultSection) resultSection.style.display = '';
    }
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
    alignState.running    = true;
    alignState.steps      = {};
    state.alignCompleted  = false;
    state.alignAfterSlots = null;

    var startBtn = TGE.el('snap-align-start');
    if (startBtn) { startBtn.textContent = 'Running...'; startBtn.disabled = true; }
    var hermesImei = state.devices.hermes && state.devices.hermes.imei;

    try {
      for (var i = 0; i < ALIGN_STEPS.length; i++) {
        if (!alignState.running) break;
        var step = ALIGN_STEPS[i];
        setAlignStep(step.id, 'running');

if (step.type === 'poll-ignition') {
          // SIMULATION — skip real ignition polling, tick through with delay
          setAlignStep(step.id, 'running', 'Simulation mode');
          await delay(2000);
          if (!alignState.running) break;
          setAlignStep(step.id, 'done', 'Simulation — Ignition ' + step.expect);
} else if (step.type === 'trigger') {
          setAlignStep(step.id, 'running', 'Simulation mode');
          await delay(2000);
          if (!alignState.running) break;
          setAlignStep(step.id, 'done', 'Simulation — endpoint TBC');

        } else if (step.type === 'wait') {
          setAlignStep(step.id, 'running', 'Simulating wait...');
          await delay(2000);
          if (!alignState.running) break;
          setAlignStep(step.id, 'done', 'Complete');

        } else if (step.type === 'snapshot') {
          setAlignStep(step.id, 'running', 'Loading images...');
          await delay(2000);
          if (!alignState.running) break;
          // SIMULATION — use current frozen snapshots as the AFTER images
          // Replace with real pullAlignmentSnapshots() when Teletrac endpoint is confirmed
          var afterData = simulateAlignmentSnapshots();
          if (!afterData) throw new Error('No current snapshots to simulate with');
          // Populate AFTER grid in panel
          var afterGrid = TGE.el('snap-align-after');
          var cam       = state.devices.camera;
          var model     = cam && cam.model && cam.model.name;
          var slots     = model === 'MultiIQ' ? 5 : 2;
          var activeSlots = CAMERA_SLOTS.slice(0, slots);
          if (afterGrid) {
            afterGrid.style.gridTemplateColumns = 'repeat(' + slots + ',minmax(0,1fr))';
            afterGrid.innerHTML = buildCameraGridFromAttachments(afterData.attachments, activeSlots);
          }
          var afterMsg = TGE.el('snap-align-after-msg');
          if (afterMsg) afterMsg.style.display = 'none';
          // Store for display on main page after close
          state.alignAfterSlots  = afterData.attachments;
          state.alignCompletedAt = afterData.timeAt;
          state.alignCompleted   = true;
          setAlignStep(step.id, 'done', 'Images loaded');
        }
      }

      if (alignState.running) {
        setText('snap-align-status', '✅ Test complete');
        if (startBtn) { startBtn.textContent = 'Test Complete'; }
      }

} catch(e) {
      ALIGN_STEPS.forEach(function(s) {
        if (alignState.steps[s.id] === 'running') setAlignStep(s.id, 'error', e.message);
      });
setText('snap-align-status', '❌ ' + e.message);
      if (startBtn) { startBtn.textContent = 'Retry Test'; startBtn.disabled = false; }
      TGE.diagnostics.log({ category:'Snapshot', level:'Error', module:'snapshot', action:'alignmentTest', message: e.message, error: e, step: alignState.steps });
    } finally {
      alignState.running = false;
    }
  }

  async function pollIgnition(imei, expect, timeoutSecs) {
    if (!imei) return true;
    var deadline = Date.now() + timeoutSecs * 1000;
    while (alignState.running && Date.now() < deadline) {
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

  // SIMULATION — builds fake afterData from the current frozen snapshots
  // Remove this and use pullAlignmentSnapshots() when Teletrac endpoint is confirmed
  function simulateAlignmentSnapshots() {
    var mediaFiles  = state.data.cameras;
    var cam         = state.devices.camera;
    var model       = cam && cam.model && cam.model.name;
    var slots       = model === 'MultiIQ' ? 5 : 2;
    var activeSlots = CAMERA_SLOTS.slice(0, slots);

    if (!mediaFiles || !mediaFiles.length) return null;

    var attachments = activeSlots.map(function(slot) {
      var file = findCameraFile(mediaFiles, slot);
      return { position: slot.id.toUpperCase(), url: file && file.mediaFile ? file.mediaFile : '' };
    });

    return { attachments: attachments, timeAt: state.cameraCapturedAt };
  }

  // Pull snapshots for alignment AFTER — uses standard events endpoint for now
  // (will switch to historical snapshots API once TN360 trigger endpoint is confirmed)
  async function pullAlignmentSnapshots() {
    var vehicle = state.data.vehicle;
    var vid     = vehicle && vehicle.id;
    var r = await TGE.api('GET', '/api/tn360/v1/events?pruning=B2B&types=camera&vehicle_ids=' + vid);
    if (!r.ok) throw new Error('Camera fetch failed — ' + (r.data && r.data.error ? r.data.error : 'HTTP ' + r.status));

    var available = (Array.isArray(r.data) ? r.data : []).filter(function(e) {
      return String(e.vehicleId) === String(vid) && e.attributes && e.attributes.status === 'available';
    });
    // Only use snapshots newer than the original current snapshot
    if (state.cameraCapturedAt) {
      var originalTime = new Date(state.cameraCapturedAt).getTime();
      available = available.filter(function(e) { return new Date(e.timeAt).getTime() > originalTime; });
    }
    if (!available.length) throw new Error('No new snapshots available yet — the camera may need more time');
    available.sort(function(a,b) { return new Date(b.timeAt) - new Date(a.timeAt); });
    var latest = available[0];

    var ctx;
    try { ctx = JSON.parse(latest.attributes.context); } catch(e) { throw new Error('Could not parse camera context'); }
    if (!ctx || !ctx.response || !ctx.response.mediaFiles) throw new Error('No media files in snapshot response');

    var mediaFiles  = ctx.response.mediaFiles;
    var cam         = state.devices.camera;
    var model       = cam && cam.model && cam.model.name;
    var slots       = model === 'MultiIQ' ? 5 : 2;
    var activeSlots = CAMERA_SLOTS.slice(0, slots);

    // Map to { position, url } shape matching buildCameraGridFromAttachments
    var attachments = activeSlots.map(function(slot) {
      var file = findCameraFile(mediaFiles, slot);
      return { position: slot.id.toUpperCase(), url: file && file.mediaFile ? file.mediaFile : '' };
    });

    return { attachments: attachments, timeAt: latest.timeAt };
  }

  function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  // ── History panel ─────────────────────────────────────────────────────────────
  function openHistoryPanel() {
    var vehicle = state.data.vehicle;
    var cam     = state.devices.camera;
    if (!vehicle || !cam) return;

    var panel = TGE.el('snap-history-panel');
    if (!panel) return;

    var closeBtn = document.getElementById('snap-hist-close');
    if (closeBtn) closeBtn.onclick = closeHistoryPanel;

    setText('snap-hist-title', vehicle.name + ' — Snapshot History');
    panel.style.display = 'flex';

    loadHistory(vehicle, cam);
  }

  function closeHistoryPanel() {
    historyState.loading = false;
    var panel = TGE.el('snap-history-panel');
    if (panel) panel.style.display = 'none';
  }

  async function loadHistory(vehicle, cam) {
    if (historyState.loading) return;
    historyState.loading = true;

    var body = TGE.el('snap-hist-body');
    if (!body) return;

    var model       = cam && cam.model && cam.model.name;
    var slots       = model === 'MultiIQ' ? 5 : 2;
    var activeSlots = CAMERA_SLOTS.slice(0, slots);

    // Show loading state
    body.innerHTML = [
      '<div class="snap-hist-progress" id="snap-hist-prog">',
        '<div style="font-size:12px;font-weight:600;color:var(--ink);" id="snap-hist-prog-text">Loading snapshot history...</div>',
        '<div class="snap-hist-progress-bar"><div class="snap-hist-progress-fill" id="snap-hist-prog-fill" style="width:30%"></div></div>',
      '</div>',
      '<div id="snap-hist-results"></div>',
    ].join('');

 var vehicleId = vehicle.id;

    // Step 1 — fetch events from D1
    var histRes = await TGE.api('GET', '/api/camera-history/vehicle/' + vehicleId + '?limit=200');
    if (!histRes.ok) {
      var resEl = TGE.el('snap-hist-results');
      if (resEl) resEl.innerHTML = '<div style="text-align:center;color:var(--danger);padding:40px;font-size:13px;">Failed to load history.</div>';
      historyState.loading = false;
      return;
    }

    var events = (histRes.data && histRes.data.events) || [];

    // Filter to last 14 days
    var cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
    events = events.filter(function(ev) {
      return new Date(ev.capturedAt).getTime() >= cutoff;
    });

    var prog = TGE.el('snap-hist-prog');
    var progText = TGE.el('snap-hist-prog-text');
    var progFill = TGE.el('snap-hist-prog-fill');
    var resEl = TGE.el('snap-hist-results');

    if (!events.length) {
      if (prog) prog.style.display = 'none';
      if (resEl) resEl.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px;font-size:13px;">No camera history found for the last 14 days.</div>';
      historyState.loading = false;
      return;
    }

    // Update progress
    if (progText) progText.textContent = 'Loading ' + events.length + ' snapshot events...';
    if (progFill) progFill.style.width = '10%';

    // Build global lightbox gallery for history
    var histGallery = [];

    // Step 2 — process events in batches, fetch fresh URLs, render progressively
    var BATCH = 10;
    var rendered = 0;

    for (var b = 0; b < events.length; b += BATCH) {
      if (!historyState.loading) break;

      var batch = events.slice(b, b + BATCH);

      // Collect all attachment IDs for this batch
      var allAtts = [];
      batch.forEach(function(ev) {
        (ev.attachments || []).forEach(function(att) {
          if (att.attachmentStatus === 'AVAILABLE') {
            allAtts.push({
              attachmentId: att.attachmentId,
              position:     att.cameraPosition,
              timeAt:       att.timeAt,
              eventId:      ev.eventId,
            });
          }
        });
      });

      // Fetch fresh URLs for this batch
      var freshUrls = {};
      if (allAtts.length) {
        try {
          var urlRes = await TGE.api('POST', '/api/historical-snapshots/attachments', {
            attachments: allAtts.map(function(a) {
              return { attachmentId: a.attachmentId, position: a.position, timeAt: a.timeAt };
            }),
          });
          if (urlRes.ok && urlRes.data && Array.isArray(urlRes.data.attachments)) {
            urlRes.data.attachments.forEach(function(r, i) {
              if (r.url) freshUrls[allAtts[i].attachmentId] = r.url;
            });
          }
        } catch(e) {
          TGE.diagnostics.log({ category:'History', level:'Warn', module:'snapshot', action:'loadHistory', message: e.message });
        }
      }

      // Render this batch
      var batchHtml = batch.map(function(ev) {
        var attachments = (ev.attachments || []).map(function(att) {
          return {
            position: att.cameraPosition,
            url:      freshUrls[att.attachmentId] || '',
          };
        });

        // Build gallery entries for lightbox
        var eventGalleryStart = histGallery.length;
        attachments.forEach(function(att) {
          if (att.url) {
            var slotId = POSITION_MAP[String(att.position || '').toUpperCase()];
            var slot   = CAMERA_SLOTS.find(function(s) { return s.id === slotId; });
            histGallery.push({
              url:   '/api/image-proxy?url=' + encodeURIComponent(att.url),
              label: (slot ? slot.label : att.position) + ' · ' + formatTs(ev.capturedAt),
            });
          }
        });

        var gridHtml = buildCameraGridFromAttachments(attachments, activeSlots, histGallery, eventGalleryStart);

        return '<div class="snap-hist-group">' +
          '<div class="snap-hist-time" style="color:var(--ink);font-size:12px;font-weight:700;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--line);">' +
            formatTs(ev.capturedAt) +
          '</div>' +
          '<div class="snap-hist-grid" style="grid-template-columns:repeat(' + slots + ',minmax(0,1fr));gap:8px;">' +
            gridHtml +
          '</div>' +
        '</div>';
      }).join('');

      // Append to results
      if (resEl) resEl.innerHTML += batchHtml;

      // Update gallery reference so lightbox has all images
      TGE._lbGallery = histGallery;
      TGE._lbOpen    = function(idx) { openLightbox(TGE._lbGallery, idx); };

      rendered += batch.length;
      var pct = Math.round((rendered / events.length) * 100);
      if (progFill) progFill.style.width = pct + '%';
      if (progText)  progText.textContent = rendered + ' of ' + events.length + ' events loaded...';

      // Small pause to keep UI responsive
      await new Promise(function(r) { setTimeout(r, 50); });
    }

    if (prog) prog.style.display = 'none';
    historyState.loading = false;
  }

  function renderHistoryGroups(groups, activeSlots, slots) {
    var results = TGE.el('snap-hist-results');
    if (!results) return;
    results.innerHTML = groups.map(function(group) {
      var gridHtml = buildCameraGridFromAttachments(group.attachments, activeSlots);
      return '<div class="snap-hist-group">' +
        '<div class="snap-hist-time">' + formatTs(group.timeAt) + '</div>' +
        '<div class="snap-hist-grid" style="grid-template-columns:repeat(' + slots + ',minmax(0,1fr));gap:8px;">' +
          gridHtml +
        '</div>' +
      '</div>';
    }).join('');
  }

  // Convert Date to AEST ISO string with URL-safe encoding (kept for reference)
function toAestIso(d) {
    // DST-aware AEST/AEDT offset using Intl
    var pad = function(n) { return String(n).padStart(2,'0'); };
    var offsetMins = -new Date(d).toLocaleString('en-AU', { timeZone:'Australia/Sydney', timeZoneName:'shortOffset' })
      .split('GMT')[1].split(':').reduce(function(h, m, i) { return h + (i === 0 ? parseInt(m) * 60 : parseInt(m)); }, 0);
    var local = new Date(d.getTime() - offsetMins * 60 * 1000);
    var absOffset = Math.abs(offsetMins);
    var sign = offsetMins <= 0 ? '%2B' : '-';
    var oh = pad(Math.floor(absOffset / 60));
    var om = pad(absOffset % 60);
    return local.getUTCFullYear() + '-' +
      pad(local.getUTCMonth() + 1) + '-' +
      pad(local.getUTCDate()) + 'T' +
      pad(local.getUTCHours()) + '%3A' +
      pad(local.getUTCMinutes()) + '%3A' +
      pad(local.getUTCSeconds()) + sign + oh + '%3A' + om;
  }

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

 // TGE.show() removed — use TGE.show() directly

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

function activateExports() {
    if (TGE.wireOutputPill) {
      TGE.wireOutputPill('snap', snapshotExportItems());
    }
  }

  function renderMap(containerId, lat, lng) {
    var el = TGE.el(containerId);
    if (!el) return;
    if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      el.innerHTML = '<span style="color:var(--muted);font-size:13px;">Map unavailable — invalid coordinates</span>';
      return;
    }
    var latS = lat.toFixed(6), lngS = lng.toFixed(6);
    var src = 'https://www.openstreetmap.org/export/embed.html?bbox=' +
      (lng-0.02).toFixed(6) + '%2C' + (lat-0.02).toFixed(6) + '%2C' +
      (lng+0.02).toFixed(6) + '%2C' + (lat+0.02).toFixed(6) +
      '&layer=mapnik&marker=' + latS + '%2C' + lngS + '&_=' + Date.now();
    el.innerHTML = '<iframe title="Last known position map" src="' + src + '" style="width:100%;height:100%;border:none;display:block;" loading="eager"></iframe>';
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

function buildSnapshotPayload() {
    var v    = state.data.vehicle    || {};
    var ds   = state.data.deviceStats || {};
    var vpm  = state.data.vpm        || {};
    var gpio = state.data.gpio       || {};
    var ovm  = v.operationalVehicleModel || {};
    var make = ovm.make  || v.make  || '—';
    var model = ovm.model || v.model || '—';
    var year  = ovm.yearOfManufacture || '—';

    var sections = [];

    // 1 — Vehicle Information
    sections.push({
      kicker: 'Vehicle',
      title:  'Vehicle Information',
      rows: [
        ['Fleet Number',  v.name || '—'],
        ['Registration',  v.registration || '—'],
        ['State',         v.registrationState || '—'],
        ['VIN',           v.vin || '—'],
        ['Make',          make],
        ['Model',         model],
        ['Year',          year],
        ['Vehicle Type',  v.type && v.type.name ? v.type.name : '—'],
      ]
    });

    // 2 — Devices
    var deviceList = TGE.el('snap-device-cards');
    var deviceRows = [];
    var devKeys = ['hermes', 'camera', 'iface', 'tracker'];
    devKeys.forEach(function(key) {
      var d = state.devices[key];
      if (!d) return;
      var code  = (d.type && d.type.code)   || key.toUpperCase();
      var dModel = (d.model && d.model.name) || '—';
      deviceRows.push([code + ' / ' + dModel, (d.imei || d.serialNumber || '—')]);
    });
    if (deviceRows.length) {
      sections.push({
        kicker: 'Hardware',
        title:  'Assigned Devices',
        rows:   deviceRows
      });
    }

    // 3 — Live Status (Hermes only)
    if (state.devices.hermes) {
      var lastPr = {};
      try { lastPr = JSON.parse(ds.attrs && (ds.attrs.last_pr || ds.attrs.lastPr) || '{}'); } catch(e) {}
      var coords = extractGpsCoords(ds, lastPr);
      sections.push({
        kicker: 'Telematics',
        title:  'Live Status',
        rows: [
          ['Ignition',   ds.ignition  || '—'],
          ['Movement',   ds.movement  || '—'],
          ['Speed',      lastPr.Spd != null && lastPr.Spd !== '' ? lastPr.Spd + ' km/h' : '—'],
          ['Odometer',   ds.odometer  ? Number(ds.odometer).toLocaleString() + ' km' : '—'],
          ['Location',   ds.location  || '—'],
          ['Last GPS',   ds.gpsAt     ? formatTs(ds.gpsAt) : '—'],
          ['Latitude',   coords       ? coords.lat.toFixed(6) : '—'],
          ['Longitude',  coords       ? coords.lng.toFixed(6) : '—'],
        ]
      });

      // 4 — Engine Metrics
      sections.push({
        kicker: 'Engine',
        title:  'Engine Metrics — VPM Last Reading',
        rows: [
          ['RPM',            vpm.rpm            != null && vpm.rpm            !== -1 ? vpm.rpm + ' rpm'                                          : '—'],
          ['Speed (CAN)',     vpm.speed          != null && vpm.speed          !== -1 ? vpm.speed + ' km/h'                                       : '—'],
          ['Engine Hours',   vpm.hours          != null && vpm.hours          !== -1 ? Number(vpm.hours).toLocaleString() + ' hrs'               : '—'],
          ['Total Fuel Used',vpm.fuelconsumption!= null && vpm.fuelconsumption!== -1 ? Number(vpm.fuelconsumption).toLocaleString() + ' L'       : '—'],
          ['Oil Temperature',vpm.oiltemp        != null && vpm.oiltemp        !== -1 ? vpm.oiltemp + ' °C'                                       : '—'],
          ['Oil Pressure',   vpm.oilpressure    != null && vpm.oilpressure    !== -1 ? vpm.oilpressure + ' kPa'                                  : '—'],
          ['Engine Load',    vpm.engineload     != null && vpm.engineload     !== -1 ? vpm.engineload + ' %'                                     : '—'],
          ['VPM Recorded',   ds.lastVpmAt        ? formatTs(ds.lastVpmAt) : '—'],
        ]
      });

      // 5 — GPIO
      var gpioRows = Object.keys(gpio).map(function(k) {
        var g = gpio[k] || {};
        return [
          (g.noun || k) + (g.which && g.which !== 'unknown' ? ' (' + g.which + ')' : ''),
          g.verb || '—'
        ];
      });
      if (gpioRows.length) {
        sections.push({ kicker: 'I/O', title: 'GPIO — Input / Output Status', rows: gpioRows });
      }

      // 6 — Location map (static image via OSM)
      if (coords) {
        sections.push({
          kicker: 'Location',
          title:  'Last Known Position',
          rows: [
            ['Address',   ds.location || '—'],
            ['Latitude',  coords.lat.toFixed(6)],
            ['Longitude', coords.lng.toFixed(6)],
          ],
          mapCoords: { lat: coords.lat, lng: coords.lng }
        });
      }
    }

    // 7 — Camera Evidence
    if (state.devices.camera && state.data.cameras && state.cameraSlots.length) {
      var mediaFiles  = state.data.cameras;
      var activeSlots = state.cameraSlots;
      var photos = activeSlots.map(function(slot) {
        var file = findCameraFile(mediaFiles, slot);
        return {
          label:  slot.label,
          url:    file && file.mediaFile ? file.mediaFile : null,
          status: file && file.status === 'FINISHED' ? 'working' : null
        };
      });
      sections.push({
        kicker: 'Evidence',
        title:  'Camera Snapshots',
        rows: [
          ['Captured', state.cameraCapturedAt ? formatTs(state.cameraCapturedAt) : '—'],
          ['Model',    state.devices.camera && state.devices.camera.model ? state.devices.camera.model.name : '—'],
        ],
        photos: photos
      });

// 7b — Alignment Test After (only if test completed)
      if (state.alignCompleted && state.alignAfterSlots && state.alignAfterSlots.length) {
        var bySlotId = {};
        state.alignAfterSlots.forEach(function(att) {
          var slotId = POSITION_MAP[String(att.position || '').toUpperCase()];
          if (slotId) bySlotId[slotId] = att.url;
        });
        var afterPhotos = state.cameraSlots.map(function(slot) {
          return {
            label: slot.label,
            url:   bySlotId[slot.id] || null,
          };
        });
        sections.push({
          kicker: 'Alignment Test — After',
          title:  'Alignment Test — After   ·   ' + (state.alignCompletedAt ? formatTs(state.alignCompletedAt) : ''),
          photos: afterPhotos,
          rows:   [],
        });
      }

      // 8 — SD Card Health
      var sdEl1     = TGE.el('snap-sd1');
      var sdEl2     = TGE.el('snap-sd2');
      var sdOver    = TGE.el('snap-sd-overall');
      var sdSize1   = TGE.el('snap-sd1-size');
      var sdSize2   = TGE.el('snap-sd2-size');
      var sdSection = TGE.el('snap-sd-section');
      if (sdSection && sdSection.style.display !== 'none') {
        sections.push({
          kicker: 'Storage',
          title:  'SD Card Health',
          rows: [
            ['SD Card 1',        sdEl1   ? sdEl1.textContent   : '—'],
            ['SD Card 2',        sdEl2   ? sdEl2.textContent   : '—'],
            ['Overall Status',   sdOver  ? sdOver.textContent  : '—'],
            ['SD Card 1 Size',   sdSize1 ? sdSize1.textContent : '—'],
            ['SD Card 2 Size',   sdSize2 ? sdSize2.textContent : '—'],
          ]
        });
      }
    }

    // 9 — Asset Tracker
    if (state.devices.tracker) {
      var trackerDs = ds;
      var trackerLastPr = {};
      try { trackerLastPr = JSON.parse(trackerDs.attrs && (trackerDs.attrs.last_pr || trackerDs.attrs.lastPr) || '{}'); } catch(e) {}
      var trackerAddrEl   = TGE.el('snap-tracker-address');
      var trackerTimeEl   = TGE.el('snap-tracker-time');
      var trackerBattEl   = TGE.el('snap-tracker-battery');
      var trackerModelEl  = TGE.el('snap-tracker-model');
      var trackerLatEl    = TGE.el('snap-tracker-lat');
      var trackerLngEl    = TGE.el('snap-tracker-lng');
      var tLat = trackerLatEl  ? parseFloat(trackerLatEl.textContent)  : null;
      var tLng = trackerLngEl  ? parseFloat(trackerLngEl.textContent) : null;
      var trackerSection = {
        kicker: 'Asset Tracker',
        title:  'Last Known Position',
        rows: [
          ['Location',   trackerAddrEl  ? trackerAddrEl.textContent  : '—'],
          ['Latitude',   trackerLatEl   ? trackerLatEl.textContent   : '—'],
          ['Longitude',  trackerLngEl   ? trackerLngEl.textContent   : '—'],
          ['Last Seen',  trackerTimeEl  ? trackerTimeEl.textContent  : '—'],
          ['Battery',    trackerBattEl  ? trackerBattEl.textContent  : '—'],
          ['Model',      trackerModelEl ? trackerModelEl.textContent : '—'],
        ]
      };
      if (tLat && tLng && !isNaN(tLat) && !isNaN(tLng)) {
        trackerSection.mapCoords = { lat: tLat, lng: tLng };
      }
      sections.push(trackerSection);
    }

    // ── Normalise sections into the shape buildSnapshotPdf expects ────────────
 return {
      asset: {
        legacyNo:    v.name || '—',
        registration: v.registration || '—',
        state:       v.registrationState || '—',
        vehicleType: v.type && v.type.name ? v.type.name : null,
        title:       'Asset ' + (v.name || '—') + ' — Snapshot',
        generatedAt: new Date().toISOString(),
        sections:    sections.map(function(s) {
          return {
            label:  s.kicker || s.title || null,
            cols:   s.cols   || 4,
            rows:   (s.rows || []).map(function(r) { return { label: r[0], value: r[1] }; }),
          photos: s.photos || null,
          };
        })
      }
    };
  }

  // ── Exports ───────────────────────────────────────────────────────────────────
  function openEmailPdfComposer() {
    if (!state.data.vehicle) {
      setMessage('Run Snapshot before sending email.', true);
      return;
    }

    if (typeof TGE.openEmailComposer !== 'function') {
      setMessage('Email Composer is not available.', true);
      return;
    }

    var v   = state.data.vehicle || {};
    var ds  = state.data.deviceStats || {};
    var vpm = state.data.vpm || {};

    TGE.openEmailComposer({
      rows: [{
        fleetNo:      v.name || '—',
        registration: v.registration || '—',
        state:        v.registrationState || '—',
        vin:          v.vin || '—',
        make:         v.make || '—',
        model:        v.model || '—',
        ignition:     ds.ignition || '—',
        movement:     ds.movement || '—',
        odometer:     ds.odometer ? Number(ds.odometer).toLocaleString() + ' km' : '—',
        location:     ds.location || '—',
        rpm:          vpm.rpm != null ? vpm.rpm + ' rpm' : '—',
        engineHours:  vpm.hours != null ? Number(vpm.hours).toLocaleString() + ' hrs' : '—',
        fuelUsed:     vpm.fuelconsumption != null ? Number(vpm.fuelconsumption).toLocaleString() + ' L' : '—',
      }],
      fields: [
        { key: 'fleetNo',      label: 'Fleet Number' },
        { key: 'registration', label: 'Registration' },
        { key: 'state',        label: 'State' },
        { key: 'vin',          label: 'VIN' },
        { key: 'make',         label: 'Make' },
        { key: 'model',        label: 'Model' },
        { key: 'ignition',     label: 'Ignition' },
        { key: 'movement',     label: 'Movement' },
        { key: 'odometer',     label: 'Odometer' },
        { key: 'location',     label: 'Location' },
        { key: 'rpm',          label: 'RPM' },
        { key: 'engineHours',  label: 'Engine Hours' },
        { key: 'fuelUsed',     label: 'Fuel Used' },
      ],
      attachmentBuilder: function() {
        return TGE.PDF.attachment({
          route:   '/api/snapshot-pdf',
          module:  'Snapshot',
          type:    'Report',
          payload: buildSnapshotPayload()
        });
      },
      attachmentLabel:  'Attach Snapshot PDF',
      attachByDefault:  true,
      onSent: function() {
        setMessage('Snapshot email sent.', false);
      }
    });
  }

  async function exportPdf() {
  if (!state.data.vehicle) {
    setMessage('Run Snapshot before exporting PDF.', true);
    return;
  }

  try {
    await TGE.PDF.download({
      route: '/api/snapshot-pdf',
      module: 'Snapshot',
      type: 'Report',
      payload: buildSnapshotPayload()
    });
} catch (e) {
    setMessage(e.message || 'PDF export failed.', true);
    TGE.diagnostics.log({ category:'Snapshot', level:'Error', module:'snapshot', action:'exportPdf', message: e.message, error: e });
  }
}
  
  function exportJson() {
    if (!state.data.vehicle) return;
    var json = JSON.stringify(state.data, null, 2);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type:'application/json' }));
   a.download = TGE.outputFileName({ module:'Snapshot', type:'Report', extension:'json' });
    document.body.appendChild(a); a.click(); a.remove();
  }

  function exportCsv() {
    if (!state.data.vehicle) return;
    var v   = state.data.vehicle;
    var ds  = state.data.deviceStats || {};
    var vpm = state.data.vpm || {};
    var rows = [
      ['Field','Value'],
      ['Fleet Number', v.name], ['Registration', v.registration], ['State', v.registrationState],
      ['VIN', v.vin], ['Make', v.make], ['Model', v.model],
      ['Ignition', ds.ignition], ['Movement', ds.movement], ['Odometer (km)', ds.odometer],
      ['Location', ds.location], ['RPM', vpm.rpm], ['Speed (km/h)', vpm.speed],
      ['Engine Hours', vpm.hours], ['Oil Temp (C)', vpm.oiltemp],
      ['Oil Pressure (kPa)', vpm.oilpressure], ['Fuel Used (L)', vpm.fuelconsumption],
    ];
    var csv = rows.map(function(r) {
      return r.map(function(c) { return '"' + String(c||'').replace(/"/g,'""') + '"'; }).join(',');
    }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }));
    a.download = TGE.outputFileName({ module:'Snapshot', type:'Report', extension:'csv' });
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ── Register ──────────────────────────────────────────────────────────────────
TGE.onShow['snapshot'] = function () {
  var alreadyBuilt = !!TGE.el('snap-run-btn');
  if (!alreadyBuilt) {
    render();
    return;
  }

  // Stop any in-progress panels on return
  historyState.loading = false;
  alignState.running   = false;

  // Restore previous state — results if data exists, empty if not
  if (state.data.vehicle) {
    TGE.hide('snap-empty');
    TGE.show('snap-results');
  } else {
    TGE.hide('snap-results');
    TGE.show('snap-empty');
  }
};

})();
