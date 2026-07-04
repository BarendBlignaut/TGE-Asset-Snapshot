// TGE Asset Snapshot — Platform Control Tables
// public/platform/platform-control-tables.js
//
// Vendor-scoped Control Tables: list + editor reproducing the admin
// Control Tables tab's functionality. Hardware assignment is free-text
// match rows (replacing the admin tab's hardcoded checkboxes — no
// hardware name is ever hardcoded). Saves carry vendorId so every
// table created here belongs to its vendor.

(function () {
  'use strict';

  var COLOURS = ['green', 'lime', 'amber', 'red', 'gray'];

  var state = {
    vendorId: null,
    container: null,
    tables: [],
    editing: null,   // normalised table being edited, or {} for create
  };

  function render(options) {
    options = options || {};
    state.vendorId  = options.vendorId || null;
    state.container = options.container || null;
    if (!state.container) return;

    var canManage = TGE.can('vendor', 'manage');

    state.container.innerHTML = [
      '<div class="card">',
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">',
          '<div>',
            '<div class="card-kicker">Vendor Platform</div>',
            '<div class="card-title">Control Tables</div>',
            '<p style="font-size:13px;color:var(--muted);margin:4px 0 0;">Define which field is evaluated, which output field is populated, and the rules that create the result.</p>',
          '</div>',
          canManage ? '<button class="btn btn-primary" type="button" onclick="TGE.Platform.ControlTables.create()">+ Create Control Table</button>' : '',
        '</div>',
      '</div>',
      '<div id="vendor-ct-list"></div>',
      '<div id="vendor-ct-editor" style="display:none;"></div>',
    ].join('');

    loadTables();
  }

  async function loadTables() {
    var listEl = TGE.el('vendor-ct-list');
    if (listEl) listEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px;">Loading control tables...</div>';

    var res = await TGE.api('GET', '/api/vendors/' + state.vendorId + '/control-tables');
    if (!res.ok) {
      if (listEl) listEl.innerHTML = '<div class="card" style="color:var(--danger);font-size:13px;">' + escCt((res.data && res.data.error) || 'Could not load control tables.') + '</div>';
      return;
    }

    var rules    = res.data.rules    || [];
    var hardware = res.data.hardware || [];

    state.tables = (res.data.tables || []).map(function (t) {
      return {
        id:          t.id,
        name:        t.name,
        feature:     t.feature,
        outputField: t.output_field,
        valueSource: t.value_source,
        notes:       t.notes || '',
        active:      t.active === 1 || t.active === true,
        hardware:    hardware.filter(function (h) { return h.control_table_id === t.id; })
                             .map(function (h) { return h.hardware_match; }),
        rules:       rules.filter(function (r) { return r.control_table_id === t.id; })
                          .map(function (r) {
                            return { minValue: r.min_value, maxValue: r.max_value, outputValue: r.output_value, outputColour: r.output_colour || 'gray' };
                          }),
      };
    });

    renderList();
  }

  function renderList() {
    var el = TGE.el('vendor-ct-list');
    if (!el) return;

    if (!state.tables.length) {
      el.innerHTML = [
        '<div style="text-align:center;color:var(--muted);padding:32px 16px;background:var(--surface-2);border:1px dashed var(--line);border-radius:10px;">',
          '<div style="font-size:28px;margin-bottom:8px;opacity:0.35;">⚙️</div>',
          '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">No control tables defined yet</div>',
          '<p style="font-size:12px;margin:0;">Create the first control table for this vendor.</p>',
        '</div>'
      ].join('');
      return;
    }

    var canManage = TGE.can('vendor', 'manage');

    el.innerHTML = state.tables.map(function (t) {
      return [
        '<div class="card" style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;' + (t.active ? '' : 'opacity:0.55;') + '">',
          '<div>',
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">',
              '<span style="background:var(--ink);color:var(--yellow);padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;font-family:monospace;">CT-' + String(t.id).padStart(3, '0') + '</span>',
              '<div style="font-size:13px;font-weight:700;color:var(--ink);">' + escCt(t.name) + '</div>',
              '<span class="badge badge-green" style="font-size:10px;">' + escCt(t.feature) + '</span>',
            '</div>',
            '<div style="font-size:11px;color:var(--muted);margin-top:4px;">',
              'Evaluates <code>' + escCt(t.valueSource) + '</code> → <code>' + escCt(t.outputField) + '</code>',
              ' · ' + t.rules.length + ' rule' + (t.rules.length !== 1 ? 's' : ''),
              ' · ' + t.hardware.length + ' hardware match' + (t.hardware.length !== 1 ? 'es' : ''),
            '</div>',
          '</div>',
          canManage ? '<button class="btn" type="button" style="height:28px;font-size:11px;" onclick="TGE.Platform.ControlTables.edit(' + t.id + ')">Edit</button>' : '<span></span>',
        '</div>'
      ].join('');
    }).join('');
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  function openEditor(table) {
    state.editing = table || {};
    var editor = TGE.el('vendor-ct-editor');
    if (!editor) return;

    var t = state.editing;
    var isNew = !t.id;

    editor.innerHTML = [
      '<div class="card">',
        '<div class="card-kicker">' + (isNew ? 'Control Table' : 'Edit Control Table') + '</div>',
        '<div class="card-title">' + (isNew ? 'Create Control Table' : 'CT-' + String(t.id).padStart(3, '0') + ' — ' + escCt(t.name)) + '</div>',
        '<p style="font-size:13px;color:var(--muted);margin:6px 0 16px;">Define which field is evaluated, which output field is populated, and the rules used to create the result.</p>',

        '<div class="data-grid data-grid-2">',
          '<div class="field"><label>Table Name</label><input id="vct-name" type="text" placeholder="Oyster Battery Status" value="' + escCt(t.name || '') + '"></div>',
          '<div class="field"><label>Feature</label><input id="vct-feature" type="text" placeholder="asset-track" value="' + escCt(t.feature || '') + '"></div>',
          '<div class="field"><label>Output Field</label><input id="vct-output" type="text" placeholder="battStatus" value="' + escCt(t.outputField || '') + '"></div>',
          '<div class="field"><label>Evaluate Field</label><input id="vct-source" type="text" placeholder="battCurrent" value="' + escCt(t.valueSource || '') + '"></div>',
        '</div>',

        '<div style="margin-top:16px;">',
          '<div class="card-kicker">Assigned Hardware (match text)</div>',
          '<div id="vct-hardware-rows" style="margin-top:8px;"></div>',
          '<button class="btn" type="button" style="margin-top:8px;" onclick="TGE.Platform.ControlTables.addHardwareRow()">+ Add Hardware Match</button>',
        '</div>',

        '<div style="margin-top:18px;">',
          '<div class="card-kicker">Rules</div>',
          '<div class="table-wrap" style="margin-top:8px;">',
            '<table>',
              '<thead><tr><th>Min</th><th>Max</th><th>Output</th><th>Colour</th><th></th></tr></thead>',
              '<tbody id="vct-rule-body"></tbody>',
            '</table>',
          '</div>',
          '<button class="btn" type="button" style="margin-top:10px;" onclick="TGE.Platform.ControlTables.addRuleRow()">+ Add Rule</button>',
        '</div>',

        '<div style="display:flex;gap:8px;align-items:center;margin-top:18px;">',
          '<button class="btn btn-primary" type="button" onclick="TGE.Platform.ControlTables.save()">Save Control Table</button>',
          '<button class="btn" type="button" onclick="TGE.Platform.ControlTables.cancel()">Cancel</button>',
          '<p id="vct-message" style="margin:0;font-size:12px;"></p>',
        '</div>',
      '</div>'
    ].join('');

    editor.style.display = '';

    // Seed rows
    var hw = (t.hardware && t.hardware.length) ? t.hardware : [''];
    hw.forEach(function (h) { addHardwareRow(h); });

    var rules = (t.rules && t.rules.length) ? t.rules : [{ minValue: '', maxValue: '', outputValue: '', outputColour: 'green' }];
    rules.forEach(function (r) { addRuleRow(r); });

    editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function addHardwareRow(value) {
    var wrap = TGE.el('vct-hardware-rows');
    if (!wrap) return;
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px;';
    row.innerHTML =
      '<input class="vct-hardware" type="text" placeholder="e.g. oyster" value="' + escCt(typeof value === 'string' ? value : '') + '" style="flex:1;height:34px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font-size:13px;background:var(--surface);color:var(--ink);">' +
      '<button class="btn" type="button" style="height:28px;font-size:11px;padding:0 8px;">✕</button>';
    row.querySelector('button').onclick = function () { row.remove(); };
    wrap.appendChild(row);
  }

  function addRuleRow(rule) {
    var tbody = TGE.el('vct-rule-body');
    if (!tbody) return;
    rule = rule || {};
    var colour = rule.outputColour || 'green';
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input class="vct-rule-min" type="number" step="0.01" placeholder="5.20" value="' + escCt(rule.minValue != null ? rule.minValue : '') + '"></td>' +
      '<td><input class="vct-rule-max" type="number" step="0.01" placeholder="99.00" value="' + escCt(rule.maxValue != null ? rule.maxValue : '') + '"></td>' +
      '<td><input class="vct-rule-output" type="text" placeholder="Fresh" value="' + escCt(rule.outputValue || '') + '"></td>' +
      '<td><select class="vct-rule-colour">' + COLOURS.map(function (c) {
        return '<option value="' + c + '"' + (colour === c ? ' selected' : '') + '>' + c.charAt(0).toUpperCase() + c.slice(1) + '</option>';
      }).join('') + '</select></td>' +
      '<td><button class="btn" type="button" style="height:26px;font-size:11px;padding:0 8px;">✕</button></td>';
    tr.querySelector('button').onclick = function () { tr.remove(); };
    tbody.appendChild(tr);
  }

  async function save() {
    var msg = TGE.el('vct-message');
    var setMsg = function (text, isError) {
      if (!msg) return;
      msg.textContent = text;
      msg.style.color = isError ? 'var(--danger)' : 'var(--muted)';
    };

    var hardware = Array.prototype.slice.call(document.querySelectorAll('.vct-hardware'))
      .map(function (i) { return i.value.trim(); })
      .filter(function (v) { return v.length; });

    var rules = Array.prototype.slice.call(document.querySelectorAll('#vct-rule-body tr'))
      .map(function (tr) {
        return {
          minValue:     tr.querySelector('.vct-rule-min').value,
          maxValue:     tr.querySelector('.vct-rule-max').value,
          outputValue:  tr.querySelector('.vct-rule-output').value.trim(),
          outputColour: tr.querySelector('.vct-rule-colour').value,
        };
      })
      .filter(function (r) { return r.minValue !== '' || r.maxValue !== '' || r.outputValue !== ''; });

    var payload = {
      id:          state.editing && state.editing.id ? state.editing.id : null,
      name:        (TGE.el('vct-name')    || {}).value ? TGE.el('vct-name').value.trim()    : '',
      feature:     (TGE.el('vct-feature') || {}).value ? TGE.el('vct-feature').value.trim() : '',
      outputField: (TGE.el('vct-output')  || {}).value ? TGE.el('vct-output').value.trim()  : '',
      valueSource: (TGE.el('vct-source')  || {}).value ? TGE.el('vct-source').value.trim()  : '',
      hardware:    hardware,
      rules:       rules,
      vendorId:    state.vendorId,
      active:      true,
    };

    if (!payload.name || !payload.feature || !payload.outputField || !payload.valueSource) {
      setMsg('Table name, feature, output field and evaluate field are required.', true);
      return;
    }
    if (!hardware.length) { setMsg('At least one hardware match is required.', true); return; }
    if (!rules.length)    { setMsg('At least one rule is required.', true); return; }

    setMsg('Saving...');
    var res = await TGE.api('POST', '/api/admin/control-tables', payload);
    if (!res.ok) { setMsg((res.data && res.data.error) || 'Save failed.', true); return; }

    cancel();
    loadTables();
  }

  function cancel() {
    var editor = TGE.el('vendor-ct-editor');
    if (editor) { editor.style.display = 'none'; editor.innerHTML = ''; }
    state.editing = null;
  }

  function escCt(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.TGE = window.TGE || {};
  TGE.Platform = TGE.Platform || {};

  TGE.Platform.ControlTables = {
    render: render,
    create: function () { openEditor({}); },
    edit:   function (id) {
      var t = state.tables.find(function (x) { return x.id === id; });
      if (t) openEditor(t);
    },
    addHardwareRow: function () { addHardwareRow(''); },
    addRuleRow:     function () { addRuleRow(); },
    save:   save,
    cancel: cancel,
  };

})();
