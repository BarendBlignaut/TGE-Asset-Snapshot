// TGE Asset Snapshot — Manual API Workbench
// public/diag-manual.js

(function () {
  'use strict';

  // ── Styles ─────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('dm-styles')) return;
    var s = document.createElement('style');
    s.id = 'dm-styles';
    s.textContent = [
      // Layout
      '.dm-wrap{display:flex;flex-direction:column;gap:0;margin:-20px;min-height:calc(100vh - 52px);}',
      '.dm-token-bar{padding:12px 20px;background:var(--green-900);display:flex;align-items:center;gap:12px;border-bottom:2px solid var(--yellow);}',
      '.dm-token-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(212,240,38,0.7);white-space:nowrap;}',
      '.dm-token-input{flex:1;height:34px;border:1px solid rgba(255,255,255,0.2);border-radius:7px;padding:0 12px;background:rgba(255,255,255,0.08);color:#fff;font:inherit;font-size:11px;font-family:monospace;}',
      '.dm-token-input:focus{outline:none;border-color:var(--yellow);}',
      '.dm-token-input::placeholder{color:rgba(255,255,255,0.3);}',
      '.dm-token-hint{font-size:10px;color:rgba(255,255,255,0.4);white-space:nowrap;}',
      '.dm-body{display:grid;grid-template-columns:440px 1fr;flex:1;min-height:0;}',

      // Left panel — call builder
      '.dm-left{border-right:1px solid var(--line);overflow-y:auto;max-height:calc(100vh - 104px);background:var(--surface);}',

      // Right panel — diagnostics
      '.dm-right{overflow-y:auto;max-height:calc(100vh - 104px);background:var(--surface-2);display:flex;flex-direction:column;gap:0;}',

      // Call panels
      '.dm-panel{border-bottom:2px solid var(--line);}',
      '.dm-panel-hdr{padding:11px 16px;display:flex;align-items:center;gap:10px;cursor:pointer;background:var(--surface);user-select:none;transition:background 140ms;}',
      '.dm-panel-hdr:hover{background:var(--surface-2);}',
      '.dm-panel-num{width:24px;height:24px;border-radius:50%;background:var(--green-700);color:var(--yellow);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
      '.dm-panel-title{font-size:13px;font-weight:700;color:var(--ink);flex:1;}',
      '.dm-panel-subtitle{font-size:10px;color:var(--muted);font-family:monospace;}',
      '.dm-panel-chev{color:var(--muted-2);transition:transform 0.2s;font-size:18px;line-height:1;}',
      '.dm-panel.collapsed .dm-panel-chev{transform:rotate(-90deg);}',
      '.dm-panel.collapsed .dm-panel-body{display:none;}',
      '.dm-panel-body{padding:14px 16px;display:flex;flex-direction:column;gap:12px;background:var(--surface);}',

      // Section labels inside panels
      '.dm-sec{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:5px;margin-top:4px;}',

      // Method + URL row
      '.dm-url-row{display:flex;gap:6px;align-items:stretch;}',
      '.dm-method-sel{height:36px;padding:0 8px;border:1px solid var(--line);border-radius:7px;background:var(--surface-2);color:var(--ink);font:inherit;font-size:12px;font-weight:700;width:80px;flex-shrink:0;}',
      '.dm-url-input{flex:1;height:36px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font:inherit;font-size:11px;font-family:monospace;color:var(--ink);background:var(--surface);}',
      '.dm-url-input:focus,.dm-method-sel:focus{outline:none;border-color:var(--green-600);}',

      // KV table
      '.dm-kv-wrap{border:1px solid var(--line);border-radius:8px;overflow:hidden;}',
      '.dm-kv-table{width:100%;border-collapse:collapse;font-size:11px;}',
      '.dm-kv-table thead tr{background:var(--surface-2);}',
      '.dm-kv-table th{text-align:left;padding:5px 8px;color:var(--muted);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid var(--line);}',
      '.dm-kv-table td{padding:2px 4px;border-bottom:1px solid var(--line-2);}',
      '.dm-kv-table tr:last-child td{border-bottom:none;}',
      '.dm-kv-input{width:100%;border:1px solid transparent;border-radius:5px;padding:5px 7px;font:inherit;font-size:11px;font-family:monospace;background:transparent;color:var(--ink);}',
      '.dm-kv-input:focus{outline:none;border-color:var(--green-600);background:var(--surface);}',
      '.dm-kv-del{border:none;background:none;color:var(--muted-2);cursor:pointer;font-size:16px;padding:2px 6px;border-radius:4px;line-height:1;}',
      '.dm-kv-del:hover{color:var(--danger);background:var(--danger-bg);}',
      '.dm-add-kv{font-size:11px;color:var(--green-600);cursor:pointer;border:none;background:none;padding:6px 8px;font-weight:600;display:block;width:100%;text-align:left;border-top:1px solid var(--line-2);}',
      '.dm-add-kv:hover{background:var(--green-50);color:var(--green-700);}',

      // Body textarea
      '.dm-body-area{width:100%;min-height:100px;border:1px solid var(--line);border-radius:8px;padding:9px 11px;font:inherit;font-size:11px;font-family:monospace;color:var(--ink);background:var(--surface);resize:vertical;line-height:1.5;}',
      '.dm-body-area:focus{outline:none;border-color:var(--green-600);}',

      // Send button
      '.dm-send-btn{height:38px;padding:0 20px;border-radius:8px;border:none;background:var(--green-700);color:var(--yellow);font:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:background 140ms;align-self:flex-start;display:flex;align-items:center;gap:8px;}',
      '.dm-send-btn:hover{background:var(--green-800);}',
      '.dm-send-btn:disabled{opacity:0.4;cursor:not-allowed;}',
      '.dm-send-spin{width:12px;height:12px;border:2px solid rgba(212,240,38,0.3);border-top-color:var(--yellow);border-radius:50%;animation:dm-spin 0.7s linear infinite;display:none;}',
      '.dm-send-btn.loading .dm-send-spin{display:block;}',
      '@keyframes dm-spin{to{transform:rotate(360deg);}}',

      // Right panel — diagnostics output
      '.dm-diag-empty{text-align:center;padding:60px 20px;color:var(--muted-2);}',
      '.dm-diag-empty-icon{font-size:36px;margin-bottom:10px;}',

      // Diagnostics result blocks
      '.dm-result{border-bottom:2px solid var(--line);background:var(--surface);}',
      '.dm-result-hdr{padding:12px 20px;display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;transition:background 140ms;}',
      '.dm-result-hdr:hover{background:var(--surface-2);}',
      '.dm-result.collapsed .dm-result-body{display:none;}',
      '.dm-result.collapsed .dm-result-chev{transform:rotate(-90deg);}',
      '.dm-result-chev{color:var(--muted-2);transition:transform 0.2s;font-size:18px;line-height:1;margin-left:auto;}',
      '.dm-result-num{width:24px;height:24px;border-radius:50%;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
      '.dm-result-num-ok{background:var(--green-100);color:var(--green-700);}',
      '.dm-result-num-err{background:var(--danger-bg);color:var(--danger);}',
      '.dm-result-num-pending{background:rgba(180,83,9,0.1);color:var(--warning);}',
      '.dm-result-title{font-size:13px;font-weight:700;color:var(--ink);}',
      '.dm-result-meta{font-size:11px;color:var(--muted);font-family:monospace;}',
      '.dm-result-body{padding:0 20px 16px;}',

      // Badge
      '.dm-badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;}',
      '.dm-badge-ok{background:var(--green-100);color:var(--green-700);}',
      '.dm-badge-err{background:var(--danger-bg);color:var(--danger);}',
      '.dm-badge-pending{background:rgba(180,83,9,0.1);color:var(--warning);}',
      '.dm-badge-gray{background:var(--surface-3);color:var(--muted);}',

      // Expandable sections inside result
      '.dm-section{margin-top:10px;}',
      '.dm-section-hdr{display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--surface-2);border:1px solid var(--line);border-radius:8px;cursor:pointer;user-select:none;font-size:11px;font-weight:700;color:var(--ink-2);}',
      '.dm-section-hdr:hover{background:var(--surface-3);}',
      '.dm-section.collapsed .dm-section-body{display:none;}',
      '.dm-section.collapsed .dm-sec-chev{transform:rotate(-90deg);}',
      '.dm-sec-chev{color:var(--muted-2);transition:transform 0.15s;font-size:14px;margin-left:auto;}',
      '.dm-section-body{border:1px solid var(--line);border-top:none;border-radius:0 0 8px 8px;overflow:hidden;}',

      // Raw JSON display
      '.dm-raw{background:var(--surface-3);padding:10px 12px;font-family:monospace;font-size:10px;color:var(--ink-2);white-space:pre-wrap;word-break:break-all;max-height:320px;overflow-y:auto;line-height:1.6;}',

      // KV display (read-only)
      '.dm-kv-display{padding:8px 12px;display:flex;flex-direction:column;gap:4px;background:var(--surface-3);}',
      '.dm-kv-display-row{display:flex;gap:8px;font-size:11px;font-family:monospace;}',
      '.dm-kv-display-key{color:var(--green-700);font-weight:700;min-width:140px;flex-shrink:0;}',
      '.dm-kv-display-val{color:var(--ink-2);word-break:break-all;}',

      // S3 URL box
      '.dm-s3-box{background:var(--green-50);border:1px solid rgba(0,166,81,0.3);border-radius:8px;padding:10px 12px;font-family:monospace;font-size:10px;color:var(--green-700);word-break:break-all;line-height:1.6;margin-top:10px;}',
      '.dm-s3-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--green-600);margin-bottom:4px;}',

      // Image preview
      '.dm-img-preview{margin-top:10px;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;min-height:180px;}',
      '.dm-img-preview img{max-width:100%;max-height:480px;object-fit:contain;display:block;}',

      // Attachment quick-pick list
      '.dm-att-list{display:flex;flex-direction:column;gap:6px;padding:10px 12px;background:var(--surface-3);}',
      '.dm-att-row{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;border:1px solid var(--line);background:var(--surface);cursor:pointer;transition:all 140ms;}',
      '.dm-att-row:hover{background:var(--green-50);border-color:var(--green-600);}',
      '.dm-att-pos{font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:var(--green-100);color:var(--green-700);min-width:100px;text-align:center;flex-shrink:0;}',
      '.dm-att-id{font-family:monospace;font-size:11px;color:var(--ink-2);flex:1;}',
      '.dm-att-time{font-size:10px;color:var(--muted);flex-shrink:0;}',
      '.dm-att-arrow{font-size:12px;color:var(--green-600);flex-shrink:0;}',

      // Timing row
      '.dm-timing{display:flex;align-items:center;gap:12px;font-size:11px;color:var(--muted);margin-top:6px;}',
      '.dm-timing strong{color:var(--ink-2);}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── Globals ────────────────────────────────────────────────────────────────
  window._dmFillAttachment = fillAttachment;
  window._dmToggleSection  = toggleSection;
  window._dmToggleResult   = toggleResult;
  window._dmAddKv          = addKvRow;
  window._dmDelKv          = delKvRow;

  var resultCount = 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-diag-manual');
    if (!view) return;
    injectStyles();

    view.innerHTML = [
      '<div class="dm-wrap">',

        // Token bar
        '<div class="dm-token-bar">',
          '<span class="dm-token-label">TN360 Session Token</span>',
          '<input class="dm-token-input" id="dm-token" type="password" placeholder="Paste your TN360 token here — used as X-TN360-Token header on all calls">',
          '<span class="dm-token-hint">From DevTools → any api-au.telematics.com request → Authorization header</span>',
        '</div>',

        '<div class="dm-body">',

          // ── LEFT: call builder ──
          '<div class="dm-left">',

            // CALL 1
            buildCallPanel(1, 'POST', 'Snapshot Events',
              '/api/tn360/v1/devices/events/camera/snapshots',
              [['from','2026-06-01T00:00:00%2B10:00'],['to','2026-06-26T23:59:59%2B10:00']],
              [['Content-Type','application/json']],
              '{\n  "vehicles": ["381634"],\n  "devices": ["518241"],\n  "orderField": "EventTime",\n  "orderDirection": "desc",\n  "rowCountLimit": 25,\n  "rowOffset": 0,\n  "latestOnly": false\n}',
              'POST events to get attachmentIds'
            ),

            // CALL 2
            buildCallPanel(2, 'GET', 'Attachment Content (Fresh URL)',
              '/api/tn360/v1/attachments/ATTACHMENT_ID/content',
              [['pruning','WEB'],['thumbnail','false'],['year','2026'],['month','6'],['presigned','true']],
              [['Content-Type','application/json']],
              '',
              'Replace ATTACHMENT_ID in URL — or click an attachment from Call 1 results'
            ),

            // CALL 3 — custom
            buildCallPanel(3, 'GET', 'Custom Call',
              '/api/tn360/v1/',
              [['','']],
              [['Content-Type','application/json']],
              '',
              'Enter any TN360 endpoint path'
            ),

          '</div>',

          // ── RIGHT: diagnostics ──
          '<div class="dm-right" id="dm-diag-panel">',
            '<div class="dm-diag-empty" id="dm-diag-empty">',
              '<div class="dm-diag-empty-icon">🔬</div>',
              '<p style="font-size:13px;color:var(--muted);">Send a call from the left panel.<br>All requests, responses and data appear here.</p>',
            '</div>',
          '</div>',

        '</div>',
      '</div>',
    ].join('');
  }

  // ── Build call panel ───────────────────────────────────────────────────────
  function buildCallPanel(num, method, title, url, params, headers, body, hint) {
    var paramRows = params.map(function(p) { return kvInputRow(num,'param',p[0],p[1]); }).join('');
    var headerRows = headers.map(function(h) { return kvInputRow(num,'header',h[0],h[1]); }).join('');
    var bodyHtml = (method === 'POST' || method === 'PUT' || body)
      ? '<div class="dm-sec">Request body (JSON)</div>'
        + '<textarea class="dm-body-area" id="dm-'+num+'-body">' + esc(body) + '</textarea>'
      : '';

    return '<div class="dm-panel" id="dm-panel-'+num+'">'
      + '<div class="dm-panel-hdr" onclick="document.getElementById(\'dm-panel-'+num+'\').classList.toggle(\'collapsed\')">'
        + '<div class="dm-panel-num">'+num+'</div>'
        + '<div style="flex:1;">'
          + '<div class="dm-panel-title">'+esc(title)+'</div>'
          + '<div class="dm-panel-subtitle">'+esc(method)+' '+esc(url)+'</div>'
        + '</div>'
        + '<span class="dm-panel-chev">›</span>'
      + '</div>'
      + '<div class="dm-panel-body">'

        + (hint ? '<p style="font-size:11px;color:var(--muted);padding:4px 0;">'+esc(hint)+'</p>' : '')

        + '<div class="dm-sec">Method &amp; URL</div>'
        + '<div class="dm-url-row">'
          + '<select class="dm-method-sel" id="dm-'+num+'-method">'
            + ['GET','POST','PUT','DELETE'].map(function(m){ return '<option'+(m===method?' selected':'')+'>'+m+'</option>'; }).join('')
          + '</select>'
          + '<input class="dm-url-input" id="dm-'+num+'-url" value="'+esc(url)+'">'
        + '</div>'

        + '<div class="dm-sec">Query params</div>'
        + '<div class="dm-kv-wrap">'
          + '<table class="dm-kv-table"><thead><tr><th style="width:35%">Key</th><th>Value</th><th style="width:28px"></th></tr></thead>'
          + '<tbody id="dm-'+num+'-params">'+paramRows+'</tbody></table>'
          + '<button class="dm-add-kv" onclick="_dmAddKv(\'dm-'+num+'-params\')">+ Add param</button>'
        + '</div>'

        + '<div class="dm-sec">Request headers</div>'
        + '<div class="dm-kv-wrap">'
          + '<table class="dm-kv-table"><thead><tr><th style="width:35%">Key</th><th>Value</th><th style="width:28px"></th></tr></thead>'
          + '<tbody id="dm-'+num+'-headers">'+headerRows+'</tbody></table>'
          + '<button class="dm-add-kv" onclick="_dmAddKv(\'dm-'+num+'-headers\')">+ Add header</button>'
        + '</div>'

        + bodyHtml

        + '<button class="dm-send-btn" id="dm-'+num+'-send" onclick="dmSend('+num+')">'
          + '<div class="dm-send-spin" id="dm-'+num+'-spin"></div>'
          + '<span id="dm-'+num+'-send-txt">▶ Send</span>'
        + '</button>'

      + '</div>'
    + '</div>';
  }

  // ── KV input helpers ───────────────────────────────────────────────────────
  function kvInputRow(num, type, k, v) {
    var tbodyId = 'dm-'+num+'-'+(type==='param'?'params':'headers');
    return '<tr>'
      + '<td><input class="dm-kv-input" placeholder="key" value="'+esc(k)+'"></td>'
      + '<td><input class="dm-kv-input" placeholder="value" value="'+esc(v)+'"></td>'
      + '<td><button class="dm-kv-del" onclick="_dmDelKv(this)" title="Remove">×</button></td>'
    + '</tr>';
  }

  function addKvRow(tbodyId) {
    var tbody = TGE.el(tbodyId);
    if (!tbody) return;
    var tr = document.createElement('tr');
    tr.innerHTML = '<td><input class="dm-kv-input" placeholder="key"></td>'
      + '<td><input class="dm-kv-input" placeholder="value"></td>'
      + '<td><button class="dm-kv-del" onclick="_dmDelKv(this)" title="Remove">×</button></td>';
    tbody.appendChild(tr);
    tr.querySelector('.dm-kv-input').focus();
  }

  function delKvRow(btn) {
    var tr = btn.closest('tr');
    if (tr) tr.remove();
  }

  function getKv(tbodyId) {
    var tbody = TGE.el(tbodyId);
    if (!tbody) return {};
    var out = {};
    tbody.querySelectorAll('tr').forEach(function(tr) {
      var inputs = tr.querySelectorAll('.dm-kv-input');
      var k = inputs[0] ? inputs[0].value.trim() : '';
      var v = inputs[1] ? inputs[1].value.trim() : '';
      if (k) out[k] = v;
    });
    return out;
  }

  // ── Fill attachment into Call 2 ────────────────────────────────────────────
  function fillAttachment(attachmentId, year, month) {
    var urlEl = TGE.el('dm-2-url');
    if (urlEl) urlEl.value = '/api/tn360/v1/attachments/' + attachmentId + '/content';

    var tbody = TGE.el('dm-2-params');
    if (tbody) {
      tbody.querySelectorAll('tr').forEach(function(tr) {
        var inputs = tr.querySelectorAll('.dm-kv-input');
        var k = inputs[0] ? inputs[0].value.trim() : '';
        if (k === 'year'  && inputs[1]) inputs[1].value = year;
        if (k === 'month' && inputs[1]) inputs[1].value = month;
      });
    }

    // Open panel 2
    var p2 = TGE.el('dm-panel-2');
    if (p2) p2.classList.remove('collapsed');
    p2 && p2.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  // ── Toggle helpers ─────────────────────────────────────────────────────────
  function toggleSection(el) {
    var sec = el.closest('.dm-section');
    if (sec) sec.classList.toggle('collapsed');
  }

  function toggleResult(el) {
    var res = el.closest('.dm-result');
    if (res) res.classList.toggle('collapsed');
  }

  // ── Send a call ────────────────────────────────────────────────────────────
  window.dmSend = async function(num) {
    var method  = (TGE.el('dm-'+num+'-method')||{}).value || 'GET';
    var baseUrl = ((TGE.el('dm-'+num+'-url')||{}).value||'').trim();
    var params  = getKv('dm-'+num+'-params');
    var hdrs    = getKv('dm-'+num+'-headers');
    var bodyEl  = TGE.el('dm-'+num+'-body');
    var bodyRaw = bodyEl ? bodyEl.value.trim() : '';
    var token   = ((TGE.el('dm-token')||{}).value||'').trim();

    if (!baseUrl) return;

    // Build full URL with query string
    var qParts = [];
    Object.keys(params).forEach(function(k) {
      if (k) qParts.push(encodeURIComponent(k) + '=' + params[k]);
    });
    var fullUrl = qParts.length ? baseUrl + '?' + qParts.join('&') : baseUrl;

    // Build headers — inject token if provided
    var fetchHeaders = {};
    Object.keys(hdrs).forEach(function(k) { if (k && hdrs[k]) fetchHeaders[k] = hdrs[k]; });
    if (!fetchHeaders['Content-Type']) fetchHeaders['Content-Type'] = 'application/json';
    if (token) fetchHeaders['X-TN360-Token'] = token;

    // Fetch options
    var fetchOpts = { method: method, credentials: 'include', headers: fetchHeaders };
    if ((method === 'POST' || method === 'PUT') && bodyRaw) fetchOpts.body = bodyRaw;

    // UI loading state
    var sendBtn  = TGE.el('dm-'+num+'-send');
    var sendSpin = TGE.el('dm-'+num+'-spin');
    var sendTxt  = TGE.el('dm-'+num+'-send-txt');
    if (sendBtn)  sendBtn.disabled = true;
    if (sendBtn)  sendBtn.classList.add('loading');
    if (sendSpin) sendSpin.style.display = 'block';
    if (sendTxt)  sendTxt.textContent = 'Sending…';

    // Hide empty state
    var empty = TGE.el('dm-diag-empty');
    if (empty) empty.style.display = 'none';

    // Add pending result block
    resultCount++;
    var rid    = 'dm-res-' + resultCount;
    var rNum   = resultCount;
    var rBlock = buildPendingResult(rid, rNum, num, method, fullUrl);
    var panel  = TGE.el('dm-diag-panel');
    if (panel) panel.insertBefore(rBlock, panel.firstChild);

    var start = Date.now();
    var status = 0;
    var data   = null;
    var rawText = '';

    try {
      var res = await fetch(fullUrl, fetchOpts);
      status  = res.status;
      rawText = await res.text();
      try { data = JSON.parse(rawText); } catch(e) { data = null; }
    } catch(e) {
      rawText = e.message;
      data    = { error: e.message };
    }

    var ms = Date.now() - start;

    // Update result block
    updateResult(rid, rNum, num, method, fullUrl, status, ms,
      fetchHeaders, params, bodyRaw, data, rawText);

    // Reset button
    if (sendBtn)  sendBtn.disabled = false;
    if (sendBtn)  sendBtn.classList.remove('loading');
    if (sendSpin) sendSpin.style.display = 'none';
    if (sendTxt)  sendTxt.textContent = '▶ Send';
  };

  // ── Pending result block ───────────────────────────────────────────────────
  function buildPendingResult(rid, rNum, callNum, method, url) {
    var div = document.createElement('div');
    div.className = 'dm-result';
    div.id = rid;
    div.innerHTML = '<div class="dm-result-hdr" onclick="_dmToggleResult(this)">'
      + '<div class="dm-result-num dm-result-num-pending">'+rNum+'</div>'
      + '<div style="flex:1;margin-left:8px;">'
        + '<div class="dm-result-title">Call '+callNum+' — '+esc(method)+'</div>'
        + '<div class="dm-result-meta">'+esc(url)+'</div>'
      + '</div>'
      + '<span class="dm-badge dm-badge-pending" id="'+rid+'-badge">Sending…</span>'
      + '<span class="dm-result-chev">›</span>'
    + '</div>'
    + '<div class="dm-result-body" id="'+rid+'-body">'
      + '<div class="dm-timing">Waiting for response…</div>'
    + '</div>';
    return div;
  }

  // ── Update result block with full data ────────────────────────────────────
  function updateResult(rid, rNum, callNum, method, url, status, ms, headers, params, reqBody, data, rawText) {
    var block = TGE.el(rid);
    if (!block) return;

    var ok      = status >= 200 && status < 300;
    var numCls  = ok ? 'dm-result-num-ok' : 'dm-result-num-err';
    var badgeCls = ok ? 'dm-badge-ok' : 'dm-badge-err';
    var badgeTxt = status === 0 ? 'Error' : 'HTTP '+status;

    // Extract useful things from response
    var attachments = [];
    var s3url       = null;

    if (data && typeof data === 'object') {
      // Call 1 — events with attachments
      var events = data.events || (Array.isArray(data) ? data : []);
      events.forEach(function(ev) {
        (ev.attachments || []).forEach(function(att) {
          attachments.push({ att: att, ev: ev });
        });
      });
      // Call 2 — presigned URL
      if (data.attachmentLink) s3url = data.attachmentLink;
    }

    // Build header KV display
    var hdrRows = Object.keys(headers).map(function(k) {
      var v = k === 'X-TN360-Token' ? '••••••••' : headers[k];
      return '<div class="dm-kv-display-row"><span class="dm-kv-display-key">'+esc(k)+'</span><span class="dm-kv-display-val">'+esc(v)+'</span></div>';
    }).join('');

    // Build params display
    var paramRows = Object.keys(params).map(function(k) {
      return '<div class="dm-kv-display-row"><span class="dm-kv-display-key">'+esc(k)+'</span><span class="dm-kv-display-val">'+esc(params[k])+'</span></div>';
    }).join('') || '<div style="padding:8px 12px;font-size:11px;color:var(--muted);">None</div>';

    // Attachment quick-pick
    var attHtml = '';
    if (attachments.length) {
      var rows = attachments.map(function(item) {
        var att = item.att;
        var d   = new Date(att.timeAt || '');
        var yr  = d.getFullYear() || new Date().getFullYear();
        var mo  = (d.getMonth()+1) || 1;
        var fmt = att.timeAt ? d.toLocaleString('en-AU',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
        return '<div class="dm-att-row" onclick="_dmFillAttachment(\''+att.attachmentId+'\',\''+yr+'\',\''+mo+'\')">'
          + '<span class="dm-att-pos">'+esc(att.cameraPosition||'?')+'</span>'
          + '<span class="dm-att-id">'+esc(att.attachmentId)+'</span>'
          + '<span class="dm-att-time">'+esc(fmt)+'</span>'
          + '<span class="dm-att-arrow">→ Call 2</span>'
        + '</div>';
      }).join('');
      attHtml = buildSection('📎 Attachments ('+attachments.length+') — click any to load into Call 2', rows, false);
    }

    // S3 URL + image
    var s3Html = '';
    if (s3url) {
      s3Html = '<div class="dm-s3-label" style="margin-top:10px;">Fresh presigned S3 URL</div>'
        + '<div class="dm-s3-box">'+esc(s3url)+'</div>'
        + '<div class="dm-s3-label" style="margin-top:12px;">Image preview</div>'
        + '<div class="dm-img-preview">'
          + '<img src="/api/image-proxy?url='+encodeURIComponent(s3url)+'" alt="snapshot"'
          + ' onerror="this.parentElement.innerHTML=\'<p style=&quot;padding:20px;font-size:12px;color:var(--danger);&quot;>Image failed to load via proxy.</p>\'">'
        + '</div>';
    }

    // Update header
    var hdr = block.querySelector('.dm-result-hdr');
    if (hdr) {
      hdr.innerHTML = '<div class="dm-result-num '+numCls+'">'+rNum+'</div>'
        + '<div style="flex:1;margin-left:8px;">'
          + '<div class="dm-result-title">Call '+callNum+' — '+esc(method)+'</div>'
          + '<div class="dm-result-meta">'+esc(url)+'</div>'
        + '</div>'
        + '<span class="dm-badge '+badgeCls+'">'+esc(badgeTxt)+'</span>'
        + '<span class="dm-timing" style="margin-left:8px;"><strong>'+ms+'ms</strong></span>'
        + '<span class="dm-result-chev">›</span>';
      hdr.onclick = function() { toggleResult(hdr); };
    }

    // Update body
    var body = TGE.el(rid+'-body');
    if (body) {
      body.innerHTML = '<div class="dm-timing" style="padding:8px 0;">'
          + '<span class="dm-badge '+badgeCls+'">'+esc(badgeTxt)+'</span>'
          + '<strong style="margin-left:8px;">'+ms+'ms</strong>'
          + '<span style="color:var(--muted);margin-left:4px;">response time</span>'
        + '</div>'

        // Request sent — headers
        + buildSection('📤 Request headers sent', '<div class="dm-kv-display">'+hdrRows+'</div>', true)

        // Request sent — params
        + buildSection('📤 Query params sent', '<div class="dm-kv-display">'+paramRows+'</div>', true)

        // Request sent — body
        + (reqBody ? buildSection('📤 Request body sent', '<div class="dm-raw">'+esc(reqBody)+'</div>', true) : '')

        // Attachments quick pick
        + attHtml

        // S3 URL + image
        + s3Html

        // Raw response
        + buildSection('📥 Raw response', '<div class="dm-raw">'+esc(typeof rawText === 'string' ? rawText : JSON.stringify(data,null,2))+'</div>', false);
    }
  }

  // ── Build collapsible section ──────────────────────────────────────────────
  function buildSection(title, content, collapsed) {
    var id = 'dmsec-' + (++resultCount);
    return '<div class="dm-section'+(collapsed?' collapsed':'').trim()+'" id="'+id+'">'
      + '<div class="dm-section-hdr" onclick="_dmToggleSection(this)">'
        + esc(title)
        + '<span class="dm-sec-chev">›</span>'
      + '</div>'
      + '<div class="dm-section-body">'+content+'</div>'
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
