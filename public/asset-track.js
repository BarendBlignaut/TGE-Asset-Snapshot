// TGE Asset Snapshot — Asset Track Page
// public/asset-track.js

(function () {
  'use strict';

  var DEVICE_CODE = 'ATRACKER';

  var state = {
    running: false,
    mode: 'user',
    rows: []
  };

  var userLimit = 500;
  var canUser = false;
  var canFleet = false;
  var _xlsxLoading = null;

  function render() {
    var view = TGE.el('view-asset-track');
    if (!view) return;

    userLimit = TGE.limit('asset-track', 'user-mode') || 500;
    canUser = TGE.can('asset-track', 'user-mode');
    canFleet = TGE.can('asset-track', 'fleet-mode');
    state.mode = canUser ? 'user' : 'fleet';

    view.innerHTML = [
      '<div class="hero">',
        '<div class="hero-kicker">Operations</div>',
        '<div class="hero-title">Asset Track</div>',
        '<div class="hero-sub">Load Asset Tracker battery, last seen and status by fleet number or fleet-wide search.</div>',
        '<div class="hero-bar">',
          '<div class="hero-bar-left">',
            canUser ? '<button class="hero-mode-btn active" id="at-mode-user" type="button">User Mode</button>' : '',
            canFleet ? '<button class="hero-mode-btn' + (!canUser ? ' active' : '') + '" id="at-mode-fleet" type="button">Fleet Mode</button>' : '',
            '<button class="hero-run-btn" id="at-run-btn" type="button">Run</button>',
            '<button class="hero-action-btn" id="at-refresh-btn" type="button">Refresh</button>',
          '</div>',
          '<div class="hero-bar-right">',
            '<div class="hero-divider"></div>',
            buildExportMenu(),
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

  function buildExportMenu() {
    var items = [
      TGE.can('asset-track','export-pdf') ? '<button class="hero-menu-item" id="at-pdf-btn" type="button"><span>Asset Track PDF</span><span>PDF</span></button>' : '',
      TGE.can('asset-track','export-email-pdf') ? '<button class="hero-menu-item" id="at-email-btn" type="button"><span>Email PDF</span><span>Send</span></button>' : '',
      TGE.can('asset-track','export-csv') ? '<button class="hero-menu-item" id="at-csv-btn" type="button"><span>CSV</span><span>.csv</span></button>' : '',
      TGE.can('asset-track','export-xlsx') ? '<button class="hero-menu-item" id="at-xlsx-btn" type="button"><span>Excel</span><span>.xlsx</span></button>' : '',
      TGE.can('asset-track','export-json') ? '<button class="hero-menu-item" id="at-json-btn" type="button"><span>JSON</span><span>.json</span></button>' : ''
    ].filter(Boolean).join('');

    if (!items) return '';

    return '<div class="hero-menu" id="at-export-menu">' +
      '<button class="hero-menu-trigger" id="at-export-trigger" type="button" aria-haspopup="true" aria-expanded="false" title="Export">' +
        '<span>Export</span>' +
      '</button>' +
      '<div class="hero-menu-panel" role="menu">' + items + '</div>' +
    '</div>';
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

    wireExportMenu();
    activateExports();
  }

  function wireExportMenu() {
    var trigger = TGE.el('at-export-trigger');
    var menu = TGE.el('at-export-menu');
    var panel = menu ? menu.querySelector('.hero-menu-panel') : null;

    function positionPanel() {
      if (!trigger || !panel) return;
      var rect = trigger.getBoundingClientRect();
      panel.style.top = (rect.bottom + 8) + 'px';
      panel.style.left = 'auto';
      panel.style.right = (window.innerWidth - rect.right) + 'px';
    }

    if (trigger && menu) {
      trigger.onclick = function (e) {
        e.stopPropagation();
        var open = !menu.classList.contains('open');
        if (open) positionPanel();
        menu.classList.toggle('open', open);
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
    }
  }

  function closeExportMenu() {
    var menu = TGE.el('at-export-menu');
    var trigger = TGE.el('at-export-trigger');
    if (menu) menu.classList.remove('open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  document.addEventListener('click', function (e) {
    var menu = TGE.el('at-export-menu');
    if (menu && !menu.contains(e.target)) closeExportMenu();
  });

  window.addEventListener('scroll', closeExportMenu, true);
  window.addEventListener('resize', closeExportMenu);

  function setMode(mode) {
    state.mode = mode;

    var userBtn = TGE.el('at-mode-user');
    var fleetBtn = TGE.el('at-mode-fleet');
    var userInput = TGE.el('at-user-input');

    if (userBtn) userBtn.classList.toggle('active', mode === 'user');
    if (fleetBtn) fleetBtn.classList.toggle('active', mode === 'fleet');
    if (userInput) userInput.style.display = mode === 'user' ? '' : 'none';
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
    state.rows = [];
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
          else state.rows.push(makeExceptionRow(fleetNo, 'Fleet Not Found'));
        });
      } else {
        vehicles = allVehicles.filter(function (v) {
          return v.status === 'ENABLED';
        });
      }

      if (!vehicles.length && !state.rows.length) throw new Error('No matching vehicles found.');

      setMessage('Loading meter data...', false);

      var metersRes = await TGE.api('GET', '/api/tn360/v1/vehicles/meters?pruning=B2B');
      var allMetersByVehicle = metersRes.ok && metersRes.data ? metersRes.data : {};

      setMessage('Checking ' + vehicles.length + ' vehicles for Asset Tracker devices...', false);

      var checked = 0;
      var results = await batchRun(vehicles, function (vehicle) {
        return TGE.api('GET', '/api/tn360/v1/vehicles/' + vehicle.id + '/devices?pruning=B2B')
          .then(function (r) {
            checked++;

            if (checked % 10 === 0 || checked === vehicles.length) {
              setMessage('Checking devices... ' + checked + '/' + vehicles.length, false);
            }

            var devices = r.ok && Array.isArray(r.data) ? r.data : [];
            var tracker = findAssetTrackerDevice(devices, vehicle);

            return {
              vehicle: vehicle,
              devices: devices,
              tracker: tracker
            };
          })
          .catch(function () {
            return {
              vehicle: vehicle,
              devices: [],
              tracker: null
            };
          });
      }, 5, 300);

      var finalRows = results
        .filter(function (item) {
          return state.mode === 'user' || item.tracker;
        })
        .map(function (item) {
          var meters = allMetersByVehicle[String(item.vehicle.id)] || [];
          return makeRow(item.vehicle, item.devices, item.tracker, meters);
        });

      state.rows = state.rows.concat(finalRows);
      renderRows();
      updateSummary();
      setMessage('');

    } catch (e) {
      setMessage(e.message || 'Failed to load Asset Track data.', true);
    } finally {
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

    return typeCode === DEVICE_CODE || typeName === 'asset tracker';
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

    var status = 'Reporting';

    if (!devices.length) {
      status = 'No Device Assigned';
    } else if (!tracker) {
      status = 'Not Asset Tracker';
    } else if (!batteryMeter) {
      status = 'No Meter Data';
    } else if (!lastSeen) {
      status = 'No Recent Data';
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

    var modelName = device.model && device.model.name ? String(device.model.name).toLowerCase() : '';
    var modelId = device.modelId || (device.model && device.model.id);

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
    TGE.hide('at-empty');
    TGE.show('at-summary');
    TGE.show('at-results');

    var tbody = TGE.el('at-tbody');
    if (!tbody) return;

    tbody.innerHTML = state.rows.map(function (r) {
      var badgeClass = 'badge-gray';
      if (r.status === 'Reporting') badgeClass = 'badge-green';
      else if (r.status !== 'Reporting') badgeClass = 'badge-red';

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
    var total = state.rows.length;
    var trackers = state.rows.filter(function (r) { return r.imei !== '—'; }).length;
    var reporting = state.rows.filter(function (r) { return r.status === 'Reporting'; }).length;
    var issues = total - reporting;

    TGE.setText('at-sum-total', total);
    TGE.setText('at-sum-trackers', trackers);
    TGE.setText('at-sum-reporting', reporting);
    TGE.setText('at-sum-not-reporting', issues);
  }

  function clearPage() {
    if (state.running) return;

    state.rows = [];

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
    closeExportMenu();
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

  function activateExports() {
    var csvBtn = TGE.el('at-csv-btn');
    var jsonBtn = TGE.el('at-json-btn');
    var xlsxBtn = TGE.el('at-xlsx-btn');
    var pdfBtn = TGE.el('at-pdf-btn');
    var emailBtn = TGE.el('at-email-btn');

    if (csvBtn) csvBtn.onclick = function () { closeExportMenu(); exportCsv(); };
    if (jsonBtn) jsonBtn.onclick = function () { closeExportMenu(); exportJson(); };
    if (xlsxBtn) xlsxBtn.onclick = function () { closeExportMenu(); exportXlsx(); };
    if (pdfBtn) pdfBtn.onclick = function () { closeExportMenu(); exportPdf(); };
    if (emailBtn) emailBtn.onclick = function () { closeExportMenu(); openEmailPdfComposer(); };
  }

  function ensureRowsLoaded() {
    if (state.rows && state.rows.length) return true;
    setMessage('Run Asset Track before exporting.', true);
    return false;
  }

  function assetTrackRows() {
    return state.rows.map(function (r) {
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

    downloadBlob(new Blob([csv], { type: 'text/csv' }), 'asset-track.csv');
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
      XLSX.writeFile(wb, 'asset-track.xlsx');
    } catch (e) {
      setMessage(e.message || 'XLSX export failed.', true);
    }
  }

  function exportJson() {
    if (!ensureRowsLoaded()) return;
    downloadBlob(new Blob([JSON.stringify(assetTrackRows(), null, 2)], { type: 'application/json' }), 'asset-track.json');
  }

  async function buildAssetTrackAttachment() {
    if (!ensureRowsLoaded()) return null;

    var result = await TGE.api('POST', '/api/asset-track-pdf', {
      rows: assetTrackRows(),
      summary: {
        generated: new Date().toLocaleString('en-AU'),
        totalAssets: state.rows.length,
        withTracker: state.rows.filter(function (r) { return r.imei !== '—'; }).length,
        reporting: state.rows.filter(function (r) { return r.status === 'Reporting'; }).length,
        notReporting: state.rows.filter(function (r) { return r.status !== 'Reporting'; }).length
      }
    });

    if (!result.ok) {
      throw new Error((result.data && result.data.error) || 'Asset Track PDF generation failed.');
    }

    return {
      fileName: result.data.fileName || 'asset-track.pdf',
      base64: result.data.base64,
      contentType: 'application/pdf'
    };
  }

  async function exportPdf() {
    if (!ensureRowsLoaded()) return;

    try {
      var attachment = await buildAssetTrackAttachment();
      if (!attachment || !attachment.base64) return;

      var bytes = base64ToBytes(attachment.base64);
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), attachment.fileName || 'asset-track.pdf');
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
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  function base64ToBytes(base64) {
    var bin = atob(base64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
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

  async function batchRun(items, worker, concurrency, delayMs) {
    var results = [];
    var index = 0;

    async function next() {
      while (index < items.length) {
        var current = index++;
        results[current] = await worker(items[current], current);
        if (delayMs) await delay(delayMs);
      }
    }

    var runners = [];
    for (var i = 0; i < Math.min(concurrency, items.length); i++) {
      runners.push(next());
    }

    await Promise.all(runners);
    return results;
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  TGE.onShow['asset-track'] = render;

})();
