// TGE Asset Snapshot — Manual API Tester
// public/diag-manual.js

(function () {
  'use strict';

  // ── Styles ─────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('dm-styles')) return;
    var s = document.createElement('style');
    s.id = 'dm-styles';
    s.textContent = [
      '.dm-wrap{display:grid;grid-template-columns:420px 1fr;gap:0;margin:-20px;min-height:calc(100vh - 52px);}',
      '.dm-left{border-right:1px solid var(--line);overflow-y:auto;max-height:calc(100vh - 52px);display:flex;flex-direction:column;gap:0;}',
      '.dm-right{overflow-y:auto;max-height:calc(100vh - 52px);padding:20px;display:flex;flex-direction:column;gap:16px;background:var(--surface-2);}',

      // Call panels
      '.dm-panel{border-bottom:1px solid var(--line);}',
      '.dm-panel-hdr{padding:12px 16px;display:flex;align-items:center;gap:10px;cursor:pointer;background:var(--surface);user-select:none;}',
      '.dm-panel-hdr:hover{background:var(--surface-2);}',
      '.dm-panel-num{width:22px;height:22px;border-radius:50%;background:var(--green-700);color:var(--yellow);font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
      '.dm-panel-title{font-size:13px;font-weight:700;color:var(--ink);flex:1;}',
      '.dm-panel-chev{color:var(--muted-2);transition:transform 0.2s;font-size:16px;}',
      '.dm-panel.collapsed .dm-panel-chev{transform:rotate(-90deg);}',
      '.dm-panel.collapsed .dm-panel-body{display:none;}',
      '.dm-panel-body{padding:14px 16px;display:flex;flex-direction:column;gap:10px;background:var(--surface);}',

      // Method + URL row
      '.dm-url-row{display:flex;gap:6px;align-items:center;}',
      '.dm-method-sel{height:36px;padding:0 10px;border:1px solid var(--line);border-radius:7px;background:var(--surface-2);color:var(--ink);font:inherit;font-size:12px;font-weight:700;width:90px;flex-shrink:0;}',
      '.dm-url-input{flex:1;height:36px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font:inherit;font-size:11px;font-family:monospace;color:var(--ink);background:var(--surface);}',
      '.dm-url-input:focus{outline:none;border-color:var(--green-600);}',

      // Headers/params table
      '.dm-kv-table{width:100%;border-collapse:collapse;font-size:11px;}',
      '.dm-kv-table th{text-align:left;padding:4px 6px;color:var(--muted);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid var(--line);}',
      '.dm-kv-table td{padding:3px 4px;border-bottom:1px solid var(--line-2);}',
      '.dm-kv-table tr:last-child td{border-bottom:none;}',
      '.dm-kv-input{width:100%;border:1px solid transparent;border-radius:5px;padding:4px 6px;font:inherit;font-size:11px;font-family:monospace;background:transparent;color:var(--ink);}',
      '.dm-kv-input:focus{outline:none;border-color:var(--green-600);background:var(--surface);}',
      '.dm-kv-del{border:none;background:none;color:var(--muted-2);cursor:pointer;font-size:14px;padding:2px 4px;border-radius:4px;}',
      '.dm-kv-del:hover{color:var(--danger);background:var(--danger-bg);}',
      '.dm-add-row{font-size:11px;color:var(--green-600);cursor:pointer;border:none;background:none;padding:4px 0;font-weight:600;}',
      '.dm-add-row:hover{color:var(--green-700);}',

      // Body textarea
      '.dm-body-area{width:100%;min-height:120px;border:1px solid var(--line);border-radius:7px;padding:8px 10px;font:inherit;font-size:11px;font-family:monospace;color:var(--ink);background:var(--surface);resize:vertical;}',
      '.dm-body-area:focus{outline:none;border-color:var(--green-600);}',

      // Run button
      '.dm-run-btn{height:36px;padding:0 18px;border-radius:7px;border:none;background:var(--green-700);color:var(--yellow);font:inherit;font-size:12px;font-weight:700;cursor:pointer;transition:background 140ms;align-self:flex-start;}',
      '.dm-run-btn:hover{background:var(--green-800);}',
      '.dm-run-btn:disabled{opacity:0.4;cursor:not-allowed;}',

      // Section label
      '.dm-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:4px;}',

      // Response panel (right side)
      '.dm-resp-card{background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden;}',
      '.dm-resp-hdr{padding:10px 14px;display:flex;align-items:center;gap:10px;background:var(--surface-2);border-bottom:1px solid var(--line);}',
      '.dm-resp-title{font-size:12px;font-weight:700;color:var(--ink);flex:1;}',
      '.dm-resp-body{padding:14px;display:flex;flex-direction:column;gap:12px;}',
      '.dm-raw{background:var(--surface-3);border:1px solid var(--line);border-radius:7px;padding:10px 12px;font-family:monospace;font-size:10px;color:var(--ink-2);white-space:pre-wrap;word-break:break-all;max-height:400px;overflow-y:auto;}',

      // Badge
      '.dm-badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;}',
      '.dm-badge-ok{background:var(--green-100);color:var(--green-700);}',
      '.dm-badge-err{background:var(--danger-bg);color:var(--danger);}',
      '.dm-badge-pending{background:rgba(180,83,9,0.1);color:var(--warning);}',
      '.dm-badge-info{background:var(--surface-3);color:var(--muted);}',

      // Spinner
      '.dm-spin{width:12px;height:12px;border:2px solid rgba(180,83,9,0.3);border-top-color:var(--warning);border-radius:50%;animation:dm-spin 0.7s linear infinite;display:inline-block;}',
      '@keyframes dm-spin{to{transform:rotate(360deg);}}',

      // Attachment list (clickable rows from event response)
      '.dm-att-row{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:7px;cursor:pointer;border:1px solid var(--line);background:var(--surface-2);transition:background 140ms;}',
      '.dm-att-row:hover{background:var(--green-50);border-color:var(--green-600);}',
      '.dm-att-pos{font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:var(--green-100);color:var(--green-700);min-width:90px;text-align:center;}',
      '.dm-att-id{font-family:monospace;font-size:11px;color:var(--ink-2);flex:1;}',
      '.dm-att-time{font-size:10px;color:var(--muted);}',
      '.dm-att-hint{font-size:10px;color:var(--green-600);flex-shrink:0;}',

      // Image preview
      '.dm-img-wrap{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;min-height:200px;}',
      '.dm-img-wrap img{max-width:100%;max-height:500px;object-fit:contain;display:block;}',

      // S3 URL highlight
      '.dm-url-highlight{background:var(--green-50);border:1px solid rgba(0,166,81,0.3);border-radius:7px;padding:10px 12px;font-family:monospace;font-size:10px;color:var(--green-700);word-break:break-all;}',

      // Timing
      '.dm-timing{font-size:11px;color:var(--muted);display:flex;align-items:center;gap:8px;}',

      // Empty
      '.dm-empty{text-align:center;padding:40px 20px;color:var(--muted-2);font-size:13px;}',
      '.dm-empty-icon{font-size:32px;margin-bottom:8px;}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── State ──────────────────────────────────────────────────────────────────
  var calls = {
    events: { params: {}, headers: {}, body: '' },
    attach: { params: {}, headers: {} },
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-diag-manual');
    if (!view) return;
    injectStyles();

    view.innerHTML = [
      '<div class="dm-wrap">',

        // ── LEFT: call builder ──
        '<div class="dm-left">',

          // ── CALL 1: Snapshot Events ──
          '<div class="dm-panel" id="dm-panel-1">',
            '<div class="dm-panel-hdr" onclick="document.getElementById(\'dm-panel-1\').classList.toggle(\'collapsed\')">',
              '<div class="dm-panel-num">1</div>',
              '<div class="dm-panel-title">POST — Snapshot Events</div>',
              '<span class="dm-panel-chev">›</span>',
            '</div>',
            '<div class="dm-panel-body">',

              '<div class="dm-label">URL</div>',
              '<div class="dm-url-row">',
                '<select class="dm-method-sel" id="dm-1-method"><option>POST</option><option>GET</option></select>',
                '<input class="dm-url-input" id="dm-1-url" value="/api/tn360/v1/devices/events/camera/snapshots">',
              '</div>',

              '<div class="dm-label" style="margin-top:8px;">Query params</div>',
              '<table class="dm-kv-table">',
                '<thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>',
                '<tbody id="dm-1-params">',
                  kvRow('from', '2026-06-01T00:00:00%2B10:00'),
                  kvRow('to',   '2026-06-30T23:59:59%2B10:00'),
                '</tbody>',
              '</table>',
              '<button class="dm-add-row" onclick="addKvRow(\'dm-1-params\')">+ Add param</button>',

              '<div class="dm-label" style="margin-top:8px;">Request headers</div>',
              '<table class="dm-kv-table">',
                '<thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>',
                '<tbody id="dm-1-headers">',
                  kvRow('Content-Type', 'application/json'),
                  kvRow('X-TN360-Token', ''),
                '</tbody>',
              '</table>',
              '<button class="dm-add-row" onclick="addKvRow(\'dm-1-headers\')">+ Add header</button>',

              '<div class="dm-label" style="margin-top:8px;">Request body (JSON)</div>',
              '<textarea class="dm-body-area" id="dm-1-body">{\n  "vehicles": ["381634"],\n  "devices": ["518241"],\n  "orderField": "EventTime",\n  "orderDirection": "desc",\n  "rowCountLimit": 25,\n  "rowOffset": 0,\n  "latestOnly": false\n}</textarea>',

              '<button class="dm-run-btn" id="dm-1-run" onclick="runCall(1)">▶ Send</button>',

            '</div>',
          '</div>',

          // ── CALL 2: Attachment Content ──
          '<div class="dm-panel" id="dm-panel-2">',
            '<div class="dm-panel-hdr" onclick="document.getElementById(\'dm-panel-2\').classList.toggle(\'collapsed\')">',
              '<div class="dm-panel-num">2</div>',
              '<div class="dm-panel-title">GET — Attachment Content</div>',
              '<span class="dm-panel-chev">›</span>',
            '</div>',
            '<div class="dm-panel-body">',

              '<div class="dm-label">URL</div>',
              '<div class="dm-url-row">',
                '<select class="dm-method-sel" id="dm-2-method"><option>GET</option><option>POST</option></select>',
                '<input class="dm-url-input" id="dm-2-url" value="/api/tn360/v1/attachments/ATTACHMENT_ID/content">',
              '</div>',
              '<p style="font-size:10px;color:var(--muted);margin-top:2px;">Replace ATTACHMENT_ID in the URL above, or click an attachment from Call 1 results.</p>',

              '<div class="dm-label" style="margin-top:8px;">Query params</div>',
              '<table class="dm-kv-table">',
                '<thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>',
                '<tbody id="dm-2-params">',
                  kvRow('pruning',   'WEB'),
                  kvRow('thumbnail', 'false'),
                  kvRow('year',      '2026'),
                  kvRow('month',     '6'),
                  kvRow('presigned', 'true'),
                '</tbody>',
              '</table>',
              '<button class="dm-add-row" onclick="addKvRow(\'dm-2-params\')">+ Add param</button>',

              '<div class="dm-label" style="margin-top:8px;">Request headers</div>',
              '<table class="dm-kv-table">',
                '<thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>',
                '<tbody id="dm-2-headers">',
                  kvRow('X-TN360-Token', ''),
                '</tbody>',
              '</table>',
              '<button class="dm-add-row" onclick="addKvRow(\'dm-2-headers\')">+ Add header</button>',

              '<button class="dm-run-btn" id="dm-2-run" onclick="runCall(2)">▶ Send</button>',

            '</div>',
          '</div>',

          // ── CALL 3: Custom ──
          '<div class="dm-panel collapsed" id="dm-panel-3">',
            '<div class="dm-panel-hdr" onclick="document.getElementById(\'dm-panel-3\').classList.toggle(\'collapsed\')">',
              '<div class="dm-panel-num">3</div>',
              '<div class="dm-panel-title">Custom Call</div>',
              '<span class="dm-panel-chev">›</span>',
            '</div>',
            '<div class="dm-panel-body">',

              '<div class="dm-label">URL</div>',
              '<div class="dm-url-row">',
                '<select class="dm-method-sel" id="dm-3-method"><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></select>',
                '<input class="dm-url-input" id="dm-3-url" placeholder="/api/tn360/v1/...">',
              '</div>',

              '<div class="dm-label" style="margin-top:8px;">Query params</div>',
              '<table class="dm-kv-table">',
                '<thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>',
                '<tbody id="dm-3-params">',
                  kvRow('', ''),
                '</tbody>',
              '</table>',
              '<button class="dm-add-row" onclick="addKvRow(\'dm-3-params\')">+ Add param</button>',

              '<div class="dm-label" style="margin-top:8px;">Request headers</div>',
              '<table class="dm-kv-table">',
                '<thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>',
                '<tbody id="dm-3-headers">',
                  kvRow('Content-Type', 'application/json'),
                  kvRow('X-TN360-Token', ''),
                '</tbody>',
              '</table>',
              '<button class="dm-add-row" onclick="addKvRow(\'dm-3-headers\')">+ Add header</button>',

              '<div class="dm-label" style="margin-top:8px;">Request body (JSON — optional)</div>',
              '<textarea class="dm-body-area" id="dm-3-body" style="min-height:80px;" placeholder="{}"></textarea>',

              '<button class="dm-run-btn" id="dm-3-run" onclick="runCall(3)">▶ Send</button>',

            '</div>',
          '</div>',

        '</div>',

        // ── RIGHT: responses ──
        '<div class="dm-right" id="dm-responses">',
          '<div class="dm-empty" id="dm-empty">',
            '<div class="dm-empty-icon">🔬</div>',
            '<p>Configure a call on the left and hit Send.<br>All requests and responses appear here.</p>',
          '</div>',
        '</div>',

      '</div>',
    ].join('');

    // Expose helpers to global scope for inline onclick handlers
    window.addKvRow  = addKvRow;
    window.removeKvRow = removeKvRow;
    window.runCall   = runCall;
    window.fillAttachment = fillAttachment;
  }

  // ── KV row helpers ─────────────────────────────────────────────────────────
  function kvRow(k, v) {
    return '<tr>'
      + '<td><input class="dm-kv-input dm-kv-key" value="' + esc(k) + '" placeholder="key"></td>'
      + '<td><input class="dm-kv-input dm-kv-val" value="' + esc(v) + '" placeholder="value"></td>'
      + '<td><button class="dm-kv-del" onclick="removeKvRow(this)" title="Remove">×</button></td>'
      + '</tr>';
  }

  function addKvRow(tbodyId) {
    var tbody = TGE.el(tbodyId);
    if (!tbody) return;
    var tr = document.createElement('tr');
    tr.innerHTML = '<td><input class="dm-kv-input dm-kv-key" placeholder="key"></td>'
      + '<td><input class="dm-kv-input dm-kv-val" placeholder="value"></td>'
      + '<td><button class="dm-kv-del" onclick="removeKvRow(this)" title="Remove">×</button></td>';
    tbody.appendChild(tr);
    tr.querySelector('.dm-kv-key').focus();
  }

  function removeKvRow(btn) {
    var tr = btn.closest('tr');
    if (tr) tr.remove();
  }

  function getKvPairs(tbodyId) {
    var tbody = TGE.el(tbodyId);
    if (!tbody) return {};
    var out = {};
    var rows = tbody.querySelectorAll('tr');
    rows.forEach(function(tr) {
      var k = (tr.querySelector('.dm-kv-key') || {}).value || '';
      var v = (tr.querySelector('.dm-kv-val') || {}).value || '';
      if (k.trim()) out[k.trim()] = v;
    });
    return out;
  }

  // ── Fill attachment from event results ─────────────────────────────────────
  function fillAttachment(attachmentId, year, month) {
    // Update URL
    var urlInput = TGE.el('dm-2-url');
    if (urlInput) urlInput.value = '/api/tn360/v1/attachments/' + attachmentId + '/content';

    // Update year/month params
    var tbody = TGE.el('dm-2-params');
    if (tbody) {
      var rows = tbody.querySelectorAll('tr');
      rows.forEach(function(tr) {
        var k = (tr.querySelector('.dm-kv-key') || {}).value || '';
        var valInput = tr.querySelector('.dm-kv-val');
        if (k === 'year'  && valInput) valInput.value = year;
        if (k === 'month' && valInput) valInput.value = month;
      });
    }

    // Open panel 2
    var panel2 = TGE.el('dm-panel-2');
    if (panel2) panel2.classList.remove('collapsed');

    // Scroll to panel 2
    panel2 && panel2.scrollIntoView({ behavior: 'smooth' });
  }

  // ── Run a call ─────────────────────────────────────────────────────────────
  async function runCall(num) {
    var method  = (TGE.el('dm-' + num + '-method') || {}).value || 'GET';
    var baseUrl = ((TGE.el('dm-' + num + '-url') || {}).value || '').trim();
    var params  = getKvPairs('dm-' + num + '-params');
    var headers = getKvPairs('dm-' + num + '-headers');
    var bodyEl  = TGE.el('dm-' + num + '-body');
    var bodyRaw = bodyEl ? bodyEl.value.trim() : '';

    if (!baseUrl) return;

    // Build query string
    var qs = Object.keys(params).map(function(k) {
      return encodeURIComponent(k) + '=' + params[k]; // value already encoded by user if needed
    }).join('&');
    var fullUrl = qs ? baseUrl + '?' + qs : baseUrl;

    // Build fetch options — use session cookie (credentials: include)
    var fetchHeaders = { 'Content-Type': 'application/json' };
    Object.keys(headers).forEach(function(k) {
      if (headers[k]) fetchHeaders[k] = headers[k];
    });

    var fetchOpts = { method: method, credentials: 'include', headers: fetchHeaders };
    if ((method === 'POST' || method === 'PUT') && bodyRaw) {
      fetchOpts.body = bodyRaw;
    }

    // Disable button, show pending
    var btn = TGE.el('dm-' + num + '-run');
    if (btn) btn.disabled = true;

    var empty = TGE.el('dm-empty');
    if (empty) empty.style.display = 'none';

    var cardId = 'dm-resp-' + Date.now();
    var card   = buildRespCardPending(num, method, fullUrl, cardId);
    var respArea = TGE.el('dm-responses');
    if (respArea) respArea.insertBefore(card, respArea.firstChild);

    var start = Date.now();
    try {
      var res  = await fetch(fullUrl, fetchOpts);
      var ms   = Date.now() - start;
      var text = await res.text();
      var data = null;
      try { data = JSON.parse(text); } catch(e) { data = null; }

      updateRespCard(cardId, num, method, fullUrl, res.status, ms, fetchOpts, data || text, bodyRaw);

    } catch(e) {
      var ms2 = Date.now() - start;
      updateRespCard(cardId, num, method, fullUrl, 0, ms2, fetchOpts, { error: e.message }, bodyRaw);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── Response cards ─────────────────────────────────────────────────────────
  function buildRespCardPending(num, method, url, cardId) {
    var card = document.createElement('div');
    card.className = 'dm-resp-card';
    card.id = cardId;
    card.innerHTML = '<div class="dm-resp-hdr">'
      + '<span class="dm-badge dm-badge-pending"><div class="dm-spin" style="display:inline-block;margin-right:4px;"></div>Sending…</span>'
      + '<span class="dm-resp-title" style="margin-left:8px;">Call ' + num + ' — ' + esc(method) + ' ' + esc(url) + '</span>'
      + '</div>'
      + '<div class="dm-resp-body"><div class="dm-timing">Waiting for response…</div></div>';
    return card;
  }

  function updateRespCard(cardId, num, method, url, status, ms, fetchOpts, data, reqBody) {
    var card = TGE.el(cardId);
    if (!card) return;

    var ok      = status >= 200 && status < 300;
    var badgeCls = ok ? 'dm-badge-ok' : (status === 0 ? 'dm-badge-err' : 'dm-badge-err');
    var badgeTxt = status === 0 ? 'Failed' : 'HTTP ' + status;

    var dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

    // Build attachment quick-select if this is call 1 and has events
    var attachHtml = '';
    if (num === 1 && data && typeof data === 'object') {
      var events = data.events || (Array.isArray(data) ? data : []);
      if (events.length) {
        var rows = [];
        events.forEach(function(ev) {
          var atts = ev.attachments || [];
          atts.forEach(function(att) {
            var d     = new Date(att.timeAt || '');
            var year  = d.getFullYear() || '';
            var month = d.getMonth() + 1 || '';
            var timeFmt = att.timeAt ? d.toLocaleString('en-AU', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
            rows.push('<div class="dm-att-row" onclick="fillAttachment(\'' + att.attachmentId + '\',\'' + year + '\',\'' + month + '\')">'
              + '<span class="dm-att-pos">' + esc(att.cameraPosition || '?') + '</span>'
              + '<span class="dm-att-id">' + esc(att.attachmentId) + '</span>'
              + '<span class="dm-att-time">' + esc(timeFmt) + '</span>'
              + '<span class="dm-att-hint">→ Use in Call 2</span>'
              + '</div>');
          });
        });
        if (rows.length) {
          attachHtml = '<div>'
            + '<div class="dm-label">Attachments — click to load into Call 2</div>'
            + '<div style="display:flex;flex-direction:column;gap:6px;">' + rows.join('') + '</div>'
            + '</div>';
        }
      }
    }

    // Extract and render image if this is call 2 and has attachmentLink
    var imgHtml = '';
    if (num === 2 && data && typeof data === 'object' && data.attachmentLink) {
      var s3url = data.attachmentLink;
      imgHtml = '<div>'
        + '<div class="dm-label">Fresh S3 URL (presigned — expires in ~1hr)</div>'
        + '<div class="dm-url-highlight">' + esc(s3url) + '</div>'
        + '</div>'
        + '<div>'
        + '<div class="dm-label">Image preview</div>'
        + '<div class="dm-img-wrap">'
        + '<img src="/api/image-proxy?url=' + encodeURIComponent(s3url) + '" alt="snapshot"'
        + ' onerror="this.parentElement.innerHTML=\'<p style=&quot;color:var(--danger);font-size:12px;padding:20px;&quot;>Image failed to load — URL may have expired or proxy blocked it.</p>\'">'
        + '</div>'
        + '</div>';
    }

    card.innerHTML = '<div class="dm-resp-hdr">'
      + '<span class="dm-badge ' + badgeCls + '">' + esc(badgeTxt) + '</span>'
      + '<span class="dm-resp-title" style="margin-left:8px;">Call ' + num + ' — ' + esc(method) + ' ' + esc(url) + '</span>'
      + '<span class="dm-timing">' + ms + 'ms</span>'
      + '</div>'
      + '<div class="dm-resp-body">'
      + (reqBody ? '<div><div class="dm-label">Request body sent</div><div class="dm-raw">' + esc(reqBody) + '</div></div>' : '')
      + attachHtml
      + imgHtml
      + '<div><div class="dm-label">Raw response</div><div class="dm-raw">' + esc(dataStr) + '</div></div>'
      + '</div>';
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  // ── Register ───────────────────────────────────────────────────────────────
  var _orig = TGE.onAppReady;
  TGE.onAppReady = function () {
    if (typeof _orig === 'function') _orig();
    render();
  };

  TGE.onShow['diag-manual'] = function() {};

})();
