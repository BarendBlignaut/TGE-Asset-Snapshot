// TGE Asset Snapshot — Admin Page
// public/admin.js

(function () {
  'use strict';

  
  // ── State ────────────────────────────────────────────────────────────────────
  var state = {
    users:       [],
    roles:       [],
    activity:    [],
    activeTab:   'users',
    editingUser: null,
  };

  // ── API shortcuts ─────────────────────────────────────────────────────────────
  var api = TGE.api;

  // ── Render the admin view ─────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-admin');
    if (!view) return;

    view.innerHTML = [
      // Hero bar
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
            '<button class="hero-export-btn" id="admin-export-xlsx" type="button">XLSX</button>',
            '<button class="hero-export-btn" id="admin-export-csv" type="button">CSV</button>',
          '</div>',
        '</div>',
      '</div>',

      // Tab content areas
      '<div id="admin-content-users">',   renderUsersTab(),   '</div>',
      '<div id="admin-content-history" style="display:none;">', renderHistoryTab(), '</div>',
      '<div id="admin-content-api" style="display:none;">',     renderApiTab(),     '</div>',
    ].join('');

    wireAdminTabs();
    wireUsersTab();
    wireExportBtns();
    loadUsers();
    loadRoles();
  }

  // ── Tab switching ─────────────────────────────────────────────────────────────
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
        var btn     = TGE.el(t.btn);
        var content = TGE.el(t.content);
        if (btn)     btn.classList.add('active');
        if (content) content.style.display = '';
        state.activeTab = t.btn.replace('admin-tab-', '');

        // Activate export buttons for this tab
        activateExports();

        // Load data for tab
        if (state.activeTab === 'history') loadActivity();
      });
    });
  }

  // ── USERS TAB ─────────────────────────────────────────────────────────────────
  function renderUsersTab() {
    return [
      // Add user form
      '<div class="card" style="margin-bottom:14px;">',
        '<div class="card-kicker">User Management</div>',
        '<div class="card-title" id="user-form-title">Add New User</div>',
        '<div class="data-grid data-grid-3" style="margin-bottom:12px;">',
          '<div class="field"><label>First Name</label><input id="user-first-name" type="text" placeholder="First name" /></div>',
          '<div class="field"><label>Last Name</label><input id="user-last-name" type="text" placeholder="Last name" /></div>',
          '<div class="field"><label>Username</label><input id="user-username" type="text" placeholder="username" /></div>',
          '<div class="field"><label>Email</label><input id="user-email" type="email" placeholder="email@example.com" /></div>',
          '<div class="field"><label>Password</label><input id="user-password" type="password" placeholder="Set password" /></div>',
          '<div class="field"><label>Role</label><select id="user-role"><option value="3">User</option><option value="2">Admin</option><option value="1">Superuser</option></select></div>',
          '<div class="field"><label>Status</label><select id="user-status"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>',
        '</div>',
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">',
          '<button class="btn btn-primary" id="user-save-btn" type="button">Save User</button>',
          '<button class="btn" id="user-cancel-btn" type="button" style="display:none;">Cancel</button>',
          '<button class="btn" id="user-import-btn" type="button">Import XLSX</button>',
          '<input type="file" id="user-import-file" accept=".xlsx,.xls,.csv" style="display:none;" />',
          '<p id="user-form-message" style="margin:0;font-size:12px;color:var(--muted);"></p>',
        '</div>',
      '</div>',

      // Users table
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
    TGE.on('user-save-btn', 'click', saveUser);
    TGE.on('user-cancel-btn', 'click', cancelEdit);
    TGE.on('user-import-btn', 'click', function () { TGE.el('user-import-file').click(); });
    TGE.on('user-import-file', 'change', handleImport);
  }

  async function loadUsers() {
    var result = await api('GET', '/api/admin/users');
    if (!result.ok) return;
    state.users = result.data.users || [];
    renderUsersTable();
    activateExports();
  }

  async function loadRoles() {
    var result = await api('GET', '/api/admin/roles');
    if (!result.ok) return;
    state.roles = result.data.roles || [];
    // Populate role select
    var sel = TGE.el('user-role');
    if (sel) {
      sel.innerHTML = state.roles.map(function (r) {
        return '<option value="' + r.id + '">' + r.name.charAt(0).toUpperCase() + r.name.slice(1) + '</option>';
      }).join('');
    }
  }

  function renderUsersTable() {
    var tbody = TGE.el('users-table-body');
    if (!tbody) return;
    if (!state.users.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px;">No users found.</td></tr>';
      return;
    }
    tbody.innerHTML = state.users.map(function (u) {
      var statusBadge = u.status === 'active'
        ? '<span class="badge badge-green">Active</span>'
        : '<span class="badge badge-gray">Inactive</span>';
      var roleBadge = u.role_name === 'superuser'
        ? '<span class="badge badge-yellow">' + u.role_name + '</span>'
        : u.role_name === 'admin'
        ? '<span class="badge badge-green">' + u.role_name + '</span>'
        : '<span class="badge badge-gray">' + u.role_name + '</span>';
      return [
        '<tr>',
          '<td><strong>' + TGE.safeText(u.first_name) + ' ' + TGE.safeText(u.last_name) + '</strong></td>',
          '<td>' + TGE.safeText(u.username) + '</td>',
          '<td>' + TGE.safeText(u.email, '—') + '</td>',
          '<td>' + roleBadge + '</td>',
          '<td>' + statusBadge + '</td>',
          '<td style="font-size:11px;color:var(--muted);">' + TGE.formatDate(u.created_at) + '</td>',
          '<td>',
            '<button class="btn" style="height:28px;font-size:11px;padding:0 10px;" onclick="TGE.adminEditUser(' + u.id + ')">Edit</button>',
            ' ',
            '<button class="btn btn-danger" style="height:28px;font-size:11px;padding:0 10px;" onclick="TGE.adminDeleteUser(' + u.id + ')">Deactivate</button>',
          '</td>',
        '</tr>',
      ].join('');
    }).join('');
  }

  async function saveUser() {
    var firstName = TGE.el('user-first-name').value.trim();
    var lastName  = TGE.el('user-last-name').value.trim();
    var username  = TGE.el('user-username').value.trim();
    var email     = TGE.el('user-email').value.trim();
    var password  = TGE.el('user-password').value.trim();
    var roleId    = TGE.el('user-role').value;
    var status    = TGE.el('user-status').value;
    var msgEl     = TGE.el('user-form-message');

    if (!firstName || !lastName || !username) {
      msgEl.textContent = 'First name, last name and username are required.';
      msgEl.style.color = 'var(--danger)';
      return;
    }

    var body = { firstName: firstName, lastName: lastName, username: username, email: email, roleId: parseInt(roleId), status: status };
    if (password) body.password = password;

    var result;
    if (state.editingUser) {
      result = await api('PUT', '/api/admin/users/' + state.editingUser, body);
    } else {
      if (!password) { msgEl.textContent = 'Password is required for new users.'; msgEl.style.color = 'var(--danger)'; return; }
      result = await api('POST', '/api/admin/users', body);
    }

    if (!result.ok) {
      msgEl.textContent = result.data.error || 'Save failed.';
      msgEl.style.color = 'var(--danger)';
      return;
    }

    msgEl.textContent = state.editingUser ? 'User updated.' : 'User created.';
    msgEl.style.color = 'var(--green-600)';
    cancelEdit();
    loadUsers();
  }

  // Expose edit/delete to table onclick handlers
  TGE.adminEditUser = function (id) {
    var user = state.users.find(function (u) { return u.id === id; });
    if (!user) return;
    state.editingUser = id;
    TGE.el('user-first-name').value = user.first_name || '';
    TGE.el('user-last-name').value  = user.last_name  || '';
    TGE.el('user-username').value   = user.username   || '';
    TGE.el('user-email').value      = user.email      || '';
    TGE.el('user-password').value   = '';
    TGE.el('user-status').value     = user.status     || 'active';
    TGE.el('user-form-title').textContent = 'Edit User — ' + user.username;
    TGE.show('user-cancel-btn');
    TGE.el('user-save-btn').textContent = 'Update User';
    TGE.el('user-form-message').textContent = '';
    TGE.el('view-admin').scrollIntoView({ behavior: 'smooth' });
  };

  TGE.adminDeleteUser = async function (id) {
    if (!confirm('Deactivate this user? They will no longer be able to log in.')) return;
    var result = await api('DELETE', '/api/admin/users/' + id);
    if (result.ok) loadUsers();
    else alert(result.data.error || 'Failed to deactivate user.');
  };

  function cancelEdit() {
    state.editingUser = null;
    TGE.el('user-first-name').value = '';
    TGE.el('user-last-name').value  = '';
    TGE.el('user-username').value   = '';
    TGE.el('user-email').value      = '';
    TGE.el('user-password').value   = '';
    TGE.el('user-status').value     = 'active';
    TGE.el('user-form-title').textContent = 'Add New User';
    TGE.hide('user-cancel-btn');
    TGE.el('user-save-btn').textContent = 'Save User';
    TGE.el('user-form-message').textContent = '';
  }

  function handleImport(e) {
    var file = e.target.files[0];
    if (!file) return;
    alert('XLSX import coming soon. For now, create users manually using the form above.');
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
            '<thead><tr>',
              '<th>User</th><th>Feature</th><th>Action</th><th>Detail</th><th>Date / Time</th>',
            '</tr></thead>',
            '<tbody id="history-table-body"><tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px;">Select a tab to load history.</td></tr></tbody>',
          '</table>',
        '</div>',
      '</div>',
    ].join('');
  }

  async function loadActivity() {
    var userId  = (TGE.el('history-user-filter')  || {}).value || '';
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
      var currentVal = userSel.value;
      userSel.innerHTML = '<option value="">All users</option>' +
        state.users.map(function (u) {
          return '<option value="' + u.id + '"' + (String(u.id) === currentVal ? ' selected' : '') + '>' + u.first_name + ' ' + u.last_name + '</option>';
        }).join('');
    }

    TGE.on('history-filter-btn', 'click', loadActivity);

    var tbody = TGE.el('history-table-body');
    if (!tbody) return;
    if (!state.activity.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px;">No activity found.</td></tr>';
      return;
    }
    tbody.innerHTML = state.activity.map(function (a) {
      return [
        '<tr>',
          '<td><strong>' + TGE.safeText(a.first_name) + ' ' + TGE.safeText(a.last_name) + '</strong><br><span style="font-size:11px;color:var(--muted);">' + TGE.safeText(a.username) + '</span></td>',
          '<td><span class="badge badge-gray">' + TGE.safeText(a.feature) + '</span></td>',
          '<td>' + TGE.safeText(a.action) + '</td>',
          '<td style="font-size:12px;color:var(--muted);">' + TGE.safeText(a.detail, '—') + '</td>',
          '<td style="font-size:11px;color:var(--muted);">' + TGE.formatDate(a.created_at) + '</td>',
        '</tr>',
      ].join('');
    }).join('');
  }

  // ── API REFERENCE TAB ─────────────────────────────────────────────────────────
  var API_REFS = [
    { id: 'API-1', method: 'GET', group: 'vehicle',  url: '/v1/vehicles',                              returns: 'All vehicles — vehicleId, name, registration, make, model, year',                             usedBy: ['Asset Track fleet', 'Camera Snapshot fleet', 'SD Health fleet', 'VPM fleet'] },
    { id: 'API-2', method: 'GET', group: 'device',   url: '/v1/devices',                               returns: 'All devices — imei, serialNumber, vehicleId, type',                                          usedBy: ['IMEI lookup', 'Asset Track', 'VPM', 'Camera Snapshot user'] },
    { id: 'API-3', method: 'GET', group: 'device',   url: '/v1/devices/{imei}?embed=devicestats',      returns: 'Single device stats — sdCard1, sdCard2, overallStatus',                                      usedBy: ['SD Card Health user input'] },
    { id: 'API-4', method: 'GET', group: 'camera',   url: '/v1/events?types=camera&pruning=B2B',       returns: 'Camera snapshot events — vehicleId, timeAt, mediaFiles with image URLs',                      usedBy: ['Camera Snapshot user', 'Camera Snapshot fleet', 'Asset Snapshot'] },
    { id: 'API-5', method: 'GET', group: 'camera',   url: '/v1/devices/{cameraId}/camera-device-stats',returns: 'Camera device stats — sdCard1/2 status, firmware',                                           usedBy: ['Asset Snapshot SD card section'] },
    { id: 'API-6', method: 'GET', group: 'metrics',  url: '/v1/vehicles/{vehicleId}/hermes-stats',     returns: 'Live metrics — ignition, speed, rpm, gpio, gps, driverName, performance',                    usedBy: ['Asset Snapshot metrics, GPIO, location'] },
    { id: 'API-7', method: 'GET', group: 'metrics',  url: '/v1/vehicles/{vehicleId}/meters',           returns: 'Odometer, engine hours',                                                                     usedBy: ['Asset Snapshot performance'] },
    { id: 'API-8', method: 'GET', group: 'vehicle',  url: '/v1/vehicles/{vehicleId}/devices',          returns: 'Devices linked to a vehicle — imei, serialNumber, type',                                     usedBy: ['Asset Snapshot devices', 'SD Health fleet'] },
  ];

  function renderApiTab() {
    var filterBar = [
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">',
        '<button class="btn btn-primary api-filter-btn" data-group="all" type="button">All</button>',
        '<button class="btn api-filter-btn" data-group="vehicle" type="button">Vehicle / Fleet</button>',
        '<button class="btn api-filter-btn" data-group="device" type="button">Device</button>',
        '<button class="btn api-filter-btn" data-group="camera" type="button">Camera / Events</button>',
        '<button class="btn api-filter-btn" data-group="metrics" type="button">Location / Metrics</button>',
      '</div>',
    ].join('');

    var cards = API_REFS.map(function (api) {
      var methodColor = api.method === 'GET' ? 'badge-green' : 'badge-yellow';
      var pills = api.usedBy.map(function (u) {
        return '<span style="display:inline-block;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:600;background:var(--surface-3);color:var(--muted);margin:2px;">' + u + '</span>';
      }).join('');
      return [
        '<div class="card api-ref-card" data-group="' + api.group + '" style="margin-bottom:10px;">',
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">',
            '<span style="background:var(--ink);color:var(--yellow);padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;font-family:monospace;">' + api.id + '</span>',
            '<span class="badge ' + methodColor + '">' + api.method + '</span>',
            '<code style="font-size:12px;color:var(--ink);font-weight:600;">' + api.url + '</code>',
          '</div>',
          '<p style="font-size:12px;color:var(--muted);margin-bottom:8px;"><strong style="color:var(--ink);">Returns:</strong> ' + api.returns + '</p>',
          '<div>' + pills + '</div>',
        '</div>',
      ].join('');
    }).join('');

    return '<div class="card"><div class="card-kicker">API Reference</div><div class="card-title">Telematics API Endpoints</div><p style="font-size:12px;color:var(--muted);margin-bottom:14px;">All calls are proxied through the Cloudflare Worker. The API key is never exposed to the browser.</p>' + filterBar + '<div id="api-ref-list">' + cards + '</div></div>';
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

  // ── Export buttons ─────────────────────────────────────────────────────────────
  function activateExports() {
    var xlsxBtn = TGE.el('admin-export-xlsx');
    var csvBtn  = TGE.el('admin-export-csv');
    if (xlsxBtn) xlsxBtn.classList.add('active');
    if (csvBtn)  csvBtn.classList.add('active');
  }

  function wireExportBtns() {
    TGE.on('admin-export-csv', 'click', exportCsv);
    TGE.on('admin-export-xlsx', 'click', function () {
      alert('XLSX export coming soon.');
    });
  }

  function exportCsv() {
    if (!state.users.length) return;
    var headers = ['First Name','Last Name','Username','Email','Role','Status','Created'];
    var rows = state.users.map(function (u) {
      return [u.first_name, u.last_name, u.username, u.email || '', u.role_name, u.status, u.created_at]
        .map(function (v) { return '"' + String(v || '').replace(/"/g, '""') + '"'; }).join(',');
    });
    var csv = [headers.join(',')].concat(rows).join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var a    = document.createElement('a');
    a.href   = URL.createObjectURL(blob);
    a.download = 'tge-users-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ── Register with app ──────────────────────────────────────────────────────────
  var _appReadyOrig = TGE.onAppReady;
  TGE.onAppReady = function () {
    if (typeof _appReadyOrig === 'function') _appReadyOrig();
    render();
  };

  TGE.onShow['admin'] = function () {
    // Re-wire API filters each time tab is shown
    wireApiFilters();
  };

})();
