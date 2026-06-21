// TGE Asset Snapshot — Fleet Utilisation Dashboard
// public/utilisation.js
// Status: UI FOUNDATION ONLY

(function () {
  'use strict';

  var FILTER_DEFS = [
    { key: 'buName', label: 'BU Name' },
    { key: 'equipType', label: 'Equip Type' },
    { key: 'operatorState', label: 'Operator State' },
    { key: 'operatorName', label: 'Operator Name' },
    { key: 'legacyNumber', label: 'Legacy Number' },
  ];

  var state = {
    kmCutoff: 0,
    cutoffMode: 'all',
    days: 7,
    history: false,
    startDate: null,
    endDate: null,
    rows: [],
  };

  function render() {
    var view = TGE.el('view-utilisation');
    if (!view) return;

    injectStyles();
    ensureSidebarLegend();

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
            '<span class="ud-total" id="ud-assets-count">Assets: 0 / 0</span>',
            '<button class="ud-btn" id="ud-history-btn" type="button">History: Off</button>',
            '<button class="ud-btn ud-disabled" id="ud-export-btn" type="button" disabled>Export</button>',
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
            '<div class="ud-date-popup" id="ud-date-popup">',
              '<label>Start Date<input id="ud-start-date" type="date" /></label>',
              '<label>End Date<input id="ud-end-date" type="date" /></label>',
              '<button class="ud-apply-btn" id="ud-date-apply" type="button">Apply Date Range</button>',
            '</div>',
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

          renderFilterCards(),

        '</div>',

        '<div class="ud-status-row">',
          '<button id="ud-filter-toggle" type="button">Filters: All selected</button>',
          '<span id="ud-range-summary">Date Range: Last 7 Days</span>',
        '</div>',

        '<div class="ud-table-wrap">',
          '<table class="ud-table">',
            '<thead id="ud-table-head"></thead>',
            '<tbody id="ud-table-body"></tbody>',
          '</table>',
        '</div>',

      '</div>'
    ].join('');

    wireEvents();
    updateDateSummary();
    renderTable();
  }

  function renderFilterCards() {
    return FILTER_DEFS.map(function (f) {
      return [
        '<div class="ud-card ud-filter-card">',
          '<div class="ud-card-label">' + esc(f.label) + '</div>',
          '<button class="ud-filter-btn" type="button" disabled>',
            '<span>All</span><span>▾</span>',
          '</button>',
          '<div class="ud-filter-empty">No values</div>',
        '</div>'
      ].join('');
    }).join('');
  }

  function wireEvents() {
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
    });

    TGE.on('ud-date-btn', 'click', function (e) {
      e.stopPropagation();
      TGE.el('ud-date-popup').classList.toggle('open');
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
      TGE.el('ud-date-popup').classList.remove('open');

      updateDateSummary();
      renderTable();
    });

    document.addEventListener('click', function () {
      var pop = TGE.el('ud-date-popup');
      if (pop) pop.classList.remove('open');
    });

    var pop = TGE.el('ud-date-popup');
    if (pop) {
      pop.addEventListener('click', function (e) { e.stopPropagation(); });
    }
  }

  function updateDateSummary() {
    var txt = 'Date Range: ' + fmtFullDate(state.startDate) + ' - ' + fmtFullDate(state.endDate) + ' (' + state.days + ' Days)';
    TGE.setText('ud-range-summary', txt);
  }

  function renderTable() {
    var dates = getDateRange();
    var head = TGE.el('ud-table-head');
    var body = TGE.el('ud-table-body');
    if (!head || !body) return;

    var top = '<tr>';
    top += '<th rowspan="2" class="ud-pin-left">Legacy Number</th>';

    dates.forEach(function (d) {
      top += '<th colspan="3" class="ud-date-hdr">' + fmtDateHeader(d) + '</th>';
    });

    top += '<th rowspan="2" class="ud-pin-total">Total KM</th>';
    top += '<th rowspan="2" class="ud-pin-avg">Avg/Day</th>';
    top += '</tr>';

    var sub = '<tr>';
    dates.forEach(function () {
      sub += '<th class="ud-sub-hdr ud-dcol">KM</th>';
      sub += '<th class="ud-sub-hdr ud-dcol">WS</th>';
      sub += '<th class="ud-sub-hdr ud-dcol">EXM</th>';
    });
    sub += '</tr>';

    head.innerHTML = top + sub;
    body.innerHTML = '';
  }

  function ensureSidebarLegend() {
    if (document.getElementById('ud-sidebar-legend')) return;

    var footer = document.querySelector('.sidebar-footer');
    var sidebar = document.querySelector('.sidebar');
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
      '<div class="ud-side-swatch"><i class="ud-hist"></i><em>Historical / inactive asset</em></div>',
    ].join('');

    if (footer && footer.parentNode) footer.parentNode.insertBefore(legend, footer);
    else sidebar.appendChild(legend);
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
      '.view#view-utilisation{padding:0!important;height:calc(100vh - var(--topbar-h));overflow:hidden;}',
      '.ud-shell{height:100%;display:flex;flex-direction:column;background:#f4f5f7;color:#172b4d;overflow:hidden;padding:8px;}',
      '.ud-header{height:48px;background:#143200;border-radius:12px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;gap:12px;flex-shrink:0;margin-bottom:8px;}',
      '.ud-title-wrap{display:flex;align-items:center;gap:10px;min-width:260px;}',
      '.ud-title{font-size:14px;font-weight:800;color:#c8f135;letter-spacing:.02em;}',
      '.ud-subtitle{font-size:10px;color:rgba(255,255,255,.55);}',
      '.ud-logo-bars{width:38px;height:28px;position:relative;flex-shrink:0;}',
      '.ud-logo-bars span{position:absolute;left:0;width:36px;height:5px;background:#c8f135;border-radius:8px;transform:skewY(-9deg);}',
      '.ud-logo-bars span:nth-child(1){top:4px}.ud-logo-bars span:nth-child(2){top:12px}.ud-logo-bars span:nth-child(3){top:20px}',
      '.ud-header-actions{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;}',
      '.ud-total{font-size:12px;font-weight:800;color:#143200;background:#c8f135;padding:4px 10px;border-radius:20px;white-space:nowrap;}',
      '.ud-refresh{font-size:11px;color:rgba(235,235,235,.55);white-space:nowrap;}',
      '.ud-btn{height:28px;padding:0 10px;border:1px solid rgba(200,241,53,.35);border-radius:6px;background:rgba(255,255,255,.08);font-size:11px;color:#ebebeb;cursor:pointer;}',
      '.ud-btn:hover{border-color:#c8f135;color:#c8f135;}',
      '.ud-primary{background:#c8f135!important;color:#143200!important;border-color:#c8f135!important;font-weight:800;}',
      '.ud-disabled{opacity:.45;cursor:not-allowed;}',
      '.ud-control-strip{display:flex;gap:8px;padding:8px 0;background:#f4f5f7;overflow-x:auto;align-items:stretch;flex-shrink:0;}',
      '.ud-control-strip::-webkit-scrollbar{height:8px}.ud-control-strip::-webkit-scrollbar-thumb{background:#a8d460;border-radius:4px;}',
      '.ud-card{background:#fff;border:1px solid #e6e8ec;border-radius:10px;padding:7px 9px;min-width:145px;max-width:172px;flex-shrink:0;display:flex;flex-direction:column;gap:5px;}',
      '.ud-card-label{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#6b778c;font-weight:700;}',
      '.ud-card-value{font-size:18px;font-weight:800;color:#143200;line-height:1;}',
      '.ud-cutoff input[type=range]{width:100%;accent-color:#143200;}',
      '.ud-slider-row{display:flex;justify-content:space-between;font-size:10px;color:#6b778c;}',
      '.ud-select,.ud-date-btn,.ud-filter-btn{height:26px;border:1px solid #e6e8ec;border-radius:6px;background:#fff;color:#172b4d;font-size:11px;padding:0 8px;}',
      '.ud-date{position:relative;}',
      '.ud-date-btn{display:flex;align-items:center;justify-content:center;cursor:pointer;width:100%;}',
      '.ud-date-popup{position:absolute;top:64px;left:0;width:230px;background:#fff;border:1px solid #dce8e0;border-radius:10px;box-shadow:0 12px 28px rgba(0,0,0,.18);z-index:700;padding:10px;display:none;}',
      '.ud-date-popup.open{display:block;}',
      '.ud-date-popup label{display:block;font-size:11px;color:#6b778c;margin-bottom:8px;}',
      '.ud-date-popup input{display:block;width:100%;height:30px;border:1px solid #e6e8ec;border-radius:6px;padding:0 8px;margin-top:4px;}',
      '.ud-apply-btn{width:100%;height:30px;background:#143200;color:#c8f135;border:1px solid #143200;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer;}',
      '.ud-quick-days{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;}',
      '.ud-quick-days button{height:24px;border:1px solid #e6e8ec;background:#fff;border-radius:6px;color:#143200;font-size:11px;cursor:pointer;}',
      '.ud-quick-days button.active{background:#143200;color:#c8f135;border-color:#143200;font-weight:800;}',
      '.ud-metric{display:grid;grid-template-columns:1fr 1fr;gap:5px 9px;min-width:145px;}',
      '.ud-metric span{display:block;font-size:9px;text-transform:uppercase;color:#6b778c;font-weight:700;}',
      '.ud-metric strong{font-size:17px;color:#143200;line-height:1;}',
      '.ud-filter-btn{display:flex;align-items:center;justify-content:space-between;width:100%;opacity:.7;}',
      '.ud-filter-empty{font-size:10px;color:#8a9e92;}',
      '.ud-status-row{height:30px;display:flex;align-items:center;gap:12px;padding:0 2px;background:#f4f5f7;flex-shrink:0;}',
      '.ud-status-row button{height:24px;border:1px solid #dce8e0;background:#fff;color:#143200;border-radius:6px;font-size:11px;padding:0 9px;cursor:pointer;}',
      '.ud-status-row span{font-size:11px;color:#5a6e62;font-weight:600;}',
      '.ud-table-wrap{flex:1;overflow:auto;background:#fff;border:1px solid #e6e8ec;border-radius:10px;min-height:0;}',
      '.ud-table-wrap::-webkit-scrollbar{height:12px;width:12px;}',
      '.ud-table-wrap::-webkit-scrollbar-thumb{background:#a8d460;border-radius:8px;border:2px solid #fff;}',
      '.ud-table-wrap::-webkit-scrollbar-track{background:#f0f4f1;border-radius:8px;}',
      '.ud-table{border-collapse:separate;border-spacing:0;min-width:max-content;width:max-content;}',
      '.ud-table th,.ud-table td{padding:3px 8px;text-align:center;border-bottom:1px solid #e6e8ec;border-right:1px solid #e6e8ec;white-space:nowrap;height:32px;font-size:11px;}',
      '.ud-table th{position:sticky;top:0;background:#143200;color:#c8f135;font-weight:700;z-index:10;font-size:10px;}',
      '.ud-table tr:nth-child(2) th{top:32px;}',
      '.ud-pin-left{position:sticky!important;left:0;background:#143200!important;color:#c8f135!important;z-index:40!important;text-align:center!important;min-width:135px;border-right:2px solid #e6e8ec!important;}',
      '.ud-pin-total{position:sticky!important;right:72px;background:#f0f1f3!important;color:#172b4d!important;z-index:40!important;min-width:72px;border-left:2px solid #e6e8ec!important;}',
      '.ud-pin-avg{position:sticky!important;right:0;background:#f0f1f3!important;color:#172b4d!important;z-index:40!important;min-width:72px;}',
      '.ud-date-hdr{min-width:108px;}',
      '.ud-sub-hdr{font-size:9px!important;color:#dbe8c3!important;text-transform:uppercase;}',
      '.ud-dcol{min-width:36px;width:36px;padding:2px!important;}',
      '#ud-sidebar-legend{display:none;margin:10px 8px 8px;padding:10px;border:1px solid rgba(200,241,53,.18);border-radius:10px;background:rgba(255,255,255,.04);color:rgba(255,255,255,.72);}',
      'body[data-active-view="utilisation"] #ud-sidebar-legend{display:block;}',
      '.ud-side-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#c8f135;margin-bottom:8px;}',
      '.ud-side-row{display:grid;grid-template-columns:34px 1fr;gap:6px;align-items:start;font-size:10px;margin-bottom:6px;}',
      '.ud-side-row strong{color:#c8f135;}',
      '.ud-side-swatch{display:flex;align-items:center;gap:6px;font-size:10px;margin-top:6px;}',
      '.ud-side-swatch span{width:18px;display:inline-block;text-align:center;}',
      '.ud-side-swatch em{font-style:normal;}',
      '.ud-side-swatch i{width:10px;height:10px;border-radius:2px;display:inline-block;flex-shrink:0;}',
      '.ud-red{background:#ff5630;}',
      '.ud-hist{background:#f3d7d7;border:1px solid #bf2600;}'
    ].join('');

    document.head.appendChild(style);
  }

  TGE.onShow.utilisation = render;
})();
