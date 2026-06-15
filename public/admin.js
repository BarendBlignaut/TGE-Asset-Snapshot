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
    ].join('');

    wireAdminTabs();
    wireUsersTab();
    wireExportBtns();
    loadRoles().then(function() { loadUsers(); });
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  function wireAdminTabs() {
    var tabs = [
      { btn: 'admin-tab-users',   content: 'admin-content-users' },
      { btn: 'admin-tab-history', content: 'admin-content-history' },
      { btn: 'admin-tab-api',     content: 'admin-content-api' },
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
