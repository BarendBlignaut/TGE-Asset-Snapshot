// TGE Asset Snapshot — Vendor Platform
// public/vendor.js
//
// Vendor card grid + create/edit panel, following the roles.js pattern.
// Detail view opens a six-tab shell (Overview functional; File Spec,
// API Registry, Hardware Types, Control Tables, Import History arrive
// as their own builds). No vendor is ever hardcoded — this screen is
// the only place vendors are born.

(function () {
  'use strict';

  var state = {
    vendors: [],
    editing: null,     // vendor object being edited, or {} for create
    openVendor: null,  // vendor object whose detail view is open
  };

  var VENDOR_TABS = [
    { key: 'overview',       label: 'Overview' },
    { key: 'file-spec',      label: 'File Spec' },
    { key: 'api-registry',   label: 'API Registry' },
    { key: 'hardware-types', label: 'Hardware Types' },
    { key: 'control-tables', label: 'Control Tables' },
    { key: 'import-history', label: 'Import History' },
  ];

  // ── Render: main grid ─────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-vendor');
    if (!view) return;

    view.innerHTML = [
      '<div class="hero">',
        '<div class="hero-kicker">Management</div>',
        '<div class="hero-title">Vendor Platform</div>',
        '<div class="hero-sub">Every data supplier, internal or external — one identical template each. Vendors are created here and only here; no vendor is ever hardcoded.</div>',
      '</div>',
      '<div id="vendor-grid-wrap"><div class="card" style="text-align:center;color:var(--muted);padding:30px;">Loading vendors...</div></div>',
      '<div id="vendor-detail-wrap" style="display:none;"></div>',
    ].join('');

    loadVendors();
  }

  async function loadVendors() {
    var res = await TGE.api('GET', '/api/admin/vendors');
    if (!res.ok) {
      TGE.el('vendor-grid-wrap').innerHTML = '<div class="card" style="color:var(--muted);">Could not load vendors' + (res.data && res.data.error ? ': ' + escapeHtml(res.data.error) : '.') + '</div>';
      return;
    }
    state.vendors = res.data.vendors || [];
    renderGrid();
  }

  function renderGrid() {
    var wrap = TGE.el('vendor-grid-wrap');
    if (!wrap) return;

    var canManage = TGE.can('vendor', 'manage');

    var cards = state.vendors.map(function (v) {
      return [
        '<div class="card vendor-card" data-vendor-id="' + v.id + '" style="cursor:pointer;' + (v.active ? '' : 'opacity:0.55;') + '">',
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">',
            '<div class="card-title">' + escapeHtml(v.name) + '</div>',
            '<span style="font-size:11px;font-weight:700;color:' + (v.active ? 'var(--green-600)' : 'var(--muted)') + ';">' + (v.active ? 'ACTIVE' : 'INACTIVE') + '</span>',
          '</div>',
          '<p style="font-size:12px;color:var(--muted);margin:8px 0 0;min-height:16px;">' + escapeHtml(v.notes || '') + '</p>',
        '</div>',
      ].join('');
    }).join('');

    var createCard = canManage
      ? '<div class="card" id="vendor-create-card" style="cursor:pointer;border:2px dashed var(--line);display:flex;align-items:center;justify-content:center;min-height:90px;color:var(--muted);font-weight:600;font-size:13px;">+ Create Vendor</div>'
      : '';

    wrap.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;">' +
        cards + createCard +
      '</div>';

    wrap.querySelectorAll('.vendor-card').forEach(function (card) {
      card.onclick = function () {
        var v = state.vendors.find(function (x) { return String(x.id) === card.dataset.vendorId; });
        if (v) openDetail(v);
      };
    });
    TGE.on('vendor-create-card', 'click', function () { openPanel({}); });
  }

  // ── Create / edit panel ───────────────────────────────────────────────────
  function openPanel(vendor) {
    state.editing = vendor || {};
    var isNew = !state.editing.id;

    var overlay = document.createElement('div');
    overlay.id = 'vendor-panel-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:900;display:flex;justify-content:flex-end;';
    overlay.innerHTML = [
      '<div style="width:380px;max-width:92vw;background:var(--surface);height:100%;padding:22px;overflow-y:auto;box-shadow:-6px 0 24px rgba(0,0,0,0.15);">',
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">',
          '<div class="card-title">' + (isNew ? 'Create Vendor' : 'Edit Vendor') + '</div>',
          '<button id="vendor-panel-close" style="border:none;background:none;font-size:20px;cursor:pointer;color:var(--muted);line-height:1;">✕</button>',
        '</div>',
        '<label style="display:block;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:5px;">Vendor Name</label>',
        '<input type="text" id="vendor-name-input" value="' + escapeAttr(state.editing.name || '') + '" style="width:100%;height:38px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font-size:13px;background:var(--surface-2);color:var(--ink);margin-bottom:14px;" />',
        '<label style="display:block;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:5px;">Notes</label>',
        '<textarea id="vendor-notes-input" rows="4" style="width:100%;border:1px solid var(--line);border-radius:7px;padding:8px 10px;font-size:13px;background:var(--surface-2);color:var(--ink);resize:vertical;margin-bottom:14px;">' + escapeHtml(state.editing.notes || '') + '</textarea>',
        '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-bottom:20px;">',
          '<input type="checkbox" id="vendor-active-input"' + (state.editing.active === 0 ? '' : ' checked') + ' style="width:16px;height:16px;" /> Active',
        '</label>',
        '<div id="vendor-panel-error" style="color:var(--red,#c0392b);font-size:12px;min-height:16px;margin-bottom:8px;"></div>',
        '<button class="btn btn-primary" id="vendor-save-btn" style="width:100%;height:38px;">' + (isNew ? 'Create Vendor' : 'Save Changes') + '</button>',
      '</div>',
    ].join('');

    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closePanel(); });
    TGE.on('vendor-panel-close', 'click', closePanel);
    TGE.on('vendor-save-btn', 'click', saveVendor);
  }

  function closePanel() {
    var overlay = TGE.el('vendor-panel-overlay');
    if (overlay) overlay.remove();
    state.editing = null;
  }

  async function saveVendor() {
    var name   = (TGE.el('vendor-name-input')  || {}).value || '';
    var notes  = (TGE.el('vendor-notes-input') || {}).value || '';
    var active = TGE.el('vendor-active-input') ? TGE.el('vendor-active-input').checked : true;
    var errEl  = TGE.el('vendor-panel-error');

    if (!name.trim()) { errEl.textContent = 'Vendor name is required.'; return; }

    var payload = { name: name.trim(), notes: notes.trim(), active: active };
    if (state.editing && state.editing.id) payload.id = state.editing.id;

    var res = await TGE.api('POST', '/api/admin/vendors', payload);
    if (!res.ok) { errEl.textContent = (res.data && res.data.error) || 'Save failed.'; return; }

    closePanel();
    state.openVendor = null;
    TGE.hide('vendor-detail-wrap');
    TGE.show('vendor-grid-wrap');
    loadVendors();
  }

  // ── Detail view: six-tab shell ────────────────────────────────────────────
  function openDetail(vendor) {
    state.openVendor = vendor;
    var wrap = TGE.el('vendor-detail-wrap');
    if (!wrap) return;

    var tabs = VENDOR_TABS.map(function (t, i) {
      return '<button class="hero-mode-btn' + (i === 0 ? ' active' : '') + '" data-vtab="' + t.key + '" type="button">' + t.label + '</button>';
    }).join('');

wrap.innerHTML = [
      '<div class="hero">',
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">',
          '<div>',
            '<div class="hero-kicker">Vendor</div>',
            '<div class="hero-title">' + escapeHtml(vendor.name) + '</div>',
          '</div>',
          '<button class="hero-mode-btn" id="vendor-back-btn" type="button">← All Vendors</button>',
        '</div>',
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:14px;">' + tabs + '</div>',
      '</div>',
      '<div class="card"><div id="vendor-tab-content"></div></div>',
    ].join('');

    TGE.hide('vendor-grid-wrap');
    TGE.show('vendor-detail-wrap');

    TGE.on('vendor-back-btn', 'click', function () {
      state.openVendor = null;
      TGE.hide('vendor-detail-wrap');
      TGE.show('vendor-grid-wrap');
    });

    wrap.querySelectorAll('[data-vtab]').forEach(function (btn) {
      btn.onclick = function () {
        wrap.querySelectorAll('[data-vtab]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderTab(btn.dataset.vtab);
      };
    });

    renderTab('overview');
  }

  function renderTab(key) {
    var el = TGE.el('vendor-tab-content');
    if (!el || !state.openVendor) return;
    var v = state.openVendor;

    if (key === 'overview') {
      var canManage = TGE.can('vendor', 'manage');
      el.innerHTML = [
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:14px;">',
          infoCard('Status', v.active ? 'Active' : 'Inactive'),
          infoCard('Created', TGE.formatDate(v.created_at)),
          infoCard('Last Updated', TGE.formatDate(v.updated_at)),
        '</div>',
        '<div class="card" style="background:var(--surface-2);"><div class="card-kicker">Notes</div><p style="font-size:13px;margin:6px 0 0;">' + (escapeHtml(v.notes || '') || '<span style="color:var(--muted);">No notes.</span>') + '</p></div>',
        canManage ? '<button class="btn" id="vendor-edit-btn" type="button" style="margin-top:14px;">Edit Vendor</button>' : '',
      ].join('');
      TGE.on('vendor-edit-btn', 'click', function () { openPanel(v); });
      return;
    }

if (key === 'api-registry') {

  el.innerHTML = '<div id="vendor-api-registry"></div>';

  TGE.Platform.ApiRegistry.render({
    container: TGE.el('vendor-api-registry'),
    endpoint: '/api/vendors/' + v.id + '/apis',
    vendorId: v.id,
    mode: 'vendor',
    showHero: false
  });

  return;
}

var tab = VENDOR_TABS.find(function (t) { return t.key === key; });
el.innerHTML = '<div class="card" style="text-align:center;color:var(--muted);padding:36px 20px;background:var(--surface-2);">' +
  '<div style="font-size:14px;font-weight:600;margin-bottom:6px;">' + escapeHtml(tab ? tab.label : key) + '</div>' +
  '<p style="font-size:12px;margin:0;">Part of the standard vendor template — this section is being built next.</p></div>';
  }

  function infoCard(label, value) {
    return '<div class="card" style="background:var(--surface-2);"><div class="card-kicker">' + escapeHtml(label) + '</div><div style="font-size:14px;font-weight:600;margin-top:4px;">' + escapeHtml(String(value)) + '</div></div>';
  }

  // ── Utils ─────────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }
  function escapeAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // ── Register ──────────────────────────────────────────────────────────────
  TGE.onShow['vendor'] = function () {
    var alreadyBuilt = !!TGE.el('vendor-grid-wrap');
    if (!alreadyBuilt) { render(); return; }
    loadVendors(); // refresh data, keep navigation persistence
  };

})();
