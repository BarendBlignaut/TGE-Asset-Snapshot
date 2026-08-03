// TGE Asset Snapshot — Power Fleet filespec processor
// Data Feed vendor: vertical orientation, single table. Unlike Teletrac,
// there is no anchor label to search for — once the header row is found,
// every metric sits at a fixed, known column position, confirmed against a
// real Daily Trip Report file:
//   A = Date, G = Fleet Number, U = Duration, Z = Distance (km), AF = Fuel Used (L)
// Only km is switched on for now; duration and fuel are read but not yet
// written, matching the same staged approach used for Teletrac.

import * as XLSX from "xlsx";

const SOURCE_NAME = "Power Fleet";
const SHEET_NAME = "Daily Trip Report";
const HEADER_ROW_INDEX = 4; // zero-based — row 5 in the real file

const COL_DATE   = 0;  // A
const COL_FLEET  = 6;  // G
const COL_DUR    = 20; // U
const COL_KM     = 25; // Z
const COL_FUEL   = 31; // AF

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

async function loadWorkbookRows(env, importRecord) {
  const r2Object = await env.FILESPEC_BUCKET.get(importRecord.r2_key);
  if (!r2Object) throw new Error(`R2 object was not found: ${importRecord.r2_key}`);

  const workbookBytes = await r2Object.arrayBuffer();
  if (!workbookBytes || workbookBytes.byteLength === 0) throw new Error("The R2 workbook is empty.");

  const workbook = XLSX.read(new Uint8Array(workbookBytes), { type: "array", cellDates: true, raw: true });
  const sheetName = workbook.SheetNames.includes(SHEET_NAME) ? SHEET_NAME : workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: null });
  return { sheetName, rows };
}

// Formats a date cell to YYYY-MM-DD. PowerFleet's date column comes through
// as a real Date object with cellDates:true, but a string fallback is kept
// for safety, matching the same defensive pattern used for Teletrac.
function formatDateCell(cell) {
  if (cell instanceof Date) {
    const y = cell.getFullYear();
    const m = String(cell.getMonth() + 1).padStart(2, "0");
    const d = String(cell.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof cell === "string") {
    const match = cell.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}

// Walks every data row from just beneath the header to the end of the
// sheet. There is no anchor or blank-row boundary here — PowerFleet is one
// continuous table — so a row is simply skipped if it has no fleet number,
// rather than treated as an end-of-section marker.
function walkAllRows(rows, headerRowIndex) {
  const byAsset = new Map();
  let skipped = 0;

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const fleetRaw = row ? row[COL_FLEET] : null;
    if (fleetRaw == null || String(fleetRaw).trim() === "") { skipped++; continue; }

    const fleetNumber = String(fleetRaw).trim();
    const date = formatDateCell(row[COL_DATE]);
    const km = row[COL_KM] == null ? null : Number(row[COL_KM]);
    const duration = row[COL_DUR];
    const fuel = row[COL_FUEL] == null ? null : Number(row[COL_FUEL]);

    if (!byAsset.has(fleetNumber)) byAsset.set(fleetNumber, []);
    byAsset.get(fleetNumber).push({ date, km, duration, fuel });
  }

  return { byAsset, skipped };
}

// GET/POST /api/filespec/walk-powerfleet?id=<importId>
// Test-only endpoint: reads every real row and returns a small sample plus
// the true asset and date coverage, still no database writes.
export async function handleWalkPowerFleet(request, env) {
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
    const { rows } = await loadWorkbookRows(env, importRecord);
    const { byAsset, skipped } = walkAllRows(rows, HEADER_ROW_INDEX);

    const distinctDates = new Set();
    for (const readings of byAsset.values()) {
      for (const r of readings) if (r.date) distinctDates.add(r.date);
    }

    const sampleFleetNumber = byAsset.keys().next().value;
    const sample = sampleFleetNumber
      ? { fleetNumber: sampleFleetNumber, readings: byAsset.get(sampleFleetNumber) }
      : null;

    return jsonResponse({
      ok: true,
      importId,
      assetCount: byAsset.size,
      rowsSkipped: skipped,
      distinctDates: Array.from(distinctDates).sort(),
      sample,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

const VENDOR_ID = 4; // Power Fleet, confirmed against vendors table
const BATCH_SIZE = 100;

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// ── Reusable pipeline core — takes just env and an import id, exactly like
// runStaticFleetPipeline and runTeletracKmPipeline, so it can be called
// either directly by the manual test endpoint below, or automatically from
// the ingest chain in index.js the moment a real Power Fleet file lands.
export async function runPowerFleetKmPipeline(env, importId) {
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
    const { byAsset } = walkAllRows(rows, HEADER_ROW_INDEX);

    const now = nowIso();
    const statements = [];
    for (const [fleetNumber, readings] of byAsset.entries()) {
      for (const reading of readings) {
        if (!reading.date) continue; // skip rows with an unreadable date
        if (reading.km == null || Number.isNaN(reading.km)) continue; // skip genuinely blank cells
        statements.push(
          env.DB.prepare(
            `INSERT INTO utilisation_vendor_daily_metrics
              (fleet_number, metric_date, metric, value, vendor_id, import_id, created_at, updated_at)
             VALUES (?, ?, 'km', ?, ?, ?, ?, ?)
             ON CONFLICT(fleet_number, metric_date, metric) DO UPDATE SET
               value = excluded.value,
               vendor_id = excluded.vendor_id,
               import_id = excluded.import_id,
               updated_at = excluded.updated_at`
          ).bind(fleetNumber, reading.date, reading.km, VENDOR_ID, importId, now, now)
        );
      }
    }

    for (const chunk of chunkArray(statements, BATCH_SIZE)) {
      await env.DB.batch(chunk);
    }

    await env.DB.prepare(
      "UPDATE filespec_imports SET status = 'parsed', processed_at = ?, row_count = ? WHERE id = ?"
    ).bind(now, statements.length, importId).run();

    return { assetCount: byAsset.size, rowsWritten: statements.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare(
      "UPDATE filespec_imports SET status = 'failed', error = ? WHERE id = ?"
    ).bind(message, importId).run();
    throw error;
  }
}

// GET/POST /api/filespec/process-powerfleet?id=<importId>
// Thin HTTP wrapper around the pipeline core, for manual testing. Automated
// runs go through runPowerFleetKmPipeline directly from the ingest chain.
export async function handleProcessPowerFleet(request, env) {
  const keyCheck = await requireImportKey(request, env);
  if (!keyCheck.ok) return keyCheck.response;

  const url = new URL(request.url);
  const importId = Number.parseInt(url.searchParams.get("id") || "", 10);
  if (!Number.isInteger(importId) || importId < 1) {
    return jsonResponse({ error: "A valid import id is required." }, 400);
  }

  try {
    const result = await runPowerFleetKmPipeline(env, importId);
    return jsonResponse({ ok: true, importId, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function handleLocatePowerFleet(request, env) {
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

    const headerRow = rows[HEADER_ROW_INDEX] || [];
    const fleetHeaderText = headerRow[COL_FLEET];

    if (typeof fleetHeaderText !== "string" || !fleetHeaderText.trim().toLowerCase().includes("fleet number")) {
      return jsonResponse({
        ok: false,
        error: `Expected 'Fleet Number' in column G of the header row, found '${fleetHeaderText}' instead.`,
        headerRow,
      }, 422);
    }

    return jsonResponse({
      ok: true,
      importId,
      sheet: sheetName,
      totalRows: rows.length,
      headerRowIndex: HEADER_ROW_INDEX,
      headerRow: headerRow.slice(0, 33),
      columnsConfirmed: {
        date: headerRow[COL_DATE],
        fleetNumber: headerRow[COL_FLEET],
        duration: headerRow[COL_DUR],
        km: headerRow[COL_KM],
        fuel: headerRow[COL_FUEL],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
