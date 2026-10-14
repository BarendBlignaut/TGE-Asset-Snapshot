// TGE Shared Output Pill
// public/export-pill.js

(function () {
  'use strict';

  window.TGE = window.TGE || {};

  function hasPermission(item) {
    if (!item || !item.permission) return true;
    return TGE.can(item.permission[0], item.permission[1]);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  TGE.outputTimestamp = function () {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };

    return d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) + '_' +
      pad(d.getHours()) +
      pad(d.getMinutes());
  };

  TGE.outputFileName = function (opts) {
    TGE.outputModule = function (opts) {
  return {
    module: opts.module,
    reportType: opts.reportType || 'Report',
    exportItems: opts.exportItems || [],
    buildPdf: opts.buildPdf || null,
    buildCsv: opts.buildCsv || null,
    buildExcel: opts.buildExcel || null,
    buildJson: opts.buildJson || null,
    emailComposer: opts.emailComposer || null,
    mergeMail: opts.mergeMail || null
  };
};
    opts = opts || {};

    var module = String(opts.module || 'Snapshot').replace(/\s+/g, '');
    var type = String(opts.type || 'Report').replace(/\s+/g, '');
    var ext = String(opts.extension || 'file').replace(/^\./, '');
    var qualifier = opts.qualifier ? '_' + String(opts.qualifier).replace(/\s+/g, '') : '';

    return module + '_' + type + '_' + TGE.outputTimestamp() + qualifier + '.' + ext;
  };

  // opts.theme: 'dark' (pill on a dark header) or 'light'. The styles for
  // both come from this file. Leave opts out to style it with the screen's
  // own CSS, as the older screens do.
  TGE.buildOutputPill = function (prefix, items, opts) {
    items = (items || []).filter(hasPermission);

    if (!items.length) return '';

    var theme = opts && opts.theme ? ' tge-pill-' + esc(opts.theme) : '';

    return [
      '<div class="snap-hero-menu' + theme + '" id="' + esc(prefix) + '-output-menu">',
        '<button class="snap-menu-trigger" id="' + esc(prefix) + '-output-trigger" type="button" aria-haspopup="true" aria-expanded="false">',
          '<span style="width:16px;height:16px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--yellow);color:var(--green-900);font-size:12px;">↓</span>',
          '<span>Export</span>',
          '<svg class="snap-menu-caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>',
        '</button>',
        '<div class="snap-menu-panel" id="' + esc(prefix) + '-output-panel" role="menu">',
          items.map(function (item) {
            return '<button class="snap-menu-item active" id="' + esc(item.id) + '" type="button">' +
              '<span>' + esc(item.icon || '') + (item.icon ? ' ' : '') + esc(item.label || '') + '</span>' +
              '<span style="color:var(--muted);font-size:10px;">' + esc(item.suffix || '') + '</span>' +
            '</button>';
          }).join(''),
        '</div>',
      '</div>'
    ].join('');
  };

  TGE.wireOutputPill = function (prefix, items) {
    items = (items || []).filter(hasPermission);

    var trigger = TGE.el(prefix + '-output-trigger');
    var menu = TGE.el(prefix + '-output-menu');
    var panel = TGE.el(prefix + '-output-panel');

    if (!trigger || !menu || !panel) return;

    function positionPanel() {
      var rect = trigger.getBoundingClientRect();
      panel.style.top = (rect.bottom + 8) + 'px';
      panel.style.right = (window.innerWidth - rect.right) + 'px';
    }

    trigger.onclick = function (e) {
      e.stopPropagation();
      var open = !menu.classList.contains('open');
      menu.classList.toggle('open', open);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) positionPanel();
    };

    items.forEach(function (item) {
      var btn = TGE.el(item.id);
      if (!btn || typeof item.action !== 'function') return;

      btn.onclick = function (e) {
        e.stopPropagation();
        TGE.closeOutputPill(prefix);
        item.action();
      };
    });
  };

  TGE.closeOutputPill = function (prefix) {
    var menu = TGE.el(prefix + '-output-menu');
    var trigger = TGE.el(prefix + '-output-trigger');

    if (menu) menu.classList.remove('open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  };

  document.addEventListener('click', function () {
    document.querySelectorAll('.snap-hero-menu.open').forEach(function (menu) {
      menu.classList.remove('open');
      var trigger = menu.querySelector('.snap-menu-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  });

})();
