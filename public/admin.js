// TGE Asset Snapshot — Admin Page
// public/admin.js

(function () {
  'use strict';

  var state = {
    users:       [],
    roles:       [],
    activity:    [],
    activeTab:   'users',
    editingUser: null,
  };

  var api = TGE.api;

  // ── Render ───────────────────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-admin');
    if (!view) return;

    view.innerHTML = [
      '<div class="hero">',
        '<div class="hero-kicker">Management</div>',
        '<div class="hero-title">Admin</div>',
        '<div class="hero-bar" style="margin-top:14px;">',
          '<div class="hero-bar-left">',
            '<button class="hero-mode-btn active" id="admin-tab-users" type="button">Users</button>',
            '<button class="hero-mode-btn" id="admin-tab-history" type="button">Access History</button>',
            '<button class="hero-mode-btn" id="admin-tab-api" type="button">API Reference</button>',
            '<button class="hero-mode-btn" id="admin-tab-mailer" type="button">Mailer Data</button>',
            '<button class="hero-mode-btn" id="admin-tab-controls" type="button">Control Tables</button>',
          '</div>',
          '<div class="hero-bar-right">',
            '<div class="hero-divider"></div>',
            '<button class="hero-export-btn active" id="admin-export-csv" type="button">CSV</button>',
            '<button class="hero-export-btn active" id="admin-export-xlsx" type="button">XLSX</button>',
          '</div>',
        '</div>',
      '</div>',
      '<div id="admin-content-users">',   renderUsersTab(),   '</div>',
      '<div id="admin-content-history" style="display:none;">', renderHistoryTab(), '</div>',
      '<div id="admin-content-api" style="display:none;">',     renderApiTab(),     '</div>',
      '<div id="admin-content-mailer" style="display:none;">',  renderMailerTab(),  '</div>',
      '<div id="admin-content-controls" style="display:none;">', renderControlTablesTab(), '</div>',
    ].join('');

    wireAdminTabs();
    wireUsersTab();
    wireControlTablesTab();
    wireExportBtns();
    loadRoles().then(function() { loadUsers(); });
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  function wireAdminTabs() {
    var tabs = [
      { btn: 'admin-tab-users',   content: 'admin-content-users' },
      { btn: 'admin-tab-history', content: 'admin-content-history' },
      { btn: 'admin-tab-api',     content: 'admin-content-api' },
      { btn: 'admin-tab-mailer',  content: 'admin-content-mailer' },
      { btn: 'admin-tab-controls', content: 'admin-content-controls' },
    ];
    tabs.forEach(function (t) {
      TGE.on(t.btn, 'click', function () {
        tabs.forEach(function (x) {
          var b = TGE.el(x.btn);
          var c = TGE.el(x.content);
          if (b) b.classList.remove('active');
          if (c) c.style.display = 'none';
        });
        var btn = TGE.el(t.btn);
        var content = TGE.el(t.content);
        if (btn) btn.classList.add('active');
        if (content) content.style.display = '';
        state.activeTab = t.btn.replace('admin-tab-', '');
        if (state.activeTab === 'history') loadActivity();
        if (state.activeTab === 'api') wireApiFilters();
        if (state.activeTab === 'mailer') loadSignatures();
        if (state.activeTab === 'controls') loadControlTables();
      });
    });
  }

  // ── USERS TAB ─────────────────────────────────────────────────────────────────
  function renderUsersTab() {
    return [
      '<div class="card" style="margin-bottom:14px;">',
        '<div class="card-kicker">User Management</div>',
        '<div class="card-title" id="user-form-title">Add New User</div>',
        '<div class="data-grid data-grid-3" style="margin-bottom:12px;">',
          '<div class="field"><label>First Name</label><input id="user-first-name" type="text" placeholder="First name" /></div>',
          '<div class="field"><label>Last Name</label><input id="user-last-name" type="text" placeholder="Last name" /></div>',
          '<div class="field"><label>Username</label><input id="user-username" type="text" placeholder="username" /></div>',
          '<div class="field"><label>Email</label><input id="user-email" type="email" placeholder="email@example.com" /></div>',
          '<div class="field"><label>Password</label><input id="user-password" type="password" placeholder="Set password" /></div>',
          '<div class="field"><label>Role</label><select id="user-role"></select></div>',
          '<div class="field"><label>LoginType</label><select id="user-login-type"><option value="db_only">DB only</option><option value="db_vendor">DB + TN360</option></select></div>',
          '<div class="field"><label>Status</label><select id="user-status"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>',
        '</div>',
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">',
          '<button class="btn btn-primary" id="user-save-btn" type="button">Save User</button>',
          '<button class="btn" id="user-cancel-btn" type="button" style="display:none;">Cancel</button>',
          '<button class="btn" id="user-import-btn" type="button">Import XLSX</button>',
          '<input type="file" id="user-import-file" accept=".xlsx,.xls,.csv" style="display:none;" />',
          '<p id="user-form-message" style="margin:0;font-size:12px;"></p>',
        '</div>',
      '</div>',
      '<div class="card">',
        '<div class="card-kicker">Registered Users</div>',
        '<div class="card-title">All Users</div>',
        '<div class="table-wrap">',
          '<table>',
            '<thead><tr>',
              '<th>Name</th><th>Username</th><th>Email</th>',
              '<th>Role</th><th>Status</th><th>Created</th><th>Actions</th>',
            '</tr></thead>',
            '<tbody id="users-table-body"><tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px;">Loading...</td></tr></tbody>',
          '</table>',
        '</div>',
      '</div>',
    ].join('');
  }

  function wireUsersTab() {
    TGE.on('user-save-btn',    'click',  saveUser);
    TGE.on('user-cancel-btn',  'click',  cancelEdit);
    TGE.on('user-import-btn',  'click',  function () { TGE.el('user-import-file').click(); });
    TGE.on('user-import-file', 'change', handleImport);
  }

function wireControlTablesTab() {
  TGE.on('ct-new-btn', 'click', function () {
    openControlTableEditor(null);
  });
}
  async function loadRoles() {
    var result = await api('GET', '/api/admin/roles');
    if (!result.ok) return;
    state.roles = result.data.roles || [];
    var sel = TGE.el('user-role');
    if (sel) {
      var current = sel.value;
      sel.innerHTML = state.roles.map(function (r) {
        return '<option value="' + r.id + '">' + r.name.charAt(0).toUpperCase() + r.name.slice(1) + '</option>';
      }).join('');
      if (current) sel.value = current;
    }
  }

  async function loadUsers() {
    var tbody = TGE.el('users-table-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px;">Loading...</td></tr>';
    var result = await api('GET', '/api/admin/users');
    if (!result.ok) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--danger);padding:24px;">Failed to load users.</td></tr>';
      return;
    }
    state.users = result.data.users || [];
    renderUsersTable();
  }

  function renderUsersTable() {
    // Always get fresh DOM reference
    var tbody = document.getElementById('users-table-body');
    if (!tbody) { console.warn('[Admin] users-table-body not found'); return; }
    if (!state.users.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px;">No users found.</td></tr>';
      return;
    }
    var html = state.users.map(function (u) {
      var roleName = u.role_name || (state.roles.find(function(r){ return r.id === u.role_id; }) || {}).name || 'user';
      var statusBadge = u.status === 'active'
        ? '<span class="badge badge-green">Active</span>'
        : '<span class="badge badge-gray">Inactive</span>';
      var roleBadge = roleName === 'superuser'
        ? '<span class="badge badge-yellow">' + roleName + '</span>'
        : roleName === 'admin'
        ? '<span class="badge badge-green">' + roleName + '</span>'
        : '<span class="badge badge-gray">' + roleName + '</span>';
      return '<tr>' +
        '<td><strong>' + TGE.safeText(u.first_name) + ' ' + TGE.safeText(u.last_name) + '</strong></td>' +
        '<td>' + TGE.safeText(u.username) + '</td>' +
        '<td>' + TGE.safeText(u.email, '—') + '</td>' +
        '<td>' + roleBadge + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td><span class="badge ' + (u.login_type === 'db_vendor' ? 'badge-yellow' : 'badge-gray') + '" style="font-size:10px;">' + (u.login_type === 'db_vendor' ? 'DB + Vendor' : 'DB only') + '</span></td>' +
        '<td style="font-size:11px;color:var(--muted);">' + TGE.formatDate(u.created_at) + '</td>' +
        '<td style="display:flex;gap:6px;">' +
          '<button class="btn" style="height:28px;font-size:11px;padding:0 10px;" onclick="TGE.adminEditUser(' + u.id + ')">Edit</button>' +
          '<button class="btn btn-danger" style="height:28px;font-size:11px;padding:0 10px;" onclick="TGE.adminDeleteUser(' + u.id + ')">Deactivate</button>' +
        '</td>' +
        '</tr>';
    }).join('');
    tbody.innerHTML = html;
    console.log('[Admin] renderUsersTable: rendered', state.users.length, 'users, tbody rows:', tbody.querySelectorAll('tr').length);
  }

  async function saveUser() {
    var msgEl = document.getElementById('user-form-message');

    // Read directly from DOM
    var firstName = document.getElementById('user-first-name').value.trim();
    var lastName  = document.getElementById('user-last-name').value.trim();
    var username  = document.getElementById('user-username').value.trim().toLowerCase();
    var email     = document.getElementById('user-email').value.trim();
    var password  = document.getElementById('user-password').value.trim();
    var status    = document.getElementById('user-status').value;
    var roleSel   = document.getElementById('user-role');
    var roleId    = roleSel ? parseInt(roleSel.value, 10) : 3;
    var loginType = document.getElementById('user-login-type').value;
    if (!roleId || roleId < 1) roleId = 3;

    var editId = state.editingUser;

    console.log('[saveUser] editId:', editId, 'username:', username, 'roleId:', roleId);

    if (!firstName || !lastName || !username) {
      msgEl.textContent = 'First name, last name and username are required.';
      msgEl.style.color = 'var(--danger)';
      return;
    }

    var body = {
      firstName: firstName,
      lastName:  lastName,
      username:  username,
      email:     email,
      roleId:    roleId,
      loginType: loginType,
      status:    status
    };
    if (password) body.password = password;

    console.log('[saveUser] body:', JSON.stringify(body));

    var url    = editId ? '/api/admin/users/' + editId : '/api/admin/users';
    var method = editId ? 'PUT' : 'POST';

    if (!editId && !password) {
      msgEl.textContent = 'Password is required for new users.';
      msgEl.style.color = 'var(--danger)';
      return;
    }

    var res  = await fetch(url, {
      method:  method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body)
    });
    var data = await res.json().catch(function() { return {}; });

    console.log('[saveUser] response:', res.status, JSON.stringify(data));

    if (!res.ok) {
      msgEl.textContent = data.error || (editId ? 'Update failed.' : 'Create failed.');
      msgEl.style.color = 'var(--danger)';
      return;
    }

    msgEl.textContent = editId ? 'User updated successfully.' : 'User created successfully.';
    msgEl.style.color = 'var(--green-600)';

    cancelEdit();
    await loadUsers();

    setTimeout(function() {
      var m = document.getElementById('user-form-message');
      if (m) m.textContent = '';
    }, 3000);
  }

  TGE.adminEditUser = async function (id) {
    // Coerce to number — HTML onclick passes strings, DB returns numbers
    id = parseInt(id, 10);
    var user = state.users.find(function (u) { return u.id === id; });
    if (!user) { console.warn('[Admin] user not found for id:', id, 'state.users:', state.users.map(function(u){return u.id;})); return; }

    state.editingUser = id;

    TGE.el('user-first-name').value = user.first_name || '';
    TGE.el('user-last-name').value  = user.last_name  || '';
    TGE.el('user-username').value   = user.username   || '';
    TGE.el('user-email').value      = user.email      || '';
    TGE.el('user-password').value   = '';
    TGE.el('user-login-type').value = user.login_type || 'db_only';
    TGE.el('user-status').value     = user.status     || 'active';

    // Ensure roles are loaded before setting dropdown
    var roleSel = TGE.el('user-role');
    if (roleSel) {
      if (!state.roles.length || roleSel.options.length < 1) {
        await loadRoles();
      }
      roleSel.value = String(user.role_id || 3);
    }

    TGE.el('user-form-title').textContent = 'Edit User — ' + user.username;
    TGE.show('user-cancel-btn');
    TGE.el('user-save-btn').textContent = 'Update User';
    TGE.el('user-form-message').textContent = '';

    var formEl = TGE.el('user-form-title');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  TGE.adminDeleteUser = async function (id) {
    id = parseInt(id, 10);
    if (!confirm('Deactivate this user? They will no longer be able to log in.')) return;
    var result = await api('DELETE', '/api/admin/users/' + id);
    if (result.ok) {
      await loadUsers();
    } else {
      alert(result.data.error || 'Failed to deactivate user.');
    }
  };

  function cancelEdit() {
    state.editingUser = null;
    TGE.el('user-first-name').value = '';
    TGE.el('user-last-name').value  = '';
    TGE.el('user-username').value   = '';
    TGE.el('user-email').value      = '';
    TGE.el('user-password').value   = '';
    TGE.el('user-status').value     = 'active';
    var roleSel = TGE.el('user-role');
    if (roleSel) roleSel.value = '3';
    TGE.el('user-form-title').textContent = 'Add New User';
    TGE.hide('user-cancel-btn');
    TGE.el('user-save-btn').textContent = 'Save User';
    TGE.el('user-login-type').value = 'db_only';
    TGE.el('user-form-message').textContent = '';
  }

  function handleImport(e) {
    var file = e.target.files[0];
    if (!file) return;
    alert('XLSX import coming soon.');
    e.target.value = '';
  }

  // ── ACCESS HISTORY TAB ────────────────────────────────────────────────────────
  function renderHistoryTab() {
    return [
      '<div class="card">',
        '<div class="card-kicker">Activity</div>',
        '<div class="card-title">Access History</div>',
        '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">',
          '<select id="history-user-filter" style="height:36px;border:1px solid var(--line);border-radius:8px;padding:0 10px;color:var(--ink);background:var(--surface);">',
            '<option value="">All users</option>',
          '</select>',
          '<select id="history-feature-filter" style="height:36px;border:1px solid var(--line);border-radius:8px;padding:0 10px;color:var(--ink);background:var(--surface);">',
            '<option value="">All features</option>',
            '<option value="auth">Auth</option>',
            '<option value="snapshot">Snapshot</option>',
            '<option value="asset-track">Asset Track</option>',
            '<option value="vpm">VPM</option>',
            '<option value="camera-snapshots">Camera Snapshots</option>',
            '<option value="sd-health">SD Health</option>',
            '<option value="admin">Admin</option>',
          '</select>',
          '<button class="btn btn-primary" id="history-filter-btn" type="button">Filter</button>',
        '</div>',
        '<div class="table-wrap">',
          '<table>',
            '<thead><tr><th>User</th><th>Feature</th><th>Action</th><th>Detail</th><th>Date / Time</th></tr></thead>',
            '<tbody id="history-table-body"><tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px;">Loading...</td></tr></tbody>',
          '</table>',
        '</div>',
      '</div>',
    ].join('');
  }

  async function loadActivity() {
    TGE.on('history-filter-btn', 'click', loadActivity);
    var userId  = (TGE.el('history-user-filter')   || {}).value || '';
    var feature = (TGE.el('history-feature-filter') || {}).value || '';
    var params  = new URLSearchParams();
    if (userId)  params.set('userId', userId);
    if (feature) params.set('feature', feature);
    params.set('limit', '200');

    var result = await api('GET', '/api/admin/activity?' + params.toString());
    if (!result.ok) return;
    state.activity = result.data.activity || [];

    // Populate user filter
    var userSel = TGE.el('history-user-filter');
    if (userSel && state.users.length) {
      var cv = userSel.value;
      userSel.innerHTML = '<option value="">All users</option>' +
        state.users.map(function (u) {
          return '<option value="' + u.id + '"' + (String(u.id) === cv ? ' selected' : '') + '>' + u.first_name + ' ' + u.last_name + '</option>';
        }).join('');
    }

    var tbody = TGE.el('history-table-body');
    if (!tbody) return;
    if (!state.activity.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px;">No activity found.</td></tr>';
      return;
    }
    tbody.innerHTML = state.activity.map(function (a) {
      return '<tr>' +
        '<td><strong>' + TGE.safeText(a.first_name) + ' ' + TGE.safeText(a.last_name) + '</strong><br><span style="font-size:11px;color:var(--muted);">' + TGE.safeText(a.username) + '</span></td>' +
        '<td><span class="badge badge-gray">' + TGE.safeText(a.feature) + '</span></td>' +
        '<td>' + TGE.safeText(a.action) + '</td>' +
        '<td style="font-size:12px;color:var(--muted);">' + TGE.safeText(a.detail, '—') + '</td>' +
        '<td style="font-size:11px;color:var(--muted);">' + TGE.formatDate(a.created_at) + '</td>' +
        '</tr>';
    }).join('');
  }

  async function loadControlTables() {
  var res = await api('GET', '/api/admin/control-tables');

  if (!res.ok) {
    var el = TGE.el('ct-list');
    if (el) {
      el.innerHTML = '<div class="empty-state">Failed to load control tables.</div>';
    }
    return;
  }

var tables = res.data.tables || [];
var rules = res.data.rules || [];
var hardware = res.data.hardware || [];

window.controlTablesCache = tables;
window.controlTableRulesCache = rules;
window.controlTableHardwareCache = hardware;
    
  renderControlTablesList(tables, rules, hardware);
}

function renderControlTablesList(tables, rules, hardware) {
  var el = TGE.el('ct-list');
  if (!el) return;

  if (!tables.length) {
    el.innerHTML = '<div class="empty-state">No control tables configured.</div>';
    return;
  }

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">' +
    tables.map(function (t) {
      var tableRules = rules.filter(function (r) {
        return String(r.control_table_id) === String(t.id);
      });

      var tableHardware = hardware.filter(function (h) {
        return String(h.control_table_id) === String(t.id);
      });

      return '<div class="card" style="display:flex;flex-direction:column;min-height:180px;">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:10px;">' +
          '<div>' +
            '<div class="card-kicker">' + TGE.safeText(t.feature) + '</div>' +
            '<div style="font-size:15px;font-weight:800;color:var(--ink);margin-top:3px;">' + TGE.safeText(t.name) + '</div>' +
          '</div>' +
          '<span class="badge ' + (t.active ? 'badge-green' : 'badge-gray') + '">' + (t.active ? 'Active' : 'Inactive') + '</span>' +
        '</div>' +

        '<div style="font-size:12px;color:var(--muted);line-height:1.6;flex:1;">' +
          '<div><strong style="color:var(--ink);">Output:</strong> ' + TGE.safeText(t.output_field) + '</div>' +
          '<div><strong style="color:var(--ink);">Evaluate:</strong> ' + TGE.safeText(t.value_source) + '</div>' +
          '<div><strong style="color:var(--ink);">Hardware:</strong> ' + tableHardware.length + ' assigned</div>' +
          '<div><strong style="color:var(--ink);">Rules:</strong> ' + tableRules.length + '</div>' +
        '</div>' +

        '<button class="btn btn-primary" style="width:100%;margin-top:14px;" type="button" onclick="TGE.editControlTable(' + t.id + ')">Edit Table</button>' +
      '</div>';
    }).join('') +
  '</div>';
}
  function openControlTableEditor(table) {
  var editor = TGE.el('ct-editor');
  if (!editor) return;

  editor.style.display = '';

  editor.innerHTML = [
    '<div class="card">',
    '<div class="card-kicker">' + (table ? 'Edit Control Table' : 'Control Table') + '</div>',
    '<div class="card-title">' + (table ? ('CT-' + String(table.id).padStart(3, '0') + ' — ' + TGE.safeText(table.name)) : 'Create Control Table') + '</div>',
      '<p style="font-size:13px;color:var(--muted);margin:6px 0 16px;">',
        'Define which field is evaluated, which output field is populated, and the rules used to create the result.',
      '</p>',

      '<div class="data-grid data-grid-2">',
        '<div class="field"><label>Table Name</label><input id="ct-edit-name" type="text" placeholder="Oyster Battery Status" value="' + escCt(table ? table.name : '') + '"></div>',
        '<div class="field"><label>Feature</label><select id="ct-edit-feature">' +
  '<option value="asset-track"' + (table && table.feature === 'asset-track' ? ' selected' : '') + '>Asset Track</option>' +
'</select></div>',

'<div class="field"><label>Output Field</label><select id="ct-edit-output">' +
  '<option value="battStatus"' + (table && table.output_field === 'battStatus' ? ' selected' : '') + '>Batt Status</option>' +
'</select></div>',

'<div class="field"><label>Evaluate Field</label><select id="ct-edit-source">' +
  '<option value="battCurrent"' + (table && table.value_source === 'battCurrent' ? ' selected' : '') + '>Batt Current</option>' +
  '<option value="battBase"' + (table && table.value_source === 'battBase' ? ' selected' : '') + '>Batt Base</option>' +
'</select></div>',
      '</div>',

      '<div style="margin-top:16px;">',
        '<div class="card-kicker">Assigned Hardware</div>',
        '<div class="data-grid data-grid-2" style="margin-top:8px;">',
          '<label><input type="checkbox" class="ct-hardware" value="DMT Oyster Cellular 3"> DMT Oyster Cellular 3</label>',
          '<label><input type="checkbox" class="ct-hardware" value="Flex Solar Tracker"> Flex Solar Tracker</label>',
        '</div>',
      '</div>',

      '<div style="margin-top:18px;">',
        '<div class="card-kicker">Rules</div>',
        '<div class="table-wrap" style="margin-top:8px;">',
          '<table>',
            '<thead><tr><th>Min</th><th>Max</th><th>Output</th><th>Colour</th></tr></thead>',
            '<tbody id="ct-rule-body">',
              '<tr>',
                '<td><input class="ct-rule-min" type="number" step="0.01" placeholder="5.20"></td>',
                '<td><input class="ct-rule-max" type="number" step="0.01" placeholder="99.00"></td>',
                '<td><input class="ct-rule-output" type="text" placeholder="Fresh"></td>',
                '<td><select class="ct-rule-colour"><option value="green">Green</option><option value="lime">Lime</option><option value="amber">Amber</option><option value="red">Red</option><option value="gray">Gray</option></select></td>',
              '</tr>',
            '</tbody>',
          '</table>',
        '</div>',
        '<button class="btn" id="ct-add-rule-btn" type="button" style="margin-top:10px;">+ Add Rule</button>',
      '</div>',

      '<div style="display:flex;gap:8px;align-items:center;margin-top:18px;">',
        '<button class="btn btn-primary" id="ct-save-btn" type="button">Save Control Table</button>',
        '<button class="btn" id="ct-cancel-btn" type="button">Cancel</button>',
        '<p id="ct-message" style="margin:0;font-size:12px;"></p>',
      '</div>',
    '</div>'
  ].join('');

  TGE.el('ct-add-rule-btn').onclick = addControlTableRuleRow;
      TGE.el('ct-save-btn').onclick = saveControlTable;
  TGE.el('ct-cancel-btn').onclick = function () {
    editor.style.display = 'none';
    editor.innerHTML = '';
  };

  editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
  function addControlTableRuleRow() {
  var tbody = TGE.el('ct-rule-body');
  if (!tbody) return;

  tbody.insertAdjacentHTML('beforeend',
    '<tr>' +
      '<td><input class="ct-rule-min" type="number" step="0.01" placeholder="0.00"></td>' +
      '<td><input class="ct-rule-max" type="number" step="0.01" placeholder="0.00"></td>' +
      '<td><input class="ct-rule-output" type="text" placeholder="Output"></td>' +
      '<td><select class="ct-rule-colour"><option value="green">Green</option><option value="lime">Lime</option><option value="amber">Amber</option><option value="red">Red</option><option value="gray">Gray</option></select></td>' +
    '</tr>'
  );
}
function addControlTableRuleRow() {

}

function escCt(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
  
  async function saveControlTable() {
  var msg = TGE.el('ct-message');
  if (msg) {
    msg.textContent = '';
    msg.style.color = 'var(--muted)';
  }

  var name = (TGE.el('ct-edit-name') || {}).value || '';
  var feature = (TGE.el('ct-edit-feature') || {}).value || '';
  var outputField = (TGE.el('ct-edit-output') || {}).value || '';
  var valueSource = (TGE.el('ct-edit-source') || {}).value || '';

  var hardware = Array.prototype.slice.call(document.querySelectorAll('.ct-hardware:checked'))
    .map(function (el) { return el.value; });

  var mins = Array.prototype.slice.call(document.querySelectorAll('.ct-rule-min'));
  var maxs = Array.prototype.slice.call(document.querySelectorAll('.ct-rule-max'));
  var outputs = Array.prototype.slice.call(document.querySelectorAll('.ct-rule-output'));
  var colours = Array.prototype.slice.call(document.querySelectorAll('.ct-rule-colour'));

  var rules = mins.map(function (el, i) {
    return {
      minValue: el.value,
      maxValue: maxs[i] ? maxs[i].value : '',
      outputValue: outputs[i] ? outputs[i].value : '',
      outputColour: colours[i] ? colours[i].value : 'gray'
    };
  }).filter(function (r) {
    return r.minValue !== '' || r.maxValue !== '' || r.outputValue !== '';
  });

  if (!name.trim()) {
    if (msg) {
      msg.textContent = 'Table name is required.';
      msg.style.color = 'var(--danger)';
    }
    return;
  }

  if (!hardware.length) {
    if (msg) {
      msg.textContent = 'Select at least one hardware model.';
      msg.style.color = 'var(--danger)';
    }
    return;
  }

  if (!rules.length) {
    if (msg) {
      msg.textContent = 'Add at least one rule.';
      msg.style.color = 'var(--danger)';
    }
    return;
  }

  var btn = TGE.el('ct-save-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  var res = await api('POST', '/api/admin/control-tables', {
    name: name,
    feature: feature,
    outputField: outputField,
    valueSource: valueSource,
    hardware: hardware,
    rules: rules
  });

  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Save Control Table';
  }

  if (!res.ok) {
    if (msg) {
      msg.textContent = (res.data && res.data.error) || 'Save failed.';
      msg.style.color = 'var(--danger)';
    }
    return;
  }

  if (msg) {
    msg.textContent = 'Control table saved.';
    msg.style.color = 'var(--green-600)';
  }

  await loadControlTables();

  setTimeout(function () {
    var editor = TGE.el('ct-editor');
    if (editor) {
      editor.style.display = 'none';
      editor.innerHTML = '';
    }
  }, 500);
}

TGE.editControlTable = function(id) {
  var table = window.controlTablesCache.find(function(t) {
    return String(t.id) === String(id);
  });

  if (!table) {
    alert('Unable to locate control table.');
    return;
  }

 table.hardware = (window.controlTableHardwareCache || [])
  .filter(function(h) {
    return String(h.control_table_id) === String(id);
  })
  .map(function(h) {
    return h.hardware_match;
  });

openControlTableEditor(table);
};
  
  // ── API REFERENCE TAB ─────────────────────────────────────────────────────────
  var API_REFS = [
    { id: 'API-1', method: 'GET', group: 'vehicle',  url: '/v1/vehicles',                               returns: 'All vehicles — vehicleId, name, registration, make, model',          usedBy: ['Asset Track fleet', 'Camera Snapshot fleet', 'SD Health fleet'] },
    { id: 'API-2', method: 'GET', group: 'device',   url: '/v1/devices',                                returns: 'All devices — imei, serialNumber, vehicleId, type',                  usedBy: ['IMEI lookup', 'Asset Track', 'VPM', 'Camera Snapshot user'] },
    { id: 'API-3', method: 'GET', group: 'device',   url: '/v1/devices/{imei}?embed=devicestats',       returns: 'Single device — sdCard1, sdCard2, overallStatus',                    usedBy: ['SD Card Health user input'] },
    { id: 'API-4', method: 'GET', group: 'camera',   url: '/v1/events?types=camera&pruning=B2B',        returns: 'Camera events — vehicleId, timeAt, mediaFiles with image URLs',       usedBy: ['Camera Snapshot user', 'Camera Snapshot fleet', 'Asset Snapshot'] },
    { id: 'API-5', method: 'GET', group: 'camera',   url: '/v1/devices/{cameraId}/camera-device-stats', returns: 'Camera stats — sdCard1/2 status, firmware',                          usedBy: ['Asset Snapshot SD card'] },
    { id: 'API-6', method: 'GET', group: 'metrics',  url: '/v1/vehicles/{vehicleId}/hermes-stats',      returns: 'Live metrics — ignition, speed, rpm, gpio, gps, driverName',         usedBy: ['Asset Snapshot metrics, location'] },
    { id: 'API-7', method: 'GET', group: 'metrics',  url: '/v1/vehicles/{vehicleId}/meters',            returns: 'Odometer, engine hours',                                             usedBy: ['Asset Snapshot performance'] },
    { id: 'API-8', method: 'GET', group: 'vehicle',  url: '/v1/vehicles/{vehicleId}/devices',           returns: 'Devices linked to a vehicle — imei, serialNumber, type',             usedBy: ['Asset Snapshot devices', 'SD Health fleet'] },
  ];

  // ── Mailer Data tab ──────────────────────────────────────────────────────────
  var mailerState = { signatures: [], editingId: null };

  function renderMailerTab() {
    return [
      '<div class="card">',
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">',
          '<div>',
            '<div class="card-kicker">Mailer Data</div>',
            '<div class="card-title">Email Signatures</div>',
          '</div>',
          '<button class="btn btn-primary" id="mailer-add-btn" type="button">+ Add Signature</button>',
        '</div>',
        '<div id="mailer-sig-list"><p style="color:var(--muted);font-size:13px;">Loading signatures...</p></div>',
      '</div>',

      '<div class="card" id="mailer-edit-panel" style="display:none;">',
        '<div class="card-kicker" id="mailer-edit-kicker">Add Signature</div>',
        '<div class="card-title" id="mailer-edit-title">New Signature</div>',
        '<div style="display:flex;flex-direction:column;gap:12px;margin-top:10px;">',
          '<div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;">Label</label>',
            '<input id="mailer-label-input" type="text" placeholder="e.g. Barend Blignaut — Telematics" style="width:100%;height:36px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font-size:13px;background:var(--surface);color:var(--ink);" /></div>',
          '<div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;">HTML Content</label>',
            '<textarea id="mailer-html-input" rows="10" placeholder="<div>...</div>" style="width:100%;font-family:monospace;font-size:12px;border:1px solid var(--line);border-radius:8px;padding:10px;resize:vertical;background:var(--surface);color:var(--ink);"></textarea></div>',
          '<div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;">Preview</label>',
            '<div id="mailer-preview" style="border:1px solid var(--line);border-radius:8px;padding:14px;background:#fff;"></div></div>',
          '<div style="display:flex;gap:8px;">',
            '<button class="btn btn-primary" id="mailer-save-btn" type="button">Save</button>',
            '<button class="btn" id="mailer-cancel-btn" type="button">Cancel</button>',
          '</div>',
        '</div>',
      '</div>',
    ].join('');
  }

function renderControlTablesTab() {
  return [
    '<div class="card">',

      '<div class="card-kicker">Management</div>',
      '<div class="card-title">Control Tables</div>',

      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;">',

        '<div style="color:var(--muted);font-size:13px;">',
          'Create reusable control tables that drive status outputs for Asset Track and future modules.',
        '</div>',

        '<button class="btn btn-primary" id="ct-new-btn" type="button">',
          '+ Create Control Table',
        '</button>',

      '</div>',

    '</div>',

    '<div id="ct-list" style="margin-top:16px;">',
  '<div class="empty-state">No control tables configured.</div>',
'</div>',

    '<div id="ct-editor" style="display:none;margin-top:16px;"></div>'

  ].join('');
}
  
  async function loadSignatures() {
    var r = await api('GET', '/api/mailer/signatures?all=1');
    mailerState.signatures = (r.ok && r.data && r.data.signatures) ? r.data.signatures : [];
    renderSignatureList();
  }

  function renderSignatureList() {
    var el = TGE.el('mailer-sig-list');
    if (!el) return;
    if (!mailerState.signatures.length) {
      el.innerHTML = '<p style="color:var(--muted);font-size:13px;">No signatures yet — click "+ Add Signature" to create one.</p>';
      wireMailerButtons();
      return;
    }
    el.innerHTML = mailerState.signatures.map(function(sig) {
      var active = sig.active === 1 || sig.active === true;
      return '<div class="card" style="margin-bottom:10px;' + (active ? '' : 'opacity:0.55;') + '">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">' +
          '<div>' +
            '<div style="font-size:13px;font-weight:700;">' + escapeMailerHtml(sig.label) + '</div>' +
            '<div style="font-size:11px;color:' + (active ? 'var(--green-600)' : 'var(--muted)') + ';font-weight:600;text-transform:uppercase;">' + (active ? 'Active' : 'Inactive') + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;">' +
            '<button class="btn mailer-edit-row-btn" data-id="' + sig.id + '" type="button" style="height:30px;font-size:12px;">Edit</button>' +
            '<button class="btn mailer-toggle-row-btn" data-id="' + sig.id + '" data-active="' + (active?1:0) + '" type="button" style="height:30px;font-size:12px;' + (active ? 'color:var(--danger);' : 'color:var(--green-600);') + '">' + (active ? 'Deactivate' : 'Reactivate') + '</button>' +
          '</div>' +
        '</div>' +
        '<div style="border-top:1px solid var(--line);margin-top:10px;padding-top:10px;background:#fff;border-radius:6px;padding:10px;">' + sig.html + '</div>' +
      '</div>';
    }).join('');
    wireMailerButtons();
  }

  function wireMailerButtons() {
    var addBtn = TGE.el('mailer-add-btn');
    if (addBtn) addBtn.onclick = function() { openMailerEdit(null); };

    document.querySelectorAll('.mailer-edit-row-btn').forEach(function(btn) {
      btn.onclick = function() {
        var id = parseInt(btn.dataset.id, 10);
        var sig = mailerState.signatures.find(function(s) { return s.id === id; });
        if (sig) openMailerEdit(sig);
      };
    });

    document.querySelectorAll('.mailer-toggle-row-btn').forEach(function(btn) {
      btn.onclick = async function() {
        var id     = parseInt(btn.dataset.id, 10);
        var active = btn.dataset.active === '1';
        await api('PUT', '/api/mailer/signatures/' + id, { active: !active });
        loadSignatures();
      };
    });
  }

  function openMailerEdit(sig) {
    mailerState.editingId = sig ? sig.id : null;
    TGE.el('mailer-edit-kicker').textContent = sig ? 'Edit Signature' : 'Add Signature';
    TGE.el('mailer-edit-title').textContent  = sig ? sig.label : 'New Signature';
    TGE.el('mailer-label-input').value = sig ? sig.label : '';
    TGE.el('mailer-html-input').value  = sig ? sig.html  : '';
    updateMailerPreview();

    var panel = TGE.el('mailer-edit-panel');
    if (panel) panel.style.display = '';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    var htmlInput = TGE.el('mailer-html-input');
    if (htmlInput) htmlInput.oninput = updateMailerPreview;

    TGE.el('mailer-save-btn').onclick   = saveMailerSignature;
    TGE.el('mailer-cancel-btn').onclick = function() { panel.style.display = 'none'; };
  }

  function updateMailerPreview() {
    var html = (TGE.el('mailer-html-input') || {}).value || '';
    var preview = TGE.el('mailer-preview');
    if (preview) preview.innerHTML = html || '<span style="color:var(--muted);font-size:12px;">Preview will appear here</span>';
  }

  async function saveMailerSignature() {
    var label = (TGE.el('mailer-label-input') || {}).value || '';
    var html  = (TGE.el('mailer-html-input')  || {}).value || '';
    if (!label.trim() || !html.trim()) { alert('Label and HTML content are both required.'); return; }

    var saveBtn = TGE.el('mailer-save-btn');
    if (saveBtn) { saveBtn.textContent = 'Saving...'; saveBtn.disabled = true; }

    var payload = { label: label, html: html };
    var r;
    if (mailerState.editingId) {
      r = await api('PUT', '/api/mailer/signatures/' + mailerState.editingId, payload);
    } else {
      r = await api('POST', '/api/mailer/signatures', payload);
    }

    if (saveBtn) { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }

    if (!r.ok) { alert(r.data && r.data.error ? r.data.error : 'Save failed.'); return; }

    TGE.el('mailer-edit-panel').style.display = 'none';
    loadSignatures();
  }

  function escapeMailerHtml(s) {
    var div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }

  function renderApiTab() {
    var filterBar = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' +
      ['all','vehicle','device','camera','metrics'].map(function(g) {
        return '<button class="btn' + (g === 'all' ? ' btn-primary' : '') + ' api-filter-btn" data-group="' + g + '" type="button">' + (g === 'all' ? 'All' : g.charAt(0).toUpperCase() + g.slice(1)) + '</button>';
      }).join('') + '</div>';

    var cards = API_REFS.map(function (a) {
      var pills = a.usedBy.map(function(u) {
        return '<span style="display:inline-block;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:600;background:var(--surface-3);color:var(--muted);margin:2px;">' + u + '</span>';
      }).join('');
      return '<div class="card api-ref-card" data-group="' + a.group + '" style="margin-bottom:10px;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">' +
          '<span style="background:var(--ink);color:var(--yellow);padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;font-family:monospace;">' + a.id + '</span>' +
          '<span class="badge badge-green">' + a.method + '</span>' +
          '<code style="font-size:12px;color:var(--ink);font-weight:600;">' + a.url + '</code>' +
        '</div>' +
        '<p style="font-size:12px;color:var(--muted);margin-bottom:8px;"><strong style="color:var(--ink);">Returns:</strong> ' + a.returns + '</p>' +
        '<div>' + pills + '</div>' +
        '</div>';
    }).join('');

    return '<div class="card"><div class="card-kicker">API Reference</div><div class="card-title">Telematics API Endpoints</div><p style="font-size:12px;color:var(--muted);margin-bottom:14px;">All calls proxied through the Cloudflare Worker. API key never exposed to the browser.</p>' + filterBar + '<div id="api-ref-list">' + cards + '</div></div>';
  }

  function wireApiFilters() {
    document.querySelectorAll('.api-filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.api-filter-btn').forEach(function (b) { b.classList.remove('btn-primary'); });
        btn.classList.add('btn-primary');
        var group = btn.dataset.group;
        document.querySelectorAll('.api-ref-card').forEach(function (card) {
          card.style.display = (group === 'all' || card.dataset.group === group) ? '' : 'none';
        });
      });
    });
  }

  // ── Export ────────────────────────────────────────────────────────────────────
  function wireExportBtns() {
    TGE.on('admin-export-csv', 'click', exportCsv);
    TGE.on('admin-export-xlsx', 'click', function () { alert('XLSX export coming soon.'); });
  }

  function exportCsv() {
    if (!state.users.length) return;
    var headers = ['First Name','Last Name','Username','Email','Role','Status','Created'];
    var rows = state.users.map(function (u) {
      return [u.first_name, u.last_name, u.username, u.email || '', u.role_name || '', u.status, u.created_at]
        .map(function (v) { return '"' + String(v || '').replace(/"/g, '""') + '"'; }).join(',');
    });
    var csv  = [headers.join(',')].concat(rows).join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var a    = document.createElement('a');
    a.href   = URL.createObjectURL(blob);
    a.download = 'tge-users-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ── Register ──────────────────────────────────────────────────────────────────
  var _orig = TGE.onAppReady;
  TGE.onAppReady = function () {
    if (typeof _orig === 'function') _orig();
    render();
  };

  TGE.onShow['admin'] = function () {
    wireApiFilters();
  };

})();
