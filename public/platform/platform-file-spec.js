// TGE Asset Snapshot — Platform File Spec
// public/platform/platform-file-spec.js
//
// Stage 1: live view of the Static Fleet master list — stats bar, export
// pill, and a scrollable table of every mapped column against every active
// asset. Stage 2 adds per-column exclusions (values + whole-word phrases),
// live-previewed against the table, nothing saved yet.

(function () {
  'use strict';

  var state = {
    vendorId: null,
    columns: [],   // field defs, in display_order
    rows: [],      // active fleet rows
    loading: false,
    error: '',
    exclusions: {},   // { sourceColumn: { values: {}, phrases: [] } }
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
      '.snap-menu-item.active:hover{background:var(--green-50);color:var(--green-800);}'
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
    var fleetRes  = await TGE.api('GET', '/api/utilisation/static-fleet');

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

    renderStats();
    renderExportPill();
    renderTable();
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

  function rowIsExcluded(row) {
    var fields = row.fields || {};
    for (var i = 0; i < state.columns.length; i++) {
      var col = state.columns[i].source_column;
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

  function currentVisibleRows() {
    var hasAnyExclusion = Object.keys(state.exclusions).some(function (col) {
      var ex = state.exclusions[col];
      return Object.keys(ex.values).some(function (v) { return ex.values[v]; }) || ex.phrases.length > 0;
    });
    if (!hasAnyExclusion) return state.rows;
    return state.rows.filter(function (row) { return !rowIsExcluded(row); });
  }

  function distinctValuesFor(sourceColumn) {
    var counts = {};
    for (var i = 0; i < state.rows.length; i++) {
      var raw = (state.rows[i].fields || {})[sourceColumn];
      if (raw == null || raw === '') continue;
      var val = String(raw);
      counts[val] = (counts[val] || 0) + 1;
    }
    return Object.keys(counts)
      .map(function (v) { return { value: v, count: counts[v] }; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  function refreshAfterExclusionChange() {
    renderStats();
    renderTable();
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

  function renderTable() {
    var wrap = TGE.el('fs-table-wrap');
    if (!wrap) return;

    if (!state.rows.length) {
      wrap.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted);">No assets to display.</div>';
      return;
    }

    var headerCells = state.columns.map(function (c) {
      var ex = state.exclusions[c.source_column];
      var hasActive = ex && (Object.keys(ex.values).some(function (v) { return ex.values[v]; }) || ex.phrases.length > 0);
      return '<th style="position:sticky;top:0;background:var(--surface-2);border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;white-space:nowrap;">' +
        '<span style="display:inline-flex;align-items:center;gap:6px;">' +
          '<span>' + escapeHtml(c.display_label || c.source_column) + '</span>' +
          '<button type="button" data-fs-arrow="' + escapeHtml(c.source_column) + '" style="border:none;background:none;cursor:pointer;padding:2px;color:' + (hasActive ? 'var(--green-600)' : 'var(--muted-2)') + ';font-size:10px;line-height:1;">▾</button>' +
        '</span>' +
      '</th>';
    }).join('');

    var bodyRows = state.rows.map(function (row, i) {
      var excluded = rowIsExcluded(row);
      var cells = state.columns.map(function (c) {
        var v = row.fields ? row.fields[c.source_column] : '';
        return '<td style="padding:6px 10px;font-size:12.5px;color:' + (excluded ? 'var(--muted-2)' : 'var(--ink-2)') + ';white-space:nowrap;border-bottom:1px solid var(--line-2);' + (excluded ? 'text-decoration:line-through;' : '') + '">' +
          escapeHtml(v == null ? '' : String(v)) + '</td>';
      }).join('');
      return '<tr style="background:' + (excluded ? 'var(--danger-bg)' : (i % 2 === 1 ? 'var(--surface-2)' : 'var(--surface)')) + ';">' + cells + '</tr>';
    }).join('');

    wrap.innerHTML =
      '<table style="border-collapse:collapse;width:max-content;min-width:100%;">' +
        '<thead><tr>' + headerCells + '</tr></thead>' +
        '<tbody>' + bodyRows + '</tbody>' +
      '</table>' +
      '<div id="fs-dropdown-host"></div>';

    wrap.querySelectorAll('[data-fs-arrow]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var col = btn.dataset.fsArrow;
        if (state.openDropdownColumn === col) { closeDropdown(); return; }
        openDropdown(col, e.clientX, e.clientY);
      };
    });
  }

  function closeDropdown() {
    state.openDropdownColumn = null;
    var host = TGE.el('fs-dropdown-host');
    if (host) host.innerHTML = '';
  }

  function openDropdown(sourceColumn, clickX, clickY) {
    state.openDropdownColumn = sourceColumn;
    state.dropdownPos = { x: clickX, y: clickY };
    var host = TGE.el('fs-dropdown-host');
    if (!host) return;

    var values = distinctValuesFor(sourceColumn);
    var ex = getExclusion(sourceColumn);

    var rows = values.map(function (v) {
      var checked = !ex.values[v.value]; // checked = included (Excel semantics: untick to exclude)
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

    var panelW = 300;
    var clampedLeft = Math.min(clickX, window.innerWidth - panelW - 16);
    var clampedTop  = Math.min(clickY + 10, window.innerHeight - 420);
    host.innerHTML =
      '<div style="position:fixed;top:' + Math.max(clampedTop, 10) + 'px;left:' + Math.max(clampedLeft, 10) + 'px;width:' + panelW + 'px;max-height:400px;overflow:auto;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 18px 42px rgba(10,45,20,0.22);z-index:600;padding:8px;">' +
        '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;padding:4px 8px;">Exclude a whole word</div>' +
        '<div style="display:flex;gap:6px;padding:0 8px 8px;">' +
          '<input type="text" id="fs-phrase-input" placeholder="e.g. E-TAG" style="flex:1;height:30px;border:1px solid var(--line);border-radius:6px;padding:0 8px;font-size:12px;" />' +
          '<button type="button" id="fs-phrase-add" class="btn" style="height:30px;font-size:12px;padding:0 10px;">Add</button>' +
        '</div>' +
        (phraseRows ? '<div style="border-top:1px solid var(--line-2);border-bottom:1px solid var(--line-2);margin-bottom:6px;">' + phraseRows + '</div>' : '') +
        '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;padding:4px 8px;">Values (untick to exclude)</div>' +
        '<div>' + rows + '</div>' +
      '</div>';

    host.onclick = function (e) { e.stopPropagation(); };

    host.querySelectorAll('[data-fs-value]').forEach(function (input) {
      input.onchange = function () {
        var val = input.dataset.fsValue;
        var exx = getExclusion(sourceColumn);
        exx.values[val] = !input.checked; // unticked => excluded
        refreshAfterExclusionChange();
        openDropdown(sourceColumn, state.dropdownPos.x, state.dropdownPos.y);
      };
    });

    host.querySelectorAll('[data-fs-remove-phrase]').forEach(function (btn) {
      btn.onclick = function () {
        var idx = parseInt(btn.dataset.fsRemovePhrase, 10);
        var exx = getExclusion(sourceColumn);
        exx.phrases.splice(idx, 1);
        refreshAfterExclusionChange();
        openDropdown(sourceColumn, state.dropdownPos.x, state.dropdownPos.y);
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
        refreshAfterExclusionChange();
        openDropdown(sourceColumn, state.dropdownPos.x, state.dropdownPos.y);
      };
    }
  }

  document.addEventListener('click', function () {
    if (state.openDropdownColumn) closeDropdown();
  });

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
