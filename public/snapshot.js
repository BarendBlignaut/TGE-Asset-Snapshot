// TGE Asset Snapshot — Snapshot Page
// public/snapshot.js

(function () {
  'use strict';

  var state = {
    running:   false,
    hasResult: false,
    asset:     null,
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-snapshot');
    if (!view) return;

    view.innerHTML = [

      // Hero bar
      '<div class="hero">',
        '<div class="hero-kicker">Asset Search</div>',
        '<div class="hero-title">Track one vehicle — full operational snapshot</div>',
        '<div class="hero-sub">Enter a fleet number to load current location, metrics, diagnostics and camera evidence.</div>',
        '<div class="hero-bar">',
          '<div class="hero-bar-left">',
            '<input id="snap-fleet-input" type="text" placeholder="Fleet number e.g. 1001" ',
              'style="height:34px;border:1px solid rgba(255,255,255,0.25);border-radius:7px;',
              'padding:0 12px;background:rgba(255,255,255,0.10);color:#fff;font:inherit;font-size:13px;min-width:180px;" />',
            '<button class="hero-run-btn" id="snap-run-btn" type="button">Run</button>',
            '<button class="hero-action-btn" id="snap-refresh-btn" type="button" style="display:none;">Refresh</button>',
          '</div>',
          '<div class="hero-bar-right">',
            '<div class="hero-divider"></div>',
            '<button class="hero-export-btn" id="snap-pdf-btn" type="button">PDF</button>',
            '<button class="hero-export-btn" id="snap-email-btn" type="button">Email PDF</button>',
            '<button class="hero-export-btn" id="snap-csv-btn" type="button">CSV</button>',
            '<button class="hero-export-btn" id="snap-xlsx-btn" type="button">XLSX</button>',
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

      // Results (hidden until loaded)
      '<div id="snap-results" style="display:none;">',

        // Vehicle info
        '<div class="card">',
          '<div class="card-kicker">Vehicle Information</div>',
          '<div class="card-title">Asset Details</div>',
          '<div class="data-grid data-grid-4" style="margin-bottom:12px;">',
            dataItem('snap-fleet-number',  'Fleet Number'),
            dataItem('snap-registration',  'Registration'),
            dataItem('snap-vin',           'VIN'),
            dataItem('snap-make',          'Make'),
            dataItem('snap-model',         'Model'),
            dataItem('snap-system-id',     'System ID'),
            dataItem('snap-year',          'Year'),
          '</div>',
          '<div class="data-grid data-grid-3">',
            deviceCard('snap-tracker',  'Tracking System'),
            deviceCard('snap-camera',   'Camera System'),
            deviceCard('snap-tablet',   'Tablet'),
          '</div>',
        '</div>',

        // Performance metrics
        '<div class="card">',
          '<div class="card-kicker">Performance</div>',
          '<div class="card-title">Vehicle Tracking Metrics</div>',
          '<div class="data-grid data-grid-4">',
            dataItem('snap-driver',     'Driver Logged In'),
            dataItem('snap-engine-hrs', 'Engine Hours'),
            dataItem('snap-ignition',   'Ignition'),
            dataItem('snap-odometer',   'Odometer'),
            dataItem('snap-oil-press',  'Oil Pressure'),
            dataItem('snap-oil-temp',   'Oil Temperature'),
            dataItem('snap-rpm',        'RPM'),
            dataItem('snap-speed',      'Speed'),
          '</div>',
        '</div>',

        // GPIO
        '<div class="card">',
          '<div class="card-kicker">GPIO</div>',
          '<div class="card-title">Input / Output Status</div>',
          '<div class="data-grid data-grid-4" id="snap-gpio-grid">',
            '<div class="data-item" style="color:var(--muted);font-size:12px;grid-column:span 4;">Loading GPIO data...</div>',
          '</div>',
        '</div>',

        // SD Card health
        '<div class="card">',
          '<div class="card-kicker">Storage Diagnostics</div>',
          '<div class="card-title">SD Card Health</div>',
          '<div class="data-grid data-grid-2">',
            '<div class="data-item"><span>SD Card 1</span><strong id="snap-sd1">—</strong></div>',
            '<div class="data-item"><span>SD Card 2</span><strong id="snap-sd2">—</strong></div>',
            '<div class="data-item"><span>SD Card 1 Size</span><strong id="snap-sd1-size">—</strong></div>',
            '<div class="data-item"><span>SD Card 2 Size</span><strong id="snap-sd2-size">—</strong></div>',
            '<div class="data-item" style="grid-column:span 2;"><span>Overall Status</span><strong id="snap-sd-overall">—</strong></div>',
          '</div>',
        '</div>',

        // Camera snapshots
        '<div class="card">',
          '<div class="card-kicker">Evidence</div>',
          '<div class="card-title">Camera Snapshots</div>',
          '<div class="data-grid" style="grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;" id="snap-camera-grid">',
            cameraSlot('snap-cam-road',     'Road Facing'),
            cameraSlot('snap-cam-driver',   'Driver Facing'),
            cameraSlot('snap-cam-incab',    'In-Cab Driver'),
            cameraSlot('snap-cam-ext-drv',  'Driver External'),
            cameraSlot('snap-cam-ext-left', 'Left External'),
          '</div>',
          '<p id="snap-cam-time" style="margin-top:10px;font-size:11px;color:var(--muted);"></p>',
        '</div>',

        // Location
        '<div class="card">',
          '<div class="card-kicker">Location</div>',
          '<div class="card-title">Last Known Position</div>',
          '<div class="data-grid data-grid-3" style="margin-bottom:14px;">',
            dataItem('snap-lat',       'Latitude'),
            dataItem('snap-lng',       'Longitude'),
            dataItem('snap-gps-time',  'GPS Time'),
            dataItem('snap-address',   'Address'),
            dataItem('snap-heading',   'Heading'),
            dataItem('snap-gps-speed', 'GPS Speed'),
          '</div>',
          '<div id="snap-map" style="height:300px;border-radius:var(--radius);overflow:hidden;border:1px solid var(--line);background:var(--surface-2);display:flex;align-items:center;justify-content:center;">',
            '<span style="color:var(--muted);font-size:13px;">Map will load after asset is fetched</span>',
          '</div>',
        '</div>',

      '</div>',// end results

    ].join('');

    wireEvents();
  }

  function dataItem(id, label) {
    return '<div class="data-item"><span>' + label + '</span><strong id="' + id + '">—</strong></div>';
  }

  function deviceCard(id, label) {
    return '<div class="data-item"><span>' + label + '</span>' +
      '<strong id="' + id + '-imei" style="display:block;">IMEI: —</strong>' +
      '<span id="' + id + '-serial" style="font-size:11px;color:var(--muted);">Serial: —</span>' +
    '</div>';
  }

  function cameraSlot(id, label) {
    return '<div>' +
      '<div style="aspect-ratio:4/3;border-radius:8px;overflow:hidden;background:var(--surface-2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;" id="' + id + '-frame">' +
        '<span style="font-size:11px;color:var(--muted);">No image</span>' +
      '</div>' +
      '<div style="padding-top:6px;font-size:11px;font-weight:600;color:var(--ink-2);">' + label + '</div>' +
      '<div style="font-size:10px;color:var(--muted);" id="' + id + '-status"></div>' +
    '</div>';
  }

  // ── Wire events ───────────────────────────────────────────────────────────────
  function wireEvents() {
    TGE.on('snap-run-btn',     'click', runSnapshot);
    TGE.on('snap-refresh-btn', 'click', runSnapshot);
    TGE.on('snap-fleet-input', 'keydown', function(e) {
      if (e.key === 'Enter') runSnapshot();
    });
    TGE.on('snap-json-btn', 'click', exportJson);
    TGE.on('snap-csv-btn',  'click', exportCsv);
  }

  // ── Run snapshot ──────────────────────────────────────────────────────────────
  async function runSnapshot() {
    if (state.running) return;
    var fleetNo = (TGE.el('snap-fleet-input') || {}).value || '';
    fleetNo = fleetNo.trim();
    if (!fleetNo) {
      setMessage('Enter a fleet number first.', true);
      return;
    }

    state.running = true;
    setMessage('Loading asset ' + fleetNo + '...', false);
    TGE.el('snap-run-btn').textContent = 'Loading...';
    TGE.el('snap-run-btn').disabled    = true;

    try {
      // Look up vehicle
      var res = await TGE.api('GET', '/api/tn360/v1/vehicles?name=' + encodeURIComponent(fleetNo));
      if (!res.ok) throw new Error('Vehicle lookup failed');

      var vehicles = Array.isArray(res.data) ? res.data : (res.data.vehicles || []);
      var vehicle  = vehicles.find(function(v) { return String(v.name||'').trim() === String(fleetNo).trim(); });
      if (!vehicle) throw new Error('Fleet number ' + fleetNo + ' not found');

      state.asset = { vehicle: vehicle };
      setMessage('');
      populateVehicle(vehicle);

      // Load remaining data in parallel
      var vid = vehicle.id;
      Promise.all([
        TGE.api('GET', '/api/tn360/v1/vehicles/' + vid + '/hermes-stats'),
        TGE.api('GET', '/api/tn360/v1/vehicles/' + vid + '/meters'),
        TGE.api('GET', '/api/tn360/v1/vehicles/' + vid + '/devices'),
      ]).then(function(results) {
        if (results[0].ok) populateMetrics(results[0].data);
        if (results[1].ok) populateMeters(results[1].data);
        if (results[2].ok) populateDevices(results[2].data);
      });

      // Camera events
      TGE.api('GET', '/api/tn360/v1/events?types=camera&pruning=B2B').then(function(r) {
        if (r.ok) populateCamera(r.data, vid);
      });

      showResults();
      activateExports();
      TGE.el('snap-refresh-btn').style.display = '';

    } catch(e) {
      setMessage(e.message || 'Failed to load asset.', true);
    } finally {
      state.running = false;
      TGE.el('snap-run-btn').textContent = 'Run';
      TGE.el('snap-run-btn').disabled    = false;
    }
  }

  // ── Populate functions ────────────────────────────────────────────────────────
  function populateVehicle(v) {
    setText('snap-fleet-number', v.name);
    setText('snap-registration', v.registration);
    setText('snap-vin',          v.vin);
    setText('snap-make',         v.operationalVehicleModel ? v.operationalVehicleModel.make : v.make);
    setText('snap-model',        v.operationalVehicleModel ? v.operationalVehicleModel.model : v.model);
    setText('snap-system-id',    v.id);
    setText('snap-year',         v.operationalVehicleModel ? v.operationalVehicleModel.year : v.year);
  }

  function populateMetrics(d) {
    setText('snap-driver',    d.driverName || d.driver);
    setText('snap-ignition',  d.ignition ? 'On' : 'Off');
    setText('snap-oil-press', d.oilPressure != null ? d.oilPressure + ' kPa' : null);
    setText('snap-oil-temp',  d.oilTemperature != null ? d.oilTemperature + ' °C' : null);
    setText('snap-rpm',       d.rpm != null ? d.rpm + ' rpm' : null);
    setText('snap-speed',     d.speed != null ? d.speed + ' km/h' : null);

    // GPS
    var gps = d.gps || d.lastGps || {};
    setText('snap-lat',       gps.lat != null ? gps.lat.toFixed(6) : null);
    setText('snap-lng',       gps.lng != null ? gps.lng.toFixed(6) : null);
    setText('snap-gps-time',  TGE.formatDate(gps.timeAt || gps.time));
    setText('snap-heading',   gps.heading != null ? gps.heading + '°' : null);
    setText('snap-gps-speed', gps.speed != null ? gps.speed + ' km/h' : null);

    // Map
    if (gps.lat && gps.lng) {
      var mapDiv = TGE.el('snap-map');
      if (mapDiv) {
        mapDiv.innerHTML = '<iframe style="width:100%;height:100%;border:none;" loading="lazy" ' +
          'src="https://www.openstreetmap.org/export/embed.html?bbox=' +
          (gps.lng-0.01) + '%2C' + (gps.lat-0.01) + '%2C' + (gps.lng+0.01) + '%2C' + (gps.lat+0.01) +
          '&layer=mapnik&marker=' + gps.lat + '%2C' + gps.lng + '"></iframe>';
      }
    }

    // GPIO
    populateGpio(d);
  }

  function populateGpio(d) {
    var grid = TGE.el('snap-gpio-grid');
    if (!grid) return;
    var gpio = d.gpio || d.inputs || {};
    var keys = Object.keys(gpio);
    if (!keys.length) {
      grid.innerHTML = '<div class="data-item" style="color:var(--muted);font-size:12px;grid-column:span 4;">No GPIO data available.</div>';
      return;
    }
    grid.innerHTML = keys.map(function(k) {
      var val = gpio[k];
      var display = typeof val === 'boolean' ? (val ? 'Active' : 'Inactive') : String(val);
      var color = val === true ? 'var(--green-600)' : 'var(--muted)';
      return '<div class="data-item"><span>' + k + '</span><strong style="color:' + color + ';">' + display + '</strong></div>';
    }).join('');
  }

  function populateMeters(d) {
    setText('snap-odometer',    d.odometer != null ? Number(d.odometer).toLocaleString() + ' km' : null);
    setText('snap-engine-hrs',  d.engineHours != null ? d.engineHours + ' hrs' : null);
  }

  function populateDevices(devices) {
    if (!Array.isArray(devices)) devices = [];
    devices.forEach(function(dev) {
      var type = String((dev.type && dev.type.code) || dev.type || '').toUpperCase();
      var prefix = type === 'CAMERA' ? 'snap-camera' : type === 'TABLET' ? 'snap-tablet' : 'snap-tracker';
      setText(prefix + '-imei',   'IMEI: ' + (dev.imei || '—'));
      setText(prefix + '-serial', 'Serial: ' + (dev.serialNumber || '—'));

      // If camera — load SD stats
      if (type === 'CAMERA' && dev.imei) {
        TGE.api('GET', '/api/tn360/v1/devices/' + dev.imei + '/camera-device-stats').then(function(r) {
          if (r.ok) populateSdHealth(r.data);
        });
      }
    });
  }

  function populateSdHealth(d) {
    var sd1 = d.sdCard1 || {};
    var sd2 = d.sdCard2 || {};
    setText('snap-sd1',       sd1.present ? 'Present' : 'Not present');
    setText('snap-sd2',       sd2.present ? 'Present' : 'Not present');
    setText('snap-sd1-size',  formatBytes(sd1.totalSizeBytes));
    setText('snap-sd2-size',  formatBytes(sd2.totalSizeBytes));
    setText('snap-sd-overall', d.overallStatus || '—');
  }

  function populateCamera(events, vehicleId) {
    if (!Array.isArray(events)) return;
    var vid   = String(vehicleId);
    var mine  = events.filter(function(e) { return String(e.vehicleId) === vid; });
    mine.sort(function(a,b) { return new Date(b.timeAt||0) - new Date(a.timeAt||0); });
    var latest = mine[0];
    if (!latest) return;

    var ctx      = latest.attributes && latest.attributes.context && latest.attributes.context.response;
    var files    = ctx && ctx.mediaFiles ? ctx.mediaFiles : [];
    var slotMap  = {
      'ROAD_FACING':              'snap-cam-road',
      'DRIVER_FACING':            'snap-cam-driver',
      'IN_CAB_DRIVER_FACING':     'snap-cam-incab',
      'DRIVER_EXTERNAL':          'snap-cam-ext-drv',
      'LEFT_EXTERNAL':            'snap-cam-ext-left',
    };

    files.forEach(function(f) {
      var src    = f.source || f.mediaType || '';
      var slotId = slotMap[src.toUpperCase()];
      if (!slotId) return;
      var urls   = f.imageDetails && f.imageDetails.sources ? f.imageDetails.sources : [];
      var url    = urls.length ? urls[0].url : (f.mediaFile || null);
      if (url) setImage(slotId, url, src);
    });

    var camTime = TGE.el('snap-cam-time');
    if (camTime) camTime.textContent = 'Snapshot time: ' + TGE.formatDate(latest.timeAt);
  }

  function setImage(slotId, url, label) {
    var frame = TGE.el(slotId + '-frame');
    if (!frame) return;
    // Proxy through worker to avoid CORS
    TGE.api('POST', '/api/image-proxy', { url: url }).then(function(r) {
      if (!r.ok) return;
      // Use original URL for display (worker proxied it)
      frame.innerHTML = '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;" alt="' + label + '" />';
    }).catch(function() {
      frame.innerHTML = '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;" alt="' + label + '" />';
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function setText(id, val) {
    var el = TGE.el(id);
    if (el) el.textContent = TGE.safeText(val);
  }

  function setMessage(msg, isError) {
    var el = TGE.el('snap-message');
    if (!el) return;
    el.textContent = msg || '';
    el.className   = 'hero-message' + (isError ? ' error' : '');
  }

  function showResults() {
    TGE.hide('snap-empty');
    TGE.show('snap-results');
  }

  function activateExports() {
    ['snap-pdf-btn','snap-email-btn','snap-csv-btn','snap-xlsx-btn','snap-json-btn'].forEach(function(id) {
      var el = TGE.el(id);
      if (el) el.classList.add('active');
    });
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === '0') return '—';
    var b = parseFloat(bytes);
    if (isNaN(b)) return '—';
    if (b >= 1e9) return (b/1e9).toFixed(2) + ' GB';
    if (b >= 1e6) return (b/1e6).toFixed(2) + ' MB';
    return b + ' B';
  }

  // ── Exports ───────────────────────────────────────────────────────────────────
  function exportJson() {
    if (!state.asset) return;
    var json = JSON.stringify(state.asset, null, 2);
    var a    = document.createElement('a');
    a.href   = URL.createObjectURL(new Blob([json], { type:'application/json' }));
    a.download = 'snapshot-' + (state.asset.vehicle ? state.asset.vehicle.name : 'asset') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function exportCsv() {
    if (!state.asset || !state.asset.vehicle) return;
    var v    = state.asset.vehicle;
    var rows = [
      ['Field','Value'],
      ['Fleet Number', v.name],
      ['Registration', v.registration],
      ['VIN',          v.vin],
      ['Make',         v.make],
      ['Model',        v.model],
    ];
    var csv = rows.map(function(r) { return r.map(function(c){ return '"'+String(c||'').replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
    var a   = document.createElement('a');
    a.href  = URL.createObjectURL(new Blob([csv], { type:'text/csv' }));
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
    // Focus input when switching to snapshot
    var inp = TGE.el('snap-fleet-input');
    if (inp) inp.focus();
  };

})();
