// TGE Asset Snapshot — API Workbench
// public/diag-manual.js

(function () {
  'use strict';

  var resultSeq = 0;
  var results   = []; // all result records

  // ── Styles ──────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('dm-styles')) return;
    var s = document.createElement('style');
    s.id = 'dm-styles';
    s.textContent = [
      // Root layout
      '.dm{display:grid;grid-template-columns:400px 1fr;margin:-20px;height:calc(100vh - 52px);overflow:hidden;font-size:13px;}',

      // Left — builder
      '.dm-left{display:flex;flex-direction:column;border-right:2px solid var(--line);background:var(--surface);overflow:hidden;}',
      '.dm-left-hdr{padding:12px 16px;background:var(--green-900);border-bottom:2px solid var(--yellow);flex-shrink:0;}',
      '.dm-left-hdr h2{font-size:13px;font-weight:700;color:#fff;margin-bottom:2px;}',
      '.dm-left-hdr p{font-size:10px;color:rgba(255,255,255,0.45);}',
      '.dm-left-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:14px;}',

      // Right — diagnostics
      '.dm-right{display:flex;flex-direction:column;background:var(--surface-2);overflow:hidden;}',
      '.dm-right-hdr{padding:10px 16px;background:var(--surface);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;flex-shrink:0;}',
      '.dm-right-hdr h2{font-size:13px;font-weight:700;color:var(--ink);flex:1;}',
      '.dm-right-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;}',

      // Section blocks
      '.dm-block{background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden;}',
      '.dm-block-hdr{padding:8px 12px;background:var(--surface-2);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;}',
      '.dm-block-hdr:hover{background:var(--surface-3);}',
      '.dm-block-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);flex:1;}',
      '.dm-block-chev{font-size:16px;color:var(--muted-2);transition:transform 0.15s;line-height:1;}',
      '.dm-block.closed .dm-block-chev{transform:rotate(-90deg);}',
      '.dm-block.closed .dm-block-body{display:none;}',
      '.dm-block-body{padding:10px 12px;display:flex;flex-direction:column;gap:8px;}',

      // Labels
      '.dm-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);margin-bottom:3px;}',

      // Inputs
      '.dm-input{width:100%;height:36px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font:inherit;font-size:12px;color:var(--ink);background:var(--surface);transition:border-color 140ms;}',
      '.dm-input:focus{outline:none;border-color:var(--green-600);}',
      '.dm-input::placeholder{color:var(--muted-2);}',
      '.dm-input.mono{font-family:monospace;font-size:11px;}',
      '.dm-input.pass{font-family:monospace;font-size:11px;letter-spacing:0.05em;}',
      '.dm-select{width:100%;height:36px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font:inherit;font-size:12px;color:var(--ink);background:var(--surface);}',
      '.dm-select:focus{outline:none;border-color:var(--green-600);}',
      '.dm-textarea{width:100%;min-height:90px;border:1px solid var(--line);border-radius:7px;padding:8px 10px;font:inherit;font-size:11px;font-family:monospace;color:var(--ink);background:var(--surface);resize:vertical;line-height:1.5;}',
      '.dm-textarea:focus{outline:none;border-color:var(--green-600);}',

      // Row
      '.dm-row{display:flex;gap:6px;align-items:center;}',
      '.dm-row .dm-input{flex:1;}',
      '.dm-col{display:flex;flex-direction:column;gap:3px;}',
      '.dm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}',

      // Method badge
      '.dm-method-wrap{display:flex;gap:6px;}',
      '.dm-method-opt{flex:1;text-align:center;padding:6px 4px;border:1px solid var(--line);border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;transition:all 140ms;background:var(--surface-2);color:var(--muted);}',
      '.dm-method-opt:hover{border-color:var(--green-600);color:var(--green-700);}',
      '.dm-method-opt.active{background:var(--green-700);border-color:var(--green-700);color:var(--yellow);}',

      // KV table
      '.dm-kv{border:1px solid var(--line);border-radius:8px;overflow:hidden;}',
      '.dm-kv-row{display:grid;grid-template-columns:1fr 1fr 28px;border-bottom:1px solid var(--line-2);}',
      '.dm-kv-row:last-child{border-bottom:none;}',
      '.dm-kv-row:first-child{background:var(--surface-2);}',
      '.dm-kv-hdr{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);padding:5px 8px;}',
      '.dm-kv-input{border:none;border-right:1px solid var(--line-2);padding:6px 8px;font:inherit;font-size:11px;font-family:monospace;color:var(--ink);background:transparent;width:100%;}',
      '.dm-kv-input:focus{outline:none;background:var(--green-50);}',
      '.dm-kv-del{border:none;background:none;color:var(--muted-2);cursor:pointer;font-size:16px;padding:0;display:flex;align-items:center;justify-content:center;}',
      '.dm-kv-del:hover{color:var(--danger);}',
      '.dm-kv-add{width:100%;border:none;background:none;padding:6px 10px;font-size:11px;color:var(--green-600);font-weight:600;cursor:pointer;text-align:left;border-top:1px solid var(--line-2);}',
      '.dm-kv-add:hover{background:var(--green-50);}',

      // Body type tabs
      '.dm-body-tabs{display:flex;gap:4px;margin-bottom:6px;}',
      '.dm-body-tab{padding:4px 10px;border-radius:6px;border:1px solid var(--line);font-size:11px;font-weight:600;cursor:pointer;color:var(--muted);background:var(--surface-2);}',
      '.dm-body-tab.active{background:var(--green-700);border-color:var(--green-700);color:var(--yellow);}',

      // Send button
      '.dm-send{width:100%;height:40px;border:none;border-radius:8px;background:var(--green-700);color:var(--yellow);font:inherit;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:background 140ms;}',
      '.dm-send:hover{background:var(--green-800);}',
      '.dm-send:disabled{opacity:0.4;cursor:not-allowed;}',
      '.dm-spin{width:13px;height:13px;border:2px solid rgba(212,240,38,0.3);border-top-color:var(--yellow);border-radius:50%;animation:dm-s 0.7s linear infinite;}',
      '@keyframes dm-s{to{transform:rotate(360deg);}}',

      // Inject buttons
      '.dm-inject{font-size:10px;font-weight:700;padding:3px 8px;border-radius:5px;border:1px solid var(--green-600);background:var(--green-50);color:var(--green-700);cursor:pointer;white-space:nowrap;}',
      '.dm-inject:hover{background:var(--green-100);}',

      // Filter bar
      '.dm-filter{display:flex;align-items:center;gap:8px;}',
      '.dm-filter-input{flex:1;height:30px;border:1px solid var(--line);border-radius:6px;padding:0 8px;font:inherit;font-size:11px;color:var(--ink);background:var(--surface);}',
      '.dm-filter-input:focus{outline:none;border-color:var(--green-600);}',
      '.dm-clear-btn{height:30px;padding:0 12px;border:1px solid var(--line);border-radius:6px;font:inherit;font-size:11px;font-weight:600;cursor:pointer;background:var(--danger-bg);color:var(--danger);border-color:rgba(192,57,43,0.3);}',
      '.dm-clear-btn:hover{background:rgba(192,57,43,0.12);}',

      // Result cards
      '.dm-result{background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden;}',
      '.dm-result-hdr{padding:10px 14px;display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;transition:background 140ms;}',
      '.dm-result-hdr:hover{background:var(--surface-2);}',
      '.dm-result.closed .dm-result-body{display:none;}',
      '.dm-result.closed .dm-rchev{transform:rotate(-90deg);}',
      '.dm-rchev{font-size:16px;color:var(--muted-2);transition:transform 0.15s;line-height:1;margin-left:auto;}',
      '.dm-result-body{border-top:1px solid var(--line);}',

      // Result sections (sent / received)
      '.dm-rsec{border-bottom:1px solid var(--line-2);}',
      '.dm-rsec:last-child{border-bottom:none;}',
      '.dm-rsec-hdr{padding:8px 14px;display:flex;align-items:center;gap:8px;cursor:pointer;background:var(--surface-2);user-select:none;}',
      '.dm-rsec-hdr:hover{background:var(--surface-3);}',
      '.dm-rsec.closed .dm-rsec-body{display:none;}',
      '.dm-rsec.closed .dm-schev{transform:rotate(-90deg);}',
      '.dm-schev{font-size:14px;color:var(--muted-2);transition:transform 0.15s;line-height:1;margin-left:auto;}',
      '.dm-rsec-title{font-size:11px;font-weight:700;color:var(--ink-2);}',
      '.dm-rsec-body{padding:10px 14px;}',

      // Raw display
      '.dm-raw{background:var(--surface-3);border:1px solid var(--line);border-radius:7px;padding:9px 11px;font-family:monospace;font-size:10px;color:var(--ink-2);white-space:pre-wrap;word-break:break-all;max-height:300px;overflow-y:auto;line-height:1.6;}',

      // KV display (read-only)
      '.dm-kvd{display:flex;flex-direction:column;gap:3px;}',
      '.dm-kvd-row{display:flex;gap:8px;font-size:11px;font-family:monospace;padding:3px 0;border-bottom:1px solid var(--line-2);}',
      '.dm-kvd-row:last-child{border-bottom:none;}',
      '.dm-kvd-k{color:var(--green-700);font-weight:700;min-width:160px;flex-shrink:0;}',
      '.dm-kvd-v{color:var(--ink-2);word-break:break-all;}',

      // Badges
      '.dm-badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;}',
      '.dm-ok{background:var(--green-100);color:var(--green-700);}',
      '.dm-err{background:var(--danger-bg);color:var(--danger);}',
      '.dm-warn{background:rgba(180,83,9,0.1);color:var(--warning);}',
      '.dm-gray{background:var(--surface-3);color:var(--muted);}',

      // S3 box
      '.dm-s3{background:var(--green-50);border:1px solid rgba(0,166,81,0.3);border-radius:8px;padding:10px 12px;font-family:monospace;font-size:10px;color:var(--green-700);word-break:break-all;line-height:1.6;margin-bottom:10px;}',

      // Image
      '.dm-img{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;min-height:160px;}',
      '.dm-img img{max-width:100%;max-height:420px;object-fit:contain;display:block;}',

      // Attachment rows
      '.dm-atts{display:flex;flex-direction:column;gap:5px;margin-top:8px;}',
      '.dm-att{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;border:1px solid var(--line);background:var(--surface-2);cursor:pointer;transition:all 140ms;}',
      '.dm-att:hover{background:var(--green-50);border-color:var(--green-600);}',
      '.dm-att-pos{font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:var(--green-100);color:var(--green-700);min-width:110px;text-align:center;flex-shrink:0;}',
      '.dm-att-id{font-family:monospace;font-size:11px;color:var(--ink-2);flex:1;}',
      '.dm-att-t{font-size:10px;color:var(--muted);flex-shrink:0;}',
      '.dm-att-arr{font-size:11px;color:var(--green-600);font-weight:700;flex-shrink:0;}',

      // Empty
      '.dm-empty{text-align:center;padding:48px 20px;color:var(--muted-2);}',
      '.dm-empty-icon{font-size:36px;margin-bottom:10px;}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-diag-manual');
    if (!view) return;
    injectStyles();

    view.innerHTML = [
      '<div class="dm">',

        // ── LEFT ──
        '<div class="dm-left">',
          '<div class="dm-left-hdr">',
            '<h2>API Workbench</h2>',
            '<p>Build and send TN360 API calls — all requests and responses logged on the right</p>',
          '</div>',
          '<div class="dm-left-body">',

            // Auth
            '<div class="dm-block" id="dm-blk-auth">',
              '<div class="dm-block-hdr" onclick="dmToggleBlock(\'dm-blk-auth\')">',
                '<span class="dm-block-title">Auth</span>',
                '<span class="dm-block-chev">›</span>',
              '</div>',
              '<div class="dm-block-body">',
                '<div class="dm-col">',
                  '<div class="dm-lbl">TN360 Session Token <span style="font-weight:400;text-transform:none;letter-spacing:0;">(X-TN360-Token header)</span></div>',
                  '<input class="dm-input pass" id="dm-token" type="password" placeholder="Paste token from DevTools → api-au.telematics.com → Authorization">',
                '</div>',
              '</div>',
            '</div>',

            // Common IDs
            '<div class="dm-block" id="dm-blk-ids">',
              '<div class="dm-block-hdr" onclick="dmToggleBlock(\'dm-blk-ids\')">',
                '<span class="dm-block-title">Common IDs &amp; Values</span>',
                '<span class="dm-block-chev">›</span>',
              '</div>',
              '<div class="dm-block-body">',
                '<p style="font-size:10px;color:var(--muted);margin-bottom:2px;">Fill these in — use the inject buttons to insert them into the URL or body below.</p>',
                '<div class="dm-grid2">',
                  dmField('dm-id-vehicle',   'Vehicle ID',    '381634'),
                  dmField('dm-id-device',    'Device ID',     '518241'),
                  dmField('dm-id-event',     'Event ID',      ''),
                  dmField('dm-id-attachment','Attachment ID', ''),
                  dmField('dm-id-year',      'Year',          new Date().getFullYear()),
                  dmField('dm-id-month',     'Month',         new Date().getMonth()+1),
                  dmField('dm-id-from',      'From (AEST)',   '2026-06-01T00:00:00%2B10:00'),
                  dmField('dm-id-to',        'To (AEST)',     '2026-06-26T23:59:59%2B10:00'),
                '</div>',
                '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">',
                  '<button class="dm-inject" onclick="dmInjectUrl()">→ Inject into URL</button>',
                  '<button class="dm-inject" onclick="dmInjectBody()">→ Inject into Body</button>',
                  '<button class="dm-inject" onclick="dmInjectParams()">→ Inject into Params</button>',
                '</div>',
              '</div>',
            '</div>',

            // Request builder
            '<div class="dm-block" id="dm-blk-req">',
              '<div class="dm-block-hdr" onclick="dmToggleBlock(\'dm-blk-req\')">',
                '<span class="dm-block-title">Request</span>',
                '<span class="dm-block-chev">›</span>',
              '</div>',
              '<div class="dm-block-body">',

                // Method
                '<div class="dm-col">',
                  '<div class="dm-lbl">HTTP Method</div>',
                  '<div class="dm-method-wrap">',
                    '<div class="dm-method-opt active" data-m="GET"    onclick="dmSetMethod(\'GET\')">GET</div>',
                    '<div class="dm-method-opt"         data-m="POST"   onclick="dmSetMethod(\'POST\')">POST</div>',
                    '<div class="dm-method-opt"         data-m="PUT"    onclick="dmSetMethod(\'PUT\')">PUT</div>',
                    '<div class="dm-method-opt"         data-m="DELETE" onclick="dmSetMethod(\'DELETE\')">DELETE</div>',
                  '</div>',
                '</div>',

                // URL
                '<div class="dm-col">',
                  '<div class="dm-lbl">URL / Path</div>',
                  '<input class="dm-input mono" id="dm-url" value="/api/tn360/v1/devices/events/camera/snapshots" placeholder="/api/tn360/v1/...">',
                  '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">',
                    dmQuick('Events',      '/api/tn360/v1/devices/events/camera/snapshots'),
                    dmQuick('Attachment',  '/api/tn360/v1/attachments/ATTACHMENT_ID/content'),
                    dmQuick('Vehicles',    '/api/tn360/v1/vehicles'),
                    dmQuick('Cameras',     '/api/tn360/cameras/DEVICE_ID/status'),
                  '</div>',
                '</div>',

                // Query params
                '<div class="dm-col">',
                  '<div class="dm-lbl">Query Params</div>',
                  '<div class="dm-kv" id="dm-params-wrap">',
                    '<div class="dm-kv-row"><span class="dm-kv-hdr">Key</span><span class="dm-kv-hdr">Value</span><span></span></div>',
                    '<div id="dm-params"></div>',
                    '<button class="dm-kv-add" onclick="dmAddKv(\'dm-params\')">+ Add param</button>',
                  '</div>',
                '</div>',

                // Headers
                '<div class="dm-col">',
                  '<div class="dm-lbl">Additional Headers <span style="font-weight:400;text-transform:none;">(token auto-added)</span></div>',
                  '<div class="dm-kv" id="dm-headers-wrap">',
                    '<div class="dm-kv-row"><span class="dm-kv-hdr">Key</span><span class="dm-kv-hdr">Value</span><span></span></div>',
                    '<div id="dm-headers"></div>',
                    '<button class="dm-kv-add" onclick="dmAddKv(\'dm-headers\')">+ Add header</button>',
                  '</div>',
                '</div>',

                // Body
                '<div class="dm-col" id="dm-body-wrap">',
                  '<div class="dm-lbl">Request Body</div>',
                  '<div class="dm-body-tabs">',
                    '<div class="dm-body-tab active" onclick="dmBodyTab(\'json\',this)">JSON</div>',
                    '<div class="dm-body-tab" onclick="dmBodyTab(\'none\',this)">None</div>',
                  '</div>',
                  '<textarea class="dm-textarea" id="dm-body" rows="6">{\n  "vehicles": ["381634"],\n  "devices": ["518241"],\n  "orderField": "EventTime",\n  "orderDirection": "desc",\n  "rowCountLimit": 25,\n  "rowOffset": 0,\n  "latestOnly": false\n}</textarea>',
                '</div>',

              '</div>',
            '</div>',

            // Send
            '<button class="dm-send" id="dm-send" onclick="dmSend()">',
              '<span id="dm-send-txt">▶ Send Request</span>',
            '</button>',

          '</div>',
        '</div>',

        // ── RIGHT ──
        '<div class="dm-right">',
          '<div class="dm-right-hdr">',
            '<h2>Diagnostics Log</h2>',
            '<div class="dm-filter">',
              '<input class="dm-filter-input" id="dm-filter" placeholder="Filter results…" oninput="dmFilter()">',
              '<button class="dm-clear-btn" onclick="dmClearResults()">Clear all</button>',
            '</div>',
          '</div>',
          '<div class="dm-right-body" id="dm-results">',
            '<div class="dm-empty" id="dm-empty">',
              '<div class="dm-empty-icon">🔬</div>',
              '<p>Send a request — every call, response and parsed data appears here.<br>Results persist across calls so you can compare.</p>',
            '</div>',
          '</div>',
        '</div>',

      '</div>',
    ].join('');

    // Set default method
    window._dmMethod = 'GET';

    // Expose globals
    window.dmToggleBlock  = dmToggleBlock;
    window.dmSetMethod    = dmSetMethod;
    window.dmAddKv        = dmAddKv;
    window.dmDelKv        = dmDelKv;
    window.dmSend         = dmSend;
    window.dmFilter       = dmFilter;
    window.dmClearResults = dmClearResults;
    window.dmBodyTab      = dmBodyTab;
    window.dmInjectUrl    = dmInjectUrl;
    window.dmInjectBody   = dmInjectBody;
    window.dmInjectParams = dmInjectParams;
    window.dmSetUrl       = dmSetUrl;
    window.dmFillAtt      = dmFillAtt;
    window.dmToggleResult = dmToggleResult;
    window.dmToggleRsec   = dmToggleRsec;
  }

  // ── Field helpers ───────────────────────────────────────────────────────────
  function dmField(id, label, val) {
    return '<div class="dm-col"><div class="dm-lbl">'+esc(label)+'</div>'
      + '<input class="dm-input mono" id="'+id+'" value="'+esc(val)+'" placeholder="'+esc(label)+'"></div>';
  }

  function dmQuick(label, url) {
    return '<button class="dm-inject" onclick="dmSetUrl(\''+esc(url)+'\')">'+esc(label)+'</button>';
  }

  // ── Toggle block ────────────────────────────────────────────────────────────
  function dmToggleBlock(id) {
    var el = TGE.el(id);
    if (el) el.classList.toggle('closed');
  }

  // ── Method selector ─────────────────────────────────────────────────────────
  function dmSetMethod(m) {
    window._dmMethod = m;
    document.querySelectorAll('.dm-method-opt').forEach(function(el) {
      el.classList.toggle('active', el.getAttribute('data-m') === m);
    });
  }

  // ── Set URL ─────────────────────────────────────────────────────────────────
  function dmSetUrl(url) {
    var el = TGE.el('dm-url');
    if (el) el.value = url;
  }

  // ── Body tab ────────────────────────────────────────────────────────────────
  function dmBodyTab(type, btn) {
    document.querySelectorAll('.dm-body-tab').forEach(function(t){ t.classList.remove('active'); });
    btn.classList.add('active');
    var bw = TGE.el('dm-body');
    if (bw) bw.style.display = type === 'none' ? 'none' : '';
  }

  // ── KV helpers ───────────────────────────────────────────────────────────────
  function dmAddKv(containerId) {
    var c = TGE.el(containerId);
    if (!c) return;
    var row = document.createElement('div');
    row.className = 'dm-kv-row';
    row.innerHTML = '<input class="dm-kv-input" placeholder="key">'
      + '<input class="dm-kv-input" placeholder="value">'
      + '<button class="dm-kv-del" onclick="dmDelKv(this)">×</button>';
    c.appendChild(row);
    row.querySelector('.dm-kv-input').focus();
  }

  function dmDelKv(btn) {
    var row = btn.closest('.dm-kv-row');
    if (row) row.remove();
  }

  function getKv(containerId) {
    var c = TGE.el(containerId);
    if (!c) return {};
    var out = {};
    c.querySelectorAll('.dm-kv-row').forEach(function(row) {
      var inputs = row.querySelectorAll('.dm-kv-input');
      var k = inputs[0] ? inputs[0].value.trim() : '';
      var v = inputs[1] ? inputs[1].value.trim() : '';
      if (k) out[k] = v;
    });
    return out;
  }

  // ── Inject helpers ──────────────────────────────────────────────────────────
  function getIds() {
    return {
      vehicle:    val('dm-id-vehicle'),
      device:     val('dm-id-device'),
      event:      val('dm-id-event'),
      attachment: val('dm-id-attachment'),
      year:       val('dm-id-year'),
      month:      val('dm-id-month'),
      from:       val('dm-id-from'),
      to:         val('dm-id-to'),
    };
  }

  function val(id) {
    var el = TGE.el(id);
    return el ? el.value.trim() : '';
  }

  function dmInjectUrl() {
    var ids = getIds();
    var urlEl = TGE.el('dm-url');
    if (!urlEl) return;
    var u = urlEl.value;
    if (ids.attachment) u = u.replace('ATTACHMENT_ID', ids.attachment);
    if (ids.device)     u = u.replace('DEVICE_ID', ids.device);
    if (ids.vehicle)    u = u.replace('VEHICLE_ID', ids.vehicle);
    if (ids.event)      u = u.replace('EVENT_ID', ids.event);
    urlEl.value = u;
  }

  function dmInjectBody() {
    var ids = getIds();
    var bodyEl = TGE.el('dm-body');
    if (!bodyEl) return;
    try {
      var obj = JSON.parse(bodyEl.value || '{}');
      if (ids.vehicle)    { obj.vehicles = [ids.vehicle]; }
      if (ids.device)     { obj.devices  = [ids.device];  }
      if (ids.attachment) { obj.attachmentId = ids.attachment; }
      if (ids.from)       { obj.from = ids.from; }
      if (ids.to)         { obj.to   = ids.to;   }
      if (ids.year)       { obj.year  = parseInt(ids.year);  }
      if (ids.month)      { obj.month = parseInt(ids.month); }
      bodyEl.value = JSON.stringify(obj, null, 2);
    } catch(e) {
      alert('Body is not valid JSON — edit it manually.');
    }
  }

  function dmInjectParams() {
    var ids = getIds();
    var c = TGE.el('dm-params');
    if (!c) return;
    function setParam(k, v) {
      if (!v) return;
      var rows = c.querySelectorAll('.dm-kv-row');
      var found = false;
      rows.forEach(function(row) {
        var inputs = row.querySelectorAll('.dm-kv-input');
        if (inputs[0] && inputs[0].value.trim() === k) {
          if (inputs[1]) inputs[1].value = v;
          found = true;
        }
      });
      if (!found) {
        var row = document.createElement('div');
        row.className = 'dm-kv-row';
        row.innerHTML = '<input class="dm-kv-input" value="'+esc(k)+'">'
          + '<input class="dm-kv-input" value="'+esc(v)+'">'
          + '<button class="dm-kv-del" onclick="dmDelKv(this)">×</button>';
        c.appendChild(row);
      }
    }
    if (ids.from)  setParam('from',  ids.from);
    if (ids.to)    setParam('to',    ids.to);
    if (ids.year)  setParam('year',  ids.year);
    if (ids.month) setParam('month', ids.month);
    if (ids.attachment) setParam('attachmentId', ids.attachment);
  }

  // ── Fill attachment from result ─────────────────────────────────────────────
  function dmFillAtt(attachmentId, year, month, position) {
    // Fill IDs panel
    var aEl = TGE.el('dm-id-attachment');
    var yEl = TGE.el('dm-id-year');
    var mEl = TGE.el('dm-id-month');
    if (aEl) aEl.value = attachmentId;
    if (yEl) yEl.value = year;
    if (mEl) mEl.value = month;

    // Set URL to attachment endpoint
    var urlEl = TGE.el('dm-url');
    if (urlEl) urlEl.value = '/api/tn360/v1/attachments/' + attachmentId + '/content';

    // Set method to GET
    dmSetMethod('GET');

    // Set params
    var c = TGE.el('dm-params');
    if (c) {
      c.innerHTML = '';
      [['pruning','WEB'],['thumbnail','false'],['year',year],['month',month],['presigned','true']].forEach(function(p) {
        var row = document.createElement('div');
        row.className = 'dm-kv-row';
        row.innerHTML = '<input class="dm-kv-input" value="'+esc(p[0])+'">'
          + '<input class="dm-kv-input" value="'+esc(p[1])+'">'
          + '<button class="dm-kv-del" onclick="dmDelKv(this)">×</button>';
        c.appendChild(row);
      });
    }

    // Clear body
    var bodyEl = TGE.el('dm-body');
    if (bodyEl) bodyEl.value = '';

    // Scroll left panel to top
    var left = document.querySelector('.dm-left-body');
    if (left) left.scrollTop = 0;
  }

  // ── Send ────────────────────────────────────────────────────────────────────
  async function dmSend() {
    var method  = window._dmMethod || 'GET';
    var baseUrl = val('dm-url');
    var token   = val('dm-token');
    var params  = getKv('dm-params');
    var hdrs    = getKv('dm-headers');
    var bodyEl  = TGE.el('dm-body');
    var bodyRaw = (bodyEl && bodyEl.style.display !== 'none') ? bodyEl.value.trim() : '';

    if (!baseUrl) { alert('Enter a URL.'); return; }

    // Build query string
    var qParts = [];
    Object.keys(params).forEach(function(k) {
      if (k) qParts.push(encodeURIComponent(k) + '=' + params[k]);
    });
    var fullUrl = qParts.length ? baseUrl + '?' + qParts.join('&') : baseUrl;

    // Build headers
    var fetchHdrs = { 'Content-Type': 'application/json' };
    Object.keys(hdrs).forEach(function(k) { if (k && hdrs[k]) fetchHdrs[k] = hdrs[k]; });
    if (token) fetchHdrs['X-TN360-Token'] = token;

    // Fetch opts
    var opts = { method: method, credentials: 'include', headers: fetchHdrs };
    if ((method === 'POST' || method === 'PUT') && bodyRaw) opts.body = bodyRaw;

    // Loading state
    var btn = TGE.el('dm-send');
    var txt = TGE.el('dm-send-txt');
    if (btn) btn.disabled = true;
    if (txt) txt.textContent = 'Sending…';

    var empty = TGE.el('dm-empty');
    if (empty) empty.style.display = 'none';

    // Add pending card
    resultSeq++;
    var rid   = 'dmr-' + resultSeq;
    var rNum  = resultSeq;
    var card  = buildPendingCard(rid, rNum, method, fullUrl);
    var rArea = TGE.el('dm-results');
    if (rArea) rArea.insertBefore(card, rArea.firstChild);

    var start   = Date.now();
    var status  = 0;
    var rawText = '';
    var data    = null;

    try {
      var res = await fetch(fullUrl, opts);
      status  = res.status;
      rawText = await res.text();
      try { data = JSON.parse(rawText); } catch(e) { data = null; }
    } catch(e) {
      rawText = 'Fetch error: ' + e.message;
      data    = { error: e.message };
    }

    var ms = Date.now() - start;

    // Store result
    results.push({ id: rid, num: rNum, method: method, url: fullUrl,
      status: status, ms: ms, reqHdrs: fetchHdrs, reqParams: params,
      reqBody: bodyRaw, data: data, raw: rawText });

    // Update card
    updateCard(rid, rNum, method, fullUrl, status, ms, fetchHdrs, params, bodyRaw, data, rawText);

    // Reset button
    if (btn) btn.disabled = false;
    if (txt) txt.textContent = '▶ Send Request';
  }

  // ── Build pending card ──────────────────────────────────────────────────────
  function buildPendingCard(rid, rNum, method, url) {
    var div = document.createElement('div');
    div.className = 'dm-result';
    div.id = rid;
    div.innerHTML = '<div class="dm-result-hdr" onclick="dmToggleResult(this)">'
      + '<span class="dm-badge dm-warn">#'+rNum+'</span>'
      + '<span style="margin-left:6px;font-size:12px;font-weight:700;color:var(--ink);">'+esc(method)+' '+esc(url)+'</span>'
      + '<span class="dm-badge dm-warn" style="margin-left:auto;">Sending…</span>'
      + '<span class="dm-rchev">›</span>'
    + '</div>'
    + '<div class="dm-result-body" id="'+rid+'-body">'
      + '<div style="padding:12px 14px;font-size:12px;color:var(--muted);">Waiting for response…</div>'
    + '</div>';
    return div;
  }

  // ── Update card with full data ──────────────────────────────────────────────
  function updateCard(rid, rNum, method, url, status, ms, reqHdrs, reqParams, reqBody, data, rawText) {
    var card = TGE.el(rid);
    if (!card) return;

    var ok       = status >= 200 && status < 300;
    var badgeCls = ok ? 'dm-ok' : 'dm-err';
    var statusTxt = status === 0 ? 'Error' : 'HTTP '+status;

    // Parse useful data from response
    var events      = [];
    var attachments = [];
    var s3url       = null;

    if (data && typeof data === 'object') {
      events = data.events || (Array.isArray(data) ? data : []);
      events.forEach(function(ev) {
        (ev.attachments || []).forEach(function(att) {
          var d   = new Date(att.timeAt || '');
          var yr  = d.getFullYear() || new Date().getFullYear();
          var mo  = d.getMonth() + 1 || 1;
          var fmt = att.timeAt ? d.toLocaleString('en-AU',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
          attachments.push({ att: att, yr: yr, mo: mo, fmt: fmt });
        });
      });
      if (data.attachmentLink) s3url = data.attachmentLink;
    }

    // Header row
    var hdr = card.querySelector('.dm-result-hdr');
    if (hdr) {
      hdr.innerHTML = '<span class="dm-badge '+badgeCls+'">#'+rNum+'</span>'
        + '<span style="margin-left:6px;font-size:12px;font-weight:700;color:var(--ink);">'+esc(method)+' '+esc(url)+'</span>'
        + '<span class="dm-badge '+badgeCls+'" style="margin-left:auto;">'+esc(statusTxt)+'</span>'
        + '<span style="font-size:11px;color:var(--muted);margin-left:8px;">'+ms+'ms</span>'
        + '<span class="dm-rchev">›</span>';
      hdr.onclick = function() { dmToggleResult(hdr); };
    }

    // Body sections
    var body = TGE.el(rid+'-body');
    if (!body) return;

    // — Sent: headers
    var hdrRows = Object.keys(reqHdrs).map(function(k) {
      var v = k === 'X-TN360-Token' ? '••••••••••' : reqHdrs[k];
      return '<div class="dm-kvd-row"><span class="dm-kvd-k">'+esc(k)+'</span><span class="dm-kvd-v">'+esc(v)+'</span></div>';
    }).join('');

    // — Sent: params
    var paramRows = Object.keys(reqParams).length
      ? Object.keys(reqParams).map(function(k) {
          return '<div class="dm-kvd-row"><span class="dm-kvd-k">'+esc(k)+'</span><span class="dm-kvd-v">'+esc(reqParams[k])+'</span></div>';
        }).join('')
      : '<div style="font-size:11px;color:var(--muted);padding:4px 0;">None</div>';

    // — Attachments quick pick
    var attHtml = '';
    if (attachments.length) {
      attHtml = '<div class="dm-atts">'
        + attachments.map(function(item) {
            var att = item.att;
            return '<div class="dm-att" onclick="dmFillAtt(\''+att.attachmentId+'\',\''+item.yr+'\',\''+item.mo+'\',\''+esc(att.cameraPosition||'')+'\')">'
              + '<span class="dm-att-pos">'+esc(att.cameraPosition||'?')+'</span>'
              + '<span class="dm-att-id">'+esc(att.attachmentId)+'</span>'
              + '<span class="dm-att-t">'+esc(item.fmt)+'</span>'
              + '<span class="dm-att-arr">→ Load</span>'
            + '</div>';
          }).join('')
        + '</div>';
    }

    // — S3 URL + image
    var s3Html = '';
    if (s3url) {
      s3Html = '<div class="dm-lbl" style="margin-bottom:4px;">Fresh presigned S3 URL (expires ~1hr)</div>'
        + '<div class="dm-s3">'+esc(s3url)+'</div>'
        + '<div class="dm-lbl" style="margin-bottom:4px;">Image preview</div>'
        + '<div class="dm-img"><img src="/api/image-proxy?url='+encodeURIComponent(s3url)+'" alt="snapshot"'
        + ' onerror="this.parentElement.innerHTML=\'<p style=&quot;padding:16px;font-size:12px;color:var(--danger);&quot;>Image failed via proxy — URL may have expired.</p>\'"></div>';
    }

    body.innerHTML =
      // SENT
      buildRsec('📤 Sent — Request headers', '<div class="dm-kvd">'+hdrRows+'</div>', true)
      + buildRsec('📤 Sent — Query params', '<div class="dm-kvd">'+paramRows+'</div>', true)
      + (reqBody ? buildRsec('📤 Sent — Request body', '<div class="dm-raw">'+esc(reqBody)+'</div>', true) : '')

      // RECEIVED
      + buildRsec('📥 Received — Status &amp; timing',
          '<div style="padding:8px 0;display:flex;gap:12px;align-items:center;">'
            + '<span class="dm-badge '+badgeCls+'">'+esc(statusTxt)+'</span>'
            + '<span style="font-size:12px;color:var(--muted);">Response time: <strong style="color:var(--ink);">'+ms+'ms</strong></span>'
          + '</div>', false)
      + (attachments.length ? buildRsec('📥 Received — Attachments ('+attachments.length+') — click to load', attHtml, false) : '')
      + (s3url ? buildRsec('📥 Received — Presigned URL &amp; Image', s3Html, false) : '')
      + buildRsec('📥 Received — Raw response JSON', '<div class="dm-raw">'+esc(rawText)+'</div>', false);
  }

  // ── Build result section ────────────────────────────────────────────────────
  function buildRsec(title, content, closed) {
    var id = 'dms-'+(++resultSeq);
    return '<div class="dm-rsec'+(closed?' closed':'').trim()+'" id="'+id+'">'
      + '<div class="dm-rsec-hdr" onclick="dmToggleRsec(this)">'
        + '<span class="dm-rsec-title">'+title+'</span>'
        + '<span class="dm-schev">›</span>'
      + '</div>'
      + '<div class="dm-rsec-body">'+content+'</div>'
    + '</div>';
  }

  // ── Toggle helpers ──────────────────────────────────────────────────────────
  function dmToggleResult(el) {
    var card = el.closest('.dm-result');
    if (card) card.classList.toggle('closed');
  }

  function dmToggleRsec(el) {
    var sec = el.closest('.dm-rsec');
    if (sec) sec.classList.toggle('closed');
  }

  // ── Filter ──────────────────────────────────────────────────────────────────
  function dmFilter() {
    var q = (val('dm-filter')||'').toLowerCase();
    document.querySelectorAll('.dm-result').forEach(function(card) {
      card.style.display = (!q || card.textContent.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
  }

  // ── Clear ────────────────────────────────────────────────────────────────────
  function dmClearResults() {
    results = [];
    resultSeq = 0;
    var area = TGE.el('dm-results');
    if (area) area.innerHTML = '<div class="dm-empty" id="dm-empty">'
      + '<div class="dm-empty-icon">🔬</div>'
      + '<p>Send a request — every call, response and parsed data appears here.<br>Results persist across calls so you can compare.</p>'
      + '</div>';
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  // ── Register ─────────────────────────────────────────────────────────────────
  var _orig = TGE.onAppReady;
  TGE.onAppReady = function () {
    if (typeof _orig === 'function') _orig();
    render();
  };

  TGE.onShow['diag-manual'] = function() {};

})();
