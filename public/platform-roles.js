// TGE Asset Snapshot — Roles & Permissions
// public/roles.js

(function () {
  'use strict';

 // Platform standard: every screen carrying the export pill exposes ALL
  // its options as toggles. Defined once — never retype per feature.
  var EXPORT_ACTIONS = ['export-pdf','export-email-pdf','export-csv','export-xlsx','export-json'];

  var FEATURES = [
    {
      group: 'Operations',
      items: [
{ key: 'snapshot',          label: 'Snapshot',          actions: ['view','run','cancel','refresh'].concat(EXPORT_ACTIONS) },
        { key: 'asset-track',       label: 'Asset Track',       actions: ['view','user-mode','fleet-mode','run','cancel','refresh'].concat(EXPORT_ACTIONS), hasLimit: true },
        { key: 'vpm',               label: 'VPM Analysis',      actions: ['view','user-mode','fleet-mode','run','cancel','refresh'].concat(EXPORT_ACTIONS), hasLimit: true },
        { key: 'utilisation',       label: 'Fleet Utilisation', actions: ['view','run','cancel','refresh'].concat(EXPORT_ACTIONS) },
      ]
    },
    {
      group: 'Camera',
      items: [
{ key: 'camera-snapshots',  label: 'Camera Snapshots',  actions: ['view','user-mode','fleet-mode','run','cancel','refresh'].concat(EXPORT_ACTIONS), hasLimit: true },
        { key: 'sd-health',         label: 'SD Card Health',    actions: ['view','user-mode','fleet-mode','run','cancel','refresh'].concat(EXPORT_ACTIONS), hasLimit: true },
      ]
    },
    {
      group: 'Management',
      items: [
        { key: 'admin',             label: 'Admin',             actions: ['view','run','export-csv','export-xlsx'] },
        { key: 'vendor',            label: 'Vendor Platform',   actions: ['view','manage','import'].concat(EXPORT_ACTIONS) },
        { key: 'registry',          label: 'Registry',          actions: ['view','run','export-json'] },
        { key: 'diagnostics',       label: 'Diagnostics',       actions: ['view'] },
      ]
    },
  ];

  var ACTION_LABELS = {
    'view':             'View',
    'user-mode':        'User',
    'fleet-mode':       'Fleet',
    'run':              'Run',
    'cancel':           'Cancel',
    'refresh':          'Refresh',
    'export-pdf':       'PDF',
    'export-email-pdf': 'Email PDF',
    'export-csv':       'CSV',
    'export-xlsx':      'XLSX',
    'export-json':      'JSON',
  };

  var state = {
    roles:       [],
    userCounts:  {},
    editingRole: null,
    panelMode:   null,
    permMap:     {},
    saving:      false,
  };

  var api = TGE.api;

  // ── Render page ───────────────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-roles');
    if (!view) return;

    view.innerHTML = [
      '<div class="hero">',
        '<div class="hero-kicker">Management</div>',
        '<div class="hero-title">Role Management</div>',
        '<div class="hero-bar" style="margin-top:14px;">',
          '<div class="hero-bar-left">',
            '<button class="hero-run-btn" id="create-role-btn" type="button">+ Create New Role</button>',
          '</div>',
        '</div>',
      '</div>',

      '<div id="roles-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-bottom:20px;">',
        '<div style="text-align:center;color:var(--muted);padding:40px;">Loading roles...</div>',
      '</div>',

      // Overlay — starts hidden
      '<div id="role-panel-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:200;" onclick="TGE.rolesClosePanel()"></div>',

      // Panel — FIXED: display:none is now the only display value; flex-direction kept as separate property
      '<div id="role-panel" style="position:fixed;top:0;right:0;width:min(680px,100vw);height:100vh;background:var(--surface);box-shadow:-4px 0 24px rgba(0,0,0,0.15);z-index:201;flex-direction:column;overflow:hidden;display:none;">',
        '<div style="padding:20px 24px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">',
          '<div>',
            '<div class="card-kicker" id="panel-kicker">Create Role</div>',
            '<h2 style="font-size:16px;font-weight:700;color:var(--ink);margin:0;" id="panel-title">New Role</h2>',
          '</div>',
          '<button onclick="TGE.rolesClosePanel()" style="width:32px;height:32px;border-radius:7px;border:1px solid var(--line);background:var(--surface-2);color:var(--muted);cursor:pointer;font-size:16px;">✕</button>',
        '</div>',

        '<div style="flex:1;overflow-y:auto;padding:20px 24px;" id="panel-body">',
          '<div id="panel-name-field" style="margin-bottom:20px;">',
            '<div class="field">',
              '<label>Role Name</label>',
              '<input id="panel-role-name" type="text" placeholder="e.g. fleet-manager" />',
            '</div>',
            '<div class="field">',
              '<label>Description</label>',
              '<input id="panel-role-desc" type="text" placeholder="Brief description of this role" />',
            '</div>',
          '</div>',
          '<div id="panel-permissions"></div>',
        '</div>',

        '<div style="padding:16px 24px;border-top:1px solid var(--line);display:flex;gap:10px;flex-shrink:0;">',
          '<button class="btn btn-primary" id="panel-save-btn" type="button" onclick="TGE.rolesSave()">Save Changes</button>',
          '<button class="btn" type="button" onclick="TGE.rolesClosePanel()">Cancel</button>',
          '<p id="panel-message" style="margin:0;font-size:12px;align-self:center;"></p>',
        '</div>',
      '</div>',
    ].join('');

    TGE.on('create-role-btn', 'click', function () { openPanel('create', null); });
    loadRoles();
  }

  // ── Load roles ────────────────────────────────────────────────────────────────
  async function loadRoles() {
    var result = await api('GET', '/api/admin/roles');
    if (!result.ok) return;
    state.roles = result.data.roles || [];

    var usersResult = await api('GET', '/api/admin/users');
    if (usersResult.ok) {
      state.userCounts = {};
      (usersResult.data.users || []).forEach(function (u) {
        state.userCounts[u.role_id] = (state.userCounts[u.role_id] || 0) + 1;
      });
    }

    renderRolesGrid();
  }

 function renderRolesGrid() {
    var grid = TGE.el('roles-grid');
    if (!grid) return;
    var groupColors = { 1: 'badge-yellow', 2: 'badge-green', 3: 'badge-gray' };
    grid.innerHTML = state.roles.map(function (r) {
      var count = state.userCounts[r.id] || 0;
      var color = groupColors[r.id] || 'badge-gray';
      return '<div class="card" style="cursor:default;display:flex;flex-direction:column;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
          '<span class="badge ' + color + '" style="font-size:12px;padding:4px 12px;">' + r.name + '</span>' +
          '<span style="font-size:11px;color:var(--muted);">' + count + ' user' + (count !== 1 ? 's' : '') + '</span>' +
        '</div>' +
        '<p style="font-size:12px;color:var(--muted);margin:0 0 14px;flex:1;">' + (r.description || 'No description') + '</p>' +
        '<button class="btn btn-primary" style="width:100%;margin-top:auto;" onclick="TGE.rolesEdit(' + r.id + ')">Edit Permissions</button>' +
      '</div>';
    }).join('') +
    '<div class="card" style="border:2px dashed var(--line);background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:140px;cursor:pointer;" onclick="TGE.rolesCreateNew()">' +
      '<div style="font-size:24px;color:var(--muted-2);margin-bottom:8px;">+</div>' +
      '<div style="font-size:13px;font-weight:600;color:var(--muted);">Create New Role</div>' +
    '</div>';
  }

  // ── Open panel ────────────────────────────────────────────────────────────────
  async function openPanel(mode, roleId) {
    state.panelMode   = mode;
    state.editingRole = null;
    state.permMap     = {};

    var overlay   = TGE.el('role-panel-overlay');
    var panel     = TGE.el('role-panel');
    var kicker    = TGE.el('panel-kicker');
    var title     = TGE.el('panel-title');
    var nameField = TGE.el('panel-name-field');

    if (mode === 'create') {
      kicker.textContent = 'Create Role';
      title.textContent  = 'New Role';
      if (nameField) nameField.style.display = '';
      TGE.el('panel-role-name').value = '';
      TGE.el('panel-role-desc').value = '';
      TGE.el('panel-save-btn').textContent = 'Create Role';
      buildDefaultPermMap(false);
    } else {
      var role = state.roles.find(function (r) { return r.id === roleId; });
      if (!role) return;
      state.editingRole = role;
      kicker.textContent = 'Edit Role';
      title.textContent  = role.name.charAt(0).toUpperCase() + role.name.slice(1);
      if (nameField) nameField.style.display = 'none';
      TGE.el('panel-save-btn').textContent = 'Save Changes';

      var permResult = await api('GET', '/api/admin/permissions/' + roleId);
      if (permResult.ok) {
        buildPermMapFromArray(permResult.data.permissions || []);
      } else {
        buildDefaultPermMap(roleId === 1);
      }
    }

    renderPermMatrix();

    if (overlay) overlay.style.display = 'block';
    if (panel)   panel.style.display   = 'flex';   // only set to flex here, on explicit open
    TGE.el('panel-message').textContent = '';
  }

  TGE.rolesEdit      = function (id) { openPanel('edit', id); };
  TGE.rolesCreateNew = function ()   { openPanel('create', null); };

  TGE.rolesClosePanel = function () {
    var overlay = TGE.el('role-panel-overlay');
    var panel   = TGE.el('role-panel');
    if (overlay) overlay.style.display = 'none';
    if (panel)   panel.style.display   = 'none';
  };

  // ── Permission map ────────────────────────────────────────────────────────────
  function buildDefaultPermMap(allOn) {
    state.permMap = {};
    FEATURES.forEach(function (group) {
      group.items.forEach(function (feature) {
        state.permMap[feature.key] = {};
        feature.actions.forEach(function (action) {
          state.permMap[feature.key][action] = { enabled: allOn, limit: null };
        });
      });
    });
  }

  function buildPermMapFromArray(perms) {
    buildDefaultPermMap(false);
    perms.forEach(function (p) {
      if (state.permMap[p.feature] && state.permMap[p.feature][p.action] !== undefined) {
        state.permMap[p.feature][p.action] = { enabled: p.enabled === 1, limit: p.limit_value };
      }
    });
  }

  // ── Permission matrix ─────────────────────────────────────────────────────────
  function renderPermMatrix() {
    var container = TGE.el('panel-permissions');
    if (!container) return;

    var html = FEATURES.map(function (group) {
      var rows = group.items.map(function (feature) {
        var toggles = feature.actions.map(function (action) {
          var p       = state.permMap[feature.key] && state.permMap[feature.key][action];
          var enabled = p ? p.enabled : false;

          return '<label style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;">' +
            '<span style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">' + (ACTION_LABELS[action] || action) + '</span>' +
            '<div class="perm-toggle' + (enabled ? ' on' : '') + '" data-feature="' + feature.key + '" data-action="' + action + '" onclick="TGE.rolesToggle(this)">' +
              '<div class="perm-toggle-knob"></div>' +
            '</div>' +
          '</label>';
        }).join('');

        var limitField = feature.hasLimit
          ? '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">' +
              '<span style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Limit</span>' +
              '<input type="number" class="perm-limit" data-feature="' + feature.key + '" ' +
                'value="' + (state.permMap[feature.key] && state.permMap[feature.key]['run'] && state.permMap[feature.key]['run'].limit ? state.permMap[feature.key]['run'].limit : '') + '" ' +
                'placeholder="∞" min="1" ' +
                'style="width:52px;height:32px;border:1px solid var(--line);border-radius:6px;text-align:center;font-size:12px;padding:0 4px;" ' +
                'onchange="TGE.rolesSetLimit(this)" />' +
            '</div>'
          : '';

        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid var(--line-2);flex-wrap:wrap;">' +
          '<span style="font-size:13px;font-weight:500;color:var(--ink);min-width:140px;">' + feature.label + '</span>' +
          '<div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;">' +
            toggles + limitField +
          '</div>' +
        '</div>';
      }).join('');

      return '<div style="margin-bottom:20px;">' +
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--green-600);margin-bottom:8px;">' + group.group + '</div>' +
        rows +
      '</div>';
    }).join('');

    container.innerHTML = html;
  }

  TGE.rolesToggle = function (el) {
    var feature = el.dataset.feature;
    var action  = el.dataset.action;
    if (!state.permMap[feature]) state.permMap[feature] = {};
    if (!state.permMap[feature][action]) state.permMap[feature][action] = { enabled: false, limit: null };
    var current = state.permMap[feature][action].enabled;
    state.permMap[feature][action].enabled = !current;
    el.classList.toggle('on', !current);
  };

  TGE.rolesSetLimit = function (el) {
    var feature = el.dataset.feature;
    var val     = parseInt(el.value, 10);
    if (!state.permMap[feature]) state.permMap[feature] = {};
    if (!state.permMap[feature]['run']) state.permMap[feature]['run'] = { enabled: false, limit: null };
    state.permMap[feature]['run'].limit = isNaN(val) || val < 1 ? null : val;
  };

  // ── Save ──────────────────────────────────────────────────────────────────────
  TGE.rolesSave = async function () {
    if (state.saving) return;
    state.saving = true;
    var msgEl = TGE.el('panel-message');
    var btn   = TGE.el('panel-save-btn');
    btn.textContent = 'Saving...';
    btn.disabled    = true;
    msgEl.textContent = '';

    try {
      var permissions = [];
      FEATURES.forEach(function (group) {
        group.items.forEach(function (feature) {
          feature.actions.forEach(function (action) {
            var p = state.permMap[feature.key] && state.permMap[feature.key][action];
            permissions.push({
              feature: feature.key,
              action:  action,
              enabled: p ? (p.enabled ? 1 : 0) : 0,
              limit:   p ? p.limit : null,
            });
          });
        });
      });

      if (state.panelMode === 'create') {
        var name = TGE.el('panel-role-name').value.trim().toLowerCase().replace(/\s+/g, '-');
        var desc = TGE.el('panel-role-desc').value.trim();
        if (!name) { msgEl.textContent = 'Role name is required.'; msgEl.style.color = 'var(--danger)'; return; }

        var createResult = await api('POST', '/api/admin/roles', { name: name, description: desc });
        if (!createResult.ok) { msgEl.textContent = createResult.data.error || 'Failed to create role.'; msgEl.style.color = 'var(--danger)'; return; }

        var newRoleId = createResult.data.roleId;
        await api('PUT', '/api/admin/permissions/' + newRoleId, { permissions: permissions });

      } else {
        var roleId = state.editingRole.id;
        await api('PUT', '/api/admin/permissions/' + roleId, { permissions: permissions });
      }

      msgEl.textContent = 'Saved successfully.';
      msgEl.style.color = 'var(--green-600)';
      await loadRoles();
      setTimeout(function () { TGE.rolesClosePanel(); }, 800);

    } catch (e) {
      msgEl.textContent = 'Error: ' + e.message;
      msgEl.style.color = 'var(--danger)';
    } finally {
      state.saving    = false;
      btn.textContent = state.panelMode === 'create' ? 'Create Role' : 'Save Changes';
      btn.disabled    = false;
    }
  };

  // ── Register ──────────────────────────────────────────────────────────────────
  TGE.onShow['roles'] = render;

})();
