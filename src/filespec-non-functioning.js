// TGE Asset Snapshot — Non-Functioning filespec processor
// Consumption feed (not master data). One row per asset, a real start and
// end date for the period it's genuinely non-functioning, both days
// inclusive. Unlike Workshop, this is a current snapshot, not an event log —
// each real import replaces that asset's own row entirely, never stacks
// alongside an older one. Dates are stored exactly as given, including any
// that reach into the future; nothing is capped at ingest time, since the
// dashboard's own date picker is what genuinely prevents a future date from
// ever being looked at in the first place.

import * as XLSX from "xlsx";

const SOURCE_NAME = "Non-Functioning";
const HEADER_ROW_INDEX = 0; // header sits on row 1

const COL_FLEET = "Fleet Number";
const COL_START = "Date Start";
const COL_END = "Date End";

const VENDOR_ID = 7; // Non-Functioning, confirmed against vendors table
const BATCH_SIZE = 100;

function nowIso() {
  return new Date().toISOString();
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function requireImportKey(request, env) {
  const suppliedKey = request.headers.get("X-Import-Key") || "";
  if (!env.UTILISATION_IMPORT_KEY) {
    return { ok: false, response: jsonResponse({ error: "Import key not configured on server." }, 503) };
  }
  if (suppliedKey !== env.UTILISATION_IMPORT_KEY) {
    return { ok: false, response: jsonResponse({ error: "Unauthorised." }, 401) };
  }
  return { ok: true };
}

// Formats a date cell to YYYY-MM-DD. Real Excel date cells come through as
// genuine Date objects with cellDates:true — a plain "DD/MM/YYYY" string is
// still handled defensively, matching the same pattern already proven for
// every other real vendor file.
function formatDateCell(cell) {
  if (cell instanceof Date) {
    const y = cell.getFullYear();
    const m = String(cell.getMonth() + 1).padStart(2, "0");
    const d = String(cell.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof cell === "string") {
    const iso = cell.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const dmy = cell.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  }
  return null;
}

async function loadWorkbookRows(env, importRecord) {
  const r2Object = await env.FILESPEC_BUCKET.get(importRecord.r2_key);
  if (!r2Object) throw new Error(`R2 object was not found: ${importRecord.r2_key}`);

  const workbookBytes = await r2Object.arrayBuffer();
  if (!workbookBytes || workbookBytes.byteLength === 0) throw new Error("The R2 workbook is empty.");

  const workbook = XLSX.read(new Uint8Array(workbookBytes), { type: "array", cellDates: true, raw: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: null });
  return { sheetName, rows };
}

// Walks every real data row beneath the header. A row missing a fleet
// number, or with a date that can't be read, is skipped rather than
// guessed at.
function walkNonFunctioningRows(rows) {
  const header = (rows[HEADER_ROW_INDEX] || []).map(h => (h == null ? "" : String(h).trim()));
  const colFleet = header.indexOf(COL_FLEET);
  const colStart = header.indexOf(COL_START);
  const colEnd = header.indexOf(COL_END);

  if (colFleet === -1 || colStart === -1 || colEnd === -1) {
    throw new Error(`Expected columns '${COL_FLEET}', '${COL_START}', '${COL_END}' in the header row.`);
  }

  const out = [];
  let skipped = 0;

  for (let i = HEADER_ROW_INDEX + 1; i < rows.length; i++) {
    const row = rows[i];
    const fleetRaw = row ? row[colFleet] : null;
    if (fleetRaw == null || String(fleetRaw).trim() === "") { skipped++; continue; }

    const dateStart = formatDateCell(row[colStart]);
    const dateEnd = formatDateCell(row[colEnd]);
    if (!dateStart || !dateEnd) { skipped++; continue; }

    out.push({ legacyNumber: String(fleetRaw).trim(), dateStart, dateEnd });
  }

  return { rows: out, skipped };
}

// ── Reusable pipeline core — takes just env and an import id, exactly like
// every other vendor pipeline, so it can be called directly by the manual
// test endpoint below, or automatically from the ingest chain in index.js
// the moment a real Non-Functioning file lands.
export async function runNonFunctioningPipeline(env, importId) {
  const importRecord = await env.DB.prepare(
    "SELECT * FROM filespec_imports WHERE id = ?"
  ).bind(importId).first();

  if (!importRecord) {
    throw new Error(`Import ${importId} was not found.`);
  }
  if (importRecord.source !== SOURCE_NAME) {
    throw new Error(`Import ${importId} is not a ${SOURCE_NAME} import.`);
  }

  await env.DB.prepare(
    "UPDATE filespec_imports SET status = 'parsing', error = NULL WHERE id = ?"
  ).bind(importId).run();

  try {
    const { rows } = await loadWorkbookRows(env, importRecord);
    const { rows: walked } = walkNonFunctioningRows(rows);

    const now = nowIso();
    const statements = walked.map(r =>
      env.DB.prepare(
        `INSERT INTO non_functioning_assets
          (legacy_number, date_start, date_end, vendor_id, import_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(legacy_number) DO UPDATE SET
           date_start = excluded.date_start,
           date_end = excluded.date_end,
           vendor_id = excluded.vendor_id,
           import_id = excluded.import_id,
           updated_at = excluded.updated_at`
      ).bind(r.legacyNumber, r.dateStart, r.dateEnd, VENDOR_ID, importId, now, now)
    );

    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      await env.DB.batch(statements.slice(i, i + BATCH_SIZE));
    }

    await env.DB.prepare(
      "UPDATE filespec_imports SET status = 'parsed', processed_at = ?, row_count = ? WHERE id = ?"
    ).bind(now, walked.length, importId).run();

    return { assetCount: walked.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare(
      "UPDATE filespec_imports SET status = 'failed', error = ? WHERE id = ?"
    ).bind(message, importId).run();
    throw error;
  }
}

// GET/POST /api/filespec/process-non-functioning?id=<importId>
// Thin HTTP wrapper around the pipeline core, for manual testing. Automated
// runs go through runNonFunctioningPipeline directly from the ingest chain.
export async function handleProcessNonFunctioning(request, env) {
  const keyCheck = await requireImportKey(request, env);
  if (!keyCheck.ok) return keyCheck.response;

  const url = new URL(request.url);
  const importId = Number.parseInt(url.searchParams.get("id") || "", 10);
  if (!Number.isInteger(importId) || importId < 1) {
    return jsonResponse({ error: "A valid import id is required." }, 400);
  }

  try {
    const result = await runNonFunctioningPipeline(env, importId);
    return jsonResponse({ ok: true, importId, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

// GET/POST /api/filespec/walk-non-functioning?id=<importId>
// Test-only endpoint: reads every real row and reports what it contains,
// still no database writes.
export async function handleWalkNonFunctioning(request, env) {
  const keyCheck = await requireImportKey(request, env);
  if (!keyCheck.ok) return keyCheck.response;

  const url = new URL(request.url);
  const importId = Number.parseInt(url.searchParams.get("id") || "", 10);
  if (!Number.isInteger(importId) || importId < 1) {
    return jsonResponse({ error: "A valid import id is required." }, 400);
  }

  const importRecord = await env.DB.prepare(
    "SELECT * FROM filespec_imports WHERE id = ?"
  ).bind(importId).first();

  if (!importRecord) {
    return jsonResponse({ error: `Import ${importId} was not found.` }, 404);
  }
  if (importRecord.source !== SOURCE_NAME) {
    return jsonResponse({ error: `Import ${importId} is not a ${SOURCE_NAME} import.` }, 400);
  }

  try {
    const { sheetName, rows } = await loadWorkbookRows(env, importRecord);
    const { rows: walked, skipped } = walkNonFunctioningRows(rows);

    return jsonResponse({
      ok: true,
      importId,
      sheet: sheetName,
      totalRows: rows.length,
      assetCount: walked.length,
      rowsSkipped: skipped,
      sample: walked.slice(0, 5),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
