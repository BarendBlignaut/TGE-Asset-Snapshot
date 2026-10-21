Change 1 is in, matches the tested version, and checks clean.

**Change 2: replace the screen file.** In GitHub, open `public/screen/screen-camera-footage.js` and click the pencil (Edit). Press Ctrl+A to select everything, delete it, paste everything below, then commit:

```
// TGE Asset Snapshot — Camera Footage Page
// public/screen/screen-camera-footage.js
//
// Requests TN360 video footage for a camera, the same way TN360's own
// "Request Video Footage" dialog does. Renders into #view-camera-footage.
// Backend: GET /api/camfootage/lookup and POST /api/camfootage/request
// (TN360_SNAPSHOT_KEY). All the camera's channels are requested.
//
// Times: the user types wall-clock times in a chosen zone ("Times entered in")
// and picks the asset's zone; the page converts to UTC with daylight saving
// handled by the browser's time zone data, and shows both local times.
// Splitting: 10/30/60/120 s parts (TN360's dialog options) or one request for
// the full window. The page sends one call per part so it can show progress.
//
// Delete this file + its script tag + its nav item + its view div to remove.

(function () {
  'use strict';

  var MAX_SECONDS = 900;   // keep in step with CAMFOOTAGE_MAX_SECONDS

  var ZONES = [
    { tz: 'Australia/Brisbane',  label: 'QLD' },
    { tz: 'Australia/Sydney',    label: 'NSW / ACT' },
    { tz: 'Australia/Melbourne', label: 'VIC' },
    { tz: 'Australia/Hobart',    label: 'TAS' },
    { tz: 'Australia/Adelaide',  label: 'SA' },
    { tz: 'Australia/Darwin',    label: 'NT' },
    { tz: 'Australia/Perth',     label: 'WA' },
    { tz: 'UTC',                 label: 'UTC' }
  ];

  var SPLITS = [
    { value: '10',  label: '10 second parts' },
    { value: '30',  label: '30 second parts' },
    { value: '60',  label: '60 second parts' },
    { value: '120', label: '120 second parts (TN360 limit)' },
    { value: '0',   label: 'One request for the full window' }
  ];

  var PREF_KEY = 'tge.camfootage.prefs';
  var state = { lookup: null, busy: false };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function zoneLabel(tz) {
    for (var i = 0; i < ZONES.length; i++) if (ZONES[i].tz === tz) return ZONES[i].label;
    return tz;
  }

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch (e) { return {}; }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        entered: TGE.el('cf-tz-entered').value,
        asset:   TGE.el('cf-tz-asset').value,
        split:   TGE.el('cf-split').value
      }));
    } catch (e) {}
  }

  // Wall-clock parts of a UTC instant in a zone.
  function partsInZone(ms, tz) {
    var out = {};
    new Intl.DateTimeFormat('en-AU', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(ms)).forEach(function (p) { out[p.type] = p.value; });
    return {
      y: +out.year, mo: +out.month, d: +out.day,
      h: +out.hour % 24, mi: +out.minute, s: +out.second
    };
  }

  // Zone offset (ms) at a UTC instant, e.g. +10 h for Brisbane.
  function offsetAt(ms, tz) {
    var p = partsInZone(ms, tz);
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
  }

  // "YYYY-MM-DDTHH:MM(:SS)" typed in zone tz -> UTC ms (daylight saving aware).
  function wallToUtc(value, tz) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value || '');
    if (!m) return NaN;
    var guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    var ms = guess - offsetAt(guess, tz);
    return guess - offsetAt(ms, tz);
  }

  // UTC ms -> "YYYY-MM-DDTHH:MM:SS" wall clock in zone tz (datetime-local value).
  function utcToWall(ms, tz) {
    var p = partsInZone(ms, tz);
    return p.y + '-' + pad(p.mo) + '-' + pad(p.d) + 'T' + pad(p.h) + ':' + pad(p.mi) + ':' + pad(p.s);
  }

  function fmtZone(ms, tz) {
    var p = partsInZone(ms, tz);
    return pad(p.d) + '/' + pad(p.mo) + '/' + p.y + ' ' + pad(p.h) + ':' + pad(p.mi) + ':' + pad(p.s);
  }

  function fmtLength(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m ? (m + ' min' + (s ? ' ' + s + ' s' : '')) : (s + ' s');
  }

  function setMessage(text, isError) {
    var el = TGE.el('cf-message');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', !!isError);
  }

  function makeField(label, id, type, attrs) {
    var wrap = document.createElement('div');
    wrap.className = 'field';
    var lab = document.createElement('label');
    lab.setAttribute('for', id);
    lab.textContent = label;
    var inp = document.createElement('input');
    inp.id = id;
    inp.type = type;
    Object.keys(attrs || {}).forEach(function (k) { inp.setAttribute(k, attrs[k]); });
    wrap.appendChild(lab);
    wrap.appendChild(inp);
    return wrap;
  }

  function makeSelect(label, id, options, selected) {
    var wrap = document.createElement('div');
    wrap.className = 'field';
    var lab = document.createElement('label');
    lab.setAttribute('for', id);
    lab.textContent = label;
    var sel = document.createElement('select');
    sel.id = id;
    options.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      if (o.value === selected) opt.selected = true;
      sel.appendChild(opt);
    });
    wrap.appendChild(lab);
    wrap.appendChild(sel);
    return wrap;
  }

  // ── Render ───────────────────────────────────────────────────────
