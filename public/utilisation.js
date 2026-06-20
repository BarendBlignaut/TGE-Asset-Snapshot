(function () {
  'use strict';

  var FILTERS = {
    bu:     { label:'BU name',        field:'BU Name',         selected:new Set() },
    equip:  { label:'Equip type',     field:'Equip Type',      selected:new Set() },
    state:  { label:'Operator state', field:'Operator State',  selected:new Set() },
    opname: { label:'Operator name',  field:'Operator Name',   selected:new Set() },
    legacy: { label:'Legacy number',  field:'Legacy Number',   selected:new Set() },
    rego:   { label:'Rego',           field:'Rego',            selected:new Set() },
  };

  var state = {
    master: [],
    active: [],
    cutoff: 100,
    view: 'overview',
    days: 14,
    workshopMap: {},
    staticRules: { exact: new Set(), keywords: ['FUEL', 'E-TAG'] },
  };

  var SAMPLE = [
    { 'Legacy Number':'FL-001','BU Name':'Civil','BU':'CIV','Equip ID':'E001','Equip Type':'Excavator','Description':'Cat 320 Excavator','Make':'Caterpillar','Model':'320','Rego':'ABC123','Operator Name':'J. Smith','Operator State':'NSW','hasTelematics':true,'history':[312,287,0,145,201,188,0,267,310,295,0,188,240,265],'workshop':{'2026-06-08':'Booked in'},'offline':{} },
    { 'Legacy Number':'FL-002','BU Name':'Civil','BU':'CIV','Equip ID':'E002','Equip Type':'Dump Truck','Description':'Volvo FMX Dump','Make':'Volvo','Model':'FMX','Rego':'DEF456','Operator Name':'A. Jones','Operator State':'NSW','hasTelematics':true,'history':[88,92,75,0,81,95,102,88,0,79,91,85,90,83],'workshop':{},'offline':{} },
    { 'Legacy Number':'FL-003','BU Name':'Utilities','BU':'UTL','Equip ID':'E003','Equip Type':'Crane','Description':'Liebherr LTM Crane','Make':'Liebherr','Model':'LTM100','Rego':'GHI789','Operator Name':'B. Lee','Operator State':'VIC','hasTelematics':true,'history':[0,0,0,0,0,0,0,0,0,0,0,0,0,0],'workshop':{'2026-06-05':'Waiting parts - asset released'},'offline':{} },
    { 'Legacy Number':'FL-004','BU Name':'Transport','BU':'TRN','Equip ID':'E004','Equip Type':'Semi-trailer','Description':'Kenworth T610','Make':'Kenworth','Model':'T610','Rego':'MNO345','Operator Name':'D. White','Operator State':'QLD','hasTelematics':true,'history':[520,610,580,0,595,620,540,560,0,588,610,575,590,605],'workshop':{},'offline':{} },
    { 'Legacy Number':'FL-005','BU Name':'Mining','BU':'MIN','Equip ID':'E005','Equip Type':'Haul Truck','Description':'Cat 785 Haul Truck','Make':'Caterpillar','Model':'785','Rego':'STU901','Operator Name':'F. Black','Operator State':'WA','hasTelematics':true,'history':[0,0,0,0,0,0,0,0,0,0,0,0,0,0],'workshop':{},'offline':{'dateOffline':'2026-05-20','expectedOnline':'2026-06-20'} },
    { 'Legacy Number':'FL-006','BU Name':'Mining','BU':'MIN','Equip ID':'E006','Equip Type':'Drill Rig','Description':'Sandvik DP1500','Make':'Sandvik','Model':'DP1500','Rego':'VWX234','Operator Name':'G. Gray','Operator State':'WA','hasTelematics':false,'history':[],'workshop':{},'offline':{} },
    { 'Legacy Number':'FUEL ANYCARD - SOUTH REGENCY PARK WORKSHOP PUD','BU Name':'Civil','BU':'CIV','Equip ID':'FC001','Equip Type':'Fuel Card','Description':'Fuel Card','Make':'N/A','Model':'N/A','Rego':'N/A','Operator Name':'FUEL ANYCARD - SOUTH REGENCY PARK WORKSHOP PUD','Operator State':'NSW','hasTelematics':false,'history':[],'workshop':{},'offline':{} },
    { 'Legacy Number':'E-TAG PURPOSE ONLY MATTHEW YOUNG','BU Name':'Transport','BU':'TRN','Equip ID':'ET001','Equip Type':'E-Tag','Description':'E-Tag','Make':'N/A','Model':'N/A','Rego':'N/A','Operator Name':'E-TAG PURPOSE ONLY MATTHEW YOUNG','Operator State':'NSW','hasTelematics':false,'history':[],'workshop':{},'offline':{} },
  ];

  function render() {
    var view = TGE.el('view-utilisation');
    if (!view) return;
    injectStyles();

    view.innerHTML = [
      '<div class="util-shell">',
        '<div class="util-header">',
          '<div class="util-title-wrap">',
            '<div class="util-logo-bars"><span></span><span></span><span></span></div>',
            '<div>',
              '<div class="util-title">Fleet Utilisation Dashboard</div>',
              '<div class="util-subtitle">Daily KM tracking, workshop/offline exceptions and static mapping.</div>',
            '</div>',
          '</div>',
          '<div class="util-header-actions">',
            '<span class="util-total" id="util-total">0 assets</span>',
            '<select class="util-select" id="util-view-select">',
              '<option value="overview">Overview</option>',
              '<option value="exceptions">Exceptions only</option>',
              '<option value="workshop">Workshop</option>',
              '<option value="offline">Offline / Faults</option>',
              '<option value="notel">No telematics</option>',
            '</select>',
            '<button class="util-btn" id="util-static-btn" type="button">Static mapping</button>',
            '<button class="util-btn" id="util-workshop-btn" type="button">Workshop mapping</button>',
            '<button class="util-btn util-primary" id="util-import-btn" type="button">Import fleet JSON</button>',
            '<input id="util-file-input" type="file" accept=".json" style="display:none" />',
            '<span class="util-refresh" id="util-refresh">Last update: --:--</span>',
          '</div>',
        '</div>',

        '<div class="util-filter-strip" id="util-filter-strip">',
          '<div class="util-filter-card util-cutoff">',
            '<div class="util-filter-label">KM cutoff</div>',
            '<div class="util-filter-value" id="util-km-value">100</div>',
            '<input type="range" id="util-km-slider" min="0" max="600" value="100" />',
            '<div class="util-slider-row"><span>0</span><span>300</span><span>600</span></div>',
          '</div>',
          '<div class="util-filter-card">',
            '<div class="util-filter-label">Date range</div>',
            '<div class="util-date-buttons">',
              '<button data-days="7" type="button">7d</button>',
              '<button data-days="14" type="button" class="active">14d</button>',
              '<button data-days="21" type="button">21d</button>',
              '<button data-days="30" type="button">30d</button>',
            '</div>',
            '<div class="util-date-summary" id="util-date-summary">Last 14 days</div>',
          '</div>',
          '<div class="util-metric-card">',
            '<div><span>Active</span><strong class="green" id="util-m-active">0</strong></div>',
            '<div><span>Workshop</span><strong class="orange" id="util-m-ws">0</strong></div>',
            '<div><span>Offline</span><strong class="red" id="util-m-off">0</strong></div>',
            '<div><span>No telematics</span><strong id="util-m-notel">0</strong></div>',
          '</div>',
          buildFilterCards(),
        '</div>',

        '<div class="util-legend">',
          '<span><i style="background:#ff5630"></i>Below KM cutoff</span>',
          '<span><i style="background:#ffab00"></i>In workshop</span>',
          '<span><i style="background:#ffebe6;border:1px solid #de350b"></i>Offline/fault</span>',
          '<span><i style="background:#e8e8e8"></i>No telematics</span>',
          '<span><i style="background:#fff;border:1px solid #ccc"></i>Above cutoff</span>',
          '<em id="util-range-label">Showing last 14 days</em>',
        '</div>',

        '<div class="util-table-wrap">',
          '<table class="util-table" id="util-table">',
            '<thead id="util-thead"></thead>',
            '<tbody id="util-tbody"></tbody>',
          '</table>',
        '</div>',
      '</div>',

      '<div class="util-modal-bg" id="util-static-modal">',
        '<div class="util-modal util-modal-wide">',
          '<div class="util-modal-head"><h3>Static mapping</h3><button class="util-btn" data-close-modal="util-static-modal" type="button">Close</button></div>',
          '<div class="util-modal-body">',
            '<p class="util-note">Exclude non-vehicle records before the dashboard filters run. Default keywords exclude fuel cards and E-Tags.</p>',
            '<div class="util-map-grid">',
              '<label>Keyword exclusion <input id="util-static-keyword" type="text" placeholder="e.g. FUEL" /></label>',
              '<button class="util-btn util-primary" id="util-add-keyword" type="button">Add keyword</button>',
            '</div>',
            '<div class="util-keywords" id="util-keywords"></div>',
            '<div class="util-static-list" id="util-static-list"></div>',
          '</div>',
          '<div class="util-modal-foot"><button class="util-btn util-primary" data-close-modal="util-static-modal" type="button">Apply</button></div>',
        '</div>',
      '</div>',

      '<div class="util-modal-bg" id="util-workshop-modal">',
        '<div class="util-modal">',
          '<div class="util-modal-head"><h3>Workshop status mapping</h3><button class="util-btn" data-close-modal="util-workshop-modal" type="button">Close</button></div>',
          '<div class="util-modal-body">',
            '<p class="util-note">Choose whether each status removes an asset from KM exception flagging.</p>',
            '<div id="util-workshop-rows"></div>',
          '</div>',
          '<div class="util-modal-foot"><button class="util-btn util-primary" data-close-modal="util-workshop-modal" type="button">Apply</button></div>',
        '</div>',
      '</div>',
    ].join('');

    wireEvents();
    initDashboard(SAMPLE);
  }

  function buildFilterCards() {
    return Object.keys(FILTERS).map(function(key) {
      return [
        '<div class="util-filter-card util-check" data-filter-wrap="' + key + '">',
          '<div class="util-filter-label">' + FILTERS[key].label + '</div>',
          '<button class="util-check-btn" data-filter-btn="' + key + '" type="button"><span id="util-lbl-' + key + '">All</span><b>v</b></button>',
          '<div class="util-drop" id="util-drop-' + key + '">',
            '<input class="util-search" placeholder="Search..." data-filter-search="' + key + '" />',
            '<div class="util-drop-list" id="util-list-' + key + '"></div>',
            '<div class="util-drop-count" id="util-count-' + key + '"></div>',
          '</div>',
        '</div>',
      ].join('');
    }).join('');
  }

  function injectStyles() {
    if (document.getElementById('util-styles')) return;
    var style = document.createElement('style');
    style.id = 'util-styles';
    style.textContent = [
      '.util-shell{height:calc(100vh - var(--topbar-h) - 24px);display:flex;flex-direction:column;background:#f4f5f7;border-radius:14px;overflow:hidden;border:1px solid #dce8e0;}',
      '.util-header{height:56px;background:#143200;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 16px;flex-shrink:0;}',
      '.util-title-wrap{display:flex;align-items:center;gap:10px;min-width:260px}.util-title{font-weight:800;font-size:14px;color:#c8f135;letter-spacing:.02em}.util-subtitle{font-size:11px;color:rgba(255,255,255,.55)}',
      '.util-logo-bars{width:40px;height:30px;position:relative;flex-shrink:0}.util-logo-bars span{position:absolute;left:0;width:38px;height:6px;background:#c8f135;border-radius:8px;transform:skewY(-9deg)}.util-logo-bars span:nth-child(1){top:4px}.util-logo-bars span:nth-child(2){top:13px}.util-logo-bars span:nth-child(3){top:22px}',
      '.util-header-actions{display:flex;gap:8px;align-items:center;flex-wrap:nowrap}.util-total{font-size:12px;font-weight:800;color:#143200;background:#c8f135;padding:4px 10px;border-radius:20px;white-space:nowrap}.util-refresh{font-size:11px;color:rgba(235,235,235,.55);white-space:nowrap}',
      '.util-btn,.util-select{height:30px;padding:0 10px;border:1px solid rgba(200,241,53,.35);border-radius:6px;background:rgba(255,255,255,.08);font-size:11px;color:#ebebeb;cursor:pointer}.util-select option{color:#172b4d}.util-btn:hover{border-color:#c8f135;color:#c8f135}.util-primary{background:#c8f135!important;color:#143200!important;border-color:#c8f135!important;font-weight:800}',
      '.util-filter-strip{display:flex;gap:10px;padding:10px 14px;background:#f7f8fa;border-bottom:1px solid #e6e8ec;overflow-x:auto;align-items:stretch;flex-shrink:0}.util-filter-card{background:#fff;border:1px solid #e6e8ec;border-radius:8px;padding:8px 10px;min-width:152px;max-width:180px;flex-shrink:0;display:flex;flex-direction:column;gap:6px}.util-filter-label{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#6b778c;font-weight:700}.util-filter-value{font-size:20px;font-weight:800;color:#143200}.util-slider-row{display:flex;justify-content:space-between;font-size:10px;color:#6b778c}.util-cutoff input{accent-color:#143200}.util-date-buttons{display:flex;gap:4px;flex-wrap:wrap}.util-date-buttons button{height:24px;padding:0 7px;border:1px solid #c0d8a0;background:#fff;border-radius:5px;font-size:10px;color:#143200;cursor:pointer}.util-date-buttons button.active{background:#143200;color:#c8f135}.util-date-summary{font-size:11px;font-weight:700;color:#143200;text-align:center}',
      '.util-metric-card{background:#fff;border:1px solid #e6e8ec;border-radius:8px;padding:7px 10px;min-width:126px;display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;flex-shrink:0}.util-metric-card span{display:block;font-size:9px;text-transform:uppercase;color:#6b778c;font-weight:700}.util-metric-card strong{font-size:18px;line-height:1}.green{color:#006644}.orange{color:#974f0c}.red{color:#bf2600}',
      '.util-check{position:relative}.util-check-btn{height:28px;border:1px solid #e6e8ec;border-radius:5px;background:#fff;color:#172b4d;display:flex;align-items:center;justify-content:space-between;padding:0 8px;font-size:11px;cursor:pointer}.util-drop{position:fixed;background:#fff;border:1px solid #e6e8ec;border-radius:7px;box-shadow:0 8px 24px rgba(0,0,0,.16);z-index:600;min-width:180px;display:none;flex-direction:column}.util-drop.open{display:flex}.util-search{height:30px;border:none;border-bottom:1px solid #e6e8ec;padding:0 8px;font-size:11px}.util-drop-list{max-height:210px;overflow:auto}.util-drop-item{display:flex;align-items:center;gap:6px;padding:6px 8px;font-size:11px;cursor:pointer}.util-drop-item:hover{background:#f0f7e8}.util-drop-count{font-size:10px;color:#6b778c;padding:5px 8px;border-top:1px solid #e6e8ec;background:#f7f8fa}',
      '.util-legend{display:flex;gap:12px;padding:5px 14px;background:#f7f8fa;border-bottom:1px solid #e6e8ec;flex-shrink:0;align-items:center;flex-wrap:wrap}.util-legend span{display:flex;align-items:center;gap:5px;font-size:10px;color:#6b778c}.util-legend i{width:10px;height:10px;border-radius:2px;display:inline-block}.util-legend em{margin-left:auto;font-size:10px;color:#6b778c;font-style:normal}',
      '.util-table-wrap{flex:1;overflow:auto;background:#fff}.util-table{border-collapse:separate;border-spacing:0;min-width:100%}.util-table th,.util-table td{padding:3px 8px;text-align:center;border-bottom:1px solid #e6e8ec;border-right:1px solid #e6e8ec;white-space:nowrap;height:34px;font-size:11px}.util-table th{position:sticky;top:0;background:#143200;color:#c8f135;font-weight:700;z-index:10;font-size:10px}.util-table th.r2{top:24px}.util-pin-left{position:sticky;left:0;background:#fff!important;z-index:20;text-align:left!important;font-weight:700;border-right:2px solid #e6e8ec!important;box-shadow:2px 0 4px rgba(0,0,0,.05);min-width:130px}.util-table th.util-pin-left{background:#143200!important;z-index:30}.util-pin-total{position:sticky;right:62px;background:#f0f1f3!important;z-index:20;font-weight:700;min-width:62px}.util-pin-avg{position:sticky;right:0;background:#f0f1f3!important;z-index:20;font-weight:700;min-width:62px}.util-table th.util-pin-total,.util-table th.util-pin-avg{background:#f0f1f3!important;color:#172b4d;z-index:30}.util-dcol{min-width:38px;width:38px;padding:2px!important}.util-subhdr{font-size:9px!important;color:#dbe8c3!important;text-transform:uppercase}.util-low{color:#ff5630;font-weight:800}.util-ws{background:#fff3cd;color:#7a4000;font-weight:800}.util-off{background:#ffebe6;color:#de350b;font-weight:800}.util-notel{color:#9aa5b1;font-style:italic}',
      '.util-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:900;display:none;align-items:center;justify-content:center}.util-modal-bg.open{display:flex}.util-modal{width:540px;max-height:86vh;background:#fff;border-radius:12px;box-shadow:0 14px 44px rgba(0,0,0,.25);display:flex;flex-direction:column}.util-modal-wide{width:760px}.util-modal-head,.util-modal-foot{padding:14px 18px;border-bottom:1px solid #e6e8ec;display:flex;align-items:center;justify-content:space-between}.util-modal-foot{border-bottom:none;border-top:1px solid #e6e8ec;justify-content:flex-end}.util-modal h3{font-size:14px}.util-modal .util-btn{background:#fff;color:#172b4d;border-color:#e6e8ec}.util-modal .util-primary{background:#143200!important;color:#c8f135!important;border-color:#143200!important}.util-modal-body{padding:16px 18px;overflow:auto}.util-note{font-size:12px;color:#6b778c;line-height:1.45;margin-bottom:12px}.util-map-grid{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}.util-map-grid label{font-size:11px;color:#6b778c;text-transform:uppercase;font-weight:700}.util-map-grid input{display:block;width:100%;height:34px;border:1px solid #e6e8ec;border-radius:6px;padding:0 8px;margin-top:4px}.util-keywords{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.util-keyword{border:1px solid #de350b;background:#ffebe6;color:#bf2600;border-radius:999px;padding:4px 9px;font-size:11px;cursor:pointer}.util-static-list,.util-workshop-row{display:flex;flex-direction:column;gap:6px}.util-static-row,.util-workshop-row{padding:8px 0;border-bottom:1px solid #e6e8ec;font-size:12px}.util-static-row label{display:flex;gap:8px;align-items:center}.util-workshop-line{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #e6e8ec}.util-workshop-toggle button{height:26px;border:1px solid #e6e8ec;background:#fff;padding:0 8px;font-size:11px}.util-workshop-toggle button.active{background:#143200;color:#c8f135;border-color:#143200}',
    ].join('');
    document.head.appendChild(style);
  }

  function wireEvents() {
    TGE.el('util-import-btn').onclick = function() { TGE.el('util-file-input').click(); };
    TGE.el('util-file-input').onchange = loadFile;
    TGE.el('util-view-select').onchange = function(e) { state.view = e.target.value; renderTable(); };
    TGE.el('util-km-slider').oninput = function(e) {
      state.cutoff = parseInt(e.target.value, 10);
      TGE.el('util-km-value').textContent = state.cutoff;
      renderTable();
    };
    document.querySelectorAll('.util-date-buttons button').forEach(function(btn) {
      btn.onclick = function() {
        state.days = parseInt(btn.dataset.days, 10);
        document.querySelectorAll('.util-date-buttons button').forEach(function(b) { b.classList.toggle('active', b === btn); });
        TGE.el('util-date-summary').textContent = 'Last ' + state.days + ' days';
        TGE.el('util-range-label').textContent = 'Showing last ' + state.days + ' days';
        renderTable();
      };
    });
    Object.keys(FILTERS).forEach(function(key) {
      TGE.el('util-drop-' + key).addEventListener('change', onFilterChange);
      TGE.el('util-drop-' + key).addEventListener('click', function(e) { e.stopPropagation(); });
      document.querySelector('[data-filter-btn="' + key + '"]').onclick = function(e) { e.stopPropagation(); toggleDrop(key); };
      document.querySelector('[data-filter-search="' + key + '"]').oninput = function(e) { searchDrop(key, e.target.value); };
    });
    document.addEventListener('click', closeDrops);
    TGE.el('util-static-btn').onclick = openStaticModal;
    TGE.el('util-workshop-btn').onclick = openWorkshopModal;
    TGE.el('util-add-keyword').onclick = addKeyword;
    document.querySelectorAll('[data-close-modal]').forEach(function(btn) {
      btn.onclick = function() { TGE.el(btn.dataset.closeModal).classList.remove('open'); applyStaticMapping(); };
    });
  }

  function loadFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(evt) {
      try {
        var data = JSON.parse(evt.target.result);
        if (!Array.isArray(data)) throw new Error('JSON must be an array');
        initDashboard(data);
      } catch (err) {
        alert('Cannot parse fleet JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function initDashboard(data) {
    state.master = data.slice();
    state.workshopMap = state.workshopMap || {};
    state.master.forEach(function(row) {
      Object.keys(row.workshop || {}).forEach(function(day) {
        var status = row.workshop[day];
        if (state.workshopMap[status] == null) state.workshopMap[status] = 'offroad';
      });
    });
    applyStaticMapping();
    tick();
  }

  function isStaticExcluded(row) {
    var hay = ['Legacy Number','Operator Name','Equip Type','Description'].map(function(field) {
      return String(row[field] || '').toUpperCase();
    }).join(' ');
    var keywordHit = Array.from(state.staticRules.keywords).some(function(kw) { return hay.indexOf(String(kw).toUpperCase()) !== -1; });
    return keywordHit || state.staticRules.exact.has(row['Legacy Number']);
  }

  function applyStaticMapping() {
    state.active = state.master.filter(function(row) { return !isStaticExcluded(row); });
    Object.keys(FILTERS).forEach(function(key) {
      var vals = uniqueValues(state.active, FILTERS[key].field);
      if (!FILTERS[key].selected.size) vals.forEach(function(v) { FILTERS[key].selected.add(v); });
      Array.from(FILTERS[key].selected).forEach(function(v) { if (vals.indexOf(v) === -1) FILTERS[key].selected.delete(v); });
    });
    rebuildFilters();
    renderTable();
  }

  function uniqueValues(rows, field) {
    return Array.from(new Set(rows.map(function(row) { return row[field]; }).filter(function(v) { return v != null && v !== ''; }))).sort();
  }

  function getFilteredRows(ignoreKey) {
    return state.active.filter(function(row) {
      return Object.keys(FILTERS).every(function(key) {
        if (key === ignoreKey) return true;
        var selected = FILTERS[key].selected;
        return !selected.size || selected.has(row[FILTERS[key].field]);
      });
    });
  }

  function rebuildFilters() {
    Object.keys(FILTERS).forEach(function(key) {
      var available = uniqueValues(getFilteredRows(key), FILTERS[key].field);
      var selected = FILTERS[key].selected;
      var allSelected = available.length && available.every(function(v) { return selected.has(v); });
      TGE.el('util-list-' + key).innerHTML = [
        '<label class="util-drop-item"><input type="checkbox" data-filter="' + key + '" data-value="__all__" ' + (allSelected ? 'checked' : '') + ' /> <em>Select all</em></label>',
      ].concat(available.map(function(v) {
        return '<label class="util-drop-item" data-search="' + escAttr(v) + '"><input type="checkbox" data-filter="' + key + '" data-value="' + escAttr(v) + '" ' + (selected.has(v) ? 'checked' : '') + ' /> ' + escHtml(v) + '</label>';
      })).join('');
      var count = available.filter(function(v) { return selected.has(v); }).length;
      TGE.el('util-count-' + key).textContent = count === available.length ? 'All selected' : count + ' of ' + available.length + ' selected';
      TGE.el('util-lbl-' + key).textContent = count === available.length ? 'All' : count === 0 ? 'None' : count + ' selected';
    });
  }

  function onFilterChange(e) {
    var cb = e.target;
    if (cb.type !== 'checkbox') return;
    var key = cb.dataset.filter;
    var val = cb.dataset.value;
    var available = uniqueValues(getFilteredRows(key), FILTERS[key].field);
    if (val === '__all__') {
      if (cb.checked) available.forEach(function(v) { FILTERS[key].selected.add(v); });
      else FILTERS[key].selected.clear();
    } else {
      if (cb.checked) FILTERS[key].selected.add(val);
      else FILTERS[key].selected.delete(val);
    }
    rebuildFilters();
    renderTable();
  }

  function toggleDrop(key) {
    var drop = TGE.el('util-drop-' + key);
    var btn = document.querySelector('[data-filter-btn="' + key + '"]');
    var open = drop.classList.contains('open');
    closeDrops();
    if (!open) {
      var rect = btn.getBoundingClientRect();
      drop.style.left = rect.left + 'px';
      drop.style.top = (rect.bottom + 4) + 'px';
      drop.style.width = Math.max(180, rect.width) + 'px';
      drop.classList.add('open');
    }
  }

  function closeDrops() {
    document.querySelectorAll('.util-drop').forEach(function(drop) { drop.classList.remove('open'); });
  }

  function searchDrop(key, q) {
    q = String(q || '').toLowerCase();
    TGE.el('util-list-' + key).querySelectorAll('[data-search]').forEach(function(row) {
      row.style.display = row.dataset.search.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
    });
  }

  function dateRange() {
    var dates = [];
    var today = new Date();
    today.setHours(0,0,0,0);
    for (var i = state.days - 1; i >= 0; i--) {
      var d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(d);
    }
    return dates;
  }

  function rowHasException(row, dates) {
    if (!row.hasTelematics) return false;
    return dates.some(function(d, idx) {
      var km = kmForDate(row, dates, idx);
      var status = workshopStatus(row, d);
      return km != null && km < state.cutoff && !isWorkshopOffroad(status) && !isOffline(row, d);
    });
  }

  function tableRows(dates) {
    var rows = getFilteredRows();
    if (state.view === 'exceptions') rows = rows.filter(function(row) { return rowHasException(row, dates); });
    if (state.view === 'workshop') rows = rows.filter(function(row) { return Object.keys(row.workshop || {}).length; });
    if (state.view === 'offline') rows = rows.filter(function(row) { return row.offline && row.offline.dateOffline; });
    if (state.view === 'notel') rows = rows.filter(function(row) { return !row.hasTelematics; });
    return rows;
  }

  function renderTable() {
    var dates = dateRange();
    var rows = tableRows(dates);
    TGE.el('util-thead').innerHTML = buildTableHead(dates);
    TGE.el('util-tbody').innerHTML = rows.length ? rows.map(function(row) { return buildRow(row, dates); }).join('') : '<tr><td colspan="999" style="padding:28px;color:#6b778c;">No assets match the current filters.</td></tr>';
    updateMetrics(rows, dates);
  }

  function buildTableHead(dates) {
    var top = '<tr><th rowspan="2" class="util-pin-left">Legacy number</th>';
    dates.forEach(function(d) { top += '<th colspan="3">' + fmtDate(d) + '</th>'; });
    top += '<th rowspan="2" class="util-pin-total">Total KM</th><th rowspan="2" class="util-pin-avg">Avg/day</th></tr>';
    var sub = '<tr class="r2">';
    dates.forEach(function() { sub += '<th class="util-subhdr util-dcol">KM</th><th class="util-subhdr util-dcol">WS</th><th class="util-subhdr util-dcol">Off</th>'; });
    sub += '</tr>';
    return top + sub;
  }

  function buildRow(row, dates) {
    var total = 0;
    var activeDays = 0;
    var cells = dates.map(function(d, idx) {
      var km = kmForDate(row, dates, idx);
      var ws = workshopStatus(row, d);
      var off = isOffline(row, d);
      var wsOff = isWorkshopOffroad(ws);
      if (row.hasTelematics && km != null && !off && !wsOff) { total += km; activeDays++; }
      var kmClass = !row.hasTelematics ? 'util-notel' : off ? 'util-off' : wsOff ? 'util-ws' : km != null && km < state.cutoff ? 'util-low' : '';
      var kmVal = !row.hasTelematics ? 'N/A' : km == null ? '-' : km;
      return '<td class="util-dcol ' + kmClass + '">' + kmVal + '</td>' +
        '<td class="util-dcol ' + (ws ? 'util-ws' : '') + '" title="' + escAttr(ws || '') + '">' + (ws ? ws.slice(0,3) : '-') + '</td>' +
        '<td class="util-dcol ' + (off ? 'util-off' : '') + '">' + (off ? 'Off' : '-') + '</td>';
    }).join('');
    var avg = activeDays ? Math.round(total / activeDays) : '-';
    return '<tr><td class="util-pin-left">' + escHtml(row['Legacy Number']) + '</td>' + cells +
      '<td class="util-pin-total">' + (row.hasTelematics ? total.toLocaleString() : '-') + '</td>' +
      '<td class="util-pin-avg">' + (row.hasTelematics ? avg : '-') + '</td></tr>';
  }

  function updateMetrics(rows, dates) {
    var active = 0, workshop = 0, offline = 0, notel = 0;
    rows.forEach(function(row) {
      if (!row.hasTelematics) { notel++; return; }
      if (dates.some(function(d) { return isOffline(row, d); })) offline++;
      else if (Object.keys(row.workshop || {}).some(function(day) { return isWorkshopOffroad(row.workshop[day]); })) workshop++;
      else active++;
    });
    TGE.el('util-total').textContent = rows.length + ' asset' + (rows.length === 1 ? '' : 's');
    TGE.el('util-m-active').textContent = active;
    TGE.el('util-m-ws').textContent = workshop;
    TGE.el('util-m-off').textContent = offline;
    TGE.el('util-m-notel').textContent = notel;
  }

  function kmForDate(row, dates, idx) {
    var hist = row.history || [];
    return hist[hist.length - dates.length + idx] == null ? null : hist[hist.length - dates.length + idx];
  }

  function workshopStatus(row, d) {
    return (row.workshop || {})[dateKey(d)] || '';
  }

  function isWorkshopOffroad(status) {
    return !!status && state.workshopMap[status] !== 'active';
  }

  function isOffline(row, d) {
    var off = row.offline || {};
    if (!off.dateOffline || !off.expectedOnline) return false;
    var start = new Date(off.dateOffline + 'T00:00:00');
    var end = new Date(off.expectedOnline + 'T00:00:00');
    return d >= start && d <= end;
  }

  function openStaticModal() {
    renderKeywords();
    renderStaticList();
    TGE.el('util-static-modal').classList.add('open');
  }

  function renderKeywords() {
    TGE.el('util-keywords').innerHTML = Array.from(state.staticRules.keywords).map(function(kw) {
      return '<button class="util-keyword" data-keyword="' + escAttr(kw) + '" type="button">' + escHtml(kw) + ' x</button>';
    }).join('');
    TGE.el('util-keywords').querySelectorAll('[data-keyword]').forEach(function(btn) {
      btn.onclick = function() { state.staticRules.keywords.delete(btn.dataset.keyword); renderKeywords(); renderStaticList(); };
    });
  }

  function renderStaticList() {
    TGE.el('util-static-list').innerHTML = state.master.map(function(row) {
      var legacy = row['Legacy Number'];
      return '<div class="util-static-row"><label><input type="checkbox" data-static-legacy="' + escAttr(legacy) + '" ' + (state.staticRules.exact.has(legacy) ? 'checked' : '') + ' /> Exclude ' + escHtml(legacy) + ' <span style="color:#6b778c;">(' + escHtml(row['Equip Type'] || '') + ')</span></label></div>';
    }).join('');
    TGE.el('util-static-list').querySelectorAll('[data-static-legacy]').forEach(function(cb) {
      cb.onchange = function() {
        if (cb.checked) state.staticRules.exact.add(cb.dataset.staticLegacy);
        else state.staticRules.exact.delete(cb.dataset.staticLegacy);
      };
    });
  }

  function addKeyword() {
    var input = TGE.el('util-static-keyword');
    var val = String(input.value || '').trim().toUpperCase();
    if (!val) return;
    state.staticRules.keywords.add(val);
    input.value = '';
    renderKeywords();
    renderStaticList();
  }

  function openWorkshopModal() {
    var statuses = Object.keys(state.workshopMap);
    TGE.el('util-workshop-rows').innerHTML = statuses.length ? statuses.map(function(status) {
      return '<div class="util-workshop-line"><strong>' + escHtml(status) + '</strong><span class="util-workshop-toggle">' +
        '<button type="button" data-ws-status="' + escAttr(status) + '" data-ws-value="offroad" class="' + (state.workshopMap[status] === 'offroad' ? 'active' : '') + '">Off-road</button>' +
        '<button type="button" data-ws-status="' + escAttr(status) + '" data-ws-value="active" class="' + (state.workshopMap[status] === 'active' ? 'active' : '') + '">Still active</button>' +
        '</span></div>';
    }).join('') : '<p style="color:#6b778c;font-size:12px;">No workshop statuses found.</p>';
    TGE.el('util-workshop-rows').querySelectorAll('[data-ws-status]').forEach(function(btn) {
      btn.onclick = function() { state.workshopMap[btn.dataset.wsStatus] = btn.dataset.wsValue; openWorkshopModal(); renderTable(); };
    });
    TGE.el('util-workshop-modal').classList.add('open');
  }

  function tick() {
    var el = TGE.el('util-refresh');
    if (el) el.textContent = 'Last update: ' + new Date().toLocaleTimeString('en-AU', { hour:'2-digit', minute:'2-digit' });
  }

  function dateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fmtDate(d) {
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }

  function escHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(ch) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
    });
  }

  function escAttr(v) { return escHtml(v); }

  var _orig = TGE.onAppReady;
  TGE.onAppReady = function () {
    if (typeof _orig === 'function') _orig();
    render();
  };

  TGE.onShow['utilisation'] = function () {};

})();
