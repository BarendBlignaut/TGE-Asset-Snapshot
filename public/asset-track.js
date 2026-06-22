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
        '<div class="hero-sub">Load ATRACKER location, battery, last seen and tracker status by fleet number or fleet-wide search.</div>',
        '<div class="hero-bar">',
          '<div class="hero-bar-left">',
            canUser ? '<button class="hero-mode-btn active" id="at-mode-user" type="button">User Mode</button>' : '',
            canFleet ? '<button class="hero-mode-btn' + (!canUser ? ' active' : '') + '" id="at-mode-fleet" type="button">Fleet Mode</button>' : '',
            '<button class="hero-action-btn" id="at-run-btn" type="button">Refresh</button>',
            '<button class="hero-action-btn" id="at-Refresh-btn" type="button">Clear</button>',
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
          '<div class="data-item"><span>Total Assets</span><strong id="at-sum-total">—</strong></div>',
          '<div class="data-item"><span>With Tracker</span><strong id="at-sum-trackers">—</strong></div>',
          '<div class="data-item"><span>Reporting</span><strong id="at-sum-reporting" style="color:var(--green-600);">—</strong></div>',
          '<div class="data-item"><span>Not Reporting</span><strong id="at-sum-not-reporting" style="color:var(--danger);">—</strong></div>',
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
                  '<th>Battery</th>',
                  '<th>Last Seen</th>',
                  '<th>Location</th>',
                  '<th>Latitude</th>',
                  '<th>Longitude</th>',
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

  function wireExportMenu() {
  var exportTrigger = TGE.el('at-export-trigger');
  var exportMenu    = TGE.el('at-export-menu');
  var exportPanel   = exportMenu ? exportMenu.querySelector('.hero-menu-panel') : null;

  function positionExportPanel() {
    if (!exportTrigger || !exportPanel) return;
    var rect = exportTrigger.getBoundingClientRect();
    exportPanel.style.top = (rect.bottom + 8) + 'px';
    exportPanel.style.left = 'auto';
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
      if (!exportMenu.contains(e.target)) {
        exportMenu.classList.remove('open');
        exportTrigger.setAttribute('aria-expanded', 'false');
      }
    });

    window.addEventListener('scroll', function() {
      if (exportMenu.classList.contains('open')) positionExportPanel();
    }, true);

    window.addEventListener('resize', function() {
      if (exportMenu.classList.contains('open')) positionExportPanel();
    });
  }
}
  
  function wireEvents() {
    TGE.on('at-run-btn', 'click', runAssetTrack);
    TGE.on('at-clear-btn', 'click', clearPage);

    var userBtn = TGE.el('at-mode-user');
    var fleetBtn = TGE.el('at-mode-fleet');

    if (userBtn) userBtn.onclick = function () { setMode('user'); };
    if (fleetBtn) fleetBtn.onclick = function () { setMode('fleet'); };

    var input = TGE.el('at-fleet-input');
    if (input) input.addEventListener('input', updateInputCount);

    var csvBtn = TGE.el('at-csv-btn');
    var jsonBtn = TGE.el('at-json-btn');

    if (csvBtn) csvBtn.onclick = exportCsv;
if (jsonBtn) jsonBtn.onclick = exportJson;

wireExportMenu();
}

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
    return String(raw || '')
      .split(/[\n,]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
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

      var vehicles = Array.isArray(vRes.data) ? vRes.data : [];

      if (state.mode === 'user') {
        vehicles = vehicles.filter(function (v) {
          return requested.some(function (fleetNo) {
            return String(v.name || '').trim().toLowerCase() === String(fleetNo).trim().toLowerCase();
          });
        });
      } else {
        vehicles = vehicles.filter(function (v) {
          return v.status === 'ENABLED';
        });
      }

      if (!vehicles.length) throw new Error('No matching vehicles found.');

      setMessage('Checking ' + vehicles.length + ' vehicles for asset trackers...', false);

      var checked = 0;
      var results = await batchRun(vehicles, function (vehicle) {
        return TGE.api('GET', '/api/tn360/v1/vehicles/' + vehicle.id + '/devices?pruning=B2B')
          .then(function (r) {
            checked++;
            if (checked % 10 === 0 || checked === vehicles.length) {
              setMessage('Checking devices... ' + checked + '/' + vehicles.length, false);
            }

            if (!r.ok) return makeRow(vehicle, null, null);

            var devices = Array.isArray(r.data) ? r.data : [];
            var tracker = devices.find(function (d) {
              return d.type && d.type.code === DEVICE_CODE && !d.outServiceAt;
            });

            return { vehicle: vehicle, tracker: tracker || null };
          })
          .catch(function () {
            return { vehicle: vehicle, tracker: null };
          });
      }, 5, 300);

      var withTrackers = results.filter(function (r) { return r && r.tracker; });

      setMessage('Loading tracker stats... ' + withTrackers.length + ' tracker(s) found.', false);

      var finalRows = await batchRun(results, function (item) {
        if (!item || !item.tracker) return Promise.resolve(makeRow(item.vehicle, null, null));

        return TGE.api('GET', '/api/tn360/v1/devices/' + item.tracker.imei + '?pruning=B2B&embed=devicestats')
          .then(function (r) {
            return makeRow(item.vehicle, item.tracker, r.ok ? r.data : null);
          })
          .catch(function () {
            return makeRow(item.vehicle, item.tracker, null);
          });
      }, 5, 300);

      state.rows = finalRows;
      renderRows();
      updateSummary();
      activateExports();
      setMessage('');

    } catch (e) {
      setMessage(e.message || 'Failed to load asset tracker data.', true);
    } finally {
      state.running = false;
      setBtnState(false);
    }
  }

  function makeRow(vehicle, tracker, detail) {
    var ds = detail && detail.deviceStats ? detail.deviceStats : {};
    var attrs = ds.attrs || {};
    var gps = ds.gps || {};

    var lat = gps.Lat != null ? gps.Lat : null;
    var lng = gps.Lng != null ? gps.Lng : null;

    var lastSeen = ds.lastEventAt || ds.gpsAt || ds.updatedAt || null;

    var battery =
      attrs.battery ||
      attrs.battery_voltage ||
      attrs.batteryVoltage ||
      attrs['battery.voltage'] ||
      ds.battery ||
      null;

    var status = tracker
      ? (lastSeen ? 'Reporting' : 'No recent data')
      : 'No ATRACKER';

    return {
      fleetNo: vehicle && vehicle.name ? vehicle.name : '—',
      registration: vehicle && vehicle.registration ? vehicle.registration : '—',
      vehicleId: vehicle && vehicle.id ? vehicle.id : null,
      imei: tracker && tracker.imei ? tracker.imei : '—',
      model: tracker && tracker.model && tracker.model.name ? tracker.model.name : '—',
      serial: tracker && tracker.serialNumber ? tracker.serialNumber : '—',
      battery: battery || '—',
      lastSeen: lastSeen,
      location: ds.location || '—',
      lat: lat,
      lng: lng,
      status: status
    };
  }

  function buildExportMenu() {
  var items = [
    TGE.can('asset-track','export-pdf')       ? '<button class="hero-menu-item" id="at-pdf-btn" type="button"><span>Asset Track PDF</span><span>PDF</span></button>' : '',
    TGE.can('asset-track','export-email-pdf') ? '<button class="hero-menu-item" id="at-email-btn" type="button"><span>Email PDF</span><span>Send</span></button>' : '',
    TGE.can('asset-track','export-csv')       ? '<button class="hero-menu-item" id="at-csv-btn" type="button"><span>CSV</span><span>.csv</span></button>' : '',
    TGE.can('asset-track','export-xlsx')      ? '<button class="hero-menu-item" id="at-xlsx-btn" type="button"><span>Excel</span><span>.xlsx</span></button>' : '',
    TGE.can('asset-track','export-json')      ? '<button class="hero-menu-item" id="at-json-btn" type="button"><span>JSON</span><span>.json</span></button>' : '',
  ].filter(Boolean).join('');

  if (!items) return '';

  return '<div class="hero-menu" id="at-export-menu">' +
    '<button class="hero-menu-trigger" id="at-export-trigger" type="button" aria-haspopup="true" aria-expanded="false" title="Export">' +
      '<svg class="hero-menu-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">' +
        '<path d="M8 1.5v8M5 6.5l3 3 3-3M2.5 11.5v2A1 1 0 0 0 3.5 14.5h9a1 1 0 0 0 1-1v-2"/>' +
      '</svg>' +
      '<span>Export</span>' +
      '<svg class="hero-menu-caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M4 6l4 4 4-4"/></svg>' +
    '</button>' +
    '<div class="hero-menu-panel" role="menu">' + items + '</div>' +
  '</div>';
}
  
  function renderRows() {
    TGE.hide('at-empty');
    TGE.show('at-summary');
    TGE.show('at-results');

    var tbody = TGE.el('at-tbody');
    if (!tbody) return;

    tbody.innerHTML = state.rows.map(function (r) {
      var isReporting = r.status === 'Reporting';
      var badgeClass = isReporting ? 'badge-green' : (r.status === 'No ATRACKER' ? 'badge-gray' : 'badge-red');

      return '<tr>' +
        '<td><strong>' + esc(r.fleetNo) + '</strong></td>' +
        '<td>' + esc(r.registration) + '</td>' +
        '<td style="font-family:monospace;font-size:12px;">' + esc(r.imei) + '</td>' +
        '<td>' + esc(r.model) + '</td>' +
        '<td>' + esc(formatBattery(r.battery)) + '</td>' +
        '<td>' + esc(formatTs(r.lastSeen)) + '</td>' +
        '<td style="max-width:260px;white-space:normal;">' + esc(r.location) + '</td>' +
        '<td>' + esc(r.lat != null ? Number(r.lat).toFixed(6) : '—') + '</td>' +
        '<td>' + esc(r.lng != null ? Number(r.lng).toFixed(6) : '—') + '</td>' +
        '<td><span class="badge ' + badgeClass + '">' + esc(r.status) + '</span></td>' +
      '</tr>';
    }).join('');
  }

  function updateSummary() {
    var total = state.rows.length;
    var trackers = state.rows.filter(function (r) { return r.imei !== '—'; }).length;
    var reporting = state.rows.filter(function (r) { return r.status === 'Reporting'; }).length;
    var notReporting = total - reporting;

    TGE.setText('at-sum-total', total);
    TGE.setText('at-sum-trackers', trackers);
    TGE.setText('at-sum-reporting', reporting);
    TGE.setText('at-sum-not-reporting', notReporting);
  }

  function clearPage() {
    state.rows = [];
    setMessage('');
    TGE.hide('at-summary');
    TGE.hide('at-results');
    TGE.show('at-empty');
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
    ['at-csv-btn', 'at-xlsx-btn', 'at-json-btn'].forEach(function (id) {
      var btn = TGE.el(id);
      if (btn) btn.classList.add('active');
    });
  }

  function exportJson() {
    downloadFile('asset-track.json', JSON.stringify(state.rows, null, 2), 'application/json');
  }

  function exportCsv() {
    var cols = ['fleetNo','registration','imei','model','battery','lastSeen','location','lat','lng','status'];
    var csv = [
      cols.join(','),
      state.rows.map(function (r) {
        return cols.map(function (c) {
          return '"' + String(r[c] == null ? '' : r[c]).replace(/"/g, '""') + '"';
        }).join(',');
      }).join('\n')
    ].join('\n');

    downloadFile('asset-track.csv', csv, 'text/csv');
  }

  function downloadFile(name, content, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatTs(iso) {
    if (!iso) return '—';
    try { return TGE.formatDate(iso); } catch (e) { return iso; }
  }

  function formatBattery(v) {
    if (v == null || v === '—') return '—';
    var s = String(v);
    if (/v$/i.test(s)) return s;
    if (!isNaN(Number(s))) return s + ' V';
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
    for (var i = 0; i < Math.min(concurrency, items.length); i++) runners.push(next());
    await Promise.all(runners);
    return results;
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  TGE.onShow['asset-track'] = render;

}();
