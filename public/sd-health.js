// TGE SD Card Health
// public/sd-health.js

(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────────
  var state = {
    mode:      'user',   // 'user' | 'fleet'
    userRows:  [],
    fleetRows: [],
    running:   false,
  };

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function currentRows() {
    return state.mode === 'fleet' ? state.fleetRows : state.userRows;
  }

var REPORTING_DAYS = 7;

  function reportingStatus(lastEventAt) {
    if (!lastEventAt) return { label:'Not Reporting', color:'var(--danger)' };
    var days = (Date.now() - new Date(lastEventAt).getTime()) / (1000 * 60 * 60 * 24);
    if (days <= REPORTING_DAYS) return { label:'Reporting', color:'var(--green-600)' };
    return { label:'Not Reporting', color:'var(--danger)' };
  }

  function fmtSd(val) {
    if (!val) return '—';
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

  function fmtTs(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('en-AU', {
        timeZone: 'Australia/Sydney', day: '2-digit', month: '2-digit',
        year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
      });
    } catch(e) { return ts; }
  }

  function sdStatus(val) {
    if (!val) return { label:'—', color:'var(--muted)' };
    if (val === 'sdCardPresent') return { label:'Present', color:'var(--green-600)' };
    if (val === 'sdCardAbsent')  return { label:'Not Present', color:'var(--danger)' };
    if (val === 'sdCardFailed')  return { label:'Failed', color:'var(--danger)' };
    return { label: val, color: 'var(--ink)' };
  }

  function overallStatus(val) {
    if (!val) return { label:'—', color:'var(--muted)' };
    var v = val.toLowerCase();
    if (v === 'ok') return { label:'OK', color:'var(--green-600)' };
    return { label: val.toUpperCase(), color:'var(--danger)' };
  }

  // ── Export items ──────────────────────────────────────────────────────────────
  function sdExportItems() {
    return [
      { id:'sd-pdf-btn',   label:'PDF Report',  suffix:'PDF',  icon:'📄', permission:['sd-health','export-pdf'],       action: exportPdf },
      { id:'sd-email-btn', label:'Email PDF',   suffix:'Send', icon:'✉️', permission:['sd-health','export-email-pdf'], action: exportEmailPdf },
      { id:'sd-csv-btn',   label:'CSV',         suffix:'.csv', icon:'📑', permission:['sd-health','export-csv'],       action: exportCsv },
      { id:'sd-xlsx-btn',  label:'Excel',       suffix:'.xlsx',icon:'📊', permission:['sd-health','export-xlsx'],      action: exportXlsx },
      { id:'sd-json-btn',  label:'JSON',        suffix:'.json',icon:'{}', permission:['sd-health','export-json'],      action: exportJson },
    ];
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-sd-health');
    if (!view) return;

    var canUser  = TGE.can('sd-health', 'user-mode');
    var canFleet = TGE.can('sd-health', 'fleet-mode');
    var initMode = canUser ? 'user' : (canFleet ? 'fleet' : 'user');
    state.mode   = initMode;

    view.innerHTML = [
      '<div class="hero">',
        '<div class="hero-kicker">Camera</div>',
        '<div class="hero-title">SD Card Health</div>',
        '<div class="hero-sub" style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:2px;">Check SD card status across camera-equipped fleet assets.</div>',
        '<div class="hero-bar" style="margin-top:12px;">',
          '<div class="hero-bar-left">',
            // Mode toggle
            (canUser && canFleet ? [
              '<div class="hero-mode-toggle" id="sd-mode-toggle">',
                '<button class="hero-mode-btn' + (initMode==='user'?' active':'') + '" id="sd-mode-user" type="button">User</button>',
                '<button class="hero-mode-btn' + (initMode==='fleet'?' active':'') + '" id="sd-mode-fleet" type="button">Fleet</button>',
              '</div>',
            ].join('') : ''),
            // User mode input
           
            '<button class="hero-run-btn" id="sd-run-btn" type="button">Run</button>',
            '<button class="hero-action-btn" id="sd-refresh-btn" type="button" style="display:none;">Refresh</button>',
          '</div>',
          '<div class="hero-bar-right">',
            '<div class="hero-divider"></div>',
            TGE.buildOutputPill ? TGE.buildOutputPill('sd', sdExportItems()) : '',
          '</div>',
        '</div>',
        '<p class="hero-message" id="sd-message"></p>',
      '</div>',

      '<div id="sd-user-input" class="card" style="' + (initMode === 'user' ? '' : 'display:none;') + '">',
        '<div class="card-kicker">User Mode</div>',
        '<div class="card-title">Enter Fleet Numbers</div>',
        '<p style="font-size:13px;color:var(--muted);margin-bottom:10px;">Enter one fleet number per line. Maximum ' + (TGE.limit('sd-health','user-mode') !== Infinity ? TGE.limit('sd-health','user-mode') : 500) + ' assets.</p>',
        '<textarea id="sd-fleet-input" rows="6" placeholder="82050&#10;90117&#10;136" style="width:100%;font-family:monospace;font-size:12px;border:1px solid var(--line);border-radius:8px;padding:10px;resize:vertical;background:var(--surface);color:var(--ink);"></textarea>',
        '<p id="sd-input-count" style="font-size:12px;color:var(--muted);margin-top:6px;">0 assets entered</p>',
      '</div>',

      '<div id="sd-empty" class="card" style="text-align:center;padding:48px 20px;">',
        '<div style="font-size:40px;margin-bottom:12px;opacity:0.3;">💾</div>',
        '<div style="font-size:14px;font-weight:600;color:var(--ink);margin-bottom:6px;">No data loaded</div>',
        '<p style="font-size:13px;color:var(--muted);margin:0;">',
          canUser ? 'Enter fleet numbers and click Run, or switch to Fleet mode.' : 'Click Run to load SD card health for all camera-equipped assets.',
        '</p>',
      '</div>',

      '<div id="sd-results" style="display:none;">',
        '<div class="card" style="padding:0;overflow:hidden;">',
          '<div id="sd-summary-cards" style="display:none;padding:14px 16px;border-bottom:1px solid var(--line);background:var(--surface-2);display:none;">',
            '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;">',
              '<div class="data-item" id="sd-card-total"><span>Total Assets</span><strong>—</strong></div>',
              '<div class="data-item" id="sd-card-camera"><span>With Camera</span><strong>—</strong></div>',
              '<div class="data-item" id="sd-card-reporting"><span>Reporting</span><strong>—</strong></div>',
              '<div class="data-item" id="sd-card-issues"><span>Not Reporting</span><strong>—</strong></div>',
              '<div class="data-item" id="sd-card-fault"><span>SD Faults</span><strong>—</strong></div>',
            '</div>',
          '</div>',
          '<div id="sd-progress-bar" style="display:none;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--surface-2);">',
            '<div style="font-size:12px;font-weight:600;color:var(--ink);" id="sd-progress-text">Loading...</div>',
            '<div style="height:4px;background:var(--line);border-radius:999px;margin-top:8px;overflow:hidden;">',
              '<div id="sd-progress-fill" style="height:100%;background:var(--green-600);border-radius:999px;transition:width 300ms;width:0%"></div>',
            '</div>',
          '</div>',
          '<div style="overflow-x:auto;">',
            '<table id="sd-table" style="width:100%;border-collapse:collapse;font-size:12px;">',
              '<thead>',
                '<tr style="background:var(--surface-2);border-bottom:2px solid var(--line);">',
                  '<th style="padding:10px 12px;width:36px;"><input type="checkbox" id="sd-select-all" title="Select all" /></th>',
                 
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;white-space:nowrap;">Fleet No</th>',
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;white-space:nowrap;">IMEI</th>',
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;white-space:nowrap;">Model</th>',
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;white-space:nowrap;">SD 1 Status</th>',
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;white-space:nowrap;">SD 1 Size</th>',
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;white-space:nowrap;">SD 2 Status</th>',
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;white-space:nowrap;">SD 2 Size</th>',
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;white-space:nowrap;">Overall</th>',
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;white-space:nowrap;">Last Connected</th>',
                  '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;white-space:nowrap;">Status</th>',
                '</tr>',
              '</thead>',
              '<tbody id="sd-tbody"></tbody>',
            '</table>',
          '</div>',
          '<div id="sd-summary" style="padding:10px 14px;border-top:1px solid var(--line);background:var(--surface-2);font-size:11px;color:var(--muted);display:none;"></div>',
        '</div>',
      '</div>',
    ].join('');

    wireEvents();
  }

  // ── Wire events ───────────────────────────────────────────────────────────────
  function wireEvents() {
    TGE.on('sd-run-btn',     'click', runSdHealth);
    TGE.on('sd-refresh-btn', 'click', resetSdHealth);
   var input = TGE.el('sd-fleet-input');
    if (input) input.addEventListener('input', updateInputCount);
    TGE.on('sd-mode-user',  'click', function() { setMode('user'); });
    TGE.on('sd-mode-fleet', 'click', function() { setMode('fleet'); });
    if (TGE.wireOutputPill) TGE.wireOutputPill('sd', sdExportItems());
  }

function setMode(mode) {
    state.mode = mode;
    var userBtn   = TGE.el('sd-mode-user');
    var fleetBtn  = TGE.el('sd-mode-fleet');
    var userInput = TGE.el('sd-user-input');
    if (userBtn)   userBtn.classList.toggle('active',  mode === 'user');
    if (fleetBtn)  fleetBtn.classList.toggle('active', mode === 'fleet');
    if (userInput) userInput.style.display = mode === 'user' ? '' : 'none';

    // Restore previous state for this mode
    var rows = currentRows();
    if (rows.length) {
      renderRows(rows);
      TGE.show('sd-results');
      TGE.hide('sd-empty');
      var refreshBtn = TGE.el('sd-refresh-btn');
      if (refreshBtn) refreshBtn.style.display = '';
    } else {
      TGE.hide('sd-results');
      TGE.show('sd-empty');
      var refreshBtn2 = TGE.el('sd-refresh-btn');
      if (refreshBtn2) refreshBtn2.style.display = 'none';
      
    }
    setMessage('');
    if (TGE.closeOutputPill) TGE.closeOutputPill('sd');
  }

  function resetSdHealth() {
    if (state.running) return;
    state.userRows  = [];
    state.fleetRows = [];

  var input = TGE.el('sd-fleet-input');
    if (input) { input.value = ''; input.focus(); }
    updateInputCount();

    setMessage('');
    TGE.hide('sd-results');
    TGE.show('sd-empty');

    var refreshBtn = TGE.el('sd-refresh-btn');
    if (refreshBtn) refreshBtn.style.display = 'none';
    if (TGE.closeOutputPill) TGE.closeOutputPill('sd');

    var tbody = TGE.el('sd-tbody');
    if (tbody) tbody.innerHTML = '';
    var summary = TGE.el('sd-summary');
    if (summary) { summary.style.display = 'none'; summary.textContent = ''; }
  }

  // ── Run ───────────────────────────────────────────────────────────────────────
  async function runSdHealth() {
    if (state.running) return;

    var isFleet = state.mode === 'fleet';
    var userInput = [];

    if (!isFleet) {
      var inputEl = TGE.el('sd-fleet-input');
      var raw = (inputEl && inputEl.value) || '';
      userInput = raw.split(/[,\n]+/).map(function(s) { return s.trim(); }).filter(Boolean);
      if (!userInput.length) { setMessage('Enter at least one fleet number.', true); return; }

      var limit = TGE.limit('sd-health', 'user-mode');
      if (limit !== Infinity && userInput.length > limit) {
        setMessage('Maximum ' + limit + ' fleet numbers per run. You entered ' + userInput.length + '.', true);
        return;
      }
    }

    state.running = true;
    setBtnState(true);
    setMessage('Loading vehicles...', false);

    TGE.show('sd-results');
    TGE.hide('sd-empty');

    var progressBar  = TGE.el('sd-progress-bar');
    var progressFill = TGE.el('sd-progress-fill');
    var progressText = TGE.el('sd-progress-text');
    if (progressBar) progressBar.style.display = '';

    var tbody = TGE.el('sd-tbody');
    if (tbody) tbody.innerHTML = '';

    try {
      // ── Call 1 — Get all vehicles ─────────────────────────────────────────────
      var vRes = await TGE.api('GET', '/api/tn360/v1/vehicles?pruning=B2B');
      if (!vRes.ok) throw new Error('Vehicle lookup failed — ' + (vRes.data && vRes.data.error ? vRes.data.error : 'HTTP ' + vRes.status));
      var vehicles = Array.isArray(vRes.data) ? vRes.data : [];

      // Build vehicleId → fleetNo map
      var vehicleMap = {};
      vehicles.forEach(function(v) { vehicleMap[String(v.id)] = v.name || String(v.id); });

      // User mode — validate entered fleet numbers
      var exceptionRows = [];
      var allowedVehicleIds = null; // null = all (fleet mode)

      if (!isFleet) {
        allowedVehicleIds = {};
        var nameToId = {};
        vehicles.forEach(function(v) {
          var n = String(v.name || '').trim().toLowerCase();
          if (n) nameToId[n] = String(v.id);
        });
        userInput.forEach(function(input) {
          var key = input.trim().toLowerCase();
          var vid = nameToId[key];
          if (vid) {
            allowedVehicleIds[vid] = true;
          } else {
            exceptionRows.push({ fleetNo: input, exception: 'Fleet Not Found' });
            TGE.diagnostics.log({ category:'SD Health', level:'Warn', module:'sd-health', action:'runSdHealth', message:'Fleet Not Found: ' + input });
          }
        });
      }

      // ── Call 2 — Get all devices, filter to CAMERA, match to vehicles ─────────
      setMessage('Loading camera devices...', false);
      var dRes = await TGE.api('GET', '/api/tn360/v1/devices?pruning=B2B');
      if (!dRes.ok) throw new Error('Device lookup failed — ' + (dRes.data && dRes.data.error ? dRes.data.error : 'HTTP ' + dRes.status));
      var allDevices = Array.isArray(dRes.data) ? dRes.data : [];

      var cameraDevices = allDevices.filter(function(d) {
        var code = d.type && d.type.code;
        if (code !== 'CAMERA') return false;
        if (d.outServiceAt) return false;
        var vid = String(d.vehicleId || '');
        if (!vid || !vehicleMap[vid]) return false;
        if (allowedVehicleIds && !allowedVehicleIds[vid]) return false;
        return true;
      });

      // User mode — flag vehicles with no camera device
      if (!isFleet && allowedVehicleIds) {
        var foundVids = {};
        cameraDevices.forEach(function(d) { foundVids[String(d.vehicleId)] = true; });
        Object.keys(allowedVehicleIds).forEach(function(vid) {
          if (!foundVids[vid]) {
            exceptionRows.push({ fleetNo: vehicleMap[vid] || vid, exception: 'No Camera Device' });
          }
        });
      }

      if (!cameraDevices.length && !exceptionRows.length) {
        setMessage('No camera devices found' + (isFleet ? ' in fleet.' : ' for entered fleet numbers.'), true);
        state.running = false;
        setBtnState(false);
        if (progressBar) progressBar.style.display = 'none';
        return;
      }

      // Render exception rows immediately
      var rows = exceptionRows.slice();
      if (isFleet) { state.fleetRows = rows; } else { state.userRows = rows; }
      renderRows(rows);

      setMessage('Loading SD card data — 0 of ' + cameraDevices.length + '...', false);

      // ── Call 3 — Batch device stats per camera IMEI ───────────────────────────
      var done = 0;
      var total = cameraDevices.length;

      await TGE.Progress.run({
        items: cameraDevices,
        concurrency: 5,
        delay: 300,
        worker: async function(device) {
          var imei = device.imei || device.serialNumber;
          var r = await TGE.api('GET', '/api/tn360/v1/devices/' + imei + '?pruning=B2B&embed=devicestats');
          if (!r.ok) throw new Error('Device stats failed for ' + imei);
          return { device: device, stats: r.data };
        },
        onItem: function(result) {
          done++;
          var device = result.device;
          var d      = result.stats;
          var attrs  = (d.deviceStats && d.deviceStats.attrs) || {};
          var vid    = String(device.vehicleId || '');

          var row = {
            fleetNo:    vehicleMap[vid] || vid,
            imei:       device.imei || '—',
            model:      (device.model && device.model.name) || '—',
            sd1:        fmtSd(attrs['lm.sd_card.1']),
            sd1size:    fmtBytes(attrs['lm.sd_card.1_total_size_bytes']),
            sd2:        fmtSd(attrs['lm.sd_card.2']),
            sd2size:    fmtBytes(attrs['lm.sd_card.2_total_size_bytes']),
            overall:    attrs['lm.sd_card.overall_status'] || '—',
            lastConn:   fmtTs(d.deviceStats && d.deviceStats.lastEventAt),
            _lastEventAt: (d.deviceStats && d.deviceStats.lastEventAt) || null,
            // raw for export
            _sd1raw:    attrs['lm.sd_card.1'] || '',
            _sd2raw:    attrs['lm.sd_card.2'] || '',
            _overallRaw: attrs['lm.sd_card.overall_status'] || '',
          };

          if (isFleet) { state.fleetRows.push(row); } else { state.userRows.push(row); }
          renderRows(currentRows());

          // Progress
          var pct = Math.round((done / total) * 100);
          if (progressFill) progressFill.style.width = pct + '%';
          if (progressText) progressText.textContent = 'Loading SD card data — ' + done + ' of ' + total + '...';
          setMessage('Loading SD card data — ' + done + ' of ' + total + '...', false);
        },
        onError: function(err) {
          done++;
          TGE.diagnostics.log({ category:'SD Health', level:'Error', module:'sd-health', action:'deviceStats', message: err.error || err.message || 'Unknown error' });
        },
        onComplete: function() {
          state.running = false;
          setBtnState(false);
          if (progressBar) progressBar.style.display = 'none';
          setMessage('');
          var refreshBtn = TGE.el('sd-refresh-btn');
          if (refreshBtn) refreshBtn.style.display = '';
          if (TGE.wireOutputPill) TGE.wireOutputPill('sd', sdExportItems());
          renderSummary(currentRows());
        }
      }).promise;

    } catch(e) {
      state.running = false;
      setBtnState(false);
      if (progressBar) progressBar.style.display = 'none';
      setMessage(e.message || 'Failed to load SD card health.', true);
      TGE.diagnostics.log({ category:'SD Health', level:'Error', module:'sd-health', action:'runSdHealth', message: e.message, error: e });
    }
  }

  // ── Render rows ───────────────────────────────────────────────────────────────
  function renderRows(rows) {
    var tbody = TGE.el('sd-tbody');
    if (!tbody) return;

    tbody.innerHTML = rows.map(function(row, idx) {
      var zebra = idx % 2 === 1 ? 'background:var(--surface-2);' : '';

// Exception row
      if (row.exception) {
        return '<tr style="' + zebra + '">' +
          '<td style="padding:9px 12px;"></td>' +
          '<td style="padding:9px 12px;font-weight:700;color:var(--ink);">' + esc(row.fleetNo) + '</td>' +
         '<td colspan="9" style="padding:9px 12px;color:var(--danger);font-weight:600;">' + esc(row.exception) + '</td>' +
        '</tr>';
      }

      var sd1s    = sdStatus(row._sd1raw);
      var sd2s    = sdStatus(row._sd2raw);
      var overall = overallStatus(row._overallRaw);

return '<tr style="' + zebra + 'border-bottom:1px solid var(--line);">' +
        '<td style="padding:9px 12px;"><input type="checkbox" class="sd-row-check" data-idx="' + idx + '" /></td>' +
        '<td style="padding:9px 12px;font-weight:700;color:var(--ink);white-space:nowrap;">' + esc(row.fleetNo) + '</td>' +
        '<td style="padding:9px 12px;font-family:monospace;font-size:11px;color:var(--muted);">' + esc(row.imei) + '</td>' +
        '<td style="padding:9px 12px;color:var(--ink);">' + esc(row.model) + '</td>' +
        '<td style="padding:9px 12px;font-weight:600;color:' + sd1s.color + ';">' + esc(sd1s.label) + '</td>' +
        '<td style="padding:9px 12px;color:var(--ink);">' + esc(row.sd1size) + '</td>' +
        '<td style="padding:9px 12px;font-weight:600;color:' + sd2s.color + ';">' + esc(sd2s.label) + '</td>' +
        '<td style="padding:9px 12px;color:var(--ink);">' + esc(row.sd2size) + '</td>' +
        '<td style="padding:9px 12px;font-weight:600;color:' + overall.color + ';">' + esc(overall.label) + '</td>' +
        '<td style="padding:9px 12px;color:var(--muted);white-space:nowrap;">' + esc(row.lastConn) + '</td>' +
        (function() { var rs = reportingStatus(row._lastEventAt); return '<td style="padding:9px 12px;font-weight:600;color:' + rs.color + ';">' + rs.label + '</td>'; })() +
      '</tr>';
      '</tr>';
    }).join('');
  }

function renderSummary(rows) {
    var dataRows    = rows.filter(function(r) { return !r.exception; });
    var exceptions  = rows.filter(function(r) { return !!r.exception; });
    var totalAssets = state.mode === 'fleet'
      ? dataRows.length + exceptions.length
      : (TGE.el('sd-fleet-input') ? (TGE.el('sd-fleet-input').value || '').split(/[,\n]+/).map(function(s){return s.trim();}).filter(Boolean).length : dataRows.length + exceptions.length);
    var withCamera  = dataRows.length;
    var reporting   = dataRows.filter(function(r) { return reportingStatus(r._lastEventAt).label === 'Reporting'; }).length;
    var notReporting= dataRows.filter(function(r) { return reportingStatus(r._lastEventAt).label === 'Not Reporting'; }).length;
    var sdFaults    = dataRows.filter(function(r) {
      var s1bad = r._sd1raw && (r._sd1raw === 'sdCardAbsent' || r._sd1raw === 'sdCardFailed');
      var s2bad = r._sd2raw && (r._sd2raw === 'sdCardAbsent' || r._sd2raw === 'sdCardFailed');
      var obad  = r._overallRaw && r._overallRaw.toLowerCase() !== 'ok';
      return s1bad || s2bad || obad;
    }).length;

    // Update summary cards
    var cards = TGE.el('sd-summary-cards');
    if (cards) {
      cards.style.display = '';
      var setCard = function(id, val, color) {
        var el = TGE.el(id);
        if (el) { var strong = el.querySelector('strong'); if (strong) { strong.textContent = val; strong.style.color = color || ''; } }
      };
      setCard('sd-card-total',     totalAssets,  '');
      setCard('sd-card-camera',    withCamera,   withCamera   > 0 ? 'var(--green-600)' : '');
      setCard('sd-card-reporting', reporting,    reporting    > 0 ? 'var(--green-600)' : '');
      setCard('sd-card-issues',    notReporting, notReporting > 0 ? 'var(--danger)'    : '');
      setCard('sd-card-fault',     sdFaults,     sdFaults     > 0 ? 'var(--danger)'    : '');
    }

    // Wire select all
    var selectAll = TGE.el('sd-select-all');
    if (selectAll) {
      selectAll.onchange = function() {
        var checked = selectAll.checked;
        document.querySelectorAll('.sd-row-check').forEach(function(cb) { cb.checked = checked; });
      };
    }

    // Footer summary
    var summary = TGE.el('sd-summary');
    if (summary) {
      summary.textContent = dataRows.length + ' camera device' + (dataRows.length !== 1 ? 's' : '') +
        '   |   ' + totalOk + ' OK   |   ' + totalFault + ' Fault   |   ' + totalNone + ' No Data' +
        (rows.filter(function(r) { return r.exception; }).length ? '   |   ' + rows.filter(function(r) { return r.exception; }).length + ' Exception' : '');
      summary.style.display = '';
    }
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function updateInputCount() {
    var input = TGE.el('sd-fleet-input');
    var count = TGE.el('sd-input-count');
    if (!input || !count) return;
    var limit = TGE.limit('sd-health', 'user-mode');
    limit = (limit != null && limit !== Infinity) ? limit : 500;
    var items = (input.value || '').split(/[\n,]+/).map(function(s) { return s.trim(); }).filter(Boolean);
    var over = items.length > limit;
    count.textContent = items.length + ' asset' + (items.length !== 1 ? 's' : '') + ' entered' + (over ? ' — max ' + limit + ' allowed' : '');
    count.style.color = over ? 'var(--danger)' : 'var(--muted)';
  }

  function setMessage(msg, isError) {
    var el = TGE.el('sd-message');
    if (!el) return;
    el.textContent = msg || '';
    el.className   = 'hero-message' + (isError ? ' error' : '');
  }

  function setBtnState(loading) {
    var btn = TGE.el('sd-run-btn');
    if (btn) { btn.textContent = loading ? 'Loading...' : 'Run'; btn.disabled = loading; }
  }

  // ── Exports ───────────────────────────────────────────────────────────────────
function getExportRows() {
    var checked = [];
    document.querySelectorAll('.sd-row-check:checked').forEach(function(cb) {
      var idx = parseInt(cb.getAttribute('data-idx'));
      var row = currentRows()[idx];
      if (row && !row.exception) checked.push(row);
    });
    if (!checked.length) {
      setMessage('Select at least one row to export.', true);
      return null;
    }
    return checked;
  }

function exportCsv() {
    var rows = getExportRows();
    if (!rows) return;
    var headers = ['Fleet No','IMEI','Model','SD 1 Status','SD 1 Size','SD 2 Status','SD 2 Size','Overall Status','Last Connected'];
    var csv = [headers].concat(rows.map(function(r) {
      return [r.fleetNo, r.imei, r.model, r.sd1, r.sd1size, r.sd2, r.sd2size, r.overall, r.lastConn];
    })).map(function(r) {
      return r.map(function(c) { return '"' + String(c||'').replace(/"/g,'""') + '"'; }).join(',');
    }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }));
    a.download = TGE.outputFileName({ module:'SDHealth', type:'Report', extension:'csv' });
    document.body.appendChild(a); a.click(); a.remove();
  }

  function exportXlsx() {
    // Falls back to CSV if SheetJS not available
    exportCsv();
  }

function exportJson() {
    var rows = getExportRows();
    if (!rows) return;
    var clean = rows.map(function(r) {
      return { fleetNo:r.fleetNo, imei:r.imei, model:r.model, sd1Status:r.sd1, sd1Size:r.sd1size, sd2Status:r.sd2, sd2Size:r.sd2size, overallStatus:r.overall, lastConnected:r.lastConn };
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(clean, null, 2)], { type:'application/json' }));
    a.download = TGE.outputFileName({ module:'SDHealth', type:'Report', extension:'json' });
    document.body.appendChild(a); a.click(); a.remove();
  }

 function buildPdfPayload() {
    var rows = getExportRows();
    if (!rows) return null;
    var dataRows = currentRows().filter(function(r) { return !r.exception; });
    var allRows  = currentRows();
    return {
      rows: rows.map(function(r) {
        return {
          fleetNo:   r.fleetNo,
          imei:      r.imei,
          model:     r.model,
          sd1:       r.sd1,
          sd1size:   r.sd1size,
          sd2:       r.sd2,
          sd2size:   r.sd2size,
          overall:   r.overall,
          lastConn:  r.lastConn,
          status:    reportingStatus(r._lastEventAt).label,
          sdFault:   !!(r._sd1raw === 'sdCardAbsent' || r._sd1raw === 'sdCardFailed' || r._sd2raw === 'sdCardAbsent' || r._sd2raw === 'sdCardFailed' || (r._overallRaw && r._overallRaw.toLowerCase() !== 'ok')),
          exception: r.exception || null,
        };
      }),
      summary: {
        generated:    new Date().toLocaleString('en-AU', { timeZone:'Australia/Sydney', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true }),
        totalAssets:  allRows.length,
        withCamera:   dataRows.length,
        reporting:    dataRows.filter(function(r) { return reportingStatus(r._lastEventAt).label === 'Reporting'; }).length,
        notReporting: dataRows.filter(function(r) { return reportingStatus(r._lastEventAt).label !== 'Reporting'; }).length,
        sdFaults:     dataRows.filter(function(r) { return r._sd1raw === 'sdCardAbsent' || r._sd1raw === 'sdCardFailed' || r._sd2raw === 'sdCardAbsent' || r._sd2raw === 'sdCardFailed' || (r._overallRaw && r._overallRaw.toLowerCase() !== 'ok'); }).length,
      }
    };
  }

  async function exportPdf() {
    var payload = buildPdfPayload();
    if (!payload) return;
    try {
      await TGE.PDF.download({
        route:   '/api/sd-health-pdf',
        module:  'SDHealth',
        type:    'Report',
        payload: payload
      });
    } catch(e) {
      setMessage(e.message || 'PDF export failed.', true);
      TGE.diagnostics.log({ category:'SD Health', level:'Error', module:'sd-health', action:'exportPdf', message:e.message, error:e });
    }
  }

  async function exportEmailPdf() {
    var payload = buildPdfPayload();
    if (!payload) return;
    if (typeof TGE.openEmailComposer !== 'function') { setMessage('Email composer not available.', true); return; }
    TGE.openEmailComposer({
      rows: payload.rows.map(function(r) {
        return { fleetNo:r.fleetNo, imei:r.imei, model:r.model, status:r.status, overall:r.overall };
      }),
      fields: [
        { key:'fleetNo', label:'Fleet No' },
        { key:'imei',    label:'IMEI' },
        { key:'model',   label:'Model' },
        { key:'status',  label:'Status' },
        { key:'overall', label:'Overall' },
      ],
      attachmentBuilder: function() {
        return TGE.PDF.attachment({
          route:   '/api/sd-health-pdf',
          module:  'SDHealth',
          type:    'Report',
          payload: payload
        });
      },
      attachmentLabel:  'Attach SD Health PDF',
      attachByDefault:  true,
    });
  }

  // ── Register ──────────────────────────────────────────────────────────────────
  TGE.onShow['sd-health'] = function() {
    var alreadyBuilt = !!TGE.el('sd-run-btn');
    if (!alreadyBuilt) { render(); return; }

    // Restore previous state on navigation return
    var rows = currentRows();
    if (rows.length) {
      TGE.show('sd-results');
      TGE.hide('sd-empty');
    } else {
      TGE.hide('sd-results');
      TGE.show('sd-empty');
    }
  };

})();
