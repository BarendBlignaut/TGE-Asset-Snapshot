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
            '<button class="hero-mode-btn" id="admin-tab-utilisation" type="button">Utilisation</button>',
          '</div>',
          '<div class="hero-bar-right">',
            '<div class="hero-divider"></div>',
            '<button class="hero-export-btn active" id="admin-export-csv" type="button">CSV</button>',
      '<div id="admin-content-users">',   renderUsersTab(),   '</div>',
      '<div id="admin-content-history" style="display:none;">', renderHistoryTab(), '</div>',
      '<div id="admin-content-api" style="display:none;">',     renderApiTab(),     '</div>',
      '<div id="admin-content-mailer" style="display:none;">',  renderMailerTab(),  '</div>',
      '<div id="admin-content-utilisation" style="display:none;">', renderUtilisationTab(), '</div>',
    ].join('');

    wireAdminTabs();
    wireUsersTab();
      { btn: 'admin-tab-users',   content: 'admin-content-users' },
      { btn: 'admin-tab-history', content: 'admin-content-history' },
      { btn: 'admin-tab-api',     content: 'admin-content-api' },
      { btn: 'admin-tab-mailer',  content: 'admin-content-mailer' },
      { btn: 'admin-tab-utilisation', content: 'admin-content-utilisation' },
    ];
    tabs.forEach(function (t) {
      TGE.on(t.btn, 'click', function () {
        tabs.forEach(function (x) {
    div.textContent = s || '';
    return div.innerHTML;
  }

  function renderUtilisationTab() {
    var sections = [
      ['Feed mappings', 'Configure SharePoint folder, file pattern, parser type, worksheet, header row, key column, and date/KM columns per feed.'],
      ['Static Fleet sanitising', 'Draft and publish column-scoped exact value or phrase exclusions before users see active fleet records.'],
      ['Field/display mappings', 'Choose which imported Static Fleet fields display in UD, appear as user filters, and define their labels/order.'],
      ['Import logs/errors', 'Review import runs, row counts, source files, unmatched Legacy Numbers, validation errors, and DB upsert results.'],
      ['Notification settings', 'Define the single email recipient used for import errors and unmatched asset notifications.'],
    ];

    return [
      '<div class="card">',
        '<div class="card-kicker">Utilisation Admin</div>',
        '<div class="card-title">Control Centre</div>',
        '<p style="font-size:12px;color:var(--muted);margin:0 0 14px;">Configuration shell for Fleet Utilisation imports, sanitising, field mappings, logs and notifications. DB-backed controls will be connected as each feed is built.</p>',
        '<div class="data-grid data-grid-3">',
          sections.map(function(section) {
            return '<div class="data-item" style="align-items:flex-start;gap:6px;">' +
              '<span>' + section[0] + '</span>' +
              '<strong style="font-size:12px;line-height:1.45;font-weight:500;color:var(--ink-2);">' + section[1] + '</strong>' +
            '</div>';
          }).join(''),
        '</div>',
      '</div>',
    ].join('');
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
