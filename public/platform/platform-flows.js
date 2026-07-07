// TGE Asset Snapshot — Platform Flows
// public/platform/platform-flows.js
//
// Vendor-scoped Flows: a flow is a named, ordered run-and-validate
// sequence assigned to the screen it feeds (Operations/Camera screens,
// derived live from the nav — never hardcoded). Steps reference this
// vendor's API Definitions, Control Tables, or Hardware Types.
// Definition only — execution arrives with the flow engine.

(function () {
  'use strict';

var STEP_ROLES = {
    api_definition: [
      { key: 'seed',   label: 'Seed — creates the population' },
      { key: 'join',   label: 'Join — merge & prune on Asset ID' },
      { key: 'enrich', label: 'Enrich — add data, never prune' },
    ],
    hardware_set: [
      { key: 'filter',   label: 'Filter — keep matching assets' },
      { key: 'annotate', label: 'Annotate — attach, never prune' },
    ],
    hardware_type: [
      { key: 'filter',   label: 'Filter — keep matching assets' },
      { key: 'annotate', label: 'Annotate — attach, never prune' },
    ],
    control_table: [
      { key: 'grade', label: 'Grade — apply rules to output field' },
    ],
  };

  var STEP_TYPES = [
    { key: 'api_definition', label: 'API Definition' },
    { key: 'control_table',  label: 'Control Table' },
    { key: 'hardware_type',  label: 'Hardware Type' },
    { key: 'hardware_set',   label: 'Hardware Set' },
  ];

  var state = {
    vendorId: null,
    container: null,
    flows: [],           // normalised flows with steps[]
    refs: { apis: [], controlTables: [], hardware: [] },
    editing: null,
    editingSteps: [],
    saving: false,
  };

  // ── Screen targets: derived from the nav, Operations + Camera groups ──────
  function screenTargets() {
    var items = document.querySelectorAll('#children-operations .nav-item[data-view], #children-camera .nav-item[data-view]');
    return Array.prototype.slice.call(items).map(function (i) {
      return { view: i.dataset.view, title: i.dataset.title || i.dataset.view };
    });
  }

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
            '<div class="card-title">Flows</div>',
            '<p style="font-size:13px;color:var(--muted);margin:4px 0 0;">Chain this vendor\u2019s APIs, control tables and hardware types into an ordered sequence, assigned to the screen it feeds.</p>',
          '</div>',
          canManage ? '<button class="btn btn-primary" type="button" onclick="TGE.Platform.Flows.create()">+ Create Flow</button>' : '',
        '</div>',
      '</div>',
      '<div id="vendor-flows-list"></div>',
      '<div id="vendor-flow-editor" style="display:none;"></div>',
    ].join('');

    loadAll();
  }

  async function loadAll() {
    var listEl = TGE.el('vendor-flows-list');
    if (listEl) listEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px;">Loading flows...</div>';

    var base = '/api/vendors/' + state.vendorId;
    var results = await Promise.all([
      TGE.api('GET', base + '/flows'),
      TGE.api('GET', base + '/apis?all=1'),
      TGE.api('GET', base + '/control-tables'),
      TGE.api('GET', base + '/hardware-types'),
    ]);

    var flowsRes = results[0];
    if (!flowsRes.ok) {
      if (listEl) listEl.innerHTML = '<div class="card" style="color:var(--danger);font-size:13px;">' + esc((flowsRes.data && flowsRes.data.error) || 'Could not load flows.') + '</div>';
      return;
    }

    // Reference data for step dropdowns (tolerant of raw row shape)
    state.refs.apis = ((results[1].ok && results[1].data.apis) || []).map(function (a) {
      return { ref: String(a.api_id || a.apiId || ''), label: String(a.api_id || a.apiId || '') + ' \u2014 ' + (a.label || '') };
    });
    state.refs.controlTables = ((results[2].ok && results[2].data.tables) || []).map(function (t) {
      return { ref: String(t.id), label: 'CT-' + String(t.id).padStart(3, '0') + ' \u2014 ' + (t.name || '') };
    });
var hwRows = (results[3].ok && results[3].data.hardware) || [];
    state.refs.hardware = hwRows.map(function (h) {
      return { ref: String(h.id), label: (h.name || h.code || 'Hardware #' + h.id) };
    });
    var setCounts = {};
    hwRows.forEach(function (h) {
      if (h.applies_to_feature) setCounts[h.applies_to_feature] = (setCounts[h.applies_to_feature] || 0) + 1;
    });
    state.refs.hardwareSets = Object.keys(setCounts).map(function (tag) {
      return { ref: tag, label: tag + ' (' + setCounts[tag] + ' hardware type' + (setCounts[tag] !== 1 ? 's' : '') + ')' };
    });

    var steps = flowsRes.data.steps || [];
    state.flows = (flowsRes.data.flows || []).map(function (f) {
      return {
        id:        f.id,
        name:      f.name,
        moduleTag: f.module_tag,
        notes:     f.notes || '',
        active:    f.active === 1 || f.active === true,
        steps:     steps.filter(function (s) { return s.flow_id === f.id; })
                        .map(function (s) { return { stepType: s.step_type, stepRef: String(s.step_ref) }; }),
      };
    });

    renderList();
  }

  function refListFor(stepType) {
    if (stepType === 'api_definition') return state.refs.apis;
    if (stepType === 'control_table')  return state.refs.controlTables;
 if (stepType === 'hardware_type')  return state.refs.hardware;
    if (stepType === 'hardware_set')   return state.refs.hardwareSets || [];
    return [];
  }

  function refLabel(step) {
    var match = refListFor(step.stepType).find(function (r) { return r.ref === step.stepRef; });
    return match ? match.label : step.stepRef;
  }

  function stepTypeLabel(key) {
    var t = STEP_TYPES.find(function (x) { return x.key === key; });
    return t ? t.label : key;
  }

  function renderList() {
    var el = TGE.el('vendor-flows-list');
    if (!el) return;

    if (!state.flows.length) {
      el.innerHTML = [
        '<div style="text-align:center;color:var(--muted);padding:32px 16px;background:var(--surface-2);border:1px dashed var(--line);border-radius:10px;">',
          '<div style="font-size:28px;margin-bottom:8px;opacity:0.35;">\u26A1</div>',
          '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">No flows defined yet</div>',
          '<p style="font-size:12px;margin:0;">Build this vendor\u2019s data sets first, then chain them into flows here.</p>',
        '</div>'
      ].join('');
      return;
    }

    var canManage = TGE.can('vendor', 'manage');
    var screens = screenTargets();

    el.innerHTML = state.flows.map(function (f) {
      var screen = screens.find(function (s) { return s.view === f.moduleTag; });
      var chain = f.steps.map(function (s) { return esc(refLabel(s)); }).join(' \u2192 ');
      return [
        '<div class="card" style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;' + (f.active ? '' : 'opacity:0.55;') + '">',
          '<div>',
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">',
              '<div style="font-size:13px;font-weight:700;color:var(--ink);">' + esc(f.name) + '</div>',
              '<span class="badge badge-yellow" style="font-size:10px;">feeds: ' + esc(screen ? screen.title : f.moduleTag) + '</span>',
              '<span class="badge badge-gray" style="font-size:10px;">' + f.steps.length + ' step' + (f.steps.length !== 1 ? 's' : '') + '</span>',
            '</div>',
            '<div style="font-size:11px;color:var(--muted);margin-top:4px;overflow:hidden;text-overflow:ellipsis;">' + (chain || '\u2014') + '</div>',
          '</div>',
          canManage ? '<button class="btn" type="button" style="height:28px;font-size:11px;" onclick="TGE.Platform.Flows.edit(' + f.id + ')">Edit</button>' : '<span></span>',
        '</div>'
      ].join('');
    }).join('');
  }

  // ── Builder ───────────────────────────────────────────────────────────────
  function openEditor(flow) {
    state.editing = flow || {};
  state.editingSteps = (flow && flow.steps) ? flow.steps.map(function (s) { return { stepType: s.stepType, stepRef: s.stepRef, stepRole: s.stepRole || '' }; }) : [];

    var editor = TGE.el('vendor-flow-editor');
    if (!editor) return;

    var f = state.editing;
    var isNew = !f.id;
    var screens = screenTargets();

    editor.innerHTML = [
      '<div class="card">',
        '<div class="card-kicker">' + (isNew ? 'Flow' : 'Edit Flow') + '</div>',
        '<div class="card-title">' + (isNew ? 'Create Flow' : esc(f.name)) + '</div>',
        '<p style="font-size:13px;color:var(--muted);margin:6px 0 16px;">Steps run in order, top to bottom. Each step references one of this vendor\u2019s defined items.</p>',

        '<div class="data-grid data-grid-2">',
          '<div class="field"><label>Flow Name</label><input id="vfl-name" type="text" placeholder="Asset Track \u2014 Device Data" value="' + esc(f.name || '') + '"></div>',
          '<div class="field"><label>Feeds Screen</label><select id="vfl-module">' +
            '<option value="">Select screen...</option>' +
            screens.map(function (s) {
              return '<option value="' + esc(s.view) + '"' + (f.moduleTag === s.view ? ' selected' : '') + '>' + esc(s.title) + '</option>';
            }).join('') +
          '</select></div>',
        '</div>',
        '<div class="field" style="margin-top:10px;"><label>Notes</label><input id="vfl-notes" type="text" placeholder="Optional" value="' + esc(f.notes || '') + '"></div>',

        '<div style="margin-top:18px;">',
          '<div class="card-kicker">Steps</div>',
          '<div id="vfl-steps" style="margin-top:8px;"></div>',
          '<button class="btn" type="button" style="margin-top:8px;" onclick="TGE.Platform.Flows.addStep()">+ Add Step</button>',
        '</div>',

        '<div style="display:flex;gap:8px;align-items:center;margin-top:18px;">',
          '<button class="btn btn-primary" id="vfl-save-btn" type="button" onclick="TGE.Platform.Flows.save()">Save Flow</button>',
          '<button class="btn" type="button" onclick="TGE.Platform.Flows.cancel()">Cancel</button>',
          '<p id="vfl-message" style="margin:0;font-size:12px;"></p>',
        '</div>',
      '</div>'
    ].join('');

    editor.style.display = '';
    if (!state.editingSteps.length) state.editingSteps.push({ stepType: 'api_definition', stepRef: '' });
    renderSteps();
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderSteps() {
    var wrap = TGE.el('vfl-steps');
    if (!wrap) return;

    wrap.innerHTML = state.editingSteps.map(function (step, idx) {
      var options = refListFor(step.stepType);
      return [
       '<div style="display:grid;grid-template-columns:auto 150px 1fr 230px auto;gap:8px;align-items:center;border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-bottom:6px;background:var(--surface);">',
          '<span style="font-size:11px;font-weight:700;color:var(--muted);width:22px;text-align:center;">' + (idx + 1) + '</span>',
          '<select onchange="TGE.Platform.Flows.setStepType(' + idx + ', this.value)" style="height:32px;">' +
            STEP_TYPES.map(function (t) {
              return '<option value="' + t.key + '"' + (step.stepType === t.key ? ' selected' : '') + '>' + t.label + '</option>';
            }).join('') +
          '</select>',
'<select onchange="TGE.Platform.Flows.setStepRef(' + idx + ', this.value)" style="height:32px;">' +
            '<option value="">' + (options.length ? 'Select item...' : 'None defined for this vendor yet') + '</option>' +
            options.map(function (o) {
              return '<option value="' + esc(o.ref) + '"' + (step.stepRef === o.ref ? ' selected' : '') + '>' + esc(o.label) + '</option>';
            }).join('') +
          '</select>',
          '<select onchange="TGE.Platform.Flows.setStepRole(' + idx + ', this.value)" style="height:32px;">' +
            '<option value="">Role...</option>' +
            (STEP_ROLES[step.stepType] || []).map(function (r) {
              return '<option value="' + r.key + '"' + (step.stepRole === r.key ? ' selected' : '') + '>' + esc(r.label) + '</option>';
            }).join('') +
          '</select>',
          '<div style="display:flex;gap:4px;">',
            '<button class="btn" type="button" style="height:26px;font-size:11px;padding:0 7px;"' + (idx === 0 ? ' disabled' : '') + ' onclick="TGE.Platform.Flows.moveStep(' + idx + ',-1)">\u2191</button>',
            '<button class="btn" type="button" style="height:26px;font-size:11px;padding:0 7px;"' + (idx === state.editingSteps.length - 1 ? ' disabled' : '') + ' onclick="TGE.Platform.Flows.moveStep(' + idx + ',1)">\u2193</button>',
            '<button class="btn" type="button" style="height:26px;font-size:11px;padding:0 7px;" onclick="TGE.Platform.Flows.removeStep(' + idx + ')">\u2715</button>',
          '</div>',
        '</div>'
      ].join('');
    }).join('');
  }

  async function save() {
    if (state.saving) return;
    var msg = TGE.el('vfl-message');
    var setMsg = function (text, isError) {
      if (!msg) return;
      msg.textContent = text;
      msg.style.color = isError ? 'var(--danger)' : 'var(--muted)';
    };

    var name      = (TGE.el('vfl-name')   || {}).value ? TGE.el('vfl-name').value.trim()   : '';
    var moduleTag = (TGE.el('vfl-module') || {}).value || '';
    var notes     = (TGE.el('vfl-notes')  || {}).value ? TGE.el('vfl-notes').value.trim()  : '';
    var steps     = state.editingSteps.filter(function (s) { return s.stepRef; });

    if (!name)         { setMsg('Flow name is required.', true); return; }
    if (!moduleTag)    { setMsg('Select which screen this flow feeds.', true); return; }
    if (!steps.length) { setMsg('Add at least one step and select its item.', true); return; }

    state.saving = true;
    setMsg('Saving...');
    var res = await TGE.api('POST', '/api/vendors/' + state.vendorId + '/flows', {
      id: state.editing && state.editing.id ? state.editing.id : null,
      name: name, moduleTag: moduleTag, notes: notes, steps: steps, active: true,
    });
    state.saving = false;

    if (!res.ok) { setMsg((res.data && res.data.error) || 'Save failed.', true); return; }
    cancel();
    loadAll();
  }

  function cancel() {
    var editor = TGE.el('vendor-flow-editor');
    if (editor) { editor.style.display = 'none'; editor.innerHTML = ''; }
    state.editing = null;
    state.editingSteps = [];
  }

  function esc(value) {
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

  TGE.Platform.Flows = {
    render: render,
    create: function () { openEditor({}); },
    edit:   function (id) {
      var f = state.flows.find(function (x) { return x.id === id; });
      if (f) openEditor(f);
    },
    addStep:    function () { state.editingSteps.push({ stepType: 'api_definition', stepRef: '' }); renderSteps(); },
    removeStep: function (idx) { state.editingSteps.splice(idx, 1); renderSteps(); },
    moveStep:   function (idx, dir) {
      var target = idx + dir;
      if (target < 0 || target >= state.editingSteps.length) return;
      var tmp = state.editingSteps[idx];
      state.editingSteps[idx] = state.editingSteps[target];
      state.editingSteps[target] = tmp;
      renderSteps();
    },
    setStepType: function (idx, type) {
      if (!state.editingSteps[idx]) return;
      state.editingSteps[idx].stepType = type;
      state.editingSteps[idx].stepRef = '';
      renderSteps();
    },
setStepRef: function (idx, ref) {
      if (!state.editingSteps[idx]) return;
      state.editingSteps[idx].stepRef = ref;
    },
    setStepRole: function (idx, role) {
      if (!state.editingSteps[idx]) return;
      state.editingSteps[idx].stepRole = role;
    },
    save:   save,
    cancel: cancel,
  };

})();
