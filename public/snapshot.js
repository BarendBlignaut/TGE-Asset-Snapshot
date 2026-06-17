// TGE Asset Snapshot — Snapshot Page
// public/snapshot.js

(function () {
  'use strict';

  // Device type constants
  var DEVICE = {
    HERMES:   'HERMES',
    CAMERA:   'CAMERA',
    IFACE:    'IFACE',
    ATRACKER: 'ATRACKER',
  };

  var CAMERA_MODEL = {
    MULTIIQ:  { id: 843, name: 'MultiIQ',  slots: 5 },
    IQCAMERA: { id: 525, name: 'IQCamera', slots: 2 },
  };

  var CAMERA_SLOTS = [
    { id: 'road',   label: 'Road Facing',    source: 'ROAD_FACING',   sources: ['ROAD']   },
    { id: 'driver', label: 'Driver Facing',  source: 'DRIVER_FACING', sources: ['DRIVER'] },
    { id: 'incab',  label: 'In-Cab Driver',  source: 'MDVR',          sources: ['UVC']    },
    { id: 'ext1',   label: 'Left External',  source: 'MDVR',          sources: ['TVI1']   },
    { id: 'ext2',   label: 'Right External', source: 'MDVR',          sources: ['TVI2']   },
  ];

  var state = {
    running:  false,
    asset:    null,
    devices:  { hermes: null, camera: null, iface: null, tracker: null },
    data:     { vehicle: null, deviceStats: null, meters: null, gpio: null, vpm: null, driver: null, cameras: null },
  };

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
            '<input id="snap-fleet-input" type="text" placeholder="Fleet number e.g. 82050" ',
              'style="height:34px;border:1px solid rgba(255,255,255,0.25);border-radius:7px;',
              'padding:0 12px;background:rgba(255,255,255,0.10);color:#fff;font:inherit;font-size:13px;min-width:180px;" />',
            '<button class="hero-run-btn" id="snap-run-btn" type="button">Run</button>',
            '<button class="hero-action-btn" id="snap-refresh-btn" type="button" style="display:none;">Refresh</button>',
            '<button class="hero-action-btn" id="snap-camera-btn" type="button" style="display:none;">Request Camera</button>',
          '</div>',
          '<div class="hero-bar-right">',
            '<div class="hero-divider"></div>',
            '<button class="hero-export-btn" id="snap-csv-btn" type="button">CSV</button>',
            '<button class="hero-export-btn" id="snap-json-btn" type="button">JSON</button>',
          '</div>',
        '</div>',
        '<p class="hero-message" id="snap-message"></p>',
      '</div>',

      // Empty state
      '<div id="snap-empty" class="card" style="text-align:center;padding:48px 20px;">',
        '<div style="font-size:40px;margin-bottom:12px;opacity:0.3;">🚛</div>',
        '<div style="font-size:14px;font-weight:600;color:var(--ink);margin-bottom:6px;">No asset loaded</div>',
        '<p style="font-size:13px;color:var(--muted);margin:0;">Enter a fleet number above and click Run to load the full asset snapshot.</p>',
      '</div>',

      // Results
      '<div id="snap-results" style="display:none;">',

        // Vehicle info card
        '<div class="card">',
          '<div class="card-kicker">Vehicle Information</div>',
          '<div id="snap-vehicle-title" class="card-title">—</div>',
          '<div class="data-grid data-grid-4" style="margin-bottom:14px;">',
            di('snap-fleet-no',   'Fleet Number'),
            di('snap-rego',       'Registration'),
            di('snap-state',      'State'),
            di('snap-vin',        'VIN'),
            di('snap-make',       'Make'),
            di('snap-model',      'Model'),
            di('snap-year',       'Year'),
            di('snap-type',       'Vehicle Type'),
          '</div>',
          '<div class="data-grid data-grid-3" id="snap-device-cards"></div>',
        '</div>',

        // Driver card (shown only if iFace)
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

        // Live status card (shown only if HERMES)
        '<div class="card" id="snap-status-card" style="display:none;">',
          '<div class="card-kicker">Live Status</div>',
          '<div class="card-title">Current Position &amp; State</div>',
          '<div class="data-grid data-grid-4" style="margin-bottom:14px;">',
            di('snap-ignition',   'Ignition'),
            di('snap-movement',   'Movement'),
            di('snap-speed',      'Speed'),
            di('snap-odometer',   'Odometer'),
            di('snap-address',    'Location'),
            di('snap-gps-time',   'Last GPS'),
            di('snap-lat',        'Latitude'),
            di('snap-lng',        'Longitude'),
          '</div>',
          '<div id="snap-map" style="height:280px;border-radius:var(--radius);overflow:hidden;border:1px solid var(--line);background:var(--surface-2);display:flex;align-items:center;justify-content:center;">',
            '<span style="color:var(--muted);font-size:13px;">Map loads after asset fetch</span>',
          '</div>',
        '</div>',

        // VPM card (shown only if HERMES)
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

        // GPIO card (shown only if HERMES)
        '<div class="card" id="snap-gpio-card" style="display:none;">',
          '<div class="card-kicker">GPIO</div>',
          '<div class="card-title">Input / Output Status</div>',
          '<div class="data-grid data-grid-4" id="snap-gpio-grid">',
            '<div class="data-item" style="color:var(--muted);font-size:12px;grid-column:span 4;">Loading GPIO...</div>',
          '</div>',
        '</div>',

        // Camera card (shown only if CAMERA device)
        '<div class="card" id="snap-camera-card" style="display:none;">',
          '<div class="card-kicker">Evidence</div>',
          '<div class="card-title">Camera Snapshots</div>',
          '<div id="snap-camera-grid" style="display:grid;gap:10px;grid-template-columns:repeat(5,minmax(0,1fr));"></div>',
          '<p id="snap-cam-time" style="margin-top:10px;font-size:11px;color:var(--muted);"></p>',
        '</div>',

        // Asset tracker card (shown only if ATRACKER)
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

      '</div>',
    ].join('');

    wireEvents();
  }

  function di(id, label) {
    return '<div class="data-item"><span>' + label + '</span><strong id="' + id + '">—</strong></div>';
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
    state.devices = { hermes: null, camera: null, iface: null, tracker: null };
    state.data    = {};
    setMessage('Looking up fleet ' + fleetNo + '...', false);
    setBtnState(true);

    try {
      // Step 1 — Find vehicle by fleet number
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
      setMessage('Found vehicle — loading devices...', false);

      // Step 2 — Get all devices on vehicle
      var dRes = await TGE.api('GET', '/api/tn360/v1/vehicles/' + vehicle.id + '/devices?pruning=B2B');
      if (!dRes.ok) throw new Error('Device lookup failed');
      var devices = Array.isArray(dRes.data) ? dRes.data : [];

      // Filter out out-of-service devices
      devices = devices.filter(function(d) { return !d.outServiceAt; });

      // Classify devices
      devices.forEach(function(d) {
        var code = (d.type && d.type.code) || '';
        if (code === DEVICE.HERMES)   state.devices.hermes  = d;
        if (code === DEVICE.CAMERA)   state.devices.camera  = d;
        if (code === DEVICE.IFACE)    state.devices.iface   = d;
        if (code === DEVICE.ATRACKER) state.devices.tracker = d;
      });

      populateDeviceCards(devices);
      setMessage('Loading data...', false);

      // Step 3 — Fetch data based on devices present
      var promises = [];

      // HERMES — device stats
      if (state.devices.hermes) {
        promises.push(
          TGE.api('GET', '/api/tn360/v1/devices/' + state.devices.hermes.imei + '?pruning=B2B&embed=devicestats')
            .then(function(r) { if (r.ok) processHermesStats(r.data); })
        );
      }

      // iFace — driver login
      if (state.devices.iface) {
        promises.push(
          TGE.api('GET', '/api/tn360/v1/devices/' + state.devices.iface.imei + '?pruning=B2B&embed=devicestats')
            .then(function(r) { if (r.ok) processIfaceStats(r.data); })
        );
      }

      // CAMERA — snapshot events
      if (state.devices.camera) {
        var today = new Date();
        var from  = new Date(today - 7*24*60*60*1000).toISOString().slice(0,10);
        var to    = new Date(today.getTime() + 86400000).toISOString().slice(0,10);
        promises.push(
          TGE.api('GET', '/api/tn360/v1/events?pruning=B2B&types=CAMERA&vehicle_ids=' + vehicle.id + '&from=' + from + '&to=' + to)
            .then(function(r) { if (r.ok) processCameraEvents(r.data, vehicle.id); })
        );
      }

      // ATRACKER — device stats
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

  // ── Process device data ───────────────────────────────────────────────────────
  function processHermesStats(d) {
    var ds = d.deviceStats || {};
    state.data.deviceStats = ds;

    // Show HERMES cards
    show('snap-status-card');
    show('snap-vpm-card');
    show('snap-gpio-card');

    // Live status
    setText('snap-ignition',  ds.ignition || '—');
    setText('snap-movement',  ds.movement || '—');
    setText('snap-address',   ds.location || '—');
    setText('snap-gps-time',  ds.gpsAt ? formatTs(ds.gpsAt) : '—');

    var gps = ds.gps || {};
    if (gps.Lat) {
      setText('snap-lat', gps.Lat.toFixed(6));
      setText('snap-lng', gps.Lng.toFixed(6));

      // Speed from attrs.last_pr
      try {
        var pr = JSON.parse(ds.attrs && ds.attrs.last_pr || '{}');
        setText('snap-speed', pr.Spd ? pr.Spd + ' km/h' : '—');
      } catch(e) {}

      // Map
      renderMap('snap-map', gps.Lat, gps.Lng);
    }

    // Odometer
    setText('snap-odometer', ds.odometer ? Number(ds.odometer).toLocaleString() + ' km' : '—');

    // VPM
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

    // GPIO
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
    setText('snap-driver-name',    cu.firstName + ' ' + cu.lastName);
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

    // Battery from attrs
    try {
      var batt = ds.attrs && ds.attrs.battery_voltage;
      if (batt) setText('snap-tracker-battery', batt + ' V');
    } catch(e) {}
  }

  function processCameraEvents(events, vehicleId) {
    if (!Array.isArray(events) || !events.length) return;

    // Filter available events for this vehicle
    var available = events.filter(function(e) {
      return String(e.vehicleId) === String(vehicleId) &&
             e.attributes && e.attributes.status === 'available';
    });

    if (!available.length) return;

    // Get most recent
    available.sort(function(a,b) { return new Date(b.timeAt) - new Date(a.timeAt); });
    var latest = available[0];

    // Determine camera slots based on device model
    var cam    = state.devices.camera;
    var model  = cam && cam.model && cam.model.name;
    var slots  = model === 'MultiIQ' ? 5 : 2;

    // Parse context
    var ctx;
    try { ctx = JSON.parse(latest.attributes.context); } catch(e) { return; }
    if (!ctx || !ctx.response || !ctx.response.mediaFiles) return;

    var mediaFiles = ctx.response.mediaFiles;
    state.data.cameras = mediaFiles;

    // Show camera card and build grid
    show('snap-camera-card');
    var grid = TGE.el('snap-camera-grid');
    if (!grid) return;

    // Only show slots for this camera type
    var activeSlots = CAMERA_SLOTS.slice(0, slots);
    grid.style.gridTemplateColumns = 'repeat(' + slots + ',minmax(0,1fr))';

    grid.innerHTML = activeSlots.map(function(slot) {
      // Find matching media file
      var file = null;
      if (slot.source === 'MDVR') {
        // Match by imageDetails.sources
        file = mediaFiles.find(function(f) {
          return f.source === 'MDVR' &&
                 f.imageDetails && f.imageDetails.sources &&
                 f.imageDetails.sources.some(function(s) {
                   return slot.sources.indexOf(s) !== -1;
                 }) &&
                 f.status === 'FINISHED';
        });
      } else {
        file = mediaFiles.find(function(f) {
          return f.source === slot.source && f.status === 'FINISHED';
        });
      }

      var hasImage = file && file.mediaFile;
      return '<div>' +
        '<div style="aspect-ratio:4/3;border-radius:8px;overflow:hidden;background:var(--surface-2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;" id="cam-frame-' + slot.id + '">' +
          (hasImage
            ? '<img src="/api/image-proxy?url=' + encodeURIComponent(file.mediaFile) + '" style="width:100%;height:100%;object-fit:cover;" alt="' + slot.label + '" onerror="this.parentElement.innerHTML=\'<span style=&quot;font-size:11px;color:var(--muted);&quot;>Unavailable</span>\'" />'
            : '<span style="font-size:11px;color:var(--muted);">No image</span>') +
        '</div>' +
        '<div style="padding-top:6px;font-size:11px;font-weight:600;color:var(--ink-2);">' + slot.label + '</div>' +
        '<div style="font-size:10px;color:var(--muted);">' + (hasImage ? 'FINISHED' : 'Unavailable') + '</div>' +
      '</div>';
    }).join('');

    var camTime = TGE.el('snap-cam-time');
    if (camTime) camTime.textContent = 'Snapshot captured: ' + formatTs(latest.timeAt);
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
      var g     = gpio[k];
      var noun  = g.noun || k;
      var verb  = g.verb || '—';
      var which = g.which && g.which !== 'unknown' ? ' (' + g.which + ')' : '';
      // Colour coding
      var ok = ['fastened','closed','off'].indexOf(verb) !== -1;
      var warn = ['unfastened','open','on'].indexOf(verb) !== -1;
      var color = ok ? 'var(--green-600)' : warn ? 'var(--danger)' : 'var(--ink)';
      var label = noun.charAt(0).toUpperCase() + noun.slice(1) + which;
      return '<div class="data-item"><span>' + label + '</span>' +
        '<strong style="color:' + color + ';">' + verb + '</strong></div>';
    }).join('');
  }

  // ── Populate vehicle ──────────────────────────────────────────────────────────
  function populateVehicle(v) {
    var make  = v.operationalVehicleModel ? v.operationalVehicleModel.make  : v.make;
    var model = v.operationalVehicleModel ? v.operationalVehicleModel.model : v.model;
    var year  = v.operationalVehicleModel ? v.operationalVehicleModel.yearOfManufacture : '';
    setText('snap-vehicle-title', v.name + ' — ' + make + ' ' + model);
    setText('snap-fleet-no',  v.name);
    setText('snap-rego',      v.registration);
    setText('snap-state',     v.registrationState);
    setText('snap-vin',       v.vin);
    setText('snap-make',      make);
    setText('snap-model',     model);
    setText('snap-year',      year);
    setText('snap-type',      v.type && v.type.name);
  }

  function populateDeviceCards(devices) {
    var el = TGE.el('snap-device-cards');
    if (!el) return;
    el.innerHTML = devices.map(function(d) {
      var code  = (d.type && d.type.code) || '—';
      var model = (d.model && d.model.name) || '—';
      return '<div class="data-item">' +
        '<span>' + code + ' / ' + model + '</span>' +
        '<strong style="font-family:monospace;font-size:11px;">' + (d.imei || '—') + '</strong>' +
        '<span style="font-size:10px;color:var(--muted);">S/N: ' + (d.serialNumber || '—') + '</span>' +
      '</div>';
    }).join('');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function setText(id, val) {
    var el = TGE.el(id);
    if (el) el.textContent = (val != null && val !== '') ? val : '—';
  }

  function show(id) {
    var el = TGE.el(id);
    if (el) el.style.display = '';
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

  function showResults() {
    TGE.hide('snap-empty');
    TGE.show('snap-results');
  }

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
        timeZone: 'Australia/Sydney',
        day:'2-digit', month:'2-digit', year:'numeric',
        hour:'2-digit', minute:'2-digit', hour12: true
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
      ['Fleet Number',   v.name],
      ['Registration',   v.registration],
      ['State',          v.registrationState],
      ['VIN',            v.vin],
      ['Make',           v.make],
      ['Model',          v.model],
      ['Ignition',       ds.ignition],
      ['Movement',       ds.movement],
      ['Odometer (km)',  ds.odometer],
      ['Location',       ds.location],
      ['RPM',            vpm.rpm],
      ['Speed (km/h)',   vpm.speed],
      ['Engine Hours',   vpm.hours],
      ['Oil Temp (C)',   vpm.oiltemp],
      ['Oil Pressure',   vpm.oilpressure],
      ['Fuel Used (L)',  vpm.fuelconsumption],
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
