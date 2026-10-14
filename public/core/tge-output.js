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

  // ── Shared file writer ─────────────────────────────────────────────────────
  // Each screen decides WHAT to export (its columns and rows) and passes it
  // as { header: [...], rows: [[...], ...], sheetName }. This decides HOW
  // the file is written: csv, xlsx or json.
  // saveTable is self-contained (no TGE helpers), so an offline report can
  // carry its own copy via TGE.saveTable.toString().
  function saveTable(table, format, fileBase) {
    var all = [table.header].concat(table.rows);
    var blob;
    var ext = format;
    if (format === 'xlsx' && window.XLSX) {
      var sheet = XLSX.utils.aoa_to_sheet(all);
      var book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, String(table.sheetName || 'Export').slice(0, 31));
      blob = new Blob([XLSX.write(book, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    } else if (format === 'json') {
      var list = table.rows.map(function (r) {
        var o = {};
        table.header.forEach(function (h, i) { o[h] = r[i] == null ? '' : r[i]; });
        return o;
      });
      blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
    } else {
      if (format === 'xlsx') alert('Excel is not available right now (it needs an internet connection), so this will save as CSV instead.');
      ext = 'csv';
      var lines = all.map(function (r) {
        return r.map(function (v) {
          var s = v == null ? '' : String(v);
          // Stop Excel treating text such as "=..." as a formula.
          if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
          return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',');
      });
      blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    }
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = fileBase + '.' + ext;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  TGE.saveTable = saveTable;

  // Same as saveTable, with the standard file name.
  // opts: { module, type, qualifier }, e.g. { module: 'Utilisation', type: 'Dashboard' }
  TGE.exportTable = function (table, format, opts) {
    opts = opts || {};
    var name = TGE.outputFileName({ module: opts.module, type: opts.type, qualifier: opts.qualifier, extension: 'x' });
    saveTable(table, format, name.replace(/\.x$/, ''));
  };

  // ── Shared pill styles (pills built with opts.theme) ──────────────────────
  (function injectOutputPillStyles() {
    if (document.getElementById('tge-output-style')) return;
    var style = document.createElement('style');
    style.id = 'tge-output-style';
    style.textContent = [
      '.snap-hero-menu.tge-pill-dark,.snap-hero-menu.tge-pill-light{position:relative;display:inline-flex;align-items:center;}',
      '.snap-hero-menu.tge-pill-dark .snap-menu-trigger,.snap-hero-menu.tge-pill-light .snap-menu-trigger{height:30px;display:inline-flex;align-items:center;gap:6px;padding:0 11px;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;transition:background 140ms,border-color 140ms,color 140ms;}',
      '.snap-hero-menu.tge-pill-dark .snap-menu-trigger{border:1px solid rgba(255,255,255,0.20);background:rgba(255,255,255,0.10);color:rgba(255,255,255,0.85);}',
      '.snap-hero-menu.tge-pill-dark .snap-menu-trigger:hover,.snap-hero-menu.tge-pill-dark.open .snap-menu-trigger{background:rgba(255,255,255,0.18);border-color:rgba(255,255,255,0.34);color:#fff;}',
      '.snap-hero-menu.tge-pill-light .snap-menu-trigger{border:1px solid var(--line);background:var(--surface-2);color:var(--ink-2);}',
      '.snap-hero-menu.tge-pill-light .snap-menu-trigger:hover,.snap-hero-menu.tge-pill-light.open .snap-menu-trigger{background:var(--surface-3);border-color:var(--green-600);color:var(--green-800);}',
      '.snap-hero-menu.tge-pill-dark .snap-menu-caret,.snap-hero-menu.tge-pill-light .snap-menu-caret{width:10px;height:10px;opacity:0.75;transition:transform 140ms;}',
      '.snap-hero-menu.tge-pill-dark.open .snap-menu-caret,.snap-hero-menu.tge-pill-light.open .snap-menu-caret{transform:rotate(180deg);}',
      '.snap-hero-menu.tge-pill-dark .snap-menu-panel,.snap-hero-menu.tge-pill-light .snap-menu-panel{position:fixed;min-width:190px;padding:6px;border-radius:12px;background:#fff;border:1px solid rgba(15,26,19,0.10);box-shadow:0 18px 42px rgba(10,45,20,0.22);display:none;z-index:500;}',
      '.snap-hero-menu.tge-pill-dark.open .snap-menu-panel,.snap-hero-menu.tge-pill-light.open .snap-menu-panel{display:block;}',
      '.snap-hero-menu.tge-pill-dark .snap-menu-item,.snap-hero-menu.tge-pill-light .snap-menu-item{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px;border:none;border-radius:9px;background:transparent;color:var(--ink-2);font-size:12px;font-weight:600;text-align:left;cursor:pointer;opacity:1;pointer-events:auto;}',
      '.snap-hero-menu.tge-pill-dark .snap-menu-item:hover,.snap-hero-menu.tge-pill-light .snap-menu-item:hover{background:var(--green-50);color:var(--green-800);}'
    ].join('');
    document.head.appendChild(style);
  })();

  document.addEventListener('click', function () {
    document.querySelectorAll('.snap-hero-menu.open').forEach(function (menu) {
      menu.classList.remove('open');
      var trigger = menu.querySelector('.snap-menu-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  });

})();
