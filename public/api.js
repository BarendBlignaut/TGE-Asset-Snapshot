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
  var VENDORS = [
    'Teletrac Navman','Seeing Machines','Power Fleet',
    'Carrier','Thermo King','Volvo','Mercedes-Benz','Toyota'
  ];

  var state = {
    apis:          [],
    editingApi:    null,
    panelMode:     null,
    tags:          [],
    saving:        false,
    editingTagIdx: null,
    parsedFields:  [],
    parsedExamples:{},
    parsedRaw:     {},   // raw values per path (for JSON string detection)
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
            '<div class="field" style="margin-top:10px;">',
              '<label>Vendor / Source System</label>',
              '<div id="api-vendor-wrap"></div>',
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

              // Row 3b — Hard check toggle
              '<div style="display:grid;grid-template-columns:140px 1fr;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line-2);">',
                '<span style="font-size:12px;font-weight:600;color:var(--ink);">Hard Check</span>',
                '<div style="display:flex;align-items:center;gap:12px;">',
                  '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">',
                    '<div class="perm-toggle" id="tag-hard-check-toggle" onclick="TGE.apiToggleHardCheck(this)" style="flex-shrink:0;"></div>',
                    '<span style="font-size:12px;color:var(--ink);" id="tag-hard-check-label">Off — soft check only</span>',
                  '</label>',
                '</div>',
                '<p style="margin:3px 0 0;font-size:10px;color:var(--muted-2);grid-column:2;">If ON — this field must match or the entire request fails immediately</p>',
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
            (a.vendor ? '<span class="badge badge-yellow" style="font-size:10px;">' + a.vendor + '</span>' : '') +
            (isActive ? '' : '<span class="badge badge-gray" style="font-size:10px;">Inactive</span>') +
          '</div>' +
          '<div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:4px;">' + a.label + '</div>' +
          '<code style="font-size:11px;color:var(--muted);display:block;margin-bottom:4px;">' + a.url + '</code>' +
          (a.notes ? '<div style="font-size:12px;color:var(--muted);">' + a.notes + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' +
          '<button class="btn" style="height:28px;font-size:11px;padding:0 10px;" onclick="TGE.apiView(\'' + a.apiId + '\')">View</button>' +
          '<button class="btn btn-primary" style="height:28px;font-size:11px;padding:0 10px;" onclick="TGE.apiEdit(\'' + a.apiId + '\')">Edit</button>' +
          '<button class="btn" style="height:28px;font-size:11px;padding:0 10px;background:var(--green-100);color:var(--green-700);border-color:var(--green-600);" onclick="TGE.apiTest(\'' + a.apiId + '\')">Test</button>' +
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

    // Render group, method and vendor dropdowns
    TGE.el('api-group-wrap').innerHTML  = customSelect('api-group',  API_GROUPS,  v.group  || 'other',  'Select group...');
    TGE.el('api-method-wrap').innerHTML = customSelect('api-method', API_METHODS, v.method || 'GET',     'Select method...');
    TGE.el('api-vendor-wrap').innerHTML = customSelect('api-vendor', VENDORS,     v.vendor || '',        'Select vendor...');

    // Hide tag form
    TGE.el('tag-inline-form').style.display = 'none';
    TGE.el('tag-add-btn-wrap').style.display = '';
    TGE.el('api-sample-parsed') && (TGE.el('api-sample-parsed').style ? TGE.el('api-sample-parsed').style.display = 'none' : null);

    renderTagsList();

    TGE.el('api-panel-overlay').style.display = 'block';
    TGE.el('api-panel').style.display         = 'flex';
  }

  TGE.apiEdit = function(id) { openPanel('edit', id); };

  TGE.apiView = function(apiId) {
    var a = state.apis.find(function(x) { return x.apiId === apiId; });
    if (!a) return;
    var modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;';
    var useLabels = { display:'Display', 'feeds-next':'Feeds next API', 'filter-rule':'Filter/rule', internal:'Internal', match:'Match/validate' };
    var tags = (a.fields||[]).map(function(t) {
      return '<tr style="border-bottom:1px solid var(--line-2);">' +
        '<td style="padding:6px 10px;font-family:monospace;font-size:11px;color:var(--green-700);">' + (t.path||t.name||'') + '</td>' +
        '<td style="padding:6px 10px;font-size:12px;">' + (t.label||'') + '</td>' +
        '<td style="padding:6px 10px;font-size:12px;">' + (useLabels[t.use]||t.use||'') + '</td>' +
        '<td style="padding:6px 10px;text-align:center;">' + (t.hardCheck ? '<span style="color:var(--danger);font-weight:700;">YES</span>' : '—') + '</td>' +
        '<td style="padding:6px 10px;font-size:12px;color:var(--muted);">' + (t.description||'') + '</td>' +
      '</tr>';
    }).join('');
    modal.innerHTML = '<div style="background:var(--surface);border-radius:14px;width:min(800px,100%);max-height:85vh;display:flex;flex-direction:column;overflow:hidden;">' +
      '<div style="padding:16px 20px;background:var(--green-900);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">' +
        '<div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:rgba(212,240,38,0.7);">API Definition</div>' +
        '<div style="font-size:15px;font-weight:700;color:#fff;">' + a.apiId + ' — ' + a.label + '</div></div>' +
        '<button id="avc" style="border:none;background:rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:16px;cursor:pointer;width:30px;height:30px;">✕</button>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:20px;">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">' +
          '<div class="data-item"><span>Method</span><strong>' + a.method + '</strong></div>' +
          '<div class="data-item"><span>Group</span><strong>' + (a.group||'—') + '</strong></div>' +
          (a.vendor ? '<div class="data-item"><span>Vendor</span><strong>' + a.vendor + '</strong></div>' : '') +
          '<div class="data-item" style="grid-column:span 2;"><span>URL</span><strong style="font-family:monospace;font-size:12px;word-break:break-all;">' + a.url + '</strong></div>' +
          (a.notes ? '<div class="data-item" style="grid-column:span 2;"><span>Notes</span><strong>' + a.notes + '</strong></div>' : '') +
        '</div>' +
        '<div class="card-kicker" style="margin-bottom:8px;">Field Tags (' + (a.fields||[]).length + ')</div>' +
        '<div style="overflow-x:auto;border:1px solid var(--line);border-radius:8px;">' +
          '<table style="width:100%;border-collapse:collapse;">' +
            '<thead><tr style="background:var(--surface-2);">' +
              '<th style="padding:8px;font-size:10px;text-align:left;color:var(--muted);">Path</th>' +
              '<th style="padding:8px;font-size:10px;text-align:left;color:var(--muted);">Label</th>' +
              '<th style="padding:8px;font-size:10px;text-align:left;color:var(--muted);">Use</th>' +
              '<th style="padding:8px;font-size:10px;text-align:center;color:var(--muted);">Hard Check</th>' +
              '<th style="padding:8px;font-size:10px;text-align:left;color:var(--muted);">Description</th>' +
            '</tr></thead>' +
            '<tbody>' + (tags || '<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--muted);">No tags</td></tr>') + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +
      '<div style="padding:12px 20px;border-top:1px solid var(--line);display:flex;gap:8px;flex-shrink:0;">' +
        '<button id="ave" class="btn btn-primary" style="height:36px;">Edit This API</button>' +
        '<button id="avc2" class="btn" style="height:36px;">Close</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(modal);
    document.getElementById('avc').onclick  = function() { modal.remove(); };
    document.getElementById('avc2').onclick = function() { modal.remove(); };
    document.getElementById('ave').onclick  = function() { modal.remove(); TGE.apiEdit(apiId); };
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  };

  TGE.apiTest = function(apiId) {
    var a = state.apis.find(function(x) { return x.apiId === apiId; });
    if (!a) return;

    // Detect {placeholders} in URL
    var placeholders = [];
    var re = /\{([^}]+)\}/g;
    var m;
    while ((m = re.exec(a.url)) !== null) {
      placeholders.push(m[1]);
    }

    var modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;';

    var paramFields = placeholders.map(function(p) {
      var suggestion = '';
      if (p === 'vehicleId') suggestion = '383582';
      if (p === 'imei') suggestion = '015678004562431';
      if (p === 'from') suggestion = new Date().toISOString().slice(0,10);
      if (p === 'to') suggestion = new Date(Date.now()+86400000).toISOString().slice(0,10);
      return '<div class="field" style="margin:0;">' +
        '<label>' + p + '</label>' +
        '<input type="text" class="api-test-param" data-param="' + p + '" value="' + suggestion + '" style="height:38px;" />' +
      '</div>';
    }).join('');

    modal.innerHTML = '<div style="background:var(--surface);border-radius:14px;width:min(700px,100%);max-height:85vh;display:flex;flex-direction:column;overflow:hidden;">' +
      '<div style="padding:14px 20px;background:var(--green-900);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">' +
        '<div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:rgba(212,240,38,0.7);">Test API</div>' +
        '<div style="font-size:15px;font-weight:700;color:#fff;">' + a.apiId + ' — ' + a.label + '</div></div>' +
        '<button id="at-close" style="border:none;background:rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:16px;cursor:pointer;width:30px;height:30px;">✕</button>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:14px;">' +
        '<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:12px;">' +
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">Endpoint</div>' +
          '<code style="font-size:12px;color:var(--ink);word-break:break-all;">' + a.method + ' ' + a.url.replace(/\?key=<apiKey>[^"]*/, '') + '</code>' +
        '</div>' +
        (placeholders.length ? '<div><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">Parameters</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' + paramFields + '</div></div>' : '') +
        '<div id="at-response" style="display:none;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
            '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);">Response</div>' +
            '<div id="at-status" style="font-size:12px;font-weight:700;"></div>' +
          '</div>' +
          '<textarea id="at-response-text" style="width:100%;min-height:200px;font-family:monospace;font-size:11px;border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--surface-2);resize:vertical;" readonly></textarea>' +
          '<div style="display:flex;gap:8px;margin-top:8px;">' +
            '<button id="at-copy-btn" class="btn" style="height:32px;font-size:12px;">Copy Response</button>' +
            '<button id="at-use-sample-btn" class="btn btn-primary" style="height:32px;font-size:12px;">Use as Sample Response</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="padding:12px 20px;border-top:1px solid var(--line);display:flex;gap:8px;flex-shrink:0;background:var(--surface-2);">' +
        '<button id="at-run-btn" class="btn btn-primary" style="height:36px;">Run Test</button>' +
        '<button id="at-cancel" class="btn" style="height:36px;">Close</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);
    document.getElementById('at-close').onclick  = function() { modal.remove(); };
    document.getElementById('at-cancel').onclick = function() { modal.remove(); };
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    document.getElementById('at-run-btn').onclick = async function() {
      var btn = this;
      btn.textContent = 'Running...';
      btn.disabled = true;

      // Build URL with params substituted
      var testUrl = a.url;
      modal.querySelectorAll('.api-test-param').forEach(function(inp) {
        testUrl = testUrl.replace('{' + inp.dataset.param + '}', inp.value.trim());
      });

      // Strip base URL and key — proxy through worker
      var tnPath = testUrl
        .replace('https://api-au.telematics.com', '')
        .replace(/\?key=<apiKey>&?/, '?')
        .replace(/&key=<apiKey>/, '');

      var proxyUrl = '/api/tn360' + tnPath;

      var statusEl = document.getElementById('at-status');
      var responseEl = document.getElementById('at-response');
      var responseText = document.getElementById('at-response-text');

      try {
        var res = await fetch(proxyUrl, {
          method: a.method,
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }
        });

        var data = await res.json().catch(function() { return { raw: 'Non-JSON response' }; });
        var json = JSON.stringify(data, null, 2);

        statusEl.textContent = res.ok ? '✅ ' + res.status + ' OK' : '❌ ' + res.status + ' Error';
        statusEl.style.color = res.ok ? 'var(--green-600)' : 'var(--danger)';
        responseText.value = json;
        responseEl.style.display = '';

        document.getElementById('at-copy-btn').onclick = function() {
          navigator.clipboard.writeText(json).then(function() {
            document.getElementById('at-copy-btn').textContent = 'Copied!';
            setTimeout(function() { document.getElementById('at-copy-btn').textContent = 'Copy Response'; }, 2000);
          });
        };

        document.getElementById('at-use-sample-btn').onclick = async function() {
          // Save as sample response for this API
          a.sampleResponse = json;
          await TGE.api('PUT', '/api/registry/apis/' + encodeURIComponent(a.apiId), a);
          var idx = state.apis.findIndex(function(x) { return x.apiId === a.apiId; });
          if (idx !== -1) state.apis[idx] = a;
          renderApiList();
          this.textContent = 'Saved as Sample!';
          this.style.background = 'var(--green-600)';
        };

      } catch(e) {
        statusEl.textContent = '❌ Error: ' + e.message;
        statusEl.style.color = 'var(--danger)';
        responseText.value = e.message;
        responseEl.style.display = '';
      } finally {
        btn.textContent = 'Run Test';
        btn.disabled = false;
      }
    };
  };

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
          (t.hardCheck ? '<span class="badge badge-red" style="font-size:10px;background:var(--danger-bg);color:var(--danger);">HARD CHECK</span>' : '') +
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
    // Set hard check toggle
    var hcEl = TGE.el('tag-hard-check-toggle');
    var hcLb = TGE.el('tag-hard-check-label');
    if (hcEl) {
      hcEl.classList.toggle('on', !!tag.hardCheck);
      if (hcLb) {
        hcLb.textContent = tag.hardCheck ? 'ON — hard check (fail if no match)' : 'Off — soft check only';
        hcLb.style.color = tag.hardCheck ? 'var(--danger)' : 'var(--ink)';
        hcLb.style.fontWeight = tag.hardCheck ? '600' : 'normal';
      }
    }

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

    var hardCheckEl = TGE.el('tag-hard-check-toggle');
    var hardCheck = hardCheckEl ? hardCheckEl.classList.contains('on') : false;
    var tag = { name: name || path, label: label, use: use, description: desc, path: path, example: example, hardCheck: hardCheck };

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

    // Extract all field paths with example values
    state.parsedFields = [];
    state.parsedExamples = {};
    extractPaths(Array.isArray(parsed) ? parsed[0] : parsed, '');

    TGE.el('api-parse-status').textContent = state.parsedFields.length + ' fields found — opening bulk editor...';
    TGE.el('api-parse-status').style.color = 'var(--green-600)';

    // Open bulk tag editor
    openBulkTagEditor();
  };

  function extractPaths(obj, prefix) {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(function(key) {
      var path = prefix ? prefix + '.' + key : key;
      var val  = obj[key];
      state.parsedFields.push(path);
      state.parsedRaw[path] = val;
      if (val !== null && typeof val !== 'object') {
        state.parsedExamples[path] = String(val);
      }
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        extractPaths(val, path);
      } else if (Array.isArray(val) && val[0] && typeof val[0] === 'object') {
        extractPaths(val[0], path + '[]');
      }
    });
  }

  // Check if a value is a JSON string
  function isJsonString(val) {
    if (typeof val !== 'string') return false;
    var s = val.trim();
    if (!(s.startsWith('{') || s.startsWith('['))) return false;
    try { JSON.parse(s); return true; } catch(e) { return false; }
  }

  // ── Bulk tag editor ────────────────────────────────────────────────────────
  function openBulkTagEditor() {
    // Remove existing bulk editor if any
    var existing = document.getElementById('bulk-tag-modal');
    if (existing) existing.remove();

    var useOptions = TAG_USES.map(function(u) {
      return '<option value="' + u.value + '">' + u.label + '</option>';
    }).join('') + '<option value="__custom__">+ Custom...</option>';

    // Build rows for all parsed fields
    // Pre-tick fields that aren't nested objects (top-level useful fields)
    var rows = state.parsedFields.map(function(path, idx) {
      var example  = state.parsedExamples[path] || '';
      var rawVal   = state.parsedRaw[path];
      var isJson   = isJsonString(rawVal);
      var isArray  = Array.isArray(rawVal) && rawVal.length > 0 && typeof rawVal[0] === 'object';
      var lastKey  = path.split('.').pop().replace('[]','');
      var autoLabel = lastKey.replace(/([A-Z])/g, ' $1').replace(/^./, function(s){ return s.toUpperCase(); });
      var autoUse  = 'display';
      if (/^id$/i.test(lastKey)) autoUse = 'feeds-next';
      if (/Id$/i.test(lastKey) && lastKey !== 'id') autoUse = 'feeds-next';
      if (/type$/i.test(lastKey)) autoUse = 'filter-rule';
      if (/status$/i.test(lastKey)) autoUse = 'filter-rule';
      var depth    = path.replace(/\[\]/g,'').split('.').length;
      var preTick  = depth <= 2 && example !== '' && !isJson;
      var isSubrow = path.indexOf('__sub__') > -1;

      // Expand button for JSON strings
      var expandBtn = isJson
        ? '<button class="bulk-expand-btn" data-idx="' + idx + '" data-path="' + path + '" ' +
            'onclick="TGE.bulkExpandJson(this)" ' +
            'style="height:24px;padding:0 8px;border-radius:5px;border:1px solid var(--green-600);background:var(--green-50,#f0faf4);color:var(--green-700);font:inherit;font-size:11px;cursor:pointer;white-space:nowrap;margin-left:6px;">+ Expand JSON</button>'
        : '';

      // Filter button for arrays
      var filterBtn = isArray
        ? '<button class="bulk-filter-btn" data-idx="' + idx + '" data-path="' + path + '" ' +
            'onclick="TGE.bulkExpandArray(this)" ' +
            'style="height:24px;padding:0 8px;border-radius:5px;border:1px solid var(--yellow-dim,#b8d520);background:rgba(212,240,38,0.1);color:var(--ink);font:inherit;font-size:11px;cursor:pointer;white-space:nowrap;margin-left:6px;">+ Filter Array</button>'
        : '';

      return '<tr id="bulk-row-' + idx + '" style="border-bottom:1px solid var(--line-2);' + (preTick?'':'opacity:0.5;') + '">' +
        '<td style="padding:6px 8px;text-align:center;width:36px;">' +
          '<input type="checkbox" class="bulk-include" data-idx="' + idx + '"' + (preTick?' checked':'') + ' ' +
            'onchange="TGE.bulkRowToggle(' + idx + ',this.checked)" ' +
            'style="width:16px;height:16px;cursor:pointer;" />' +
        '</td>' +
        '<td style="padding:6px 8px;min-width:180px;">' +
          '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">' +
            '<code style="font-size:11px;color:var(--green-700);">' + path + '</code>' +
            (isJson ? '<span class="badge badge-yellow" style="font-size:9px;">JSON string</span>' : '') +
            (isArray ? '<span class="badge badge-green" style="font-size:9px;">array</span>' : '') +
            expandBtn + filterBtn +
          '</div>' +
          (example && !isJson ? '<span style="font-size:10px;color:var(--muted-2);display:block;margin-top:2px;">' + example.slice(0,40) + '</span>' : '') +
        '</td>' +
        '<td style="padding:6px 8px;min-width:140px;">' +
          '<input type="text" class="bulk-label" data-idx="' + idx + '" value="' + autoLabel + '" ' +
            'style="width:100%;height:32px;border:1px solid var(--line);border-radius:6px;padding:0 8px;font:inherit;font-size:12px;" />' +
        '</td>' +
        '<td style="padding:6px 8px;min-width:150px;">' +
          '<select class="bulk-use" data-idx="' + idx + '" ' +
            'style="width:100%;height:32px;border:1px solid var(--line);border-radius:6px;padding:0 6px;font:inherit;font-size:12px;">' +
            TAG_USES.map(function(u){ return '<option value="'+u.value+'"'+(u.value===autoUse?' selected':'')+'>'+u.label+'</option>'; }).join('') +
            '<option value="__custom__">+ Custom...</option>' +
          '</select>' +
        '</td>' +
        '<td style="padding:6px 8px;text-align:center;width:80px;">' +
          '<div class="perm-toggle bulk-hard-check" data-idx="' + idx + '" ' +
            'onclick="TGE.bulkToggleHard(this)" style="margin:0 auto;"></div>' +
        '</td>' +
        '<td style="padding:6px 8px;min-width:180px;">' +
          '<input type="text" class="bulk-desc" data-idx="' + idx + '" placeholder="Optional notes..." ' +
            'style="width:100%;height:32px;border:1px solid var(--line);border-radius:6px;padding:0 8px;font:inherit;font-size:12px;" />' +
        '</td>' +
      '</tr>';
    }).join('');

    var modal = document.createElement('div');
    modal.id = 'bulk-tag-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:600;display:flex;align-items:stretch;justify-content:center;padding:20px;';

    modal.innerHTML = '<div style="background:var(--surface);border-radius:14px;width:100%;max-width:1100px;display:flex;flex-direction:column;overflow:hidden;">' +
      // Header
      '<div style="padding:14px 20px;background:var(--green-900);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">' +
        '<div>' +
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(212,240,38,0.7);">Bulk Tag Editor</div>' +
          '<div style="font-size:15px;font-weight:700;color:#fff;">' + state.parsedFields.length + ' fields detected — tick to include</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;">' +
          '<button onclick="TGE.bulkSelectAll(true)" style="height:30px;padding:0 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;font:inherit;font-size:11px;cursor:pointer;">Tick All</button>' +
          '<button onclick="TGE.bulkSelectAll(false)" style="height:30px;padding:0 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;font:inherit;font-size:11px;cursor:pointer;">Untick All</button>' +
          '<button onclick="TGE.bulkClose()" style="height:30px;padding:0 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;font:inherit;font-size:11px;cursor:pointer;">Cancel</button>' +
        '</div>' +
      '</div>' +
      // Table
      '<div style="flex:1;overflow:auto;">' +
        '<table style="width:100%;border-collapse:collapse;">' +
          '<thead>' +
            '<tr style="background:var(--surface-2);position:sticky;top:0;z-index:1;">' +
              '<th style="padding:8px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);text-align:center;width:36px;">Include</th>' +
              '<th style="padding:8px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);text-align:left;">Field Path · Example</th>' +
              '<th style="padding:8px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);text-align:left;">Display As</th>' +
              '<th style="padding:8px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);text-align:left;">Use</th>' +
              '<th style="padding:8px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);text-align:center;">Hard Check</th>' +
              '<th style="padding:8px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);text-align:left;">Description</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
      // Footer
      '<div style="padding:12px 20px;border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:var(--surface-2);">' +
        '<span id="bulk-count-label" style="font-size:12px;color:var(--muted);"></span>' +
        '<div style="display:flex;gap:8px;">' +
          '<button onclick="TGE.bulkClose()" class="btn" style="height:36px;">Cancel</button>' +
          '<button onclick="TGE.bulkSaveTags()" class="btn btn-primary" style="height:36px;">Save Selected Tags</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);
    updateBulkCount();
  }

  TGE.bulkClose = function() {
    var m = document.getElementById('bulk-tag-modal');
    if (m) m.remove();
  };

  TGE.bulkToggleHard = function(el) { el.classList.toggle('on'); };
  TGE.ejToggleHard   = function(el) { el.classList.toggle('on'); };

  TGE.ejRowToggle = function(cb, idx) {
    var r = document.getElementById('ej-row-' + idx);
    if (r) r.style.opacity = cb.checked ? '1' : '0.45';
  };

  TGE.ejSelectAll = function(checked) {
    document.querySelectorAll('.ej-include').forEach(function(cb) {
      cb.checked = checked;
      var r = document.getElementById('ej-row-' + cb.dataset.idx);
      if (r) r.style.opacity = checked ? '1' : '0.45';
    });
  };

  // Expand a JSON string field — opens dedicated clean screen
  TGE.bulkExpandJson = function(btn) {
    var path   = btn.dataset.path;
    var rawVal = state.parsedRaw[path];
    if (!rawVal) return;
    var parsed;
    try { parsed = JSON.parse(rawVal); } catch(e) { alert('Could not parse: ' + e.message); return; }

    var obj = Array.isArray(parsed) ? parsed[0] : parsed;

    // Extract fields from parsed JSON string
    var subFields = [];
    function extractSub(o, prefix) {
      if (!o || typeof o !== 'object') return;
      Object.keys(o).forEach(function(k) {
        var p = prefix ? prefix + '.' + k : k;
        var v = o[k];
        if (typeof v !== 'object' || v === null) {
          subFields.push({ path: p, key: k, example: String(v), rawVal: v });
        } else if (!Array.isArray(v)) {
          extractSub(v, p);
        }
      });
    }
    extractSub(obj, '');

    if (!subFields.length) { alert('No fields found in this JSON string.'); return; }

    // Build dedicated screen
    var existing = document.getElementById('expand-json-modal');
    if (existing) existing.remove();

    var rows = subFields.map(function(f, i) {
      var autoLabel = f.key.replace(/([A-Z])/g, ' $1').replace(/^./, function(s){ return s.toUpperCase(); });
      var autoUse = 'display';
      if (/^id$/i.test(f.key) || /Id$/.test(f.key)) autoUse = 'feeds-next';
      if (/type|status/i.test(f.key)) autoUse = 'filter-rule';
      var preTick = parseFloat(f.example) > 0 || (f.example !== '-1' && f.example !== 'false' && f.example !== 'null');

      return '<tr id="ej-row-' + i + '" style="border-bottom:1px solid var(--line-2);' + (preTick?'':'opacity:0.45;') + '">' +
        '<td style="padding:7px 10px;text-align:center;width:36px;">' +
          '<input type="checkbox" class="ej-include" data-idx="' + i + '"' + (preTick?' checked':'') + ' ' +
          'onchange="TGE.ejRowToggle(this,' + i + ')" ' +
          'style="width:16px;height:16px;cursor:pointer;" />' +
        '</td>' +
        '<td style="padding:7px 10px;">' +
          '<code style="font-size:12px;color:var(--green-700);font-weight:600;">' + f.key + '</code>' +
          '<span style="display:block;font-size:10px;color:var(--muted-2);margin-top:2px;font-family:monospace;">' + f.path + '</span>' +
        '</td>' +
        '<td style="padding:7px 10px;font-size:12px;color:var(--muted);">' + String(f.example).slice(0,25) + '</td>' +
        '<td style="padding:7px 10px;">' +
          '<input type="text" class="ej-label" data-idx="' + i + '" value="' + autoLabel + '" ' +
          'style="width:100%;height:32px;border:1px solid var(--line);border-radius:6px;padding:0 8px;font:inherit;font-size:12px;" />' +
        '</td>' +
        '<td style="padding:7px 10px;">' +
          '<select class="ej-use" data-idx="' + i + '" style="width:100%;height:32px;border:1px solid var(--line);border-radius:6px;padding:0 6px;font:inherit;font-size:12px;">' +
            TAG_USES.map(function(u){ return '<option value="'+u.value+'"'+(u.value===autoUse?' selected':'')+'>'+u.label+'</option>'; }).join('') +
          '</select>' +
        '</td>' +
        '<td style="padding:7px 10px;text-align:center;width:80px;">' +
          '<div class="perm-toggle ej-hard" data-idx="' + i + '" onclick="TGE.ejToggleHard(this)" style="margin:0 auto;"></div>' +
        '</td>' +
      '</tr>';
    }).join('');

    var modal = document.createElement('div');
    modal.id = 'expand-json-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:700;display:flex;align-items:stretch;justify-content:center;padding:20px;';

    modal.innerHTML = '<div style="background:var(--surface);border-radius:14px;width:min(860px,100%);display:flex;flex-direction:column;overflow:hidden;">' +
      '<div style="padding:14px 20px;background:var(--green-900);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">' +
        '<div>' +
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:rgba(212,240,38,0.7);">Expand JSON Field</div>' +
          '<div style="font-size:15px;font-weight:700;color:#fff;">' + path + ' <span style="font-size:11px;opacity:0.6;">(' + subFields.length + ' fields)</span></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="ej-tick-all" style="height:28px;padding:0 10px;border-radius:5px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;font:inherit;font-size:11px;cursor:pointer;">Tick All</button>' +
          '<button id="ej-untick-all" style="height:28px;padding:0 10px;border-radius:5px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;font:inherit;font-size:11px;cursor:pointer;">Untick All</button>' +
          '<button id="ej-close" style="height:28px;padding:0 10px;border-radius:5px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;font:inherit;font-size:11px;cursor:pointer;">Cancel</button>' +
        '</div>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;">' +
        '<table style="width:100%;border-collapse:collapse;">' +
          '<thead><tr style="background:var(--surface-2);position:sticky;top:0;">' +
            '<th style="padding:8px;width:36px;font-size:10px;text-transform:uppercase;color:var(--muted);">Include</th>' +
            '<th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:var(--muted);">Field · Path</th>' +
            '<th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:var(--muted);">Example</th>' +
            '<th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:var(--muted);">Display As</th>' +
            '<th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:var(--muted);">Use</th>' +
            '<th style="padding:8px;text-align:center;font-size:10px;text-transform:uppercase;color:var(--muted);">Hard Check</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div style="padding:12px 20px;border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:var(--surface-2);">' +
        '<span style="font-size:12px;color:var(--muted);">Tick the fields you want to tag. Parent path prefix: <code style="font-size:11px;">' + path + '.</code></span>' +
        '<div style="display:flex;gap:8px;">' +
          '<button id="ej-save" class="btn btn-primary" style="height:36px;" data-parent="' + path + '">Add Selected as Tags</button>' +
          '<button id="ej-cancel" class="btn" style="height:36px;">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);

    document.getElementById('ej-close').onclick    = function() { modal.remove(); };
    document.getElementById('ej-cancel').onclick   = function() { modal.remove(); };
    document.getElementById('ej-tick-all').onclick  = function() { TGE.ejSelectAll(true); };
    document.getElementById('ej-untick-all').onclick= function() { TGE.ejSelectAll(false); };
    document.getElementById('ej-save').onclick   = function() {
      var parentPath = this.dataset.parent;
      var added = 0;
      document.querySelectorAll('.ej-include:checked').forEach(function(cb) {
        var idx    = parseInt(cb.dataset.idx);
        var f      = subFields[idx];
        var labelEl = document.querySelector('.ej-label[data-idx="' + idx + '"]');
        var useEl   = document.querySelector('.ej-use[data-idx="' + idx + '"]');
        var hardEl  = document.querySelector('.ej-hard[data-idx="' + idx + '"]');
        var fullPath = parentPath + '.' + f.path;
        // Don't add duplicates
        var exists = state.tags.some(function(t){ return t.path === fullPath; });
        if (!exists) {
          state.tags.push({
            name:        f.key,
            label:       labelEl ? labelEl.value.trim() : f.key,
            use:         useEl ? useEl.value : 'display',
            description: 'From ' + parentPath + ' (JSON string)',
            path:        fullPath,
            example:     f.example,
            hardCheck:   hardEl ? hardEl.classList.contains('on') : false,
          });
          added++;
        }
      });
      modal.remove();
      renderTagsList();
      var s = TGE.el('api-parse-status');
      if (s) { s.textContent = added + ' tag' + (added!==1?'s':'') + ' added from ' + path; s.style.color = 'var(--green-600)'; }
    };
  };

  // Expand an array field — opens dedicated filter screen
  TGE.bulkExpandArray = function(btn) {
    var path   = btn.dataset.path;
    var rawVal = state.parsedRaw[path];
    if (!Array.isArray(rawVal) || !rawVal.length) return;
    var item = rawVal[0];
    if (typeof item !== 'object') return;

    var existing = document.getElementById('array-filter-modal');
    if (existing) existing.remove();

    // Get all flat keys for filter dropdown
    var allKeys = [];
    function getAllKeys(obj, prefix) {
      Object.keys(obj).forEach(function(k) {
        var p = prefix ? prefix + '.' + k : k;
        var v = obj[k];
        if (Array.isArray(v) && v.length && typeof v[0] !== 'object') {
          allKeys.push({ path: p, example: String(v[0]) });
        } else if (typeof v !== 'object' || v === null) {
          allKeys.push({ path: p, example: String(v).slice(0,30) });
        } else if (!Array.isArray(v)) {
          getAllKeys(v, p);
        }
      });
    }
    getAllKeys(item, '');

    var keyOptions = allKeys.map(function(f) {
      return '<option value="' + f.path + '">' + f.path + ' · e.g. ' + f.example + '</option>';
    }).join('');

    // Get leaf fields for extract dropdown
    var leafFields = [];
    function getLeafs(obj, prefix) {
      Object.keys(obj).forEach(function(k) {
        var p = prefix ? prefix + '.' + k : k;
        var v = obj[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) getLeafs(v, p);
        else if (!Array.isArray(v)) leafFields.push({ path: p, example: String(v).slice(0,30) });
      });
    }
    getLeafs(item, '');
    var leafOptions = leafFields.map(function(f) {
      return '<option value="' + f.path + '">' + f.path + ' · ' + f.example + '</option>';
    }).join('');

    var modal = document.createElement('div');
    modal.id = 'array-filter-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:700;display:flex;align-items:center;justify-content:center;padding:20px;';

    modal.innerHTML = '<div style="background:var(--surface);border-radius:14px;width:min(580px,100%);display:flex;flex-direction:column;overflow:hidden;max-height:85vh;">' +
      '<div style="padding:14px 20px;background:var(--green-900);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">' +
        '<div>' +
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:rgba(212,240,38,0.7);">Filter Array Field</div>' +
          '<div style="font-size:15px;font-weight:700;color:#fff;">' + path + '[]</div>' +
        '</div>' +
        '<button id="af-close" style="border:none;background:rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:16px;cursor:pointer;width:30px;height:30px;">✕</button>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:14px;">' +
        '<p style="margin:0;font-size:12px;color:var(--muted);">This array has <strong>' + rawVal.length + ' items</strong>. Define which item to pick and what field to extract from it.</p>' +

        '<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:14px;">' +
          '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--green-600);margin-bottom:10px;">Step 1 — Filter: which item?</div>' +
          '<div style="display:grid;grid-template-columns:1fr 60px 1fr;gap:8px;align-items:center;">' +
            '<select id="af-filter-key" style="height:38px;border:1px solid var(--line);border-radius:7px;padding:0 8px;font:inherit;font-size:12px;">' + keyOptions + '</select>' +
            '<div style="text-align:center;font-size:12px;font-weight:700;color:var(--muted);">=</div>' +
            '<input id="af-filter-val" type="text" placeholder="e.g. ROAD_FACING" style="height:38px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font:inherit;font-size:12px;" />' +
          '</div>' +
          '<p style="margin:6px 0 0;font-size:11px;color:var(--muted-2);">Pick the item where this field matches this value</p>' +
        '</div>' +

        '<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:14px;">' +
          '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--green-600);margin-bottom:10px;">Step 2 — Extract: which field?</div>' +
          '<select id="af-extract-field" style="width:100%;height:38px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font:inherit;font-size:12px;">' + leafOptions + '</select>' +
          '<p style="margin:6px 0 0;font-size:11px;color:var(--muted-2);">Pick the field to extract from the matching item</p>' +
        '</div>' +

        '<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:14px;">' +
          '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--green-600);margin-bottom:10px;">Step 3 — Define the tag</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
            '<div class="field" style="margin:0;"><label>Tag Name</label><input id="af-tag-name" type="text" placeholder="e.g. roadFacingUrl" style="height:38px;" /></div>' +
            '<div class="field" style="margin:0;"><label>Display As</label><input id="af-display" type="text" placeholder="e.g. Road Facing Image" style="height:38px;" /></div>' +
            '<div class="field" style="margin:0;"><label>Use</label>' +
              '<select id="af-use" style="height:38px;width:100%;border:1px solid var(--line);border-radius:7px;padding:0 8px;font:inherit;font-size:12px;">' +
                TAG_USES.map(function(u){ return '<option value="'+u.value+'">'+u.label+'</option>'; }).join('') +
              '</select>' +
            '</div>' +
            '<div class="field" style="margin:0;"><label>Description</label><input id="af-desc" type="text" placeholder="e.g. URL for road camera" style="height:38px;" /></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="padding:12px 20px;border-top:1px solid var(--line);display:flex;gap:8px;flex-shrink:0;background:var(--surface-2);">' +
        '<button id="af-save-btn" class="btn btn-primary" style="height:36px;" data-path="' + path + '">Add as Tag</button>' +
        '<button id="af-cancel" class="btn" style="height:36px;">Cancel</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);
    document.getElementById('af-close').onclick  = function() { modal.remove(); };
    document.getElementById('af-cancel').onclick = function() { modal.remove(); };
    document.getElementById('af-save-btn').addEventListener('click', function() {
      TGE.bulkSaveArrayFilter(this.dataset.path);
    });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  };

  TGE.arrayFilterClose = function() {
    var m = document.getElementById('array-filter-modal');
    if (m) m.remove();
  };

  TGE.bulkSaveArrayFilter = function(arrayPath) {
    var name        = document.getElementById('af-tag-name').value.trim();
    var label       = document.getElementById('af-display').value.trim();
    var filterKey   = document.getElementById('af-filter-key').value;
    var filterVal   = document.getElementById('af-filter-val').value.trim();
    var extractField= document.getElementById('af-extract-field').value;
    var use         = document.getElementById('af-use').value;
    var desc        = document.getElementById('af-desc').value.trim();

    if (!name || !filterVal || !extractField) {
      alert('Tag name, filter value and extract field are all required.');
      return;
    }

    // Build a descriptive path that encodes the filter
    var tagPath = arrayPath + '[where ' + filterKey + '=' + filterVal + '].' + extractField;

    var tag = {
      name:        name,
      label:       label || name,
      use:         use,
      description: desc || ('From ' + arrayPath + '[] where ' + filterKey + ' = ' + filterVal),
      path:        tagPath,
      filterKey:   filterKey,
      filterVal:   filterVal,
      extractField:extractField,
      arrayPath:   arrayPath,
      example:     '',
      hardCheck:   false,
      isArrayFilter: true,
    };

    state.tags.push(tag);
    document.getElementById('array-filter-modal').remove();
    renderTagsList();

    // Show success in parse status
    var s = TGE.el('api-parse-status');
    if (s) { s.textContent = 'Array filter tag added: ' + name; s.style.color = 'var(--green-600)'; }
  };

  TGE.bulkRowToggle = function(idx, checked) {
    var row = document.getElementById('bulk-row-' + idx);
    if (row) row.style.opacity = checked ? '1' : '0.5';
    updateBulkCount();
  };

  TGE.bulkSelectAll = function(checked) {
    document.querySelectorAll('.bulk-include').forEach(function(cb) {
      cb.checked = checked;
      var idx = parseInt(cb.dataset.idx);
      var row = document.getElementById('bulk-row-' + idx);
      if (row) row.style.opacity = checked ? '1' : '0.5';
    });
    updateBulkCount();
  };

  function updateBulkCount() {
    var count = document.querySelectorAll('.bulk-include:checked').length;
    var label = document.getElementById('bulk-count-label');
    if (label) label.textContent = count + ' field' + (count!==1?'s':'') + ' selected to save as tags';
  }

  TGE.bulkSaveTags = function() {
    var newTags = [];
    document.querySelectorAll('.bulk-include:checked').forEach(function(cb) {
      var idx = parseInt(cb.dataset.idx);
      var path     = state.parsedFields[idx];
      var labelEl  = document.querySelector('.bulk-label[data-idx="' + idx + '"]');
      var useEl    = document.querySelector('.bulk-use[data-idx="' + idx + '"]');
      var hardEl   = document.querySelector('.bulk-hard-check[data-idx="' + idx + '"]');
      var descEl   = document.querySelector('.bulk-desc[data-idx="' + idx + '"]');

      var useVal = useEl ? useEl.value : 'display';
      if (useVal === '__custom__') {
        // Skip custom for now — user can edit after
        useVal = 'display';
      }

      newTags.push({
        name:        path.split('.').pop().replace('[]',''),
        label:       labelEl ? labelEl.value.trim() : path,
        use:         useVal,
        description: descEl ? descEl.value.trim() : '',
        path:        path,
        example:     state.parsedExamples[path] || '',
        hardCheck:   hardEl ? hardEl.classList.contains('on') : false,
      });
    });

    // Merge with existing tags (don't overwrite manually added ones)
    var existingPaths = state.tags.map(function(t) { return t.path; });
    newTags.forEach(function(t) {
      if (!existingPaths.includes(t.path)) {
        state.tags.push(t);
      }
    });

    document.getElementById('bulk-tag-modal').remove();
    renderTagsList();

    var statusEl = TGE.el('api-parse-status');
    if (statusEl) {
      statusEl.textContent = newTags.length + ' tags added successfully';
      statusEl.style.color = 'var(--green-600)';
    }
  };

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

  TGE.apiToggleHardCheck = function(el) {
    el.classList.toggle('on');
    var label = TGE.el('tag-hard-check-label');
    if (label) label.textContent = el.classList.contains('on')
      ? 'ON — hard check (fail if no match)'
      : 'Off — soft check only';
    if (el.classList.contains('on')) {
      label.style.color = 'var(--danger)';
      label.style.fontWeight = '600';
    } else {
      label.style.color = 'var(--ink)';
      label.style.fontWeight = 'normal';
    }
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

    var vendor = getCustomSelectValue('api-vendor');
    var entry = { apiId:apiId, label:label, group:group, method:method, url:url, notes:notes, vendor:vendor, sampleResponse:sample, fields:state.tags, active:true };

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

    var modal = document.createElement('div');
    modal.id = 'api-export-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;';

    var checkboxes = active.map(function(a) {
      return '<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;cursor:pointer;background:var(--surface-2);">' +
        '<input type="checkbox" class="export-api-check" value="' + a.apiId + '" checked style="width:15px;height:15px;cursor:pointer;" />' +
        '<span style="background:var(--ink);color:var(--yellow);padding:1px 7px;border-radius:999px;font-size:10px;font-weight:700;font-family:monospace;">' + a.apiId + '</span>' +
        '<span style="font-size:13px;font-weight:600;flex:1;">' + a.label + '</span>' +
        '<span class="badge badge-green" style="font-size:10px;">' + a.method + '</span>' +
      '</label>';
    }).join('');

    modal.innerHTML = '<div style="background:var(--surface);border-radius:14px;padding:20px;width:min(600px,100%);max-height:90vh;display:flex;flex-direction:column;gap:10px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">' +
        '<div><h3 style="margin:0;font-size:14px;font-weight:700;">Export API Definitions</h3>' +
        '<p style="margin:3px 0 0;font-size:12px;color:var(--muted);">Select which APIs to include</p></div>' +
        '<button id="export-modal-close" style="border:none;background:none;font-size:20px;cursor:pointer;color:var(--muted);line-height:1;">✕</button>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0;">' +
        '<button class="btn" style="height:28px;font-size:11px;" id="export-sel-all">Select All</button>' +
        '<button class="btn" style="height:28px;font-size:11px;" id="export-desel-all">Deselect All</button>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;overflow-y:auto;flex:1;" id="export-check-list">' + checkboxes + '</div>' +
      '<div id="export-json-area" style="display:none;flex-shrink:0;">' +
        '<textarea id="export-json-text" style="width:100%;min-height:160px;font-family:monospace;font-size:11px;border:1px solid var(--line);border-radius:8px;padding:10px;resize:vertical;background:var(--surface-2);" readonly></textarea>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-shrink:0;">' +
        '<button class="btn btn-primary" id="export-generate-btn" style="height:36px;">Generate Export</button>' +
        '<button class="btn" id="export-copy-btn" style="height:36px;display:none;">Copy to Clipboard</button>' +
        '<button class="btn" id="export-download-btn" style="height:36px;display:none;">Download JSON</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);

    document.getElementById('export-modal-close').onclick = function() { modal.remove(); };
    document.getElementById('export-sel-all').onclick   = function() { modal.querySelectorAll('.export-api-check').forEach(function(c){c.checked=true;}); };
    document.getElementById('export-desel-all').onclick = function() { modal.querySelectorAll('.export-api-check').forEach(function(c){c.checked=false;}); };
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    document.getElementById('export-generate-btn').onclick = function() {
      var selected = [];
      modal.querySelectorAll('.export-api-check:checked').forEach(function(c) {
        var found = active.find(function(a) { return a.apiId === c.value; });
        if (found) selected.push(found);
      });
      if (!selected.length) { alert('Select at least one API.'); return; }

      var json = JSON.stringify({ exportedAt: new Date().toISOString(), apiCount: selected.length, apis: selected }, null, 2);
      document.getElementById('export-json-text').value = json;
      document.getElementById('export-json-area').style.display = '';
      document.getElementById('export-copy-btn').style.display  = '';
      document.getElementById('export-download-btn').style.display = '';
      this.textContent = 'Regenerate';

      document.getElementById('export-copy-btn').onclick = function() {
        navigator.clipboard.writeText(json).then(function() {
          document.getElementById('export-copy-btn').textContent = 'Copied!';
          setTimeout(function() { document.getElementById('export-copy-btn').textContent = 'Copy to Clipboard'; }, 2000);
        });
      };

      document.getElementById('export-download-btn').onclick = function() {
        var a = document.createElement('a');
        a.href     = URL.createObjectURL(new Blob([json], { type:'application/json' }));
        a.download = 'tge-api-registry-' + new Date().toISOString().slice(0,10) + '.json';
        document.body.appendChild(a); a.click(); a.remove();
      };
    };
  }

  // ── Register ──────────────────────────────────────────────────────────────────
  var _orig = TGE.onAppReady;
  TGE.onAppReady = function () {
    if (typeof _orig === 'function') _orig();
    render();
  };

})();
