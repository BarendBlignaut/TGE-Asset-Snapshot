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

// GET/POST /api/filespec/locate-powerfleet?id=<importId>
// Test-only endpoint for this first slice: confirms the header row genuinely
// contains "Fleet Number" at the expected column, before anything is read
// row by row. No database writes.
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
