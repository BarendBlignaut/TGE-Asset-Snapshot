// TGE Asset Snapshot — Snapshot Page
// public/snapshot.js

(function () {
  'use strict';

  var DEVICE = { HERMES:'HERMES', CAMERA:'CAMERA', IFACE:'IFACE', ATRACKER:'ATRACKER' };

  var CAMERA_SLOTS = [
    { id:'road',   label:'Road Facing',   source:'ROAD_FACING', sources:['ROAD']   },
    { id:'driver', label:'Driver Facing', source:'DRIVER_FACING', sources:['DRIVER'] },
    { id:'incab',  label:'In-Cab Driver', source:'MDVR',         sources:['UVC']    },
    { id:'ext1',   label:'Left External', source:'MDVR',         sources:['TVI1']   },
    { id:'ext2',   label:'Right External',source:'MDVR',         sources:['TVI2']   },
  ];

  var state = {
    running: false,
    asset:   null,
    devices: { hermes:null, camera:null, iface:null, tracker:null },
    data:    { vehicle:null, deviceStats:null, vpm:null, gpio:null, cameras:null },
  };

  var alignState = { running:false, steps:{}, vehicleId:null };

  var ALIGN_STEPS = [
    { id:'step-ign-on',   label:'Confirm ignition ON',           type:'poll-ignition', expect:'ON',  timeout:120 },
    { id:'step-trigger',  label:'Send alignment trigger',         type:'trigger'                                  },
    { id:'step-ign-off',  label:'Confirm ignition OFF',          type:'poll-ignition', expect:'OFF', timeout:120 },
    { id:'step-ign-on2',  label:'Confirm ignition ON (restart)', type:'poll-ignition', expect:'ON',  timeout:120 },
    { id:'step-wait',     label:'Wait 30s for camera to reset',  type:'wait',          seconds:30               },
    { id:'step-snapshot', label:'Pull new camera snapshots',      type:'snapshot'                                },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────────
  function render() {
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
            '<button class="hero-export-btn" id="snap-csv-btn" type="button">CSV</button>',
            '<button class="hero-export-btn" id="snap-json-btn" type="button">JSON</button>',
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
            '<button class="btn" id="snap-align-btn" style="height:32px;font-size:12px;background:var(--green-100);color:var(--green-700);border-color:var(--green-600);">⚙ Alignment Test</button>',
          '</div>',
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:8px;" id="snap-cam-pre-label">Current Snapshots</div>',
          '<div id="snap-camera-grid" style="display:grid;gap:10px;"></div>',
          '<p id="snap-cam-time" style="margin-top:6px;margin-bottom:16px;font-size:11px;color:var(--muted);"></p>',
          '<div id="snap-cam-post-section" style="display:none;">',
            '<div style="border-top:2px dashed var(--green-600);margin:0 0 16px;"></div>',
            '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--green-600);margin-bottom:8px;">Post Alignment Test</div>',
            '<div id="snap-camera-grid-post" style="display:grid;gap:10px;"></div>',
            '<p id="snap-cam-post-time" style="margin-top:6px;font-size:11px;color:var(--muted);"></p>',
          '</div>',
        '</div>',

        // 7 — Map (HERMES only)
        '<div class="card" id="snap-map-card" style="display:none;">',
          '<div class="card-kicker">Location</div>',
          '<div class="card-title">Last Known Position</div>',
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
  }

  function di(id, label) {
    return '<div class="data-item"><span>' + label + '</span><strong id="' + id + '">—</strong></div>';
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

  // ── Wire events ───────────────────────────────────────────────────────────────
  function wireEvents() {
    TGE.on('snap-run-btn',     'click', runSnapshot);
    TGE.on('snap-refresh-btn', 'click', runSnapshot);
    TGE.on('snap-fleet-input', 'keydown', function(e) { if (e.key === 'Enter') runSnapshot(); });
    TGE.on('snap-json-btn',    'click', exportJson);
    TGE.on('snap-csv-btn',     'click', exportCsv);
  }

  // ── Run snapshot ──────────────────────────────────────────────────────────────
  async function runSnapshot() {
    if (state.running) return;
    var fleetNo = (TGE.el('snap-fleet-input') || {}).value || '';
    fleetNo = fleetNo.trim();
    if (!fleetNo) { setMessage('Enter a fleet number first.', true); return; }

    state.running = true;
    state.devices = { hermes:null, camera:null, iface:null, tracker:null };
    state.data    = {};
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
      }

      if (state.devices.tracker) {
        promises.push(
          TGE.api('GET', '/api/tn360/v1/devices/' + state.devices.tracker.imei + '?pruning=B2B&embed=devicestats')
            .then(function(r) { if (r.ok) processTrackerStats(r.data); })
        );
      }

      await Promise.all(promises);
      setMessage('');
      TGE.el('snap-refresh-btn').style.display = '';

    } catch(e) {
      setMessage(e.message || 'Failed to load asset.', true);
    } finally {
      state.running = false;
      setBtnState(false);
    }
  }

  // ── Process functions ─────────────────────────────────────────────────────────
  function processHermesStats(d) {
    var ds = d.deviceStats || {};
    state.data.deviceStats = ds;

    show('snap-status-card');
    show('snap-vpm-card');
    show('snap-gpio-card');

    setText('snap-ignition', ds.ignition || '—');
    setText('snap-movement', ds.movement || '—');
    setText('snap-address',  ds.location || '—');
    setText('snap-gps-time', ds.gpsAt ? formatTs(ds.gpsAt) : '—');
    setText('snap-odometer', ds.odometer ? Number(ds.odometer).toLocaleString() + ' km' : '—');

    var gps = ds.gps || {};
    if (gps.Lat) {
      setText('snap-lat', gps.Lat.toFixed(6));
      setText('snap-lng', gps.Lng.toFixed(6));
      try {
        var pr = JSON.parse(ds.attrs && ds.attrs.last_pr || '{}');
        setText('snap-speed', pr.Spd ? pr.Spd + ' km/h' : '—');
      } catch(e) {}
      show('snap-map-card');
      renderMap('snap-map', gps.Lat, gps.Lng);
    }

    try {
      var vpm = JSON.parse(ds.lastVpm || '{}');
      state.data.vpm = vpm;
      setText('snap-rpm',          vpm.rpm    != null ? vpm.rpm + ' rpm'    : '—');
      setText('snap-engine-speed', vpm.speed  != null ? vpm.speed + ' km/h' : '—');
      setText('snap-engine-hrs',   vpm.hours  != null ? Number(vpm.hours).toLocaleString() + ' hrs' : '—');
      setText('snap-fuel-total',   vpm.fuelconsumption != null ? Number(vpm.fuelconsumption).toLocaleString() + ' L' : '—');
      setText('snap-oil-temp',     vpm.oiltemp    != null ? vpm.oiltemp + ' °C'   : '—');
      setText('snap-oil-press',    vpm.oilpressure != null ? vpm.oilpressure + ' kPa' : '—');
      setText('snap-engine-load',  vpm.engineload  != null ? vpm.engineload + ' %'    : '—');
      setText('snap-vpm-time',     ds.lastVpmAt ? formatTs(ds.lastVpmAt) : '—');
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
    show('snap-driver-card');
    setText('snap-driver-name',    (cu.firstName || '') + ' ' + (cu.lastName || ''));
    setText('snap-driver-user',    cu.username || '—');
    setText('snap-driver-licence', cu.licenceNumber || '—');
    setText('snap-driver-state',   cu.licenceState || '—');
  }

  function processTrackerStats(d) {
    var ds = d.deviceStats || {};
    show('snap-tracker-card');
    setText('snap-tracker-address', ds.location || '—');
    setText('snap-tracker-time',    ds.lastEventAt ? formatTs(ds.lastEventAt) : '—');
    setText('snap-tracker-model',   (d.model && d.model.name) || '—');
    var gps = ds.gps || {};
    if (gps.Lat) {
      setText('snap-tracker-lat', gps.Lat.toFixed(6));
      setText('snap-tracker-lng', gps.Lng.toFixed(6));
      renderMap('snap-tracker-map', gps.Lat, gps.Lng);
    }
  }

  function processCameraEvents(events, vehicleId) {
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

    show('snap-camera-card');
    var alignBtn = TGE.el('snap-align-btn');
    if (alignBtn) alignBtn.onclick = openAlignPanel;

    var grid = TGE.el('snap-camera-grid');
    if (grid) {
      grid.style.gridTemplateColumns = 'repeat(' + slots + ',minmax(0,1fr))';
      grid.innerHTML = buildCameraGrid(mediaFiles, activeSlots);
    }
    var camTime = TGE.el('snap-cam-time');
    if (camTime) camTime.textContent = 'Snapshot captured: ' + formatTs(latest.timeAt);
  }

  function buildCameraGrid(mediaFiles, activeSlots) {
    return activeSlots.map(function(slot) {
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

  // ── Alignment test ───────────────────────────────────────────────────────────
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

    // Clone BEFORE from current grid
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
    alignState.steps   = {};
    var startBtn = TGE.el('snap-align-start');
    if (startBtn) { startBtn.textContent = 'Running...'; startBtn.disabled = true; }
    var hermesImei = state.devices.hermes && state.devices.hermes.imei;

    try {
      for (var i = 0; i < ALIGN_STEPS.length; i++) {
        if (!alignState.running) break;
        var step = ALIGN_STEPS[i];
        setAlignStep(step.id, 'running');

        if (step.type === 'poll-ignition') {
          var ok = await pollIgnition(hermesImei, step.expect, step.timeout);
          if (!ok) throw new Error('Ignition ' + step.expect + ' not confirmed within ' + step.timeout + 's');
          setAlignStep(step.id, 'done', 'Ignition ' + step.expect);

        } else if (step.type === 'trigger') {
          setAlignStep(step.id, 'running', 'Awaiting Teletrac endpoint...');
          await delay(3000);
          setAlignStep(step.id, 'done', 'Placeholder — endpoint TBC');

        } else if (step.type === 'wait') {
          await countdownWait(step.id, step.seconds);
          setAlignStep(step.id, 'done', 'Complete');

        } else if (step.type === 'snapshot') {
          await pullPostSnapshots();
          setAlignStep(step.id, 'done', 'Images loaded');
        }
      }
      setText('snap-align-status', '✅ Test complete');
      if (startBtn) { startBtn.textContent = 'Test Complete'; }

    } catch(e) {
      ALIGN_STEPS.forEach(function(s) {
        if (alignState.steps[s.id] === 'running') setAlignStep(s.id, 'error', e.message);
      });
      setText('snap-align-status', '❌ ' + e.message);
      if (startBtn) { startBtn.textContent = 'Retry Test'; startBtn.disabled = false; }
    } finally {
      alignState.running = false;
    }
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
    var vid   = alignState.vehicleId;
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

    // AFTER in panel
    var afterGrid = TGE.el('snap-align-after');
    if (afterGrid) { afterGrid.innerHTML = html; afterGrid.style.gridTemplateColumns = 'repeat(' + slots + ',minmax(0,1fr))'; }
    var afterMsg = TGE.el('snap-align-after-msg');
    if (afterMsg) afterMsg.style.display = 'none';

    // POST on main page
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
  function setText(id, val) {
    var el = TGE.el(id);
    if (el) el.textContent = (val != null && val !== '') ? val : '—';
  }

  function show(id) { var el = TGE.el(id); if (el) el.style.display = ''; }

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

  function renderMap(containerId, lat, lng) {
    var el = TGE.el(containerId);
    if (!el) return;
    el.innerHTML = '<iframe style="width:100%;height:100%;border:none;" loading="lazy" ' +
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

  // ── Exports ───────────────────────────────────────────────────────────────────
  function exportJson() {
    if (!state.data.vehicle) return;
    var json = JSON.stringify(state.data, null, 2);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type:'application/json' }));
    a.download = 'snapshot-' + (state.data.vehicle.name || 'asset') + '.json';
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
    a.download = 'snapshot-' + v.name + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
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
