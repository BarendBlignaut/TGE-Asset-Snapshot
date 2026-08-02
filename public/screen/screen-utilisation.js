// TGE Asset Snapshot — Fleet Utilisation Dashboard
// public/utilisation.js
// Status: UI FOUNDATION ONLY

(function () {
  'use strict';

  var state = {
    kmCutoff: 0,
    cutoffMode: 'all',
    days: 7,
    history: false,
    telematicsOnly: false,
    startDate: null,
    endDate: null,
    fleet: [],
    loaded: false,
fieldDefs: [],
    telematicsSourceColumn: null,
    filters: {},
    openFilterCol: null,
  };

  function render() {
    var view = TGE.el('view-utilisation');
    if (!view) return;

    injectStyles();
    ensureSidebarLegend();
    watchActiveView();

    state.endDate = startOfDay(new Date());
    state.startDate = addDays(state.endDate, -(state.days - 1));

    view.innerHTML = [
      '<div class="ud-shell">',
        '<div class="ud-header">',
          '<div class="ud-title-wrap">',
            '<div class="ud-logo-bars"><span></span><span></span><span></span></div>',
            '<div>',
              '<div class="ud-title">Fleet Utilisation Dashboard</div>',
              '<div class="ud-subtitle">Daily utilisation review by asset, workshop status and exemption reason.</div>',
            '</div>',
          '</div>',
          '<div class="ud-header-actions">',
'<span class="ud-total" id="ud-total">Assets: 0 / 0</span>',
            '<button class="ud-btn" id="ud-telematics-btn" type="button">Telematics: Off</button>',
            '<button class="ud-btn" id="ud-history-btn" type="button">History: Off</button>',
            '<button class="ud-btn ud-disabled" type="button" disabled>Export</button>',
            '<span class="ud-refresh">Last Update:</span>',
          '</div>',
        '</div>',
        '<div class="ud-control-strip">',
          '<div class="ud-card ud-cutoff">',
            '<div class="ud-card-label">KM Cutoff</div>',
            '<div class="ud-card-value"><span id="ud-km-value">0</span> km</div>',
            '<input id="ud-km-slider" type="range" min="0" max="600" step="5" value="0" />',
            '<div class="ud-slider-row"><span>0</span><span>600</span></div>',
            '<select id="ud-cutoff-mode" class="ud-select">',
              '<option value="all">Show All</option>',
              '<option value="below">Below Cutoff Only</option>',
              '<option value="above">Above Cutoff Only</option>',
            '</select>',
          '</div>',
          '<div class="ud-card ud-date">',
            '<div class="ud-card-label">Date Range</div>',
            '<button class="ud-date-btn" id="ud-date-btn" type="button">Select Date Range ▾</button>',
            '<div class="ud-quick-days">',
              '<button type="button" data-days="7" class="active">7</button>',
              '<button type="button" data-days="14">14</button>',
              '<button type="button" data-days="21">21</button>',
              '<button type="button" data-days="28">28</button>',
            '</div>',
          '</div>',
          '<div class="ud-card ud-metric">',
            '<div><span>Active</span><strong>0</strong></div>',
            '<div><span>Workshop</span><strong>0</strong></div>',
            '<div><span>EXM</span><strong>0</strong></div>',
            '<div><span>No Telematics</span><strong>0</strong></div>',
          '</div>',
          '<div class="ud-filter-cards-wrap" id="ud-filter-cards"></div>',
        '</div>',
        '<div class="ud-status-row">',
          '<button type="button">Filters: All selected</button>',
          '<span id="ud-range-summary">Date Range:</span>',
        '</div>',
        '<div class="ud-table-wrap">',
          '<table class="ud-table">',
            '<thead id="ud-table-head"></thead>',
            '<tbody id="ud-table-body"></tbody>',
          '</table>',
        '</div>',
        '<div class="ud-date-modal" id="ud-date-modal">',
          '<div class="ud-date-panel">',
            '<div class="ud-date-panel-head">',
              '<strong>Select Date Range</strong>',
              '<button id="ud-date-close" type="button">×</button>',
            '</div>',
            '<div class="ud-date-panel-body">',
              '<label>Start Date<input id="ud-start-date" type="date" /></label>',
              '<label>End Date<input id="ud-end-date" type="date" /></label>',
            '</div>',
            '<div class="ud-date-panel-foot">',
              '<button id="ud-date-apply" type="button">Apply Date Range</button>',
            '</div>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');

    wireEvents();
    updateDateSummary();
    renderTable();
    initData();
  }

  function renderFilterCards() {
    var wrap = TGE.el('ud-filter-cards');
    if (!wrap) return;
    wrap.innerHTML = state.fieldDefs.map(function (def) {
      var col = def.source_column;
      var label = def.filter_label || def.display_label || col;
      var selected = state.filters[col] || new Set();
      var isOpen = state.openFilterCol === col;
      var values = getAvailableValues(col);

      var summary = 'All';
      if (selected.size === 1) summary = selected.values().next().value;
      else if (selected.size > 1) summary = selected.size + ' selected';

      var listHtml = values.length
        ? values.map(function (v) {
            var checked = selected.has(v.value);
            return '<label class="ud-filter-opt">' +
              '<input type="checkbox" class="ud-filter-check" data-col="' + esc(col) + '" value="' + esc(v.value) + '"' + (checked ? ' checked' : '') + ' />' +
              '<span>' + esc(v.value) + '</span>' +
              '<em>' + v.count + '</em>' +
            '</label>';
          }).join('')
        : '<div class="ud-filter-pop-empty">No values available</div>';

      return [
        '<div class="ud-card ud-filter-card">',
          '<div class="ud-card-label">' + esc(label) + '</div>',
          '<button class="ud-filter-btn" type="button" data-col="' + esc(col) + '"><span>' + esc(summary) + '</span><span>▾</span></button>',
          '<div class="ud-filter-pop' + (isOpen ? ' open' : '') + '" data-col="' + esc(col) + '">',
            '<div class="ud-filter-pop-list">' + listHtml + '</div>',
            (selected.size ? '<button type="button" class="ud-filter-clear" data-col="' + esc(col) + '">Clear</button>' : ''),
          '</div>',
        '</div>'
      ].join('');
    }).join('');
  }

  // Returns distinct values (+ counts) for `col`, computed against the fleet
  // as filtered by every *other* active filter. This is what makes filters
  // cascade — a column's own popover never restricts itself, but does
  // reflect every other currently-selected filter.
  function getAvailableValues(col) {
    var counts = {};
    state.fleet.forEach(function (asset) {
      if (!matchesFilters(asset, col)) return;
      var val = asset.fields && asset.fields[col] != null ? String(asset.fields[col]).trim() : '';
      if (!val) return;
      counts[val] = (counts[val] || 0) + 1;
    });
    return Object.keys(counts).sort().map(function (v) {
      return { value: v, count: counts[v] };
    });
  }

  // True if `asset` matches every active filter except `excludeCol` (pass
  // null to check against all active filters with no exclusion).
  function matchesFilters(asset, excludeCol) {
    return Object.keys(state.filters).every(function (col) {
      if (col === excludeCol) return true;
      var selected = state.filters[col];
      if (!selected || !selected.size) return true;
      var val = asset.fields && asset.fields[col] != null ? String(asset.fields[col]).trim() : '';
      return selected.has(val);
    });
  }

function getVisibleFleet() {
    return state.fleet.filter(function (a) {
      if (!matchesFilters(a, null)) return false;
      if (state.telematicsOnly) {
        var raw = state.telematicsSourceColumn && a.fields ? a.fields[state.telematicsSourceColumn] : null;
        if (raw == null || String(raw).trim() === '') return false;
      }
      return true;
    });
  }

  function updateFilterStatusText() {
    var btn = document.querySelector('.ud-status-row button');
    if (!btn) return;
    var activeCols = Object.keys(state.filters).filter(function (c) {
      return state.filters[c] && state.filters[c].size;
    });
    btn.textContent = activeCols.length
      ? 'Filters: ' + activeCols.length + ' active'
      : 'Filters: All selected';
  }

  // Delegated events for filter popovers — attached once (guarded), since
  // renderFilterCards() rebuilds the cards' innerHTML on every change and
  // per-element listeners would be lost (and re-attaching per render would
  // stack up duplicates across repeated view navigation).
  function wireFilterDelegation() {
    if (window.__udFilterDelegated) return;
    window.__udFilterDelegated = true;

    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.ud-filter-btn');
      if (btn) {
        var col = btn.dataset.col;
        state.openFilterCol = (state.openFilterCol === col) ? null : col;
        renderFilterCards();
        return;
      }
      var clearBtn = e.target.closest && e.target.closest('.ud-filter-clear');
      if (clearBtn) {
        delete state.filters[clearBtn.dataset.col];
        renderTable();
        updateTotalPill();
        renderFilterCards();
        return;
      }
      if (state.openFilterCol && !(e.target.closest && e.target.closest('.ud-filter-card'))) {
        state.openFilterCol = null;
        renderFilterCards();
      }
    });

    document.addEventListener('change', function (e) {
      if (!e.target.classList || !e.target.classList.contains('ud-filter-check')) return;
      var col = e.target.dataset.col;
      var val = e.target.value;
      if (!state.filters[col]) state.filters[col] = new Set();
      if (e.target.checked) state.filters[col].add(val);
      else state.filters[col].delete(val);
      if (!state.filters[col].size) delete state.filters[col];
      renderTable();
      updateTotalPill();
      renderFilterCards();
    });
  }

  function wireEvents() {
    wireFilterDelegation();
    TGE.on('ud-km-slider', 'input', function (e) {
      state.kmCutoff = parseInt(e.target.value, 10) || 0;
      TGE.setText('ud-km-value', state.kmCutoff);
    });
    TGE.on('ud-cutoff-mode', 'change', function (e) {
      state.cutoffMode = e.target.value;
    });
TGE.on('ud-history-btn', 'click', function () {
      state.history = !state.history;
      var btn = TGE.el('ud-history-btn');
      btn.textContent = 'History: ' + (state.history ? 'On' : 'Off');
      btn.classList.toggle('ud-primary', state.history);
      loadFleet();
    });
    TGE.on('ud-telematics-btn', 'click', function () {
      state.telematicsOnly = !state.telematicsOnly;
      var btn = TGE.el('ud-telematics-btn');
      btn.textContent = 'Telematics: ' + (state.telematicsOnly ? 'On' : 'Off');
      btn.classList.toggle('ud-primary', state.telematicsOnly);
      renderTable();
      updateTotalPill();
    });
    TGE.on('ud-date-btn', 'click', function () {
      TGE.el('ud-date-modal').classList.add('open');
    });
    TGE.on('ud-date-close', 'click', function () {
      TGE.el('ud-date-modal').classList.remove('open');
    });
    document.querySelectorAll('[data-days]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-days]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.days = parseInt(btn.dataset.days, 10);
        state.endDate = startOfDay(new Date());
        state.startDate = addDays(state.endDate, -(state.days - 1));
        updateDateSummary();
        renderTable();
      });
    });
    TGE.on('ud-date-apply', 'click', function () {
      var s = TGE.el('ud-start-date').value;
      var e = TGE.el('ud-end-date').value;
      if (!s || !e) return;
      state.startDate = new Date(s + 'T00:00:00');
      state.endDate = new Date(e + 'T00:00:00');
      state.days = daysBetween(state.startDate, state.endDate) + 1;
      document.querySelectorAll('[data-days]').forEach(function (b) { b.classList.remove('active'); });
      TGE.el('ud-date-modal').classList.remove('open');
      updateDateSummary();
      renderTable();
    });
  }

  function updateDateSummary() {
    TGE.setText(
      'ud-range-summary',
      'Date Range: ' + fmtFullDate(state.startDate) + ' - ' + fmtFullDate(state.endDate) + ' (' + state.days + ' Days)'
    );
  }

  function renderTable() {
    var dates = getDateRange();
    var head = TGE.el('ud-table-head');
    var body = TGE.el('ud-table-body');
    if (!head || !body) return;
var top = '<tr>';
    top += '<th rowspan="2" class="ud-pin-left"><div class="ud-pin-left-inner"><span class="ud-pin-legacy-part">Legacy<br>Number</span><span class="ud-pin-gps-part" title="Telematics status">GPS</span></div></th>';
    dates.forEach(function (d) {
      top += '<th colspan="3" class="ud-date-hdr">' + fmtDateHeader(d) + '</th>';
    });
    top += '<th rowspan="2" class="ud-pin-avg"><div class="ud-pin-right-inner"><span class="ud-pin-total-part">Total KM</span><span class="ud-pin-avgday-part">Avg/Day</span></div></th>';
    top += '</tr>';
    var sub = '<tr>';
    dates.forEach(function () {
      sub += '<th class="ud-sub-hdr ud-dcol">KM</th>';
      sub += '<th class="ud-sub-hdr ud-dcol">WS</th>';
      sub += '<th class="ud-sub-hdr ud-dcol">EXM</th>';
    });
    sub += '</tr>';
    head.innerHTML = top + sub;

    updateFilterStatusText();
    var visible = getVisibleFleet();
    var colspan = 1 + (dates.length * 3) + 1;

    if (!state.loaded) {
      body.innerHTML = '<tr><td colspan="' + colspan + '" class="ud-empty-row">Loading fleet data…</td></tr>';
      return;
    }
    if (!visible.length) {
      body.innerHTML = '<tr><td colspan="' + colspan + '" class="ud-empty-row">No assets match the selected filters.</td></tr>';
      return;
    }

    body.innerHTML = visible.map(function (asset) {
var row = '<tr' + (asset.status === 'inactive' ? ' class="ud-row-inactive"' : '') + '>';
      var gpsRaw = state.telematicsSourceColumn && asset.fields ? asset.fields[state.telematicsSourceColumn] : null;
      var gpsOn = gpsRaw != null && String(gpsRaw).trim() !== '';
      row += '<td class="ud-pin-left"><div class="ud-pin-left-inner"><span class="ud-pin-legacy-part">' + esc(asset.legacyNumber) + '</span><span class="ud-pin-gps-part"><span class="ud-gps-dot ' + (gpsOn ? 'ud-gps-on' : 'ud-gps-off') + '"></span></span></div></td>';
      dates.forEach(function () {
        row += '<td class="ud-dcol">-</td>';
        row += '<td class="ud-dcol">-</td>';
        row += '<td class="ud-dcol">-</td>';
      });
      row += '<td class="ud-pin-avg"><div class="ud-pin-right-inner"><span class="ud-pin-total-part">-</span><span class="ud-pin-avgday-part">-</span></div></td>';
      row += '</tr>';
return row;
    }).join('');
  }

function alignPinnedGpsColumn() {
    var head = TGE.el('ud-table-head');
    var table = head && head.closest('table');
    if (!table) return;
    var legacyCell = table.querySelector('.ud-pin-left');
    if (!legacyCell) return;
    var width = legacyCell.getBoundingClientRect().width;
    var styleTag = TGE.el('ud-gps-align-style');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'ud-gps-align-style';
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = '.ud-pin-gps{left:' + width + 'px !important;}';
  }

async function loadFieldDefs() {
    var result = await TGE.api('GET', '/api/utilisation/static-fields');
    var all = (result.ok && result.data && Array.isArray(result.data.fields)) ? result.data.fields : [];
    state.telematicsSourceColumn = (all.find(function (f) { return f.is_telematics_source === 1; }) || {}).source_column || null;
    state.fieldDefs = all
      .filter(function (f) { return f.use_as_filter === 1 && f.enabled !== 0; })
      .sort(function (a, b) { return (a.display_order || 0) - (b.display_order || 0); });
  }

  async function initData() {
    await loadFieldDefs();
    renderFilterCards();
    await loadFleet();
  }

  async function loadFleet() {
    var path = '/api/utilisation/static-fleet' + (state.history ? '?history=1' : '');
    var result = await TGE.api('GET', path);
    state.fleet = (result.ok && result.data && Array.isArray(result.data.fleet)) ? result.data.fleet : [];
    state.loaded = true;
    updateTotalPill();
    renderTable();
    renderFilterCards();
  }

  function updateTotalPill() {
    var visible = getVisibleFleet();
    var visibleActive = visible.filter(function (a) { return a.status === 'active'; }).length;
    TGE.setText('ud-total', 'Assets: ' + visibleActive + ' / ' + state.fleet.length);
  }

  function ensureSidebarLegend() {
    if (document.getElementById('ud-sidebar-legend')) return;
    var sidebar = document.querySelector('.sidebar');
    var footer = document.querySelector('.sidebar-footer');
    if (!sidebar) return;
    var legend = document.createElement('div');
    legend.id = 'ud-sidebar-legend';
    legend.innerHTML = [
      '<div class="ud-side-title">Fleet Utilisation Legend</div>',
      '<div class="ud-side-row"><strong>KM</strong><span>Daily kilometres travelled</span></div>',
      '<div class="ud-side-row"><strong>WS</strong><span>Workshop booking</span></div>',
      '<div class="ud-side-row"><strong>EXM</strong><span>Exempt from utilisation</span></div>',
      '<div class="ud-side-swatch"><span>🔧</span><em>Workshop booking</em></div>',
      '<div class="ud-side-swatch"><span>⚠</span><em>Non-functioning device</em></div>',
      '<div class="ud-side-swatch"><span>📡</span><em>No telematics</em></div>',
      '<div class="ud-side-swatch"><i class="ud-red"></i><em>Below KM cutoff</em></div>',
      '<div class="ud-side-swatch"><i class="ud-hist"></i><em>Historical / inactive</em></div>',
    ].join('');
    if (footer && footer.parentNode) footer.parentNode.insertBefore(legend, footer);
    else sidebar.appendChild(legend);
  }

  function watchActiveView() {
    function update() {
      var active = TGE.el('view-utilisation') && TGE.el('view-utilisation').classList.contains('active');
      document.body.classList.toggle('ud-util-active', !!active);
    }
    update();
    if (window.__udViewObserver) return;
    window.__udViewObserver = new MutationObserver(update);
    document.querySelectorAll('.view').forEach(function (v) {
      window.__udViewObserver.observe(v, { attributes: true, attributeFilter: ['class'] });
    });
  }

  function getDateRange() {
    var dates = [];
    var d = new Date(state.startDate.getTime());
    while (d <= state.endDate) {
      dates.push(new Date(d.getTime()));
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }

  function fmtDateHeader(d) {
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' +
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  }

  function fmtFullDate(d) {
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDays(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  function daysBetween(a, b) {
    return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function injectStyles() {
    if (document.getElementById('ud-style')) return;
    var style = document.createElement('style');
    style.id = 'ud-style';
    style.textContent = [
      '.view#view-utilisation.active{padding:0!important;height:calc(100vh - var(--topbar-h));overflow:hidden;display:flex;justify-content:center;align-items:stretch;}',
      '.ud-shell{width:95%;height:100%;display:flex;flex-direction:column;background:#f4f5f7;color:#172b4d;overflow:hidden;padding:6px 10px;}',
      '.ud-header{height:48px;background:#143200;border-radius:12px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;gap:12px;flex-shrink:0;margin-bottom:8px;}',
      '.ud-title-wrap{display:flex;align-items:center;gap:10px;min-width:260px;}',
      '.ud-title{font-size:14px;font-weight:800;color:#c8f135;}',
      '.ud-subtitle{font-size:10px;color:rgba(255,255,255,.55);}',
      '.ud-logo-bars{width:38px;height:28px;position:relative;flex-shrink:0;}',
      '.ud-logo-bars span{position:absolute;left:0;width:36px;height:5px;background:#c8f135;border-radius:8px;transform:skewY(-9deg);}',
      '.ud-logo-bars span:nth-child(1){top:4px}.ud-logo-bars span:nth-child(2){top:12px}.ud-logo-bars span:nth-child(3){top:20px}',
      '.ud-header-actions{display:flex;align-items:center;gap:8px;}',
      '.ud-total{font-size:12px;font-weight:800;color:#143200;background:#c8f135;padding:4px 10px;border-radius:20px;white-space:nowrap;}',
      '.ud-refresh{font-size:11px;color:rgba(235,235,235,.55);white-space:nowrap;}',
      '.ud-btn{height:28px;padding:0 10px;border:1px solid rgba(200,241,53,.35);border-radius:6px;background:rgba(255,255,255,.08);font-size:11px;color:#ebebeb;cursor:pointer;}',
      '.ud-primary{background:#c8f135!important;color:#143200!important;border-color:#c8f135!important;font-weight:800;}',
      '.ud-disabled{opacity:.45;cursor:not-allowed;}',
      '.ud-control-strip{display:flex;gap:8px;padding:8px 0;background:#f4f5f7;overflow-x:auto;align-items:stretch;flex-shrink:0;}',
      '.ud-filter-cards-wrap{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px;}',
      '.ud-card-label{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#6b778c;font-weight:700;}',
      '.ud-card-value{font-size:18px;font-weight:800;color:#143200;}',
      '.ud-cutoff input[type=range]{width:100%;accent-color:#143200;}',
      '.ud-slider-row{display:flex;justify-content:space-between;font-size:10px;color:#6b778c;}',
      '.ud-select,.ud-date-btn,.ud-filter-btn{height:26px;border:1px solid #e6e8ec;border-radius:6px;background:#fff;color:#172b4d;font-size:11px;padding:0 8px;}',
      '.ud-date-btn{cursor:pointer;width:100%;}',
      '.ud-quick-days{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;}',
      '.ud-quick-days button{height:24px;border:1px solid #e6e8ec;background:#fff;border-radius:6px;color:#143200;font-size:11px;cursor:pointer;}',
      '.ud-quick-days button.active{background:#143200;color:#c8f135;border-color:#143200;font-weight:800;}',
      '.ud-metric{display:grid;grid-template-columns:1fr 1fr;gap:5px 9px;min-width:145px;}',
      '.ud-metric span{display:block;font-size:9px;text-transform:uppercase;color:#6b778c;font-weight:700;}',
      '.ud-metric strong{font-size:17px;color:#143200;}',
      '.ud-filter-card{position:relative;}',
      '.ud-filter-btn{display:flex;align-items:center;justify-content:space-between;width:100%;cursor:pointer;text-align:left;}',
      '.ud-filter-btn span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px;}',
      '.ud-filter-empty{font-size:10px;color:#8a9e92;}',
      '.ud-filter-pop{display:none;position:absolute;top:100%;left:0;margin-top:4px;width:220px;background:#fff;border:1px solid #dce8e0;border-radius:10px;box-shadow:0 12px 28px rgba(0,0,0,.18);z-index:80;overflow:hidden;}',
      '.ud-filter-pop.open{display:block;}',
      '.ud-filter-pop-list{max-height:260px;overflow-y:auto;padding:6px;}',
      '.ud-filter-opt{display:flex;align-items:center;gap:7px;padding:5px 6px;border-radius:6px;font-size:12px;color:#172b4d;cursor:pointer;}',
      '.ud-filter-opt:hover{background:#f4f5f7;}',
      '.ud-filter-opt input{flex-shrink:0;}',
      '.ud-filter-opt span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.ud-filter-opt em{font-style:normal;font-size:10px;color:#8a9e92;flex-shrink:0;}',
      '.ud-filter-pop-empty{padding:14px;font-size:11px;color:#8a9e92;text-align:center;}',
      '.ud-filter-clear{width:100%;height:30px;border:none;border-top:1px solid #e6e8ec;background:#f4f5f7;color:#143200;font-size:11px;font-weight:700;cursor:pointer;}',
      '.ud-status-row{height:28px;display:flex;align-items:center;gap:12px;padding:0 2px;background:#f4f5f7;flex-shrink:0;}',
      '.ud-status-row button{height:24px;border:1px solid #dce8e0;background:#fff;color:#143200;border-radius:6px;font-size:11px;padding:0 9px;}',
      '.ud-status-row span{font-size:11px;color:#5a6e62;font-weight:600;}',
      '.ud-table-wrap{flex:1;overflow:auto;background:#fff;border:1px solid #e6e8ec;border-radius:10px;min-height:0;}',
      '.ud-table-wrap::-webkit-scrollbar{height:12px;width:12px;}',
      '.ud-table-wrap::-webkit-scrollbar-thumb{background:#a8d460;border-radius:8px;border:2px solid #fff;}',
      '.ud-table-wrap::-webkit-scrollbar-track{background:#f0f4f1;border-radius:8px;}',
      '.ud-table{border-collapse:separate;border-spacing:0;min-width:max-content;width:max-content;}',
      '.ud-table th,.ud-table td{padding:3px 8px;text-align:center;border-bottom:1px solid #e6e8ec;border-right:1px solid #e6e8ec;white-space:nowrap;height:32px;font-size:11px;}',
      '.ud-table th{position:sticky;top:0;background:#143200;color:#c8f135;font-weight:700;z-index:10;font-size:10px;}',
      '.ud-table tr:nth-child(2) th{top:32px;}',
     '.ud-pin-left-inner,.ud-pin-right-inner{display:flex;align-items:center;justify-content:center;gap:8px;}',
      '.ud-pin-legacy-part{min-width:100px;}',
      '.ud-pin-gps-part{min-width:36px;}',
      '.ud-pin-total-part,.ud-pin-avgday-part{min-width:60px;}',
      '.ud-gps-dot{display:inline-block;width:10px;height:10px;border-radius:50%;}',
      '.ud-gps-on{background:#1f9d55;}',
      '.ud-gps-off{background:#d43a3a;}',
      '.ud-pin-avg{position:sticky!important;right:0;background:#f0f1f3!important;color:#172b4d!important;z-index:40!important;min-width:150px;}',
      '.ud-date-hdr{min-width:108px;}',
      '.ud-sub-hdr{font-size:9px!important;color:#dbe8c3!important;text-transform:uppercase;}',
      '.ud-dcol{min-width:36px;width:36px;padding:2px!important;}',
      '.ud-date-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:600;pointer-events:none;}',
      '.ud-date-modal.open{display:flex;pointer-events:auto;}',
      '.ud-date-panel{width:440px;background:#fff;border:1px solid #dce8e0;border-radius:12px;box-shadow:0 18px 44px rgba(0,0,0,.28);overflow:hidden;pointer-events:auto;}',
      '.ud-date-panel-head{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid #e6e8ec;}',
      '.ud-date-panel-head strong{font-size:13px;color:#172b4d;}',
      '.ud-date-panel-head button{border:none;background:none;font-size:20px;cursor:pointer;color:#6b778c;}',
      '.ud-date-panel-body{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:14px;}',
      '.ud-date-panel-body label{font-size:11px;color:#6b778c;font-weight:700;}',
      '.ud-date-panel-body input{display:block;width:100%;height:34px;border:1px solid #e6e8ec;border-radius:7px;padding:0 8px;margin-top:5px;}',
      '.ud-date-panel-foot{height:52px;background:#143200;display:flex;align-items:center;justify-content:flex-end;padding:0 12px;}',
      '.ud-date-panel-foot button{height:34px;background:#c8f135;color:#143200;border:1px solid #c8f135;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer;padding:0 14px;}',
      '#ud-sidebar-legend{display:none;margin:10px 8px 8px;padding:10px;border:1px solid rgba(200,241,53,.25);border-radius:10px;background:rgba(255,255,255,.04);color:rgba(255,255,255,.78);}',
      'body.ud-util-active #ud-sidebar-legend{display:block;}',
      '.ud-side-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#c8f135;margin-bottom:8px;}',
      '.ud-side-row{display:grid;grid-template-columns:34px 1fr;gap:6px;font-size:10px;margin-bottom:6px;}',
      '.ud-side-row strong{color:#c8f135;}',
      '.ud-side-swatch{display:flex;align-items:center;gap:6px;font-size:10px;margin-top:6px;}',
      '.ud-side-swatch span{width:18px;text-align:center;}',
      '.ud-side-swatch em{font-style:normal;}',
      '.ud-side-swatch i{width:10px;height:10px;border-radius:2px;display:inline-block;}',
      '.ud-red{background:#ff5630;}',
      '.ud-hist{background:#f3d7d7;border:1px solid #bf2600;}',
      '.ud-empty-row{color:#6b778c;font-style:italic;height:60px;font-size:12px!important;}',
      '.ud-row-inactive{filter:grayscale(1);opacity:.55;}'
    ].join('');

    document.head.appendChild(style);
  }

  TGE.onShow.utilisation = render;
})();
