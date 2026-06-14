// TGE Asset Snapshot — API Registry
// public/api.js

(function () {
  'use strict';

  // ── Field types ───────────────────────────────────────────────────────────────
  var FIELD_TYPES    = ['string','number','date','boolean','array','object','image-url'];
  var FIELD_PURPOSES = ['filter','display','feeds-next-api','pick-rule','map-to-output','internal-only'];
  var API_GROUPS     = ['vehicle','device','camera','metrics','other'];
  var API_METHODS    = ['GET','POST','PUT','DELETE'];

  // ── State ─────────────────────────────────────────────────────────────────────
  var state = {
    apis:        [],
    editingApi:  null,
    panelMode:   null,
    fields:      [],   // field rows in panel
    saving:      false,
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

      // Tab contents
      '<div id="api-content-definitions">',
        '<div id="api-list" style="display:grid;gap:10px;"></div>',
      '</div>',
      '<div id="api-content-flows" style="display:none;">',
        '<div class="card">',
          '<div class="card-kicker">Page Flows</div>',
          '<div class="card-title">Coming in Phase 2</div>',
          '<p style="font-size:13px;color:var(--muted);">Once your API definitions are complete, use Page Flows to chain APIs together per page and export the full registry as JSON.</p>',
        '</div>',
      '</div>',

      // Overlay
      '<div id="api-panel-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:200;" onclick="TGE.apiClosePanel()"></div>',

      // Floating panel
      '<div id="api-panel" style="display:none;position:fixed;top:0;right:0;width:min(740px,100vw);height:100vh;background:var(--surface);box-shadow:-4px 0 24px rgba(0,0,0,0.15);z-index:201;flex-direction:column;overflow:hidden;">',

        // Panel header
        '<div style="padding:18px 24px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">',
          '<div>',
            '<div class="card-kicker" id="api-panel-kicker">Add API</div>',
            '<h2 style="font-size:16px;font-weight:700;color:var(--ink);margin:0;" id="api-panel-title">New API Definition</h2>',
          '</div>',
          '<button onclick="TGE.apiClosePanel()" style="width:32px;height:32px;border-radius:7px;border:1px solid var(--line);background:var(--surface-2);color:var(--muted);cursor:pointer;font-size:16px;">✕</button>',
        '</div>',

        // Panel body
        '<div style="flex:1;overflow-y:auto;padding:20px 24px;" id="api-panel-body">',

          // Section 1 — Basic Info
          '<div class="card-kicker" style="margin-bottom:10px;">Section 1 — Basic Info</div>',
          '<div class="data-grid data-grid-3" style="margin-bottom:16px;">',
            '<div class="field"><label>API ID</label><input id="api-id" type="text" placeholder="e.g. API-9" /></div>',
            '<div class="field"><label>Label</label><input id="api-label" type="text" placeholder="e.g. Camera Events" /></div>',
            '<div class="field"><label>Group</label><select id="api-group">' + API_GROUPS.map(function(g){ return '<option value="'+g+'">'+g.charAt(0).toUpperCase()+g.slice(1)+'</option>'; }).join('') + '</select></div>',
            '<div class="field"><label>Method</label><select id="api-method">' + API_METHODS.map(function(m){ return '<option value="'+m+'">'+m+'</option>'; }).join('') + '</select></div>',
            '<div class="field" style="grid-column:span 2;"><label>URL</label><input id="api-url" type="text" placeholder="e.g. /v1/events?types=camera&pruning=B2B" /></div>',
          '</div>',
          '<div class="field" style="margin-bottom:16px;"><label>Notes / Gotchas</label><textarea id="api-notes" rows="2" placeholder="e.g. Only returns last 24hrs, pick latest event per vehicleId"></textarea></div>',

          // Section 2 — Field Definitions
          '<div class="card-kicker" style="margin-bottom:10px;">Section 2 — Field Definitions</div>',
          '<p style="font-size:12px;color:var(--muted);margin-bottom:10px;">Define every field returned by this API. Be specific — this is what I use when writing code.</p>',
          '<div style="overflow-x:auto;">',
            '<table style="width:100%;border-collapse:collapse;font-size:12px;" id="api-fields-table">',
              '<thead>',
                '<tr style="background:var(--surface-2);">',
                  '<th style="padding:8px;text-align:left;border:1px solid var(--line);white-space:nowrap;">Field Path</th>',
                  '<th style="padding:8px;text-align:left;border:1px solid var(--line);">Type</th>',
                  '<th style="padding:8px;text-align:left;border:1px solid var(--line);">Display Label</th>',
                  '<th style="padding:8px;text-align:left;border:1px solid var(--line);">Purpose</th>',
                  '<th style="padding:8px;text-align:left;border:1px solid var(--line);">Feeds Next?</th>',
                  '<th style="padding:8px;text-align:left;border:1px solid var(--line);">Output?</th>',
                  '<th style="padding:8px;border:1px solid var(--line);width:36px;"></th>',
                '</tr>',
              '</thead>',
              '<tbody id="api-fields-body"></tbody>',
            '</table>',
          '</div>',
          '<button class="btn" style="margin-top:8px;font-size:12px;height:32px;" onclick="TGE.apiAddField()">+ Add Field</button>',

          // Section 3 — Sample Response
          '<div class="card-kicker" style="margin:20px 0 10px;">Section 3 — Sample Response</div>',
          '<p style="font-size:12px;color:var(--muted);margin-bottom:8px;">Paste a raw JSON response from this API. Used as reference when building flows.</p>',
          '<div class="field">',
            '<textarea id="api-sample" rows="8" placeholder=\'{"id":123,"vehicleId":"306802",...}\' style="font-family:monospace;font-size:11px;"></textarea>',
          '</div>',

        '</div>',

        // Panel footer
        '<div style="padding:14px 24px;border-top:1px solid var(--line);display:flex;gap:10px;align-items:center;flex-shrink:0;">',
          '<button class="btn btn-primary" id="api-save-btn" type="button" onclick="TGE.apiSave()">Save API</button>',
          '<button class="btn" type="button" onclick="TGE.apiClosePanel()">Cancel</button>',
          '<p id="api-panel-message" style="margin:0;font-size:12px;"></p>',
        '</div>',
      '</div>',

    ].join('');

    wireTabs();
    TGE.on('api-add-btn',    'click', function() { openPanel('create', null); });
    TGE.on('api-export-btn', 'click', exportJson);
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
    var result = await api('GET', '/api/registry/apis');
    if (result.ok) {
      state.apis = result.data.apis || [];
    } else {
      // Use built-in defaults if registry not yet set up
      state.apis = getDefaultApis();
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

    var groupColors = { vehicle: 'badge-green', device: 'badge-yellow', camera: 'badge-gray', metrics: 'badge-green', other: 'badge-gray' };

    list.innerHTML = state.apis.map(function(a) {
      var fieldCount = Array.isArray(a.fields) ? a.fields.length : 0;
      var hasSample  = a.sampleResponse && a.sampleResponse.length > 10;
      return '<div class="card" style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;">' +
        '<div>' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">' +
            '<span style="background:var(--ink);color:var(--yellow);padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;font-family:monospace;">' + a.apiId + '</span>' +
            '<span class="badge badge-green" style="font-size:10px;">' + a.method + '</span>' +
            '<span class="badge ' + (groupColors[a.group] || 'badge-gray') + '" style="font-size:10px;">' + a.group + '</span>' +
            (hasSample  ? '<span class="badge badge-green" style="font-size:10px;">sample ✓</span>' : '') +
          '</div>' +
          '<div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:4px;">' + a.label + '</div>' +
          '<code style="font-size:11px;color:var(--muted);display:block;margin-bottom:6px;">' + a.url + '</code>' +
          '<div style="font-size:12px;color:var(--muted);">' + fieldCount + ' field' + (fieldCount !== 1 ? 's' : '') + ' defined' + (a.notes ? ' · ' + a.notes.slice(0,60) + (a.notes.length > 60 ? '…' : '') : '') + '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' +
          '<button class="btn" style="height:28px;font-size:11px;padding:0 10px;white-space:nowrap;" onclick="TGE.apiEdit(\'' + a.apiId + '\')">Edit</button>' +
          '<button class="btn btn-danger" style="height:28px;font-size:11px;padding:0 10px;" onclick="TGE.apiDelete(\'' + a.apiId + '\')">Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ── Panel open/close ──────────────────────────────────────────────────────────
  function openPanel(mode, apiId) {
    state.panelMode  = mode;
    state.editingApi = null;
    state.fields     = [];

    var overlay = TGE.el('api-panel-overlay');
    var panel   = TGE.el('api-panel');

    if (mode === 'edit' && apiId) {
      var existing = state.apis.find(function(a) { return a.apiId === apiId; });
      if (!existing) return;
      state.editingApi = existing;
      state.fields     = JSON.parse(JSON.stringify(existing.fields || []));

      TGE.el('api-panel-kicker').textContent = 'Edit API';
      TGE.el('api-panel-title').textContent  = existing.label;
      TGE.el('api-id').value      = existing.apiId;
      TGE.el('api-label').value   = existing.label;
      TGE.el('api-group').value   = existing.group;
      TGE.el('api-method').value  = existing.method;
      TGE.el('api-url').value     = existing.url;
      TGE.el('api-notes').value   = existing.notes || '';
      TGE.el('api-sample').value  = existing.sampleResponse || '';
      TGE.el('api-save-btn').textContent = 'Update API';

    } else {
      TGE.el('api-panel-kicker').textContent = 'Add API';
      TGE.el('api-panel-title').textContent  = 'New API Definition';
      TGE.el('api-id').value      = 'API-' + (state.apis.length + 1);
      TGE.el('api-label').value   = '';
      TGE.el('api-group').value   = 'vehicle';
      TGE.el('api-method').value  = 'GET';
      TGE.el('api-url').value     = '';
      TGE.el('api-notes').value   = '';
      TGE.el('api-sample').value  = '';
      TGE.el('api-save-btn').textContent = 'Save API';
    }

    TGE.el('api-panel-message').textContent = '';
    renderFieldsTable();

    if (overlay) overlay.style.display = 'block';
    if (panel)   panel.style.display   = 'flex';
  }

  TGE.apiEdit  = function(id) { openPanel('edit', id); };
  TGE.apiDelete = async function(id) {
    if (!confirm('Delete ' + id + '? This cannot be undone.')) return;
    var result = await api('DELETE', '/api/registry/apis/' + encodeURIComponent(id));
    if (result.ok || result.status === 404) {
      state.apis = state.apis.filter(function(a) { return a.apiId !== id; });
      renderApiList();
    }
  };

  TGE.apiClosePanel = function() {
    var overlay = TGE.el('api-panel-overlay');
    var panel   = TGE.el('api-panel');
    if (overlay) overlay.style.display = 'none';
    if (panel)   panel.style.display   = 'none';
  };

  // ── Field table ───────────────────────────────────────────────────────────────
  function renderFieldsTable() {
    var tbody = TGE.el('api-fields-body');
    if (!tbody) return;

    tbody.innerHTML = state.fields.map(function(f, idx) {
      return '<tr>' +
        '<td style="padding:4px;border:1px solid var(--line);"><input type="text" value="' + (f.path||'') + '" placeholder="e.g. attributes.context.vehicleId" onchange="TGE.apiFieldUpdate(' + idx + ',\'path\',this.value)" style="width:100%;border:none;font:inherit;font-size:11px;font-family:monospace;" /></td>' +
        '<td style="padding:4px;border:1px solid var(--line);"><select onchange="TGE.apiFieldUpdate(' + idx + ',\'type\',this.value)" style="width:100%;border:none;font:inherit;font-size:11px;">' +
          FIELD_TYPES.map(function(t){ return '<option value="'+t+'"'+(f.type===t?' selected':'')+'>'+t+'</option>'; }).join('') +
        '</select></td>' +
        '<td style="padding:4px;border:1px solid var(--line);"><input type="text" value="' + (f.label||'') + '" placeholder="e.g. Snapshot Time" onchange="TGE.apiFieldUpdate(' + idx + ',\'label\',this.value)" style="width:100%;border:none;font:inherit;font-size:11px;" /></td>' +
        '<td style="padding:4px;border:1px solid var(--line);"><select onchange="TGE.apiFieldUpdate(' + idx + ',\'purpose\',this.value)" style="width:100%;border:none;font:inherit;font-size:11px;">' +
          FIELD_PURPOSES.map(function(p){ return '<option value="'+p+'"'+(f.purpose===p?' selected':'')+'>'+p+'</option>'; }).join('') +
        '</select></td>' +
        '<td style="padding:4px;border:1px solid var(--line);text-align:center;"><input type="checkbox"'+(f.feedsNext?' checked':''),' onchange="TGE.apiFieldUpdate(' + idx + ',\'feedsNext\',this.checked)" /></td>' +
        '<td style="padding:4px;border:1px solid var(--line);text-align:center;"><input type="checkbox"'+(f.isOutput?' checked':''),' onchange="TGE.apiFieldUpdate(' + idx + ',\'isOutput\',this.checked)" /></td>' +
        '<td style="padding:4px;border:1px solid var(--line);text-align:center;"><button onclick="TGE.apiRemoveField(' + idx + ')" style="border:none;background:none;color:var(--danger);cursor:pointer;font-size:14px;">✕</button></td>' +
      '</tr>';
    }).join('');
  }

  TGE.apiAddField = function() {
    state.fields.push({ path: '', type: 'string', label: '', purpose: 'display', feedsNext: false, isOutput: true });
    renderFieldsTable();
  };

  TGE.apiFieldUpdate = function(idx, key, value) {
    if (state.fields[idx]) state.fields[idx][key] = value;
  };

  TGE.apiRemoveField = function(idx) {
    state.fields.splice(idx, 1);
    renderFieldsTable();
  };

  // ── Save ──────────────────────────────────────────────────────────────────────
  TGE.apiSave = async function() {
    if (state.saving) return;
    var msgEl = TGE.el('api-panel-message');

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

    var entry = { apiId: apiId, label: label, group: group, method: method, url: url, notes: notes, sampleResponse: sample, fields: state.fields };

    state.saving = true;
    var btn = TGE.el('api-save-btn');
    btn.textContent = 'Saving...'; btn.disabled = true;

    try {
      var result;
      if (state.panelMode === 'edit') {
        result = await api('PUT', '/api/registry/apis/' + encodeURIComponent(state.editingApi.apiId), entry);
      } else {
        result = await api('POST', '/api/registry/apis', entry);
      }

      if (!result.ok) {
        // Save locally if API not available yet
        if (state.panelMode === 'edit') {
          var idx = state.apis.findIndex(function(a) { return a.apiId === state.editingApi.apiId; });
          if (idx !== -1) state.apis[idx] = entry;
        } else {
          state.apis.push(entry);
        }
      } else {
        await loadApis();
      }

      msgEl.textContent = 'Saved.';
      msgEl.style.color = 'var(--green-600)';
      renderApiList();
      setTimeout(function() { TGE.apiClosePanel(); }, 600);

    } catch(e) {
      // Save locally on error
      if (state.panelMode === 'edit') {
        var idx2 = state.apis.findIndex(function(a) { return a.apiId === state.editingApi.apiId; });
        if (idx2 !== -1) state.apis[idx2] = entry;
      } else {
        state.apis.push(entry);
      }
      msgEl.textContent = 'Saved locally (API endpoint not available yet).';
      msgEl.style.color = 'var(--muted)';
      renderApiList();
      setTimeout(function() { TGE.apiClosePanel(); }, 800);
    } finally {
      state.saving = false;
      btn.textContent = state.panelMode === 'edit' ? 'Update API' : 'Save API';
      btn.disabled = false;
    }
  };

  // ── Export JSON ───────────────────────────────────────────────────────────────
  function exportJson() {
    if (!state.apis.length) { alert('No APIs defined yet.'); return; }
    var json = JSON.stringify({ apis: state.apis }, null, 2);

    // Show copy modal
    var modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = '<div style="background:var(--surface);border-radius:14px;padding:24px;width:min(700px,100%);max-height:80vh;display:flex;flex-direction:column;gap:12px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<h3 style="margin:0;font-size:15px;font-weight:700;">API Registry Export</h3>' +
        '<button onclick="this.closest(\'div[style]\').remove()" style="border:none;background:none;font-size:18px;cursor:pointer;color:var(--muted);">✕</button>' +
      '</div>' +
      '<p style="margin:0;font-size:12px;color:var(--muted);">Copy this JSON and paste it into your chat with Claude to use as the coding reference.</p>' +
      '<textarea style="flex:1;min-height:300px;font-family:monospace;font-size:11px;border:1px solid var(--line);border-radius:8px;padding:12px;resize:none;" readonly>' + json + '</textarea>' +
      '<div style="display:flex;gap:8px;">' +
        '<button class="btn btn-primary" onclick="navigator.clipboard.writeText(document.querySelector(\'textarea\').value).then(function(){alert(\'Copied to clipboard!\')})">Copy to Clipboard</button>' +
        '<button class="btn" onclick="(function(){var a=document.createElement(\'a\');a.href=URL.createObjectURL(new Blob([document.querySelector(\'textarea\').value],{type:\'application/json\'}));a.download=\'tge-api-registry.json\';a.click()})()">Download JSON</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(modal);
  }

  // ── Default APIs (pre-loaded) ─────────────────────────────────────────────────
  function getDefaultApis() {
    return [
      { apiId:'API-1', label:'Vehicles',            group:'vehicle', method:'GET', url:'/v1/vehicles',                               notes:'Returns all vehicles in the fleet', sampleResponse:'', fields:[
        { path:'id',           type:'string',  label:'Vehicle ID',    purpose:'feeds-next-api', feedsNext:true,  isOutput:false },
        { path:'name',         type:'string',  label:'Fleet Number',  purpose:'display',        feedsNext:false, isOutput:true  },
        { path:'registration', type:'string',  label:'Registration',  purpose:'display',        feedsNext:false, isOutput:true  },
        { path:'make',         type:'string',  label:'Make',          purpose:'display',        feedsNext:false, isOutput:true  },
        { path:'model',        type:'string',  label:'Model',         purpose:'display',        feedsNext:false, isOutput:true  },
      ]},
      { apiId:'API-2', label:'All Devices',         group:'device',  method:'GET', url:'/v1/devices',                               notes:'Returns all devices. Use to map IMEI to vehicleId', sampleResponse:'', fields:[
        { path:'imei',      type:'string', label:'IMEI',       purpose:'filter',         feedsNext:false, isOutput:true  },
        { path:'vehicleId', type:'string', label:'Vehicle ID', purpose:'feeds-next-api', feedsNext:true,  isOutput:false },
        { path:'type',      type:'string', label:'Device Type',purpose:'filter',         feedsNext:false, isOutput:false },
      ]},
      { apiId:'API-3', label:'Device Stats',        group:'device',  method:'GET', url:'/v1/devices/{imei}?embed=devicestats',      notes:'Single device with SD card stats', sampleResponse:'', fields:[
        { path:'deviceStats.sdCard1.present',       type:'boolean', label:'SD Card 1 Present', purpose:'display', feedsNext:false, isOutput:true },
        { path:'deviceStats.sdCard1.totalSizeBytes',type:'number',  label:'SD Card 1 Size',    purpose:'display', feedsNext:false, isOutput:true },
        { path:'deviceStats.sdCard2.present',       type:'boolean', label:'SD Card 2 Present', purpose:'display', feedsNext:false, isOutput:true },
        { path:'deviceStats.sdCard2.totalSizeBytes',type:'number',  label:'SD Card 2 Size',    purpose:'display', feedsNext:false, isOutput:true },
        { path:'deviceStats.overallStatus',         type:'string',  label:'Overall Status',    purpose:'display', feedsNext:false, isOutput:true },
      ]},
      { apiId:'API-4', label:'Camera Events',       group:'camera',  method:'GET', url:'/v1/events?types=camera&pruning=B2B',       notes:'Last 24hrs only. Pick latest event per vehicleId. Image URLs in attributes.context.response.mediaFiles', sampleResponse:'', fields:[
        { path:'vehicleId',                                   type:'string', label:'Vehicle ID',    purpose:'filter',         feedsNext:true,  isOutput:false },
        { path:'timeAt',                                      type:'date',   label:'Snapshot Time', purpose:'pick-rule',      feedsNext:false, isOutput:true  },
        { path:'attributes.context.response.mediaFiles',     type:'array',  label:'Media Files',   purpose:'map-to-output',  feedsNext:false, isOutput:true  },
      ]},
      { apiId:'API-5', label:'Camera Device Stats', group:'camera',  method:'GET', url:'/v1/devices/{cameraId}/camera-device-stats',notes:'Camera-specific device stats', sampleResponse:'', fields:[
        { path:'sdCard1.present',  type:'boolean', label:'SD Card 1', purpose:'display', feedsNext:false, isOutput:true },
        { path:'sdCard2.present',  type:'boolean', label:'SD Card 2', purpose:'display', feedsNext:false, isOutput:true },
        { path:'firmwareVersion',  type:'string',  label:'Firmware',  purpose:'display', feedsNext:false, isOutput:true },
      ]},
      { apiId:'API-6', label:'Hermes Stats',        group:'metrics', method:'GET', url:'/v1/vehicles/{vehicleId}/hermes-stats',     notes:'Live vehicle metrics. Contains GPS, ignition, speed, GPIO etc', sampleResponse:'', fields:[
        { path:'gps.lat',         type:'number', label:'Latitude',    purpose:'display', feedsNext:false, isOutput:true },
        { path:'gps.lng',         type:'number', label:'Longitude',   purpose:'display', feedsNext:false, isOutput:true },
        { path:'ignition',        type:'boolean',label:'Ignition',    purpose:'display', feedsNext:false, isOutput:true },
        { path:'speed',           type:'number', label:'Speed',       purpose:'display', feedsNext:false, isOutput:true },
        { path:'rpm',             type:'number', label:'RPM',         purpose:'display', feedsNext:false, isOutput:true },
        { path:'driverName',      type:'string', label:'Driver Name', purpose:'display', feedsNext:false, isOutput:true },
      ]},
      { apiId:'API-7', label:'Vehicle Meters',      group:'metrics', method:'GET', url:'/v1/vehicles/{vehicleId}/meters',           notes:'Odometer and engine hours', sampleResponse:'', fields:[
        { path:'odometer',     type:'number', label:'Odometer (km)', purpose:'display', feedsNext:false, isOutput:true },
        { path:'engineHours',  type:'number', label:'Engine Hours',  purpose:'display', feedsNext:false, isOutput:true },
      ]},
      { apiId:'API-8', label:'Vehicle Devices',     group:'vehicle', method:'GET', url:'/v1/vehicles/{vehicleId}/devices',          notes:'All devices linked to a specific vehicle', sampleResponse:'', fields:[
        { path:'imei',         type:'string', label:'IMEI',        purpose:'display',        feedsNext:false, isOutput:true },
        { path:'type.code',    type:'string', label:'Device Type', purpose:'filter',         feedsNext:false, isOutput:true },
        { path:'serialNumber', type:'string', label:'Serial No.',  purpose:'display',        feedsNext:false, isOutput:true },
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
