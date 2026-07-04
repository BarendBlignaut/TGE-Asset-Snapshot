// TGE Asset Snapshot — Platform Hardware Types
// public/platform/platform-hardware-types.js

(function () {
  'use strict';

  var state = {
    vendorId: null,
    hardware: []
  };

  function render(options) {
    options = options || {};
    state.vendorId = options.vendorId || null;

    var container = options.container;
    if (!container) return;

    container.innerHTML = [
      '<div class="card">',
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">',
          '<div>',
            '<div class="card-kicker">Vendor Platform</div>',
            '<div class="card-title">Hardware Types</div>',
            '<p style="font-size:13px;color:var(--muted);margin:4px 0 0;">Define hardware types, models, expected components and capabilities for this vendor.</p>',
          '</div>',
          '<div style="display:flex;gap:8px;">',
            '<button class="btn btn-primary" type="button" onclick="TGE.Platform.HardwareTypes.discover()">Discover Hardware</button>',
            '<button class="btn" type="button" onclick="TGE.Platform.HardwareTypes.addManual()">+ Add Manual</button>',
          '</div>',
        '</div>',
      '</div>',

      '<div class="card">',
        '<div class="card-kicker">Saved Hardware</div>',
        '<div id="vendor-hardware-list" style="margin-top:10px;"></div>',
      '</div>'
    ].join('');

    renderList();
  }

  function renderList() {
    var el = document.getElementById('vendor-hardware-list');
    if (!el) return;

    if (!state.hardware.length) {
      el.innerHTML = [
        '<div style="text-align:center;color:var(--muted);padding:32px 16px;background:var(--surface-2);border:1px dashed var(--line);border-radius:10px;">',
          '<div style="font-size:28px;margin-bottom:8px;opacity:0.35;">🧩</div>',
          '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">No hardware types defined yet</div>',
          '<p style="font-size:12px;margin:0;">Use Discover Hardware or Add Manual to build this vendor hardware table.</p>',
        '</div>'
      ].join('');
      return;
    }

    el.innerHTML = state.hardware.map(function (h) {
      return [
        '<div style="display:flex;align-items:center;justify-content:space-between;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:var(--surface);">',
          '<div>',
            '<div style="font-size:13px;font-weight:700;color:var(--ink);">' + escapeHtml(h.hardware_label || h.hardware_key || 'Unnamed Hardware') + '</div>',
            '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' + escapeHtml(h.category || 'Uncategorised') + '</div>',
          '</div>',
          '<span class="badge badge-gray" style="font-size:10px;">' + escapeHtml(h.hardware_key || '') + '</span>',
        '</div>'
      ].join('');
    }).join('');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  TGE.Platform = TGE.Platform || {};

  TGE.Platform.HardwareTypes = {
    render: render,

    discover: function () {
      alert('Hardware discovery will be added next.');
    },

    addManual: function () {
      alert('Manual hardware entry will be added next.');
    }
  };

})();
