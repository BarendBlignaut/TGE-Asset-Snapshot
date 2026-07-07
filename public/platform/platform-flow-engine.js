// TGE Asset Snapshot — Platform Flow Engine (v3.1 Production Strict)
// public/platform/platform-flow-engine.js
(function () {
  'use strict';

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
      out['Asset ID'] ||
      (source && (source.vehicleId || source.assetId || source.id || source.vehicle_id)) ||
      (source && source['Asset ID']) ||
      mapKey;
    if (id != null) out['Asset ID'] = String(id);
  }

  async function execFetch(apiId, moduleTag, params) {
    var res = await TGE.api('POST', '/api/registry/apis/' + encodeURIComponent(apiId) + '/execute', {
      feature: moduleTag,
      params: params || {},
    });
    if (!res.ok || !res.data || res.data.ok === false) {
      var msg = (res.data && (res.data.error || ('HTTP ' + res.data.status))) || 'execute failed';
      throw new Error(apiId + ': ' + msg);
    }
    return res.data.data;
  }

  function extractTagged(def, payload, warnings) {
    var tags = parseJsonSafe(def.fields, []);
    if (!Array.isArray(tags) || !tags.length) {
      warnings.push(def.api_id + ': no field tags — response ignored.');
      return [];
    }

    tags.forEach(function (t) {
      if (t.path) {
        var normalizedPath = String(t.path).trim();
        var m = normalizedPath.match(/^(?:\d+)?\[where\s+([^=\]]+)=([^\]]+)\]\.(.+)$/);
        if (m) {
          t.filterKey = cleanPath(m[1]);
          t.filterVal = m[2].trim().replace(/['"]/g, '');
          t.extractField = cleanPath(m[3]);
          t.isArrayFilter = true;
        } else {
          t.path = normalizedPath.replace(/^(?:\d+)/, '');
        }
      }
      if (t.path) t.path = cleanPath(t.path);
      if (t.filterKey) t.filterKey = cleanPath(t.filterKey);
      if (t.extractField) t.extractField = cleanPath(t.extractField);
    });

    var plain = tags.filter(function (t) { return !t.isArrayFilter; });
    var filters = tags.filter(function (t) { return t.isArrayFilter; });

    var units = [];
    if (payload && !Array.isArray(payload) && typeof payload === 'object') {
      var keys = Object.keys(payload);
      if (keys.length === 1 && Array.isArray(payload[keys[0]])) {
        payload = payload[keys[0]];
      }
    }

    if (Array.isArray(payload)) {
      units = payload.map(function (v) { return { mapKey: null, value: v }; });
    } else if (payload && typeof payload === 'object') {
      units = Object.keys(payload).map(function (k) { return { mapKey: k, value: payload[k] }; });
    } else {
      warnings.push(def.api_id + ': unrecognised response shape — ignored.');
      return [];
    }

    return units.map(function (wrapped) {
      var unit = wrapped.value;
      var mapKey = wrapped.mapKey;
      var out = {};
      
      var cleanUnit = function(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        var cleanObj = {};
        Object.keys(obj).forEach(function(k) {
          var cleanK = k.replace(/^(?:\d+)/, '');
          cleanObj[cleanK] = obj[k];
        });
        return Object.assign({}, obj, cleanObj);
      };

      var plainSource = cleanUnit(Array.isArray(unit) ? (unit[0] || {}) : unit);
      plainSource = Object.assign({ __mapKey: mapKey }, plainSource || {});

      plain.forEach(function (t) {
        var pathString = cleanPath(t.path || t.name);
        var v = valAt(plainSource, pathString) || valAt(plainSource, pathString.replace(/^\[\]\./, ''));
        if (v !== undefined) out[outputKey(t)] = v;
      });

      if (Array.isArray(unit)) {
        filters.forEach(function (t) {
          var hit = unit.find(function (item) {
            var targetItem = cleanUnit(item);
            return String(valAt(targetItem, t.filterKey)) === String(t.filterVal);
          });
          if (hit) {
            var targetHit = cleanUnit(hit);
            var v = valAt(targetHit, t.extractField);
            if (v !== undefined) out[outputKey(t)] = v;
            ensureAssetId(out, targetHit, mapKey);
          }
        });
      } else if (filters.length) {
        var targetedUnit = cleanUnit(unit);
        filters.forEach(function (t) {
          if (String(valAt(targetedUnit, t.filterKey)) === String(t.filterVal)) {
            var v = valAt(targetedUnit, t.extractField);
            if (v !== undefined) out[outputKey(t)] = v;
          }
        });
      }

      ensureAssetId(out, plainSource, mapKey);
      return out;
    });
  }

  function matchHardware(deviceRecords, setMembers) {
    return deviceRecords.filter(function (d) {
      var mid = d['Model ID'] != null ? String(d['Model ID']) : null;
      var tcode = d['Device Type Code'] != null ? String(d['Device Type Code']) : null;
      var mname = d['Model'] != null ? String(d['Model']).toLowerCase() : null;

      return setMembers.some(function (m) {
        if (m.model_id != null && mid != null && String(m.model_id) === mid) return true;
        if (m.type_code && tcode && String(m.type_code) === tcode) return true;
        if (m.model_name && mname && mname.indexOf(String(m.model_name).toLowerCase()) !== -1) return true;
        return false;
      });
    });
  }

  function applyControlTable(ct, row, matchedHardware, warnings) {
    var outField = ct.output_field || 'ctOutput';
    var srcKey = null;
    var want = String(ct.value_source || '').toLowerCase().replace(/[\s_]/g, '');
    
    Object.keys(row).forEach(function (k) {
      if (k.toLowerCase().replace(/[\s_]/g, '') === want) srcKey = k;
    });

    var applies = (ct.hardware || []).length === 0 || matchedHardware.some(function (d) {
      var name = String(d['Model'] || d['Device Type'] || '').toLowerCase();
      return (ct.hardware || []).some(function (h) {
        return name.indexOf(String(h).toLowerCase()) !== -1 || String(h).toLowerCase().indexOf(name) !== -1;
      });
    });

    if (!applies) { row[outField] = 'N/A'; row[outField + 'Colour'] = 'gray'; return; }

    var raw = srcKey != null ? row[srcKey] : undefined;
    
    // 🛑 REQUIREMENT: Handle blank telemetry values smoothly for assets that have no meter data
    if (raw === undefined || raw === null || raw === '') {
      if (row.__noMeterData) {
        row[outField] = 'NMD'; 
        row[outField + 'Colour'] = 'red'; 
      } else {
        row[outField] = 'Unknown'; 
        row[outField + 'Colour'] = 'gray';
      }
      return;
    }

    var val;
    var isStringMatch = false;

    if (typeof raw === 'string' && isNaN(raw) && !isNaN(Date.parse(raw))) {
      var pastDate = new Date(raw).getTime();
      var now = Date.now();
      val = (now - pastDate) / (1000 * 60 * 60); // Hours Since Last Contact
    } else if (typeof raw === 'string' && isNaN(parseFloat(raw))) {
      val = String(raw).trim().toLowerCase();
      isStringMatch = true;
    } else {
      val = typeof raw === 'number' ? raw : parseFloat(raw);
    }

    if (!isStringMatch && isNaN(val)) {
      row[outField] = 'Unknown'; row[outField + 'Colour'] = 'gray'; return;
    }

    var rule = (ct.rules || []).find(function (r) {
      if (isStringMatch) {
        var matchCriterion = (r.match_value || r.output_value || '').toLowerCase().trim();
        return val === matchCriterion;
      } else {
        var minOk = r.min_value == null || r.min_value === '' || val >= parseFloat(r.min_value);
        var maxOk = r.max_value == null || r.max_value === '' || val <= parseFloat(r.max_value);
        return minOk && maxOk;
      }
    });

    if (rule) { 
      row[outField] = rule.output_value; 
      row[outField + 'Colour'] = rule.output_colour || 'gray'; 
    } else { 
      row[outField] = 'Unknown'; 
      row[outField + 'Colour'] = 'gray'; 
    }
  }

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

      var apiResults = {};     
      var assetRows = {};      
      var assetDevices = {};   
      var matchedByAsset = {}; 
      var ctQueue = [];
      var scopeLocked = false; 

      for (var si = 0; si < steps.length; si++) {
        var step = steps[si];

        if (step.step_type === 'api_definition') {
          var def = bundle.definitions.find(function (d) { return d.api_id === step.step_ref; });
          if (!def) { warnings.push(flow.name + ': definition ' + step.step_ref + ' missing/inactive — skipped.'); continue; }
          
          progress('Calling ' + def.api_id + ' — ' + (def.label || '') + '...');
          var payload = await execFetch(def.api_id, moduleTag, null);
          var tagged = extractTagged(def, payload, warnings);
          apiResults[def.api_id] = tagged;

          tagged.forEach(function (rec) {
            var assetId = rec['Asset ID'];
            if (assetId == null) return;
            var key = String(assetId);

            // REAL-TIME EXCLUSION: Skip enrichment if the asset row was dropped by hardware_set
            if (scopeLocked && (!assetRows[key] || assetRows[key].__outOfSet)) return;

            // 🛑 REQUIREMENT: STRICT ENFORCEMENT. If this is subsequent enrichment data (API-2, API-3)
            // and the row was never initialized in the base step, drop it immediately. No ghost rows.
            var isFirstStep = (si === 0);
            if (!isFirstStep && !assetRows[key]) return;

            if (rec['Model ID'] !== undefined || rec['Device Type Code'] !== undefined || rec['Model'] !== undefined) {
              (assetDevices[key] = assetDevices[key] || []).push(rec);
            }
            assetRows[key] = Object.assign(assetRows[key] || { 'Asset ID': assetId }, rec);
          });
          continue;
        }

        if (step.step_type === 'hardware_set') {
          var members = bundle.hardwareSets[flow.id + ':' + step.step_ref] || [];
          
          progress('Matching hardware set: ' + step.step_ref + '...');
          
          Object.keys(assetRows).forEach(function (key) {
            var devices = assetDevices[key] || [];
            var matched = matchHardware(devices, members);
            
            if (matched.length > 0) {
              matchedByAsset[key] = matched;
              assetRows[key]['Hardware'] = matched.map(function (d) { return d['Model'] || d['Device Type'] || ''; }).join(', ');
            } else {
              assetRows[key].__outOfSet = true;
            }
          });

          scopeLocked = true;
          continue;
        }

        if (step.step_type === 'control_table') {
          var ct = bundle.controlTables.find(function (c) { return String(c.id) === String(step.step_ref); });
          if (!ct) { warnings.push(flow.name + ': control table ' + step.step_ref + ' missing/inactive — skipped.'); continue; }
          ctQueue.push(ct);
          continue;
        }
      }

      // Filter and clean the active assets list
      var rows = Object.keys(assetRows)
        .filter(function (key) { return !assetRows[key].__outOfSet; })
        .map(function (key) {
          var row = assetRows[key];
          delete row.__outOfSet;
          row.__vendor = flow.vendor_id;
          row.__flow = flow.name;
          
          // 🛑 REQUIREMENT: Detect rows that matched hardware parameters but completely lack telemetry indicators
          var hasTelemetry = (row['Batt Current'] !== undefined || row['Last Seen'] !== undefined);
          if (!hasTelemetry) {
            row.__noMeterData = true;
          }

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

  window.TGE = window.TGE || {};
  TGE.Platform = TGE.Platform || {};
  TGE.Platform.FlowEngine = { run: run };

})();
