// TGE Asset Snapshot — Fleet Utilisation: Static Fleet List
// src/utilisation-static-fleet.js
//
// CHANGES IN THIS VERSION (see fleet-utilisation-spec.md for full reasoning):
// 1. Removed import_run_id from utilisation_static_fleet writes — that column
//    doesn't exist in live D1. This was the bug causing every import to fail.
// 2. Added status / first_seen_at / last_seen_at handling — soft-delete any
//    active asset missing from the current import, auto-reactivate any
//    inactive asset that reappears. Required for the History toggle later.
// 3. Exclusion rules are no longer applied at import time — only at query
//    time in handleGetStaticFleet. Import now saves every row unconditionally.
//    (Import-time filtering was destructive: a bad rule could drop data that
//    would then be missing for up to a week, until the next import.)
// 4. Batched all D1 writes via env.DB.batch() instead of one row = one
//    round-trip. The real file is 11,588 rows — sequential awaits would be
//    ~23,000+ round trips and risks timing out the Worker.
// 5. import_runs is now written once, at the end, with real counts
//    (inserted/updated/failed) and status success/partial/failed — not a
//    hardcoded 'success' at the start that's never corrected.
// 6. Rows with no identity value are logged to utilisation_import_errors
//    instead of just being silently counted.

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

function rowMatchesAnyRule(fieldValues, rules) {
  for (const rule of rules) {
    const value = fieldValues[rule.sourceColumn ?? rule.source_column];
    if (value == null) continue;
    const strVal = String(value);
    const matchType = rule.matchType || rule.match_type;
    const matchValue = rule.matchValue || rule.match_value;
if (matchType === "exact" && strVal === matchValue) return true;
    if (matchType === "contains") {
      const escaped = String(matchValue).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const wholeWordPattern = new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i");
      if (wholeWordPattern.test(strVal)) return true;
    }
  }
  return false;
}

// Splits an array into chunks of `size` — used to keep each D1 batch() call
// to a sane number of statements rather than sending 11,000+ in one shot.
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

const BATCH_CHUNK_SIZE = 100;

async function runBatched(env, statements) {
  if (!statements.length) return;
  const chunks = chunkArray(statements, BATCH_CHUNK_SIZE);
  for (const chunk of chunks) {
    await env.DB.batch(chunk);
  }
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

  const hasTelematicsPick = fields.some(f => f.isTelematicsSource);
  if (hasTelematicsPick) {
    await env.DB.prepare("UPDATE utilisation_static_field_defs SET is_telematics_source = 0").run();
  }

  for (const f of fields) {
    if (!f.id) continue;
    await env.DB.prepare(
      `UPDATE utilisation_static_field_defs SET
        display_label = ?, save_to_db = ?, is_identity = ?, use_as_filter = ?,
        filter_label = ?, filter_type = ?, display_order = ?, enabled = ?,
        is_telematics_source = ?, updated_at = ?
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
      f.isTelematicsSource ? 1 : 0,
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
    const groupName = matchType === "exact" && r.groupName ? String(r.groupName).trim() || null : null;
    await env.DB.prepare(
      `INSERT INTO utilisation_static_exclusion_rules
        (status, source_column, match_type, match_value, reason, group_name, created_by, created_at)
       VALUES ('draft', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(r.sourceColumn, matchType, r.matchValue, r.reason || null, groupName, auth.session.user_id, nowIso()).run();
  }

  return jsonResponse({ ok: true });
}

async function handlePreviewStaticExclusions(request, env, auth) {
  const perm = await auth.hasPermission(env, auth.session.role_id, "utilisation", "manage-static-sanitising");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const body = await auth.safeJson(request);
  const rules = Array.isArray(body.rules) ? body.rules : [];

  const allRows = await env.DB.prepare("SELECT field_values FROM utilisation_static_fleet WHERE status = 'active'").all();
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
    "SELECT source_column, match_type, match_value, reason, group_name, created_by FROM utilisation_static_exclusion_rules WHERE status = 'draft'"
  ).all();

  await env.DB.prepare("DELETE FROM utilisation_static_exclusion_rules WHERE status = 'published'").run();

  for (const r of (draftRows.results || [])) {
    await env.DB.prepare(
      `INSERT INTO utilisation_static_exclusion_rules
        (status, source_column, match_type, match_value, reason, group_name, created_by, created_at, published_at)
       VALUES ('published', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(r.source_column, r.match_type, r.match_value, r.reason, r.group_name, r.created_by, nowIso(), nowIso()).run();
  }

  return jsonResponse({ ok: true, publishedCount: (draftRows.results || []).length });
}

// ── Import ───────────────────────────────────────────────────────────────────
async function handleImportStaticFleet(request, env) {
  const keyCheck = await requireImportKey(request, env);
  if (!keyCheck.ok) return keyCheck.response;

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON body." }, 400); }

  const sourceFile = String(body.sourceFile || "").trim() || null;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return jsonResponse({ error: "rows array is required and must not be empty." }, 400);

  const startedAt = nowIso();

  // Multi-chunk support: when a large file is split into several requests,
  // every chunk shares the same batchStartedAt (set by the client, once,
  // before sending the first chunk) and only the last chunk sets
  // isFinalChunk = true. Soft-delete only runs on the final chunk, and is
  // based on last_seen_at vs. batchStartedAt — so it correctly accounts for
  // assets touched by *any* chunk in the batch, not just this one request.
  // Single-shot (non-chunked) imports don't need to pass either field —
  // they default to "this is the only, and therefore final, chunk".
  const batchStartedAt = String(body.batchStartedAt || "").trim() || startedAt;
  const isFinalChunk = body.isFinalChunk !== false;

  try {
    // ── Field defs: self-seed any newly-seen source columns ──────────────────
    const defs = await getFieldDefs(env);
    const defByColumn = {};
    defs.forEach((d) => { defByColumn[d.source_column] = d; });

    const identityColumn = (defs.find((d) => d.is_identity === 1) || {}).source_column || "Legacy Number";
    const newColumnsDetected = [];

    // ── Phase A: parse rows into a de-duplicated map, keyed by legacy number ──
    // (last occurrence in the file wins if a legacy number appears twice)
    const parsedByLegacy = new Map();
    const errorStatements = [];
    let skippedNoIdentity = 0;
    let duplicateCount = 0;

    for (const row of rows) {
      for (const sourceColumn of Object.keys(row)) {
        if (!defByColumn[sourceColumn]) {
          const wasNew = await ensureFieldDef(env, sourceColumn);
          if (wasNew) newColumnsDetected.push(sourceColumn);
          defByColumn[sourceColumn] = { source_column: sourceColumn, save_to_db: 0, is_identity: 0 };
        }
      }

      const legacyNumber = row[identityColumn] != null ? String(row[identityColumn]).trim() : "";
      if (!legacyNumber) {
        skippedNoIdentity++;
        errorStatements.push(
          env.DB.prepare(
            `INSERT INTO utilisation_import_errors (import_run_id, feed, legacy_number, reason, raw_row, created_at)
             VALUES (?, 'static_fleet', NULL, ?, ?, ?)`
          ).bind(null, `Missing identity value (column: ${identityColumn})`, JSON.stringify(row), nowIso())
        );
        continue;
      }

      if (parsedByLegacy.has(legacyNumber)) duplicateCount++;

      const fieldValues = {};
      for (const sourceColumn of Object.keys(row)) {
        const def = defByColumn[sourceColumn];
        if (def && def.save_to_db === 1) fieldValues[sourceColumn] = row[sourceColumn];
      }

      parsedByLegacy.set(legacyNumber, fieldValues);
    }

    // ── Fetch current fleet state once, not per row ───────────────────────────
    const existingRows = await env.DB.prepare(
      "SELECT legacy_number, status FROM utilisation_static_fleet"
    ).all();
    const existingByLegacy = new Map();
    (existingRows.results || []).forEach((r) => existingByLegacy.set(r.legacy_number, r.status));

    // ── Phase B: build insert/update statements ────────────────────────────────
    const writeStatements = [];
    let insertedCount = 0;
    let updatedCount = 0;
    let reactivatedCount = 0;
    const seenLegacyNumbers = new Set();

    for (const [legacyNumber, fieldValues] of parsedByLegacy.entries()) {
      seenLegacyNumbers.add(legacyNumber);
      const existingStatus = existingByLegacy.get(legacyNumber);

      if (existingStatus !== undefined) {
        if (existingStatus === "inactive") reactivatedCount++;
        writeStatements.push(
          env.DB.prepare(
            `UPDATE utilisation_static_fleet
             SET field_values = ?, status = 'active', source_file = ?, last_seen_at = ?, updated_at = ?
             WHERE legacy_number = ?`
          ).bind(JSON.stringify(fieldValues), sourceFile, nowIso(), nowIso(), legacyNumber)
        );
        updatedCount++;
      } else {
        writeStatements.push(
          env.DB.prepare(
            `INSERT INTO utilisation_static_fleet
              (legacy_number, status, field_values, source_file, first_seen_at, last_seen_at, created_at, updated_at)
             VALUES (?, 'active', ?, ?, ?, ?, ?, ?)`
          ).bind(legacyNumber, JSON.stringify(fieldValues), sourceFile, nowIso(), nowIso(), nowIso(), nowIso())
        );
        insertedCount++;
      }
    }

    // ── Execute this chunk's writes before evaluating soft-delete ──────────────
    await runBatched(env, writeStatements);
    await runBatched(env, errorStatements);

    // ── Phase C: soft-delete — final chunk only ─────────────────────────────────
    // Anything currently active whose last_seen_at is still older than this
    // batch's start time was not touched by any chunk in this batch, so it's
    // genuinely missing from the current fleet file.
    let deactivatedCount = 0;
    if (isFinalChunk) {
      const deactivateResult = await env.DB.prepare(
        `UPDATE utilisation_static_fleet SET status = 'inactive', updated_at = ?
         WHERE status = 'active' AND last_seen_at < ?`
      ).bind(nowIso(), batchStartedAt).run();
      deactivatedCount = (deactivateResult.meta && deactivateResult.meta.changes) || 0;
    }

    // ── Log the run ─────────────────────────────────────────────────────────────
    const finishedAt = nowIso();
    const status = skippedNoIdentity > 0 ? "partial" : "success";
    const errorSummary = skippedNoIdentity > 0
      ? `${skippedNoIdentity} row(s) skipped — missing identity value in column "${identityColumn}".`
      : null;

    const runInsert = await env.DB.prepare(
      `INSERT INTO utilisation_import_runs
        (feed, source_file, status, row_count, inserted_count, updated_count, failed_count, error_summary, started_at, finished_at)
       VALUES ('static_fleet', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(sourceFile, status, rows.length, insertedCount, updatedCount, skippedNoIdentity, errorSummary, startedAt, finishedAt).run();
    const importRunId = runInsert.meta.last_row_id;

    // Backfill import_run_id on the error rows we just logged (they were
    // inserted with NULL since the run didn't have an id yet at that point).
    if (errorStatements.length) {
      await env.DB.prepare(
        `UPDATE utilisation_import_errors SET import_run_id = ? WHERE feed = 'static_fleet' AND import_run_id IS NULL AND created_at = ?`
      ).bind(importRunId, startedAt).run().catch(() => {});
    }

    return jsonResponse({
      ok: true,
      importRunId,
      isFinalChunk,
      batchStartedAt,
      inserted: insertedCount,
      updated: updatedCount,
      reactivated: reactivatedCount,
      deactivated: deactivatedCount,
      skippedNoIdentity,
      duplicatesInFile: duplicateCount,
      newColumnsDetected,
    });

  } catch (e) {
    await env.DB.prepare(
      `INSERT INTO utilisation_import_runs
        (feed, source_file, status, row_count, inserted_count, updated_count, failed_count, error_summary, started_at, finished_at)
       VALUES ('static_fleet', ?, 'failed', ?, 0, 0, 0, ?, ?, ?)`
    ).bind(sourceFile, rows.length, e.message, startedAt, nowIso()).run().catch(() => {});
    return jsonResponse({ error: "Import failed: " + e.message }, 500);
  }
}

// ── Column values (for the File Spec column browser) ─────────────────────────
async function handleGetStaticColumnValues(request, env, auth) {
  const perm = await auth.hasPermission(env, auth.session.role_id, "utilisation", "manage-static-sanitising");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const url = new URL(request.url);
  const column = url.searchParams.get("column");
  if (!column) return jsonResponse({ error: "column is required." }, 400);

  const rows = await env.DB.prepare("SELECT field_values FROM utilisation_static_fleet WHERE status = 'active'").all();
  const counts = new Map();

  for (const row of (rows.results || [])) {
    let values;
    try { values = JSON.parse(row.field_values); } catch { continue; }
    const raw = values[column];
    if (raw == null || raw === "") continue;
    const val = String(raw);
    counts.set(val, (counts.get(val) || 0) + 1);
  }

  const list = Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);

  return jsonResponse({ ok: true, column, values: list });
}
// Same as handleGetStaticFleet but WITHOUT the exclusion filter — File Spec
// needs to see every row, including ones matching published rules, since
// it's the screen that creates and manages those rules and can't be blind
// to their effect. Only File Spec calls this; the live dashboard keeps
// using the filtered handleGetStaticFleet below, unaffected.
async function handleGetStaticFleetRaw(request, env, auth) {
  const perm = await auth.hasPermission(env, auth.session.role_id, "utilisation", "view");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const url = new URL(request.url);
  const includeInactive = url.searchParams.get("history") === "1";

  const sql = includeInactive
    ? "SELECT legacy_number, status, field_values, first_seen_at, last_seen_at, created_at, updated_at FROM utilisation_static_fleet ORDER BY legacy_number ASC"
    : "SELECT legacy_number, status, field_values, first_seen_at, last_seen_at, created_at, updated_at FROM utilisation_static_fleet WHERE status = 'active' ORDER BY legacy_number ASC";

  const rows = await env.DB.prepare(sql).all();

  const fleet = (rows.results || []).map(row => {
    let values;
    try { values = JSON.parse(row.field_values); } catch { values = {}; }
    return {
      legacyNumber: row.legacy_number,
      status: row.status,
      fields: values,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  return jsonResponse({ ok: true, fleet });
}

async function handleGetStaticFleet(request, env, auth) {
  const perm = await auth.hasPermission(env, auth.session.role_id, "utilisation", "view");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const url = new URL(request.url);
  const includeInactive = url.searchParams.get("history") === "1";

  const sql = includeInactive
    ? "SELECT legacy_number, status, field_values, first_seen_at, last_seen_at, created_at, updated_at FROM utilisation_static_fleet ORDER BY legacy_number ASC"
    : "SELECT legacy_number, status, field_values, first_seen_at, last_seen_at, created_at, updated_at FROM utilisation_static_fleet WHERE status = 'active' ORDER BY legacy_number ASC";

  const rows = await env.DB.prepare(sql).all();

  const exclusionRows = await env.DB.prepare(
    "SELECT source_column, match_type, match_value FROM utilisation_static_exclusion_rules WHERE status = 'published'"
  ).all();
  const exclusionRules = (exclusionRows.results || []).map(r => ({
    sourceColumn: r.source_column, matchType: r.match_type, matchValue: r.match_value,
  }));

  const fleet = (rows.results || []).map(row => {
    let values;
    try { values = JSON.parse(row.field_values); } catch { values = {}; }
    return {
      legacyNumber: row.legacy_number,
      status: row.status,
      fields: values,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }).filter(row => !rowMatchesAnyRule(row.fields, exclusionRules));

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
  handleGetStaticFleetRaw,
};
