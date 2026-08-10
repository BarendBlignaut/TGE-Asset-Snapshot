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
    { key: 'flows',          label: 'Flows' },
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

 if (key === 'hardware-types') {
    el.innerHTML = '<div id="vendor-hardware-types"></div>';

    TGE.Platform.HardwareTypes.render({
      container: TGE.el('vendor-hardware-types'),
      vendorId: v.id
    });

    return;
  }
async function renderFileSpecFork(el, v) {
    if (v.name === 'TGE Workshop') {
      renderWorkshopFileSpec(el, v);
      return;
    }

    el.innerHTML = '<div class="card"><p style="font-size:13px;color:var(--muted);">Loading…</p></div>';

    var result = await TGE.api('GET', '/api/vendors/' + v.id + '/filespec-config');
    var config = (result.ok && result.data) ? result.data.config : null;

    if (!config) {
      renderFileSpecChoiceScreen(el, v);
      return;
    }

    if (config.spec_type === 'master_list') {
      el.innerHTML = '<div id="vendor-file-spec"></div>';
      TGE.Platform.FileSpec.render({
        container: TGE.el('vendor-file-spec'),
        vendorId: v.id
      });
      return;
    }

    el.innerHTML =
      '<div class="card">' +
        '<div class="card-kicker">Vendor Platform</div>' +
        '<div class="card-title">File Spec — ' + escapeHtml(v.name) + '</div>' +
        '<p style="font-size:13px;color:var(--muted);margin-top:4px;">This vendor is configured as a Data Feed: ' +
          escapeHtml(config.orientation || '') + ', ' + escapeHtml(config.table_count || '') + ' table(s). ' +
          'The Data Feed reading engine hasn\'t been built yet.' +
        '</p>' +
      '</div>';
  }

  // ── Workshop File Spec ──────────────────────────────────────────────────────
  // Not a master list, not a data feed — a real, live booking table for one
  // day at a time, with the Status column carrying the same dropdown-and-
  // checkbox control already used across every other File Spec screen for
  // excluding values. Toggling a status here dims its rows live, as a
  // preview, exactly like exclusions do — nothing is written until Save.

  var wk = { date: null, availableDates: [], bookings: [], statuses: [], dirty: false, openDropdown: false };

  function renderWorkshopFileSpec(el, v) {
    el.innerHTML =
      '<div class="card">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">' +
          '<div>' +
            '<div class="card-kicker">Vendor Platform</div>' +
            '<div class="card-title">File Spec — Workshop</div>' +
            '<p style="font-size:13px;color:var(--muted);margin-top:4px;max-width:640px;">Deciding which workshop statuses earn a spanner on the Fleet Utilisation dashboard. Untick a status in the dropdown to stop it counting — Save applies it everywhere, immediately, no re-import needed.</p>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<select id="wk-date-select" style="height:32px;border:1px solid var(--line);border-radius:6px;padding:0 8px;font-size:12px;"></select>' +
            '<span id="wk-save-msg" style="font-size:12px;color:var(--muted);"></span>' +
            '<button class="btn btn-primary" id="wk-save-btn" type="button">Save</button>' +
          '</div>' +
        '</div>' +
        '<div id="wk-table-wrap" style="margin-top:14px;max-height:60vh;overflow:auto;border:1px solid var(--line);border-radius:8px;">' +
          '<div style="padding:30px;text-align:center;color:var(--muted);">Loading…</div>' +
        '</div>' +
      '</div>';

    document.addEventListener('click', function () { if (wk.openDropdown) closeWorkshopDropdown(); });

    loadWorkshopData();
  }

  async function loadWorkshopData() {
    var statusRes = await TGE.api('GET', '/api/workshop/statuses');
    wk.statuses = (statusRes.ok && statusRes.data && statusRes.data.statuses) || [];

    var bookingRes = await TGE.api('GET', '/api/workshop/bookings');
    if (!bookingRes.ok) {
      renderWorkshopMessage((bookingRes.data && bookingRes.data.error) || 'Failed to load bookings.');
      return;
    }

    wk.date = bookingRes.data.date;
    wk.availableDates = bookingRes.data.availableDates || [];
    wk.bookings = bookingRes.data.bookings || [];

    renderWorkshopDateSelect();
    buildWorkshopTable();
    wireWorkshopSave();
  }

  function renderWorkshopMessage(text) {
    var wrap = TGE.el('wk-table-wrap');
    if (wrap) wrap.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted);">' + escapeHtml(text) + '</div>';
  }

  function renderWorkshopDateSelect() {
    var sel = TGE.el('wk-date-select');
    if (!sel) return;

    if (!wk.availableDates.length) {
      sel.innerHTML = '<option>No bookings yet</option>';
      sel.disabled = true;
      return;
    }

    sel.innerHTML = wk.availableDates.map(function (d) {
      return '<option value="' + escapeAttr(d) + '"' + (d === wk.date ? ' selected' : '') + '>' + escapeHtml(d) + '</option>';
    }).join('');

    sel.onchange = async function () {
      var res = await TGE.api('GET', '/api/workshop/bookings?date=' + encodeURIComponent(sel.value));
      if (!res.ok) return;
      wk.date = res.data.date;
      wk.bookings = res.data.bookings || [];
      buildWorkshopTable();
    };
  }

  function statusDisplayMap() {
    var m = {};
    wk.statuses.forEach(function (s) { m[s.status] = !!s.display; });
    return m;
  }

  function buildWorkshopTable() {
    var wrap = TGE.el('wk-table-wrap');
    if (!wrap) return;

    if (!wk.bookings.length) {
      wrap.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted);">No bookings for this day.</div>';
      return;
    }

    var displayMap = statusDisplayMap();
    var hasActiveToggleOff = wk.statuses.some(function (s) { return !s.display; });

    var rows = wk.bookings.map(function (b) {
      var shown = displayMap[b.status] !== false;
      var rowStyle = shown ? '' : ' style="opacity:0.4;text-decoration:line-through;"';
      return '<tr' + rowStyle + '>' +
        '<td style="padding:7px 10px;border-bottom:1px solid var(--line-2);font-size:12px;">' + escapeHtml(b.legacy_number) + '</td>' +
        '<td style="padding:7px 10px;border-bottom:1px solid var(--line-2);font-size:12px;">' + escapeHtml(b.task) + '</td>' +
        '<td style="padding:7px 10px;border-bottom:1px solid var(--line-2);font-size:12px;">' + escapeHtml(b.status) + '</td>' +
      '</tr>';
    }).join('');

    wrap.innerHTML =
      '<table style="border-collapse:collapse;width:100%;">' +
        '<thead><tr>' +
          '<th style="position:sticky;top:0;z-index:20;background:var(--surface-2);border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;">Legacy Number</th>' +
          '<th style="position:sticky;top:0;z-index:20;background:var(--surface-2);border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;">Task</th>' +
          '<th style="position:sticky;top:0;z-index:20;background:var(--surface-2);border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;overflow:visible;">' +
            '<span class="fs-th-wrap" style="position:relative;display:inline-flex;align-items:center;gap:4px;">' +
              '<span>Status</span>' +
              '<button type="button" id="wk-status-arrow" class="' + (hasActiveToggleOff ? 'fs-arrow-on' : 'fs-arrow-off') + '" style="border:none;cursor:pointer;padding:2px 5px;border-radius:5px;font-size:11px;line-height:1;font-weight:700;">▾</button>' +
              '<span class="fs-dd-slot" id="wk-dd-slot"></span>' +
            '</span>' +
          '</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>';

    var arrow = TGE.el('wk-status-arrow');
    if (arrow) {
      arrow.onclick = function (e) {
        e.stopPropagation();
        if (wk.openDropdown) { closeWorkshopDropdown(); return; }
        openWorkshopDropdown();
      };
    }
  }

  function openWorkshopDropdown() {
    wk.openDropdown = true;
    renderWorkshopDropdown();
  }

  function closeWorkshopDropdown() {
    wk.openDropdown = false;
    var slot = TGE.el('wk-dd-slot');
    if (slot) slot.innerHTML = '';
  }

  function renderWorkshopDropdown() {
    var slot = TGE.el('wk-dd-slot');
    if (!slot) return;

    var sorted = wk.statuses.slice().sort(function (a, b) { return String(a.status).localeCompare(String(b.status)); });

    var rows = sorted.map(function (s) {
      return '<label style="display:flex;align-items:center;gap:8px;padding:5px 8px;font-size:12px;color:var(--ink-2);cursor:pointer;">' +
        '<input type="checkbox" data-wk-status-id="' + s.id + '"' + (s.display ? ' checked' : '') + ' />' +
        '<span style="flex:1;">' + escapeHtml(s.status) + '</span>' +
      '</label>';
    }).join('');

    slot.innerHTML =
      '<div style="position:absolute;top:100%;right:0;margin-top:4px;width:260px;max-height:380px;overflow:auto;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 18px 42px rgba(10,45,20,0.22);padding:8px;text-transform:none;z-index:9999;">' +
        '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;padding:4px 8px;">Untick to stop counting</div>' +
        '<div>' + rows + '</div>' +
      '</div>';

    slot.onclick = function (e) { e.stopPropagation(); };

    slot.querySelectorAll('[data-wk-status-id]').forEach(function (input) {
      input.onchange = function () {
        var id = input.dataset.wkStatusId;
        var entry = wk.statuses.find(function (s) { return String(s.id) === String(id); });
        if (entry) entry.display = input.checked ? 1 : 0;
        wk.dirty = true;
        var msg = TGE.el('wk-save-msg');
        if (msg) { msg.textContent = 'Unsaved changes'; msg.style.color = 'var(--muted)'; }
        buildWorkshopTable();
        openWorkshopDropdown();
      };
    });
  }

  function wireWorkshopSave() {
    var btn = TGE.el('wk-save-btn');
    if (!btn) return;
    btn.onclick = async function () {
      var msg = TGE.el('wk-save-msg');
      btn.disabled = true; btn.textContent = 'Saving…';

      var payload = wk.statuses.map(function (s) { return { id: s.id, display: s.display ? 1 : 0 }; });
      var res = await TGE.api('PUT', '/api/workshop/statuses', { statuses: payload });

      btn.disabled = false; btn.textContent = 'Save';

      if (!res.ok) {
        if (msg) { msg.textContent = (res.data && res.data.error) || 'Save failed.'; msg.style.color = 'var(--danger)'; }
        return;
      }
      wk.dirty = false;
      if (msg) { msg.textContent = 'Saved'; msg.style.color = 'var(--muted)'; }
    };
  }

  function renderFileSpecChoiceScreen(el, v) {
    el.innerHTML =
      '<div class="card">' +
        '<div class="card-kicker">Vendor Platform</div>' +
        '<div class="card-title">File Spec — ' + escapeHtml(v.name) + '</div>' +
        '<p style="font-size:13px;color:var(--muted);margin:4px 0 14px;">Choose how this vendor supplies data. This is set once and remembered.</p>' +
        '<div style="display:flex;gap:10px;">' +
          '<button type="button" class="btn" id="fs-choose-master">Master List</button>' +
          '<button type="button" class="btn" id="fs-choose-feed">Data Feed</button>' +
        '</div>' +
        '<div id="fs-choice-detail" style="margin-top:14px;"></div>' +
      '</div>';

    TGE.el('fs-choose-master').onclick = function () {
      saveFileSpecConfig(v, { specType: 'master_list' });
    };

    TGE.el('fs-choose-feed').onclick = function () {
      var detail = TGE.el('fs-choice-detail');
      detail.innerHTML =
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
          '<div>' +
            '<div class="card-kicker">Orientation</div>' +
            '<div style="display:flex;gap:8px;margin-top:4px;">' +
              '<button type="button" class="btn" id="fs-orient-h">Horizontal</button>' +
              '<button type="button" class="btn" id="fs-orient-v">Vertical</button>' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<div class="card-kicker">Table Count</div>' +
            '<div style="display:flex;gap:8px;margin-top:4px;">' +
              '<button type="button" class="btn" id="fs-count-single">Single Table</button>' +
              '<button type="button" class="btn" id="fs-count-multiple">Multiple Tables</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      var chosen = { orientation: null, tableCount: null };

      function trySave() {
        if (chosen.orientation && chosen.tableCount) {
          saveFileSpecConfig(v, { specType: 'data_feed', orientation: chosen.orientation, tableCount: chosen.tableCount });
        }
      }

      TGE.el('fs-orient-h').onclick = function () { chosen.orientation = 'horizontal'; trySave(); };
      TGE.el('fs-orient-v').onclick = function () { chosen.orientation = 'vertical'; trySave(); };
      TGE.el('fs-count-single').onclick = function () { chosen.tableCount = 'single'; trySave(); };
      TGE.el('fs-count-multiple').onclick = function () { chosen.tableCount = 'multiple'; trySave(); };
    };
  }

  async function saveFileSpecConfig(v, payload) {
    await TGE.api('POST', '/api/vendors/' + v.id + '/filespec-config', payload);
    var container = document.querySelector('#vendor-file-spec-fork');
    if (container) renderFileSpecFork(container, v);
  }
  
 if (key === 'control-tables') {
    el.innerHTML = '<div id="vendor-control-tables"></div>';

    TGE.Platform.ControlTables.render({
      container: TGE.el('vendor-control-tables'),
      vendorId: v.id
    });

    return;
  }

if (key === 'file-spec') {
    el.innerHTML = '<div id="vendor-file-spec-fork"></div>';
    renderFileSpecFork(TGE.el('vendor-file-spec-fork'), v);

    return;
  }

  if (key === 'flows') {
    el.innerHTML = '<div id="vendor-flows"></div>';

    TGE.Platform.Flows.render({
      container: TGE.el('vendor-flows'),
      vendorId: v.id
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
