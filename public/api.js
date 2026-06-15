// TGE Asset Snapshot — API Registry
// public/api.js

(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────────
  var TAG_USES = [
    { value: 'display',      label: 'Display data',         desc: 'Show on screen or in exports' },
    { value: 'feeds-next',   label: 'Feeds next API call',  desc: 'Pass to the next API step' },
    { value: 'filter-rule',  label: 'Filter / rule only',   desc: 'Used to filter or sort, not displayed' },
    { value: 'internal',     label: 'Internal only',        desc: 'Used internally, never shown' },
    { value: 'match',        label: 'Match / validate',     desc: 'Used to match or validate against another value' },
  ];

  var API_GROUPS  = ['vehicle','device','camera','metrics','auth','other'];
  var API_METHODS = ['GET','POST','PUT','DELETE','PATCH'];

  // ── State ─────────────────────────────────────────────────────────────────────
  var state = {
    apis:          [],
    editingApi:    null,
    panelMode:     null,
    tags:          [],
    saving:        false,
    editingTagIdx: null,
    parsedFields:  [],   // field paths extracted from sample JSON
  };

  var api = TGE.api;

  // ── Helper: custom dropdown ───────────────────────────────────────────────────
  // Renders a <select> with a "+ Custom..." option at the bottom
  // When selected, shows an inline text input
  function customSelect(id, options, currentVal, placeholder) {
    var isCustom = currentVal && !options.find(function(o) {
      return (typeof o === 'string' ? o : o.value) === currentVal;
    });
    var opts = options.map(function(o) {
      var val   = typeof o === 'string' ? o : o.value;
      var label = typeof o === 'string' ? o : (o.label || o.value);
      return '<option value="' + val + '"' + (currentVal === val && !isCustom ? ' selected' : '') + '>' + label + '</option>';
    }).join('');
    opts += '<option value="__custom__"' + (isCustom ? ' selected' : '') + '>+ Custom...</option>';

    return '<div style="display:flex;flex-direction:column;gap:4px;">' +
      '<select id="' + id + '" onchange="TGE.apiHandleCustomSelect(\'' + id + '\')" ' +
        'style="height:38px;border:1px solid var(--line);border-radius:8px;padding:0 10px;font:inherit;color:var(--ink);background:var(--surface);">' +
        (placeholder ? '<option value="">' + placeholder + '</option>' : '') +
        opts +
      '</select>' +
      '<input type="text" id="' + id + '-custom" placeholder="Type custom value..." ' +
        'style="display:' + (isCustom ? 'block' : 'none') + ';height:38px;border:1px solid var(--green-600);border-radius:8px;padding:0 12px;font:inherit;color:var(--ink);background:var(--surface);" ' +
        'value="' + (isCustom ? currentVal : '') + '" />' +
    '</div>';
  }

  TGE.apiHandleCustomSelect = function(id) {
    var sel    = document.getElementById(id);
    var custom = document.getElementById(id + '-custom');
    if (!sel || !custom) return;
    if (sel.value === '__custom__') {
      custom.style.display = 'block';
      custom.focus();
    } else {
      custom.style.display = 'none';
    }
  };

  // Get value from a custom select (handles custom text input)
  function getCustomSelectValue(id) {
    var sel    = document.getElementById(id);
    var custom = document.getElementById(id + '-custom');
    if (!sel) return '';
    if (sel.value === '__custom__') {
      return custom ? custom.value.trim() : '';
    }
    return sel.value;
  }

  // ── Render page ───────────────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-api');
    if (!view) return;

    view.innerHTML = [
      '<div class="hero">',
        '<div class="hero-kicker">Management</div>',
        '<div class="hero-title">API Registry</div>',
        '<div class="hero-bar" style="margin-top:14px;">',
          '<div class="hero-bar-left">',
            '<button class="hero-mode-btn active" id="api-tab-definitions" type="button">API Definitions</button>',
            '<button class="hero-mode-btn" id="api-tab-flows" type="button">Page Flows</button>',
          '</div>',
          '<div class="hero-bar-right">',
            '<div class="hero-divider"></div>',
            '<button class="hero-run-btn" id="api-add-btn" type="button">+ Add API</button>',
            '<button class="hero-export-btn active" id="api-export-btn" type="button">Export JSON</button>',
          '</div>',
        '</div>',
      '</div>',

      '<div id="api-content-definitions"><div id="api-list" style="display:grid;gap:10px;"></div></div>',
      '<div id="api-content-flows" style="display:none;">',
        '<div class="card"><div class="card-kicker">Page Flows</div><div class="card-title">Coming in Phase 2</div>',
        '<p style="font-size:13px;color:var(--muted);">Once your API definitions are complete, use Page Flows to chain APIs and export the full registry as JSON.</p></div>',
      '</div>',

      // Overlay
      '<div id="api-panel-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:200;" onclick="TGE.apiClosePanel()"></div>',

      // Main API panel
      '<div id="api-panel" style="display:none;position:fixed;top:0;right:0;width:min(680px,100vw);height:100vh;background:var(--surface);box-shadow:-4px 0 24px rgba(0,0,0,0.15);z-index:201;flex-direction:column;overflow:hidden;">',
        '<div style="padding:16px 20px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:var(--green-900);">',
          '<div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(212,240,38,0.7);" id="api-panel-kicker">Add API</div>',
          '<h2 style="font-size:15px;font-weight:700;color:#fff;margin:2px 0 0;" id="api-panel-title">New API Definition</h2></div>',
          '<button onclick="TGE.apiClosePanel()" style="width:30px;height:30px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;cursor:pointer;font-size:14px;">✕</button>',
        '</div>',

        '<div style="flex:1;overflow-y:auto;" id="api-panel-body">',

          // ── Section 1 ──
          '<div style="padding:16px 20px;border-bottom:1px solid var(--line);">',
            '<div class="card-kicker" style="margin-bottom:12px;">Section 1 — Basic Info</div>',

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">',
              '<div class="field" style="margin:0;">',
                '<label>API ID</label>',
                '<input id="api-id" type="text" placeholder="e.g. API-1" style="height:38px;" />',
              '</div>',
              '<div class="field" style="margin:0;">',
                '<label>Label / Name</label>',
                '<input id="api-label" type="text" placeholder="e.g. User Login Confirmation" style="height:38px;" />',
              '</div>',
            '</div>',

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">',
              '<div class="field" style="margin:0;">',
                '<label>Group</label>',
                '<div id="api-group-wrap"></div>',
              '</div>',
              '<div class="field" style="margin:0;">',
                '<label>Method</label>',
                '<div id="api-method-wrap"></div>',
              '</div>',
            '</div>',

            '<div class="field" style="margin-bottom:10px;">',
              '<label>URL</label>',
              '<input id="api-url" type="text" placeholder="e.g. /v1/users/?key=<apiKey>&pruning=B2B" style="height:38px;" />',
            '</div>',

            '<div class="field" style="margin:0;">',
              '<label>Notes / Purpose / Gotchas</label>',
              '<textarea id="api-notes" rows="2" placeholder="e.g. Returns all TN360 users. Match username + externalPin for login validation."></textarea>',
            '</div>',
          '</div>',

          // ── Section 2 ──
          '<div style="padding:16px 20px;border-bottom:1px solid var(--line);">',
            '<div class="card-kicker" style="margin-bottom:6px;">Section 2 — Sample Response</div>',
            '<p style="font-size:12px;color:var(--muted);margin-bottom:8px;">Paste a real JSON response from this API. Used to build the field picker in Section 3.</p>',
            '<textarea id="api-sample" rows="6" placeholder=\'[{"id":886814,"username":"bare1234","externalPin":"12345678",...}]\' style="width:100%;font-family:monospace;font-size:11px;border:1px solid var(--line);border-radius:8px;padding:10px;resize:vertical;background:var(--surface);color:var(--ink);"></textarea>',
            '<div style="display:flex;gap:8px;margin-top:8px;">',
              '<button class="btn" style="height:32px;font-size:12px;" onclick="TGE.apiParseSample()">Parse JSON → load field picker</button>',
              '<span id="api-parse-status" style="font-size:12px;color:var(--muted);align-self:center;"></span>',
            '</div>',
          '</div>',

          // ── Section 3 ──
          '<div style="padding:16px 20px;">',
            '<div class="card-kicker" style="margin-bottom:6px;">Section 3 — Field Tags</div>',
            '<p style="font-size:12px;color:var(--muted);margin-bottom:12px;">Define each field from this API — what it is, how it\'s used, and where it lives in the response.</p>',

            // Existing tags
            '<div id="api-tags-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;"></div>',

            // Inline structured tag form
            '<div id="tag-inline-form" style="display:none;background:var(--surface-2);border:1px solid var(--green-600);border-radius:10px;padding:14px;margin-bottom:12px;">',
              '<div style="font-size:12px;font-weight:700;color:var(--green-700);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">',
                '<span id="tag-form-title">Add Field Tag</span>',
                '<button onclick="TGE.apiCloseTagForm()" style="border:none;background:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0;">✕</button>',
              '</div>',

              // Row 1 — Field name
              '<div style="display:grid;grid-template-columns:140px 1fr;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line-2);">',
                '<span style="font-size:12px;font-weight:600;color:var(--ink);">Field Name</span>',
                '<div id="tag-name-wrap"></div>',
              '</div>',

              // Row 2 — Display label
              '<div style="display:grid;grid-template-columns:140px 1fr;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line-2);">',
                '<span style="font-size:12px;font-weight:600;color:var(--ink);">Display As</span>',
                '<input id="tag-label" type="text" placeholder="e.g. TN360 Username" style="height:36px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font:inherit;font-size:13px;color:var(--ink);background:var(--surface);" />',
              '</div>',

              // Row 3 — Use
              '<div style="display:grid;grid-template-columns:140px 1fr;gap:10px;align-items:start;padding:8px 0;border-bottom:1px solid var(--line-2);">',
                '<span style="font-size:12px;font-weight:600;color:var(--ink);padding-top:8px;">This field is used to</span>',
                '<div id="tag-use-wrap"></div>',
              '</div>',

              // Row 4 — Description
              '<div style="display:grid;grid-template-columns:140px 1fr;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line-2);">',
                '<span style="font-size:12px;font-weight:600;color:var(--ink);">Description / Notes</span>',
                '<input id="tag-description" type="text" placeholder="e.g. Matched against app login username for security" style="height:36px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font:inherit;font-size:13px;color:var(--ink);background:var(--surface);" />',
              '</div>',

              // Row 5 — Path
              '<div style="display:grid;grid-template-columns:140px 1fr;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line-2);">',
                '<span style="font-size:12px;font-weight:600;color:var(--ink);">JSON Path</span>',
                '<div style="display:flex;gap:6px;">',
                  '<input id="tag-path" type="text" placeholder="e.g. username" style="flex:1;height:36px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font:inherit;font-size:12px;font-family:monospace;color:var(--ink);background:var(--surface);" />',
                  '<button class="btn" style="height:36px;font-size:11px;white-space:nowrap;flex-shrink:0;" onclick="TGE.apiPickFromSample()">Pick from JSON</button>',
                '</div>',
              '</div>',

              // Row 6 — Example value
              '<div style="display:grid;grid-template-columns:140px 1fr;gap:10px;align-items:start;padding:8px 0;">',
                '<span style="font-size:12px;font-weight:600;color:var(--ink);padding-top:8px;">Example Value</span>',
                '<div>',
                  '<input id="tag-example-value" type="text" placeholder="e.g. bare1234 (auto-filled when picking from JSON)" style="width:100%;height:36px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font:inherit;font-size:12px;color:var(--muted);background:var(--surface-2);" />',
                  '<p style="margin:3px 0 0;font-size:10px;color:var(--muted-2);">Reference only — shows what kind of data this field contains</p>',
                '</div>',
              '</div>',

              '<div style="display:flex;gap:8px;margin-top:10px;">',
                '<button class="btn btn-primary" style="height:34px;font-size:12px;" onclick="TGE.apiSaveTag()">Save Tag</button>',
                '<button class="btn" style="height:34px;font-size:12px;" onclick="TGE.apiSaveTagAndAddAnother()">Save + Add Another</button>',
                '<button class="btn" style="height:34px;font-size:12px;" onclick="TGE.apiCloseTagForm()">Cancel</button>',
              '</div>',
            '</div>',

            '<div id="tag-add-btn-wrap">',
              '<button class="btn btn-primary" style="height:34px;font-size:12px;" onclick="TGE.apiOpenTagForm(null)">+ Add Field Tag</button>',
            '</div>',
          '</div>',

        '</div>',

        '<div style="padding:12px 20px;border-top:1px solid var(--line);display:flex;gap:8px;align-items:center;flex-shrink:0;">',
          '<button class="btn btn-primary" id="api-save-btn" type="button" onclick="TGE.apiSave()">Save API</button>',
          '<button class="btn" type="button" onclick="TGE.apiClosePanel()">Cancel</button>',
          '<p id="api-panel-message" style="margin:0;font-size:12px;"></p>',
        '</div>',
      '</div>',

      // JSON picker overlay
      '<div id="json-picker-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:400;align-items:center;justify-content:center;padding:20px;">',
        '<div style="background:var(--surface);border-radius:14px;padding:20px;width:min(600px,100%);max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.2);">',
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">',
            '<h3 style="margin:0;font-size:14px;font-weight:700;">Pick Field from JSON</h3>',
            '<button onclick="TGE.apiCloseJsonPicker()" style="border:none;background:none;font-size:18px;cursor:pointer;color:var(--muted);">✕</button>',
          '</div>',
          '<p style="font-size:12px;color:var(--muted);margin-bottom:8px;">Click any value to use its path.</p>',
          '<div id="json-picker-tree" style="flex:1;overflow-y:auto;font-family:monospace;font-size:12px;border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--surface-2);max-height:400px;line-height:1.9;"></div>',
        '</div>',
      '</div>',

    ].join('');

    wireTabs();
    TGE.on('api-add-btn',    'click', function() { openPanel('create', null); });
    TGE.on('api-export-btn', 'click', exportJson);

    var jpo = TGE.el('json-picker-overlay');
    if (jpo) jpo.style.display = 'none';

    loadApis();
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────────
  function wireTabs() {
    TGE.on('api-tab-definitions', 'click', function() {
      TGE.el('api-tab-definitions').classList.add('active');
      TGE.el('api-tab-flows').classList.remove('active');
      TGE.el('api-content-definitions').style.display = '';
      TGE.el('api-content-flows').style.display = 'none';
      TGE.el('api-add-btn').style.display = '';
    });
    TGE.on('api-tab-flows', 'click', function() {
      TGE.el('api-tab-flows').classList.add('active');
      TGE.el('api-tab-definitions').classList.remove('active');
      TGE.el('api-content-flows').style.display = '';
      TGE.el('api-content-definitions').style.display = 'none';
      TGE.el('api-add-btn').style.display = 'none';
    });
  }

  // ── Load / render APIs ────────────────────────────────────────────────────────
  async function loadApis() {
    var result = await api('GET', '/api/registry/apis?all=1');
    state.apis = (result.ok && result.data.apis && result.data.apis.length)
      ? result.data.apis : [];
    renderApiList();
  }

  function renderApiList() {
    var list = TGE.el('api-list');
    if (!list) return;
    if (!state.apis.length) {
      list.innerHTML = '<div class="card" style="text-align:center;color:var(--muted);padding:40px;"><div style="font-size:32px;margin-bottom:10px;opacity:0.3;">⚡</div><div style="font-size:14px;font-weight:600;margin-bottom:6px;">No APIs defined yet</div><p style="font-size:13px;margin:0;">Click "+ Add API" to define your first telematics API.</p></div>';
      return;
    }
    var groupColors = { vehicle:'badge-green', device:'badge-yellow', camera:'badge-gray', metrics:'badge-green', auth:'badge-yellow', other:'badge-gray' };
    list.innerHTML = state.apis.map(function(a) {
      var tagCount  = Array.isArray(a.fields) ? a.fields.length : 0;
      var hasSample = a.sampleResponse && a.sampleResponse.length > 10;
      var isActive  = a.active !== false;
      return '<div class="card" style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;' + (isActive?'':'opacity:0.5;') + '">' +
        '<div>' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">' +
            '<span style="background:var(--ink);color:var(--yellow);padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;font-family:monospace;">' + a.apiId + '</span>' +
            '<span class="badge badge-green" style="font-size:10px;">' + a.method + '</span>' +
            '<span class="badge ' + (groupColors[a.group]||'badge-gray') + '" style="font-size:10px;">' + a.group + '</span>' +
            (hasSample ? '<span class="badge badge-green" style="font-size:10px;">sample ✓</span>' : '<span class="badge badge-gray" style="font-size:10px;">no sample</span>') +
            '<span class="badge badge-gray" style="font-size:10px;">' + tagCount + ' tag' + (tagCount!==1?'s':'') + '</span>' +
            (isActive ? '' : '<span class="badge badge-gray" style="font-size:10px;">Inactive</span>') +
          '</div>' +
          '<div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:4px;">' + a.label + '</div>' +
          '<code style="font-size:11px;color:var(--muted);display:block;margin-bottom:4px;">' + a.url + '</code>' +
          (a.notes ? '<div style="font-size:12px;color:var(--muted);">' + a.notes + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' +
          '<button class="btn btn-primary" style="height:28px;font-size:11px;padding:0 10px;" onclick="TGE.apiEdit(\'' + a.apiId + '\')">Edit</button>' +
          '<button class="btn" style="height:28px;font-size:11px;padding:0 10px;" onclick="TGE.apiToggleActive(\'' + a.apiId + '\',' + (!isActive) + ')">' + (isActive?'Deactivate':'Activate') + '</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ── Panel ─────────────────────────────────────────────────────────────────────
  function openPanel(mode, apiId) {
    state.panelMode  = mode;
    state.editingApi = null;
    state.tags       = [];
    state.parsedFields = [];

    var existing = null;
    if (mode === 'edit' && apiId) {
      existing = state.apis.find(function(a) { return a.apiId === apiId; });
      if (!existing) return;
      state.editingApi = existing;
      state.tags       = JSON.parse(JSON.stringify(existing.fields || []));
    }

    var v = existing || {};
    TGE.el('api-panel-kicker').textContent = mode === 'edit' ? 'Edit API' : 'Add API';
    TGE.el('api-panel-title').textContent  = mode === 'edit' ? v.label : 'New API Definition';
    TGE.el('api-id').value     = v.apiId  || ('API-' + (state.apis.length + 1));
    TGE.el('api-label').value  = v.label  || '';
    TGE.el('api-url').value    = v.url    || '';
    TGE.el('api-notes').value  = v.notes  || '';
    TGE.el('api-sample').value = v.sampleResponse || '';
    TGE.el('api-save-btn').textContent = mode === 'edit' ? 'Update API' : 'Save API';
    TGE.el('api-panel-message').textContent = '';
    TGE.el('api-parse-status').textContent  = '';

    // Render group and method dropdowns
    TGE.el('api-group-wrap').innerHTML  = customSelect('api-group',  API_GROUPS,  v.group  || 'other',  'Select group...');
    TGE.el('api-method-wrap').innerHTML = customSelect('api-method', API_METHODS, v.method || 'GET',     'Select method...');

    // Hide tag form
    TGE.el('tag-inline-form').style.display = 'none';
    TGE.el('tag-add-btn-wrap').style.display = '';
    TGE.el('api-sample-parsed') && (TGE.el('api-sample-parsed').style ? TGE.el('api-sample-parsed').style.display = 'none' : null);

    renderTagsList();

    TGE.el('api-panel-overlay').style.display = 'block';
    TGE.el('api-panel').style.display         = 'flex';
  }

  TGE.apiEdit = function(id) { openPanel('edit', id); };

  TGE.apiToggleActive = async function(apiId, makeActive) {
    var entry = state.apis.find(function(a) { return a.apiId === apiId; });
    if (!entry) return;
    entry.active = makeActive;
    await api('PUT', '/api/registry/apis/' + encodeURIComponent(apiId), entry);
    renderApiList();
  };

  TGE.apiClosePanel = function() {
    TGE.el('api-panel-overlay').style.display = 'none';
    TGE.el('api-panel').style.display         = 'none';
  };

  // ── Tags ──────────────────────────────────────────────────────────────────────
  function renderTagsList() {
    var list = TGE.el('api-tags-list');
    if (!list) return;
    if (!state.tags.length) {
      list.innerHTML = '<p style="font-size:12px;color:var(--muted);font-style:italic;margin:0 0 4px;">No field tags yet.</p>';
      return;
    }
    var useColors  = { 'display':'badge-green', 'feeds-next':'badge-yellow', 'filter-rule':'badge-gray', 'internal':'badge-gray', 'match':'badge-yellow' };
    var useLabels  = { 'display':'Display', 'feeds-next':'Feeds next API', 'filter-rule':'Filter/rule', 'internal':'Internal', 'match':'Match/validate' };
    list.innerHTML = state.tags.map(function(t, idx) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface);">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;">' +
          '<code style="font-size:12px;font-weight:700;color:var(--ink);flex-shrink:0;">' + (t.name||t.path||'unnamed') + '</code>' +
          (t.label ? '<span style="font-size:12px;color:var(--muted);">→ ' + t.label + '</span>' : '') +
          '<span class="badge ' + (useColors[t.use]||'badge-gray') + '" style="font-size:10px;">' + (useLabels[t.use]||t.use||'—') + '</span>' +
          (t.path ? '<code style="font-size:10px;color:var(--muted-2);">' + t.path + '</code>' : '') +
        '</div>' +
        '<div style="display:flex;gap:4px;flex-shrink:0;">' +
          '<button class="btn" style="height:24px;font-size:11px;padding:0 8px;" onclick="TGE.apiOpenTagForm(' + idx + ')">Edit</button>' +
          '<button class="btn btn-danger" style="height:24px;font-size:11px;padding:0 8px;" onclick="TGE.apiRemoveTag(' + idx + ')">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  TGE.apiRemoveTag = function(idx) {
    state.tags.splice(idx, 1);
    renderTagsList();
  };

  // Open tag form
  TGE.apiOpenTagForm = function(idx) {
    state.editingTagIdx = idx;
    var tag = idx !== null && idx !== undefined ? state.tags[idx] : { name:'', label:'', use:'display', description:'', path:'' };

    TGE.el('tag-form-title').textContent = (idx !== null && idx !== undefined) ? 'Edit Field Tag' : 'Add Field Tag';

    // Field name — dropdown from parsed fields + custom
    var nameOpts = state.parsedFields.map(function(f) { return { value: f, label: f }; });
    TGE.el('tag-name-wrap').innerHTML = customSelect('tag-name-sel', nameOpts, tag.name || tag.path || '', 'Select field or choose Custom...');

    // Pre-fill path from name if available
    if (tag.path) TGE.el('tag-path').value = tag.path;
    else if (tag.name) TGE.el('tag-path').value = tag.name;
    else TGE.el('tag-path').value = '';

    TGE.el('tag-label').value       = tag.label || '';
    TGE.el('tag-description').value = tag.description || '';
    var exEl = TGE.el('tag-example-value');
    if (exEl) exEl.value = tag.example || '';

    // Use dropdown
    TGE.el('tag-use-wrap').innerHTML = customSelect('tag-use-sel', TAG_USES, tag.use || 'display', 'Select how this field is used...');

    // When name selected, auto-fill path
    var nameSel = document.getElementById('tag-name-sel');
    if (nameSel) {
      nameSel.addEventListener('change', function() {
        if (this.value && this.value !== '__custom__') {
          TGE.el('tag-path').value = this.value;
        }
      });
    }

    TGE.el('tag-inline-form').style.display  = '';
    TGE.el('tag-add-btn-wrap').style.display = 'none';
    TGE.el('tag-inline-form').scrollIntoView({ behavior:'smooth', block:'nearest' });
  };

  TGE.apiCloseTagForm = function() {
    TGE.el('tag-inline-form').style.display  = 'none';
    TGE.el('tag-add-btn-wrap').style.display = '';
    state.editingTagIdx = null;
  };

  TGE.apiSaveTag = function() {
    var name = getCustomSelectValue('tag-name-sel');
    var use  = getCustomSelectValue('tag-use-sel');
    var label = TGE.el('tag-label').value.trim();
    var desc  = TGE.el('tag-description').value.trim();
    var path    = TGE.el('tag-path').value.trim();
    var example = TGE.el('tag-example-value') ? TGE.el('tag-example-value').value.trim() : '';

    if (!name && !path) { alert('Field name or path is required.'); return; }

    var tag = { name: name || path, label: label, use: use, description: desc, path: path, example: example };

    if (state.editingTagIdx !== null && state.editingTagIdx !== undefined) {
      state.tags[state.editingTagIdx] = tag;
    } else {
      state.tags.push(tag);
    }

    TGE.apiCloseTagForm();
    renderTagsList();
  };

  TGE.apiSaveTagAndAddAnother = function() {
    TGE.apiSaveTag();
    // Reopen for a new tag
    setTimeout(function() { TGE.apiOpenTagForm(null); }, 100);
  };

  // ── JSON sample parser ────────────────────────────────────────────────────────
  TGE.apiParseSample = function() {
    var raw = TGE.el('api-sample').value.trim();
    if (!raw) { alert('Paste a JSON response first.'); return; }
    var parsed;
    try { parsed = JSON.parse(raw); } catch(e) { alert('Invalid JSON: ' + e.message); return; }

    // Extract all field paths
    state.parsedFields = [];
    extractPaths(Array.isArray(parsed) ? parsed[0] : parsed, '');

    TGE.el('api-parse-status').textContent = state.parsedFields.length + ' fields found — ready to tag';
    TGE.el('api-parse-status').style.color = 'var(--green-600)';
  };

  function extractPaths(obj, prefix) {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(function(key) {
      var path = prefix ? prefix + '.' + key : key;
      var val  = obj[key];
      state.parsedFields.push(path);
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        extractPaths(val, path);
      } else if (Array.isArray(val) && val[0] && typeof val[0] === 'object') {
        extractPaths(val[0], path + '[]');
      }
    });
  }

  // JSON picker (visual tree)
  TGE.apiPickFromSample = function() {
    var raw = TGE.el('api-sample').value.trim();
    if (!raw) { alert('Paste a JSON response in Section 2 first.'); return; }
    var parsed;
    try { parsed = JSON.parse(raw); } catch(e) { alert('Invalid JSON — check Section 2.'); return; }
    TGE.el('json-picker-tree').innerHTML = renderJsonTree(Array.isArray(parsed) ? parsed[0] : parsed, '');
    TGE.el('json-picker-overlay').style.display = 'flex';
  };

  function renderJsonTree(obj, prefix) {
    if (!obj || typeof obj !== 'object') return '';
    if (Array.isArray(obj)) {
      return obj.length ? renderJsonTree(obj[0], prefix + '[]') : '<span style="color:var(--muted);">[]</span>';
    }
    return Object.keys(obj).map(function(key) {
      var path = prefix ? prefix + '.' + key : key;
      var val  = obj[key];
      if (val && typeof val === 'object') {
        return '<div style="padding-left:14px;">' +
          '<span style="color:var(--green-700);font-weight:600;">' + key + '</span>: ' +
          renderJsonTree(val, path) +
        '</div>';
      }
      var display = JSON.stringify(val);
      if (display && display.length > 50) display = display.slice(0,50) + '…';
      return '<div style="padding-left:14px;">' +
        '<span style="color:var(--green-700);font-weight:600;">' + key + '</span>: ' +
        '<span style="color:var(--ink-2);cursor:pointer;padding:1px 5px;border-radius:4px;" ' +
          'onmouseover="this.style.background=\'var(--green-100)\'" ' +
          'onmouseout="this.style.background=\'\'" ' +
          'onclick="TGE.apiSelectJsonPath(\'' + path + '\')">' + display + '</span>' +
      '</div>';
    }).join('');
  }

  TGE.apiSelectJsonPath = function(path, example) {
    TGE.el('tag-path').value = path;
    var exampleEl = document.getElementById('tag-example-value');
    if (exampleEl && example) exampleEl.value = String(example).replace(/^"|"$/g,'');
    // Also set name if empty
    var nameSel = document.getElementById('tag-name-sel');
    if (nameSel && (!nameSel.value || nameSel.value === '__custom__')) {
      var customInput = document.getElementById('tag-name-sel-custom');
      if (customInput) { customInput.style.display = 'block'; customInput.value = path; }
      nameSel.value = '__custom__';
    }
    TGE.el('json-picker-overlay').style.display = 'none';
  };

  TGE.apiCloseJsonPicker = function() {
    TGE.el('json-picker-overlay').style.display = 'none';
  };

  // ── Save API ──────────────────────────────────────────────────────────────────
  TGE.apiSave = async function() {
    if (state.saving) return;
    var msgEl  = TGE.el('api-panel-message');
    var apiId  = TGE.el('api-id').value.trim().toUpperCase();
    var label  = TGE.el('api-label').value.trim();
    var group  = getCustomSelectValue('api-group');
    var method = getCustomSelectValue('api-method');
    var url    = TGE.el('api-url').value.trim();
    var notes  = TGE.el('api-notes').value.trim();
    var sample = TGE.el('api-sample').value.trim();

    if (!apiId || !label || !url) {
      msgEl.textContent = 'API ID, label and URL are required.';
      msgEl.style.color = 'var(--danger)';
      return;
    }

    var entry = { apiId:apiId, label:label, group:group, method:method, url:url, notes:notes, sampleResponse:sample, fields:state.tags, active:true };

    state.saving = true;
    var btn = TGE.el('api-save-btn');
    btn.textContent = 'Saving...'; btn.disabled = true;

    try {
      if (state.panelMode === 'edit') {
        await api('PUT', '/api/registry/apis/' + encodeURIComponent(state.editingApi.apiId), entry);
        var idx = state.apis.findIndex(function(a) { return a.apiId === state.editingApi.apiId; });
        if (idx !== -1) state.apis[idx] = entry; else state.apis.push(entry);
      } else {
        await api('POST', '/api/registry/apis', entry);
        state.apis.push(entry);
      }
      msgEl.textContent = 'Saved successfully.';
      msgEl.style.color = 'var(--green-600)';
      renderApiList();
      setTimeout(function() { TGE.apiClosePanel(); }, 600);
    } catch(e) {
      msgEl.textContent = 'Error: ' + e.message;
      msgEl.style.color = 'var(--danger)';
    } finally {
      state.saving = false;
      btn.textContent = state.panelMode === 'edit' ? 'Update API' : 'Save API';
      btn.disabled = false;
    }
  };

  // ── Export ────────────────────────────────────────────────────────────────────
  function exportJson() {
    var active = state.apis.filter(function(a) { return a.active !== false; });
    if (!active.length) { alert('No active APIs to export.'); return; }
    var json = JSON.stringify({ exportedAt: new Date().toISOString(), apiCount: active.length, apis: active }, null, 2);
    var modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = '<div style="background:var(--surface);border-radius:14px;padding:20px;width:min(700px,100%);max-height:85vh;display:flex;flex-direction:column;gap:10px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<div><h3 style="margin:0;font-size:14px;font-weight:700;">API Registry Export</h3>' +
        '<p style="margin:3px 0 0;font-size:12px;color:var(--muted);">' + active.length + ' active API' + (active.length!==1?'s':'') + ' · Paste into chat as coding reference</p></div>' +
        '<button onclick="this.closest(\'div\').parentElement.remove()" style="border:none;background:none;font-size:18px;cursor:pointer;color:var(--muted);">✕</button>' +
      '</div>' +
      '<textarea style="flex:1;min-height:300px;font-family:monospace;font-size:11px;border:1px solid var(--line);border-radius:8px;padding:10px;resize:none;background:var(--surface-2);" readonly>' + json + '</textarea>' +
      '<div style="display:flex;gap:8px;">' +
        '<button class="btn btn-primary" onclick="navigator.clipboard.writeText(this.closest(\'div\').previousElementSibling.value).then(function(){alert(\'Copied to clipboard!\')})">Copy to Clipboard</button>' +
        '<button class="btn" onclick="(function(j){var a=document.createElement(\'a\');a.href=URL.createObjectURL(new Blob([j],{type:\'application/json\'}));a.download=\'tge-api-registry-\'+new Date().toISOString().slice(0,10)+\'.json\';a.click()})(this.closest(\'div\').previousElementSibling.value)">Download JSON</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(modal);
  }

  // ── Register ──────────────────────────────────────────────────────────────────
  var _orig = TGE.onAppReady;
  TGE.onAppReady = function () {
    if (typeof _orig === 'function') _orig();
    render();
  };

})();
