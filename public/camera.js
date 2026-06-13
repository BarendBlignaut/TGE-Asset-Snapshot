document.addEventListener('DOMContentLoaded', function() {
(function() {

  // ── Sidebar show on login ───────────────────────────────────────────────
  var sidebarShown = false;
  function showSidebar(user) {
    if (sidebarShown) return;
    sidebarShown = true;
    var sb = document.getElementById('sidebar');
    var su = document.getElementById('sidebar-user');
    var av = document.getElementById('user-avatar');
    var dn = document.getElementById('user-display-name');
    var rl = document.getElementById('user-role-label');
    if (sb) sb.style.display = 'flex';
    if (su) su.style.display = 'flex';
    if (user) {
      var initials = ((user.firstName||'?')[0] + (user.lastName||'?')[0]).toUpperCase();
      if (av) av.textContent = initials;
      if (dn) dn.textContent = (user.firstName||'') + ' ' + (user.lastName||'');
      if (rl) rl.textContent = user.role || 'user';
    }
  }
  var appShell = document.getElementById('app-shell');
  if (appShell) {
    var obs = new MutationObserver(function() {
      if (window.getComputedStyle(appShell).display !== 'none') {
        showSidebar(window.state && window.state.currentSessionUser || {});
        obs.disconnect();
      }
    });
    obs.observe(appShell, { attributes: true, attributeFilter: ['style'] });
  }

  // ── Nav active state + page title ──────────────────────────────────────
  var navMap = {
    'standard-tab':    'Asset Snapshot',
    'asset-track-tab': 'Asset Track',
    'admin-tab':       'Admin',
    'vpm-tab':         'VPM Analysis',
    'diagnostics-tab': 'Camera',
  };
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[id$="-tab"]');
    if (!btn || !navMap[btn.id]) return;
    document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
    var sb = document.getElementById(btn.id);
    if (sb) sb.classList.add('active');
    var title = document.getElementById('topbar-page-title');
    if (title) title.textContent = navMap[btn.id];
  });

  // ── Camera view — tool selector ─────────────────────────────────────────
  function showToolSelector() {
    document.getElementById('cam-tool-selector').style.display = 'grid';
    document.getElementById('cam-snap-panel').style.display    = 'none';
    document.getElementById('cam-sd-panel').style.display      = 'none';
  }
  function showSnapPanel() {
    document.getElementById('cam-tool-selector').style.display = 'none';
    document.getElementById('cam-snap-panel').style.display    = 'block';
    document.getElementById('cam-sd-panel').style.display      = 'none';
  }
  function showSdPanel() {
    document.getElementById('cam-tool-selector').style.display = 'none';
    document.getElementById('cam-snap-panel').style.display    = 'none';
    document.getElementById('cam-sd-panel').style.display      = 'block';
  }

  on('cam-snap-select-btn', 'click', showSnapPanel);
  on('cam-sd-select-btn',   'click', showSdPanel);
  on('cam-snap-back',       'click', showToolSelector);
  on('cam-sd-back',         'click', showToolSelector);

  // ── Generic mode switcher factory ───────────────────────────────────────
  // Safe event binding helper — does nothing if element not found
  function on(id, evt, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(evt, fn);
  }

  function wireModeBar(userTabId, fleetTabId, userPanelId, fleetPanelId, runBtnId) {
    var userTab    = document.getElementById(userTabId);
    var fleetTab   = document.getElementById(fleetTabId);
    var userPanel  = document.getElementById(userPanelId);
    var fleetPanel = document.getElementById(fleetPanelId);
    var runBtn     = document.getElementById(runBtnId);
    var mode = null;
    function setMode(m) {
      mode = m;
      userPanel.style.display  = m === 'user'  ? '' : 'none';
      fleetPanel.style.display = m === 'fleet' ? '' : 'none';
      if (runBtn) runBtn.style.display = '';
      userTab.classList.toggle('active', m === 'user');
      fleetTab.classList.toggle('active', m === 'fleet');
    }
    userTab.addEventListener('click',  function() { setMode('user'); });
    fleetTab.addEventListener('click', function() { setMode('fleet'); });
    return { getMode: function() { return mode; } };
  }

  var snapMode = wireModeBar('snap-user-tab', 'snap-fleet-tab', 'snap-user-panel', 'snap-fleet-panel', 'snap-run-btn');
  var sdMode   = wireModeBar('sd-user-tab',   'sd-fleet-tab',   'sd-user-panel',   'sd-fleet-panel',   'sd-run-btn');

  // ── Helpers ─────────────────────────────────────────────────────────────
  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('en-AU', { hour12: false }); } catch(e) { return iso; }
  }

  function setExportBtns(prefix, show) {
    ['export-pdf-btn', 'export-csv-btn', 'export-email-btn'].forEach(function(s) {
      var el = document.getElementById(prefix + s);
      if (el) el.style.display = show ? '' : 'none';
    });
  }

  function triggerDl(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 3000);
  }

  // ── CAMERA SNAPSHOTS ────────────────────────────────────────────────────
  var snapState = { results: [], running: false };

  on('snap-run-btn', 'click', async function() {
    var mode = snapMode.getMode();
    if (!mode) { document.getElementById('snap-message').textContent = 'Select a mode first.'; return; }
    if (snapState.running) return;
    snapState.running = true;
    snapState.results = [];
    document.getElementById('snap-message').textContent = '';
    document.getElementById('snap-results').style.display = 'none';
    document.getElementById('snap-run-btn').style.display    = 'none';
    document.getElementById('snap-cancel-btn').style.display = '';
    document.getElementById('snap-summary').textContent = 'Running...';
    setExportBtns('snap-', false);
    try {
      var data;
      if (mode === 'user') {
        var raw   = document.getElementById('snap-imei-input').value;
        var imeis = raw.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
        if (!imeis.length) { document.getElementById('snap-message').textContent = 'Enter at least one IMEI.'; return; }
        document.getElementById('snap-summary').textContent = 'Fetching ' + imeis.length + ' IMEI(s)...';
        var res = await fetch('/api/camera-snapshot-imei', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imeis: imeis }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
      } else {
        document.getElementById('snap-summary').textContent = 'Fetching fleet data...';
        var res = await fetch('/api/camera-snapshot-fleet');
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
      }
      snapState.results = (data.results || []).map(function(r) { return Object.assign({ selected: false }, r); });
      renderSnapTable();
      var total   = snapState.results.length;
      var withImg = snapState.results.filter(function(r) { return r.slots && Object.values(r.slots).some(function(v) { return !!v; }); }).length;
      document.getElementById('snap-summary').textContent = total + ' vehicle(s), ' + withImg + ' with images.';
      document.getElementById('snap-results').style.display = '';
      setExportBtns('snap-', true);
    } catch(e) {
      document.getElementById('snap-message').textContent = e.message || 'Failed.';
      document.getElementById('snap-summary').textContent = 'Error.';
    } finally {
      snapState.running = false;
      document.getElementById('snap-run-btn').style.display    = '';
      document.getElementById('snap-cancel-btn').style.display = 'none';
    }
  });

  on('snap-cancel-btn', 'click', function() { snapState.running = false; });

  function thumbCell(url, label) {
    if (!url) return '<td><div class="snap-thumb-empty">None</div></td>';
    return '<td><img class="snap-thumb" src="' + url + '" alt="' + label + '" data-label="' + label + '" /></td>';
  }

  function renderSnapTable() {
    var tbody = document.getElementById('snap-tbody');
    if (!tbody) return;
    tbody.innerHTML = snapState.results.map(function(r, idx) {
      var s = r.slots || {};
      return '<tr>' +
        '<td><input type="checkbox" class="snap-chk" data-idx="' + idx + '"' + (r.selected ? ' checked' : '') + '/></td>' +
        '<td><strong>' + (r.fleetNumber || '—') + '</strong></td>' +
        '<td>' + (r.registration || '—') + '</td>' +
        '<td>' + [r.make, r.model].filter(Boolean).join(' ') + '</td>' +
        '<td style="font-size:11px;font-family:monospace;">' + (r.imei || '—') + '</td>' +
        '<td style="font-size:11px;">' + fmtDate(r.snapshotTime) + '</td>' +
        thumbCell(s.roadFacing, 'Road Facing') +
        thumbCell(s.driverFacing, 'Driver Facing') +
        thumbCell(s.inCabDriverFacingCamera, 'In-Cab Driver') +
        thumbCell(s.driverExternal, 'Driver External') +
        thumbCell(s.leftExternal, 'Left External') +
        '<td>' + (r.error
          ? '<span style="color:var(--danger);font-size:11px;">' + r.error + '</span>'
          : '<span style="color:var(--green-600);font-size:11px;">OK</span>') + '</td>' +
        '</tr>';
    }).join('');
    // Delegated lightbox on thumbnails
    tbody.onclick = function(e) {
      var img = e.target.closest('.snap-thumb');
      if (!img) return;
      var o = document.getElementById('lightbox-overlay');
      var li = document.getElementById('lightbox-img');
      var c  = document.getElementById('lightbox-caption');
      if (o && li) { li.src = img.src; if (c) c.textContent = img.dataset.label || ''; o.style.display = 'grid'; }
    };
    // Checkbox wiring
    tbody.querySelectorAll('.snap-chk').forEach(function(chk) {
      chk.addEventListener('change', function() {
        snapState.results[parseInt(this.dataset.idx)].selected = this.checked;
        updateSnapCount();
      });
    });
    updateSnapCount();
  }

  function updateSnapCount() {
    var sel = snapState.results.filter(function(r) { return r.selected; }).length;
    var el  = document.getElementById('snap-sel-count');
    if (el) el.textContent = sel + ' selected';
    var sa  = document.getElementById('snap-select-all');
    if (sa) { sa.checked = sel === snapState.results.length && sel > 0; sa.indeterminate = sel > 0 && sel < snapState.results.length; }
  }

  on('snap-select-all', 'change', function() {
    snapState.results.forEach(function(r) { r.selected = this.checked; }.bind(this));
    renderSnapTable();
  });

  on('snap-export-csv-btn', 'click', function() {
    var rows = snapState.results.filter(function(r) { return r.selected; });
    if (!rows.length) rows = snapState.results;
    var hdr = ['Fleet No', 'Registration', 'Make', 'Model', 'IMEI', 'Snapshot Time', 'Road', 'Driver', 'In-Cab', 'Ext Driver', 'Ext Left', 'Status'];
    var lines = [hdr.join(',')];
    rows.forEach(function(r) {
      var s = r.slots || {};
      var vals = [r.fleetNumber, r.registration, r.make, r.model, r.imei, r.snapshotTime || '',
        s.roadFacing ? 'Yes' : 'No', s.driverFacing ? 'Yes' : 'No', s.inCabDriverFacingCamera ? 'Yes' : 'No',
        s.driverExternal ? 'Yes' : 'No', s.leftExternal ? 'Yes' : 'No', r.error || 'OK'];
      lines.push(vals.map(function(v) { return '"' + String(v || '').replace(/"/g, '""') + '"'; }).join(','));
    });
    var csv = lines.join('\n');
    triggerDl(new Blob([csv], { type: 'text/csv' }), 'camera-snapshots-' + new Date().toISOString().slice(0, 10) + '.csv');
  });

  on('snap-export-pdf-btn', 'click', async function() {
    if (typeof jspdf === 'undefined') { document.getElementById('snap-message').textContent = 'PDF library not loaded.'; return; }
    var rows = snapState.results.filter(function(r) { return r.selected; });
    if (!rows.length) rows = snapState.results;
    var btn = this; btn.textContent = 'Building...'; btn.disabled = true;
    try {
      var pdf = await buildCameraSnapPdf(rows);
      pdf.save('camera-snapshots-' + new Date().toISOString().slice(0, 10) + '.pdf');
      document.getElementById('snap-message').textContent = 'PDF exported.';
    } catch(e) { document.getElementById('snap-message').textContent = e.message; }
    finally { btn.textContent = 'Export PDF'; btn.disabled = false; }
  });

  on('snap-export-email-btn', 'click', async function() {
    if (typeof jspdf === 'undefined') { document.getElementById('snap-message').textContent = 'PDF library not loaded.'; return; }
    var rows = snapState.results.filter(function(r) { return r.selected; });
    if (!rows.length) rows = snapState.results;
    var btn = this; btn.textContent = 'Building...'; btn.disabled = true;
    try {
      var pdf  = await buildCameraSnapPdf(rows);
      var blob = pdf.output('blob');
      var fn   = 'camera-snapshots-' + new Date().toISOString().slice(0, 10) + '.pdf';
      triggerDl(blob, fn);
      var subj = encodeURIComponent('TGE Camera Snapshot Report');
      var msg  = 'Please find the camera snapshot report attached.\n\nVehicles: ' + rows.length + '\nGenerated: ' + new Date().toLocaleString('en-AU', { hour12: false });
      setTimeout(function() { window.location.href = 'mailto:?subject=' + subj + '&body=' + encodeURIComponent(msg); }, 600);
      document.getElementById('snap-message').textContent = 'PDF downloaded — attach to the email that opens.';
    } catch(e) { document.getElementById('snap-message').textContent = e.message; }
    finally { btn.textContent = 'Email PDF'; btn.disabled = false; }
  });

  // ── SD CARD HEALTH ──────────────────────────────────────────────────────
  var sdState = { results: [], running: false };

  on('sd-run-btn', 'click', async function() {
    var mode = sdMode.getMode();
    if (!mode) { document.getElementById('sd-message').textContent = 'Select a mode first.'; return; }
    if (sdState.running) return;
    sdState.running = true;
    sdState.results = [];
    document.getElementById('sd-message').textContent = '';
    document.getElementById('sd-results').style.display = 'none';
    document.getElementById('sd-run-btn').style.display    = 'none';
    document.getElementById('sd-cancel-btn').style.display = '';
    document.getElementById('sd-summary').textContent = 'Running...';
    setExportBtns('sd-', false);
    try {
      var data;
      if (mode === 'user') {
        var raw   = document.getElementById('sd-imei-input').value;
        var imeis = raw.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
        if (!imeis.length) { document.getElementById('sd-message').textContent = 'Enter at least one IMEI.'; return; }
        document.getElementById('sd-summary').textContent = 'Fetching ' + imeis.length + ' device(s)...';
        var res = await fetch('/api/sd-health-imei', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imeis: imeis }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
      } else {
        document.getElementById('sd-summary').textContent = 'Fetching fleet SD health...';
        var res = await fetch('/api/sd-health-fleet');
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
      }
      sdState.results = (data.results || []).map(function(r) { return Object.assign({ selected: false }, r); });
      renderSdTable();
      document.getElementById('sd-summary').textContent = sdState.results.length + ' device(s) checked.';
      document.getElementById('sd-results').style.display = '';
      setExportBtns('sd-', true);
    } catch(e) {
      document.getElementById('sd-message').textContent = e.message || 'Failed.';
      document.getElementById('sd-summary').textContent = 'Error.';
    } finally {
      sdState.running = false;
      document.getElementById('sd-run-btn').style.display    = '';
      document.getElementById('sd-cancel-btn').style.display = 'none';
    }
  });

  on('sd-cancel-btn', 'click', function() { sdState.running = false; });

  function sdBadge(present) {
    return present
      ? '<span style="background:var(--green-100,#e6f5ec);color:var(--green-700,#007a3b);padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;">Present</span>'
      : '<span style="background:var(--surface-3);color:var(--muted);padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;">Not present</span>';
  }

  function renderSdTable() {
    var tbody = document.getElementById('sd-tbody');
    if (!tbody) return;
    tbody.innerHTML = sdState.results.map(function(r, idx) {
      var sd1 = r.sdCard1 || {}, sd2 = r.sdCard2 || {};
      return '<tr>' +
        '<td><input type="checkbox" class="sd-chk" data-idx="' + idx + '"' + (r.selected ? ' checked' : '') + '/></td>' +
        '<td><strong>' + (r.fleetNumber || '—') + '</strong></td>' +
        '<td>' + (r.registration || '—') + '</td>' +
        '<td style="font-size:11px;font-family:monospace;">' + (r.imei || '—') + '</td>' +
        '<td>' + (r.overallStatus || '—') + '</td>' +
        '<td>' + sdBadge(sd1.present) + '</td>' +
        '<td>' + (sd1.totalSizeDisplay || '—') + '</td>' +
        '<td>' + sdBadge(sd2.present) + '</td>' +
        '<td>' + (sd2.totalSizeDisplay || '—') + '</td>' +
        '</tr>';
    }).join('');
    tbody.querySelectorAll('.sd-chk').forEach(function(chk) {
      chk.addEventListener('change', function() {
        sdState.results[parseInt(this.dataset.idx)].selected = this.checked;
        updateSdCount();
      });
    });
    updateSdCount();
  }

  function updateSdCount() {
    var sel = sdState.results.filter(function(r) { return r.selected; }).length;
    var el  = document.getElementById('sd-sel-count');
    if (el) el.textContent = sel + ' selected';
    var sa  = document.getElementById('sd-select-all');
    if (sa) { sa.checked = sel === sdState.results.length && sel > 0; sa.indeterminate = sel > 0 && sel < sdState.results.length; }
  }

  on('sd-select-all', 'change', function() {
    sdState.results.forEach(function(r) { r.selected = this.checked; }.bind(this));
    renderSdTable();
  });

  on('sd-export-csv-btn', 'click', function() {
    var rows = sdState.results.filter(function(r) { return r.selected; });
    if (!rows.length) rows = sdState.results;
    var hdr   = ['Fleet No', 'Registration', 'Camera IMEI', 'Overall Status', 'SD1 Present', 'SD1 Size', 'SD2 Present', 'SD2 Size'];
    var lines = [hdr.join(',')];
    rows.forEach(function(r) {
      var sd1 = r.sdCard1 || {}, sd2 = r.sdCard2 || {};
      var vals = [r.fleetNumber, r.registration, r.imei, r.overallStatus,
        sd1.present ? 'Yes' : 'No', sd1.totalSizeDisplay || '', sd2.present ? 'Yes' : 'No', sd2.totalSizeDisplay || ''];
      lines.push(vals.map(function(v) { return '"' + String(v || '').replace(/"/g, '""') + '"'; }).join(','));
    });
    triggerDl(new Blob([lines.join('\n')], { type: 'text/csv' }), 'sd-health-' + new Date().toISOString().slice(0, 10) + '.csv');
  });

  on('sd-export-pdf-btn', 'click', function() {
    if (typeof jspdf === 'undefined') { document.getElementById('sd-message').textContent = 'PDF library not loaded.'; return; }
    var rows = sdState.results.filter(function(r) { return r.selected; });
    if (!rows.length) rows = sdState.results;
    var btn = this; btn.textContent = 'Building...'; btn.disabled = true;
    try {
      var pdf = buildSdPdf(rows);
      pdf.save('sd-health-' + new Date().toISOString().slice(0, 10) + '.pdf');
      document.getElementById('sd-message').textContent = 'PDF exported.';
    } catch(e) { document.getElementById('sd-message').textContent = e.message; }
    finally { btn.textContent = 'Export PDF'; btn.disabled = false; }
  });

  on('sd-export-email-btn', 'click', function() {
    if (typeof jspdf === 'undefined') { document.getElementById('sd-message').textContent = 'PDF library not loaded.'; return; }
    var rows = sdState.results.filter(function(r) { return r.selected; });
    if (!rows.length) rows = sdState.results;
    var btn = this; btn.textContent = 'Building...'; btn.disabled = true;
    try {
      var pdf  = buildSdPdf(rows);
      var blob = pdf.output('blob');
      var fn   = 'sd-health-' + new Date().toISOString().slice(0, 10) + '.pdf';
      triggerDl(blob, fn);
      var subj = encodeURIComponent('TGE SD Card Health Report');
      var msg  = 'Please find the SD card health report attached.\n\nDevices: ' + rows.length + '\nGenerated: ' + new Date().toLocaleString('en-AU', { hour12: false });
      setTimeout(function() { window.location.href = 'mailto:?subject=' + subj + '&body=' + encodeURIComponent(msg); }, 600);
      document.getElementById('sd-message').textContent = 'PDF downloaded — attach to the email that opens.';
    } catch(e) { document.getElementById('sd-message').textContent = e.message; }
    finally { btn.textContent = 'Email PDF'; btn.disabled = false; }
  });

  // ── PDF builders ────────────────────────────────────────────────────────
  async function buildCameraSnapPdf(rows) {
    var { jsPDF } = jspdf;
    var pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    var PW = 841.89, PH = 595.28, ML = 32, MR = 32, MT = 36, CW = PW - ML - MR;
    var y = MT;
    var GREEN = [0, 90, 45], INK = [20, 30, 24], MUTED = [90, 108, 98], LINE = [215, 226, 219];
    pdf.setFillColor.apply(pdf, GREEN).rect(0, 0, PW, 46, 'F');
    pdf.setFontSize(13).setFont(undefined, 'bold').setTextColor(255, 255, 255).text('TGE Camera Snapshot Report', ML, 22);
    pdf.setFontSize(8).setFont(undefined, 'normal').setTextColor(195, 230, 208)
      .text('Generated: ' + new Date().toLocaleString('en-AU', { hour12: false }) + '  |  ' + rows.length + ' vehicle(s)', ML, 36);
    y = 60;
    for (var vi = 0; vi < rows.length; vi++) {
      var r = rows[vi], s = r.slots || {};
      if (y > PH - 180) { pdf.addPage(); y = MT; }
      pdf.setFillColor(245, 249, 246).rect(ML, y, CW, 24, 'F');
      pdf.setDrawColor.apply(pdf, LINE).setLineWidth(0.4).rect(ML, y, CW, 24);
      pdf.setFontSize(8).setFont(undefined, 'bold').setTextColor.apply(pdf, INK)
        .text('Fleet ' + (r.fleetNumber || '--') + '  |  ' + (r.registration || '--') + '  |  ' + [r.make, r.model].filter(Boolean).join(' '), ML + 6, y + 15);
      pdf.setFontSize(7).setFont(undefined, 'normal').setTextColor.apply(pdf, MUTED)
        .text('Snapshot: ' + fmtDate(r.snapshotTime), PW - MR, y + 15, { align: 'right' });
      y += 28;
      var slots5 = [
        { label: 'Road Facing',     url: s.roadFacing },
        { label: 'Driver Facing',   url: s.driverFacing },
        { label: 'In-Cab Driver',   url: s.inCabDriverFacingCamera },
        { label: 'Driver External', url: s.driverExternal },
        { label: 'Left External',   url: s.leftExternal },
      ];
      var imgW = (CW - 4 * 6) / 5, imgH = imgW * 0.75;
      for (var si = 0; si < slots5.length; si++) {
        var sx = ML + si * (imgW + 6);
        if (slots5[si].url) {
          try {
            var imgData = await fetch('/api/image-proxy', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: slots5[si].url }),
            }).then(function(r) { return r.blob(); }).then(function(b) {
              return new Promise(function(resolve) {
                var fr = new FileReader();
                fr.onload = function() { resolve(fr.result); };
                fr.readAsDataURL(b);
              });
            });
            pdf.addImage(imgData, 'JPEG', sx, y, imgW, imgH);
          } catch(e) {
            pdf.setFillColor(245, 249, 246).rect(sx, y, imgW, imgH, 'F');
          }
        } else {
          pdf.setFillColor(245, 249, 246).rect(sx, y, imgW, imgH, 'F');
          pdf.setDrawColor.apply(pdf, LINE).setLineWidth(0.3).rect(sx, y, imgW, imgH);
        }
        pdf.setFontSize(6).setFont(undefined, 'bold').setTextColor.apply(pdf, MUTED)
          .text(slots5[si].label.toUpperCase(), sx + 2, y + imgH + 9);
      }
      y += imgH + 18;
    }
    var pc = pdf.getNumberOfPages();
    for (var p = 1; p <= pc; p++) {
      pdf.setPage(p);
      pdf.setFontSize(7).setFont(undefined, 'normal').setTextColor.apply(pdf, MUTED)
        .text('TGE Camera Snapshot Report  |  Page ' + p + ' of ' + pc, ML, PH - 14);
    }
    return pdf;
  }

  function buildSdPdf(rows) {
    var { jsPDF } = jspdf;
    var pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    var PW = 595.28, PH = 841.89, ML = 32, MR = 32, MT = 36, CW = PW - ML - MR;
    var y = MT;
    var GREEN = [0, 90, 45], INK = [20, 30, 24], MUTED = [90, 108, 98], LINE = [215, 226, 219];
    pdf.setFillColor.apply(pdf, GREEN).rect(0, 0, PW, 46, 'F');
    pdf.setFontSize(13).setFont(undefined, 'bold').setTextColor(255, 255, 255).text('TGE SD Card Health Report', ML, 22);
    pdf.setFontSize(8).setFont(undefined, 'normal').setTextColor(195, 230, 208)
      .text('Generated: ' + new Date().toLocaleString('en-AU', { hour12: false }) + '  |  ' + rows.length + ' device(s)', ML, 36);
    y = 60;
    rows.forEach(function(r) {
      if (y > PH - 80) { pdf.addPage(); y = MT; }
      var sd1 = r.sdCard1 || {}, sd2 = r.sdCard2 || {};
      pdf.setFillColor(245, 249, 246).rect(ML, y, CW, 24, 'F');
      pdf.setDrawColor.apply(pdf, LINE).setLineWidth(0.4).rect(ML, y, CW, 24);
      pdf.setFontSize(8).setFont(undefined, 'bold').setTextColor.apply(pdf, INK)
        .text('Fleet ' + (r.fleetNumber || '--') + '  |  ' + (r.registration || '--') + '  |  IMEI: ' + (r.imei || '--'), ML + 6, y + 15);
      y += 28;
      var cols = [
        { l: 'Overall Status', v: r.overallStatus || '--' },
        { l: 'SD Card 1',      v: sd1.present ? 'Present' : 'Not present' },
        { l: 'SD Card 1 Size', v: sd1.totalSizeDisplay || '--' },
        { l: 'SD Card 2',      v: sd2.present ? 'Present' : 'Not present' },
        { l: 'SD Card 2 Size', v: sd2.totalSizeDisplay || '--' },
      ];
      var cw = CW / cols.length;
      cols.forEach(function(c, i) {
        var x = ML + i * cw;
        pdf.setFillColor(255, 255, 255).rect(x + 1, y, cw - 2, 30, 'F');
        pdf.setDrawColor.apply(pdf, LINE).setLineWidth(0.3).rect(x + 1, y, cw - 2, 30);
        pdf.setFontSize(6.5).setFont(undefined, 'bold').setTextColor.apply(pdf, MUTED)
          .text(c.l.toUpperCase(), x + 5, y + 11);
        pdf.setFontSize(9).setFont(undefined, 'bold').setTextColor.apply(pdf, INK)
          .text(String(c.v), x + 5, y + 24);
      });
      y += 38;
    });
    var pc = pdf.getNumberOfPages();
    for (var p = 1; p <= pc; p++) {
      pdf.setPage(p);
      pdf.setFontSize(7).setFont(undefined, 'normal').setTextColor.apply(pdf, MUTED)
        .text('TGE SD Card Health Report  |  Page ' + p + ' of ' + pc, ML, PH - 14);
    }
    return pdf;
  }


  // ── API Reference ────────────────────────────────────────────────────────
  var API_REFS = [
    {
      id: 'API-1', method: 'GET', group: 'vehicle',
      url: '/v1/vehicles',
      returns: 'All vehicles — vehicleId, name (fleet no.), registration, make, model, year',
      usedBy: ['Asset Track fleet mode', 'Camera Snapshot fleet', 'SD Health fleet', 'VPM fleet'],
    },
    {
      id: 'API-2', method: 'GET', group: 'device',
      url: '/v1/devices',
      returns: 'All devices — imei, serialNumber, vehicleId, type (CAMERA / TRACKER / TABLET)',
      usedBy: ['IMEI to vehicleId lookup', 'Asset Track', 'VPM', 'Camera Snapshot user input'],
    },
    {
      id: 'API-3', method: 'GET', group: 'device',
      url: '/v1/devices/{imei}?embed=devicestats',
      returns: 'Single device stats — sdCard1, sdCard2 presence + size, overallStatus',
      usedBy: ['SD Card Health user input'],
    },
    {
      id: 'API-4', method: 'GET', group: 'camera',
      url: '/v1/events?types=camera&pruning=B2B',
      returns: 'Camera snapshot events — vehicleId, timeAt, attributes.context (mediaFiles + image URLs)',
      usedBy: ['Camera Snapshot user input', 'Camera Snapshot fleet', 'Asset Snapshot view'],
    },
    {
      id: 'API-5', method: 'GET', group: 'camera',
      url: '/v1/devices/{cameraId}/camera-device-stats',
      returns: 'Camera device stats — sdCard1/2 status, firmware, connection state',
      usedBy: ['Asset Snapshot SD card section'],
    },
    {
      id: 'API-6', method: 'GET', group: 'metrics',
      url: '/v1/vehicles/{vehicleId}/hermes-stats',
      returns: 'Live metrics — ignition, speed, rpm, gpio, gps coordinates, driverName, performance fields',
      usedBy: ['Asset Snapshot metrics', 'Asset Snapshot GPIO', 'Asset Snapshot location'],
    },
    {
      id: 'API-7', method: 'GET', group: 'metrics',
      url: '/v1/vehicles/{vehicleId}/meters',
      returns: 'Odometer reading, engine hours',
      usedBy: ['Asset Snapshot performance section'],
    },
    {
      id: 'API-8', method: 'GET', group: 'vehicle',
      url: '/v1/vehicles/{vehicleId}/devices',
      returns: 'Devices linked to a specific vehicle — imei, serialNumber, type',
      usedBy: ['Asset Snapshot device section', 'SD Health fleet mode'],
    },
  ];

  var apiRefList = document.getElementById('api-ref-list');
  var apiRefTabs = document.getElementById('api-ref-tabs');

  function renderApiRef(group) {
    if (!apiRefList) return;
    var filtered = group === 'all' ? API_REFS : API_REFS.filter(function(a) { return a.group === group; });
    apiRefList.innerHTML = filtered.map(function(api) {
      var pills = api.usedBy.map(function(u) {
        return '<span class="api-used-pill">' + u + '</span>';
      }).join('');
      return '<div class="api-ref-card">' +
        '<div class="api-ref-card-head">' +
          '<span class="api-id-badge">' + api.id + '</span>' +
          '<span class="api-badge ' + api.method.toLowerCase() + '">' + api.method + '</span>' +
          '<span class="api-ref-card-url">' + api.url + '</span>' +
        '</div>' +
        '<div class="api-ref-card-body">' +
          '<p><strong>Returns:</strong> ' + api.returns + '</p>' +
          '<div class="api-ref-used">' + pills + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  if (apiRefTabs) {
    apiRefTabs.addEventListener('click', function(e) {
      var btn = e.target.closest('.api-ref-tab');
      if (!btn) return;
      apiRefTabs.querySelectorAll('.api-ref-tab').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderApiRef(btn.dataset.group);
    });
  }

  // Render on load
  renderApiRef('all');

  // ── Expose for app.js ──────────────────────────────────────────────────
  window.__populateDiagnostics = function() { showToolSelector(); };

})();
}); // DOMContentLoaded

// Suppress errors from missing elements gracefully
window.addEventListener('error', function(e) {
  if (e.message && e.message.includes('addEventListener')) {
    e.preventDefault();
  }
});
