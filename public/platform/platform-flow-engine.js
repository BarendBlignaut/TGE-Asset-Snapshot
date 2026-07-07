// TGE Asset Snapshot — Platform Flow Engine (v1)
// public/platform/platform-flow-engine.js
//
// Executes the flows defined for a screen. One public call:
//   TGE.Platform.FlowEngine.run('asset-track', { onProgress: fn })
//     → { ok, rows, warnings, meta }
//
// v1 scope = exactly what flow 1 exercises (grows per consumer):
//   - fleet-wide api_definition steps (no {placeholder} per-asset loops yet)
//   - hardware_set steps (match devices on model_id / type_code)
//   - control_table threshold steps (min/max → output + colour)
//   - tag mapping: plain path tags + structured array-filter tags,
//     map-shaped responses iterated by values (per Constraint Notes)
// All upstream calls go through one internal function (execFetch) —
// the deliberate cache seam for engine phase 2.

(function () {
  'use strict';

  // ── Small utils ────────────────────────────────────────────────────────────
  function valAt(obj, path) {
    if (!path) return undefined;
    return String(path).split('.').reduce(function (o, k) {
      return o == null ? o : o[k];
    }, obj);
  }
  function parseJsonSafe(s, fallback) {
    if (s == null) return fallback;
    if (typeof s === 'object') return s;
    try { return JSON.parse(s); } catch (e) { return fallback; }
  }

  function outputKey(tag) {
  return tag.mapsTo || tag.label || tag.name;
}

function cleanPath(path) {
  if (!path) return '';
  var p = String(path).trim();
  if (p.indexOf('[].') !== -1) p = p.split('[].').pop();
  p = p.replace(/^\[\]\./, '');
  return p;
}

function ensureAssetId(out, source, mapKey) {
  if (out['Asset ID'] != null) return;

  var id =
    out.assetId ||
    out.vehicleId ||
    (source && source.vehicleId) ||
    (source && source.assetId) ||
    (source && source.id) ||
    mapKey;

  if (id != null) out['Asset ID'] = id;
}

  // ── The cache seam: every upstream call passes through here ────────────────
  async function execFetch(apiId, moduleTag, params) {
    var res = await TGE.api('POST', '/api/registry/apis/' + encodeURIComponent(apiId) + '/execute', {
      feature: moduleTag,
      params: params || {},
    });
    if (!res.ok || !res.data || res.data.ok === false) {
      var msg = (res.data && (res.data.error || ('HTTP ' + res.data.status))) || 'execute failed';
      throw new Error(apiId + ': ' + msg);
    }
    return res.data.data; // full parsed upstream response
  }

  // ── Tag extraction ──────────────────────────────────────────────────────────
  // Returns an array of per-record objects keyed by tag LABEL (standard names).
  // Handles: plain arrays of records, and map-shaped responses (object whose
  // values are record arrays — e.g. meters keyed by vehicleId).
function extractTagged(def, payload, warnings) {
  var tags = parseJsonSafe(def.fields, []);
  if (!Array.isArray(tags) || !tags.length) {
    warnings.push(def.api_id + ': no field tags — response ignored.');
    return [];
  }

  tags.forEach(function (t) {
    if (!t.filterKey && t.path) {
      var m = String(t.path).match(/\[where\s+([^=\]]+)=([^\]]+)\]\.(.+)$/);
      if (m) {
        t.filterKey = cleanPath(m[1]);
        t.filterVal = m[2].trim();
        t.extractField = cleanPath(m[3]);
        t.isArrayFilter = true;
      }
    }

    if (t.path) t.path = cleanPath(t.path);
    if (t.filterKey) t.filterKey = cleanPath(t.filterKey);
    if (t.extractField) t.extractField = cleanPath(t.extractField);
  });

  var plain = tags.filter(function (t) { return !t.isArrayFilter; });
  var filters = tags.filter(function (t) { return t.isArrayFilter; });

  var units = [];
  if (Array.isArray(payload)) {
    units = payload.map(function (v) {
      return { mapKey: null, value: v };
    });
  } else if (payload && typeof payload === 'object') {
    units = Object.keys(payload).map(function (k) {
      return { mapKey: k, value: payload[k] };
    });
  } else {
    warnings.push(def.api_id + ': unrecognised response shape — ignored.');
    return [];
  }

  return units.map(function (wrapped) {
    var unit = wrapped.value;
    var mapKey = wrapped.mapKey;
    var out = {};
    var plainSource = Array.isArray(unit) ? (unit[0] || {}) : unit;

    plainSource = Object.assign({ __mapKey: mapKey }, plainSource || {});

    plain.forEach(function (t) {
      var v = valAt(plainSource, cleanPath(t.path || t.name));
      if (v !== undefined) out[outputKey(t)] = v;
    });

    if (Array.isArray(unit)) {
      filters.forEach(function (t) {
        var hit = unit.find(function (item) {
          return String(valAt(item, t.filterKey)) === String(t.filterVal);
        });

        if (hit) {
          var v = valAt(hit, t.extractField);
          if (v !== undefined) out[outputKey(t)] = v;
          ensureAssetId(out, hit, mapKey);
        }
      });
    } else if (filters.length) {
      filters.forEach(function (t) {
        if (String(valAt(unit, t.filterKey)) === String(t.filterVal)) {
          var v = valAt(unit, t.extractField);
          if (v !== undefined) out[outputKey(t)] = v;
        }
      });
    }

    ensureAssetId(out, plainSource, mapKey);
    return out;
  });
}

  // ── Hardware set: which of an asset's devices belong to the set ────────────
  function matchHardware(deviceRecords, setMembers) {
    // deviceRecords: tagged device rows for one asset (need Model ID / Device Type Code)
    // setMembers: hardware_types rows (model_id, type_code)
    return deviceRecords.filter(function (d) {
      var mid  = d['Model ID']         != null ? String(d['Model ID'])         : null;
      var tcode = d['Device Type Code'] != null ? String(d['Device Type Code']) : null;
      return setMembers.some(function (m) {
        if (m.model_id != null && mid != null) return String(m.model_id) === mid;
        if (m.type_code && tcode) return String(m.type_code) === tcode;
        return false;
      });
    });
  }

  // ── Control table: threshold rules → output value + colour ─────────────────
  function applyControlTable(ct, row, matchedHardware, warnings) {
    var outField = ct.output_field || 'ctOutput';
    // Which value do we evaluate? The CT's value_source names the field —
    // match it against the row's standard-named outputs (case-insensitive,
    // ignoring spaces) so 'battCurrent' finds 'Batt Current'.
    var srcKey = null;
    var want = String(ct.value_source || '').toLowerCase().replace(/[\s_]/g, '');
    Object.keys(row).forEach(function (k) {
      if (k.toLowerCase().replace(/[\s_]/g, '') === want) srcKey = k;
    });

    // Hardware scoping: CT applies only where a matched device fits one of
    // the CT's hardware_match strings (case-insensitive substring — same
    // semantics as the admin editor's free text).
    var applies = (ct.hardware || []).length === 0 || matchedHardware.some(function (d) {
      var name = String(d['Model'] || d['Device Type'] || '').toLowerCase();
      return (ct.hardware || []).some(function (h) {
        return name.indexOf(String(h).toLowerCase()) !== -1 ||
               String(h).toLowerCase().indexOf(name) !== -1 && name.length > 0;
      });
    });
    if (!applies) { row[outField] = 'N/A'; row[outField + 'Colour'] = 'gray'; return; }

    var raw = srcKey != null ? row[srcKey] : undefined;
    var val = typeof raw === 'number' ? raw : parseFloat(raw);
    if (raw === undefined || isNaN(val)) {
      row[outField] = 'Unknown'; row[outField + 'Colour'] = 'gray'; return;
    }

    var rule = (ct.rules || []).find(function (r) {
      var minOk = r.min_value == null || val >= r.min_value;
      var maxOk = r.max_value == null || val <= r.max_value;
      return minOk && maxOk;
    });
    if (rule) { row[outField] = rule.output_value; row[outField + 'Colour'] = rule.output_colour || 'gray'; }
    else      { row[outField] = 'Unknown'; row[outField + 'Colour'] = 'gray'; }
  }

  // ── The engine ──────────────────────────────────────────────────────────────
  async function run(moduleTag, options) {
    options = options || {};
    var progress = typeof options.onProgress === 'function' ? options.onProgress : function () {};
    var warnings = [];

    progress('Loading flows for ' + moduleTag + '...');
    var bundleRes = await TGE.api('GET', '/api/engine/flows/' + encodeURIComponent(moduleTag));
    if (!bundleRes.ok || !bundleRes.data.ok) {
      return { ok: false, error: (bundleRes.data && bundleRes.data.error) || 'Could not load flows.', rows: [], warnings: warnings };
    }
    var bundle = bundleRes.data;
    if (!bundle.flows.length) {
      return { ok: true, rows: [], warnings: ['No active flows tagged ' + moduleTag + '.'], meta: { flows: 0 } };
    }

    var allRows = [];

    for (var fi = 0; fi < bundle.flows.length; fi++) {
      var flow = bundle.flows[fi];
      var steps = bundle.steps.filter(function (s) { return s.flow_id === flow.id; });

      // Per-flow working state
    var apiResults = {};     // apiId → tagged record arrays
    var assetRows = {};      // Asset ID → merged row
    var assetDevices = {};   // Asset ID → tagged device records
    var matchedByAsset = {}; // Asset ID → devices matching the hardware set
    var ctQueue = [];
    var scopeLocked = false; // after hardware_set, API steps enrich only

      for (var si = 0; si < steps.length; si++) {
        var step = steps[si];

        if (step.step_type === 'api_definition') {
          var def = bundle.definitions.find(function (d) { return d.api_id === step.step_ref; });
          if (!def) { warnings.push(flow.name + ': definition ' + step.step_ref + ' missing/inactive — skipped.'); continue; }
          if (String(def.url).indexOf('{') !== -1) {
            warnings.push(flow.name + ': ' + def.api_id + ' needs per-asset params — not supported in engine v1, skipped.');
            continue;
          }
          progress('Calling ' + def.api_id + ' — ' + (def.label || '') + '...');
          var payload = await execFetch(def.api_id, moduleTag, null);
          var tagged = extractTagged(def, payload, warnings);
          apiResults[def.api_id] = tagged;

          tagged.forEach(function (rec) {
            var assetId = rec['Asset ID'];
            if (assetId == null) return;
          var key = String(assetId);

    // After hardware_set has run, API steps are enrichment only.
    // They may update existing in-scope rows, but must not create new rows.
    if (scopeLocked && !assetRows[key]) return;

    if (rec['Model ID'] !== undefined || rec['Device Type Code'] !== undefined) {
      (assetDevices[key] = assetDevices[key] || []).push(rec);
      assetRows[key] = Object.assign(assetRows[key] || { 'Asset ID': assetId }, rec);
    } else {
      assetRows[key] = Object.assign(assetRows[key] || { 'Asset ID': assetId }, rec);
}
          });
          continue;
        }

        if (step.step_type === 'hardware_set') {
          var members = bundle.hardwareSets[flow.id + ':' + step.step_ref] || [];
          if (!members.length) { warnings.push(flow.name + ': hardware set "' + step.step_ref + '" is empty.'); }
          progress('Matching hardware set: ' + step.step_ref + '...');
          Object.keys(assetDevices).forEach(function (key) {
            var matched = matchHardware(assetDevices[key], members);
            if (matched.length) {
              matchedByAsset[key] = matched;
              var row = assetRows[key] = assetRows[key] || { 'Asset ID': assetDevices[key][0]['Asset ID'] };
              row['Hardware'] = matched.map(function (d) { return d['Model'] || d['Device Type'] || ''; }).join(', ');
              matched.forEach(function (d) { row = Object.assign(row, {}); });
            }
          });
          // Assets with devices but none in the set are out of this flow's scope
          Object.keys(assetRows).forEach(function (key) {
  if (assetDevices[key] && !matchedByAsset[key]) assetRows[key].__outOfSet = true;
});

// Hardware set is the module scope lock.
// API steps after this point can only enrich existing rows.
scopeLocked = true;

continue;
}
          continue;
        }

        if (step.step_type === 'control_table') {
          var ct = bundle.controlTables.find(function (c) { return String(c.id) === String(step.step_ref); });
          if (!ct) { warnings.push(flow.name + ': control table ' + step.step_ref + ' missing/inactive — skipped.'); continue; }
          ctQueue.push(ct); // applied after all data steps, over final rows
          continue;
        }

        if (step.step_type === 'hardware_type') {
          warnings.push(flow.name + ': individual hardware_type steps not yet implemented in engine v1 — use a hardware set.');
          continue;
        }

        warnings.push(flow.name + ': unknown step type "' + step.step_type + '" — skipped.');
      }

      // Apply queued control tables to every in-scope asset row
      if (ctQueue.length) progress('Applying control tables...');
      var rows = Object.keys(assetRows)
        .filter(function (key) { return !assetRows[key].__outOfSet; })
        .map(function (key) {
          var row = assetRows[key];
          delete row.__outOfSet;
          row.__vendor = flow.vendor_id;
          row.__flow = flow.name;
          ctQueue.forEach(function (ct) {
            applyControlTable(ct, row, matchedByAsset[key] || [], warnings);
          });
          return row;
        });

      allRows = allRows.concat(rows);
    }

    progress('Done — ' + allRows.length + ' assets.');
    return { ok: true, rows: allRows, warnings: warnings, meta: { flows: bundle.flows.length } };
  }

  // ── Register ────────────────────────────────────────────────────────────────
  window.TGE = window.TGE || {};
  TGE.Platform = TGE.Platform || {};
  TGE.Platform.FlowEngine = { run: run };

})();
