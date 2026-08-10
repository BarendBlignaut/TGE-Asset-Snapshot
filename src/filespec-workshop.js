// TGE Asset Snapshot — Workshop filespec processor
// Consumption feed (not master data). The Office Script has already reduced
// the workbook to a clean DatabaseData sheet: four columns, no-legacy rows
// dropped, and every row on a single "data date" (the majority booking date).
// This file currently contains the READ-ONLY walk route only — it reports
// what the file contains and writes nothing to the database. The write core
// (runWorkshopPipeline) is added as a separate, later step.

import * as XLSX from "xlsx";

const SOURCE_NAME = "Workshop";
const SHEET_NAME = "DatabaseData";

// DatabaseData is keyed by header name, not fixed column positions, because
// the Office Script owns the layout and emits a clean, labelled header row.
const COL_LEGACY = "LegacyNo";
const COL_TASK = "Task";
const COL_STATUS = "Status";
const COL_BOOKING = "BookingDate";

function nowIso() {
  return new Date().toISOString();
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
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

// Reads the workbook from R2 and returns the DatabaseData rows as objects
// keyed by header name. DatabaseData is required — unlike the vendor feeds
// there is no fall-back to the first sheet, because the raw booking sheets
// must never be read in its place.
async function loadDatabaseDataRows(env, importRecord) {
  const r2Object = await env.FILESPEC_BUCKET.get(importRecord.r2_key);
  if (!r2Object) throw new Error(`R2 object was not found: ${importRecord.r2_key}`);

  const workbookBytes = await r2Object.arrayBuffer();
  if (!workbookBytes || workbookBytes.byteLength === 0) throw new Error("The R2 workbook is empty.");

  const workbook = XLSX.read(new Uint8Array(workbookBytes), { type: "array", raw: false });

  if (!workbook.SheetNames.includes(SHEET_NAME)) {
    throw new Error(`Worksheet '${SHEET_NAME}' was not found. The workbook must contain the cleaned '${SHEET_NAME}' sheet.`);
  }

  const worksheet = workbook.Sheets[SHEET_NAME];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });
  return { sheetName: SHEET_NAME, rows };
}

// Walks every DatabaseData row and shapes it. A row with no legacy number or
// no task is skipped (the Office Script already removes these, so the count
// should be zero — a non-zero skip count is an upstream signal, not normal).
function walkWorkshopRows(rows) {
  const out = [];
  let skipped = 0;

  for (const row of rows) {
    const legacyNumber = cleanText(row[COL_LEGACY]);
    const task = cleanText(row[COL_TASK]);
    const status = cleanText(row[COL_STATUS]);
    const bookingDate = cleanText(row[COL_BOOKING]);

    if (!legacyNumber || !task) { skipped++; continue; }

    out.push({ legacyNumber, task, status, bookingDate });
  }

  return { rows: out, skipped };
}

// GET/POST /api/filespec/walk-workshop?id=<importId>
// Read-only. Reads the real DatabaseData sheet and reports what it contains —
// row count, the distinct booking date(s) it resolves to, the status
// vocabulary with counts, distinct asset count, and a small sample — without
// writing a single row. Run this against a real Workshop import to confirm the
// parse before the write core is switched on.
export async function handleWalkWorkshop(request, env) {
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
    const { rows } = await loadDatabaseDataRows(env, importRecord);
    const { rows: walked, skipped } = walkWorkshopRows(rows);

    // Distinct booking dates — should be exactly one (the data date).
    const dateCounts = {};
    for (const r of walked) {
      const d = r.bookingDate || "(blank)";
      dateCounts[d] = (dateCounts[d] || 0) + 1;
    }
    const distinctDates = Object.keys(dateCounts).sort();
    let dataDate = null;
    let dataDateCount = -1;
    for (const d of distinctDates) {
      if (dateCounts[d] > dataDateCount) { dataDate = d; dataDateCount = dateCounts[d]; }
    }

    // Status vocabulary with counts — this is what will seed the control table.
    const statusCounts = {};
    for (const r of walked) {
      const s = r.status || "(blank)";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }

    // Distinct assets, and a sample asset with its tasks (for the hover shape).
    const byAsset = new Map();
    for (const r of walked) {
      if (!byAsset.has(r.legacyNumber)) byAsset.set(r.legacyNumber, []);
      byAsset.get(r.legacyNumber).push({ task: r.task, status: r.status });
    }
    let sample = null;
    for (const [legacyNumber, tasks] of byAsset.entries()) {
      if (tasks.length > 1) { sample = { legacyNumber, tasks }; break; }
    }
    if (!sample && byAsset.size > 0) {
      const first = byAsset.entries().next().value;
      sample = { legacyNumber: first[0], tasks: first[1] };
    }

    return jsonResponse({
      ok: true,
      importId,
      source: importRecord.source,
      filename: importRecord.filename,
      rowCount: walked.length,
      rowsSkipped: skipped,
      assetCount: byAsset.size,
      distinctDates,
      dataDate,
      dataDateCount,
      statusCount: Object.keys(statusCounts).length,
      statuses: statusCounts,
      sample,
      wroteToDatabase: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, importId, error: message, wroteToDatabase: false }, 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE CORE
// Consumption loader: reads the clean DatabaseData sheet and writes bookings
// immutably. Modelled on runPowerFleetKmPipeline (env + importId, auto-runnable
// from the ingest chain or callable by the manual wrapper below), differing
// where workshop differs: INSERT OR IGNORE (immutable snapshot, no upsert) and
// self-seeding the status vocabulary the file brings.
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 100;

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export async function runWorkshopPipeline(env, importId) {
  const importRecord = await env.DB.prepare(
    "SELECT * FROM filespec_imports WHERE id = ?"
  ).bind(importId).first();

  if (!importRecord) throw new Error(`Import ${importId} was not found.`);
  if (importRecord.source !== SOURCE_NAME) {
    throw new Error(`Import ${importId} is not a ${SOURCE_NAME} import.`);
  }

  await env.DB.prepare(
    "UPDATE filespec_imports SET status = 'parsing', error = NULL WHERE id = ?"
  ).bind(importId).run();

  try {
    const { rows } = await loadDatabaseDataRows(env, importRecord);
    const { rows: walked } = walkWorkshopRows(rows);

    const now = nowIso();

    // Distinct statuses this file brings — self-seed any not already known,
    // display = 1 (on) for a new status; INSERT OR IGNORE leaves any status
    // already configured untouched, so prior display edits are preserved.
    const distinctStatuses = [];
    const seen = {};
    for (const r of walked) {
      const s = r.status || "";
      if (s && !seen[s]) { seen[s] = true; distinctStatuses.push(s); }
    }

    const statusStatements = distinctStatuses.map((s) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO workshop_status_config (status, display, created_at, updated_at)
         VALUES (?, 1, ?, ?)`
      ).bind(s, now, now)
    );

    let statusesSeeded = 0;
    for (const chunk of chunkArray(statusStatements, BATCH_SIZE)) {
      const results = await env.DB.batch(chunk);
      for (const r of results) {
        statusesSeeded += (r && r.meta && typeof r.meta.changes === "number") ? r.meta.changes : 0;
      }
    }

    // Immutable booking rows. INSERT OR IGNORE against
    // UNIQUE(booking_date, legacy_number, task) makes a re-import a clean no-op
    // and silently absorbs any duplicate (date, legacy, task) line in-file.
    const bookingStatements = walked.map((r) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO workshop_bookings
           (booking_date, legacy_number, task, status, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(r.bookingDate, r.legacyNumber, r.task, r.status, now)
    );

    let bookingsInserted = 0;
    for (const chunk of chunkArray(bookingStatements, BATCH_SIZE)) {
      const results = await env.DB.batch(chunk);
      for (const r of results) {
        bookingsInserted += (r && r.meta && typeof r.meta.changes === "number") ? r.meta.changes : 0;
      }
    }

    // Data date = the booking date every row now carries (single-day file).
    const dataDate = walked.length ? walked[0].bookingDate : null;

    await env.DB.prepare(
      "UPDATE filespec_imports SET status = 'parsed', processed_at = ?, row_count = ? WHERE id = ?"
    ).bind(now, walked.length, importId).run();

    return {
      dataDate,
      rowCount: walked.length,
      bookingsInserted,
      duplicatesIgnored: walked.length - bookingsInserted,
      statusCount: distinctStatuses.length,
      statusesSeeded,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare(
      "UPDATE filespec_imports SET status = 'failed', error = ? WHERE id = ?"
    ).bind(message, importId).run();
    throw error;
  }
}

// POST /api/filespec/process-workshop?id=<importId>
// Thin manual wrapper around the pipeline core, for controlled first runs and
// re-runs. Automated runs go through runWorkshopPipeline from the ingest chain.
export async function handleProcessWorkshop(request, env) {
  const keyCheck = await requireImportKey(request, env);
  if (!keyCheck.ok) return keyCheck.response;

  const url = new URL(request.url);
  const importId = Number.parseInt(url.searchParams.get("id") || "", 10);
  if (!Number.isInteger(importId) || importId < 1) {
    return jsonResponse({ error: "A valid import id is required." }, 400);
  }

  try {
    const result = await runWorkshopPipeline(env, importId);
    return jsonResponse({ ok: true, importId, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, importId, error: message }, 500);
  }
}
