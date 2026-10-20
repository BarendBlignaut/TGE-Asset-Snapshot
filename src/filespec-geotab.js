// TGE Asset Snapshot — GeoTab filespec processor
// Data Feed vendor: vertical orientation, single table, read from the
// "Summary" sheet of the Advanced Trips Summary Report. Layout confirmed
// against a real file (13/10–19/10/2026):
//   - header row has "Name", "Period Start Date" and "Distance"; columns are
//     found by header text, not position, in case GeoTab adds columns
//   - Name ("60015 - X093QE") is only on each asset's first day row, so it
//     is filled down, the same way the workshop LegacyNo column is
//   - each asset ends with a "<name> Total" row and the sheet ends with
//     "Grand Total"; both are skipped, only real day rows are written
// Only km is switched on for now, matching Power Fleet and Teletrac.

import * as XLSX from "xlsx";

const SOURCE_NAME = "GeoTab";
const SHEET_NAME = "Summary";
const VENDOR_ID = 8; // GeoTab, confirmed against vendors table
const BATCH_SIZE = 100;

const HEADER_NAME  = "name";
const HEADER_DATE  = "period start date";
const HEADER_KM    = "distance";

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

async function loadImportRecord(env, importId) {
  const importRecord = await env.DB.prepare(
    "SELECT * FROM filespec_imports WHERE id = ?"
  ).bind(importId).first();
  if (!importRecord) throw new Error(`Import ${importId} was not found.`);
  if (importRecord.source !== SOURCE_NAME) throw new Error(`Import ${importId} is not a ${SOURCE_NAME} import.`);
  return importRecord;
}

async function loadWorkbookRows(env, importRecord) {
  const r2Object = await env.FILESPEC_BUCKET.get(importRecord.r2_key);
  if (!r2Object) throw new Error(`R2 object was not found: ${importRecord.r2_key}`);

  const workbookBytes = await r2Object.arrayBuffer();
  if (!workbookBytes || workbookBytes.byteLength === 0) throw new Error("The R2 workbook is empty.");

  const workbook = XLSX.read(new Uint8Array(workbookBytes), { type: "array", cellDates: true, raw: true });
  if (!workbook.SheetNames.includes(SHEET_NAME)) {
    throw new Error(`Sheet '${SHEET_NAME}' was not found. Sheets: ${workbook.SheetNames.join(", ")}`);
  }
  const worksheet = workbook.Sheets[SHEET_NAME];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: null });
  return { sheetName: SHEET_NAME, rows };
}

function headerText(cell) {
  return cell == null ? "" : String(cell).trim().toLowerCase();
}

// Finds the header row by looking for "Name" in column A alongside a
// "Distance" column, then returns the index of each column we need.
function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i] || [];
        if (headerText(row[0]) !== HEADER_NAME && headerText(row[0]) !== "vehicle") continue;
    const texts = row.map(headerText);
    const colDate = texts.indexOf(HEADER_DATE);
    const colKm = texts.indexOf(HEADER_KM);
    if (colDate === -1 || colKm === -1) continue;
    return { headerRowIndex: i, colName: 0, colDate, colKm };
  }
  throw new Error("Could not find the header row (Name / Period Start Date / Distance) on the Summary sheet.");
}

// Formats a date cell to YYYY-MM-DD, same defensive pattern as Power Fleet.
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

// "60015 - X093QE" -> "60015". The part before " - " is the fleet number
// the static fleet list knows the asset by.
function fleetNumberFromName(name) {
  return String(name).split(" - ")[0].trim();
}

function walkAllRows(rows, header) {
  const byAsset = new Map();
  let skipped = 0;
  let currentName = null;

  for (let i = header.headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const nameCell = row[header.colName];

    if (nameCell != null && String(nameCell).trim() !== "") {
      const name = String(nameCell).trim();
      // Subtotal and grand total rows carry no date; skip them and stop the
      // fill-down so a stray row can never inherit the previous asset.
      if (/\btotal$/i.test(name)) { currentName = null; skipped++; continue; }
      currentName = name;
    }

    const date = formatDateCell(row[header.colDate]);
    if (!currentName || !date) { skipped++; continue; }

    const km = row[header.colKm] == null || row[header.colKm] === "" ? null : Number(row[header.colKm]);
    const fleetNumber = fleetNumberFromName(currentName);
    if (!byAsset.has(fleetNumber)) byAsset.set(fleetNumber, []);
    byAsset.get(fleetNumber).push({ date, km, name: currentName });
  }

  return { byAsset, skipped };
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function parseImportId(request) {
  const url = new URL(request.url);
  const importId = Number.parseInt(url.searchParams.get("id") || "", 10);
  return Number.isInteger(importId) && importId > 0 ? importId : null;
}

// POST /api/filespec/walk-geotab?id=<importId>
// Dry run: reads the file and returns what would be written, no DB writes.
export async function handleWalkGeoTab(request, env) {
  const keyCheck = await requireImportKey(request, env);
  if (!keyCheck.ok) return keyCheck.response;
  const importId = parseImportId(request);
  if (!importId) return jsonResponse({ error: "A valid import id is required." }, 400);

  try {
    const importRecord = await loadImportRecord(env, importId);
    const { rows } = await loadWorkbookRows(env, importRecord);
    const header = findHeader(rows);
    const { byAsset, skipped } = walkAllRows(rows, header);

    const distinctDates = new Set();
    let dayRows = 0;
    for (const readings of byAsset.values()) {
      for (const r of readings) { distinctDates.add(r.date); dayRows++; }
    }
    const sampleFleetNumber = byAsset.keys().next().value;

    return jsonResponse({
      ok: true,
      importId,
      header,
      assetCount: byAsset.size,
      dayRows,
      rowsSkipped: skipped,
      distinctDates: Array.from(distinctDates).sort(),
      fleetNumbers: Array.from(byAsset.keys()),
      sample: sampleFleetNumber ? { fleetNumber: sampleFleetNumber, readings: byAsset.get(sampleFleetNumber) } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

// Reusable pipeline core, called by the manual endpoint below and by the
// ingest chain in index.js when a GeoTab file lands.
export async function runGeoTabKmPipeline(env, importId) {
  if (!VENDOR_ID) throw new Error("GeoTab VENDOR_ID is not set in filespec-geotab.js.");
  await loadImportRecord(env, importId);

  await env.DB.prepare(
    "UPDATE filespec_imports SET status = 'parsing', error = NULL WHERE id = ?"
  ).bind(importId).run();

  try {
    const importRecord = await loadImportRecord(env, importId);
    const { rows } = await loadWorkbookRows(env, importRecord);
    const header = findHeader(rows);
    const { byAsset } = walkAllRows(rows, header);

    const now = nowIso();
    const statements = [];
    for (const [fleetNumber, readings] of byAsset.entries()) {
      for (const reading of readings) {
        if (reading.km == null || Number.isNaN(reading.km)) continue;
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

    // Same cross-vendor guard as Power Fleet: a row already owned by another
    // vendor is left untouched, and the difference is reported.
    let actualWrites = 0;
    for (const chunk of chunkArray(statements, BATCH_SIZE)) {
      const results = await env.DB.batch(chunk);
      for (const r of results) {
        actualWrites += (r && r.meta && typeof r.meta.changes === "number") ? r.meta.changes : 0;
      }
    }
    const rowsBlockedCrossVendor = statements.length - actualWrites;
    if (rowsBlockedCrossVendor > 0) {
      console.warn(`Import ${importId} (GeoTab): ${rowsBlockedCrossVendor} row(s) blocked — already owned by a different vendor for that asset/date/metric.`);
    }

    await env.DB.prepare(
      "UPDATE filespec_imports SET status = 'parsed', processed_at = ?, row_count = ? WHERE id = ?"
    ).bind(now, actualWrites, importId).run();

    return { assetCount: byAsset.size, rowsWritten: actualWrites, rowsBlockedCrossVendor };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare(
      "UPDATE filespec_imports SET status = 'failed', error = ? WHERE id = ?"
    ).bind(message, importId).run();
    throw error;
  }
}

// POST /api/filespec/process-geotab?id=<importId>
// Manual wrapper around the pipeline core, for testing and reprocessing.
export async function handleProcessGeoTab(request, env) {
  const keyCheck = await requireImportKey(request, env);
  if (!keyCheck.ok) return keyCheck.response;
  const importId = parseImportId(request);
  if (!importId) return jsonResponse({ error: "A valid import id is required." }, 400);

  try {
    const result = await runGeoTabKmPipeline(env, importId);
    return jsonResponse({ ok: true, importId, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
