// TGE Asset Snapshot — Merge Mail Page
// public/merge-mail.js
//
// Generic mail merge: import a table (drag-drop or browse), map columns,
// then reuse the shared TGE.openEmailComposer for the actual send.

(function () {
  'use strict';

  var state = {
    columns: [],
    rows:    [],
    fileName: '',
  };

  function render() {
    var view = TGE.el('view-merge-mail');
    if (!view) return;

    view.innerHTML = [
      '<div class="hero">',
        '<div class="hero-kicker">Operations</div>',
        '<div class="hero-title">Merge Mail</div>',
        '<div class="hero-sub">Import a table and send personalised or combined emails — like mail merge, without the limits.</div>',
      '</div>',

      '<div class="card" id="mm-dropzone" style="text-align:center;padding:48px 20px;border:2px dashed var(--line);cursor:pointer;">',
        '<div style="font-size:40px;margin-bottom:12px;opacity:0.4;">📂</div>',
        '<div style="font-size:14px;font-weight:600;color:var(--ink);margin-bottom:6px;">Drag & drop a CSV or Excel file here</div>',
        '<p style="font-size:13px;color:var(--muted);margin:0 0 14px;">or click to browse</p>',
        '<input type="file" id="mm-file-input" accept=".csv,.xlsx,.xls" style="display:none;" />',
        '<button class="btn" id="mm-browse-btn" type="button">Browse Files</button>',
      '</div>',

      '<div id="mm-loaded" style="display:none;">',

        '<div class="card">',
          '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">',
            '<div>',
              '<div class="card-kicker">Imported Table</div>',
              '<div class="card-title" id="mm-file-summary">—</div>',
            '</div>',
            '<button class="btn" id="mm-clear-btn" type="button">Clear & Import Different File</button>',
          '</div>',
          '<div style="overflow-x:auto;margin-top:14px;max-height:300px;overflow-y:auto;">',
            '<table id="mm-preview-table" style="width:100%;border-collapse:collapse;font-size:12px;"></table>',
          '</div>',
        '</div>',

        '<div class="card">',
          '<div class="card-kicker">Select Rows</div>',
          '<div class="card-title">Choose Recipients</div>',
          '<div style="display:flex;gap:8px;margin-bottom:10px;">',
            '<button class="btn" id="mm-select-all-btn" type="button">Select All</button>',
            '<button class="btn" id="mm-deselect-all-btn" type="button">Deselect All</button>',
            '<span id="mm-select-count" style="align-self:center;font-size:12px;color:var(--muted);">0 selected</span>',
          '</div>',
          '<div style="overflow-x:auto;max-height:280px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;">',
            '<table id="mm-select-table" style="width:100%;border-collapse:collapse;font-size:12px;"></table>',
          '</div>',
          '<button class="hero-run-btn" id="mm-compose-btn" type="button" style="margin-top:14px;">✉ Compose Email</button>',
        '</div>',

      '</div>',

    ].join('');

    wireEvents();
  }

  function wireEvents() {
    var dropzone    = TGE.el('mm-dropzone');
    var fileInput   = TGE.el('mm-file-input');
    var browseBtn   = TGE.el('mm-browse-btn');
    var clearBtn    = TGE.el('mm-clear-btn');
    var selAllBtn   = TGE.el('mm-select-all-btn');
    var deselAllBtn = TGE.el('mm-deselect-all-btn');
    var composeBtn  = TGE.el('mm-compose-btn');

    if (browseBtn) browseBtn.onclick = function () { fileInput.click(); };
    if (dropzone) {
      dropzone.onclick = function (e) { if (e.target === dropzone || e.target.tagName !== 'BUTTON') fileInput.click(); };
      dropzone.ondragover  = function (e) { e.preventDefault(); dropzone.style.borderColor = 'var(--green-600)'; };
      dropzone.ondragleave = function ()  { dropzone.style.borderColor = 'var(--line)'; };
      dropzone.ondrop = function (e) {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--line)';
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
      };
    }
    if (fileInput)   fileInput.onchange   = function (e) { if (e.target.files.length) handleFile(e.target.files[0]); };
    if (clearBtn)    clearBtn.onclick     = resetState;
    if (selAllBtn)   selAllBtn.onclick    = function () { document.querySelectorAll('.mm-row-check').forEach(function (cb) { cb.checked = true;  }); updateSelectCount(); };
    if (deselAllBtn) deselAllBtn.onclick  = function () { document.querySelectorAll('.mm-row-check').forEach(function (cb) { cb.checked = false; }); updateSelectCount(); };
    if (composeBtn)  composeBtn.onclick   = openComposer;
  }

  function handleFile(file) {
    state.fileName = file.name;
    var ext = file.name.split('.').pop().toLowerCase();
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        if (ext === 'csv') parseCsv(e.target.result);
        else               parseXlsx(e.target.result);
        showLoaded();
      } catch (err) {
        alert('Could not read file: ' + err.message);
      }
    };
    if (ext === 'csv') reader.readAsText(file);
    else               reader.readAsArrayBuffer(file);
  }

  function parseCsv(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim().length; });
    if (!lines.length) throw new Error('Empty file');
    var headers = splitCsvLine(lines[0]);
    var rows = lines.slice(1).map(function (line) {
      var cells = splitCsvLine(line);
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = cells[i] != null ? cells[i] : ''; });
      return obj;
    });
    state.columns = headers;
    state.rows    = rows;
  }

  function splitCsvLine(line) {
    var result = [], current = '', inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  }

  function parseXlsx(arrayBuffer) {
    if (typeof XLSX === 'undefined') throw new Error('XLSX library not loaded. Add SheetJS to your HTML.');
    var wb = XLSX.read(arrayBuffer, { type: 'array' });
    var sheet = wb.Sheets[wb.SheetNames[0]];
    var json  = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!json.length) throw new Error('No data found in sheet');
    state.columns = Object.keys(json[0]);
    state.rows    = json;
  }

  function showLoaded() {
    TGE.el('mm-loaded').style.display = '';
    TGE.el('mm-file-summary').textContent = state.fileName + ' — ' + state.rows.length + ' row' + (state.rows.length !== 1 ? 's' : '') + ', ' + state.columns.length + ' columns';
    renderPreviewTable();
    renderSelectTable();
  }

  function renderPreviewTable() {
    var table = TGE.el('mm-preview-table');
    if (!table) return;
    table.innerHTML =
      '<thead><tr>' + state.columns.map(function (c) {
        return '<th style="text-align:left;padding:8px;background:var(--surface-2);border-bottom:2px solid var(--line);white-space:nowrap;">' + escapeHtml(c) + '</th>';
      }).join('') + '</tr></thead>' +
      '<tbody>' + state.rows.slice(0, 50).map(function (row) {
        return '<tr>' + state.columns.map(function (c) {
          return '<td style="padding:6px 8px;border-bottom:1px solid var(--line-2);white-space:nowrap;">' + escapeHtml(String(row[c] != null ? row[c] : '')) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody>';
  }

  function renderSelectTable() {
    var table = TGE.el('mm-select-table');
    if (!table) return;
    var displayCol = state.columns.find(function (c) { return /name/i.test(c);        }) || state.columns[0];
    var emailCol   = state.columns.find(function (c) { return /email|to/i.test(c);    }) || state.columns[1] || state.columns[0];

    table.innerHTML =
      '<thead><tr>' +
        '<th style="padding:8px;width:32px;"><input type="checkbox" id="mm-check-all" style="width:15px;height:15px;cursor:pointer;" /></th>' +
        '<th style="text-align:left;padding:8px;font-size:11px;color:var(--muted);text-transform:uppercase;">' + escapeHtml(displayCol) + '</th>' +
        '<th style="text-align:left;padding:8px;font-size:11px;color:var(--muted);text-transform:uppercase;">' + escapeHtml(emailCol)   + '</th>' +
      '</tr></thead>' +
      '<tbody>' + state.rows.map(function (row, idx) {
        return '<tr style="border-bottom:1px solid var(--line-2);">' +
          '<td style="padding:6px 8px;"><input type="checkbox" class="mm-row-check" data-row="' + idx + '" style="width:15px;height:15px;cursor:pointer;" /></td>' +
          '<td style="padding:6px 8px;font-size:12px;">'                              + escapeHtml(String(row[displayCol] || '')) + '</td>' +
          '<td style="padding:6px 8px;font-size:12px;color:var(--muted);">' + escapeHtml(String(row[emailCol]   || '')) + '</td>' +
        '</tr>';
      }).join('') + '</tbody>';

    var checkAll = TGE.el('mm-check-all');
    if (checkAll) checkAll.onchange = function () {
      document.querySelectorAll('.mm-row-check').forEach(function (cb) { cb.checked = checkAll.checked; });
      updateSelectCount();
    };
    table.querySelectorAll('.mm-row-check').forEach(function (cb) { cb.onchange = updateSelectCount; });
  }

  function updateSelectCount() {
    var count = document.querySelectorAll('.mm-row-check:checked').length;
    var el = TGE.el('mm-select-count');
    if (el) el.textContent = count + ' selected';
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }

  function resetState() {
    state.columns  = [];
    state.rows     = [];
    state.fileName = '';
    TGE.el('mm-loaded').style.display = 'none';
    var fileInput = TGE.el('mm-file-input');
    if (fileInput) fileInput.value = '';
  }

  function openComposer() {
    var checked = Array.prototype.slice.call(document.querySelectorAll('.mm-row-check:checked'));
    if (!checked.length) { alert('Select at least one row first.'); return; }
    var rows = checked.map(function (cb) { return state.rows[parseInt(cb.dataset.row, 10)]; });
    var fields = state.columns.map(function (c) { return { key: sanitizeKey(c), label: c }; });
    var mergeRows = rows.map(function (row) {
      var obj = {};
      state.columns.forEach(function (c) { obj[sanitizeKey(c)] = row[c]; });
      return obj;
    });
    TGE.openEmailComposer({ rows: mergeRows, fields: fields, imagesField: null, onSent: function () {} });
  }

  function sanitizeKey(s) {
    return String(s).replace(/[^a-zA-Z0-9_]/g, '_');
  }

  // ── Register ──────────────────────────────────────────────────────────────────
  TGE.onShow['merge-mail'] = render;   // ← fixed: was function(){}

})();
