// TGE Asset Snapshot — Asset Track Page
// public/asset-track.js

(function () {
  'use strict';

  var DEVICE_CODE = 'ATRACKER';

  // Last-seen thresholds — temporary hardcoded values for Asset Track.
  // TODO: replace with control table platform lookup (Last Reported table)
  // when the control table platform is built.
  // Teletrac Navman — all hardware types (interim):
  //   within 7 days  = Reporting
  //   within 14 days = Review
  //   21+ days       = Not Reporting
  var THRESHOLD_REPORTING_DAYS = 7;
  var THRESHOLD_REVIEW_DAYS    = 14;

var state = {
    running: false,
    mode: 'user',
    userRows: [],
    fleetRows: []
  };

  var userLimit = 500;
  var canUser = false;
  var canFleet = false;
  var _xlsxLoading = null;
  var renderTimer = null;
var lastRenderedCount = 0;

  function render() {
    var view = TGE.el('view-asset-track');
    if (!view) return;

    userLimit = TGE.limit('asset-track', 'user-mode') || 500;
    canUser = TGE.can('asset-track', 'user-mode');
    canFleet = TGE.can('asset-track', 'fleet-mode');
   if (state.mode !== 'user' && state.mode !== 'fleet') {
  state.mode = canUser ? 'user' : 'fleet';
}

if (state.mode === 'user' && !canUser) state.mode = 'fleet';
if (state.mode === 'fleet' && !canFleet) state.mode = 'user';

    view.innerHTML = [
      '<div class="hero">',
        '<div class="hero-kicker">Operations</div>',
        '<div class="hero-title">Asset Track</div>',
        '<div class="hero-sub">Load Asset Tracker battery, last seen and status by fleet number or fleet-wide search.</div>',
        '<div class="hero-bar">',
          '<div class="hero-bar-left">',
           canUser ? '<button class="hero-mode-btn' + (state.mode === 'user' ? ' active' : '') + '" id="at-mode-user" type="button">User Mode</button>' : '',
canFleet ? '<button class="hero-mode-btn' + (state.mode === 'fleet' ? ' active' : '') + '" id="at-mode-fleet" type="button">Fleet Mode</button>' : '',
            '<button class="hero-run-btn" id="at-run-btn" type="button">Run</button>',
            '<button class="hero-action-btn" id="at-refresh-btn" type="button">Refresh</button>',
          '</div>',
          '<div class="hero-bar-right">',
  '<div class="hero-divider"></div>',
  TGE.buildOutputPill ? TGE.buildOutputPill('at', assetTrackExportItems()) : '',
'</div>',
        '</div>',
        '<p class="hero-message" id="at-message"></p>',
      '</div>',

      '<div id="at-user-input" class="card" style="' + (state.mode === 'user' ? '' : 'display:none;') + '">',
        '<div class="card-kicker">User Mode</div>',
        '<div class="card-title">Enter Fleet Numbers</div>',
        '<p style="font-size:13px;color:var(--muted);margin-bottom:10px;">Enter one fleet number per line. Maximum ' + userLimit + ' assets.</p>',
        '<textarea id="at-fleet-input" rows="6" placeholder="82050&#10;NQXA1328&#10;90117" style="width:100%;font-family:monospace;font-size:12px;border:1px solid var(--line);border-radius:8px;padding:10px;resize:vertical;background:var(--surface);color:var(--ink);"></textarea>',
        '<p id="at-input-count" style="font-size:12px;color:var(--muted);margin-top:6px;">0 assets entered</p>',
      '</div>',

      '<div id="at-empty" class="card" style="text-align:center;padding:48px 20px;">',
        '<div style="font-size:40px;margin-bottom:12px;opacity:0.3;">📍</div>',
        '<div style="font-size:14px;font-weight:600;color:var(--ink);margin-bottom:6px;">No tracker data loaded</div>',
        '<p style="font-size:13px;color:var(--muted);margin:0;">Enter fleet numbers or use Fleet Mode, then click Run.</p>',
      '</div>',

      '<div id="at-summary" class="card" style="display:none;">',
        '<div class="data-grid data-grid-4">',
          '<div class="data-item"><span>Total Rows</span><strong id="at-sum-total">—</strong></div>',
          '<div class="data-item"><span>With Asset Tracker</span><strong id="at-sum-trackers">—</strong></div>',
          '<div class="data-item"><span>Reporting</span><strong id="at-sum-reporting" style="color:var(--green-600);">—</strong></div>',
          '<div class="data-item"><span>Issues</span><strong id="at-sum-not-reporting" style="color:var(--danger);">—</strong></div>',
        '</div>',
      '</div>',

      '<div id="at-results" style="display:none;">',
        '<div class="card" style="padding:0;overflow:hidden;">',
          '<div style="overflow-x:auto;">',
            '<table style="width:100%;border-collapse:collapse;min-width:1100px;">',
              '<thead>',
                '<tr>',
                  '<th>Fleet No</th>',
                  '<th>Registration</th>',
                  '<th>Tracker IMEI</th>',
                  '<th>Model</th>',
                  '<th>Batt Base</th>',
                  '<th>Batt Current</th>',
                  '<th>Batt Status</th>',
                  '<th>Last Seen</th>',
                  '<th>Status</th>',
                '</tr>',
              '</thead>',
              '<tbody id="at-tbody"></tbody>',
            '</table>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');

    wireEvents();
  }

  function assetTrackExportItems() {
  return [
    { id:'at-pdf-btn', label:'Asset Track PDF', suffix:'PDF', icon:'📄', permission:['asset-track','export-pdf'], action:exportPdf },
    { id:'at-email-btn', label:'Email PDF', suffix:'Send', icon:'✉️', permission:['asset-track','export-email-pdf'], action:openEmailPdfComposer },
    { id:'at-csv-btn', label:'CSV', suffix:'.csv', icon:'📑', permission:['asset-track','export-csv'], action:exportCsv },
    { id:'at-xlsx-btn', label:'Excel', suffix:'.xlsx', icon:'📊', permission:['asset-track','export-xlsx'], action:exportXlsx },
    { id:'at-json-btn', label:'JSON', suffix:'.json', icon:'{}', permission:['asset-track','export-json'], action:exportJson }
  ];
}
  
  function wireEvents() {
    TGE.on('at-run-btn', 'click', runAssetTrack);
    TGE.on('at-refresh-btn', 'click', clearPage);

    var userBtn = TGE.el('at-mode-user');
    var fleetBtn = TGE.el('at-mode-fleet');

    if (userBtn) userBtn.onclick = function () { setMode('user'); };
    if (fleetBtn) fleetBtn.onclick = function () { setMode('fleet'); };

    var input = TGE.el('at-fleet-input');
    if (input) input.addEventListener('input', updateInputCount);

if (TGE.wireOutputPill) {
  TGE.wireOutputPill('at', assetTrackExportItems());
}
  }

function setMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;

  var userBtn  = TGE.el('at-mode-user');
  var fleetBtn = TGE.el('at-mode-fleet');
  if (userBtn)  userBtn.classList.toggle('active',  mode === 'user');
  if (fleetBtn) fleetBtn.classList.toggle('active', mode === 'fleet');

  var userInput = TGE.el('at-user-input');
  if (userInput) userInput.style.display = mode === 'user' ? '' : 'none';

  // Refresh displayed data for the newly selected mode.
  // renderRows already handles empty state correctly — if the new mode
  // has no data it shows the empty state, if it has data it shows it.
  renderRows();
  updateSummary();
}

  function parseFleetNumbers(raw) {
    return String(raw || '').split(/[\n,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function updateInputCount() {
    var input = TGE.el('at-fleet-input');
    var count = TGE.el('at-input-count');
    if (!input || !count) return;

    var items = parseFleetNumbers(input.value);
    var over = items.length > userLimit;
    count.textContent = items.length + ' asset' + (items.length !== 1 ? 's' : '') + ' entered' + (over ? ' — max ' + userLimit + ' allowed' : '');
    count.style.color = over ? 'var(--danger)' : 'var(--muted)';
  }

  async function runAssetTrack() {
    if (state.running) return;

    var requested = [];

    if (state.mode === 'user') {
      requested = parseFleetNumbers((TGE.el('at-fleet-input') || {}).value || '');

      if (!requested.length) {
        setMessage('Enter at least one fleet number.', true);
        return;
      }

      if (requested.length > userLimit) {
        setMessage('Maximum ' + userLimit + ' assets allowed.', true);
        return;
      }
    }

state.running = true;
if (state.mode === 'user') state.userRows = [];
else state.fleetRows = [];
lastRenderedCount = 0;

if (renderTimer) {
  clearInterval(renderTimer);
  renderTimer = null;
}

setBtnState(true);
setMessage('Loading vehicles...', false);

    try {
      var vRes = await TGE.api('GET', '/api/tn360/v1/vehicles?pruning=B2B');
      if (!vRes.ok) throw new Error('Vehicle lookup failed');

      var allVehicles = Array.isArray(vRes.data) ? vRes.data : [];
      var vehicles = [];

      if (state.mode === 'user') {
        requested.forEach(function (fleetNo) {
          var match = allVehicles.find(function (v) {
            return String(v.name || '').trim().toLowerCase() === String(fleetNo).trim().toLowerCase();
          });

          if (match) vehicles.push(match);
          else state.userRows.push(makeExceptionRow(fleetNo, 'Fleet Not Found'));
        });
      } else {
        vehicles = allVehicles.filter(function (v) {
          return v.status === 'ENABLED';
        });
      }

     var currentRows = state.mode === 'user' ? state.userRows : state.fleetRows;
      if (!vehicles.length && !currentRows.length) throw new Error('No matching vehicles found.');

      setMessage('Loading meter data...', false);

      var metersRes = await TGE.api('GET', '/api/tn360/v1/vehicles/meters?pruning=B2B');
      var allMetersByVehicle = metersRes.ok && metersRes.data ? metersRes.data : {};

      setMessage('Checking ' + vehicles.length + ' vehicles for Asset Tracker devices...', false);

renderTimer = setInterval(function () {
  var currentRows = state.mode === 'user' ? state.userRows : state.fleetRows;
  if (currentRows.length !== lastRenderedCount) {
    renderRows();
    updateSummary();
    lastRenderedCount = currentRows.length;
  }
}, 250);

var exceptionRows = [];

await TGE.Progress.run({
  items: vehicles,
  concurrency: 5,
  delay: 300,

  worker: async function (vehicle) {
    var r = await TGE.api('GET', '/api/tn360/v1/vehicles/' + vehicle.id + '/devices?pruning=B2B');

    var devices = r.ok && Array.isArray(r.data) ? r.data : [];
    var tracker = findAssetTrackerDevice(devices, vehicle);

    return {
      vehicle: vehicle,
      devices: devices,
      tracker: tracker
    };
  },

onItem: function (item) {
    if (!item) return;

    var targetRows = state.mode === 'user' ? state.userRows : state.fleetRows;

    if (item.tracker) {
      var meters = allMetersByVehicle[String(item.vehicle.id)] || [];
      targetRows.push(makeRow(item.vehicle, item.devices, item.tracker, meters));
    } else if (state.mode === 'user' && item.devices.length === 0) {
      exceptionRows.push(makeExceptionRow(item.vehicle.name, 'No Device Assigned'));
    }
  },

  onProgress: function (done, total) {
    if (done % 10 === 0 || done === total) {
      setMessage('Checking devices... ' + done + '/' + total, false);
    }
  },

onError: function (err) {
    TGE.diagnostics.log({
      category: 'Asset Track',
      level: 'error',
      module: 'asset-track',
      action: 'Progressive worker error',
      status: err && err.error ? 'Failed' : 'Unknown',
      message: err && err.error ? err.error : String(err),
      error: err && err.error ? err.error : String(err),
      request: err && err.item ? { vehicle: err.item } : null,
      response: null
    });
  }
}).promise;

     if (state.mode === 'user') state.userRows = state.userRows.concat(exceptionRows);
      else state.fleetRows = state.fleetRows.concat(exceptionRows);
renderRows();
updateSummary();
setMessage('');
} catch (e) {
      TGE.diagnostics.log({
        category: 'Asset Track',
        level: 'error',
        module: 'asset-track',
        action: 'runAssetTrack',
        message: e.message || 'Failed to load Asset Track data.',
        error: e.message || String(e)
      });
      setMessage(e.message || 'Failed to load Asset Track data.', true);
} finally {

    if (renderTimer) {
        clearInterval(renderTimer);
        renderTimer = null;
    }

    renderRows();
    updateSummary();

    state.running = false;
    setBtnState(false);
}
  }

  function findAssetTrackerDevice(devices, vehicle) {
    if (!Array.isArray(devices) || !devices.length) return null;

    return devices.find(function (d) {
      return isAssetTrackerDevice(d) && isDeviceAssignedToVehicle(d, vehicle);
    }) || null;
  }

function isAssetTrackerDevice(d) {
  if (!d) return false;

  var typeCode = d.type && d.type.code ? String(d.type.code).toUpperCase() : '';
  var typeName = d.type && d.type.name ? String(d.type.name).toLowerCase() : '';
  var modelName = d.model && d.model.name ? String(d.model.name).toLowerCase() : '';
  var modelId = d.modelId || (d.model && d.model.id);

  // Exclude motorised, camera and tablet hardware
  if (typeCode === 'HERMES') return false;
  if (typeCode === 'CAMERA') return false;
  if (typeCode === 'IFACE') return false;

  if (typeName.indexOf('camera') !== -1) return false;
  if (typeName.indexOf('tablet') !== -1) return false;
  if (typeName.indexOf('hermes') !== -1) return false;

  if (modelName.indexOf('vt102') !== -1) return false;
  if (modelName.indexOf('vt202') !== -1) return false;
  if (modelName.indexOf('iq') !== -1) return false;
  if (modelName.indexOf('multi') !== -1) return false;
  if (modelName.indexOf('camera') !== -1) return false;
  if (modelName.indexOf('tablet') !== -1) return false;
  if (modelName.indexOf('mt201') !== -1) return false;

  // Include Asset Track hardware only
  return (
    typeCode === 'ATRACKER' ||
    typeName.indexOf('asset tracker') !== -1 ||
    modelName.indexOf('at301') !== -1 ||
    modelName.indexOf('oyster') !== -1 ||
    modelName.indexOf('solar') !== -1 ||
    String(modelId) === '85' ||
    String(modelId) === '433'
  );
}

function getLastSeenStatus(lastSeen) {
    if (!lastSeen) return 'No Recent Data';

    var now     = Date.now();
    var seenAt  = new Date(lastSeen).getTime();
    if (isNaN(seenAt)) return 'No Recent Data';

    var ageHours = (now - seenAt) / (1000 * 60 * 60);
    var ageDays  = ageHours / 24;

    if (ageHours <= THRESHOLD_REPORTING_DAYS * 24) return 'Reporting';
    if (ageDays  <= THRESHOLD_REVIEW_DAYS)          return 'Review';
    return 'Not Reporting';
  }

  function isDeviceAssignedToVehicle(d, vehicle) {
    if (!d || !vehicle) return false;

    if (String(d.vehicleId || '') === String(vehicle.id)) return true;
    if (d.vehicle && String(d.vehicle.id || '') === String(vehicle.id)) return true;

    return false;
  }

  function makeExceptionRow(fleetNo, status) {
    return {
      fleetNo: fleetNo,
      registration: '—',
      vehicleId: null,
      imei: '—',
      model: '—',
      serial: '—',
      battBase: null,
      battCurrent: null,
      battStatus: 'N/A',
      lastSeen: null,
      status: status
    };
  }

  function makeRow(vehicle, devices, tracker, meters) {
    meters = meters || [];
    devices = devices || [];

    var batteryMeter = meters.find(function (m) {
      return m.type === 'battery';
    });

    var battBase = batteryMeter ? batteryMeter.base : null;
    var battCurrent = batteryMeter ? batteryMeter.computed : null;
    var lastSeen = batteryMeter ? batteryMeter.updatedAt : null;
    var battStatus = getBatteryStatus(battCurrent, tracker);

var status;

    if (!devices.length) {
      status = 'No Device Assigned';
    } else if (!tracker) {
      status = 'Not Asset Tracker';
    } else if (!batteryMeter) {
      status = 'No Meter Data';
    } else {
      status = getLastSeenStatus(lastSeen);
    }

    return {
      fleetNo: vehicle && vehicle.name ? vehicle.name : '—',
      registration: vehicle && vehicle.registration ? vehicle.registration : '—',
      vehicleId: vehicle && vehicle.id ? vehicle.id : null,
      imei: tracker && tracker.imei ? tracker.imei : '—',
      model: getTrackerModelName(tracker),
      serial: tracker && tracker.serialNumber ? tracker.serialNumber : '—',
      battBase: battBase,
      battCurrent: battCurrent,
      battStatus: battStatus,
      lastSeen: lastSeen,
      status: status
    };
  }

  function getTrackerModelName(tracker) {
    if (!tracker) return '—';
    if (tracker.model && tracker.model.name) return tracker.model.name;
    if (String(tracker.modelId) === '85') return 'AT301 / Oyster3';
    if (tracker.modelId) return 'Model ' + tracker.modelId;
    if (tracker.model && tracker.model.id) return 'Model ' + tracker.model.id;
    return '—';
  }

function isOysterTracker(device) {
  if (!device) return false;

  var modelName = device.model && device.model.name
    ? String(device.model.name).toLowerCase()
    : '';

  var modelId = device.modelId || (device.model && device.model.id);

  if (modelName.indexOf('solar') !== -1) return false;

  return modelName.indexOf('oyster') !== -1 ||
    modelName.indexOf('at301') !== -1 ||
    String(modelId) === '85' ||
    String(modelId) === '433';
}

  function getBatteryStatus(voltage, tracker) {
    if (!isOysterTracker(tracker)) return 'N/A';
    if (voltage == null || voltage === '') return 'Unknown';

    var v = Number(voltage);
    if (isNaN(v)) return 'Unknown';

    if (v >= 5.2) return 'Fresh';
    if (v >= 4.85) return 'Good';
    if (v >= 3.8) return 'Low';
    return 'Critical';
  }

function renderRows() {
    var rows = state.mode === 'user' ? state.userRows : state.fleetRows;

    if (!rows.length) {
      TGE.hide('at-summary');
      TGE.hide('at-results');
      TGE.show('at-empty');
      return;
    }

    TGE.hide('at-empty');
    TGE.show('at-summary');
    TGE.show('at-results');

    var tbody = TGE.el('at-tbody');
    if (!tbody) return;

    tbody.innerHTML = rows.map(function (r) {
var badgeClass = 'badge-gray';
      if (r.status === 'Reporting')     badgeClass = 'badge-green';
      else if (r.status === 'Review')   badgeClass = 'badge-yellow';
      else if (r.status === 'Not Reporting' ||
               r.status === 'No Device Assigned' ||
               r.status === 'Not Asset Tracker' ||
               r.status === 'No Meter Data' ||
               r.status === 'No Recent Data' ||
               r.status === 'Fleet Not Found') badgeClass = 'badge-red';

      var battClass = 'badge-gray';
      if (r.battStatus === 'Fresh') battClass = 'badge-green';
      else if (r.battStatus === 'Good') battClass = 'badge-green';
      else if (r.battStatus === 'Low') battClass = 'badge-yellow';
      else if (r.battStatus === 'Critical') battClass = 'badge-red';

      return '<tr>' +
        '<td><strong>' + esc(r.fleetNo) + '</strong></td>' +
        '<td>' + esc(r.registration) + '</td>' +
        '<td style="font-family:monospace;font-size:12px;">' + esc(r.imei) + '</td>' +
        '<td>' + esc(r.model) + '</td>' +
        '<td>' + esc(formatBattery(r.battBase)) + '</td>' +
        '<td>' + esc(formatBattery(r.battCurrent)) + '</td>' +
        '<td><span class="badge ' + battClass + '">' + esc(r.battStatus) + '</span></td>' +
        '<td>' + esc(formatTs(r.lastSeen)) + '</td>' +
        '<td><span class="badge ' + badgeClass + '">' + esc(r.status) + '</span></td>' +
      '</tr>';
    }).join('');
  }

function updateSummary() {
    var rows = state.mode === 'user' ? state.userRows : state.fleetRows;
    var total = rows.length;
    var trackers = rows.filter(function (r) { return r.imei !== '—'; }).length;
    var reporting = rows.filter(function (r) { return r.status === 'Reporting'; }).length;
    var issues = total - reporting;

    TGE.setText('at-sum-total', total);
    TGE.setText('at-sum-trackers', trackers);
    TGE.setText('at-sum-reporting', reporting);
    TGE.setText('at-sum-not-reporting', issues);
  }

  function clearPage() {
    if (state.running) return;

state.userRows = [];
    state.fleetRows = [];

    var input = TGE.el('at-fleet-input');
    if (input) {
      input.value = '';
      input.focus();
    }

    updateInputCount();

    var tbody = TGE.el('at-tbody');
    if (tbody) tbody.innerHTML = '';

    TGE.hide('at-summary');
    TGE.hide('at-results');
    TGE.show('at-empty');

    setMessage('');
   if (TGE.closeOutputPill) TGE.closeOutputPill('at');
  }

  function setMessage(msg, isError) {
    var el = TGE.el('at-message');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('error', !!isError);
  }

  function setBtnState(running) {
    var btn = TGE.el('at-run-btn');
    if (btn) {
      btn.disabled = running;
      btn.textContent = running ? 'Running...' : 'Run';
    }
  }

function ensureRowsLoaded() {
    var rows = state.mode === 'user' ? state.userRows : state.fleetRows;
    if (rows && rows.length) return true;
    setMessage('Run Asset Track before exporting.', true);
    return false;
  }

function assetTrackRows() {
    var rows = state.mode === 'user' ? state.userRows : state.fleetRows;
    return rows.map(function (r) {
      return {
        fleetNo: r.fleetNo,
        registration: r.registration,
        imei: r.imei,
        model: r.model,
        battBase: formatBattery(r.battBase),
        battCurrent: formatBattery(r.battCurrent),
        battStatus: r.battStatus,
        lastSeen: formatTs(r.lastSeen),
        status: r.status
      };
    });
  }

  function assetTrackSheetRows() {
    var rows = [['Fleet No', 'Registration', 'Tracker IMEI', 'Model', 'Batt Base', 'Batt Current', 'Batt Status', 'Last Seen', 'Status']];

    assetTrackRows().forEach(function (r) {
      rows.push([r.fleetNo, r.registration, r.imei, r.model, r.battBase, r.battCurrent, r.battStatus, r.lastSeen, r.status]);
    });

    return rows;
  }

  function exportCsv() {
    if (!ensureRowsLoaded()) return;

    var rows = assetTrackSheetRows();
    var csv = rows.map(function (row) {
      return row.map(function (cell) {
        return '"' + String(cell == null ? '' : cell).replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\n');

    downloadBlob(
  new Blob([csv], { type: 'text/csv' }),
  TGE.outputFileName({
    module: 'AssetTrack',
    type: 'Report',
    extension: 'csv'
  })
);
  }

  function loadXlsxLib() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (_xlsxLoading) return _xlsxLoading;

    _xlsxLoading = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      script.onload = function () { resolve(window.XLSX); };
      script.onerror = function () { reject(new Error('Could not load the Excel export library.')); };
      document.head.appendChild(script);
    });

    return _xlsxLoading;
  }

  async function exportXlsx() {
    if (!ensureRowsLoaded()) return;

    try {
      var XLSX = await loadXlsxLib();
      var ws = XLSX.utils.aoa_to_sheet(assetTrackSheetRows());
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Asset Track');
      XLSX.writeFile(
  wb,
  TGE.outputFileName({
    module: 'AssetTrack',
    type: 'Report',
    extension: 'xlsx'
  })
);
    } catch (e) {
      setMessage(e.message || 'XLSX export failed.', true);
    }
  }

  function exportJson() {
    if (!ensureRowsLoaded()) return;
    downloadBlob(
  new Blob([JSON.stringify(assetTrackRows(), null, 2)], { type: 'application/json' }),
  TGE.outputFileName({
    module: 'AssetTrack',
    type: 'Report',
    extension: 'json'
  })
);
  }

async function buildAssetTrackAttachment() {
  if (!ensureRowsLoaded()) return null;

  return TGE.PDF.attachment({
    route: '/api/asset-track-pdf',
    module: 'AssetTrack',
    type: 'Report',
    payload: {
      rows: assetTrackRows(),
      summary: {
        generated: new Date().toLocaleString('en-AU'),
        totalAssets: assetTrackRows().length,
        withTracker: assetTrackRows().filter(function (r) { return r.imei !== '—'; }).length,
        reporting: assetTrackRows().filter(function (r) { return r.status === 'Reporting'; }).length,
        notReporting: assetTrackRows().filter(function (r) { return r.status !== 'Reporting'; }).length
      }
    }
  });
}

  async function exportPdf() {
  if (!ensureRowsLoaded()) return;

  try {
    await TGE.PDF.download({
      route: '/api/asset-track-pdf',
      module: 'AssetTrack',
      type: 'Report',
      payload: {
        rows: assetTrackRows(),
        summary: {
          generated: new Date().toLocaleString('en-AU'),
totalAssets: assetTrackRows().length,
        withTracker: assetTrackRows().filter(function (r) { return r.imei !== '—'; }).length,
        reporting: assetTrackRows().filter(function (r) { return r.status === 'Reporting'; }).length,
        notReporting: assetTrackRows().filter(function (r) { return r.status !== 'Reporting'; }).length
        }
      }
    });
  } catch (e) {
    setMessage(e.message || 'PDF export failed.', true);
  }
}

  function openEmailPdfComposer() {
    if (!ensureRowsLoaded()) return;

    if (typeof TGE.openEmailComposer !== 'function') {
      setMessage('Email Composer is not available.', true);
      return;
    }

    TGE.openEmailComposer({
      rows: assetTrackRows(),
      fields: [
        { key: 'fleetNo', label: 'Fleet No' },
        { key: 'registration', label: 'Registration' },
        { key: 'imei', label: 'Tracker IMEI' },
        { key: 'model', label: 'Model' },
        { key: 'battBase', label: 'Batt Base' },
        { key: 'battCurrent', label: 'Batt Current' },
        { key: 'battStatus', label: 'Batt Status' },
        { key: 'lastSeen', label: 'Last Seen' },
        { key: 'status', label: 'Status' }
      ],
      attachmentBuilder: function () {
        return buildAssetTrackAttachment();
      },
      attachmentLabel: 'Attach Asset Track PDF',
      attachByDefault: true,
      onSent: function () {
        setMessage('Asset Track email sent.', false);
      }
    });
  }

function downloadBlob(blob, fileName) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'download';
  document.body.appendChild(a);
  a.click();

  setTimeout(function () {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}
  
  function formatTs(iso) {
    if (!iso) return '—';

    try {
      return new Date(iso).toLocaleString('en-AU', {
        timeZone: 'Australia/Sydney',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return iso;
    }
  }

  function formatBattery(v) {
    if (v == null || v === '—') return '—';
    var n = Number(v);
    if (!isNaN(n)) return n.toFixed(2) + ' V';
    var s = String(v);
    if (/v$/i.test(s)) return s;
    return s;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  TGE.onShow['asset-track'] = function () {
  var alreadyBuilt = !!TGE.el('at-run-btn');
  if (!alreadyBuilt) {
    render();
    return;
  }

var currentRows = state.mode === 'user' ? state.userRows : state.fleetRows;
  if (currentRows && currentRows.length) {
    TGE.hide('at-empty');
    TGE.show('at-summary');
    TGE.show('at-results');
    renderRows();
    updateSummary();
  } else {
    TGE.hide('at-summary');
    TGE.hide('at-results');
    TGE.show('at-empty');
  }
};

})();
