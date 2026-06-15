// TGE Asset Snapshot — API Registry
// public/api.js

(function () {
  'use strict';

  var TAG_USES = [
    { value: 'display',       label: 'Display data',        desc: 'Show this field on screen or in exports' },
    { value: 'feeds-next',    label: 'Feeds next API call', desc: 'Pass this value to the next API in the flow' },
    { value: 'filter-rule',   label: 'Filter / rule only',  desc: 'Used to filter or sort results, not displayed' },
    { value: 'internal',      label: 'Internal only',       desc: 'Used internally, never shown to users' },
  ];

  var API_GROUPS  = ['vehicle','device','camera','metrics','other'];
  var API_METHODS = ['GET','POST','PUT','DELETE'];

  var state = {
    apis:        [],
    editingApi:  null,
    panelMode:   null,
    tags:        [],
    saving:      false,
    addingTag:   false,
    tagForm:     { name:'', description:'', use:'display', path:'' },
    editingTagIdx: null,
  };

  var api = TGE.api;

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
      '<div id="api-panel" style="display:none;position:fixed;top:0;right:0;width:min(720px,100vw);height:100vh;background:var(--surface);box-shadow:-4px 0 24px rgba(0,0,0,0.15);z-index:201;flex-direction:column;overflow:hidden;">',
        '<div style="padding:18px 24px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">',
          '<div><div class="card-kicker" id="api-panel-kicker">Add API</div>',
          '<h2 style="font-size:16px;font-weight:700;color:var(--ink);margin:0;" id="api-panel-title">New API Definition</h2></div>',
          '<button onclick="TGE.apiClosePanel()" style="width:32px;height:32px;border-radius:7px;border:1px solid var(--line);background:var(--surface-2);color:var(--muted);cursor:pointer;font-size:16px;">✕</button>',
        '</div>',
        '<div style="flex:1;overflow-y:auto;padding:20px 24px;" id="api-panel-body">',

          // Section 1 — Basic Info
          '<div style="margin-bottom:24px;">',
            '<div class="card-kicker" style="margin-bottom:12px;">Section 1 — Basic Info</div>',
            '<div class="data-grid data-grid-3" style="margin-bottom:12px;">',
              '<div class="field"><label>API ID</label><input id="api-id" type="text" placeholder="e.g. API-9" /></div>',
              '<div class="field"><label>Label</label><input id="api-label" type="text" placeholder="e.g. Camera Events" /></div>',
              '<div class="field"><label>Group</label><select id="api-group">' + API_GROUPS.map(function(g){ return '<option value="'+g+'">'+g.charAt(0).toUpperCase()+g.slice(1)+'</option>'; }).join('') + '</select></div>',
              '<div class="field"><label>Method</label><select id="api-method">' + API_METHODS.map(function(m){ return '<option value="'+m+'">'+m+'</option>'; }).join('') + '</select></div>',
              '<div class="field" style="grid-column:span 2;"><label>URL</label><input id="api-url" type="text" placeholder="e.g. /v1/events?types=camera&pruning=B2B" /></div>',
            '</div>',
            '<div class="field"><label>Notes / Gotchas</label><textarea id="api-notes" rows="2" placeholder="e.g. Only returns last 24hrs, pick latest event per vehicleId"></textarea></div>',
          '</div>',

          // Section 2 — Sample Response
          '<div style="margin-bottom:24px;">',
            '<div class="card-kicker" style="margin-bottom:6px;">Section 2 — Sample Response</div>',
            '<p style="font-size:12px;color:var(--muted);margin-bottom:10px;">Paste a raw JSON response from this API. Once pasted you can click any value to use it as a field tag location.</p>',
            '<div class="field"><textarea id="api-sample" rows="8" placeholder=\'{"vehicleId":"306802","timeAt":"2026-06-14T07:00:00Z",...}\' style="font-family:monospace;font-size:11px;"></textarea></div>',
            '<button class="btn" style="height:32px;font-size:12px;" onclick="TGE.apiParseSample()">Parse JSON → highlight fields</button>',
            '<div id="api-sample-parsed" style="display:none;margin-top:12px;border:1px solid var(--line);border-radius:8px;padding:12px;background:var(--surface-2);font-family:monospace;font-size:11px;max-height:200px;overflow-y:auto;line-height:1.8;"></div>',
          '</div>',

          // Section 3 — Field Tags
          '<div style="margin-bottom:24px;">',
            '<div class="card-kicker" style="margin-bottom:6px;">Section 3 — Field Tags</div>',
            '<p style="font-size:12px;color:var(--muted);margin-bottom:10px;">Tag each field from this API — give it a name, describe what it is, and define how it\'s used.</p>',
            '<div id="api-tags-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;"></div>',
            '<button class="btn btn-primary" style="height:34px;font-size:12px;" onclick="TGE.apiOpenTagForm(null)">+ Add Tag</button>',
          '</div>',

        '</div>',
        '<div style="padding:14px 24px;border-top:1px solid var(--line);display:flex;gap:10px;align-items:center;flex-shrink:0;">',
          '<button class="btn btn-primary" id="api-save-btn" type="button" onclick="TGE.apiSave()">Save API</button>',
          '<button class="btn" type="button" onclick="TGE.apiClosePanel()">Cancel</button>',
          '<p id="api-panel-message" style="margin:0;font-size:12px;"></p>',
        '</div>',
      '</div>',


      // JSON picker overlay
      '<div id="json-picker-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:400;display:flex;align-items:center;justify-content:center;padding:20px;">',
        '<div style="background:var(--surface);border-radius:14px;padding:24px;width:min(680px,100%);max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.2);">',
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">',
            '<h3 style="margin:0;font-size:15px;font-weight:700;">Pick Field from JSON</h3>',
            '<button onclick="TGE.apiCloseJsonPicker()" style="border:none;background:none;font-size:18px;cursor:pointer;color:var(--muted);">✕</button>',
          '</div>',
          '<p style="font-size:12px;color:var(--muted);margin-bottom:10px;">Click any value to use its path as the field location.</p>',
          '<div id="json-picker-tree" style="flex:1;overflow-y:auto;font-family:monospace;font-size:12px;border:1px solid var(--line);border-radius:8px;padding:12px;background:var(--surface-2);max-height:400px;line-height:2;"></div>',
        '</div>',
      '</div>',

    ].join('');

    // Wire tabs
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

    TGE.on('api-add-btn',    'click', function() { openPanel('create', null); });
    TGE.on('api-export-btn', 'click', exportJson);

    // Fix json picker overlay
    var jpo = TGE.el('json-picker-overlay');
    if (jpo) jpo.style.display = 'none';

    loadApis();
  }

  // ── Load / render API list ────────────────────────────────────────────────────
  async function loadApis() {
    var result = await api('GET', '/api/registry/apis?all=1');
    if (result.ok && result.data.apis && result.data.apis.length) {
      state.apis = result.data.apis;
    } else {
      state.apis = [];
    }
    renderApiList();
  }

  function renderApiList() {
    var list = TGE.el('api-list');
    if (!list) return;
    if (!state.apis.length) {
      list.innerHTML = '<div class="card" style="text-align:center;color:var(--muted);padding:40px;">No APIs defined yet. Click "+ Add API" to start.</div>';
      return;
    }
    var groupColors = { vehicle:'badge-green', device:'badge-yellow', camera:'badge-gray', metrics:'badge-green', other:'badge-gray' };
    list.innerHTML = state.apis.map(function(a) {
      var tagCount = Array.isArray(a.fields) ? a.fields.length : 0;
      var hasSample = a.sampleResponse && a.sampleResponse.length > 10;
      return '<div class="card" style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;">' +
        '<div>' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">' +
            '<span style="background:var(--ink);color:var(--yellow);padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;font-family:monospace;">' + a.apiId + '</span>' +
            '<span class="badge badge-green" style="font-size:10px;">' + a.method + '</span>' +
            '<span class="badge ' + (groupColors[a.group]||'badge-gray') + '" style="font-size:10px;">' + a.group + '</span>' +
            (hasSample ? '<span class="badge badge-green" style="font-size:10px;">sample ✓</span>' : '<span class="badge badge-gray" style="font-size:10px;">no sample</span>') +
            '<span class="badge badge-gray" style="font-size:10px;">' + tagCount + ' tag' + (tagCount!==1?'s':'') + '</span>' +
          '</div>' +
          '<div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:4px;">' + a.label + '</div>' +
          '<code style="font-size:11px;color:var(--muted);display:block;margin-bottom:6px;">' + a.url + '</code>' +
          (a.notes ? '<div style="font-size:12px;color:var(--muted);">' + a.notes + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' +
          '<button class="btn btn-primary" style="height:28px;font-size:11px;padding:0 10px;" onclick="TGE.apiEdit(\'' + a.apiId + '\')">Edit</button>' +
          '<button class="btn" style="height:28px;font-size:11px;padding:0 10px;" onclick="TGE.apiToggleActive(\'' + a.apiId + '\',' + (isActive?'false':'true') + ')">' + (isActive ? 'Deactivate' : 'Activate') + '</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ── Panel open/close ──────────────────────────────────────────────────────────
  function openPanel(mode, apiId) {
    state.panelMode  = mode;
    state.editingApi = null;
    state.tags       = [];

    if (mode === 'edit' && apiId) {
      var existing = state.apis.find(function(a) { return a.apiId === apiId; });
      if (!existing) return;
      state.editingApi = existing;
      state.tags       = JSON.parse(JSON.stringify(existing.fields || []));
      TGE.el('api-panel-kicker').textContent = 'Edit API';
      TGE.el('api-panel-title').textContent  = existing.label;
      TGE.el('api-id').value     = existing.apiId;
      TGE.el('api-label').value  = existing.label;
      TGE.el('api-group').value  = existing.group;
      TGE.el('api-method').value = existing.method;
      TGE.el('api-url').value    = existing.url;
      TGE.el('api-notes').value  = existing.notes || '';
      TGE.el('api-sample').value = existing.sampleResponse || '';
      TGE.el('api-save-btn').textContent = 'Update API';
    } else {
      TGE.el('api-panel-kicker').textContent = 'Add API';
      TGE.el('api-panel-title').textContent  = 'New API Definition';
      TGE.el('api-id').value     = 'API-' + (state.apis.length + 1);
      TGE.el('api-label').value  = '';
      TGE.el('api-group').value  = 'vehicle';
      TGE.el('api-method').value = 'GET';
      TGE.el('api-url').value    = '';
      TGE.el('api-notes').value  = '';
      TGE.el('api-sample').value = '';
      TGE.el('api-save-btn').textContent = 'Save API';
    }

    TGE.el('api-panel-message').textContent = '';
    TGE.el('api-sample-parsed').style.display = 'none';
    renderTagsList();

    TGE.el('api-panel-overlay').style.display = 'block';
    TGE.el('api-panel').style.display         = 'flex';
  }

  TGE.apiEdit   = function(id) { openPanel('edit', id); };
  TGE.apiDelete = async function(id) {
    if (!confirm('Delete ' + id + '? This cannot be undone.')) return;
    state.apis = state.apis.filter(function(a) { return a.apiId !== id; });
    await api('DELETE', '/api/registry/apis/' + encodeURIComponent(id));
    renderApiList();
  };
  TGE.apiClosePanel = function() {
    TGE.el('api-panel-overlay').style.display = 'none';
    TGE.el('api-panel').style.display         = 'none';
  };

  // ── Tags list ─────────────────────────────────────────────────────────────────
  function renderTagsList() {
    var list = TGE.el('api-tags-list');
    if (!list) return;
    if (!state.tags.length) {
      list.innerHTML = '<p style="font-size:12px;color:var(--muted);font-style:italic;">No tags yet. Click "+ Add Tag" to define fields for this API.</p>';
      return;
    }
    var useColors = { 'display':'badge-green', 'feeds-next':'badge-yellow', 'filter-rule':'badge-gray', 'internal':'badge-gray' };
    var useLabels = { 'display':'Display', 'feeds-next':'Feeds next API', 'filter-rule':'Filter/rule', 'internal':'Internal' };
    list.innerHTML = state.tags.map(function(t, idx) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface-2);">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<code style="font-size:12px;font-weight:600;color:var(--ink);">' + (t.name||'unnamed') + '</code>' +
          '<span class="badge ' + (useColors[t.use]||'badge-gray') + '" style="font-size:10px;">' + (useLabels[t.use]||t.use) + '</span>' +
          (t.path ? '<code style="font-size:10px;color:var(--muted);">' + t.path + '</code>' : '') +
          (t.description ? '<span style="font-size:11px;color:var(--muted);">— ' + t.description + '</span>' : '') +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0;">' +
          '<button class="btn" style="height:26px;font-size:11px;padding:0 8px;" onclick="TGE.apiOpenTagForm(' + idx + ')">Edit</button>' +
          '<button class="btn btn-danger" style="height:26px;font-size:11px;padding:0 8px;" onclick="TGE.apiRemoveTag(' + idx + ')">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  TGE.apiRemoveTag = function(idx) {
    state.tags.splice(idx, 1);
    renderTagsList();
  };

  // ── Tag form ──────────────────────────────────────────────────────────────────
  TGE.apiOpenTagForm = function(idx) {
    state.editingTagIdx = idx;
    var tag = idx !== null ? state.tags[idx] : { name:'', description:'', use:'display', path:'' };
    TGE.el('tag-form-title').textContent = idx !== null ? 'Edit Tag' : 'Add Tag';
    TGE.el('tag-name').value        = tag.name || '';
    TGE.el('tag-description').value = tag.description || '';
    TGE.el('tag-path').value        = tag.path || '';
    // Set radio
    document.querySelectorAll('input[name="tag-use"]').forEach(function(r) {
      r.checked = r.value === (tag.use || 'display');
    });
    var form = TGE.el('tag-inline-form'); var btn = TGE.el('tag-add-btn-wrap'); if (form) form.style.display = ''; if (btn) btn.style.display = 'none'; if (form) form.scrollIntoView({behavior:'smooth',block:'nearest'});
  };

  TGE.apiCloseTagForm = function() {
    var form2 = TGE.el('tag-inline-form'); var btn2 = TGE.el('tag-add-btn-wrap'); if (form2) form2.style.display = 'none'; if (btn2) btn2.style.display = '';
  };

  TGE.apiSaveTag = function() {
    var name = TGE.el('tag-name').value.trim();
    var desc = TGE.el('tag-description').value.trim();
    var path = TGE.el('tag-path').value.trim();
    var useEl = document.querySelector('input[name="tag-use"]:checked');
    var use  = useEl ? useEl.value : 'display';

    if (!name) { alert('Field name is required.'); return; }

    var tag = { name: name, description: desc, use: use, path: path };

    if (state.editingTagIdx !== null) {
      state.tags[state.editingTagIdx] = tag;
    } else {
      state.tags.push(tag);
    }

    TGE.apiCloseTagForm();
    renderTagsList();
  };

  // ── JSON sample parser / picker ───────────────────────────────────────────────
  TGE.apiParseSample = function() {
    var raw = TGE.el('api-sample').value.trim();
    if (!raw) { alert('Paste a JSON response first.'); return; }
    var parsed;
    try { parsed = JSON.parse(raw); } catch(e) { alert('Invalid JSON: ' + e.message); return; }

    var html = renderJsonTree(parsed, '');
    var container = TGE.el('api-sample-parsed');
    container.innerHTML = '<div style="color:var(--muted);font-size:10px;margin-bottom:6px;">Click any value to use its path as a tag location:</div>' + html;
    container.style.display = 'block';
  };

  function renderJsonTree(obj, prefix) {
    if (obj === null || obj === undefined) return '';
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '<span style="color:var(--muted);">[]</span>';
      return renderJsonTree(obj[0], prefix + '[]');
    }
    if (typeof obj === 'object') {
      return Object.keys(obj).map(function(key) {
        var fullPath = prefix ? prefix + '.' + key : key;
        var val = obj[key];
        if (typeof val === 'object' && val !== null) {
          return '<div style="padding-left:12px;">' +
            '<span style="color:var(--green-700);font-weight:600;">' + key + '</span>: ' +
            renderJsonTree(val, fullPath) +
          '</div>';
        }
        var display = JSON.stringify(val);
        if (display && display.length > 40) display = display.slice(0,40) + '…"';
        return '<div style="padding-left:12px;">' +
          '<span style="color:var(--green-700);font-weight:600;">' + key + '</span>: ' +
          '<span class="json-val" data-path="' + fullPath + '" style="color:var(--ink-2);cursor:pointer;padding:0 4px;border-radius:3px;" ' +
            'onmouseover="this.style.background=\'var(--green-100)\'" ' +
            'onmouseout="this.style.background=\'\'" ' +
            'onclick="TGE.apiSelectJsonPath(\'' + fullPath + '\')">' + display + '</span>' +
        '</div>';
      }).join('');
    }
    // Primitive
    var display2 = JSON.stringify(obj);
    if (display2 && display2.length > 40) display2 = display2.slice(0,40) + '…"';
    return '<span class="json-val" data-path="' + prefix + '" style="color:var(--ink-2);cursor:pointer;padding:0 4px;border-radius:3px;" ' +
      'onmouseover="this.style.background=\'var(--green-100)\'" ' +
      'onmouseout="this.style.background=\'\'" ' +
      'onclick="TGE.apiSelectJsonPath(\'' + prefix + '\')">' + display2 + '</span>';
  }

  TGE.apiPickFromSample = function() {
    var raw = TGE.el('api-sample').value.trim();
    if (!raw) { alert('Paste a JSON response in Section 2 first, then click Parse.'); return; }
    var parsed;
    try { parsed = JSON.parse(raw); } catch(e) { alert('Invalid JSON — check Section 2.'); return; }
    var html = renderJsonTree(parsed, '');
    TGE.el('json-picker-tree').innerHTML = '<div style="color:var(--muted);font-size:10px;margin-bottom:8px;">Click any value to select its path:</div>' + html;
    TGE.el('json-picker-overlay').style.display = 'flex';
  };

  TGE.apiSelectJsonPath = function(path) {
    TGE.el('tag-path').value = path;
    TGE.el('json-picker-overlay').style.display = 'none';
  };

  TGE.apiCloseJsonPicker = function() {
    TGE.el('json-picker-overlay').style.display = 'none';
  };

  // ── Toggle active ─────────────────────────────────────────────────────────────
  TGE.apiToggleActive = async function(apiId, makeActive) {
    var entry = state.apis.find(function(a) { return a.apiId === apiId; });
    if (!entry) return;
    entry.active = makeActive;
    await api('PUT', '/api/registry/apis/' + encodeURIComponent(apiId), entry);
    renderApiList();
  };

  // ── Save API ──────────────────────────────────────────────────────────────────
  TGE.apiSave = async function() {
    if (state.saving) return;
    var msgEl  = TGE.el('api-panel-message');
    var apiId  = TGE.el('api-id').value.trim().toUpperCase();
    var label  = TGE.el('api-label').value.trim();
    var group  = TGE.el('api-group').value;
    var method = TGE.el('api-method').value;
    var url    = TGE.el('api-url').value.trim();
    var notes  = TGE.el('api-notes').value.trim();
    var sample = TGE.el('api-sample').value.trim();

    if (!apiId || !label || !url) {
      msgEl.textContent = 'API ID, label and URL are required.';
      msgEl.style.color = 'var(--danger)';
      return;
    }

    var entry = { apiId:apiId, label:label, group:group, method:method, url:url, notes:notes, sampleResponse:sample, fields:state.tags };

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
      msgEl.textContent = 'Error saving: ' + e.message;
      msgEl.style.color = 'var(--danger)';
    } finally {
      state.saving = false;
      btn.textContent = state.panelMode === 'edit' ? 'Update API' : 'Save API';
      btn.disabled = false;
    }
  };

  // ── Export JSON ───────────────────────────────────────────────────────────────
  function exportJson() {
    if (!state.apis.length) { alert('No APIs defined yet.'); return; }
    var json = JSON.stringify({ exportedAt: new Date().toISOString(), apis: state.apis }, null, 2);
    var modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = '<div style="background:var(--surface);border-radius:14px;padding:24px;width:min(700px,100%);max-height:85vh;display:flex;flex-direction:column;gap:12px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<div><h3 style="margin:0;font-size:15px;font-weight:700;">API Registry Export</h3>' +
        '<p style="margin:4px 0 0;font-size:12px;color:var(--muted);">' + state.apis.length + ' APIs · Copy and paste into chat to use as coding reference</p></div>' +
        '<button onclick="this.closest(\'div\').parentElement.remove()" style="border:none;background:none;font-size:18px;cursor:pointer;color:var(--muted);">✕</button>' +
      '</div>' +
      '<textarea style="flex:1;min-height:320px;font-family:monospace;font-size:11px;border:1px solid var(--line);border-radius:8px;padding:12px;resize:none;background:var(--surface-2);" readonly>' + json + '</textarea>' +
      '<div style="display:flex;gap:8px;">' +
        '<button class="btn btn-primary" onclick="navigator.clipboard.writeText(this.closest(\'div\').previousElementSibling.value).then(function(){alert(\'Copied!\')})">Copy to Clipboard</button>' +
        '<button class="btn" onclick="(function(j){var a=document.createElement(\'a\');a.href=URL.createObjectURL(new Blob([j],{type:\'application/json\'}));a.download=\'tge-api-registry-\'+new Date().toISOString().slice(0,10)+\'.json\';a.click()})(this.closest(\'div\').previousElementSibling.value)">Download JSON</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(modal);
  }

  // ── Default APIs ──────────────────────────────────────────────────────────────
  function getDefaultApis() {
    return [
      { apiId:'API-1', label:'Vehicles',            group:'vehicle', method:'GET', url:'/v1/vehicles',                                notes:'Returns all active fleet vehicles', sampleResponse:'', fields:[
        { name:'id',           description:'Unique vehicle identifier',   use:'feeds-next', path:'id'           },
        { name:'name',         description:'Fleet number / asset number', use:'display',    path:'name'         },
        { name:'registration', description:'Vehicle registration plate',  use:'display',    path:'registration' },
        { name:'make',         description:'Vehicle make',                use:'display',    path:'make'         },
        { name:'model',        description:'Vehicle model',               use:'display',    path:'model'        },
      ]},
      { apiId:'API-2', label:'All Devices',         group:'device',  method:'GET', url:'/v1/devices',                                notes:'Maps IMEI to vehicleId. Use to resolve IMEI to vehicle', sampleResponse:'', fields:[
        { name:'imei',      description:'Device IMEI number',    use:'filter-rule', path:'imei'      },
        { name:'vehicleId', description:'Linked vehicle ID',     use:'feeds-next',  path:'vehicleId' },
        { name:'type',      description:'Device type code',      use:'filter-rule', path:'type.code' },
      ]},
      { apiId:'API-3', label:'Device Stats',        group:'device',  method:'GET', url:'/v1/devices/{imei}?embed=devicestats',       notes:'Per-device stats including SD card health', sampleResponse:'', fields:[
        { name:'sdCard1Present',  description:'SD Card 1 inserted',     use:'display', path:'deviceStats.sdCard1.present'        },
        { name:'sdCard1Size',     description:'SD Card 1 total size',   use:'display', path:'deviceStats.sdCard1.totalSizeBytes'  },
        { name:'sdCard2Present',  description:'SD Card 2 inserted',     use:'display', path:'deviceStats.sdCard2.present'        },
        { name:'sdCard2Size',     description:'SD Card 2 total size',   use:'display', path:'deviceStats.sdCard2.totalSizeBytes'  },
        { name:'overallStatus',   description:'Overall camera status',  use:'display', path:'deviceStats.overallStatus'          },
      ]},
      { apiId:'API-4', label:'Camera Events',       group:'camera',  method:'GET', url:'/v1/events?types=camera&pruning=B2B',        notes:'Last 24hrs only. Pick latest event per vehicleId. Images in attributes.context.response.mediaFiles', sampleResponse:'', fields:[
        { name:'vehicleId',  description:'Vehicle this event belongs to', use:'filter-rule', path:'vehicleId'                                    },
        { name:'timeAt',     description:'Event timestamp — pick latest', use:'filter-rule', path:'timeAt'                                       },
        { name:'mediaFiles', description:'Array of camera image objects', use:'display',     path:'attributes.context.response.mediaFiles'        },
      ]},
      { apiId:'API-5', label:'Camera Device Stats', group:'camera',  method:'GET', url:'/v1/devices/{cameraId}/camera-device-stats', notes:'Camera-specific hardware stats', sampleResponse:'', fields:[
        { name:'sdCard1', description:'SD Card 1 status', use:'display', path:'sdCard1' },
        { name:'sdCard2', description:'SD Card 2 status', use:'display', path:'sdCard2' },
      ]},
      { apiId:'API-6', label:'Hermes Stats',        group:'metrics', method:'GET', url:'/v1/vehicles/{vehicleId}/hermes-stats',      notes:'Live vehicle telemetry — GPS, ignition, speed, GPIO, driver', sampleResponse:'', fields:[
        { name:'latitude',   description:'GPS latitude',    use:'display', path:'gps.lat'    },
        { name:'longitude',  description:'GPS longitude',   use:'display', path:'gps.lng'    },
        { name:'ignition',   description:'Ignition status', use:'display', path:'ignition'   },
        { name:'speed',      description:'Current speed',   use:'display', path:'speed'      },
        { name:'rpm',        description:'Engine RPM',      use:'display', path:'rpm'        },
        { name:'driverName', description:'Logged-in driver',use:'display', path:'driverName' },
      ]},
      { apiId:'API-7', label:'Vehicle Meters',      group:'metrics', method:'GET', url:'/v1/vehicles/{vehicleId}/meters',            notes:'Odometer and engine hours', sampleResponse:'', fields:[
        { name:'odometer',    description:'Total distance (km)', use:'display', path:'odometer'    },
        { name:'engineHours', description:'Total engine hours',  use:'display', path:'engineHours' },
      ]},
      { apiId:'API-8', label:'Vehicle Devices',     group:'vehicle', method:'GET', url:'/v1/vehicles/{vehicleId}/devices',           notes:'All devices linked to a specific vehicle', sampleResponse:'', fields:[
        { name:'imei',         description:'Device IMEI',        use:'display', path:'imei'         },
        { name:'type',         description:'Device type',        use:'display', path:'type.code'    },
        { name:'serialNumber', description:'Serial number',      use:'display', path:'serialNumber' },
      ]},
    ];
  }

  // ── Register ──────────────────────────────────────────────────────────────────
  var _orig = TGE.onAppReady;
  TGE.onAppReady = function () {
    if (typeof _orig === 'function') _orig();
    render();
  };

})();
