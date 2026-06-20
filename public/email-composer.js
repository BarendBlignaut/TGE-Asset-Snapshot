// TGE Asset Snapshot — Shared Email Composer
// public/email-composer.js
//
// Reusable composer used by Camera Snapshots, Camera Count, and Merge Mail.
// Usage: TGE.openEmailComposer({ rows: [...], fields: [...], onSent: fn })
//   rows:   array of objects, each representing one "item" (asset or table row)
//   fields: array of { key, label } describing which properties of each row
//           can be inserted as merge tags, e.g. { key:'legacyNo', label:'Legacy No' }
//   imagesField: optional key on each row holding an array of {label, url} images
//   attachmentBuilder: optional async function(rows) -> { base64, name } | string | null.
//                       If omitted, falls back to the built-in camera fault PDF builder.
//   attachmentLabel:   optional label for the attach checkbox (default 'Attach PDF')
//   attachByDefault:   optional boolean — pre-tick the attach checkbox
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
    attachmentBuilder: null,
    attachmentLabel:   'Attach PDF',
    attachByDefault:   false,
    mode:        'individual', // 'individual' | 'combined'
    sending:     false,
  };

  // ── Debug helper ─────────────────────────────────────────────────────────────
  // TGE.debugPreviewPdf() lets you build and open the camera fault PDF from
  // whatever rows are currently loaded in the composer, without sending any
  // email at all — useful for isolating PDF issues from Power Automate issues.
  TGE.debugPreviewPdf = async function () {
    if (!composerState.rows.length) { console.log('No rows loaded — open the composer first.'); return; }
    console.log('Building PDF from', composerState.rows.length, 'row(s)...');
    var attachment = await buildComposerAttachment(composerState.rows);
    if (!attachment) { console.log('PDF build failed or no eligible rows found.'); return; }
    var bin = atob(attachment.base64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var blob = new Blob([bytes], { type: 'application/pdf' });
    window.open(URL.createObjectURL(blob));
    console.log('PDF opened in new tab. sizeBytes:', bytes.length);
  };

  // ── Public entry point ──────────────────────────────────────────────────────
  TGE.openEmailComposer = async function (opts) {
    composerState.rows        = opts.rows || [];
    composerState.fields      = opts.fields || [];
    composerState.imagesField = opts.imagesField || null;
    composerState.onSent      = opts.onSent || null;
    composerState.attachmentBuilder = typeof opts.attachmentBuilder === 'function' ? opts.attachmentBuilder : null;
    composerState.attachmentLabel   = opts.attachmentLabel || 'Attach PDF';
    composerState.attachByDefault   = opts.attachByDefault === true;
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
    var canUseMergeFields = composerState.mode === 'individual' || composerState.rows.length === 1;

    // Merge fields only make sense when each email maps to exactly one row —
    // i.e. individual mode, or combined mode with a single row selected.
    var canUseMergeFields = composerState.mode === 'individual' || composerState.rows.length === 1;

    // Attach checkbox shows whenever there's something to attach: either a
    // custom attachmentBuilder was supplied, or the rows look like camera rows
    // (have a `slots` array) so the built-in camera-fault PDF builder applies.
    var canAttach = composerState.attachmentBuilder != null || composerState.rows.some(rowHasCameraSlots);

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
          (canUseMergeFields
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

        (canAttach
          ? '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">' +
              '<input type="checkbox" id="ec-attach-pdf" style="width:16px;height:16px;cursor:pointer;" ' + (composerState.attachByDefault ? 'checked' : '') + ' />' +
              (composerState.attachmentBuilder ? composerState.attachmentLabel : 'Attach camera photos as PDF') +
            '</label>'
          : ''),

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

  // Plain-text merge — used for Subject and To/CC/BCC, which never contain a
  // {signature:X} tag in practice, but {signature:X} is stripped defensively
  // anyway since signatures only make sense inside an HTML body.
  function mergeText(template, row) {
    if (!template) return '';
    return template
      .replace(/\{signature:([a-zA-Z0-9_]+)\}/g, '')
      .replace(/\{([a-zA-Z0-9_]+)\}/g, function(match, key) {
        if (row && row[key] != null) return String(row[key]);
        return '';
      });
  }

  // HTML body merge — resolves {field} tags AND {signature:X} tags.
  // Signature HTML is substituted via placeholder tokens so it is dropped in
  // verbatim (not HTML-escaped, not subject to nl2br) wherever the user
  // placed the {signature:X} tag in their typed text.
  function renderBodyHtml(template, row) {
    if (!template) return '';

    var signatures = [];
    var body = template.replace(/\{signature:([a-zA-Z0-9_]+)\}/g, function(match, sigKey) {
      var token = '%%TGE_SIGNATURE_' + signatures.length + '%%';
      signatures.push(SIGNATURES[sigKey] ? SIGNATURES[sigKey].html : '');
      return token;
    });

    if (row) {
      body = body.replace(/\{([a-zA-Z0-9_]+)\}/g, function(match, key) {
        if (row && row[key] != null) return String(row[key]);
        return '';
      });
    }

    if (!/<\/?[a-z][\s\S]*>/i.test(body)) body = nl2br(body);

    signatures.forEach(function(html, idx) {
      body = body.replace('%%TGE_SIGNATURE_' + idx + '%%', html);
    });

    return body;
  }

  // ── Standard camera status table ────────────────────────────────────────────
  // Used by BOTH individual and combined modes for Camera Snapshots / Camera
  // Count (anything with a `slots` field on each row) so the table looks
  // identical regardless of how many assets are in it. Merge Mail rows never
  // have a `slots` field, so this naturally returns '' for that page and no
  // table is appended at all — Merge Mail's email is just the merged text.
  var CAM_SLOT_LABELS = ['Cam 1', 'Cam 2', 'Cam 3', 'Cam 4', 'Cam 5'];

  function rowHasCameraSlots(row) {
    return row && Array.isArray(row.slots) && row.slots.length > 0;
  }

  function statusCellText(slot) {
    if (!slot) return '—';
    if (slot.status === 'working') return 'Working';
    if (slot.status === 'not_working') return 'Not Working';
    return '—';
  }

  function buildCameraStatusTable(rows) {
    var camRows = rows.filter(rowHasCameraSlots);
    if (!camRows.length) return '';

    var headerCells = '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">Asset ID</th>' +
      '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">IMEI</th>' +
      CAM_SLOT_LABELS.map(function(label) {
        return '<th style="text-align:center;padding:6px 8px;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">' + label + '</th>';
      }).join('') +
      '<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #e5e7eb;font-size:11px;color:#6b7280;text-transform:uppercase;">Last Comms</th>';

    var bodyRows = camRows.map(function(row) {
      var slotCells = [0,1,2,3,4].map(function(i) {
        var slot = row.slots[i];
        return '<td style="text-align:center;padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">' + statusCellText(slot) + '</td>';
      }).join('');

      var lastCommsCell = row.systemDown
        ? '<td style="text-align:right;padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;font-weight:700;color:#dc2626;">NON-FUNCTIONAL</td>'
        : '<td style="text-align:right;padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">' + (row.lastComms || 'Unknown') + '</td>';

      return '<tr>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;font-weight:700;">' + (row.legacyNo != null ? row.legacyNo : '—') + '</td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:11px;font-family:monospace;color:#6b7280;">' + (row.imei != null ? row.imei : '—') + '</td>' +
        slotCells +
        lastCommsCell +
      '</tr>';
    }).join('');

    return '<table style="width:100%;border-collapse:collapse;margin-top:16px;font-family:inherit;">' +
      '<thead><tr>' + headerCells + '</tr></thead>' +
      '<tbody>' + bodyRows + '</tbody>' +
    '</table>';
  }

  // ── PDF attachment (camera photos) ──────────────────────────────────────────
  // Built server-side via /api/camera-fault-pdf using the raw TN360 image URLs
  // directly (no signing, no storage — relies on TN360's own ~7-day presigned
  // URL validity). Only triggered when the user ticks "Attach camera photos".
  async function buildCameraFaultPdfAttachment(rows) {
    var camRows = rows.filter(rowHasCameraSlots);
    if (!camRows.length) return null;

    var assets = camRows.map(function(row) {
      // Only include slots that actually exist for this asset (e.g. 2 for
      // IQCamera, 5 for MultiIQ) — never padded with nulls. The PDF draws
      // exactly this many fixed-size boxes, centered as a group.
      var realSlots = [0,1,2,3,4]
        .map(function(i) { return row.slots[i]; })
        .filter(function(slot) { return slot != null; })
        .map(function(slot) { return { label: slot.label, url: slot.url || null, status: slot.status || null }; });

      return {
        legacyNo:   row.legacyNo,
        imei:       row.imei,
        model:      row.cameraModel,
        lastComms:  row.lastComms,
        systemDown: !!row.systemDown,
        slots:      realSlots,
      };
    });

    var r = await TGE.api('POST', '/api/camera-fault-pdf', { assets: assets });
    if (!r.ok || !r.data || !r.data.base64) return null;
    return r.data.base64;
  }

  // Resolves to a single attachment for the given rows, preferring a custom
  // attachmentBuilder (passed into TGE.openEmailComposer) over the built-in
  // camera fault PDF builder. Always returns either null or
  // { base64, name } — never a bare base64 string — so callers never have to
  // branch on the return shape.
  async function buildComposerAttachment(rows) {
    if (composerState.attachmentBuilder) {
      var built = await composerState.attachmentBuilder(rows);
      if (!built) return null;
      if (typeof built === 'string') return { base64: built, name: 'attachment.pdf' };
      if (built.base64) return { base64: built.base64, name: built.name || 'attachment.pdf' };
      return null;
    }

    var cameraBase64 = await buildCameraFaultPdfAttachment(rows);
    return cameraBase64 ? { base64: cameraBase64, name: 'camera-fault-report.pdf' } : null;
  }

  function wrapInTemplate(bodyHtml) {
    // Plain, standard email — no banner, no footer disclaimer. Just the
    // content, on a white background, like a normal email someone wrote.
    return '<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:14px;line-height:1.6;max-width:680px;">' +
      bodyHtml +
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

    var to      = (document.getElementById('ec-to')      || {}).value || '';
    var cc      = (document.getElementById('ec-cc')      || {}).value || '';
    var bcc     = (document.getElementById('ec-bcc')     || {}).value || '';
    var subject = (document.getElementById('ec-subject') || {}).value || '';
    var body    = (document.getElementById('ec-body')    || {}).value || '';
    var attachPdf = (document.getElementById('ec-attach-pdf') || {}).checked || false;

    if (!to.trim())      { setStatus('To field is required.', true); return; }
    if (!subject.trim()) { setStatus('Subject is required.', true); return; }
    if (!body.trim())    { setStatus('Body is required.', true); return; }

    composerState.sending = true;
    var sendBtn = document.getElementById('ec-send');
    if (sendBtn) { sendBtn.textContent = 'Sending...'; sendBtn.disabled = true; }

    try {
      // NOTE: PDF attachment behaviour differs by mode —
      //  - combined mode: ONE pdf covering ALL selected rows (correct, since
      //    it's one email about everything)
      //  - individual mode: a SEPARATE pdf per row, built fresh inside the
      //    loop below, so each recipient's email only contains THEIR asset's
      //    photos — never built once up-front and reused across all sends.

      if (composerState.mode === 'combined') {
        setStatus('Sending combined email...', false);

        var pdfAttachmentCombined = null;
        if (attachPdf) {
          setStatus('Building PDF attachment...', false);
          pdfAttachmentCombined = await buildComposerAttachment(composerState.rows);
          if (!pdfAttachmentCombined) setStatus('⚠ Could not build PDF attachment — sending without it.', true);
        }

        // If exactly one row is selected, merge fields/signature against it;
        // otherwise send the subject/body as typed (no single row to merge from).
        var combinedRow     = composerState.rows.length === 1 ? composerState.rows[0] : null;
        var combinedSubject = combinedRow ? mergeText(subject, combinedRow) : subject;
        var combinedBody    = renderBodyHtml(body, combinedRow) + buildCameraStatusTable(composerState.rows);
        var finalHtml        = wrapInTemplate(combinedBody);

        var sendPayload = { to: to, cc: cc, bcc: bcc, subject: combinedSubject, htmlBody: finalHtml };
        if (pdfAttachmentCombined) { sendPayload.attachmentBase64 = pdfAttachmentCombined.base64; sendPayload.attachmentName = pdfAttachmentCombined.name; }

        var r = await TGE.api('POST', '/api/send-email', sendPayload);
        if (!r.ok) throw new Error(r.data && r.data.error ? r.data.error : 'Send failed');

        setStatus('✅ Combined email sent to ' + to, false);

      } else {
        var total = composerState.rows.length;
        var sent  = 0;

        for (var i = 0; i < composerState.rows.length; i++) {
          var row = composerState.rows[i];
          var mergedSubject = mergeText(subject, row);
          var mergedBody    = renderBodyHtml(body, row) + buildCameraStatusTable([row]);
          var finalHtml     = wrapInTemplate(mergedBody);
          var mergedTo      = mergeText(to, row)  || to;
          var mergedCc      = mergeText(cc, row)  || cc;
          var mergedBcc     = mergeText(bcc, row) || bcc;

          // Build a fresh attachment for THIS row only — never shared across rows.
          var pdfAttachmentRow = null;
          if (attachPdf) {
            setStatus('Building PDF for item ' + (i+1) + ' of ' + total + '...', false);
            pdfAttachmentRow = await buildComposerAttachment([row]);
            if (!pdfAttachmentRow) setStatus('⚠ Could not build PDF for item ' + (i+1) + ' — sending without it.', true);
          }

          setStatus('Sending ' + (sent+1) + ' of ' + total + '...', false);

          var sendPayloadOne = { to: mergedTo, cc: mergedCc, bcc: mergedBcc, subject: mergedSubject, htmlBody: finalHtml };
          if (pdfAttachmentRow) { sendPayloadOne.attachmentBase64 = pdfAttachmentRow.base64; sendPayloadOne.attachmentName = pdfAttachmentRow.name; }

          var resp = await TGE.api('POST', '/api/send-email', sendPayloadOne);
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
