// ============================================================================
// TGE Diagnostics Platform
// public/tge-diagnostics.js
// ============================================================================

(function () {
  'use strict';

  window.TGE = window.TGE || {};

  var logs = [];
  var isOpen = false;
  var isInitialised = false;
  var maxLogs = 300;
  var selectedLogId = null;

  var position = {
    left: 120,
    top: 90,
    width: 760,
    height: 420
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function nowTime() {
    return new Date().toLocaleTimeString('en-AU', { hour12: false });
  }

  function safeText(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function addStyles() {
    if (document.getElementById('tge-diagnostics-styles')) return;

    var style = document.createElement('style');
    style.id = 'tge-diagnostics-styles';
    style.textContent = [
      '.tge-diag-btn{height:32px;padding:0 12px;border-radius:7px;border:1px solid var(--line);background:var(--surface-2);color:var(--muted);font:inherit;font-size:12px;font-weight:600;cursor:pointer;margin-right:8px;}',
      '.tge-diag-btn.active{background:var(--green-700);color:var(--yellow);border-color:var(--green-600);}',
      '.tge-diag-window{display:none;position:fixed;z-index:9999;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:12px;box-shadow:0 18px 55px rgba(0,0,0,.28);overflow:hidden;min-width:520px;min-height:260px;}',
      '.tge-diag-window.open{display:flex;flex-direction:column;}',
      '.tge-diag-header{height:42px;background:var(--green-900);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 12px;cursor:move;user-select:none;flex-shrink:0;}',
      '.tge-diag-title{font-size:13px;font-weight:700;color:var(--yellow);}',
      '.tge-diag-actions{display:flex;align-items:center;gap:6px;}',
      '.tge-diag-action{height:26px;padding:0 9px;border-radius:6px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:#fff;font:inherit;font-size:11px;cursor:pointer;}',
      '.tge-diag-action:hover{background:rgba(255,255,255,.16);}',
      '.tge-diag-body{display:flex;flex-direction:column;min-height:0;flex:1;background:var(--surface);}',
      '.tge-diag-toolbar{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--line);background:var(--surface-2);flex-shrink:0;}',
      '.tge-diag-pill{font-size:11px;font-weight:700;color:var(--muted);background:var(--surface);border:1px solid var(--line);padding:4px 8px;border-radius:999px;}',
      '.tge-diag-spacer{flex:1;}',
      '.tge-diag-split{display:grid;grid-template-columns:45% 55%;flex:1;min-height:0;}',
      '.tge-diag-list{overflow:auto;border-right:1px solid var(--line);min-height:0;}',
      '.tge-diag-detail{overflow:auto;min-height:0;background:var(--surface-3);padding:10px;}',
      '.tge-diag-table-wrap{overflow:auto;flex:1;min-height:0;}',
      '.tge-diag-row{cursor:pointer;}',
      '.tge-diag-row.active td{background:var(--green-50);}',
      '.tge-diag-raw-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 6px;}',
      '.tge-diag-raw{font-family:monospace;font-size:10px;white-space:pre-wrap;word-break:break-word;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:8px;margin:0 0 10px;max-height:220px;overflow:auto;}',
      '.tge-diag-table{width:100%;border-collapse:collapse;font-size:11px;}',
      '.tge-diag-table th{position:sticky;top:0;background:var(--surface-2);z-index:1;text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.05em;}',
      '.tge-diag-table td{padding:7px 8px;border-bottom:1px solid var(--line-2);vertical-align:top;}',
      '.tge-diag-table tr:hover td{background:var(--surface-2);}',
      '.tge-diag-mono{font-family:monospace;font-size:10px;}',
      '.tge-diag-muted{color:var(--muted);}',
      '.tge-diag-error{color:var(--danger);font-weight:700;}',
      '.tge-diag-warn{color:var(--warning);font-weight:700;}',
      '.tge-diag-success{color:var(--green-600);font-weight:700;}',
      '.tge-diag-info{color:var(--muted);font-weight:700;}',
      '.tge-diag-empty{padding:36px 20px;text-align:center;color:var(--muted);font-size:13px;}',
      '.tge-diag-resize{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;}',
      '.tge-diag-resize:after{content:"";position:absolute;right:5px;bottom:5px;width:8px;height:8px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);opacity:.7;}'
    ].join('');

    document.head.appendChild(style);
  }

  function levelClass(level) {
    level = String(level || '').toLowerCase();
    if (level === 'error') return 'tge-diag-error';
    if (level === 'warn' || level === 'warning') return 'tge-diag-warn';
    if (level === 'success') return 'tge-diag-success';
    return 'tge-diag-info';
  }

  function createButton() {
    if (document.getElementById('tge-diagnostics-btn')) return;

    var topbarRight = document.querySelector('.topbar-right');
    if (!topbarRight) return;

    var btn = document.createElement('button');
    btn.id = 'tge-diagnostics-btn';
    btn.className = 'tge-diag-btn';
    btn.type = 'button';
    btn.textContent = 'Diagnostics';
    btn.onclick = function () {
      TGE.diagnostics.toggle();
    };

    topbarRight.insertBefore(btn, topbarRight.firstChild);
  }

  function createWindow() {
    if (document.getElementById('tge-diagnostics-window')) return;

    var win = document.createElement('div');
    win.id = 'tge-diagnostics-window';
    win.className = 'tge-diag-window';
    win.style.left = position.left + 'px';
    win.style.top = position.top + 'px';
    win.style.width = position.width + 'px';
    win.style.height = position.height + 'px';

    win.innerHTML = [
      '<div class="tge-diag-header" id="tge-diagnostics-drag">',
        '<div class="tge-diag-title">Diagnostics</div>',
        '<div class="tge-diag-actions">',
          '<button class="tge-diag-action" id="tge-diagnostics-copy" type="button">Copy</button>',
          '<button class="tge-diag-action" id="tge-diagnostics-export" type="button">Export</button>',
          '<button class="tge-diag-action" id="tge-diagnostics-clear" type="button">Clear</button>',
          '<button class="tge-diag-action" id="tge-diagnostics-close" type="button">Close</button>',
        '</div>',
      '</div>',
      '<div class="tge-diag-body">',
        '<div class="tge-diag-toolbar">',
          '<span class="tge-diag-pill" id="tge-diagnostics-count">0 logs</span>',
          '<span class="tge-diag-pill">Runtime API Inspector</span>',
          '<span class="tge-diag-spacer"></span>',
          '<span class="tge-diag-muted" style="font-size:11px;">Floating mode</span>',
        '</div>',
        '<div class="tge-diag-split">',
  '<div class="tge-diag-list" id="tge-diagnostics-content"></div>',
  '<div class="tge-diag-detail" id="tge-diagnostics-detail">',
    '<div class="tge-diag-empty">Select a log row to view request and response data.</div>',
  '</div>',
'</div>',
      '</div>',
      '<div class="tge-diag-resize" id="tge-diagnostics-resize"></div>'
    ].join('');

    document.body.appendChild(win);

    TGE.el('tge-diagnostics-close').onclick = TGE.diagnostics.hide;
    TGE.el('tge-diagnostics-clear').onclick = TGE.diagnostics.clearLogs;
    TGE.el('tge-diagnostics-copy').onclick = TGE.diagnostics.copy;
    TGE.el('tge-diagnostics-export').onclick = TGE.diagnostics.exportJson;

    enableDrag(win, TGE.el('tge-diagnostics-drag'));
    enableResize(win, TGE.el('tge-diagnostics-resize'));

    render();
  }

  function enableDrag(win, handle) {
    if (!win || !handle) return;

    var dragging = false;
    var startX = 0;
    var startY = 0;
    var startLeft = 0;
    var startTop = 0;

    handle.addEventListener('mousedown', function (e) {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = parseInt(win.style.left, 10) || 0;
      startTop = parseInt(win.style.top, 10) || 0;
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;

      var nextLeft = startLeft + (e.clientX - startX);
      var nextTop = startTop + (e.clientY - startY);

      nextLeft = Math.max(0, Math.min(window.innerWidth - 120, nextLeft));
      nextTop = Math.max(0, Math.min(window.innerHeight - 80, nextTop));

      win.style.left = nextLeft + 'px';
      win.style.top = nextTop + 'px';
    });

    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = '';
    });
  }

  function enableResize(win, handle) {
    if (!win || !handle) return;

    var resizing = false;
    var startX = 0;
    var startY = 0;
    var startW = 0;
    var startH = 0;

    handle.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      resizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = win.offsetWidth;
      startH = win.offsetHeight;
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', function (e) {
      if (!resizing) return;

      var nextW = Math.max(520, startW + (e.clientX - startX));
      var nextH = Math.max(260, startH + (e.clientY - startY));

      nextW = Math.min(window.innerWidth - 40, nextW);
      nextH = Math.min(window.innerHeight - 40, nextH);

      win.style.width = nextW + 'px';
      win.style.height = nextH + 'px';
    });

    document.addEventListener('mouseup', function () {
      if (!resizing) return;
      resizing = false;
      document.body.style.userSelect = '';
    });
  }

function render() {
  var content = TGE.el('tge-diagnostics-content');
  var detail = TGE.el('tge-diagnostics-detail');
  var count = TGE.el('tge-diagnostics-count');

  if (count) {
    count.textContent = logs.length + ' log' + (logs.length === 1 ? '' : 's');
  }

  if (!content) return;

  if (!logs.length) {
    content.innerHTML = '<div class="tge-diag-empty">No diagnostics captured yet.</div>';
    if (detail) detail.innerHTML = '<div class="tge-diag-empty">Select a log row to view request and response data.</div>';
    return;
  }

  content.innerHTML = [
    '<table class="tge-diag-table">',
      '<thead>',
        '<tr>',
          '<th>Time</th>',
          '<th>Level</th>',
          '<th>Method / Endpoint</th>',
          '<th>Status</th>',
          '<th>Duration</th>',
        '</tr>',
      '</thead>',
      '<tbody>',
        logs.slice().reverse().map(function (log) {
          var active = selectedLogId === log.id ? ' active' : '';
          return [
            '<tr class="tge-diag-row' + active + '" data-log-id="' + log.id + '">',
              '<td class="tge-diag-mono tge-diag-muted">' + safeText(log.time) + '</td>',
              '<td class="' + levelClass(log.level) + '">' + safeText(log.level) + '</td>',
              '<td>' + safeText(log.action) + '</td>',
              '<td class="tge-diag-mono">' + safeText(log.status || '') + '</td>',
              '<td class="tge-diag-mono">' + safeText(log.duration != null ? log.duration + 'ms' : '') + '</td>',
            '</tr>'
          ].join('');
        }).join(''),
      '</tbody>',
    '</table>'
  ].join('');

  Array.prototype.forEach.call(content.querySelectorAll('.tge-diag-row'), function (row) {
    row.onclick = function () {
      selectedLogId = parseInt(row.getAttribute('data-log-id'), 10);
      render();
    };
  });

  renderDetail();
}

function renderDetail() {
  var detail = TGE.el('tge-diagnostics-detail');
  if (!detail) return;

  if (!selectedLogId) {
    detail.innerHTML = '<div class="tge-diag-empty">Select a log row to view request and response data.</div>';
    return;
  }

  var log = logs.find(function (item) {
    return item.id === selectedLogId;
  });

  if (!log) {
    detail.innerHTML = '<div class="tge-diag-empty">Selected log no longer exists.</div>';
    return;
  }

  detail.innerHTML = [
    '<div class="tge-diag-raw-title">Summary</div>',
    '<pre class="tge-diag-raw">' + safeText(JSON.stringify({
      id: log.id,
      timestamp: log.timestamp,
      category: log.category,
      level: log.level,
      module: log.module,
      action: log.action,
      status: log.status,
      duration: log.duration,
      message: log.message,
      error: log.error
    }, null, 2)) + '</pre>',

    '<div class="tge-diag-raw-title">Request Sent</div>',
    '<pre class="tge-diag-raw">' + safeText(JSON.stringify(log.request || {}, null, 2)) + '</pre>',

    '<div class="tge-diag-raw-title">Response Received</div>',
    '<pre class="tge-diag-raw">' + safeText(JSON.stringify(log.response || {}, null, 2)) + '</pre>'
  ].join('');
}

  function downloadText(filename, text, mimeType) {
    var blob = new Blob([text], { type: mimeType || 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  }

  TGE.diagnostics = {

    version: '1.0.1',

    init: function () {
      if (isInitialised) return;

      if (typeof TGE.can === 'function' && !TGE.can('diagnostics', 'view')) {
        return;
      }

      addStyles();
      createButton();
      createWindow();

      isInitialised = true;
    },

    log: function (data) {
      data = data || {};

      logs.push({
        id: logs.length + 1,
        timestamp: nowIso(),
        time: nowTime(),
        category: data.category || 'General',
        level: data.level || 'Info',
        module: data.module || '',
        action: data.action || '',
        request: data.request || null,
        response: data.response || null,
        duration: data.duration || null,
        status: data.status || null,
        message: data.message || '',
        error: data.error || null
      });

      if (logs.length > maxLogs) logs.shift();
      if (isOpen) render();
    },

    getLogs: function () {
      return logs.slice();
    },

    clearLogs: function () {
      logs = [];
      render();
    },

    show: function () {
      if (!isInitialised) this.init();

      var win = TGE.el('tge-diagnostics-window');
      var btn = TGE.el('tge-diagnostics-btn');

      if (win) win.classList.add('open');
      if (btn) btn.classList.add('active');

      isOpen = true;
      render();
    },

    hide: function () {
      var win = TGE.el('tge-diagnostics-window');
      var btn = TGE.el('tge-diagnostics-btn');

      if (win) win.classList.remove('open');
      if (btn) btn.classList.remove('active');

      isOpen = false;
    },

    toggle: function () {
      if (isOpen) this.hide();
      else this.show();
    },

    copy: function () {
      var text = JSON.stringify(logs, null, 2);
      navigator.clipboard.writeText(text).then(function () {
        alert('Diagnostics copied to clipboard.');
      });
    },

    exportJson: function () {
      var stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
      downloadText('Diagnostics_Report_' + stamp + '.json', JSON.stringify(logs, null, 2), 'application/json');
    },

    health: function () {
      return {
        healthy: true,
        version: this.version,
        logs: logs.length,
        initialised: isInitialised,
        open: isOpen
      };
    }
  };

})();
