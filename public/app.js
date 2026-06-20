// TGE Asset Snapshot — Core
// public/app.js

(function () {
  'use strict';

  // ── Shared state ────────────────────────────────────────────────────────────
  window.TGE = window.TGE || {};

  TGE.state = {
    user:        null,   // { id, username, firstName, lastName, role, roleId }
    permissions: {},     // { feature: { action: { enabled, limit } } }
    activeView:  'snapshot',
  };

  // ── Utility functions (available to all page modules) ───────────────────────

  TGE.el = function (id) { return document.getElementById(id); };

  TGE.show = function (el, display) {
    if (!el) return;
    if (typeof el === 'string') el = TGE.el(el);
    el.style.display = display || 'block';
  };

  TGE.hide = function (el) {
    if (!el) return;
    if (typeof el === 'string') el = TGE.el(el);
    el.style.display = 'none';
  };

  TGE.setText = function (id, text) {
    var el = TGE.el(id);
    if (el) el.textContent = text != null ? String(text) : '';
  };

  TGE.on = function (id, event, fn) {
    var el = typeof id === 'string' ? TGE.el(id) : id;
    if (el) el.addEventListener(event, fn);
  };

  TGE.formatDate = function (iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-AU', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
    } catch (e) { return iso; }
  };

  TGE.safeText = function (val, fallback) {
    return (val != null && String(val).trim() !== '') ? String(val) : (fallback || '—');
  };

  // ── Permission check ─────────────────────────────────────────────────────────
  TGE.can = function (feature, action) {
    var f = TGE.state.permissions[feature];
    if (!f) return false;
    var a = f[action];
    if (!a) return false;
    return a.enabled === true;
  };

  TGE.limit = function (feature, action) {
    var f = TGE.state.permissions[feature];
    if (!f) return 0;
    var a = f[action];
    if (!a) return 0;
    return a.limit == null ? Infinity : a.limit;
  };

  // ── API helper ───────────────────────────────────────────────────────────────
  TGE.api = async function (method, path, body) {
    var opts = {
      method:  method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    };
    if (body) opts.body = JSON.stringify(body);
    var res  = await fetch(path, opts);
    var data = await res.json().catch(function () { return {}; });
    return { ok: res.ok, status: res.status, data: data };
  };

  // ── View switching ────────────────────────────────────────────────────────────
  TGE.showView = function (viewId) {
    // Hide all views
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.remove('active');
    });
    // Show target
    var target = TGE.el('view-' + viewId);
    if (target) target.classList.add('active');
    TGE.state.activeView = viewId;
    document.body.setAttribute('data-active-view', viewId);
    // Notify page module if it has an onShow handler
    var handler = TGE.onShow && TGE.onShow[viewId];
    if (typeof handler === 'function') handler();
  };

  // Modules register their onShow handlers here
  TGE.onShow = {};

  // ── Nav wiring ────────────────────────────────────────────────────────────────
  function initNav() {
    var GRP_KEY = 'tge_nav_groups';
    var saved   = {};
    try { saved = JSON.parse(localStorage.getItem(GRP_KEY) || '{}'); } catch (e) {}

    // Group toggle
    ['operations', 'camera', 'management'].forEach(function (g) {
      var btn = TGE.el('grp-' + g);
      var ch  = TGE.el('children-' + g);
      if (!btn || !ch) return;

      var isOpen = saved[g] !== undefined ? saved[g] : (g === 'operations');
      btn.classList.toggle('open', isOpen);
      ch.classList.toggle('open', isOpen);

      btn.addEventListener('click', function () {
        var open = btn.classList.contains('open');
        btn.classList.toggle('open', !open);
        ch.classList.toggle('open', !open);
        saved[g] = !open;
        try { localStorage.setItem(GRP_KEY, JSON.stringify(saved)); } catch (e) {}
      });
    });

    // Nav item clicks
    document.querySelectorAll('.nav-item[data-view]').forEach(function (item) {
      item.addEventListener('click', function () {
        var viewId = item.dataset.view;
        var group  = item.dataset.group;
        var title  = item.dataset.title;

        // Update active state
        document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
        document.querySelectorAll('.nav-group-btn').forEach(function (b) { b.classList.remove('has-active'); });
        item.classList.add('active');
        var grpBtn = TGE.el('grp-' + group);
        if (grpBtn) grpBtn.classList.add('has-active');

        // Update topbar
        TGE.setText('topbar-group', item.dataset.group.charAt(0).toUpperCase() + item.dataset.group.slice(1));
        TGE.setText('topbar-title', title);

        // Switch view
        TGE.showView(viewId);
      });
    });

    // Sidebar toggle
    var COLLAPSE_KEY = 'tge_sidebar_collapsed';
    var sidebar      = TGE.el('sidebar');
    var toggleBtn    = TGE.el('sidebar-toggle');

    try {
      if (localStorage.getItem(COLLAPSE_KEY) === '1' && sidebar) {
        sidebar.style.width = '0';
      }
    } catch (e) {}

    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', function () {
        var collapsed = sidebar.style.width === '0px' || sidebar.style.width === '0';
        sidebar.style.width = collapsed ? '' : '0';
        try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '0' : '1'); } catch (e) {}
      });
    }
  }

  // ── Login ─────────────────────────────────────────────────────────────────────
  function initLogin() {
    var form    = TGE.el('login-form');
    var errEl   = TGE.el('login-error');
    var loginBtn = TGE.el('login-btn');

    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var username = TGE.el('login-username').value.trim();
      var password = TGE.el('login-password').value.trim();

      if (!username || !password) {
        errEl.textContent = 'Please enter your username and password.';
        return;
      }

      loginBtn.textContent = 'Signing in...';
      loginBtn.disabled    = true;
      errEl.textContent    = '';

      var result = await TGE.api('POST', '/api/auth/login', { username: username, password: password });

      loginBtn.textContent = 'Sign In';
      loginBtn.disabled    = false;

      if (!result.ok) {
        errEl.textContent = result.data.error || 'Login failed. Please try again.';
        return;
      }

      TGE.state.user        = result.data.user;
      TGE.state.permissions = result.data.permissions || {};
      showApp();
    });
  }

  // ── Session restore ───────────────────────────────────────────────────────────
  async function restoreSession() {
    var result = await TGE.api('GET', '/api/auth/session');
    if (result.ok && result.data.ok) {
      TGE.state.user        = result.data.user;
      TGE.state.permissions = result.data.permissions || {};
      showApp();
    }
    // If no session, login overlay stays visible
  }

  // ── Show app after login ──────────────────────────────────────────────────────
  function showApp() {
    var user = TGE.state.user;

    // Update sidebar user info
    var initials = ((user.firstName || '?')[0] + (user.lastName || '?')[0]).toUpperCase();
    TGE.setText('user-avatar',       initials);
    TGE.setText('user-display-name', user.firstName + ' ' + user.lastName);
    TGE.setText('user-role-label',   user.role || 'user');

    // Show sidebar
    var sidebar = TGE.el('sidebar');
    if (sidebar) sidebar.classList.add('visible');

    // Hide login, show app
    TGE.hide('login-overlay');
    TGE.show('app-shell', 'grid');

    // Apply permissions — small delay ensures DOM is fully ready
    setTimeout(function() {
      applyNavPermissions();
      initNav();
    }, 50);

    // Show default view
    TGE.showView('snapshot');
    TGE.setText('topbar-group', 'Operations');
    TGE.setText('topbar-title', 'Asset Snapshot');

    // Init diagnostics panel (if permitted)
    initDiagnostics();

    // Notify all page modules that app is ready
    if (typeof TGE.onAppReady === 'function') TGE.onAppReady();
  }

  // ── Apply permissions to nav ───────────────────────────────────────────────────
  function applyNavPermissions() {
    var navItems = document.querySelectorAll('.nav-item[data-view]');
    navItems.forEach(function (item) {
      var view = item.dataset.view;
      // Roles page uses admin permission
      var allowed = view === 'utilisation'
        ? TGE.can('utilisation', 'view-dashboard')
        : TGE.can((view === 'roles' || view === 'api') ? 'admin' : view, 'view');
      if (!allowed) {
        item.style.display = 'none';
      }
    });

    // Hide management group entirely if no admin access
    if (!TGE.can('admin', 'view')) {
      var mgmtBtn = TGE.el('grp-management');
      var mgmtCh  = TGE.el('children-management');
      if (mgmtBtn) mgmtBtn.style.display = 'none';
      if (mgmtCh)  mgmtCh.style.display  = 'none';
    }
  }

  // ── Sign out ──────────────────────────────────────────────────────────────────
  function initSignOut() {
    TGE.on('sign-out-btn', 'click', async function () {
      await TGE.api('POST', '/api/auth/logout');
      TGE.state.user        = null;
      TGE.state.permissions = {};
      TGE.show('login-overlay', 'flex');
      TGE.hide('app-shell');
      var sidebar = TGE.el('sidebar');
      if (sidebar) sidebar.classList.remove('visible');
      TGE.el('login-username').value = '';
      TGE.el('login-password').value = '';
      TGE.el('login-error').textContent = '';
    });
  }

  // ── Diagnostics ──────────────────────────────────────────────────────────────
  var diagLog = [];
  var diagOpen = false;

  TGE.diagLog = function(method, path, status, detail) {
    var entry = {
      time:   new Date().toLocaleTimeString('en-AU', { hour12: false }),
      method: method,
      path:   path,
      status: status,
      detail: detail || '',
    };
    diagLog.push(entry);
    if (diagLog.length > 200) diagLog.shift();
    if (diagOpen) renderDiagPanel();
  };

  // Override TGE.api to log all calls
  var _origApi = TGE.api;
  TGE.api = async function(method, path, body) {
    var result;
    try {
      result = await _origApi(method, path, body);
      TGE.diagLog(method, path, result.status, result.ok ? 'OK' : JSON.stringify(result.data).slice(0,120));
    } catch(e) {
      TGE.diagLog(method, path, 'ERR', e.message);
      throw e;
    }
    return result;
  };

  function initDiagnostics() {
    if (!TGE.can('diagnostics', 'view')) return;

    // Add button to topbar
    var topbarRight = document.querySelector('.topbar-right');
    if (topbarRight) {
      var diagBtn = document.createElement('button');
      diagBtn.id = 'diag-btn';
      diagBtn.textContent = '⚡ Diagnostics';
      diagBtn.style.cssText = 'height:32px;padding:0 12px;border-radius:7px;border:1px solid var(--line);background:var(--surface-2);color:var(--muted);font:inherit;font-size:12px;font-weight:600;cursor:pointer;margin-right:8px;';
      diagBtn.addEventListener('click', toggleDiagPanel);
      topbarRight.insertBefore(diagBtn, topbarRight.firstChild);
    }

    // Create panel
    var panel = document.createElement('div');
    panel.id = 'diag-panel';
    panel.style.cssText = 'display:none;position:fixed;bottom:0;left:0;right:0;height:280px;background:var(--green-900);color:#fff;z-index:1000;flex-direction:column;border-top:2px solid var(--yellow);';
    panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,0.1);flex-shrink:0;">' +
      '<span style="font-size:12px;font-weight:700;color:var(--yellow);">⚡ Diagnostics</span>' +
      '<div style="display:flex;gap:8px;">' +
        '<button onclick="TGE.diagClear()" style="height:26px;padding:0 10px;border-radius:5px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;font:inherit;font-size:11px;cursor:pointer;">Clear</button>' +
        '<button onclick="TGE.diagCopy()" style="height:26px;padding:0 10px;border-radius:5px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;font:inherit;font-size:11px;cursor:pointer;">Copy All</button>' +
        '<button onclick="TGE.diagClose()" style="height:26px;padding:0 10px;border-radius:5px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;font:inherit;font-size:11px;cursor:pointer;">✕ Close</button>' +
      '</div>' +
    '</div>' +
    '<div id="diag-log" style="flex:1;overflow-y:auto;padding:8px 14px;font-family:monospace;font-size:11px;line-height:1.7;"></div>';
    document.body.appendChild(panel);
  }

  function toggleDiagPanel() {
    diagOpen = !diagOpen;
    var panel = TGE.el('diag-panel');
    if (panel) panel.style.display = diagOpen ? 'flex' : 'none';
    var btn = TGE.el('diag-btn');
    if (btn) {
      btn.style.background = diagOpen ? 'var(--green-700)' : 'var(--surface-2)';
      btn.style.color      = diagOpen ? 'var(--yellow)'   : 'var(--muted)';
      btn.style.borderColor = diagOpen ? 'var(--green-600)' : 'var(--line)';
    }
    if (diagOpen) renderDiagPanel();
  }

  function renderDiagPanel() {
    var log = TGE.el('diag-log');
    if (!log) return;
    if (!diagLog.length) {
      log.innerHTML = '<span style="color:rgba(255,255,255,0.3);">No activity yet.</span>';
      return;
    }
    log.innerHTML = diagLog.slice().reverse().map(function(e) {
      var statusColor = e.status >= 200 && e.status < 300 ? '#69f0ae'
        : e.status >= 400 ? '#ff5252'
        : e.status === 'ERR' ? '#ff5252'
        : '#ffd740';
      return '<div style="padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.05);">' +
        '<span style="color:rgba(255,255,255,0.4);">' + e.time + '</span> ' +
        '<span style="color:#ffd740;font-weight:700;min-width:40px;display:inline-block;">' + e.method + '</span> ' +
        '<span style="color:#fff;">' + e.path + '</span> ' +
        '<span style="color:' + statusColor + ';font-weight:700;"> -&gt; ' + e.status + '</span>' +
        (e.detail ? '<span style="color:rgba(255,255,255,0.5);"> · ' + e.detail.slice(0,100) + '</span>' : '') +
      '</div>';
    }).join('');
  }

  TGE.diagClear = function() { diagLog = []; renderDiagPanel(); };
  TGE.diagClose = function() { diagOpen = false; var p = TGE.el('diag-panel'); if (p) p.style.display = 'none'; var b = TGE.el('diag-btn'); if (b) { b.style.background='var(--surface-2)'; b.style.color='var(--muted)'; b.style.borderColor='var(--line)'; } };
  TGE.diagCopy  = function() {
    var text = diagLog.map(function(e) { return e.time + ' ' + e.method + ' ' + e.path + ' -> ' + e.status + (e.detail ? ' - ' + e.detail : ''); }).join('\n');
    navigator.clipboard.writeText(text).then(function() { alert('Diagnostics copied to clipboard.'); });
  };

  // ── Boot ──────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    initLogin();
    initSignOut();
    restoreSession();
  });

})();
