// TGE Asset Snapshot — Teletrac Navman filespec processor
// Data Feed vendor: horizontal orientation, multiple stacked tables on the
// Summary sheet, each found by its own section label (anchor), not by a
// fixed row number, since the exact row can shift week to week.
//
// This first slice only LOCATES the Daily Kms section and its date header —
// it writes nothing to the database yet. Proving the engine can reliably
// find the right spot in a real file comes before any write logic.

import * as XLSX from "xlsx";

const SOURCE_NAME = "Teletrac Navman";
const SHEET_NAME = "Summary";
const KM_ANCHOR = "Daily Kms";

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

// Searches column A of every row for an exact match on `anchorLabel`.
// Returns the row index it was found on and the row directly beneath it
// (the header row, carrying the date columns), or null if not found.
function locateSection(rows, anchorLabel) {
  for (let i = 0; i < rows.length; i++) {
    const cellA = rows[i] && rows[i][0];
    if (typeof cellA === "string" && cellA.trim() === anchorLabel) {
      return {
        anchorRowIndex: i,
        headerRowIndex: i + 1,
        headerRow: rows[i + 1] || [],
      };
    }
  }
  return null;
}
// Formats a header date cell to YYYY-MM-DD. XLSX may hand back a real Date
// object (cellDates:true) or, for some source files, a plain "DD/MM/YYYY"
// string — both are handled so the reader isn't fragile to that variance.
function formatDateCell(cell) {
  if (cell instanceof Date) {
    const y = cell.getFullYear();
    const m = String(cell.getMonth() + 1).padStart(2, "0");
    const d = String(cell.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof cell === "string") {
    const match = cell.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
      const [, dd, mm, yyyy] = match;
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  return null;
}

// Walks from the row beneath the header down to the blank row that ends the
// section, reading every asset's identity plus one value per date column.
function readSectionRows(rows, headerRowIndex, headerRow) {
  const dateColumns = [];
  for (let col = 3; col < headerRow.length; col++) {
    const iso = formatDateCell(headerRow[col]);
    if (iso) dateColumns.push({ col, date: iso });
  }

  const assets = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const identity = row && row[0];
    if (identity == null || String(identity).trim() === "") break; // blank row ends the section

    const readings = dateColumns.map(dc => ({
      date: dc.date,
      value: row[dc.col] == null ? null : Number(row[dc.col]),
    }));

    assets.push({
      fleetNumber: String(identity).trim(),
      device: row[1] != null ? String(row[1]).trim() : null,
      vehicleType: row[2] != null ? String(row[2]).trim() : null,
      readings,
    });
  }

  return { dateColumns, assets };
}

// GET/POST /api/filespec/locate-teletrac-km?id=<importId>
// Test-only endpoint for this first slice: proves the engine can find the
// Daily Kms section and its date header in a real, already-ingested file.
export async function handleLocateTeletracKm(request, env) {

// GET/POST /api/filespec/locate-teletrac-km?id=<importId>
// Test-only endpoint for this first slice: proves the engine can find the
// Daily Kms section and its date header in a real, already-ingested file.
export async function handleLocateTeletracKm(request, env) {
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
    const r2Object = await env.FILESPEC_BUCKET.get(importRecord.r2_key);
    if (!r2Object) {
      throw new Error(`R2 object was not found: ${importRecord.r2_key}`);
    }

    const workbookBytes = await r2Object.arrayBuffer();
    if (!workbookBytes || workbookBytes.byteLength === 0) {
      throw new Error("The R2 workbook is empty.");
    }

    const workbook = XLSX.read(new Uint8Array(workbookBytes), {
      type: "array",
      cellDates: true,
      raw: true,
    });

    const sheetName = workbook.SheetNames.includes(SHEET_NAME)
      ? SHEET_NAME
      : workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error("Workbook does not contain any worksheets.");
    }

    const worksheet = workbook.Sheets[sheetName];

    // header:1 gives array-of-arrays by row position, not object-keyed by
    // column header — required here since the real header row isn't row 1.
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: true,
      defval: null,
    });

    const located = locateSection(rows, KM_ANCHOR);

    if (!located) {
      return jsonResponse({
        ok: false,
        error: `Could not find a row labelled '${KM_ANCHOR}' on sheet '${sheetName}'.`,
      }, 422);
    }

    return jsonResponse({
      ok: true,
      importId,
      sheet: sheetName,
      totalRows: rows.length,
      anchorRowIndex: located.anchorRowIndex,
      headerRowIndex: located.headerRowIndex,
      headerRow: located.headerRow,
    });

} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

// GET/POST /api/filespec/walk-teletrac-km?id=<importId>
// Test-only endpoint: reads every asset in the Daily Kms section and returns
// a small sample plus the true asset count, still no database writes.
export async function handleWalkTeletracKm(request, env) {
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
    const r2Object = await env.FILESPEC_BUCKET.get(importRecord.r2_key);
    if (!r2Object) throw new Error(`R2 object was not found: ${importRecord.r2_key}`);

    const workbookBytes = await r2Object.arrayBuffer();
    if (!workbookBytes || workbookBytes.byteLength === 0) throw new Error("The R2 workbook is empty.");

    const workbook = XLSX.read(new Uint8Array(workbookBytes), { type: "array", cellDates: true, raw: true });
    const sheetName = workbook.SheetNames.includes(SHEET_NAME) ? SHEET_NAME : workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: null });

    const located = locateSection(rows, KM_ANCHOR);
    if (!located) {
      return jsonResponse({ ok: false, error: `Could not find a row labelled '${KM_ANCHOR}'.` }, 422);
    }

    const { dateColumns, assets } = readSectionRows(rows, located.headerRowIndex, located.headerRow);

    return jsonResponse({
      ok: true,
      importId,
      dateColumnsFound: dateColumns.map(d => d.date),
      assetCount: assets.length,
      sample: assets.slice(0, 5),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
