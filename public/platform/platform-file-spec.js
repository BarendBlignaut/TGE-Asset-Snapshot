// TGE Asset Snapshot — Platform File Spec
// public/platform/platform-file-spec.js
//
// Live view of the Static Fleet master list — stats bar, Save, export pill,
// and a scrollable table of every mapped column against every active asset.
// Per-column exclusions (values + whole-word phrases), a filter-flag toggle,
// and a single telematics-source picker, all live-previewed and cascading.
//
// PERFORMANCE: the table body is virtualised — only the rows currently
// scrolled into view (plus a small buffer) actually exist in the DOM, sitting
// between two spacer rows that stand in for everything above and below. This
// keeps the browser handling ~30-50 real rows at a time no matter how large
// the fleet is, which is what keeps scrolling and ticking exclusions smooth.

(function () {
  'use strict';

  var state = {
    vendorId: null,
    columns: [],
    rows: [],
    loading: false,
    error: '',
    exclusions: {},   // { sourceColumn: { values: {}, phrases: [] } }
    filterFlags: {},  // { sourceColumn: true|false } — seeded from use_as_filter
    telematicsSource: null,  // single source_column, or null — seeded from DB
    openDropdownColumn: null
  };

  var STYLES_INJECTED = false;
  function injectPillStyles() {
    if (STYLES_INJECTED) return;
    STYLES_INJECTED = true;
    var style = document.createElement('style');
    style.textContent = [
      '.snap-hero-menu{position:relative;display:inline-flex;align-items:center;}',
      '.snap-menu-trigger{height:34px;display:inline-flex;align-items:center;gap:8px;padding:0 11px;border-radius:999px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink-2);font-size:11px;font-weight:700;cursor:pointer;transition:background 140ms,border-color 140ms,color 140ms;}',
      '.snap-menu-trigger:hover,.snap-hero-menu.open .snap-menu-trigger{background:var(--surface-3);border-color:var(--green-600);color:var(--green-800);}',
      '.snap-menu-caret{width:10px;height:10px;opacity:0.75;transition:transform 140ms;}',
      '.snap-hero-menu.open .snap-menu-caret{transform:rotate(180deg);}',
      '.snap-menu-panel{position:fixed;min-width:190px;padding:6px;border-radius:12px;background:#fff;border:1px solid rgba(15,26,19,0.10);box-shadow:0 18px 42px rgba(10,45,20,0.22);display:none;z-index:500;}',
      '.snap-hero-menu.open .snap-menu-panel{display:block;}',
      '.snap-menu-item{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px;border:none;border-radius:9px;background:transparent;color:var(--ink-2);font-size:12px;font-weight:600;text-align:left;cursor:pointer;opacity:0.4;pointer-events:none;}',
      '.snap-menu-item.active{opacity:1;pointer-events:auto;}',
      '.snap-menu-item.active:hover{background:var(--green-50);color:var(--green-800);}',
      '.fs-th-wrap{position:relative;display:inline-flex;align-items:center;gap:6px;}',
      '.fs-dd-slot{position:absolute;top:100%;left:0;z-index:80;}',
      '.fs-row-odd{background:var(--surface-2);}',
      '.fs-row-even{background:var(--surface);}',
      '.fs-excluded{background:var(--danger-bg) !important;}',
      '.fs-excluded td{color:var(--muted-2) !important;text-decoration:line-through;}',
      '.fs-icon-on{background:var(--green-600) !important;color:#fff !important;}',
      '.fs-icon-off{background:var(--surface-3) !important;color:var(--muted-2) !important;}',
      '.fs-arrow-on{background:var(--danger) !important;color:#fff !important;}',
      '.fs-arrow-off{background:var(--surface-3) !important;color:var(--muted-2) !important;}'
    ].join('');
    document.head.appendChild(style);
  }

  function render(options) {
    options = options || {};
    state.vendorId = options.vendorId || null;

    var container = options.container;
    if (!container) return;

    injectPillStyles();

    container.innerHTML = [
      '<div class="card">',
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">',
          '<div>',
            '<div class="card-kicker">Vendor Platform</div>',
            '<div class="card-title">File Spec — Static Fleet</div>',
            '<p style="font-size:13px;color:var(--muted);margin:4px 0 0;">The live master fleet list, exactly as imported. Review here before setting exclusions and filters.</p>',
          '</div>',
          '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">',
            '<div id="fs-stats" style="font-size:12px;color:var(--muted);"></div>',
            '<button type="button" id="fs-save-btn" class="btn" style="height:34px;padding:0 16px;font-size:12px;font-weight:700;border-radius:999px;background:var(--green-600);color:#fff;border:none;cursor:pointer;">Save</button>',
            '<div id="fs-export-wrap"></div>',
          '</div>',
        '</div>',
      '</div>',

      '<div class="card" style="padding:0;overflow:hidden;">',
        '<div id="fs-table-wrap" style="overflow:auto;max-height:70vh;">',
          '<div style="padding:30px;text-align:center;color:var(--muted);">Loading fleet data...</div>',
        '</div>',
      '</div>'
    ].join('');

    loadData();
  }

  async function loadData() {
    state.loading = true;
    state.error = '';

    var fieldsRes = await TGE.api('GET', '/api/utilisation/static-fields');
    var fleetRes  = await TGE.api('GET', '/api/utilisation/static-fleet-raw');
    var exclRes   = await TGE.api('GET', '/api/utilisation/static-exclusions?status=published');

    state.loading = false;

    if (!fieldsRes.ok) {
      state.error = (fieldsRes.data && fieldsRes.data.error) || 'Could not load column definitions.';
      renderError();
      return;
    }
    if (!fleetRes.ok) {
      state.error = (fleetRes.data && fleetRes.data.error) || 'Could not load fleet data.';
      renderError();
      return;
    }

    state.columns = (fieldsRes.data.fields || []).slice().sort(function (a, b) {
      return (a.display_order || 0) - (b.display_order || 0);
    });
    state.rows = fleetRes.data.fleet || [];

    state.filterFlags = {};
    state.telematicsSource = null;
    state.columns.forEach(function (c) {
      state.filterFlags[c.source_column] = !!c.use_as_filter;
      if (c.is_telematics_source) state.telematicsSource = c.source_column;
    });

    state.exclusions = {};
    if (exclRes.ok) {
      (exclRes.data.rules || []).forEach(function (r) {
        var ex = getExclusion(r.source_column);
        if (r.match_type === 'exact') {
          ex.values[r.match_value] = true;
        } else {
          ex.phrases.push(r.match_value);
        }
      });
    }

    renderStats();
    renderExportPill();
    renderTable();
    wireSaveButton();
  }

  function renderError() {
    var wrap = TGE.el('fs-table-wrap');
    if (wrap) wrap.innerHTML = '<div style="padding:30px;text-align:center;color:var(--danger);">' + escapeHtml(state.error) + '</div>';
  }

  function getExclusion(sourceColumn) {
    if (!state.exclusions[sourceColumn]) {
      state.exclusions[sourceColumn] = { values: {}, phrases: [] };
    }
    return state.exclusions[sourceColumn];
  }

  function wholeWordMatch(text, phrase) {
    if (!phrase) return false;
    var escaped = String(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp('(^|[^A-Za-z0-9])' + escaped + '([^A-Za-z0-9]|$)', 'i');
    return re.test(String(text));
  }

  function rowIsExcluded(row, ignoreColumn) {
    var fields = row.fields || {};
    for (var i = 0; i < state.columns.length; i++) {
      var col = state.columns[i].source_column;
      if (col === ignoreColumn) continue;
      var ex = state.exclusions[col];
      if (!ex) continue;
      var raw = fields[col];
      if (raw == null || raw === '') continue;
      var val = String(raw);
      if (ex.values[val]) return true;
      for (var p = 0; p < ex.phrases.length; p++) {
        if (wholeWordMatch(val, ex.phrases[p])) return true;
      }
    }
    return false;
  }

  function currentVisibleRows(ignoreColumn) {
    var hasAnyExclusion = Object.keys(state.exclusions).some(function (col) {
      if (col === ignoreColumn) return false;
      var ex = state.exclusions[col];
      return Object.keys(ex.values).some(function (v) { return ex.values[v]; }) || ex.phrases.length > 0;
    });
    if (!hasAnyExclusion) return state.rows;
    return state.rows.filter(function (row) { return !rowIsExcluded(row, ignoreColumn); });
  }

  function distinctValuesFor(sourceColumn) {
    var pool = currentVisibleRows(sourceColumn);
    var poolCounts = {};
    for (var i = 0; i < pool.length; i++) {
      var pv = (pool[i].fields || {})[sourceColumn];
      if (pv == null || pv === '') continue;
      var pval = String(pv);
      poolCounts[pval] = (poolCounts[pval] || 0) + 1;
    }

    var allValues = {};
    for (var j = 0; j < state.rows.length; j++) {
      var raw = (state.rows[j].fields || {})[sourceColumn];
      if (raw == null || raw === '') continue;
      allValues[String(raw)] = true;
    }

    return Object.keys(allValues)
      .map(function (v) { return { value: v, count: poolCounts[v] || 0 }; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  // ── Lightweight updates (no full table rebuild) ───────────────────────────

  function updateExclusionArrowIcon(sourceColumn) {
    var wrap = TGE.el('fs-table-wrap');
    if (!wrap) return;
    var btn = wrap.querySelector('[data-fs-arrow="' + cssEscape(sourceColumn) + '"]');
    if (!btn) return;
    var ex = state.exclusions[sourceColumn];
    var hasActive = ex && (Object.keys(ex.values).some(function (v) { return ex.values[v]; }) || ex.phrases.length > 0);
    var exCount = ex ? (Object.keys(ex.values).filter(function (v) { return ex.values[v]; }).length + ex.phrases.length) : 0;
    btn.classList.toggle('fs-arrow-on', !!hasActive);
    btn.classList.toggle('fs-arrow-off', !hasActive);
    btn.textContent = '▾' + (hasActive ? ' ' + exCount : '');
  }

  function afterExclusionChange(sourceColumn) {
    updateExclusionArrowIcon(sourceColumn);
    renderVisibleRows();
    renderStats();
  }

  function cssEscape(s) {
    return String(s).replace(/["\\]/g, '\\$&');
  }

  function renderStats() {
    var el = TGE.el('fs-stats');
    if (!el) return;
    var visible = currentVisibleRows();
    el.innerHTML = '<strong style="color:var(--ink);">' + visible.length + '</strong> assets shown' +
      (visible.length !== state.rows.length ? ' &nbsp;·&nbsp; ' + state.rows.length + ' total' : '');
  }

  function renderExportPill() {
    var wrap = TGE.el('fs-export-wrap');
    if (!wrap || !TGE.buildOutputPill) return;

    var items = [
      { id: 'filespec-export-pdf',   label: 'PDF',       action: function () { alert('PDF export coming soon.'); } },
      { id: 'filespec-export-email', label: 'Email PDF', action: function () { alert('Email export coming soon.'); } },
      { id: 'filespec-export-csv',   label: 'CSV',        action: exportCsv },
      { id: 'filespec-export-xlsx',  label: 'XLSX',       action: exportXlsx }
    ];

    wrap.innerHTML = TGE.buildOutputPill('filespec', items);
    TGE.wireOutputPill('filespec', items);
  }

  function exportRowsAsArrays() {
    var visible = currentVisibleRows();
    var header = state.columns.map(function (c) { return c.display_label || c.source_column; });
    var body = visible.map(function (row) {
      return state.columns.map(function (c) {
        var v = row.fields ? row.fields[c.source_column] : '';
        return v == null ? '' : String(v);
      });
    });
    return { header: header, body: body };
  }

  function exportCsv() {
    var data = exportRowsAsArrays();
    var lines = [data.header].concat(data.body).map(function (r) {
      return r.map(function (cell) {
        var s = String(cell);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    downloadBlob(blob, TGE.outputFileName ? TGE.outputFileName({ module: 'StaticFleet', type: 'FileSpec', extension: 'csv' }) : 'static-fleet.csv');
  }

  function exportXlsx() {
    if (typeof XLSX === 'undefined') { alert('XLSX export is unavailable in this browser build.'); return; }
    var data = exportRowsAsArrays();
    var ws = XLSX.utils.aoa_to_sheet([data.header].concat(data.body));
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Static Fleet');
    XLSX.writeFile(wb, TGE.outputFileName ? TGE.outputFileName({ module: 'StaticFleet', type: 'FileSpec', extension: 'xlsx' }) : 'static-fleet.xlsx');
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Table: header built once. Body is virtualised — see file header note. ──

  var ROW_HEIGHT = 32;
  var BUFFER_ROWS = 10;

  function renderTable() {
    var wrap = TGE.el('fs-table-wrap');
    if (!wrap) return;

    if (!state.rows.length) {
      wrap.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted);">No assets to display.</div>';
      return;
    }

    var headerCells = state.columns.map(function (c) {
      var colKey = c.source_column;
      var ex = state.exclusions[colKey];
      var hasActive = ex && (Object.keys(ex.values).some(function (v) { return ex.values[v]; }) || ex.phrases.length > 0);
      var exCount = ex ? (Object.keys(ex.values).filter(function (v) { return ex.values[v]; }).length + ex.phrases.length) : 0;
      var isFilter = !!state.filterFlags[colKey];
      var isTelematicsSource = state.telematicsSource === colKey;
      return '<th style="position:sticky;top:0;background:var(--surface-2);border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;white-space:nowrap;">' +
        '<span class="fs-th-wrap">' +
          '<span>' + escapeHtml(c.display_label || colKey) + '</span>' +
          '<button type="button" data-fs-telematics-toggle="' + escapeAttr(colKey) + '" title="Telematics source column" class="' + (isTelematicsSource ? 'fs-icon-on' : 'fs-icon-off') + '" style="border:none;cursor:pointer;padding:2px 5px;border-radius:5px;font-size:11px;line-height:1;">📡</button>' +
          '<button type="button" data-fs-filter-toggle="' + escapeAttr(colKey) + '" title="Use as end-user filter" class="' + (isFilter ? 'fs-icon-on' : 'fs-icon-off') + '" style="border:none;cursor:pointer;padding:2px 5px;border-radius:5px;font-size:11px;line-height:1;">▼</button>' +
          '<button type="button" data-fs-arrow="' + escapeAttr(colKey) + '" title="Exclude values" class="' + (hasActive ? 'fs-arrow-on' : 'fs-arrow-off') + '" style="border:none;cursor:pointer;padding:2px 5px;border-radius:5px;font-size:11px;line-height:1;font-weight:700;">▾' + (hasActive ? ' ' + exCount : '') + '</button>' +
          '<span class="fs-dd-slot" data-fs-slot="' + escapeAttr(colKey) + '"></span>' +
        '</span>' +
      '</th>';
    }).join('');

    wrap.innerHTML =
      '<table style="border-collapse:collapse;width:max-content;min-width:100%;">' +
        '<thead><tr>' + headerCells + '</tr></thead>' +
        '<tbody id="fs-tbody"></tbody>' +
      '</table>';

    wrap.querySelectorAll('[data-fs-arrow]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var col = btn.dataset.fsArrow;
        if (state.openDropdownColumn === col) { closeDropdown(); return; }
        openDropdown(col);
      };
    });

    wrap.querySelectorAll('[data-fs-filter-toggle]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var col = btn.dataset.fsFilterToggle;
        state.filterFlags[col] = !state.filterFlags[col];
        btn.classList.toggle('fs-icon-on', state.filterFlags[col]);
        btn.classList.toggle('fs-icon-off', !state.filterFlags[col]);
      };
    });

    wrap.querySelectorAll('[data-fs-telematics-toggle]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var col = btn.dataset.fsTelematicsToggle;
        state.telematicsSource = (state.telematicsSource === col) ? null : col;
        wrap.querySelectorAll('[data-fs-telematics-toggle]').forEach(function (b2) {
          var on = state.telematicsSource === b2.dataset.fsTelematicsToggle;
          b2.classList.toggle('fs-icon-on', on);
          b2.classList.toggle('fs-icon-off', !on);
        });
      };
    });

    renderVisibleRows();

    wrap.onscroll = function () {
      window.requestAnimationFrame(renderVisibleRows);
    };
    window.addEventListener('resize', function () {
      window.requestAnimationFrame(renderVisibleRows);
    });
  }

  function renderVisibleRows() {
    var wrap = TGE.el('fs-table-wrap');
    var tbody = TGE.el('fs-tbody');
    if (!wrap || !tbody) return;

    var total = state.rows.length;
    var viewportH = wrap.clientHeight || 500;
    var scrollTop = wrap.scrollTop;

    var visibleCount = Math.ceil(viewportH / ROW_HEIGHT) + BUFFER_ROWS * 2;
    var startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
    var endIndex = Math.min(total, startIndex + visibleCount);

    var topHeight = startIndex * ROW_HEIGHT;
    var bottomHeight = (total - endIndex) * ROW_HEIGHT;
    var colCount = state.columns.length;

    var html = '';
    if (topHeight > 0) {
      html += '<tr aria-hidden="true"><td colspan="' + colCount + '" style="padding:0;border:none;height:' + topHeight + 'px;"></td></tr>';
    }

    for (var i = startIndex; i < endIndex; i++) {
      var row = state.rows[i];
      var excluded = rowIsExcluded(row);
      var rowClass = (excluded ? 'fs-excluded ' : '') + (i % 2 === 1 ? 'fs-row-odd' : 'fs-row-even');
      var cells = state.columns.map(function (c) {
        var v = row.fields ? row.fields[c.source_column] : '';
        return '<td style="height:' + ROW_HEIGHT + 'px;box-sizing:border-box;padding:6px 10px;font-size:12.5px;color:var(--ink-2);white-space:nowrap;border-bottom:1px solid var(--line-2);">' +
          escapeHtml(v == null ? '' : String(v)) + '</td>';
      }).join('');
      html += '<tr class="' + rowClass + '" style="height:' + ROW_HEIGHT + 'px;">' + cells + '</tr>';
    }

    if (bottomHeight > 0) {
      html += '<tr aria-hidden="true"><td colspan="' + colCount + '" style="padding:0;border:none;height:' + bottomHeight + 'px;"></td></tr>';
    }

    tbody.innerHTML = html;
  }

  function closeDropdown() {
    state.openDropdownColumn = null;
    document.querySelectorAll('.fs-dd-slot').forEach(function (slot) { slot.innerHTML = ''; });
  }

  function findSlot(sourceColumn) {
    var wrap = TGE.el('fs-table-wrap');
    if (!wrap) return null;
    var slots = wrap.querySelectorAll('[data-fs-slot]');
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].dataset.fsSlot === sourceColumn) return slots[i];
    }
    return null;
  }

  function openDropdown(sourceColumn) {
    document.querySelectorAll('.fs-dd-slot').forEach(function (slot) { slot.innerHTML = ''; });

    state.openDropdownColumn = sourceColumn;
    var slot = findSlot(sourceColumn);
    if (!slot) return;

    renderDropdownContents(sourceColumn, slot);
  }

  function renderDropdownContents(sourceColumn, slot) {
    var values = distinctValuesFor(sourceColumn);
    var ex = getExclusion(sourceColumn);

    var rows = values.map(function (v) {
      var checked = !ex.values[v.value];
      return '<label style="display:flex;align-items:center;gap:8px;padding:5px 8px;font-size:12px;color:var(--ink-2);cursor:pointer;">' +
        '<input type="checkbox" data-fs-value="' + escapeAttr(v.value) + '"' + (checked ? ' checked' : '') + ' />' +
        '<span style="flex:1;">' + escapeHtml(v.value) + '</span>' +
        '<span style="color:var(--muted);font-size:11px;">' + v.count + '</span>' +
      '</label>';
    }).join('');

    var phraseRows = ex.phrases.map(function (p, i) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;font-size:12px;">' +
        '<span style="flex:1;color:var(--ink-2);">contains word: <strong>' + escapeHtml(p) + '</strong></span>' +
        '<button type="button" data-fs-remove-phrase="' + i + '" style="border:none;background:none;color:var(--danger);cursor:pointer;font-size:12px;">✕</button>' +
      '</div>';
    }).join('');

    slot.innerHTML =
      '<div style="width:280px;max-height:380px;overflow:auto;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 18px 42px rgba(10,45,20,0.22);padding:8px;text-transform:none;">' +
        '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;padding:4px 8px;">Exclude a whole word</div>' +
        '<div style="display:flex;gap:6px;padding:0 8px 8px;">' +
          '<input type="text" id="fs-phrase-input" placeholder="e.g. E-TAG" style="flex:1;height:30px;border:1px solid var(--line);border-radius:6px;padding:0 8px;font-size:12px;" />' +
          '<button type="button" id="fs-phrase-add" class="btn" style="height:30px;font-size:12px;padding:0 10px;">Add</button>' +
        '</div>' +
        (phraseRows ? '<div style="border-top:1px solid var(--line-2);border-bottom:1px solid var(--line-2);margin-bottom:6px;">' + phraseRows + '</div>' : '') +
        '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;padding:4px 8px;">Values (untick to exclude)</div>' +
        '<div>' + rows + '</div>' +
      '</div>';

    slot.onclick = function (e) { e.stopPropagation(); };

    slot.querySelectorAll('[data-fs-value]').forEach(function (input) {
      input.onchange = function () {
        var val = input.dataset.fsValue;
        var exx = getExclusion(sourceColumn);
        exx.values[val] = !input.checked;
        afterExclusionChange(sourceColumn);
        renderDropdownContents(sourceColumn, slot);
      };
    });

    slot.querySelectorAll('[data-fs-remove-phrase]').forEach(function (btn2) {
      btn2.onclick = function () {
        var idx = parseInt(btn2.dataset.fsRemovePhrase, 10);
        var exx = getExclusion(sourceColumn);
        exx.phrases.splice(idx, 1);
        afterExclusionChange(sourceColumn);
        renderDropdownContents(sourceColumn, slot);
      };
    });

    var addBtn = TGE.el('fs-phrase-add');
    if (addBtn) {
      addBtn.onclick = function () {
        var input = TGE.el('fs-phrase-input');
        var phrase = input ? input.value.trim() : '';
        if (!phrase) return;
        var exx = getExclusion(sourceColumn);
        if (exx.phrases.indexOf(phrase) === -1) exx.phrases.push(phrase);
        afterExclusionChange(sourceColumn);
        renderDropdownContents(sourceColumn, slot);
      };
    }
  }

  document.addEventListener('click', function () {
    if (state.openDropdownColumn) closeDropdown();
  });

  function wireSaveButton() {
    var btn = TGE.el('fs-save-btn');
    if (!btn) return;
    btn.onclick = async function () {
      btn.disabled = true;
      btn.textContent = 'Saving...';

      var fieldUpdates = state.columns.map(function (c) {
        return {
          id: c.id,
          sourceColumn: c.source_column,
          displayLabel: c.display_label,
          saveToDb: !!c.save_to_db,
          isIdentity: !!c.is_identity,
          useAsFilter: !!state.filterFlags[c.source_column],
          filterLabel: c.filter_label,
          filterType: c.filter_type,
          displayOrder: c.display_order,
          enabled: c.enabled !== 0,
          isTelematicsSource: state.telematicsSource === c.source_column
        };
      });

      var rules = [];
      Object.keys(state.exclusions).forEach(function (col) {
        var ex = state.exclusions[col];
        Object.keys(ex.values).forEach(function (val) {
          if (ex.values[val]) rules.push({ sourceColumn: col, matchType: 'exact', matchValue: val });
        });
        ex.phrases.forEach(function (p) {
          rules.push({ sourceColumn: col, matchType: 'contains', matchValue: p });
        });
      });

      var fieldsSave = await TGE.api('PUT', '/api/utilisation/static-fields', { fields: fieldUpdates });
      var draftSave  = await TGE.api('PUT', '/api/utilisation/static-exclusions/draft', { rules: rules });
      var publish    = await TGE.api('POST', '/api/utilisation/static-exclusions/publish', {});

      btn.disabled = false;
      btn.textContent = 'Save';

      if (fieldsSave.ok && draftSave.ok && publish.ok) {
        alert('Saved. Changes are now live on the dashboard.');
      } else {
        var err = (fieldsSave.data && fieldsSave.data.error) || (draftSave.data && draftSave.data.error) || (publish.data && publish.data.error) || 'Unknown error.';
        alert('Save failed: ' + err);
      }
    };
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }

  function escapeAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // ── Register ──────────────────────────────────────────────────────────────
  window.TGE = window.TGE || {};
  TGE.Platform = TGE.Platform || {};
  TGE.Platform.FileSpec = { render: render };

})();
