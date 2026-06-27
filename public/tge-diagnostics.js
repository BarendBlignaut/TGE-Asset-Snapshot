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
  var popoutWindow = null;

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

  function levelClass(level) {
    level = String(level || '').toLowerCase();
    if (level === 'error') return 'tge-diag-error';
    if (level === 'warn' || level === 'warning') return 'tge-diag-warn';
    if (level === 'success') return 'tge-diag-success';
    return 'tge-diag-info';
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
      '.tge-diag-table{width:100%;border-collapse:collapse;font-size:11px;}',
      '.tge-diag-table th{position:sticky;top:0;background:var(--surface-2);z-index:1;text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.05em;}',
      '.tge-diag-table td{padding:7px 8px;border-bottom:1px solid var(--line-2);vertical-align:top;}',
      '.tge-diag-row{cursor:pointer;}',
      '.tge-diag-row:hover td{background:var(--surface-2);}',
      '.tge-diag-row.active td{background:var(--green-50);}',
      '.tge-diag-mono{font-family:monospace;font-size:10px;}',
      '.tge-diag-muted{color:var(--muted);}',
      '.tge-diag-error{color:var(--danger);font-weight:700;}',
      '.tge-diag-warn{color:var(--warning);font-weight:700;}',
      '.tge-diag-success{color:var(--green-600);font-weight:700;}',
      '.tge-diag-info{color:var(--muted);font-weight:700;}',
      '.tge-diag-empty{padding:36px 20px;text-align:center;color:var(--muted);font-size:13px;}',
      '.tge-diag-raw-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 6px;}',
      '.tge-diag-raw{font-family:monospace;font-size:10px;white-space:pre-wrap;word-break:break-word;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:8px;margin:0 0 10px;max-height:220px;overflow:auto;}',
      '.tge-diag-resize{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;}',
      '.tge-diag-resize:after{content:"";position:absolute;right:5px;bottom:5px;width:8px;height:8px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);opacity:.7;}'
    ].join('');

    document.head.appendChild(style);
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
           '<button class="tge-diag-action" id="tge-diagnostics-popout" type="button">Open Tab</button>',
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
    TGE.el('tge-diagnostics-popout').onclick = TGE.diagnostics.openTab;

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
      win.style.left = Math.max(0, startLeft + (e.clientX - startX)) + 'px';
      win.style.top = Math.max(0, startTop + (e.clientY - startY)) + 'px';
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
      win.style.width = Math.max(520, startW + (e.clientX - startX)) + 'px';
      win.style.height = Math.max(260, startH + (e.clientY - startY)) + 'px';
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
      pushToPopout();
      return;
    }

    content.innerHTML = [
      '<table class="tge-diag-table">',
        '<thead><tr>',
          '<th>Time</th>',
          '<th>Level</th>',
          '<th>Method / Endpoint</th>',
          '<th>Status</th>',
          '<th>Duration</th>',
        '</tr></thead>',
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
    pushToPopout();
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

    detail.innerHTML = buildDetailHtml(log);
  }

  function buildDetailHtml(log) {
    return [
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

  function buildPopoutBody() {
    var latest = selectedLogId
      ? logs.find(function (item) { return item.id === selectedLogId; })
      : logs[logs.length - 1];

    return [
      '<div class="pop-layout">',
        '<div class="pop-list">',
          '<h3>API Calls</h3>',
          logs.slice().reverse().map(function (log) {
            return '<div class="pop-row">' +
              '<strong>' + safeText(log.time) + '</strong> ' +
              '<span>' + safeText(log.level) + '</span><br>' +
              '<code>' + safeText(log.action) + '</code><br>' +
              '<small>Status: ' + safeText(log.status || '') + ' | ' + safeText(log.duration != null ? log.duration + 'ms' : '') + '</small>' +
            '</div>';
          }).join('') +
          (!logs.length ? '<div class="empty">No diagnostics captured yet.</div>' : ''),
        '</div>',
        '<div class="pop-detail">',
          '<h3>Raw Data</h3>',
          latest ? buildPopoutDetail(latest) : '<div class="empty">Waiting for data...</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  function buildPopoutDetail(log) {
    return [
      '<h4>Summary</h4>',
      '<pre>' + safeText(JSON.stringify({
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
      '<h4>Request Sent</h4>',
      '<pre>' + safeText(JSON.stringify(log.request || {}, null, 2)) + '</pre>',
      '<h4>Response Received</h4>',
      '<pre>' + safeText(JSON.stringify(log.response || {}, null, 2)) + '</pre>'
    ].join('');
  }

  function openPopoutWindow() {
    if (popoutWindow && !popoutWindow.closed) {
      popoutWindow.focus();
      pushToPopout();
      return;
    }

    popoutWindow = window.open(
      '',
      'TGE_Diagnostics_Popout',
      'width=1100,height=700,left=200,top=100,resizable=yes,scrollbars=yes'
    );

    if (!popoutWindow) {
      alert('Pop-out blocked by browser. Allow pop-ups for this site.');
      return;
    }

    popoutWindow.document.open();
    popoutWindow.document.write(
      '<!doctype html>' +
      '<html><head><title>TGE Diagnostics</title>' +
      '<style>' +
        'body{margin:0;font-family:Arial,sans-serif;background:#f6f7f8;color:#111;}' +
        'header{padding:12px 16px;background:#003c1f;color:#d4f026;font-weight:700;}' +
        '.pop-layout{display:grid;grid-template-columns:40% 60%;height:calc(100vh - 44px);}' +
        '.pop-list{overflow:auto;border-right:1px solid #ddd;background:#fff;padding:10px;}' +
        '.pop-detail{overflow:auto;padding:10px;}' +
        '.pop-row{padding:8px;border-bottom:1px solid #eee;}' +
        '.pop-row:hover{background:#f1f5f2;}' +
        'h3{margin:0 0 10px;font-size:13px;text-transform:uppercase;color:#555;}' +
        'h4{margin:12px 0 6px;font-size:11px;text-transform:uppercase;color:#555;}' +
        'pre{white-space:pre-wrap;word-break:break-word;background:#fff;border:1px solid #ddd;border-radius:8px;padding:10px;font-size:11px;line-height:1.45;}' +
        'code{font-size:11px;}' +
        'small{color:#666;}' +
        '.empty{padding:24px;color:#777;text-align:center;}' +
      '</style>' +
      '</head><body>' +
      '<header>TGE Diagnostics</header>' +
      '<main id="diagnostics-root"></main>' +
      '<script>' +
        'window.addEventListener("message",function(e){' +
          'if(!e.data||e.data.type!=="TGE_DIAGNOSTICS_UPDATE")return;' +
          'document.getElementById("diagnostics-root").innerHTML=e.data.html;' +
        '});' +
      '<\/script>' +
      '</body></html>'
    );
    popoutWindow.document.close();

    setTimeout(pushToPopout, 100);
    popoutWindow.focus();
  }

  function pushToPopout() {
    if (!popoutWindow || popoutWindow.closed) return;

    popoutWindow.postMessage({
      type: 'TGE_DIAGNOSTICS_UPDATE',
      html: buildPopoutBody()
    }, '*');
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
    version: '1.1.0',

    init: function () {
      if (isInitialised) return;
      if (typeof TGE.can === 'function' && !TGE.can('diagnostics', 'view')) return;

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
      pushToPopout();
    },

    getLogs: function () {
      return logs.slice();
    },

    clearLogs: function () {
      logs = [];
      selectedLogId = null;
      render();
      pushToPopout();
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
      navigator.clipboard.writeText(JSON.stringify(logs, null, 2)).then(function () {
        alert('Diagnostics copied to clipboard.');
      });
    },

    exportJson: function () {
      var stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
      downloadText('Diagnostics_Report_' + stamp + '.json', JSON.stringify(logs, null, 2), 'application/json');
    },

openTab: function () {
  var tab = window.open('', 'TGE_Diagnostics_Tab');

  if (!tab) {
    alert('Diagnostics tab blocked by browser. Allow pop-ups/tabs for this site.');
    return;
  }

  tab.document.open();
  tab.document.write(
    '<!doctype html>' +
    '<html>' +
    '<head>' +
      '<title>TGE Diagnostics</title>' +
      '<style>' +
        'body{margin:0;font-family:Arial,sans-serif;background:#f6f7f8;color:#111;}' +
        'header{padding:12px 16px;background:#003c1f;color:#d4f026;font-weight:700;}' +
        'main{display:grid;grid-template-columns:38% 62%;height:calc(100vh - 44px);}' +
        '#diag-list{overflow:auto;border-right:1px solid #ddd;background:#fff;padding:10px;}' +
        '#diag-detail{overflow:auto;padding:10px;}' +
        '.row{padding:8px;border-bottom:1px solid #eee;cursor:pointer;}' +
        '.row:hover{background:#f1f5f2;}' +
        '.row.active{background:#e9f6ed;}' +
        'h3{margin:0 0 10px;font-size:13px;text-transform:uppercase;color:#555;}' +
        'h4{margin:12px 0 6px;font-size:11px;text-transform:uppercase;color:#555;}' +
        'pre{white-space:pre-wrap;word-break:break-word;background:#fff;border:1px solid #ddd;border-radius:8px;padding:10px;font-size:11px;line-height:1.45;}' +
        'code{font-size:11px;}' +
        'small{color:#666;}' +
        '.empty{padding:24px;color:#777;text-align:center;}' +
      '</style>' +
    '</head>' +
    '<body>' +
      '<header>TGE Diagnostics</header>' +
      '<main>' +
        '<section id="diag-list"></section>' +
        '<section id="diag-detail"><div class="empty">Select a log row.</div></section>' +
      '</main>' +
      '<script>' +
        'var logs=' + JSON.stringify(logs).replace(/</g, '\\u003c') + ';' +
        'var selected=null;' +
        'function esc(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\\\\\"/g,"&quot;").replace(/\\x27/g,"&#039;");}' +
        'function render(){' +
          'var list=document.getElementById("diag-list");' +
          'if(!logs.length){list.innerHTML="<div class=\\"empty\\">No diagnostics captured.</div>";return;}' +
          'list.innerHTML="<h3>API Calls</h3>"+logs.slice().reverse().map(function(log){return "<div class=\\"row\\" data-id=\\""+log.id+"\\"><strong>"+esc(log.time)+"</strong> "+esc(log.level)+"<br><code>"+esc(log.action)+"</code><br><small>Status: "+esc(log.status||"")+" | "+esc(log.duration!=null?log.duration+"ms":"")+"</small></div>";}).join("");' +
          'Array.prototype.forEach.call(document.querySelectorAll(".row"),function(row){row.onclick=function(){selected=Number(row.getAttribute("data-id"));renderDetail();};});' +
        '}' +
        'function renderDetail(){' +
          'var detail=document.getElementById("diag-detail");' +
          'var log=logs.find(function(x){return x.id===selected;});' +
          'if(!log){detail.innerHTML="<div class=\\"empty\\">Select a log row.</div>";return;}' +
          'detail.innerHTML="<h3>Raw Data</h3>"+' +
            '"<h4>Summary</h4><pre>"+esc(JSON.stringify({id:log.id,timestamp:log.timestamp,category:log.category,level:log.level,module:log.module,action:log.action,status:log.status,duration:log.duration,message:log.message,error:log.error},null,2))+"</pre>"+' +
            '"<h4>Request Sent</h4><pre>"+esc(JSON.stringify(log.request||{},null,2))+"</pre>"+' +
            '"<h4>Response Received</h4><pre>"+esc(JSON.stringify(log.response||{},null,2))+"</pre>";' +
        '}' +
        'render();' +
      '<\/script>' +
    '</body>' +
    '</html>'
  );

  tab.document.close();
  tab.focus();
},
    health: function () {
      return {
        healthy: true,
        version: this.version,
        logs: logs.length,
        initialised: isInitialised,
        open: isOpen,
        popoutOpen: !!(popoutWindow && !popoutWindow.closed)
      };
    }
  };

})();
