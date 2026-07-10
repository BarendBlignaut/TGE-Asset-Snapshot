// TGE Asset Snapshot — Platform Flow Engine (v3 — declared funnel)
// public/platform/platform-flow-engine.js
//
// Executes a screen's flows as a declared funnel, reading step_role:
//   seed   (api)          → build the working set (one row per Asset ID)
//   join   (api)          → merge devices onto assets AND prune both orphans
//   filter (hardware_set) → keep only assets carrying set-matching hardware
//   annotate (hardware)   → attach hardware info, never prune
//   enrich (api)          → left-join extra data onto survivors, never prune
//   grade  (control_table)→ apply CT rules (number | days_since), hardware-scoped
//
// One public call:
//   TGE.Platform.FlowEngine.run('asset-track', { onProgress: fn })
//     → { ok, rows, warnings, meta }

(function () {
  'use strict';

  function valAt(obj, path) {
    if (!path) return undefined;
    return String(path).split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
  }
  function parseJsonSafe(s, fb) {
    if (s == null) return fb;
    if (typeof s === 'object') return s;
    try { return JSON.parse(s); } catch (e) { return fb; }
  }
  function round2(v) {
    if (typeof v !== 'number' || !isFinite(v)) return v;
    return Math.round(v * 100) / 100;
  }

  async function execFetch(apiId, moduleTag) {
    var res = await TGE.api('POST', '/api/registry/apis/' + encodeURIComponent(apiId) + '/execute', { feature: moduleTag, params: {} });
    if (!res.ok || !res.data || res.data.ok === false) {
      throw new Error(apiId + ': ' + ((res.data && (res.data.error || ('HTTP ' + res.data.status))) || 'execute failed'));
    }
    return res.data.data;
  }

  function extractTagged(def, payload, warnings) {
    var tags = parseJsonSafe(def.fields, []);
    if (!Array.isArray(tags) || !tags.length) { warnings.push(def.api_id + ': no field tags.'); return []; }
    tags.forEach(function (t) {
      if (!t.filterKey && t.path) {
        var m = String(t.path).match(/\[where\s+([^=\]]+)=([^\]]+)\]\.(.+)$/);
        if (m) { t.filterKey = m[1].trim(); t.filterVal = m[2].trim(); t.extractField = m[3].trim(); t.isArrayFilter = true; }
      }
    });
    var plain   = tags.filter(function (t) { return !t.isArrayFilter; });
    var filters = tags.filter(function (t) { return t.isArrayFilter; });

    var units;
    if (Array.isArray(payload)) units = payload;
    else if (payload && typeof payload === 'object') units = Object.keys(payload).map(function (k) { return payload[k]; });
    else { warnings.push(def.api_id + ': unrecognised response shape.'); return []; }

    return units.map(function (unit) {
      var out = {};
      var flat = Array.isArray(unit) ? (unit[0] || {}) : unit;
      plain.forEach(function (t) {
        var p = t.path || t.name;
        if (p && p.indexOf('[]') !== -1) p = p.split('[].').pop();
        var v = valAt(flat, p);
        if (v !== undefined) out[t.label || t.name] = round2(v);
      });
if (Array.isArray(unit)) {
        filters.forEach(function (t) {
          var hit = unit.find(function (it) { return String(valAt(it, t.filterKey)) === String(t.filterVal); });
          if (hit) { var v = valAt(hit, t.extractField); if (v !== undefined) out[t.label || t.name] = round2(v); }
        });
      }
      // Attach declared key VALUES (A/B/C) from tags carrying a key selector.
      // This is what the join reads — not a guessed label.
      var kv = {};
      tags.forEach(function (t) {
        if (!t.key) return;
        var kp = t.path || t.name;
        if (kp && kp.indexOf('[]') !== -1) kp = kp.split('[].').pop();
        var val = valAt(flat, kp);
        if (val != null) kv[t.key] = String(val);
      });
      if (Object.keys(kv).length) out.__keys = kv;
      return out;
      return out;
    });
  }

  function assetKey(rec) {
    // Join key = declared key A (from the A/B/C selector). Falls back to a
    // literal "Asset ID" label for any pre-key definitions, so nothing breaks.
    if (rec.__keys && rec.__keys.a != null) return String(rec.__keys.a);
    return rec['Asset ID'] != null ? String(rec['Asset ID']) : null;
  }
  function isDeviceShaped(rec) {
    return rec['Model ID'] !== undefined || rec['Device Type Code'] !== undefined || rec['Model'] !== undefined;
  }

  function deviceMatchesSet(dev, members) {
    var mid = dev['Model ID'] != null ? String(dev['Model ID']) : null;
    var tc  = dev['Device Type Code'] != null ? String(dev['Device Type Code']) : null;
    return members.some(function (m) {
      if (m.model_id != null && mid != null && String(m.model_id) === mid) return true;
      if (m.type_code && tc && String(m.type_code) === tc) return true;
      return false;
    });
  }

  function applyCT(ct, row, matchedDevices, warnings) {
    var outField = ct.output_field || 'ctOutput';
    var scoped = (ct.hardware || []).length === 0 || matchedDevices.some(function (d) {
      var name = String(d['Model'] || d['Device Type'] || '').toLowerCase();
      if (!name) return false;
      return (ct.hardware || []).some(function (h) {
        var hs = String(h).toLowerCase();
        return name.indexOf(hs) !== -1 || hs.indexOf(name) !== -1;
      });
    });
    if (!scoped) { row[outField] = 'N/A'; row[outField + 'Colour'] = 'gray'; return; }

    var want = String(ct.value_source || '').toLowerCase().replace(/[\s_]/g, '');
    var srcKey = null;
    Object.keys(row).forEach(function (k) { if (k.toLowerCase().replace(/[\s_]/g, '') === want) srcKey = k; });
    var raw = srcKey != null ? row[srcKey] : undefined;

    var evalVal;
    if (String(ct.evaluate_as) === 'days_since') {
      var d = raw ? new Date(raw) : null;
      evalVal = (d && !isNaN(d.getTime())) ? Math.floor((Date.now() - d.getTime()) / 86400000) : NaN;
    } else {
      evalVal = typeof raw === 'number' ? raw : parseFloat(raw);
    }
    if (raw === undefined || isNaN(evalVal)) { row[outField] = 'Unknown'; row[outField + 'Colour'] = 'gray'; return; }

    var rule = (ct.rules || []).find(function (r) {
      return (r.min_value == null || evalVal >= r.min_value) && (r.max_value == null || evalVal <= r.max_value);
    });
    if (rule) { row[outField] = rule.output_value; row[outField + 'Colour'] = rule.output_colour || 'gray'; }
    else      { row[outField] = 'Unknown'; row[outField + 'Colour'] = 'gray'; }
  }

  async function run(moduleTag, options) {
    options = options || {};
    var progress = typeof options.onProgress === 'function' ? options.onProgress : function () {};
    var warnings = [];

    progress('Loading flows for ' + moduleTag + '...');
    var bRes = await TGE.api('GET', '/api/engine/flows/' + encodeURIComponent(moduleTag));
    if (!bRes.ok || !bRes.data.ok) return { ok: false, error: (bRes.data && bRes.data.error) || 'Could not load flows.', rows: [], warnings: warnings };
    var bundle = bRes.data;
    if (!bundle.flows.length) return { ok: true, rows: [], warnings: ['No active flows tagged ' + moduleTag + '.'], meta: { flows: 0 } };

    var allRows = [];

    for (var fi = 0; fi < bundle.flows.length; fi++) {
      var flow = bundle.flows[fi];
      var steps = bundle.steps.filter(function (s) { return s.flow_id === flow.id; })
                              .sort(function (a, b) { return a.sort_order - b.sort_order; });

      var assets = {};
      var devicesByAsset = {};
      var matchedByAsset = {};
      var seeded = false;

      for (var si = 0; si < steps.length; si++) {
        var step = steps[si];
        var role = step.step_role || '';

        if (step.step_type === 'api_definition') {
          var def = bundle.definitions.find(function (d) { return d.api_id === step.step_ref; });
          if (!def) { warnings.push(flow.name + ': definition ' + step.step_ref + ' missing.'); continue; }
          if (String(def.url).indexOf('{') !== -1) { warnings.push(flow.name + ': ' + def.api_id + ' needs per-asset params — not in engine v1.'); continue; }
          progress('[' + (role || 'api') + '] ' + def.api_id + ' — ' + (def.label || '') + '...');
          var tagged = extractTagged(def, await execFetch(def.api_id, moduleTag), warnings);

          if (role === 'seed' || !seeded) {
            tagged.forEach(function (rec) { var k = assetKey(rec); if (k) assets[k] = Object.assign(assets[k] || {}, rec); });
            seeded = true;
} else if (role === 'join') {
            tagged.forEach(function (rec) {
              var k = assetKey(rec); if (!k) return;
              if (isDeviceShaped(rec)) {
                (devicesByAsset[k] = devicesByAsset[k] || []).push(rec);
                // Merge device fields onto the asset row NOW, keyed on A —
                // independent of any hardware-set step. Existing fields win.
                if (assets[k]) assets[k] = Object.assign({}, rec, assets[k]);
              } else if (assets[k]) {
                assets[k] = Object.assign(assets[k], rec);
              }
            });
            Object.keys(assets).forEach(function (k) { if (!devicesByAsset[k]) delete assets[k]; });
          } else {
            tagged.forEach(function (rec) {
              var k = assetKey(rec); if (!k) return;
              if (assets[k]) assets[k] = Object.assign({}, rec, assets[k]);
            });
          }
          continue;
        }

        if (step.step_type === 'hardware_set') {
          var members = bundle.hardwareSets[flow.id + ':' + step.step_ref] || [];
          progress('[' + (role || 'filter') + '] hardware set: ' + step.step_ref + '...');
          Object.keys(devicesByAsset).forEach(function (k) {
            var matched = devicesByAsset[k].filter(function (d) { return deviceMatchesSet(d, members); });
            if (matched.length) {
              matchedByAsset[k] = matched;
              if (assets[k]) {
                assets[k]['Hardware'] = matched.map(function (d) { return d['Model'] || ''; }).filter(Boolean).join(', ');
                if (assets[k]['Model'] === undefined && matched[0]['Model'] !== undefined) assets[k]['Model'] = matched[0]['Model'];
              }
            }
          });
          if (role !== 'annotate') {
            Object.keys(assets).forEach(function (k) { if (!matchedByAsset[k]) delete assets[k]; });
          }
          continue;
        }

        if (step.step_type === 'control_table') {
          var ct = bundle.controlTables.find(function (c) { return String(c.id) === String(step.step_ref); });
          if (!ct) { warnings.push(flow.name + ': control table ' + step.step_ref + ' missing.'); continue; }
          progress('[grade] ' + (ct.name || ('CT-' + ct.id)) + '...');
          Object.keys(assets).forEach(function (k) { applyCT(ct, assets[k], matchedByAsset[k] || [], warnings); });
          continue;
        }

        if (step.step_type === 'hardware_type') { warnings.push(flow.name + ': individual hardware_type steps not in engine v1 — use a hardware set.'); continue; }
        warnings.push(flow.name + ': unknown step type "' + step.step_type + '".');
      }

Object.keys(assets).forEach(function (k) {
        delete assets[k].__keys;
        assets[k].__flow = flow.name; assets[k].__vendor = flow.vendor_id;
        allRows.push(assets[k]);
      });
    }

    progress('Done — ' + allRows.length + ' assets.');
    return { ok: true, rows: allRows, warnings: warnings, meta: { flows: bundle.flows.length } };
  }

  window.TGE = window.TGE || {};
  TGE.Platform = TGE.Platform || {};
  TGE.Platform.FlowEngine = { run: run };

})();
