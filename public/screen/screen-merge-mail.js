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
    sheetName: '',
    // Attachment settings chosen in the composer. Cleared on each new file.
    att: null,
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
                 '<div class="card" style="display:none;margin-top:14px;background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:16px;">',
          '<div class="card-kicker">PDF Header</div>',
          '<div class="card-title" style="margin-bottom:12px;">Configure PDF Attachment Header</div>',
          '<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;">',
            '<div>',
              '<label style="display:block;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:5px;">Title Field</label>',
              '<select id="mm-pdf-title" style="width:100%;height:36px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font-size:13px;background:var(--surface);color:var(--ink);">',
                '<option value="">— None (use filename) —</option>',
              '</select>',
            '</div>',
            '<div>',
              '<label style="display:block;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:5px;">Subtitle Field</label>',
              '<select id="mm-pdf-subtitle" style="width:100%;height:36px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font-size:13px;background:var(--surface);color:var(--ink);">',
                '<option value="">— None —</option>',
              '</select>',
            '</div>',
            '<div>',
              '<label style="display:block;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:5px;">Today\'s Date</label>',
              '<label style="display:flex;align-items:center;gap:8px;height:36px;font-size:13px;cursor:pointer;">',
                '<input type="checkbox" id="mm-pdf-date" checked style="width:16px;height:16px;" />',
                'Include in header',
              '</label>',
            '</div>',
          '</div>',
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
    state.sheetName = file.name.replace(/\.[^.]+$/, '');
    state.att = null;
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
    var wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    var sheet = wb.Sheets[wb.SheetNames[0]];
    var json  = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!json.length) throw new Error('No data found in sheet');
    state.sheetName = wb.SheetNames[0] || state.sheetName;
    // Excel dates arrive as dates; show them as dd/mm/yyyy (plus time if any)
    json.forEach(function (row) {
      Object.keys(row).forEach(function (k) {
        if (row[k] instanceof Date) row[k] = formatDate(row[k]);
      });
    });
    state.columns = Object.keys(json[0]);
    state.rows    = json;
  }

function showLoaded() {
    TGE.el('mm-loaded').style.display = '';
    TGE.el('mm-file-summary').textContent = state.fileName + ' — ' + state.rows.length + ' row' + (state.rows.length !== 1 ? 's' : '') + ', ' + state.columns.length + ' columns';
    renderPreviewTable();
    renderSelectTable();
    populatePdfHeaderDropdowns();
  }

  function populatePdfHeaderDropdowns() {
    var titleSel    = TGE.el('mm-pdf-title');
    var subtitleSel = TGE.el('mm-pdf-subtitle');
    if (!titleSel || !subtitleSel) return;
    var options = '<option value="">— None —</option>' +
      state.columns.map(function(c) {
        return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
      }).join('');
    titleSel.innerHTML    = '<option value="">— None (use filename) —</option>' + state.columns.map(function(c) {
      return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
    }).join('');
    subtitleSel.innerHTML = options;

    // Auto-detect common field names
    state.columns.forEach(function(c) {
      var cl = c.toLowerCase();
      if (/fleet|name/.test(cl) && !titleSel.value)    titleSel.value    = c;
      if (/imei|serial|device/.test(cl) && !subtitleSel.value) subtitleSel.value = c;
    });
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

    var fileName      = state.fileName.replace(/\.[^.]+$/, '') || 'Merge Mail';
    if (!state.att) state.att = defaultAttachmentSettings();

    var rows = checked.map(function(cb) { return state.rows[parseInt(cb.dataset.row, 10)]; });
    var fields = state.columns.map(function(c) { return { key: sanitizeKey(c), label: c }; });
    var mergeRows = rows.map(function(row) {
      var obj = {};
      state.columns.forEach(function(c) { obj[sanitizeKey(c)] = row[c]; });
      return obj;
    });

    TGE.openEmailComposer({
      rows: mergeRows,
      fields: fields,
      imagesField: null,
      // One PDF table holding the rows of this email (one row, a group, or
      // all of them), with only the ticked columns. Its header also names the file.
      attachmentBuilder: async function(selectedRows, ctx) {
        if (!selectedRows || !selectedRows.length) return null;
        var att = state.att;
        var columns = state.columns.filter(function(c) { return att.cols[c] !== false; });
        if (!columns.length) throw new Error('Tick at least one column to include in the PDF.');
        // Map sanitized keys back to original column names
        var rawRows = selectedRows.map(function(r) {
          var raw = {};
          columns.forEach(function(c) { raw[c] = r[sanitizeKey(c)]; });
          return raw;
        });
        var first = selectedRows[0];
        function colValue(c) { var v = first[sanitizeKey(c)]; return v == null ? '' : String(v).trim(); }
        var title, subtitle = '';
        if (ctx && ctx.mode === 'grouped') {
          var groupValue = ctx.groupValue || '(blank)';
          title = att.groupHeader === 'sheet' ? state.sheetName
                : att.groupHeader === 'group' ? groupValue
                : state.sheetName + ' - ' + groupValue;
        } else {
          var m = ctx && ctx.mode === 'combined' ? 'combined' : 'individual';
          title = att[m].title === SHEET ? state.sheetName : (colValue(att[m].title) || state.sheetName);
          subtitle = att[m].subtitle ? colValue(att[m].subtitle) : '';
        }
        var resp = await TGE.api('POST', '/api/merge-mail-pdf', {
          rows: rawRows,
          columns: columns,
          title: title || fileName,
          subtitle: subtitle,
          includeDate: att.includeDate,
          fileName: fileName,
        });
        if (!resp.ok || !resp.data || !resp.data.base64) {
          throw new Error((resp.data && resp.data.error) || 'PDF generation failed.');
        }
        return { base64: resp.data.base64, name: resp.data.fileName };
      },
      attachmentLabel:  'Attach PDF',
      attachByDefault:  true,
      allowGrouping:    true,
      renderExtra:      renderAttachmentSettings,
      onSent: function() {}
    });
  }

    // ── Attachment settings (drawn inside the composer) ──────────────────────────
  var SHEET = '__sheet__';

  function defaultAttachmentSettings() {
    var title = '', subtitle = '';
    state.columns.forEach(function(c) {
      var cl = c.toLowerCase();
      if (/fleet|name/.test(cl) && !title)            title = c;
      if (/imei|serial|device/.test(cl) && !subtitle) subtitle = c;
    });
    var cols = {};
    state.columns.forEach(function(c) { cols[c] = true; });
    return {
      individual:  { title: title || SHEET, subtitle: subtitle },
      combined:    { title: SHEET, subtitle: '' },
      groupHeader: 'both',
      includeDate: true,
      cols: cols,
    };
  }

  // Inputs are built with createElement so they keep their values when the
  // composer redraws this section (it does so on mode and group changes).
  function renderAttachmentSettings(el, ctx) {
    var att = state.att;
    if (!att) return;
    el.innerHTML = '';
    el.style.cssText = 'background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:10px;';

    var labelCss = 'font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;';
    var selectCss = 'height:30px;border:1px solid var(--line);border-radius:6px;font-size:12px;padding:0 6px;background:var(--surface);color:var(--ink);';

    function add(parent, tag, css, text) {
      var n = document.createElement(tag);
      if (css) n.style.cssText = css;
      if (text != null) n.textContent = text;
      parent.appendChild(n);
      return n;
    }
    function select(parent, options, value, onChange) {
      var sel = add(parent, 'select', selectCss);
      options.forEach(function(o) {
        var opt = add(sel, 'option', '', o[1]);
        opt.value = o[0];
      });
      sel.value = value;
      sel.onchange = function() { onChange(sel.value); };
      return sel;
    }
    function checkbox(parent, text, checked, onChange) {
      var lab = add(parent, 'label', 'display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = checked;
      cb.onchange = function() { onChange(cb.checked); };
      lab.appendChild(cb);
      add(lab, 'span', '', text);
      return cb;
    }

    // Header row: what the PDF title (and file name) is built from
    var head = add(el, 'div', 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;');
    add(head, 'span', labelCss, 'PDF header:');
    var colOptions = state.columns.map(function(c) { return [c, c]; });
    if (ctx.mode === 'grouped') {
      select(head, [['sheet', 'Sheet name'], ['group', 'Group value'], ['both', 'Sheet name + group value']],
        att.groupHeader, function(v) { att.groupHeader = v; });
    } else {
      var m = ctx.mode === 'combined' ? 'combined' : 'individual';
      add(head, 'span', 'font-size:12px;color:var(--muted);', 'Title');
      select(head, [[SHEET, 'Sheet name']].concat(colOptions), att[m].title, function(v) { att[m].title = v; });
      add(head, 'span', 'font-size:12px;color:var(--muted);', 'Subtitle');
      select(head, [['', '— None —']].concat(colOptions), att[m].subtitle, function(v) { att[m].subtitle = v; });
    }
    checkbox(head, "Today's date", att.includeDate, function(v) { att.includeDate = v; });

    // Column ticks: only ticked columns go into the PDF
    var colHead = add(el, 'div', 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;');
    add(colHead, 'span', labelCss, 'Columns in PDF:');
    var count = add(colHead, 'span', 'font-size:12px;color:var(--muted);');
    var allBtn  = add(colHead, 'button', 'height:24px;font-size:11px;', 'All');
    var noneBtn = add(colHead, 'button', 'height:24px;font-size:11px;', 'None');
    allBtn.type = noneBtn.type = 'button';
    allBtn.className = noneBtn.className = 'btn';

    var list = add(el, 'div', 'display:flex;flex-wrap:wrap;gap:4px 14px;max-height:110px;overflow-y:auto;');
    var boxes = [];
    function updateCount() {
      var n = state.columns.filter(function(c) { return att.cols[c] !== false; }).length;
      count.textContent = n + ' of ' + state.columns.length + ' ticked';
    }
    state.columns.forEach(function(c) {
      boxes.push(checkbox(list, c, att.cols[c] !== false, function(v) { att.cols[c] = v; updateCount(); }));
    });
    function setAll(v) {
      state.columns.forEach(function(c, i) { att.cols[c] = v; boxes[i].checked = v; });
      updateCount();
    }
    allBtn.onclick  = function() { setAll(true); };
    noneBtn.onclick = function() { setAll(false); };
    updateCount();
  }

  function formatDate(d) {
    // Round to the minute; dates read from Excel can be a few seconds off
    var t = new Date(Math.round(d.getTime() / 60000) * 60000);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    var text = p(t.getDate()) + '/' + p(t.getMonth() + 1) + '/' + t.getFullYear();
    if (t.getHours() || t.getMinutes()) text += ' ' + p(t.getHours()) + ':' + p(t.getMinutes());
    return text;
  }

  function sanitizeKey(s) {
    return String(s).replace(/[^a-zA-Z0-9_]/g, '_');
  }

  // ── Register ──────────────────────────────────────────────────────────────────
  TGE.onShow['merge-mail'] = render;   // ← fixed: was function(){}

})();
