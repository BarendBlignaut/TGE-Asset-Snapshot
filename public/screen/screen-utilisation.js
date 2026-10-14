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
    telematicsOnly: true,
    startDate: null,
    endDate: null,
    fleet: [],
    loaded: false,
fieldDefs: [],
    telematicsSourceColumn: null,
    vendorMetrics: {},
    workshopBookings: {},
    nonFunctioning: {},
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
            '<button class="ud-btn ud-mgmt-report-btn" id="ud-mgmt-report-btn" type="button">Management Report</button>',
'<span class="ud-total" id="ud-total">Assets: 0 / 0</span>',
            '<button class="ud-btn ud-primary" id="ud-telematics-btn" type="button">Telematics: On</button>',
            '<button class="ud-btn" id="ud-history-btn" type="button">History: Off</button>',
            '<span id="ud-export-wrap"></span>',
            '<span class="ud-refresh">Last Update:</span>',
          '</div>',
        '</div>',
        '<div class="ud-control-strip">',
         '<div class="ud-card ud-cutoff">',
            '<div class="ud-card-label">KM Cutoff</div>',
            '<div class="ud-card-value"><span id="ud-km-value">0</span> km</div>',
            '<input id="ud-km-slider" type="range" min="0" max="600" step="5" value="0" />',
            '<div class="ud-slider-row"><span>0</span><span>600</span></div>',
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
            '<div><span>Active</span><strong id="ud-stat-active">0</strong></div>',
            '<div><span>Workshop</span><strong id="ud-stat-workshop">0</strong></div>',
            '<div><span>EXM</span><strong id="ud-stat-exm">0</strong></div>',
            '<div><span>No Telematics</span><strong id="ud-stat-no-telematics">0</strong></div>',
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

function positionOpenFilterPop() {
    if (!state.openFilterCol) return;
    var btn = document.querySelector('.ud-filter-btn[data-col="' + state.openFilterCol.replace(/"/g, '\\"') + '"]');
    var pop = document.querySelector('.ud-filter-pop.open');
    if (!btn || !pop) return;
    var rect = btn.getBoundingClientRect();
    pop.style.top = (rect.bottom + 4) + 'px';
    pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
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

var allHtml = '<label class="ud-filter-opt ud-filter-opt-all">' +
        '<input type="checkbox" class="ud-filter-check-all" data-col="' + esc(col) + '"' + (selected.size === 0 ? ' checked' : '') + ' />' +
        '<span>All</span>' +
      '</label>';

      var listHtml = values.length
        ? allHtml + values.map(function (v) {
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

    positionOpenFilterPop();
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
      if (e.target.classList && e.target.classList.contains('ud-filter-check-all')) {
        delete state.filters[e.target.dataset.col];
        renderTable();
        updateTotalPill();
        renderFilterCards();
        return;
      }
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
    wirePinnedColumnScroll();
  TGE.on('ud-km-slider', 'input', function (e) {
      state.kmCutoff = parseInt(e.target.value, 10) || 0;
      TGE.setText('ud-km-value', state.kmCutoff);
    });
    TGE.on('ud-km-slider', 'change', function () {
      renderTable();
    });
TGE.on('ud-mgmt-report-btn', 'click', function () {
      var html = buildManagementReportHtml();
      var blob = new Blob([html], { type: 'text/html' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'Fleet-Utilisation-Management-Report-' + isoDate(new Date()) + '.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
       URL.revokeObjectURL(url);
    });
    renderExportPill();
  
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
        loadVendorMetrics();
        loadWorkshopBookings();
        loadNonFunctioning();
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
      loadVendorMetrics();
      loadWorkshopBookings();
      loadNonFunctioning();
    });
  }

  function updateDateSummary() {
    TGE.setText(
      'ud-range-summary',
      'Date Range: ' + fmtFullDate(state.startDate) + ' - ' + fmtFullDate(state.endDate) + ' (' + state.days + ' Days)'
    );
  }
function positionPinnedColumns() {
    var wrap = document.querySelector('.ud-table-wrap');
    if (!wrap) return;
    var t = 'translateX(' + wrap.scrollLeft + 'px)';
    wrap.querySelectorAll('th.ud-pin-left, th.ud-pin-avg').forEach(function (el) {
      el.style.transform = t;
    });
  }

function wirePinnedColumnScroll() {
    if (window.__udPinScrollWired) return;
    window.__udPinScrollWired = true;
    var lastScrollTop = null;
    document.addEventListener('scroll', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('ud-table-wrap')) {
        var wrap = e.target;
        window.requestAnimationFrame(function () {
          positionPinnedColumns();
          if (wrap.scrollTop !== lastScrollTop) {
            lastScrollTop = wrap.scrollTop;
            renderVisibleRows();
          }
        });
      }
    }, true);
  }

  var ROW_HEIGHT = 32;
  var BUFFER_ROWS = 10;
  var CURRENT_VISIBLE = [];
  var CURRENT_DATES = [];

  // Builds only the rows currently scrolled into view (plus a small buffer),
  // sitting between two spacer rows that hold the correct total height, so
  // the browser only ever handles ~30-50 real rows at a time regardless of
  // how many assets are in the filtered fleet — same technique as File Spec.
  function renderVisibleRows() {
    var wrap = document.querySelector('.ud-table-wrap');
    var body = TGE.el('ud-table-body');
    if (!wrap || !body) return;

    var visible = CURRENT_VISIBLE;
    var dates = CURRENT_DATES;
    var total = visible.length;
    var colspan = 1 + (dates.length * 3) + 1;

    var viewportH = wrap.clientHeight || 500;
    var scrollTop = wrap.scrollTop;

    var visibleCount = Math.ceil(viewportH / ROW_HEIGHT) + BUFFER_ROWS * 2;
    var startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
    var endIndex = Math.min(total, startIndex + visibleCount);

    var topHeight = startIndex * ROW_HEIGHT;
    var bottomHeight = (total - endIndex) * ROW_HEIGHT;

    var html = '';
    if (topHeight > 0) {
      html += '<tr aria-hidden="true"><td colspan="' + colspan + '" style="padding:0;border:none;height:' + topHeight + 'px;"></td></tr>';
    }

    for (var i = startIndex; i < endIndex; i++) {
      var asset = visible[i];
      var row = '<tr' + (asset.status === 'inactive' ? ' class="ud-row-inactive"' : '') + '>';
      var gpsRaw = state.telematicsSourceColumn && asset.fields ? asset.fields[state.telematicsSourceColumn] : null;
      var gpsOn = gpsRaw != null && String(gpsRaw).trim() !== '';
      row += '<td class="ud-pin-left"><div class="ud-pin-left-inner"><span class="ud-pin-legacy-part">' + esc(asset.legacyNumber) + '</span><span class="ud-pin-gps-part"><span class="' + (gpsOn ? 'ud-gps-on' : 'ud-gps-off') + '"><svg viewBox="0 0 24 24" width="12" height="12"><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/></svg></span></span></div></td>';
      var totalKm = 0;
      var hasAnyKm = false;
      dates.forEach(function (d) {
        var key = asset.legacyNumber + '|' + isoDate(d) + '|km';
        var kmVal = state.vendorMetrics[key];
        if (kmVal != null) {
          totalKm += Number(kmVal);
          hasAnyKm = true;
        }
        var kmLow = (kmVal != null && state.kmCutoff > 0 && Number(kmVal) < state.kmCutoff);
        var contradiction = (!gpsOn && kmVal != null);
        var kmText = kmVal != null ? Number(kmVal).toFixed(1) : (gpsOn ? '0' : '-');
        row += '<td class="ud-dcol' + (kmLow ? ' ud-km-low' : '') + (contradiction ? ' ud-km-contradiction' : '') + '">' + kmText + '</td>';
        var wsBookings = state.workshopBookings[asset.legacyNumber + '|' + isoDate(d)];
        if (wsBookings && wsBookings.length) {
          var wsTitle = wsBookings.map(function (b) { return b.task + ' (' + b.status + ')'; }).join('\n');
          row += '<td class="ud-dcol" title="' + esc(wsTitle) + '"><span class="ud-ws-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M21.7 15.3a5 5 0 01-6.6 6.6l-7.8-7.8a5 5 0 01-6.2-6.2 1 1 0 011.7-.5l2.8 2.8 2-2-2.8-2.8a1 1 0 01.5-1.7 5 5 0 016.2 6.2l7.8 7.8a1 1 0 001.4-1.4z"/></svg></span></td>';
        } else {
          row += '<td class="ud-dcol">-</td>';
        }
        var nf = state.nonFunctioning[asset.legacyNumber];
        var dStr = isoDate(d);
        var isNonFunctioning = nf && dStr >= nf.dateStart && dStr <= nf.dateEnd;
        if (isNonFunctioning) {
          row += '<td class="ud-dcol" title="Non-functioning ' + esc(nf.dateStart) + ' to ' + esc(nf.dateEnd) + '"><span class="ud-exm-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2L1 21h22L12 2zm0 5.5a1.5 1.5 0 011.5 1.5v5a1.5 1.5 0 01-3 0v-5A1.5 1.5 0 0112 7.5zm0 10.75a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z"/></svg></span></td>';
        } else {
          row += '<td class="ud-dcol">-</td>';
        }
      });
      row += '<td class="ud-pin-avg"><div class="ud-pin-right-inner"><span class="ud-pin-total-part">' + (hasAnyKm ? totalKm.toFixed(1) : '-') + '</span><span class="ud-pin-avgday-part">-</span></div></td>';
      row += '</tr>';
      html += row;
    }

    if (bottomHeight > 0) {
      html += '<tr aria-hidden="true"><td colspan="' + colspan + '" style="padding:0;border:none;height:' + bottomHeight + 'px;"></td></tr>';
    }

    body.innerHTML = html;
    positionPinnedColumns();
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

    CURRENT_VISIBLE = visible;
    CURRENT_DATES = dates;
    renderVisibleRows();
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
            .sort(function (a, b) {
        // Admin-set filter order first (File Spec preview); unset ones go last.
        var ao = a.filter_order == null ? Infinity : a.filter_order;
        var bo = b.filter_order == null ? Infinity : b.filter_order;
        if (ao !== bo) return ao - bo;
        return (a.display_order || 0) - (b.display_order || 0);
      });
  }

  async function initData() {
    await loadFieldDefs();
    renderFilterCards();
    await loadFleet();
  }

  function isoDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  async function loadVendorMetrics() {
    if (!state.startDate || !state.endDate) return;
    var start = isoDate(state.startDate);
    var end = isoDate(state.endDate);
    var result = await TGE.api('GET', '/api/utilisation/vendor-metrics?start=' + start + '&end=' + end);
    state.vendorMetrics = (result.ok && result.data && result.data.metrics) ? result.data.metrics : {};
    renderTable();
  }

  async function loadWorkshopBookings() {
    if (!state.startDate || !state.endDate) return;
    var start = isoDate(state.startDate);
    var end = isoDate(state.endDate);
    var result = await TGE.api('GET', '/api/utilisation/workshop-bookings?start=' + start + '&end=' + end);
    state.workshopBookings = (result.ok && result.data && result.data.bookings) ? result.data.bookings : {};
    renderTable();
    updateTotalPill();
  }

  async function loadNonFunctioning() {
    if (!state.startDate || !state.endDate) return;
    var start = isoDate(state.startDate);
    var end = isoDate(state.endDate);
    var result = await TGE.api('GET', '/api/utilisation/non-functioning?start=' + start + '&end=' + end);
    state.nonFunctioning = (result.ok && result.data && result.data.nonFunctioning) ? result.data.nonFunctioning : {};
    renderTable();
    updateTotalPill();
  }
   
  async function loadFleet() {
    var path = '/api/utilisation/static-fleet' + (state.history ? '?history=1' : '');
    var result = await TGE.api('GET', path);
    state.fleet = (result.ok && result.data && Array.isArray(result.data.fleet)) ? result.data.fleet : [];
    state.loaded = true;
    updateTotalPill();
    renderTable();
    renderFilterCards();
    loadVendorMetrics();
    loadWorkshopBookings();
    loadNonFunctioning();
  }

 function updateTotalPill() {
    var visible = getVisibleFleet();
    var visibleActive = visible.filter(function (a) { return a.status === 'active'; }).length;
    TGE.setText('ud-total', 'Assets: ' + visibleActive + ' / ' + state.fleet.length);

    var telematicsCount = visible.filter(function (a) {
      var raw = state.telematicsSourceColumn && a.fields ? a.fields[state.telematicsSourceColumn] : null;
      return raw != null && String(raw).trim() !== '';
    }).length;
    var noTelematicsCount = visible.length - telematicsCount;

    TGE.setText('ud-stat-active', telematicsCount);
    TGE.setText('ud-stat-no-telematics', noTelematicsCount);

    var dates = getDateRange();
    var workshopCount = visible.filter(function (a) {
      return dates.some(function (d) {
        var key = a.legacyNumber + '|' + isoDate(d);
        var bookings = state.workshopBookings[key];
        return bookings && bookings.length;
      });
    }).length;
    TGE.setText('ud-stat-workshop', workshopCount);
    var exmCount = visible.filter(function (a) {
      var nf = state.nonFunctioning[a.legacyNumber];
      if (!nf) return false;
      return dates.some(function (d) {
        var dStr = isoDate(d);
        return dStr >= nf.dateStart && dStr <= nf.dateEnd;
      });
    }).length;
    TGE.setText('ud-stat-exm', exmCount);
  }

// ── Export pill ───────────────────────────────────────────────────────────
  // The pill and file writing are shared (public/core/tge-output.js). This
  // screen only decides which formats it offers (each tied to its Fleet
  // Utilisation toggle in Roles) and what goes in the file (udExportTable).
  function utilisationExportItems() {
    return [
      { id: 'ud-export-csv',  format: 'csv',  label: 'CSV',   suffix: '.csv',  icon: '📑', permission: ['utilisation', 'export-csv'],  action: function () { exportDashboard('csv'); } },
      { id: 'ud-export-xlsx', format: 'xlsx', label: 'Excel', suffix: '.xlsx', icon: '📊', permission: ['utilisation', 'export-xlsx'], action: function () { exportDashboard('xlsx'); } },
    ];
  }

  function renderExportPill() {
    var wrap = TGE.el('ud-export-wrap');
    if (!wrap || !TGE.buildOutputPill) return;
    var items = utilisationExportItems();
    wrap.innerHTML = TGE.buildOutputPill('ud', items, { theme: 'dark' });
    TGE.wireOutputPill('ud', items);
  }

  function exportDashboard(format) {
    var payload = buildReportPayload();
    if (!payload.assets.length) {
      alert('No assets match the selected filters.');
      return;
    }
    TGE.exportTable(udExportTable(payload, payload.assets), format, { module: 'Utilisation', type: 'Dashboard' });
  }

  // The columns and rows of a utilisation export. Also copied into the
  // Management Report file (see reportRuntimeScript), so both exports always
  // match. Keep it self-contained: no state, TGE or other helpers.
  function udExportTable(data, assets) {
    var header = ['Legacy Number'];
    data.filterColumns.forEach(function (fc) { header.push(fc.label); });
    header.push('Telematics');
    data.dates.forEach(function (d) { header.push(d + ' KM', d + ' WS', d + ' EXM'); });
    header.push('Total KM', 'Avg/Day');
    var rows = assets.map(function (a) {
      var row = [a.legacyNumber];
      data.filterColumns.forEach(function (fc) { row.push(a.fields[fc.col] || ''); });
      row.push(a.hasTelematics ? 'Yes' : 'No');
      var total = 0;
      var days = 0;
      data.dates.forEach(function (d) {
        var v = a.km[d];
        if (v != null) { total += v; days++; }
        row.push(v != null ? Math.round(v * 10) / 10 : (a.hasTelematics ? 0 : ''));
        row.push(a.ws && a.ws[d] ? 'Yes' : '');
        row.push(a.exm && a.exm[d] ? 'Yes' : '');
      });
      row.push(days ? Math.round(total * 10) / 10 : '');
      row.push(days ? Math.round((total / days) * 10) / 10 : '');
      return row;
    });
    return { header: header, rows: rows, sheetName: 'Utilisation' };
  }

  // The Management Report's own Export menu (the report is offline, so it
  // can't use the app's pill). Copied into the report file together with
  // udExportTable and the shared saveTable; getAssets returns the report's
  // currently filtered and sorted rows.
  function udReportExportMenu(raw, getAssets) {
    var wrap = document.getElementById('mr-export-wrap');
    var formats = raw.exportFormats || [];
    if (!wrap || !formats.length) return;
    var html = '<button type="button" class="mr-clear-btn" id="mr-export-btn">Export ▾</button><div class="mr-export-menu" id="mr-export-menu">';
    formats.forEach(function (f) { html += '<button type="button" data-fmt="' + f.format + '">' + f.label + '</button>'; });
    wrap.innerHTML = html + '</div>';
    var menu = document.getElementById('mr-export-menu');
    document.getElementById('mr-export-btn').onclick = function (e) {
      e.stopPropagation();
      menu.classList.toggle('open');
    };
    menu.querySelectorAll('button').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        menu.classList.remove('open');
        var assets = getAssets();
        if (!assets.length) { alert('No assets match the selected filters.'); return; }
        var d = new Date();
        var p = function (n) { return (n < 10 ? '0' : '') + n; };
        var stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
        saveTable(udExportTable(raw, assets), btn.dataset.fmt, 'Utilisation_ManagementReport_' + stamp);
      };
    });
    document.addEventListener('click', function () { menu.classList.remove('open'); });
  }

// ── Management Report: standalone, offline HTML export ────────────────────
  // Embeds exactly what's currently visible (respecting active filters and
  // the telematics toggle) as base64 data inside a single self-contained
  // HTML file. No server, no login — real filtering, telematics toggle and
  // KM cutoff highlighting all re-implemented as plain JS that runs entirely
  // inside the exported file.
  function buildManagementReportHtml() {
    var payload = buildReportPayload();
    // The report has no login, so the export formats this user may use are
    // decided now and baked into the file.
    payload.exportFormats = utilisationExportItems()
      .filter(function (item) { return TGE.can(item.permission[0], item.permission[1]); })
      .map(function (item) { return { format: item.format, label: item.label }; });

    var jsonStr = JSON.stringify(payload);
    var b64 = btoa(unescape(encodeURIComponent(jsonStr)));

    return buildReportShellHtml(b64);
  }

  // What's on screen right now (filters + telematics toggle), as plain data.
  // Shared by the Management Report and the dashboard export.
  function buildReportPayload() {
    var dates = getDateRange();
    var visible = getVisibleFleet();

    var filterColumns = state.fieldDefs.map(function (def) {
      return { col: def.source_column, label: def.display_label || def.source_column };
    });

    var assets = visible.map(function (a) {
      var fieldsOut = {};
      filterColumns.forEach(function (fc) { fieldsOut[fc.col] = a.fields ? (a.fields[fc.col] || '') : ''; });
      var telRaw = state.telematicsSourceColumn && a.fields ? a.fields[state.telematicsSourceColumn] : null;
      var hasTel = telRaw != null && String(telRaw).trim() !== '';
      var km = {};
      var ws = {};
      var exm = {};
      var nf = state.nonFunctioning[a.legacyNumber];
      dates.forEach(function (d) {
        var key = a.legacyNumber + '|' + isoDate(d) + '|km';
        var v = state.vendorMetrics[key];
        if (v != null) km[isoDate(d)] = Number(v);
        var wsKey = a.legacyNumber + '|' + isoDate(d);
        var bookings = state.workshopBookings[wsKey];
        if (bookings && bookings.length) ws[isoDate(d)] = true;
        var dStr = isoDate(d);
        if (nf && dStr >= nf.dateStart && dStr <= nf.dateEnd) exm[dStr] = true;
      });
      return {
        legacyNumber: a.legacyNumber,
        status: a.status,
        fields: fieldsOut,
        hasTelematics: hasTel,
        km: km,
        ws: ws,
        exm: exm,
      };
    });

    var payload = {
      generatedAt: new Date().toISOString(),
     dateRangeLabel: TGE.el('ud-range-summary') ? TGE.el('ud-range-summary').textContent : '',
      dates: dates.map(isoDate),
      filterColumns: filterColumns,
      kmCutoff: state.kmCutoff,
      assets: assets,
    };

    return payload;
  }

  function buildReportShellHtml(embeddedB64) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
       
'<title>TGE Fleet Utilisation — Management Report</title>' +
      
'<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js" async></script>' +
      '<style>' +
      'body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f4f6f4;color:#1a2b1e;}' +
      '.mr-header{background:#143200;color:#c8f135;padding:20px 28px;}' +
      '.mr-header h1{margin:0;font-size:20px;}' +
      '.mr-header p{margin:4px 0 0;font-size:12px;color:#d6f7a3;}' +
      '.mr-daterange{display:inline-block;margin-top:10px;background:rgba(255,255,255,.1);border:1px solid rgba(200,241,53,.35);border-radius:20px;padding:5px 14px;font-size:11px;font-weight:700;}' +
      '.mr-assets-count{font-size:12px;font-weight:700;color:#fff;}' +
      '.mr-clear-btn{height:26px;padding:0 12px;border-radius:20px;border:1px solid rgba(200,241,53,.35);background:rgba(255,255,255,.08);color:#c8f135;font-size:11px;font-weight:700;cursor:pointer;}' +
      '.mr-clear-btn:hover{background:rgba(255,255,255,.16);}' +
      '#mr-export-wrap{position:relative;display:inline-block;}' +
      '.mr-export-menu{display:none;position:absolute;top:100%;left:0;margin-top:4px;min-width:130px;background:#fff;border:1px solid #dce8e0;border-radius:8px;box-shadow:0 12px 28px rgba(0,0,0,.18);z-index:60;padding:4px;}' +
      '.mr-export-menu.open{display:block;}' +
      '.mr-export-menu button{display:block;width:100%;text-align:left;border:none;background:transparent;padding:7px 10px;border-radius:6px;font-size:12px;font-weight:600;color:#1a2b1e;cursor:pointer;}' +
      '.mr-export-menu button:hover{background:#eef6d6;}' +
      '.mr-filter-summary{margin-top:8px;font-size:12px;color:#d6f7a3;}' +
      '.mr-filter-search-row{display:flex;gap:6px;margin-bottom:6px;}' +
      '.mr-select-visible{white-space:nowrap;font-size:11px;padding:0 8px;border:1px solid #dce8e0;border-radius:6px;background:#fff;cursor:pointer;}' +
      '.mr-body{padding:20px 28px;}' +
      '.mr-controls{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;align-items:flex-start;}' +
      '.mr-filter{background:#fff;border:1px solid #dce8e0;border-radius:10px;padding:8px 10px;min-width:140px;position:relative;}' +
      '.mr-filter label{font-size:10px;text-transform:uppercase;color:#6b778c;font-weight:700;display:block;margin-bottom:4px;}' +
      '.mr-filter-btn{width:100%;text-align:left;font-size:12px;padding:5px 6px;border:1px solid #dce8e0;border-radius:6px;background:#fff;cursor:pointer;}' +
      '.mr-filter-pop{display:none;position:absolute;top:100%;left:0;margin-top:4px;width:max-content;min-width:220px;max-width:min(480px, calc(100vw - 16px));max-height:220px;overflow-y:auto;background:#fff;border:1px solid #dce8e0;border-radius:8px;box-shadow:0 12px 28px rgba(0,0,0,.18);z-index:50;padding:6px;}' +
      '.mr-filter-pop.open{display:block;}' +
      '.mr-filter-opt{display:flex;align-items:center;gap:6px;font-size:12px;padding:4px 2px;font-weight:400;text-transform:none;color:#1a2b1e;}' +
      '.mr-cutoff{background:#fff;border:1px solid #dce8e0;border-radius:10px;padding:8px 10px;min-width:160px;}' +
      'table{border-collapse:collapse;width:100%;background:#fff;}' +
      'th,td{border:1px solid #e6e8ec;padding:5px 8px;font-size:11px;text-align:center;white-space:nowrap;}' +
      'th{background:#143200;color:#c8f135;position:sticky;top:0;}' +
      'td:first-child,th:first-child{text-align:left;position:sticky;left:0;background:#143200;color:#c8f135;}' +
      '.mr-low{background:#fde3e3;color:#a11d1d;font-weight:700;}' +
      '.mr-contradiction{color:#ff0000;font-weight:900;}' +
      '.mr-sub{background:#eef1ec;color:#6b7a6f;font-size:10px;font-weight:700;text-transform:uppercase;padding:4px 8px;border-bottom:1px solid #d8e0da;}' +
      '.mr-ws-icon{color:#e8850c;display:inline-flex;vertical-align:middle;}' +
      '.mr-exm-icon{color:#d62d2d;display:inline-flex;vertical-align:middle;}' +
      '.mr-legend{background:rgba(255,255,255,.06);border:1px solid rgba(200,241,53,.25);border-radius:10px;padding:10px 14px;min-width:190px;}' +
      '.mr-legend-title{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#c8f135;font-weight:700;margin-bottom:6px;}' +
      '.mr-legend-row{display:flex;align-items:center;gap:6px;font-size:11px;color:#d6f7a3;margin-bottom:4px;}' +
      '.mr-legend-row strong{color:#c8f135;min-width:16px;}' +
      '.mr-legend-swatch{width:10px;height:10px;border-radius:2px;display:inline-block;}' +
      '.mr-low-swatch{background:#fde3e3;border:1px solid #a11d1d;}' +
      '.mr-tablewrap{max-height:70vh;overflow:auto;border:1px solid #e6e8ec;border-radius:8px;}' +
      '.mr-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;}' +
      '.mr-on{background:#1f9d55;} .mr-off{background:#d43a3a;}' +
      '.mr-sortable{cursor:pointer;user-select:none;}' +
      '.mr-sortable:hover{background:#1a4d00;}' +
      '.mr-tabs{display:flex;gap:8px;margin-bottom:14px;}' +
      '.mr-tab-btn{height:32px;padding:0 16px;border-radius:8px;border:1px solid #dce8e0;background:#fff;color:#52514e;font-size:12px;font-weight:700;cursor:pointer;}' +
      '.mr-tab-btn.active{background:#143200;color:#c8f135;border-color:#143200;}' +
      '.mr-chart-col-headers{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:10px;}' +
      '.mr-chart-col-headers div{font-size:11px;font-weight:700;text-transform:uppercase;color:#6b778c;}' +
      '.mr-chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px 20px;}' +
      '.mr-chart-grid>div{background:#fff;border:1px solid #dce8e0;border-radius:10px;padding:10px;}' +
      '.mr-chart-label{font-size:11px;color:#6b778c;margin:0 0 4px;}' +
      '</style></head><body>' +
      '<div class="mr-header"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap;">' +
      '<div style="flex:1;min-width:260px;"><h1>Fleet Utilisation — Management Report</h1>' +
      '<p>TGE Asset Snapshot — offline snapshot, generated for sharing. No live connection.</p>' +
      '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:10px;">' +
        '<div class="mr-daterange" id="mr-daterange"></div>' +
        '<span class="mr-assets-count" id="mr-assets-count"></span>' +
        '<button type="button" class="mr-clear-btn" id="mr-clear-btn">Clear all filters</button>' +
        '<span id="mr-export-wrap"></span>' +
      '</div>' +
      '<div class="mr-filter-summary" id="mr-filter-summary"></div></div>' +
      '<div class="mr-legend">' +
        '<div class="mr-legend-title">Legend</div>' +
        '<div class="mr-legend-row"><strong>KM</strong> Daily kilometres</div>' +
        '<div class="mr-legend-row"><span class="mr-ws-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M21.7 15.3a5 5 0 01-6.6 6.6l-7.8-7.8a5 5 0 01-6.2-6.2 1 1 0 011.7-.5l2.8 2.8 2-2-2.8-2.8a1 1 0 01.5-1.7 5 5 0 016.2 6.2l7.8 7.8a1 1 0 001.4-1.4z"/></svg></span> Workshop booking</div>' +
        '<div class="mr-legend-row"><span class="mr-exm-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2L1 21h22L12 2zm0 5.5a1.5 1.5 0 011.5 1.5v5a1.5 1.5 0 01-3 0v-5A1.5 1.5 0 0112 7.5zm0 10.75a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z"/></svg></span> Non-functioning device</div>' +
        '<div class="mr-legend-row"><span class="mr-dot mr-on" style="margin-right:2px;"></span><span class="mr-dot mr-off"></span> Telematics</div>' +
        '<div class="mr-legend-row"><i class="mr-legend-swatch mr-low-swatch"></i> Below KM cutoff</div>' +
      '</div>' +
      '</div></div>' +
      '<div class="mr-body">' +
      '<div class="mr-controls" id="mr-controls"></div>' +
      '<div class="mr-tabs">' +
        '<button type="button" class="mr-tab-btn active" data-tab="table">Table</button>' +
        '<button type="button" class="mr-tab-btn" data-tab="charts">Utilisation Charts</button>' +
      '</div>' +
      '<div class="mr-tab-content" id="mr-tab-table">' +
        '<div class="mr-tablewrap"><table><thead id="mr-thead"></thead><tbody id="mr-tbody"></tbody></table></div>' +
      '</div>' +
      '<div class="mr-tab-content" id="mr-tab-charts" style="display:none;">' +
        '<div class="mr-chart-col-headers">' +
          '<div>Left — fixed: zero km vs any km (filters only)</div>' +
          '<div>Right — slider-driven: zero vs cutoff (filters + slider)</div>' +
        '</div>' +
        '<div class="mr-chart-grid">' +
          '<div><p class="mr-chart-label">Headline split</p><div id="mr-chart-donut-l"></div></div>' +
          '<div><p class="mr-chart-label">Headline split (cutoff)</p><div id="mr-chart-donut-r"></div></div>' +
          '<div><p class="mr-chart-label">Zero-km share by day</p><div id="mr-chart-trend-l"></div></div>' +
          '<div><p class="mr-chart-label">Below-cutoff share by day</p><div id="mr-chart-trend-r"></div></div>' +
          '<div><p class="mr-chart-label">Zero-km share by group</p><div id="mr-chart-bu-l"></div></div>' +
          '<div><p class="mr-chart-label">Below-cutoff share by group</p><div id="mr-chart-bu-r"></div></div>' +
          '<div><p class="mr-chart-label">Km distribution</p><div id="mr-chart-dist-l"></div></div>' +
          '<div><p class="mr-chart-label">Km distribution (cutoff)</p><div id="mr-chart-dist-r"></div></div>' +
        '</div>' +
      '</div>' +
      '</div>' +
      '<script id="mr-data" type="application/octet-stream">' + embeddedB64 + '</script>' +
      '<script>' + reportRuntimeScript() + '</script>' +
      '</body></html>';
  }

function reportRuntimeScript() {
    return '(function(){' +
      'var raw = JSON.parse(decodeURIComponent(escape(atob(document.getElementById("mr-data").textContent))));' +
     'var state = { filters: {}, kmCutoff: raw.kmCutoff || 0, openCol: null, sortCol: null, sortDir: \'desc\' };' +
      'document.getElementById("mr-daterange").textContent = "Date Range Applied: " + raw.dateRangeLabel;' +
      'function distinctValues(col){var s={};visibleAssets(col).forEach(function(a){var v=a.fields[col];if(v)s[v]=true;});return Object.keys(s).sort();}' +
      'function updateAssetsCount(){' +
        'var el = document.getElementById("mr-assets-count");' +
        'if (el) el.textContent = visibleAssets().length + " of " + raw.assets.length + " assets";' +
      '}' +
      'function updateFilterSummary(){' +
        'var el = document.getElementById("mr-filter-summary");' +
        'if (!el) return;' +
        'var parts = [];' +
        'raw.filterColumns.forEach(function(fc){' +
          'var sel = state.filters[fc.col];' +
          'if (!sel || !sel.length) return;' +
          'parts.push(fc.label + " = " + (sel.length === 1 ? sel[0] : sel.length + " selected"));' +
        '});' +
        'el.textContent = parts.length ? ("Filtering: " + parts.join(", ")) : "";' +
      '}' +
      'function refreshAfterFilterChange(){' +
        'renderControls(); renderTable(); renderCharts(); updateAssetsCount(); updateFilterSummary();' +
      '}' +
      'function renderControls(){' +
        'var html = "";' +
        'raw.filterColumns.forEach(function(fc){' +
          'var selected = state.filters[fc.col] || [];' +
          'var summary = selected.length === 0 ? "All" : (selected.length === 1 ? selected[0] : selected.length + " selected");' +
          'var isOpen = state.openCol === fc.col;' +
          'html += "<div class=\\"mr-filter\\"><label>" + fc.label + "</label>";' +
          'html += "<button type=\\"button\\" class=\\"mr-filter-btn\\" data-col=\\"" + fc.col + "\\">" + summary + " ▾</button>";' +
          'html += "<div class=\\"mr-filter-pop" + (isOpen ? " open" : "") + "\\" data-col=\\"" + fc.col + "\\">";' +
          'html += "<div class=\\"mr-filter-search-row\\"><input type=\\"text\\" class=\\"mr-filter-search\\" placeholder=\\"Type to search...\\" data-col=\\"" + fc.col + "\\"><button type=\\"button\\" class=\\"mr-select-visible\\" data-col=\\"" + fc.col + "\\">Select shown</button></div>";' +
          'html += "<label class=\\"mr-filter-opt mr-filter-opt-all\\"><input type=\\"checkbox\\" class=\\"mr-check-all\\" data-col=\\"" + fc.col + "\\"" + (selected.length === 0 ? " checked" : "") + " /> All</label>";' +
          'distinctValues(fc.col).forEach(function(v){' +
            'var checked = selected.indexOf(v) !== -1;' +
            'html += "<label class=\\"mr-filter-opt\\" data-search-text=\\"" + v.toLowerCase() + "\\"><input type=\\"checkbox\\" class=\\"mr-check\\" data-col=\\"" + fc.col + "\\" value=\\"" + v + "\\"" + (checked ? " checked" : "") + " /> " + v + "</label>";' +
          '});' +
          'html += "</div></div>";' +
        '});' +
        'html += "<div class=\\"mr-cutoff\\"><label style=\\"font-size:10px;text-transform:uppercase;color:#6b778c;font-weight:700;\\">KM Cutoff: <span id=\\"mr-km-val\\">" + state.kmCutoff + "</span> km</label><input id=\\"mr-km-slider\\" type=\\"range\\" min=\\"0\\" max=\\"600\\" step=\\"5\\" value=\\"" + state.kmCutoff + "\\" style=\\"width:100%;\\"></div>";' +
        'document.getElementById("mr-controls").innerHTML = html;' +
        'document.querySelectorAll(".mr-filter-btn").forEach(function(btn){' +
          'btn.onclick = function(){ state.openCol = (state.openCol === btn.dataset.col) ? null : btn.dataset.col; renderControls(); };' +
        '});' +
        'document.querySelectorAll(".mr-filter-search").forEach(function(box){' +
          'box.onclick = function(e){ e.stopPropagation(); };' +
          'box.oninput = function(){' +
            'var term = box.value.trim().toLowerCase();' +
            'var pop = box.closest(".mr-filter-pop");' +
            'pop.querySelectorAll(".mr-filter-opt:not(.mr-filter-opt-all)").forEach(function(row){' +
              'var match = !term || (row.dataset.searchText || "").indexOf(term) !== -1;' +
              'row.style.display = match ? "" : "none";' +
            '});' +
          '};' +
        '});' +
        'document.querySelectorAll(".mr-select-visible").forEach(function(btn){' +
          'btn.onclick = function(e){' +
            'e.stopPropagation();' +
            'var col = btn.dataset.col;' +
            'var pop = btn.closest(".mr-filter-pop");' +
            'if (!state.filters[col]) state.filters[col] = [];' +
            'pop.querySelectorAll(".mr-filter-opt:not(.mr-filter-opt-all)").forEach(function(row){' +
              'if (row.style.display === "none") return;' +
              'var val = row.querySelector(".mr-check").value;' +
              'if (state.filters[col].indexOf(val) === -1) state.filters[col].push(val);' +
            '});' +
            'refreshAfterFilterChange();' +
          '};' +
        '});' +
        'document.querySelectorAll(".mr-check-all").forEach(function(cb){' +
          'cb.onchange = function(){ delete state.filters[cb.dataset.col]; refreshAfterFilterChange(); };' +
        '});' +
        'document.querySelectorAll(".mr-check").forEach(function(cb){' +
          'cb.onchange = function(){' +
            'var col = cb.dataset.col; var val = cb.value;' +
            'if (!state.filters[col]) state.filters[col] = [];' +
            'var idx = state.filters[col].indexOf(val);' +
            'if (cb.checked && idx === -1) state.filters[col].push(val);' +
            'if (!cb.checked && idx !== -1) state.filters[col].splice(idx, 1);' +
            'if (!state.filters[col].length) delete state.filters[col];' +
            'refreshAfterFilterChange();' +
          '};' +
        '});' +
        'document.getElementById("mr-km-slider").onchange = function(e){ state.kmCutoff = parseInt(e.target.value,10)||0; renderTable(); renderCharts(); };' +
'document.getElementById("mr-km-slider").oninput = function(e){ document.getElementById("mr-km-val").textContent = e.target.value; };' +
      '}' +
      'document.addEventListener("click", function(e){' +
        'if (state.openCol && !e.target.closest(".mr-filter")) { state.openCol = null; renderControls(); }' +
      '});' +
'function visibleAssets(ignoreCol){' +
        'return raw.assets.filter(function(a){' +
          'for (var col in state.filters){ if (col === ignoreCol) continue; var sel = state.filters[col]; if (sel && sel.length && sel.indexOf(a.fields[col]||"") === -1) return false; }' +
          'return true;' +
        '});' +
      '}' +
      'function rowMetrics(a) { var total = 0, any = 0; raw.dates.forEach(function (d) { var v = a.km[d]; if (v != null) { total += v; any++; } }); var avg = any > 0 ? total / any : null; return { total: any > 0 ? total : null, avg: avg }; } function sortAssets(list) { if (!state.sortCol) return list; var col = state.sortCol, dir = state.sortDir === "asc" ? 1 : -1; var withMetrics = list.map(function (a) { var m = rowMetrics(a); var val; if (col === "total") val = m.total; else if (col === "avg") val = m.avg; else val = a.km[col]; return { asset: a, val: val == null ? -1 : val }; }); withMetrics.sort(function (x, y) { return (x.val - y.val) * dir; }); return withMetrics.map(function (w) { return w.asset; }); } function sortArrow(col) { if (state.sortCol !== col) return ""; return state.sortDir === "asc" ? " \u25b2" : " \u25bc"; } var WS_ICON = \'<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M21.7 15.3a5 5 0 01-6.6 6.6l-7.8-7.8a5 5 0 01-6.2-6.2 1 1 0 011.7-.5l2.8 2.8 2-2-2.8-2.8a1 1 0 01.5-1.7 5 5 0 016.2 6.2l7.8 7.8a1 1 0 001.4-1.4z"/></svg>\'; var EXM_ICON = \'<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2L1 21h22L12 2zm0 5.5a1.5 1.5 0 011.5 1.5v5a1.5 1.5 0 01-3 0v-5A1.5 1.5 0 0112 7.5zm0 10.75a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z"/></svg>\'; function renderTable() { var visible = sortAssets(visibleAssets()); var thead1 = "<tr><th rowspan=\'2\'>Legacy Number</th>"; raw.dates.forEach(function (d) { thead1 += "<th class=\'mr-sortable\' colspan=\'3\' data-sort=\'" + d + "\'>" + d + sortArrow(d) + "</th>"; }); thead1 += "<th class=\'mr-sortable\' rowspan=\'2\' data-sort=\'total\'>Total KM" + sortArrow("total") + "</th>"; thead1 += "<th class=\'mr-sortable\' rowspan=\'2\' data-sort=\'avg\'>Avg/Day" + sortArrow("avg") + "</th></tr>"; var thead2 = "<tr>"; raw.dates.forEach(function () { thead2 += "<th class=\'mr-sub\'>KM</th><th class=\'mr-sub\'>WS</th><th class=\'mr-sub\'>EXM</th>"; }); thead2 += "</tr>"; document.getElementById("mr-thead").innerHTML = thead1 + thead2; document.querySelectorAll(".mr-sortable").forEach(function (th) { th.onclick = function () { var col = th.dataset.sort; if (state.sortCol === col) { state.sortDir = state.sortDir === "desc" ? "asc" : "desc"; } else { state.sortCol = col; state.sortDir = "desc"; } renderTable(); }; }); var body = visible.map(function (a) { var row = "<tr><td><span class=\'mr-dot " + (a.hasTelematics ? "mr-on" : "mr-off") + "\'></span>" + a.legacyNumber + "</td>"; var m = rowMetrics(a); raw.dates.forEach(function (d) { var v = a.km[d]; var low = (v != null && state.kmCutoff > 0 && v < state.kmCutoff); var contradiction = (!a.hasTelematics && v != null); var kmText = v != null ? v.toFixed(1) : (a.hasTelematics ? "0" : "-"); var cls = (low ? "mr-low " : "") + (contradiction ? "mr-contradiction" : ""); row += "<td" + (cls ? " class=\'" + cls + "\'" : "") + ">" + kmText + "</td>"; var hasWs = a.ws && a.ws[d]; row += "<td>" + (hasWs ? "<span class=\'mr-ws-icon\'>" + WS_ICON + "</span>" : "-") + "</td>"; var hasExm = a.exm && a.exm[d]; row += "<td>" + (hasExm ? "<span class=\'mr-exm-icon\'>" + EXM_ICON + "</span>" : "-") + "</td>"; }); row += "<td>" + (m.total != null ? m.total.toFixed(1) : "-") + "</td>"; row += "<td>" + (m.avg != null ? m.avg.toFixed(1) : "-") + "</td></tr>"; return row; }).join(""); document.getElementById("mr-tbody").innerHTML = body || "<tr><td colspan=\'" + (raw.dates.length * 3 + 3) + "\'>No assets match the selected filters.</td></tr>"; } ' +
      'document.querySelectorAll(".mr-tab-btn").forEach(function(btn){' +
        'btn.onclick = function(){' +
          'document.querySelectorAll(".mr-tab-btn").forEach(function(b){ b.classList.remove("active"); });' +
          'btn.classList.add("active");' +
          'document.getElementById("mr-tab-table").style.display = (btn.dataset.tab === "table") ? "block" : "none";' +
          'document.getElementById("mr-tab-charts").style.display = (btn.dataset.tab === "charts") ? "block" : "none";' +
        '};' +
      '});' +
      ' var COL_ZERO = "#d43a3a"; var COL_ANY = "#1f9d55"; var COL_BASE = "#c9ccd1"; function svgDonut(pct) { var r = 54, c = 2 * Math.PI * r, dash = (pct / 100) * c; var pctTxt = Math.round(pct); return "<svg viewBox=\'0 0 130 130\' width=\'100%\' height=\'170\'>" + "<circle cx=\'65\' cy=\'65\' r=\'" + r + "\' fill=\'none\' stroke=\'" + COL_ANY + "\' stroke-width=\'20\'/>" + "<circle cx=\'65\' cy=\'65\' r=\'" + r + "\' fill=\'none\' stroke=\'" + COL_ZERO + "\' stroke-width=\'20\' " + "stroke-dasharray=\'" + dash + " " + (c - dash) + "\' transform=\'rotate(-90 65 65)\'/>" + "<text x=\'65\' y=\'72\' text-anchor=\'middle\' font-size=\'22\' font-weight=\'700\' fill=\'#1a2b1e\'>" + pctTxt + "%</text>" + "</svg>"; } function svgVBar(labels, values, maxVal, colors) { var w = 320, h = 170, padL = 24, padB = 22, padT = 14; var plotW = w - padL - 8, plotH = h - padB - padT; var n = labels.length; var gap = 6; var barW = (plotW - gap * (n - 1)) / n; var safeMax = maxVal > 0 ? maxVal : 1; var bars = ""; for (var i = 0; i < n; i++) { var bh = (values[i] / safeMax) * plotH; var x = padL + i * (barW + gap); var y = padT + (plotH - bh); var col = colors ? colors[i] : COL_ANY; bars += "<rect x=\'" + x + "\' y=\'" + y + "\' width=\'" + barW + "\' height=\'" + bh + "\' rx=\'3\' fill=\'" + col + "\'/>"; bars += "<text x=\'" + (x + barW / 2) + "\' y=\'" + (y - 4) + "\' text-anchor=\'middle\' font-size=\'9\' fill=\'#52514e\'>" + Math.round(values[i]) + "</text>"; bars += "<text x=\'" + (x + barW / 2) + "\' y=\'" + (h - 6) + "\' text-anchor=\'middle\' font-size=\'9\' fill=\'#898781\'>" + labels[i] + "</text>"; } return "<svg viewBox=\'0 0 " + w + " " + h + "\' width=\'100%\' height=\'170\'>" + "<line x1=\'" + padL + "\' y1=\'" + (padT + plotH) + "\' x2=\'" + (w - 4) + "\' y2=\'" + (padT + plotH) + "\' stroke=\'#e1e0d9\'/>" + bars + "</svg>"; } function svgHBar(labels, values, maxVal, color) { var w = 320, rowH = 30, padL = 108, padR = 40, padTop = 6; var n = labels.length; var h = n * rowH + padTop * 2; var plotW = w - padL - padR; var safeMax = maxVal > 0 ? maxVal : 1; var bars = ""; for (var i = 0; i < n; i++) { var bw = (values[i] / safeMax) * plotW; var y = padTop + i * rowH; var label = labels[i].length > 16 ? labels[i].slice(0, 15) + "…" : labels[i]; bars += "<text x=\'" + (padL - 6) + "\' y=\'" + (y + rowH / 2 + 4) + "\' text-anchor=\'end\' font-size=\'10\' fill=\'#52514e\'>" + label + "</text>"; bars += "<rect x=\'" + padL + "\' y=\'" + (y + 5) + "\' width=\'" + bw + "\' height=\'" + (rowH - 12) + "\' rx=\'3\' fill=\'" + color + "\'/>"; bars += "<text x=\'" + (padL + bw + 6) + "\' y=\'" + (y + rowH / 2 + 4) + "\' font-size=\'10\' fill=\'#52514e\'>" + Math.round(values[i]) + "%</text>"; } return "<svg viewBox=\'0 0 " + w + " " + h + "\' width=\'100%\' height=\'" + h + "\'>" + bars + "</svg>"; } function totalKmFor(a) { var total = 0, any = false; raw.dates.forEach(function (d) { var v = a.km[d]; if (v != null) { total += v; any = true; } }); return { total: total, any: any }; } function computeSplit(assets, threshold) { var below = 0; assets.forEach(function (a) { var t = totalKmFor(a); var val = t.any ? t.total : 0; if (val <= threshold) below++; }); var n = assets.length || 1; return (below / n) * 100; } function computeDailyTrend(assets, threshold) { return raw.dates.map(function (d) { var n = assets.length || 1; var below = 0; assets.forEach(function (a) { var v = a.km[d]; var val = v == null ? 0 : v; if (val <= threshold) below++; }); return (below / n) * 100; }); } function shortDay(iso) { var d = new Date(iso + "T00:00:00"); return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]; } function computeGroupBreakdown(assets, threshold, groupCol) { var groups = {}; assets.forEach(function (a) { var g = a.fields[groupCol] || "Unassigned"; if (!groups[g]) groups[g] = { total: 0, below: 0 }; groups[g].total++; var t = totalKmFor(a); var val = t.any ? t.total : 0; if (val <= threshold) groups[g].below++; }); var labels = Object.keys(groups).sort(); var values = labels.map(function (g) { return (groups[g].below / groups[g].total) * 100; }); return { labels: labels, values: values }; } function computeDistribution(assets) { var bands = [ { label: "0", test: function (v) { return v === 0; } }, { label: "1-10", test: function (v) { return v > 0 && v <= 10; } }, { label: "11-25", test: function (v) { return v > 10 && v <= 25; } }, { label: "26-50", test: function (v) { return v > 25 && v <= 50; } }, { label: "51-100", test: function (v) { return v > 50 && v <= 100; } }, { label: "100+", test: function (v) { return v > 100; } }, ]; var counts = bands.map(function () { return 0; }); assets.forEach(function (a) { var t = totalKmFor(a); var val = t.any ? t.total : 0; for (var i = 0; i < bands.length; i++) { if (bands[i].test(val)) { counts[i]++; break; } } }); return { labels: bands.map(function (b) { return b.label; }), values: counts }; } function renderCharts() { var assets = visibleAssets(); var cutoff = state.kmCutoff; var fixedPct = computeSplit(assets, 0); var cutoffPct = computeSplit(assets, cutoff); document.getElementById("mr-chart-donut-l").innerHTML = svgDonut(fixedPct); document.getElementById("mr-chart-donut-r").innerHTML = svgDonut(cutoffPct); var trendFixed = computeDailyTrend(assets, 0); var trendCutoff = computeDailyTrend(assets, cutoff); var dayLabels = raw.dates.map(shortDay); document.getElementById("mr-chart-trend-l").innerHTML = svgVBar(dayLabels, trendFixed, 100, null); document.getElementById("mr-chart-trend-r").innerHTML = svgVBar(dayLabels, trendCutoff, 100, null); var groupCol = raw.filterColumns.length ? raw.filterColumns[0].col : null; if (groupCol) { var bFixed = computeGroupBreakdown(assets, 0, groupCol); var bCutoff = computeGroupBreakdown(assets, cutoff, groupCol); document.getElementById("mr-chart-bu-l").innerHTML = svgHBar(bFixed.labels, bFixed.values, 100, COL_ZERO); document.getElementById("mr-chart-bu-r").innerHTML = svgHBar(bCutoff.labels, bCutoff.values, 100, COL_ZERO); } var distFixed = computeDistribution(assets); var maxDist = Math.max.apply(null, distFixed.values.concat([1])); var distColorsFixed = distFixed.labels.map(function () { return COL_BASE; }); distColorsFixed[0] = COL_ZERO; document.getElementById("mr-chart-dist-l").innerHTML = svgVBar(distFixed.labels, distFixed.values, maxDist, distColorsFixed); var distCutoffColors = distFixed.labels.map(function (lbl, i) { var bandLow = i === 0 ? 0 : (i === 1 ? 1 : (i === 2 ? 11 : (i === 3 ? 26 : (i === 4 ? 51 : 101)))); return bandLow <= cutoff ? COL_ZERO : COL_BASE; }); document.getElementById("mr-chart-dist-r").innerHTML = svgVBar(distFixed.labels, distFixed.values, maxDist, distCutoffColors); } ' +
      'document.getElementById("mr-clear-btn").onclick = function(){ state.filters = {}; refreshAfterFilterChange(); };' +
      'renderControls(); renderTable(); renderCharts(); updateAssetsCount(); updateFilterSummary();' +
    '})();';
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
      '<div class="ud-side-swatch"><span class="ud-ws-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M21.7 15.3a5 5 0 01-6.6 6.6l-7.8-7.8a5 5 0 01-6.2-6.2 1 1 0 011.7-.5l2.8 2.8 2-2-2.8-2.8a1 1 0 01.5-1.7 5 5 0 016.2 6.2l7.8 7.8a1 1 0 001.4-1.4z"/></svg></span><em>Workshop booking</em></div>',
      '<div class="ud-side-swatch"><span class="ud-exm-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2L1 21h22L12 2zm0 5.5a1.5 1.5 0 011.5 1.5v5a1.5 1.5 0 01-3 0v-5A1.5 1.5 0 0112 7.5zm0 10.75a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z"/></svg></span><em>Non-functioning device</em></div>',
      '<div class="ud-side-swatch"><span class="ud-gps-on" style="margin-right:3px;"><svg viewBox="0 0 24 24" width="12" height="12"><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/></svg></span><span class="ud-gps-off"><svg viewBox="0 0 24 24" width="12" height="12"><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/></svg></span><em>Telematics</em></div>',
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
      '.ud-mgmt-report-btn{background:#c8f135!important;color:#143200!important;font-weight:800!important;border-color:#c8f135!important;}',
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
      '.ud-filter-pop{display:none;position:fixed;width:max-content;min-width:220px;max-width:min(480px, calc(100vw - 16px));background:#fff;border:1px solid #dce8e0;border-radius:10px;box-shadow:0 12px 28px rgba(0,0,0,.18);z-index:200;overflow:hidden;}',
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
      '.ud-table th{position:sticky;top:0;background:#143200;color:#c8f135;font-weight:700;z-index:10;font-size:10px;transform:translateZ(0);}',
'.ud-table tr:nth-child(2) th{top:32px;}',
   '.ud-pin-left{background:#143200!important;color:#c8f135!important;z-index:40!important;text-align:center!important;min-width:135px;border-right:2px solid #e6e8ec!important;}',
      'td.ud-pin-left{position:sticky!important;left:0!important;}',
      '.ud-pin-left-inner,.ud-pin-right-inner{display:flex;align-items:center;justify-content:center;gap:8px;}',
      '.ud-pin-legacy-part{min-width:100px;}',
      '.ud-pin-gps-part{min-width:36px;}',
      '.ud-pin-total-part,.ud-pin-avgday-part{min-width:60px;}',
      '.ud-gps-on{color:#1f9d55;display:inline-flex;}',
      '.ud-ws-icon{color:#e8850c;display:inline-flex;vertical-align:middle;}',
      '.ud-exm-icon{color:#d62d2d;display:inline-flex;vertical-align:middle;}',
      '.ud-gps-off{color:#d43a3a;display:inline-flex;}',
      '.ud-pin-avg{background:#f0f1f3!important;color:#172b4d!important;z-index:40!important;min-width:150px;}',
      'td.ud-pin-avg{position:sticky!important;right:0!important;}',
      '.ud-date-hdr{min-width:108px;}',
      '.ud-sub-hdr{font-size:9px!important;color:#dbe8c3!important;text-transform:uppercase;}',
      '.ud-dcol{min-width:36px;width:36px;padding:2px!important;}',
      '.ud-km-low{background:#fde3e3!important;color:#a11d1d!important;font-weight:700;}',
      '.ud-km-contradiction{color:#ff0000!important;font-weight:900!important;}',
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
