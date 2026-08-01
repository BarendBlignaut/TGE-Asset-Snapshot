// TGE Asset Snapshot — Platform File Spec
// public/platform/platform-file-spec.js
//
// Stage 1: live view of the Static Fleet master list — stats bar, export
// pill, and a scrollable table of every mapped column against every active
// asset. No exclusion or filter interactivity yet — those arrive in later
// stages on top of this same table.

(function () {
  'use strict';

  var state = {
    vendorId: null,
    columns: [],   // field defs, in display_order
    rows: [],      // active fleet rows
    loading: false,
    error: ''
  };

  function render(options) {
    options = options || {};
    state.vendorId = options.vendorId || null;

    var container = options.container;
    if (!container) return;

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

  function currentVisibleRows() {
    // Stage 1 has no exclusion logic yet — every active row is visible.
    // Later stages filter this same list before it reaches the table/export.
    return state.rows;
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

    var visible = currentVisibleRows();

    if (!visible.length) {
      wrap.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted);">No assets to display.</div>';
      return;
    }

    var headerCells = state.columns.map(function (c) {
      return '<th style="position:sticky;top:0;background:var(--surface-2);border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;white-space:nowrap;">' +
        escapeHtml(c.display_label || c.source_column) + '</th>';
    }).join('');

    var bodyRows = visible.map(function (row, i) {
      var cells = state.columns.map(function (c) {
        var v = row.fields ? row.fields[c.source_column] : '';
        return '<td style="padding:6px 10px;font-size:12.5px;color:var(--ink-2);white-space:nowrap;border-bottom:1px solid var(--line-2);">' +
          escapeHtml(v == null ? '' : String(v)) + '</td>';
      }).join('');
      return '<tr style="background:' + (i % 2 === 1 ? 'var(--surface-2)' : 'var(--surface)') + ';">' + cells + '</tr>';
    }).join('');

    wrap.innerHTML =
      '<table style="border-collapse:collapse;width:max-content;min-width:100%;">' +
        '<thead><tr>' + headerCells + '</tr></thead>' +
        '<tbody>' + bodyRows + '</tbody>' +
      '</table>';
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }

  // ── Register ──────────────────────────────────────────────────────────────
  window.TGE = window.TGE || {};
  TGE.Platform = TGE.Platform || {};
  TGE.Platform.FileSpec = { render: render };

})();
