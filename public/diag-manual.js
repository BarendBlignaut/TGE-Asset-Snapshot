// TGE Asset Snapshot — API Workbench (DevTools style)
// public/diag-manual.js

(function () {
  'use strict';

  var _method = 'GET';
  var _calls  = [];
  var _seq    = 0;
  var _active = null; // currently expanded call id

  // ── Styles ───────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('dm-styles')) return;
    var s = document.createElement('style');
    s.id = 'dm-styles';
    s.textContent = [
      // Root
      '.dm{display:flex;flex-direction:column;margin:-20px;height:calc(100vh - 52px);overflow:hidden;background:var(--surface-2);font-size:13px;}',

      // ── TOP: request builder ──
      '.dm-builder{background:var(--surface);border-bottom:2px solid var(--green-600);flex-shrink:0;display:flex;flex-direction:column;}',
      '.dm-builder-hdr{padding:10px 16px;background:var(--green-900);display:flex;align-items:center;gap:12px;}',
      '.dm-builder-hdr h2{font-size:13px;font-weight:700;color:#fff;margin:0;flex:1;}',
      '.dm-builder-toggle{font-size:10px;font-weight:700;padding:3px 10px;border-radius:5px;border:1px solid rgba(255,255,255,0.3);background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);cursor:pointer;}',
      '.dm-builder-toggle:hover{background:rgba(255,255,255,0.15);}',
      '.dm-builder-body{padding:12px 16px;display:flex;flex-direction:column;gap:10px;}',
      '.dm-builder.collapsed .dm-builder-body{display:none;}',

      // Auth + Variables row
      '.dm-top-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',

      // Variables panel
      '.dm-vars{background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px;}',
      '.dm-vars-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);margin-bottom:2px;}',
      '.dm-vars-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;}',
      '.dm-var-item{display:flex;flex-direction:column;gap:2px;}',
      '.dm-var-lbl{font-size:9px;font-weight:700;text-transform:uppercase;color:var(--muted-2);letter-spacing:0.05em;}',
      '.dm-var-input{height:28px;border:1px solid var(--line);border-radius:5px;padding:0 7px;font:inherit;font-size:11px;font-family:monospace;color:var(--ink);background:var(--surface);width:100%;box-sizing:border-box;}',
      '.dm-var-input:focus{outline:none;border-color:var(--green-600);}',

      // Auth panel
      '.dm-auth{background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px;}',
      '.dm-auth-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);margin-bottom:2px;}',
      '.dm-auth-row{display:flex;flex-direction:column;gap:4px;}',
      '.dm-auth-lbl{font-size:9px;font-weight:700;text-transform:uppercase;color:var(--muted-2);}',
      '.dm-auth-input{height:28px;border:1px solid var(--line);border-radius:5px;padding:0 7px;font:inherit;font-size:11px;font-family:monospace;color:var(--ink);background:var(--surface);width:100%;box-sizing:border-box;}',
      '.dm-auth-input:focus{outline:none;border-color:var(--green-600);}',

      // Method + URL bar
      '.dm-url-bar{display:flex;gap:8px;align-items:center;}',
      '.dm-method-sel{height:36px;border:1px solid var(--line);border-radius:7px;padding:0 8px;font:inherit;font-size:12px;font-weight:700;color:var(--ink);background:var(--surface);cursor:pointer;flex-shrink:0;}',
      '.dm-method-sel:focus{outline:none;border-color:var(--green-600);}',
      '.dm-url-input{flex:1;height:36px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font:inherit;font-size:12px;font-family:monospace;color:var(--ink);background:var(--surface);box-sizing:border-box;}',
      '.dm-url-input:focus{outline:none;border-color:var(--green-600);}',
      '.dm-send-btn{height:36px;padding:0 20px;border:none;border-radius:7px;background:var(--green-700);color:var(--yellow);font:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;display:flex;align-items:center;gap:6px;}',
      '.dm-send-btn:hover{background:var(--green-800);}',
      '.dm-send-btn:disabled{opacity:0.4;cursor:not-allowed;}',
      '@keyframes dmspin{to{transform:rotate(360deg);}}',
      '.dm-spin{width:12px;height:12px;border:2px solid rgba(212,240,38,0.3);border-top-color:var(--yellow);border-radius:50%;animation:dmspin 0.7s linear infinite;display:none;}',
      '.dm-send-btn.loading .dm-spin{display:block;}',

      // URL quick picks
      '.dm-quick-row{display:flex;gap:4px;flex-wrap:wrap;}',
      '.dm-quick{font-size:10px;font-weight:700;padding:3px 8px;border-radius:5px;border:1px solid var(--line);background:var(--surface-2);color:var(--muted);cursor:pointer;white-space:nowrap;}',
      '.dm-quick:hover{border-color:var(--green-600);color:var(--green-700);background:var(--green-50);}',

      // Options row (params / headers / body tabs)
      '.dm-opts-tabs{display:flex;gap:0;border-bottom:1px solid var(--line);}',
      '.dm-opts-tab{padding:6px 14px;font-size:11px;font-weight:600;cursor:pointer;border:none;background:none;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px;transition:all 140ms;}',
      '.dm-opts-tab.active{color:var(--green-600);border-bottom-color:var(--green-600);}',
      '.dm-opts-pane{padding:10px 0 2px;display:none;}',
      '.dm-opts-pane.active{display:block;}',

      // KV table
      '.dm-kv{border:1px solid var(--line);border-radius:7px;overflow:hidden;width:100%;}',
      '.dm-kv-hdr{display:grid;grid-template-columns:1fr 1fr 28px;background:var(--surface-2);border-bottom:1px solid var(--line);}',
      '.dm-kv-hdr span{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);padding:4px 8px;}',
      '.dm-kv-rows{}',
      '.dm-kv-row{display:grid;grid-template-columns:1fr 1fr 28px;border-bottom:1px solid var(--line-2);}',
      '.dm-kv-row:last-child{border-bottom:none;}',
      '.dm-kv-cell{border:none;border-right:1px solid var(--line-2);padding:5px 8px;font:inherit;font-size:11px;font-family:monospace;color:var(--ink);background:transparent;width:100%;box-sizing:border-box;}',
      '.dm-kv-cell:last-of-type{border-right:none;}',
      '.dm-kv-cell:focus{outline:none;background:var(--green-50);}',
      '.dm-kv-del{border:none;background:none;color:var(--muted-2);cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;padding:0;}',
      '.dm-kv-del:hover{color:var(--danger);}',
      '.dm-kv-add{width:100%;border:none;background:none;padding:5px 10px;font-size:11px;color:var(--green-600);font-weight:600;cursor:pointer;text-align:left;border-top:1px solid var(--line-2);display:block;}',
      '.dm-kv-add:hover{background:var(--green-50);}',

      // Textarea
      '.dm-textarea{width:100%;min-height:80px;border:1px solid var(--line);border-radius:7px;padding:8px 10px;font:inherit;font-size:11px;font-family:monospace;color:var(--ink);background:var(--surface);resize:vertical;line-height:1.5;box-sizing:border-box;}',
      '.dm-textarea:focus{outline:none;border-color:var(--green-600);}',

      // ── BOTTOM: network log ──
      '.dm-log{flex:1;display:flex;flex-direction:column;overflow:hidden;}',
      '.dm-log-hdr{padding:6px 16px;background:var(--surface);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;flex-shrink:0;}',
      '.dm-log-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);flex:1;}',
      '.dm-log-filter{height:26px;border:1px solid var(--line);border-radius:5px;padding:0 8px;font:inherit;font-size:11px;color:var(--ink);background:var(--surface);width:180px;}',
      '.dm-log-filter:focus{outline:none;border-color:var(--green-600);}',
      '.dm-log-clear{height:26px;padding:0 10px;border-radius:5px;border:1px solid rgba(192,57,43,0.3);background:var(--danger-bg);color:var(--danger);font:inherit;font-size:11px;font-weight:600;cursor:pointer;}',
      '.dm-log-clear:hover{background:rgba(192,57,43,0.12);}',

      // Log column headers
      '.dm-log-cols{display:grid;grid-template-columns:40px 60px 1fr 80px 70px 70px;padding:4px 16px;background:var(--surface-2);border-bottom:1px solid var(--line);flex-shrink:0;}',
      '.dm-log-col{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);}',

      // Log body (scrollable)
      '.dm-log-body{flex:1;overflow-y:auto;overflow-x:hidden;}',

      // Log row
      '.dm-call-row{display:grid;grid-template-columns:40px 60px 1fr 80px 70px 70px;padding:5px 16px;border-bottom:1px solid var(--line-2);cursor:pointer;align-items:center;transition:background 140ms;}',
      '.dm-call-row:hover{background:var(--surface-2);}',
      '.dm-call-row.active{background:var(--green-50);border-left:3px solid var(--green-600);}',
      '.dm-call-row.err-row{border-left:3px solid var(--danger);}',
      '.dm-call-row.err-row.active{background:var(--danger-bg);}',
      '.dm-call-num{font-size:10px;color:var(--muted-2);font-family:monospace;}',
      '.dm-call-method{font-size:10px;font-weight:700;font-family:monospace;}',
      '.dm-call-method-GET{color:var(--green-600);}',
      '.dm-call-method-POST{color:var(--warning);}',
      '.dm-call-method-PUT{color:#7c3aed;}',
      '.dm-call-method-DELETE{color:var(--danger);}',
      '.dm-call-url{font-size:11px;font-family:monospace;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.dm-call-status-ok{font-size:11px;font-weight:700;color:var(--green-600);}',
      '.dm-call-status-err{font-size:11px;font-weight:700;color:var(--danger);}',
      '.dm-call-time{font-size:11px;color:var(--muted);font-family:monospace;}',
      '.dm-call-size{font-size:11px;color:var(--muted);font-family:monospace;}',

      // Detail panel (below log, fixed height)
      '.dm-detail{height:320px;background:var(--surface);border-top:2px solid var(--line);display:none;flex-direction:column;flex-shrink:0;}',
      '.dm-detail.open{display:flex;}',
      '.dm-detail-hdr{padding:6px 16px;background:var(--surface-2);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;flex-shrink:0;}',
      '.dm-detail-url{font-size:11px;font-family:monospace;color:var(--ink-2);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.dm-detail-close{border:none;background:none;color:var(--muted-2);font-size:18px;cursor:pointer;padding:0 4px;line-height:1;}',
      '.dm-detail-close:hover{color:var(--ink);}',

      // Detail tabs
      '.dm-detail-tabs{display:flex;gap:0;border-bottom:1px solid var(--line);flex-shrink:0;}',
      '.dm-detail-tab{padding:6px 16px;font-size:11px;font-weight:600;cursor:pointer;border:none;background:none;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px;transition:all 140ms;}',
      '.dm-detail-tab.active{color:var(--green-600);border-bottom-color:var(--green-600);}',
      '.dm-detail-pane{display:none;flex:1;overflow-y:auto;padding:12px 16px;}',
      '.dm-detail-pane.active{display:block;}',

      // Detail content
      '.dm-raw{background:var(--surface-3);border:1px solid var(--line);border-radius:7px;padding:10px 12px;font-family:monospace;font-size:10px;color:var(--ink-2);white-space:pre-wrap;word-break:break-all;max-height:220px;overflow-y:auto;line-height:1.6;}',
      '.dm-kvd{display:flex;flex-direction:column;gap:0;}',
      '.dm-kvd-row{display:flex;gap:0;border-bottom:1px solid var(--line-2);font-size:11px;font-family:monospace;}',
      '.dm-kvd-row:last-child{border-bottom:none;}',
      '.dm-kvd-k{padding:5px 10px;color:var(--green-700);font-weight:700;min-width:200px;flex-shrink:0;border-right:1px solid var(--line-2);background:var(--surface-2);}',
      '.dm-kvd-v{padding:5px 10px;color:var(--ink-2);word-break:break-all;flex:1;}',

      // Preview
      '.dm-s3box{background:var(--green-50);border:1px solid rgba(0,166,81,0.3);border-radius:7px;padding:9px 12px;font-family:monospace;font-size:10px;color:var(--green-700);word-break:break-all;line-height:1.6;margin-bottom:10px;}',
      '.dm-imgwrap{border:1px solid var(--line);border-radius:7px;overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;min-height:120px;margin-bottom:10px;}',
      '.dm-imgwrap img{max-width:100%;max-height:200px;object-fit:contain;display:block;}',
      '.dm-atts{display:flex;flex-direction:column;gap:4px;}',
      '.dm-att{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;border:1px solid var(--line);background:var(--surface-2);cursor:pointer;transition:all 140ms;}',
      '.dm-att:hover{background:var(--green-50);border-color:var(--green-600);}',
      '.dm-att-pos{font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:var(--green-100);color:var(--green-700);min-width:110px;text-align:center;flex-shrink:0;}',
      '.dm-att-id{font-family:monospace;font-size:11px;color:var(--ink-2);flex:1;}',
      '.dm-att-t{font-size:10px;color:var(--muted);flex-shrink:0;}',
      '.dm-att-arr{font-size:11px;color:var(--green-600);font-weight:700;flex-shrink:0;}',

      // Badges
      '.dm-badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700;}',
      '.dm-ok{background:var(--green-100);color:var(--green-700);}',
      '.dm-err{background:var(--danger-bg);color:var(--danger);}',
      '.dm-warn{background:rgba(180,83,9,0.1);color:var(--warning);}',

      // Empty
      '.dm-empty{text-align:center;padding:32px 20px;color:var(--muted-2);}',
      '.dm-empty p{font-size:12px;color:var(--muted);line-height:1.6;margin:6px 0 0;}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  function render() {
    var view = TGE.el('view-diag-manual');
    if (!view) return;
    injectStyles();

    view.innerHTML = [
      '<div class="dm">',

        // ══ BUILDER ══
        '<div class="dm-builder" id="dm-builder">',
          '<div class="dm-builder-hdr">',
            '<h2>API Workbench</h2>',
            '<button class="dm-builder-toggle" onclick="dmToggleBuilder()">Collapse ▲</button>',
          '</div>',
          '<div class="dm-builder-body">',

            // Auth + Variables
            '<div class="dm-top-row">',

              // Auth
              '<div class="dm-auth">',
                '<div class="dm-auth-title">Auth &amp; API Key</div>',
                '<div class="dm-auth-row">',
                  '<div class="dm-auth-lbl">TN360 Session Token (X-TN360-Token)</div>',
                  '<input class="dm-auth-input" id="dm-token" type="password" placeholder="Paste from DevTools → api-au.telematics.com → Authorization">',
                '</div>',
                '<div class="dm-auth-row">',
                  '<div class="dm-auth-lbl">Additional API Key (appended as key= param — optional)</div>',
                  '<input class="dm-auth-input" id="dm-apikey" type="password" placeholder="Only if needed — worker already injects stored key">',
                '</div>',
              '</div>',

              // Variables
              '<div class="dm-vars">',
                '<div class="dm-vars-title">Variables — use {{name}} anywhere in URL or body</div>',
                '<div class="dm-vars-grid">',
                  varField('dm-v-vid',  'vehicleId',    '381634'),
                  varField('dm-v-did',  'deviceId',     '518241'),
                  varField('dm-v-eid',  'eventId',      ''),
                  varField('dm-v-aid',  'attachmentId', ''),
                  varField('dm-v-yr',   'year',         new Date().getFullYear()),
                  varField('dm-v-mo',   'month',        new Date().getMonth()+1),
                  varField('dm-v-from', 'from',         '2026-06-01T00:00:00%2B10:00'),
                  varField('dm-v-to',   'to',           '2026-06-26T23:59:59%2B10:00'),
                  varField('dm-v-co',   'companyId',    '432639'),
                '</div>',
              '</div>',

            '</div>',

            // Method + URL + Send
            '<div class="dm-url-bar">',
              '<select class="dm-method-sel" id="dm-method" onchange="dmMethodChange()">',
                '<option>GET</option>',
                '<option>POST</option>',
                '<option>PUT</option>',
                '<option>DELETE</option>',
              '</select>',
              '<input class="dm-url-input" id="dm-url" value="/api/tn360/v1/devices/events/camera/snapshots" placeholder="/api/tn360/v1/...">',
              '<button class="dm-send-btn" id="dm-send" onclick="dmSend()">',
                '<div class="dm-spin" id="dm-spin"></div>',
                '<span id="dm-send-txt">▶ Send</span>',
              '</button>',
            '</div>',

            // Quick URL picks
            '<div class="dm-quick-row">',
              qk('Snapshot Events',  '/api/tn360/v1/devices/events/camera/snapshots'),
              qk('Attachment URL',   '/api/tn360/v1/attachments/{{attachmentId}}/content'),
              qk('Vehicles',         '/api/tn360/v1/vehicles'),
              qk('Camera Status',    '/api/tn360/cameras/{{deviceId}}/status'),
              qk('Notifications',    '/api/tn360/v1/notifications'),
              qk('Vehicle Events',   '/api/tn360/v1/events'),
              qk('Device Stats',     '/api/tn360/v1/devices/{{deviceId}}'),
            '</div>',

            // Params / Headers / Body
            '<div>',
              '<div class="dm-opts-tabs">',
                '<button class="dm-opts-tab active" data-pane="params"  onclick="dmOptTab(\'params\',this)">Params</button>',
                '<button class="dm-opts-tab"         data-pane="headers" onclick="dmOptTab(\'headers\',this)">Headers</button>',
                '<button class="dm-opts-tab"         data-pane="body"    onclick="dmOptTab(\'body\',this)">Body</button>',
              '</div>',

              // Params pane
              '<div class="dm-opts-pane active" id="dm-pane-params">',
                '<div class="dm-kv" id="dm-params-wrap">',
                  '<div class="dm-kv-hdr"><span>Key</span><span>Value</span><span></span></div>',
                  '<div class="dm-kv-rows" id="dm-params">',
                    kvr('from','2026-06-01T00:00:00%2B10:00'),
                    kvr('to','2026-06-26T23:59:59%2B10:00'),
                  '</div>',
                  '<button class="dm-kv-add" onclick="dmAddKv(\'dm-params\')">+ Add param</button>',
                '</div>',
              '</div>',

              // Headers pane
              '<div class="dm-opts-pane" id="dm-pane-headers">',
                '<div class="dm-kv">',
                  '<div class="dm-kv-hdr"><span>Key</span><span>Value</span><span></span></div>',
                  '<div class="dm-kv-rows" id="dm-headers">',
                    kvr('Content-Type','application/json'),
                  '</div>',
                  '<button class="dm-kv-add" onclick="dmAddKv(\'dm-headers\')">+ Add header</button>',
                '</div>',
              '</div>',

              // Body pane
              '<div class="dm-opts-pane" id="dm-pane-body">',
                '<textarea class="dm-textarea" id="dm-body" rows="5">{\n  "vehicles": ["{{vehicleId}}"],\n  "devices": ["{{deviceId}}"],\n  "orderField": "EventTime",\n  "orderDirection": "desc",\n  "rowCountLimit": 25,\n  "rowOffset": 0,\n  "latestOnly": false\n}</textarea>',
              '</div>',

            '</div>',

          '</div>',
        '</div>',

        // ══ NETWORK LOG ══
        '<div class="dm-log">',
          '<div class="dm-log-hdr">',
            '<span class="dm-log-title">Network Log</span>',
            '<input class="dm-log-filter" id="dm-filter" placeholder="Filter calls…" oninput="dmFilter()">',
            '<button class="dm-log-clear" onclick="dmClearAll()">Clear</button>',
          '</div>',
          '<div class="dm-log-cols">',
            '<span class="dm-log-col">#</span>',
            '<span class="dm-log-col">Method</span>',
            '<span class="dm-log-col">URL</span>',
            '<span class="dm-log-col">Status</span>',
            '<span class="dm-log-col">Time</span>',
            '<span class="dm-log-col">Size</span>',
          '</div>',
          '<div class="dm-log-body" id="dm-log-body">',
            '<div class="dm-empty" id="dm-empty">',
              '<div style="font-size:28px;">📡</div>',
              '<p>No calls yet. Build a request above and hit Send.</p>',
            '</div>',
          '</div>',
        '</div>',

        // ══ DETAIL PANEL ══
        '<div class="dm-detail" id="dm-detail">',
          '<div class="dm-detail-hdr">',
            '<span class="dm-detail-url" id="dm-detail-url"></span>',
            '<button class="dm-detail-close" onclick="dmCloseDetail()">✕</button>',
          '</div>',
          '<div class="dm-detail-tabs">',
            '<button class="dm-detail-tab active" data-dp="request"  onclick="dmDetailTab(\'request\',this)">Request</button>',
            '<button class="dm-detail-tab"         data-dp="response" onclick="dmDetailTab(\'response\',this)">Response</button>',
            '<button class="dm-detail-tab"         data-dp="preview"  onclick="dmDetailTab(\'preview\',this)">Preview</button>',
            '<button class="dm-detail-tab"         data-dp="raw"      onclick="dmDetailTab(\'raw\',this)">Raw</button>',
          '</div>',
          '<div class="dm-detail-pane active" id="dm-dp-request"></div>',
          '<div class="dm-detail-pane"         id="dm-dp-response"></div>',
          '<div class="dm-detail-pane"         id="dm-dp-preview"></div>',
          '<div class="dm-detail-pane"         id="dm-dp-raw"></div>',
        '</div>',

      '</div>',
    ].join('');

    exposeGlobals();
  }

  // ── HTML helpers ──────────────────────────────────────────────────────────────
  function varField(id, name, val) {
    return '<div class="dm-var-item">'
      + '<div class="dm-var-lbl">{{'+name+'}}</div>'
      + '<input class="dm-var-input" id="'+id+'" value="'+esc(val)+'" placeholder="'+esc(name)+'">'
    + '</div>';
  }

  function qk(label, url) {
    return '<button class="dm-quick" onclick="dmSetUrl(\''+esc(url)+'\')">'+esc(label)+'</button>';
  }

  function kvr(k, v) {
    return '<div class="dm-kv-row">'
      + '<input class="dm-kv-cell" placeholder="key" value="'+esc(k)+'">'
      + '<input class="dm-kv-cell" placeholder="value" value="'+esc(v)+'">'
      + '<button class="dm-kv-del" onclick="dmDelKv(this)">×</button>'
    + '</div>';
  }

  // ── Variables ─────────────────────────────────────────────────────────────────
  function getVars() {
    return {
      vehicleId:    gv('dm-v-vid'),
      deviceId:     gv('dm-v-did'),
      eventId:      gv('dm-v-eid'),
      attachmentId: gv('dm-v-aid'),
      year:         gv('dm-v-yr'),
      month:        gv('dm-v-mo'),
      from:         gv('dm-v-from'),
      to:           gv('dm-v-to'),
      companyId:    gv('dm-v-co'),
    };
  }

  function applyVars(str) {
    var vars = getVars();
    return str.replace(/\{\{(\w+)\}\}/g, function(_, key) {
      return vars[key] !== undefined ? vars[key] : '{{'+key+'}}';
    });
  }

  function gv(id) { var el = TGE.el(id); return el ? el.value.trim() : ''; }

  // ── Builder toggle ────────────────────────────────────────────────────────────
  function dmToggleBuilder() {
    var b   = TGE.el('dm-builder');
    var btn = b && b.querySelector('.dm-builder-toggle');
    if (!b) return;
    b.classList.toggle('collapsed');
    if (btn) btn.textContent = b.classList.contains('collapsed') ? 'Expand ▼' : 'Collapse ▲';
  }

  // ── Method change ─────────────────────────────────────────────────────────────
  function dmMethodChange() {
    var sel = TGE.el('dm-method');
    _method = sel ? sel.value : 'GET';
  }

  // ── URL ───────────────────────────────────────────────────────────────────────
  function dmSetUrl(url) {
    var el = TGE.el('dm-url');
    if (el) el.value = url;
  }

  // ── Options tabs ──────────────────────────────────────────────────────────────
  function dmOptTab(pane, btn) {
    document.querySelectorAll('.dm-opts-tab').forEach(function(t){ t.classList.remove('active'); });
    document.querySelectorAll('.dm-opts-pane').forEach(function(p){ p.classList.remove('active'); });
    btn.classList.add('active');
    var p = TGE.el('dm-pane-'+pane);
    if (p) p.classList.add('active');
  }

  // ── KV ────────────────────────────────────────────────────────────────────────
  function dmAddKv(id) {
    var c = TGE.el(id);
    if (!c) return;
    var row = document.createElement('div');
    row.className = 'dm-kv-row';
    row.innerHTML = '<input class="dm-kv-cell" placeholder="key"><input class="dm-kv-cell" placeholder="value"><button class="dm-kv-del" onclick="dmDelKv(this)">×</button>';
    c.appendChild(row);
    row.querySelector('.dm-kv-cell').focus();
  }

  function dmDelKv(btn) {
    var row = btn.closest('.dm-kv-row');
    if (row) row.remove();
  }

  function getKv(id) {
    var c = TGE.el(id);
    if (!c) return {};
    var out = {};
    c.querySelectorAll('.dm-kv-row').forEach(function(row) {
      var ins = row.querySelectorAll('.dm-kv-cell');
      var k = ins[0] ? ins[0].value.trim() : '';
      var v = ins[1] ? ins[1].value.trim() : '';
      if (k) out[k] = v;
    });
    return out;
  }

  // ── Detail tab ────────────────────────────────────────────────────────────────
  function dmDetailTab(pane, btn) {
    document.querySelectorAll('.dm-detail-tab').forEach(function(t){ t.classList.remove('active'); });
    document.querySelectorAll('.dm-detail-pane').forEach(function(p){ p.classList.remove('active'); });
    btn.classList.add('active');
    var p = TGE.el('dm-dp-'+pane);
    if (p) p.classList.add('active');
  }

  // ── Close detail ──────────────────────────────────────────────────────────────
  function dmCloseDetail() {
    var d = TGE.el('dm-detail');
    if (d) d.classList.remove('open');
    if (_active) {
      var row = TGE.el('dmrow-'+_active);
      if (row) row.classList.remove('active');
    }
    _active = null;
  }

  // ── Open detail for a call ────────────────────────────────────────────────────
  function dmOpenDetail(id) {
    var call = _calls.find(function(c){ return c.id === id; });
    if (!call) return;

    // Deactivate previous
    if (_active && _active !== id) {
      var prev = TGE.el('dmrow-'+_active);
      if (prev) prev.classList.remove('active');
    }
    _active = id;

    var row = TGE.el('dmrow-'+id);
    if (row) row.classList.add('active');

    var detail = TGE.el('dm-detail');
    if (detail) detail.classList.add('open');

    // URL
    var urlEl = TGE.el('dm-detail-url');
    if (urlEl) urlEl.textContent = call.method + ' ' + call.url;

    // Reset to first tab
    document.querySelectorAll('.dm-detail-tab').forEach(function(t,i){ t.classList.toggle('active', i===0); });
    document.querySelectorAll('.dm-detail-pane').forEach(function(p,i){ p.classList.toggle('active', i===0); });

    // ── Request tab ──
    var reqPane = TGE.el('dm-dp-request');
    if (reqPane) {
      var hdrRows = Object.keys(call.reqHdrs).map(function(k){
        var v = k === 'X-TN360-Token' ? '•••••••••••' : call.reqHdrs[k];
        return kvdRow(k, v);
      }).join('') || '<span style="font-size:11px;color:var(--muted);">None</span>';

      var paramRows = Object.keys(call.reqParams).map(function(k){
        return kvdRow(k, call.reqParams[k]);
      }).join('') || '<span style="font-size:11px;color:var(--muted);">None</span>';

      reqPane.innerHTML = sect('Method &amp; URL',
          '<div style="font-family:monospace;font-size:12px;padding:4px 0;"><strong>'+esc(call.method)+'</strong> '+esc(call.url)+'</div>'
        )
        + sect('Request Headers', '<div class="dm-kvd">'+hdrRows+'</div>')
        + sect('Query Params',    '<div class="dm-kvd">'+paramRows+'</div>')
        + (call.reqBody ? sect('Request Body', '<div class="dm-raw">'+esc(call.reqBody)+'</div>') : '');
    }

    // ── Response tab ──
    var resPane = TGE.el('dm-dp-response');
    if (resPane) {
      var ok      = call.status >= 200 && call.status < 300;
      var bCls    = ok ? 'dm-ok' : 'dm-err';
      var sTxt    = call.status === 0 ? 'Network Error' : 'HTTP '+call.status;
      resPane.innerHTML = sect('Status &amp; Timing',
          '<div style="display:flex;gap:12px;align-items:center;padding:4px 0;">'
            + '<span class="dm-badge '+bCls+'">'+esc(sTxt)+'</span>'
            + '<span style="font-size:12px;color:var(--muted);">Time: <strong style="color:var(--ink);">'+call.ms+'ms</strong></span>'
            + '<span style="font-size:12px;color:var(--muted);">Size: <strong style="color:var(--ink);">'+call.size+'</strong></span>'
          + '</div>'
        )
        + sect('Response Body', '<div class="dm-raw">'+esc(call.raw || 'Empty response')+'</div>');
    }

    // ── Preview tab ──
    var prevPane = TGE.el('dm-dp-preview');
    if (prevPane) {
      var html = '';

      // S3 URL
      if (call.s3url) {
        html += '<div style="margin-bottom:10px;">'
          + '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:5px;">Fresh Presigned S3 URL</div>'
          + '<div class="dm-s3box">'+esc(call.s3url)+'</div>'
          + '</div>'
          + '<div style="margin-bottom:10px;">'
          + '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:5px;">Image Preview</div>'
          + '<div class="dm-imgwrap"><img src="/api/image-proxy?url='+encodeURIComponent(call.s3url)+'" alt="snapshot"'
          + ' onerror="this.parentElement.innerHTML=\'<p style=&quot;padding:16px;font-size:12px;color:var(--danger);&quot;>Failed to load via image proxy.</p>\'"></div>'
          + '</div>';
      }

      // Attachments
      if (call.attachments && call.attachments.length) {
        html += '<div>'
          + '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">Attachments ('+call.attachments.length+') — click to load into next call</div>'
          + '<div class="dm-atts">'
          + call.attachments.map(function(item){
              return '<div class="dm-att" onclick="dmFillAtt(\''+esc(item.att.attachmentId)+'\',\''+item.yr+'\',\''+item.mo+'\')">'
                + '<span class="dm-att-pos">'+esc(item.att.cameraPosition||'?')+'</span>'
                + '<span class="dm-att-id">'+esc(item.att.attachmentId)+'</span>'
                + '<span class="dm-att-t">'+esc(item.fmt)+'</span>'
                + '<span class="dm-att-arr">→ Load</span>'
              + '</div>';
            }).join('')
          + '</div></div>';
      }

      // Parsed JSON tree (simple)
      if (call.data && typeof call.data === 'object' && !call.s3url && (!call.attachments || !call.attachments.length)) {
        html += '<div>'
          + '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:5px;">Parsed Response</div>'
          + '<div class="dm-raw">'+esc(JSON.stringify(call.data, null, 2))+'</div>'
          + '</div>';
      }

      if (!html) html = '<div style="padding:12px 0;font-size:12px;color:var(--muted);">No preview data — check the Response or Raw tabs.</div>';

      prevPane.innerHTML = html;
    }

    // ── Raw tab ──
    var rawPane = TGE.el('dm-dp-raw');
    if (rawPane) {
      rawPane.innerHTML = '<div class="dm-raw" style="max-height:240px;">'+esc(call.raw || 'Empty response')+'</div>';
    }
  }

  // ── Section helper ────────────────────────────────────────────────────────────
  function sect(title, content) {
    return '<div style="margin-bottom:12px;">'
      + '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);margin-bottom:5px;">'+title+'</div>'
      + content
    + '</div>';
  }

  function kvdRow(k, v) {
    return '<div class="dm-kvd-row"><span class="dm-kvd-k">'+esc(k)+'</span><span class="dm-kvd-v">'+esc(v)+'</span></div>';
  }

  // ── Fill attachment ───────────────────────────────────────────────────────────
  function dmFillAtt(attachmentId, year, month) {
    var aidEl = TGE.el('dm-v-aid');
    var yrEl  = TGE.el('dm-v-yr');
    var moEl  = TGE.el('dm-v-mo');
    if (aidEl) aidEl.value = attachmentId;
    if (yrEl)  yrEl.value  = year;
    if (moEl)  moEl.value  = month;

    var urlEl = TGE.el('dm-url');
    if (urlEl) urlEl.value = '/api/tn360/v1/attachments/{{attachmentId}}/content';

    var sel = TGE.el('dm-method');
    if (sel) { sel.value = 'GET'; _method = 'GET'; }

    // Set params
    var c = TGE.el('dm-params');
    if (c) {
      c.innerHTML = '';
      [['pruning','WEB'],['thumbnail','false'],['year',year],['month',month],['presigned','true']].forEach(function(p){
        var row = document.createElement('div');
        row.className = 'dm-kv-row';
        row.innerHTML = '<input class="dm-kv-cell" value="'+esc(p[0])+'"><input class="dm-kv-cell" value="'+esc(p[1])+'"><button class="dm-kv-del" onclick="dmDelKv(this)">×</button>';
        c.appendChild(row);
      });
    }

    // Clear body
    var bodyEl = TGE.el('dm-body');
    if (bodyEl) bodyEl.value = '';

    // Switch to params tab
    document.querySelectorAll('.dm-opts-tab').forEach(function(t){ t.classList.toggle('active', t.getAttribute('data-pane')==='params'); });
    document.querySelectorAll('.dm-opts-pane').forEach(function(p){ p.classList.toggle('active', p.id==='dm-pane-params'); });

    // Expand builder if collapsed
    var b = TGE.el('dm-builder');
    if (b && b.classList.contains('collapsed')) dmToggleBuilder();

    // Flash send button
    var btn = TGE.el('dm-send');
    if (btn) {
      btn.style.background = '#d4f026';
      btn.style.color = '#0a2d14';
      setTimeout(function(){ btn.style.background=''; btn.style.color=''; }, 700);
    }
  }

  // ── SEND ─────────────────────────────────────────────────────────────────────
  window.dmSend = async function() {
    var method  = (TGE.el('dm-method')||{}).value || 'GET';
    var rawUrl  = gv('dm-url');
    var token   = gv('dm-token');
    var apiKey  = gv('dm-apikey');
    var params  = getKv('dm-params');
    var hdrs    = getKv('dm-headers');
    var bodyEl  = TGE.el('dm-body');
    var bodyRaw = bodyEl ? bodyEl.value.trim() : '';

    if (!rawUrl) { alert('Enter a URL.'); return; }

    // Apply variables
    var resolvedUrl  = applyVars(rawUrl);
    var resolvedBody = applyVars(bodyRaw);

    // Apply variables to params values
    var resolvedParams = {};
    Object.keys(params).forEach(function(k){ resolvedParams[k] = applyVars(params[k]); });

    // Build query string
    var qParts = [];
    Object.keys(resolvedParams).forEach(function(k){ if (k) qParts.push(encodeURIComponent(k)+'='+resolvedParams[k]); });
    if (apiKey) qParts.push('key='+encodeURIComponent(apiKey));
    var fullUrl = qParts.length ? resolvedUrl + '?' + qParts.join('&') : resolvedUrl;

    // Build headers
    var fetchHdrs = {};
    Object.keys(hdrs).forEach(function(k){ if (k && hdrs[k]) fetchHdrs[k] = applyVars(hdrs[k]); });
    if (!fetchHdrs['Content-Type'] && resolvedBody) fetchHdrs['Content-Type'] = 'application/json';
    if (token) fetchHdrs['X-TN360-Token'] = token;

    var opts = { method: method, credentials: 'include', headers: fetchHdrs };
    if ((method === 'POST' || method === 'PUT') && resolvedBody) opts.body = resolvedBody;

    // Loading
    var btn  = TGE.el('dm-send');
    var spin = TGE.el('dm-spin');
    var txt  = TGE.el('dm-send-txt');
    if (btn)  { btn.disabled = true; btn.classList.add('loading'); }
    if (txt)  txt.textContent = 'Sending…';

    var empty = TGE.el('dm-empty');
    if (empty) empty.style.display = 'none';

    _seq++;
    var callId = 'dm-'+_seq;
    var pendingRow = mkRow(callId, _seq, method, fullUrl, null, null, null);
    var logBody = TGE.el('dm-log-body');
    if (logBody) logBody.insertBefore(pendingRow, logBody.firstChild);

    var start = Date.now();
    var status = 0, rawText = '', data = null;

    try {
      var res = await fetch(fullUrl, opts);
      status  = res.status;
      rawText = await res.text();
      try { data = JSON.parse(rawText); } catch(e) { data = null; }
    } catch(e) {
      rawText = 'Fetch error: ' + e.message;
      data    = { error: e.message };
    }

    var ms   = Date.now() - start;
    var size = rawText.length > 1024
      ? (rawText.length / 1024).toFixed(1) + ' KB'
      : rawText.length + ' B';

    // Parse useful data
    var attachments = [];
    var s3url       = null;
    if (data && typeof data === 'object') {
      var evts = data.events || (Array.isArray(data) ? data : []);
      evts.forEach(function(ev){
        (ev.attachments||[]).forEach(function(att){
          var d2  = new Date(att.timeAt||'');
          var yr  = d2.getFullYear()||new Date().getFullYear();
          var mo  = (d2.getMonth()+1)||1;
          var fmt = att.timeAt ? d2.toLocaleString('en-AU',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
          attachments.push({att:att,yr:yr,mo:mo,fmt:fmt});
        });
      });
      if (data.attachmentLink) s3url = data.attachmentLink;
    }

    var call = {
      id: callId, num: _seq, method: method, url: fullUrl,
      status: status, ms: ms, size: size,
      reqHdrs: fetchHdrs, reqParams: resolvedParams, reqBody: resolvedBody,
      data: data, raw: rawText,
      attachments: attachments, s3url: s3url,
    };
    _calls.push(call);

    // Update row
    var updated = mkRow(callId, _seq, method, fullUrl, status, ms, size);
    if (pendingRow.parentNode) pendingRow.parentNode.replaceChild(updated, pendingRow);

    // Auto-open detail
    dmOpenDetail(callId);

    if (btn)  { btn.disabled = false; btn.classList.remove('loading'); }
    if (txt)  txt.textContent = '▶ Send';
  };

  // ── Log row ───────────────────────────────────────────────────────────────────
  function mkRow(id, num, method, url, status, ms, size) {
    var row = document.createElement('div');
    row.id  = 'dmrow-'+id;

    var ok      = status !== null && status >= 200 && status < 300;
    var errored = status !== null && !ok;
    var sCls    = ok ? 'dm-call-status-ok' : 'dm-call-status-err';
    var sTxt    = status === null ? '…' : status === 0 ? 'ERR' : String(status);
    var mCls    = 'dm-call-method-'+(method||'GET');

    row.className = 'dm-call-row' + (errored ? ' err-row' : '');
    row.innerHTML = '<span class="dm-call-num">'+num+'</span>'
      + '<span class="dm-call-method '+mCls+'">'+esc(method)+'</span>'
      + '<span class="dm-call-url" title="'+esc(url)+'">'+esc(url)+'</span>'
      + '<span class="'+sCls+'">'+esc(sTxt)+'</span>'
      + '<span class="dm-call-time">'+(ms !== null ? ms+'ms' : '…')+'</span>'
      + '<span class="dm-call-size">'+(size||'…')+'</span>';

    row.onclick = function(){ dmOpenDetail(id); };
    return row;
  }

  // ── Filter ────────────────────────────────────────────────────────────────────
  function dmFilter() {
    var q = (gv('dm-filter')||'').toLowerCase();
    document.querySelectorAll('.dm-call-row').forEach(function(row){
      row.style.display = (!q || row.textContent.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
  }

  // ── Clear ─────────────────────────────────────────────────────────────────────
  function dmClearAll() {
    _calls  = [];
    _seq    = 0;
    _active = null;
    var lb = TGE.el('dm-log-body');
    if (lb) lb.innerHTML = '<div class="dm-empty" id="dm-empty"><div style="font-size:28px;">📡</div><p>No calls yet. Build a request above and hit Send.</p></div>';
    var d = TGE.el('dm-detail');
    if (d) d.classList.remove('open');
  }

  // ── Expose globals ────────────────────────────────────────────────────────────
  function exposeGlobals() {
    window.dmToggleBuilder = dmToggleBuilder;
    window.dmMethodChange  = dmMethodChange;
    window.dmSetUrl        = dmSetUrl;
    window.dmOptTab        = dmOptTab;
    window.dmAddKv         = dmAddKv;
    window.dmDelKv         = dmDelKv;
    window.dmDetailTab     = dmDetailTab;
    window.dmCloseDetail   = dmCloseDetail;
    window.dmFillAtt       = dmFillAtt;
    window.dmFilter        = dmFilter;
    window.dmClearAll      = dmClearAll;
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  // ── Register ──────────────────────────────────────────────────────────────────
  var _orig = TGE.onAppReady;
  TGE.onAppReady = function () {
    if (typeof _orig === 'function') _orig();
    render();
  };

  TGE.onShow['diag-manual'] = function() {};

})();
