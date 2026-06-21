// TGE Asset Snapshot — Fleet Utilisation: Static Fleet List
// src/utilisation-static-fleet.js

function nowIso() {
  return new Date().toISOString();
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function requireImportKey(request, env) {
  const key = request.headers.get("X-Import-Key") || "";
  if (!env.UTILISATION_IMPORT_KEY) {
    return { ok: false, response: jsonResponse({ error: "Import key not configured on server." }, 503) };
  }
  if (!safeEqual(key, env.UTILISATION_IMPORT_KEY)) {
    return { ok: false, response: jsonResponse({ error: "Unauthorised." }, 401) };
  }
  return { ok: true };
}

async function getFieldDefs(env) {
  const rows = await env.DB.prepare(
    "SELECT * FROM utilisation_static_field_defs ORDER BY display_order ASC, id ASC"
  ).all();
  return rows.results || [];
}

async function ensureFieldDef(env, sourceColumn) {
  const existing = await env.DB.prepare(
    "SELECT id FROM utilisation_static_field_defs WHERE source_column = ?"
  ).bind(sourceColumn).first();
  if (existing) return false;

  await env.DB.prepare(
    `INSERT INTO utilisation_static_field_defs
      (source_column, display_label, save_to_db, is_identity, use_as_filter, filter_type, display_order, enabled, created_at, updated_at)
     VALUES (?, ?, 0, 0, 0, 'select', 999, 1, ?, ?)`
  ).bind(sourceColumn, sourceColumn, nowIso(), nowIso()).run();
  return true;
}

async function handleGetStaticFields(request, env, auth) {
  const perm = await auth.hasPermission(env, auth.session.role_id, "utilisation", "manage-field-mappings");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const defs = await getFieldDefs(env);
  return jsonResponse({ ok: true, fields: defs });
}

async function handleUpdateStaticFields(request, env, auth) {
  const perm = await auth.hasPermission(env, auth.session.role_id, "utilisation", "manage-field-mappings");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const body = await auth.safeJson(request);
  const fields = Array.isArray(body.fields) ? body.fields : [];

  for (const f of fields) {
    if (!f.id) continue;
    await env.DB.prepare(
      `UPDATE utilisation_static_field_defs SET
        display_label = ?, save_to_db = ?, is_identity = ?, use_as_filter = ?,
        filter_label = ?, filter_type = ?, display_order = ?, enabled = ?, updated_at = ?
       WHERE id = ?`
    ).bind(
      String(f.displayLabel || "").trim() || f.sourceColumn || "",
      f.saveToDb ? 1 : 0,
      f.isIdentity ? 1 : 0,
      f.useAsFilter ? 1 : 0,
      f.filterLabel ? String(f.filterLabel).trim() : null,
      f.filterType || "select",
      Number.isInteger(f.displayOrder) ? f.displayOrder : 0,
      f.enabled === false ? 0 : 1,
      nowIso(),
      f.id
    ).run();
  }

  return jsonResponse({ ok: true });
}

async function handleGetStaticExclusions(request, env, auth) {
  const perm = await auth.hasPermission(env, auth.session.role_id, "utilisation", "manage-static-sanitising");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const url = new URL(request.url);
  const status = url.searchParams.get("status") === "published" ? "published" : "draft";

  const rows = await env.DB.prepare(
    "SELECT * FROM utilisation_static_exclusion_rules WHERE status = ? ORDER BY source_column, id"
  ).bind(status).all();

  return jsonResponse({ ok: true, rules: rows.results || [] });
}

async function handleSaveStaticExclusionsDraft(request, env, auth) {
  const perm = await auth.hasPermission(env, auth.session.role_id, "utilisation", "manage-static-sanitising");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const body = await auth.safeJson(request);
  const rules = Array.isArray(body.rules) ? body.rules : [];

  await env.DB.prepare("DELETE FROM utilisation_static_exclusion_rules WHERE status = 'draft'").run();

  for (const r of rules) {
    if (!r.sourceColumn || !r.matchValue) continue;
    const matchType = r.matchType === "exact" ? "exact" : "contains";
    await env.DB.prepare(
      `INSERT INTO utilisation_static_exclusion_rules
        (status, source_column, match_type, match_value, reason, created_by, created_at)
       VALUES ('draft', ?, ?, ?, ?, ?, ?)`
    ).bind(r.sourceColumn, matchType, r.matchValue, r.reason || null, auth.session.user_id, nowIso()).run();
  }

  return jsonResponse({ ok: true });
}

async function handlePreviewStaticExclusions(request, env, auth) {
  const perm = await auth.hasPermission(env, auth.session.role_id, "utilisation", "manage-static-sanitising");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const body = await auth.safeJson(request);
  const rules = Array.isArray(body.rules) ? body.rules : [];

  const allRows = await env.DB.prepare("SELECT field_values FROM utilisation_static_fleet").all();
  const total = (allRows.results || []).length;
  let excluded = 0;

  for (const row of (allRows.results || [])) {
    let values;
    try { values = JSON.parse(row.field_values); } catch { values = {}; }
    if (rowMatchesAnyRule(values, rules)) excluded++;
  }

  return jsonResponse({ ok: true, total, excluded, wouldShow: total - excluded });
}

async function handlePublishStaticExclusions(request, env, auth) {
  const perm = await auth.hasPermission(env, auth.session.role_id, "utilisation", "manage-static-sanitising");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const draftRows = await env.DB.prepare(
    "SELECT source_column, match_type, match_value, reason, created_by FROM utilisation_static_exclusion_rules WHERE status = 'draft'"
  ).all();

  await env.DB.prepare("DELETE FROM utilisation_static_exclusion_rules WHERE status = 'published'").run();

  for (const r of (draftRows.results || [])) {
    await env.DB.prepare(
      `INSERT INTO utilisation_static_exclusion_rules
        (status, source_column, match_type, match_value, reason, created_by, created_at, published_at)
       VALUES ('published', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(r.source_column, r.match_type, r.match_value, r.reason, r.created_by, nowIso(), nowIso()).run();
  }

  return jsonResponse({ ok: true, publishedCount: (draftRows.results || []).length });
}

function rowMatchesAnyRule(fieldValues, rules) {
  for (const rule of rules) {
    const value = fieldValues[rule.sourceColumn ?? rule.source_column];
    if (value == null) continue;
    const strVal = String(value);
    const matchType = rule.matchType || rule.match_type;
    const matchValue = rule.matchValue || rule.match_value;
    if (matchType === "exact" && strVal === matchValue) return true;
    if (matchType === "contains" && strVal.toUpperCase().includes(String(matchValue).toUpperCase())) return true;
  }
  return false;
}

async function handleImportStaticFleet(request, env) {
  const keyCheck = await requireImportKey(request, env);
  if (!keyCheck.ok) return keyCheck.response;

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON body." }, 400); }

  const sourceFile = String(body.sourceFile || "").trim() || null;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return jsonResponse({ error: "rows array is required and must not be empty." }, 400);

  const startedAt = nowIso();
  const runInsert = await env.DB.prepare(
    `INSERT INTO utilisation_import_runs (feed, source_file, status, row_count, started_at)
     VALUES ('static_fleet', ?, 'success', ?, ?)`
  ).bind(sourceFile, rows.length, startedAt).run();
  const importRunId = runInsert.meta.last_row_id;

  const defs = await getFieldDefs(env);
  const defByColumn = {};
  defs.forEach((d) => { defByColumn[d.source_column] = d; });

  let identityColumn = defs.find((d) => d.is_identity === 1)?.source_column || "Legacy Number";

  const exclusionRows = await env.DB.prepare(
    "SELECT source_column, match_type, match_value FROM utilisation_static_exclusion_rules WHERE status = 'published'"
  ).all();
  const exclusionRules = exclusionRows.results || [];

  const newColumnsDetected = [];
  const seenLegacyNumbers = [];
  let insertedCount = 0;
  let updatedCount = 0;
  let excludedCount = 0;
  let skippedNoIdentity = 0;

  for (const row of rows) {
    for (const sourceColumn of Object.keys(row)) {
      if (!defByColumn[sourceColumn]) {
        const wasNew = await ensureFieldDef(env, sourceColumn);
        if (wasNew) newColumnsDetected.push(sourceColumn);
        defByColumn[sourceColumn] = { source_column: sourceColumn, save_to_db: 0, is_identity: 0 };
      }
    }

    const legacyNumber = row[identityColumn] != null ? String(row[identityColumn]).trim() : "";
    if (!legacyNumber) { skippedNoIdentity++; continue; }

    if (rowMatchesAnyRule(row, exclusionRules.map((r) => ({
      sourceColumn: r.source_column, matchType: r.match_type, matchValue: r.match_value,
    })))) {
      excludedCount++;
      continue;
    }

    const fieldValues = {};
    for (const sourceColumn of Object.keys(row)) {
      const def = defByColumn[sourceColumn];
      if (def && def.save_to_db === 1) {
        fieldValues[sourceColumn] = row[sourceColumn];
      }
    }

    seenLegacyNumbers.push(legacyNumber);

    const existing = await env.DB.prepare(
      "SELECT id FROM utilisation_static_fleet WHERE legacy_number = ?"
    ).bind(legacyNumber).first();

    if (existing) {
      await env.DB.prepare(
        "UPDATE utilisation_static_fleet SET field_values = ?, import_run_id = ?, updated_at = ? WHERE legacy_number = ?"
      ).bind(JSON.stringify(fieldValues), importRunId, nowIso(), legacyNumber).run();
      updatedCount++;
    } else {
      await env.DB.prepare(
        "INSERT INTO utilisation_static_fleet (legacy_number, field_values, import_run_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(legacyNumber, JSON.stringify(fieldValues), importRunId, nowIso(), nowIso()).run();
      insertedCount++;
    }
  }

  return jsonResponse({
    ok: true,
    importRunId,
    inserted: insertedCount,
    updated: updatedCount,
    excluded: excludedCount,
    skippedNoIdentity,
    newColumnsDetected,
  });
}

async function handleGetStaticFleet(request, env, auth) {
  const perm = await auth.hasPermission(env, auth.session.role_id, "utilisation", "view");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const rows = await env.DB.prepare(
    "SELECT legacy_number, field_values, created_at, updated_at FROM utilisation_static_fleet ORDER BY legacy_number ASC"
  ).all();

  const exclusionRows = await env.DB.prepare(
    "SELECT source_column, match_type, match_value FROM utilisation_static_exclusion_rules WHERE status = 'published'"
  ).all();

  const fleet = (rows.results || []).map(row => {
    let values;
    try { values = JSON.parse(row.field_values); } catch { values = {}; }
    return { legacyNumber: row.legacy_number, fields: values, createdAt: row.created_at, updatedAt: row.updated_at };
  }).filter(row => !rowMatchesAnyRule(row.fields, (exclusionRows.results || []).map(r => ({
    sourceColumn: r.source_column, matchType: r.match_type, matchValue: r.match_value,
  }))));

  return jsonResponse({ ok: true, fleet });
}

export {
  handleGetStaticFields,
  handleUpdateStaticFields,
  handleGetStaticExclusions,
  handleSaveStaticExclusionsDraft,
  handlePreviewStaticExclusions,
  handlePublishStaticExclusions,
  handleImportStaticFleet,
  handleGetStaticFleet,
};
