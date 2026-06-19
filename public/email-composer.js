// TGE Asset Snapshot — Shared Email Composer
// public/email-composer.js
//
// Reusable composer used by Camera Snapshots, Camera Count, and Merge Mail.
// Usage: TGE.openEmailComposer({ rows: [...], fields: [...], onSent: fn })
//   rows:   array of objects, each representing one "item" (asset or table row)
//   fields: array of { key, label } describing which properties of each row
//           can be inserted as merge tags, e.g. { key:'legacyNo', label:'Legacy No' }
//   imagesField: optional key on each row holding an array of {label, url} images
//   onSent: optional callback after a send completes

(function () {
  'use strict';

  // Signatures are loaded live from D1 via /api/mailer/signatures (active only).
  // Falls back to a single generic placeholder if none have been created yet
  // in Admin > Mailer Data, so the composer never breaks on a fresh install.
  var SIGNATURES = {}; // populated by loadSignatures(), keyed by signature id (string)
  var signaturesLoaded = false;

  async function loadSignatures() {
    try {
      var r = await TGE.api('GET', '/api/mailer/signatures');
      if (r.ok && r.data && Array.isArray(r.data.signatures) && r.data.signatures.length) {
        SIGNATURES = {};
        r.data.signatures.forEach(function(sig) {
          SIGNATURES[String(sig.id)] = { label: sig.label, html: sig.html };
        });
      } else {
        SIGNATURES = {
          placeholder: {
            label: 'No signatures configured',
            html: '<p style="font-size:12px;color:#9ca3af;">No signatures have been set up yet — add one in Admin &gt; Mailer Data.</p>',
          },
        };
      }
    } catch(e) {
      SIGNATURES = {
        placeholder: {
          label: 'No signatures available',
          html: '',
        },
      };
    }
    signaturesLoaded = true;
  }

  var composerState = {
    rows:        [],
    fields:      [],
    imagesField: null,
    onSent:      null,
    mode:        'individual', // 'individual' | 'combined'
    sending:     false,
  };

  // ── Public entry point ──────────────────────────────────────────────────────
  TGE.openEmailComposer = async function (opts) {
    composerState.rows        = opts.rows || [];
    composerState.fields      = opts.fields || [];
    composerState.imagesField = opts.imagesField || null;
    composerState.onSent      = opts.onSent || null;
    composerState.mode        = 'individual';
    composerState.sending     = false;

    injectPanel();
    renderPanel(); // render once immediately so the panel isn't blank while signatures load
    showPanel();

    await loadSignatures();
    renderPanel(); // re-render now that real signatures are available in the dropdown
  };

  // ── Build the panel once ────────────────────────────────────────────────────
  function injectPanel() {
    var existing = document.getElementById('ec-panel');
    if (existing) return; // already injected, just re-render content

    var panel = document.createElement('div');
    panel.id = 'ec-panel';
    panel.style.cssText = 'display:none;position:fixed;bottom:0;left:0;right:0;height:90vh;background:var(--surface);border-top:3px solid var(--green-600);z-index:500;flex-direction:column;box-shadow:0 -8px 32px rgba(0,0,0,0.25);';
    document.body.appendChild(panel);
  }

  function showPanel() {
    var panel = document.getElementById('ec-panel');
    if (panel) panel.style.display = 'flex';
  }

  function closePanel() {
    var panel = document.getElementById('ec-panel');
    if (panel) panel.style.display = 'none';
  }

  // ── Render panel content ────────────────────────────────────────────────────
  function renderPanel() {
    var panel = document.getElementById('ec-panel');
    if (!panel) return;

    var fieldOptions = composerState.fields.map(function(f) {
      return '<option value="' + f.key + '">' + f.label + '</option>';
    }).join('');

    panel.innerHTML = [
      '<div style="padding:14px 20px;background:var(--green-900);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">',
        '<div>',
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:rgba(212,240,38,0.7);">Email Composer</div>',
          '<div style="font-size:15px;font-weight:700;color:#fff;">' + composerState.rows.length + ' item' + (composerState.rows.length !== 1 ? 's' : '') + ' selected</div>',
        '</div>',
        '<button id="ec-close" style="border:none;background:rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:16px;cursor:pointer;width:30px;height:30px;">✕</button>',
      '</div>',

      '<div style="flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:16px;">',

        // Grouping
        '<div style="display:flex;gap:8px;align-items:center;">',
          '<span style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;">Send as:</span>',
          '<button class="ec-mode-btn' + (composerState.mode==='individual'?' active':'') + '" id="ec-mode-individual" type="button" style="height:30px;padding:0 12px;border-radius:7px;border:1px solid var(--line);background:' + (composerState.mode==='individual'?'var(--green-100)':'transparent') + ';border-color:' + (composerState.mode==='individual'?'var(--green-600)':'var(--line)') + ';font-size:12px;cursor:pointer;">One email per item</button>',
          '<button class="ec-mode-btn' + (composerState.mode==='combined'?' active':'') + '" id="ec-mode-combined" type="button" style="height:30px;padding:0 12px;border-radius:7px;border:1px solid var(--line);background:' + (composerState.mode==='combined'?'var(--green-100)':'transparent') + ';border-color:' + (composerState.mode==='combined'?'var(--green-600)':'var(--line)') + ';font-size:12px;cursor:pointer;">One combined email</button>',
        '</div>',

        // To / CC / BCC
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">',
          '<div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;">To</label>',
            '<input id="ec-to" type="text" placeholder="name@company.com, name2@company.com" style="width:100%;height:34px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font-size:13px;background:var(--surface);color:var(--ink);" /></div>',
          '<div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;">CC</label>',
            '<input id="ec-cc" type="text" placeholder="optional" style="width:100%;height:34px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font-size:13px;background:var(--surface);color:var(--ink);" /></div>',
          '<div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;">BCC</label>',
            '<input id="ec-bcc" type="text" placeholder="optional" style="width:100%;height:34px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font-size:13px;background:var(--surface);color:var(--ink);" /></div>',
        '</div>',

        // Insert field + signature toolbar
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:10px;">',
          '<span style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;">Insert into subject or body:</span>',
          (composerState.mode === 'individual'
            ? '<select id="ec-field-select" style="height:30px;border:1px solid var(--line);border-radius:6px;font-size:12px;padding:0 6px;background:var(--surface);color:var(--ink);">' + fieldOptions + '</select>' +
              '<button id="ec-insert-field" type="button" class="btn" style="height:30px;font-size:12px;">+ Field</button>'
            : '<span style="font-size:11px;color:var(--muted);font-style:italic;">Merge fields only available in "One email per item" mode</span>'),
          '<select id="ec-sig-select" style="height:30px;border:1px solid var(--line);border-radius:6px;font-size:12px;padding:0 6px;background:var(--surface);color:var(--ink);">' +
            Object.keys(SIGNATURES).map(function(key) {
              return '<option value="' + key + '">' + SIGNATURES[key].label + '</option>';
            }).join('') +
          '</select>',
          '<button id="ec-insert-sig" type="button" class="btn" style="height:30px;font-size:12px;">+ Signature</button>',
        '</div>',

        // Subject
        '<div><label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;">Subject</label>',
          '<input id="ec-subject" type="text" placeholder="Subject line" style="width:100%;height:36px;border:1px solid var(--line);border-radius:7px;padding:0 10px;font-size:13px;background:var(--surface);color:var(--ink);" /></div>',

        // Body
        '<div style="flex:1;display:flex;flex-direction:column;">',
          '<label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px;">Body</label>',
          '<textarea id="ec-body" rows="10" placeholder="Write your message here. Use the Insert toolbar above to add merge fields or a signature." ',
            'style="width:100%;flex:1;min-height:200px;border:1px solid var(--line);border-radius:8px;padding:12px;font-size:13px;line-height:1.6;resize:vertical;background:var(--surface);color:var(--ink);font-family:inherit;"></textarea>',
        '</div>',

        '<p style="font-size:11px;color:var(--muted);margin:0;">Images are hosted externally — recipients may need to click "Download pictures" to view them. ' +
          (composerState.mode === 'combined' ? 'A table of all selected items with their images will be appended automatically below your message.' : 'Each item\'s images will be appended automatically below your message.') +
        '</p>',

        '<div id="ec-status" style="font-size:12px;color:var(--muted);"></div>',

      '</div>',

      '<div style="padding:12px 20px;border-top:1px solid var(--line);display:flex;gap:8px;flex-shrink:0;background:var(--surface-2);">',
        '<button id="ec-send" class="btn btn-primary" style="height:36px;">Send</button>',
        '<button id="ec-cancel" class="btn" style="height:36px;">Cancel</button>',
      '</div>',
    ].join('');

    wirePanelEvents();
  }

  // ── Wire events ───────────────────────────────────────────────────────────────
  function wirePanelEvents() {
    var closeBtn  = document.getElementById('ec-close');
    var cancelBtn = document.getElementById('ec-cancel');
    var sendBtn   = document.getElementById('ec-send');
    var modeIndividual = document.getElementById('ec-mode-individual');
    var modeCombined   = document.getElementById('ec-mode-combined');
    var insertFieldBtn = document.getElementById('ec-insert-field');
    var insertSigBtn   = document.getElementById('ec-insert-sig');

    if (closeBtn)  closeBtn.onclick  = closePanel;
    if (cancelBtn) cancelBtn.onclick = closePanel;
    if (sendBtn)   sendBtn.onclick   = handleSend;

    if (modeIndividual) modeIndividual.onclick = function() { composerState.mode = 'individual'; renderPanel(); };
    if (modeCombined)   modeCombined.onclick   = function() { composerState.mode = 'combined';   renderPanel(); };

    if (insertFieldBtn) insertFieldBtn.onclick = function() {
      var sel = document.getElementById('ec-field-select');
      if (sel) insertAtCursor('{' + sel.value + '}');
    };
    if (insertSigBtn) insertSigBtn.onclick = function() {
      var sel = document.getElementById('ec-sig-select');
      if (sel) insertAtCursor('{signature:' + sel.value + '}');
    };

    // Track which field the user is editing so Insert knows where to go
    var subjectInput = document.getElementById('ec-subject');
    var bodyInput     = document.getElementById('ec-body');
    if (subjectInput) subjectInput.addEventListener('focus', function() { lastFocusedField = 'ec-subject'; });
    if (bodyInput)     bodyInput.addEventListener('focus',     function() { lastFocusedField = 'ec-body'; });
  }

  // Tracks whichever field (subject or body) the user last clicked into,
  // so "Insert" knows where to drop the merge tag.
  var lastFocusedField = 'ec-body';

  function insertAtCursor(text) {
    var target = document.getElementById(lastFocusedField) || document.getElementById('ec-body');
    if (!target) return;
    var start = target.selectionStart != null ? target.selectionStart : target.value.length;
    var end   = target.selectionEnd != null ? target.selectionEnd : target.value.length;
    target.value = target.value.slice(0, start) + text + target.value.slice(end);
    target.focus();
    target.selectionStart = target.selectionEnd = start + text.length;
  }

  // ── Merge logic ───────────────────────────────────────────────────────────────
  function mergeText(template, row) {
    if (!template) return '';
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, function(match, key) {
      if (key.indexOf('signature:') === 0) return match; // handled separately
      if (row && row[key] != null) return String(row[key]);
      return '';
    }).replace(/\{signature:([a-zA-Z0-9_]+)\}/g, function(match, sigKey) {
      return SIGNATURES[sigKey] ? SIGNATURES[sigKey].html : '';
    });
  }

  function buildImagesHtml(row) {
    if (!composerState.imagesField) return '';
    var imgs = row[composerState.imagesField];
    if (!Array.isArray(imgs) || !imgs.length) return '';
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">' +
      imgs.map(function(img) {
        // Use the signed public URL (signedUrl) if available, otherwise fall back to the raw url
        var src = img.signedUrl || img.url;
        if (!src) return '';
        return '<div style="flex:1;min-width:120px;max-width:160px;">' +
          '<img src="' + src + '" style="width:100%;border-radius:6px;border:1px solid #e5e7eb;display:block;" />' +
          '<div style="font-size:10px;color:#6b7280;text-align:center;margin-top:3px;">' + (img.label || '') + '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  // Signs every image URL in composerState.rows so they work in email clients
  // without requiring a login session. Called once before sending.
  async function signAllImages() {
    var jobs = [];
    composerState.rows.forEach(function(row) {
      if (!composerState.imagesField) return;
      var imgs = row[composerState.imagesField];
      if (!Array.isArray(imgs)) return;
      imgs.forEach(function(img) {
        if (!img.url || img.signedUrl) return;
        // Extract the actual S3/source URL from our own proxy URL if needed
        var rawUrl = img.url;
        var proxyMarker = '/api/image-proxy?url=';
        var idx = rawUrl.indexOf(proxyMarker);
        if (idx !== -1) {
          rawUrl = decodeURIComponent(rawUrl.slice(idx + proxyMarker.length));
        }
        jobs.push(
          TGE.api('POST', '/api/sign-image-url', { url: rawUrl }).then(function(r) {
            if (r.ok && r.data && r.data.publicUrl) img.signedUrl = r.data.publicUrl;
          }).catch(function(){})
        );
      });
    });
    if (jobs.length) await Promise.all(jobs);
  }

  function buildCombinedTable() {
    if (!composerState.rows.length) return '';
    var fieldKeys = composerState.fields.map(function(f) { return f.key; });
    var headerRow = composerState.fields.map(function(f) {
      return '<th style="text-align:left;padding:8px;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">' + f.label + '</th>';
    }).join('');

    var bodyRows = composerState.rows.map(function(row) {
      var cells = fieldKeys.map(function(k) {
        return '<td style="padding:8px;border-bottom:1px solid #f3f4f6;font-size:13px;">' + (row[k] != null ? row[k] : '—') + '</td>';
      }).join('');
      var imagesRow = composerState.imagesField
        ? '<tr><td colspan="' + fieldKeys.length + '" style="padding:8px;border-bottom:1px solid #f3f4f6;">' + buildImagesHtml(row) + '</td></tr>'
        : '';
      return '<tr>' + cells + '</tr>' + imagesRow;
    }).join('');

    return '<table style="width:100%;border-collapse:collapse;margin-top:16px;font-family:inherit;">' +
      '<thead><tr>' + headerRow + '</tr></thead>' +
      '<tbody>' + bodyRows + '</tbody>' +
    '</table>';
  }

  function wrapInTemplate(bodyHtml, subject) {
    return '<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:680px;margin:0 auto;color:#1a1a1a;">' +
      '<div style="background:#14532d;padding:18px 26px;border-radius:8px 8px 0 0;">' +
        '<div style="color:#d4f026;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Team Global Express — Fleet Telematics</div>' +
        '<div style="color:#ffffff;font-size:18px;font-weight:700;margin-top:4px;">' + escapeHtml(subject) + '</div>' +
      '</div>' +
      '<div style="padding:26px;background:#ffffff;border:1px solid #e5e7eb;border-top:none;font-size:14px;line-height:1.6;">' +
        bodyHtml +
      '</div>' +
      '<div style="padding:14px 26px;text-align:center;">' +
        '<p style="font-size:11px;color:#9ca3af;margin:0;">This is an automated message from the TGE Fleet Telematics system.</p>' +
      '</div>' +
    '</div>';
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }

  function nl2br(s) {
    return (s || '').replace(/\n/g, '<br>');
  }

  // ── Send ───────────────────────────────────────────────────────────────────────
  async function handleSend() {
    if (composerState.sending) return;

    composerState.sending = true; // set early so sign step is also protected
    setStatus('Preparing images...', false);
    await signAllImages();
    composerState.sending = false; // reset, normal flow below will re-set it

    var to      = (document.getElementById('ec-to')      || {}).value || '';
    var cc      = (document.getElementById('ec-cc')      || {}).value || '';
    var bcc     = (document.getElementById('ec-bcc')     || {}).value || '';
    var subject = (document.getElementById('ec-subject') || {}).value || '';
    var body    = (document.getElementById('ec-body')    || {}).value || '';

    if (!to.trim())      { setStatus('To field is required.', true); return; }
    if (!subject.trim()) { setStatus('Subject is required.', true); return; }
    if (!body.trim())    { setStatus('Body is required.', true); return; }

    composerState.sending = true;
    var sendBtn = document.getElementById('ec-send');
    if (sendBtn) { sendBtn.textContent = 'Sending...'; sendBtn.disabled = true; }

    try {
      if (composerState.mode === 'combined') {
        setStatus('Sending combined email...', false);
        var combinedBody = nl2br(body) + buildCombinedTable();
        var finalHtml = wrapInTemplate(combinedBody, subject);

        var r = await TGE.api('POST', '/api/send-email', { to: to, cc: cc, bcc: bcc, subject: subject, htmlBody: finalHtml });
        if (!r.ok) throw new Error(r.data && r.data.error ? r.data.error : 'Send failed');

        setStatus('✅ Combined email sent to ' + to, false);

      } else {
        var total = composerState.rows.length;
        var sent  = 0;

        for (var i = 0; i < composerState.rows.length; i++) {
          var row = composerState.rows[i];
          var mergedSubject = mergeText(subject, row);
          var mergedBodyRaw = mergeText(body, row);
          var mergedBody    = nl2br(mergedBodyRaw) + buildImagesHtml(row);
          var finalHtml     = wrapInTemplate(mergedBody, mergedSubject);
          var mergedTo       = mergeText(to, row)  || to;
          var mergedCc       = mergeText(cc, row)  || cc;
          var mergedBcc      = mergeText(bcc, row) || bcc;

          setStatus('Sending ' + (sent+1) + ' of ' + total + '...', false);

          var resp = await TGE.api('POST', '/api/send-email', { to: mergedTo, cc: mergedCc, bcc: mergedBcc, subject: mergedSubject, htmlBody: finalHtml });
          if (!resp.ok) {
            setStatus('⚠ Failed on item ' + (i+1) + ': ' + (resp.data && resp.data.error ? resp.data.error : 'unknown error'), true);
          } else {
            sent++;
          }

          // Throttle — small delay between sends so it doesn't look like a spam blast
          if (i < composerState.rows.length - 1) await delay(2500);
        }

        setStatus('✅ Sent ' + sent + ' of ' + total + ' emails.', false);
      }

      if (typeof composerState.onSent === 'function') composerState.onSent();

    } catch(e) {
      setStatus('❌ ' + e.message, true);
    } finally {
      composerState.sending = false;
      if (sendBtn) { sendBtn.textContent = 'Send'; sendBtn.disabled = false; }
    }
  }

  function setStatus(msg, isError) {
    var el = document.getElementById('ec-status');
    if (el) { el.textContent = msg; el.style.color = isError ? 'var(--danger)' : 'var(--muted)'; }
  }

  function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

})();
