// TGE Asset Snapshot — Teletrac Navman filespec processor
// Data Feed vendor: horizontal orientation, multiple stacked tables on the
// Summary sheet, each found by its own section label (anchor), not by a
// fixed row number, since the exact row can shift week to week.
//
// This file now also serves Rentco TN — genuinely the same Teletrac file
// format under a different vendor label, so rather than duplicate this
// whole engine, it recognises both real source names and picks the right
// vendor_id at write time based on whichever one actually sent the file.

import * as XLSX from "xlsx";

const VENDOR_IDS_BY_SOURCE = {
  "Teletrac Navman": 3,
  "Rentco TN": 5, // genuinely the same Teletrac file format, just relabeled
};

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
    if (identity == null || String(identity).trim() === "") break;

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

const BATCH_SIZE = 100;

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// ── Reusable pipeline core — takes just env and an import id, exactly like
// runStaticFleetPipeline, so it can be called either directly by the manual
// test endpoint below, or automatically from the ingest chain in index.js
// the moment a real Teletrac-format file lands, from either vendor.
export async function runTeletracKmPipeline(env, importId) {
  const importRecord = await env.DB.prepare(
    "SELECT * FROM filespec_imports WHERE id = ?"
  ).bind(importId).first();

  if (!importRecord) {
    throw new Error(`Import ${importId} was not found.`);
  }
  if (!(importRecord.source in VENDOR_IDS_BY_SOURCE)) {
    throw new Error(`Import ${importId}'s source '${importRecord.source}' is not a recognised Teletrac-format vendor.`);
  }

  await env.DB.prepare(
    "UPDATE filespec_imports SET status = 'parsing', error = NULL WHERE id = ?"
  ).bind(importId).run();

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
    if (!located) throw new Error(`Could not find a row labelled '${KM_ANCHOR}'.`);

    const { assets } = readSectionRows(rows, located.headerRowIndex, located.headerRow);

    const now = nowIso();
    const vendorId = VENDOR_IDS_BY_SOURCE[importRecord.source];
    const statements = [];
    for (const asset of assets) {
      for (const reading of asset.readings) {
        if (reading.value == null || Number.isNaN(reading.value)) continue;
        statements.push(
          env.DB.prepare(
            `INSERT INTO utilisation_vendor_daily_metrics
              (fleet_number, metric_date, metric, value, vendor_id, import_id, created_at, updated_at)
             VALUES (?, ?, 'km', ?, ?, ?, ?, ?)
             ON CONFLICT(fleet_number, metric_date, metric) DO UPDATE SET
               value = excluded.value,
               vendor_id = excluded.vendor_id,
               import_id = excluded.import_id,
               updated_at = excluded.updated_at
             WHERE vendor_id = excluded.vendor_id`
          ).bind(asset.fleetNumber, reading.date, reading.value, vendorId, importId, now, now)
        );
      }
    }

    // The WHERE clause above is the real safety net: a row already owned by
    // a different vendor is left completely untouched, at the database
    // level, regardless of anything our own code does. This count confirms
    // how many rows the database actually accepted versus how many were
    // attempted — the difference is how many were correctly blocked.
    let actualWrites = 0;
    for (const chunk of chunkArray(statements, BATCH_SIZE)) {
      const results = await env.DB.batch(chunk);
      for (const r of results) {
        actualWrites += (r && r.meta && typeof r.meta.changes === "number") ? r.meta.changes : 0;
      }
    }
    const rowsBlockedCrossVendor = statements.length - actualWrites;
    if (rowsBlockedCrossVendor > 0) {
      console.warn(`Import ${importId} (${importRecord.source}): ${rowsBlockedCrossVendor} row(s) blocked — already owned by a different vendor for that asset/date/metric.`);
    }

    await env.DB.prepare(
      "UPDATE filespec_imports SET status = 'parsed', processed_at = ?, row_count = ? WHERE id = ?"
    ).bind(now, actualWrites, importId).run();

    return { assetCount: assets.length, rowsWritten: actualWrites, rowsBlockedCrossVendor };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare(
      "UPDATE filespec_imports SET status = 'failed', error = ? WHERE id = ?"
    ).bind(message, importId).run();
    throw error;
  }
}

// GET/POST /api/filespec/process-teletrac-km?id=<importId>
// Thin HTTP wrapper around the pipeline core, for manual testing. Automated
// runs go through runTeletracKmPipeline directly from the ingest chain.
export async function handleProcessTeletracKm(request, env) {
  const keyCheck = await requireImportKey(request, env);
  if (!keyCheck.ok) return keyCheck.response;

  const url = new URL(request.url);
  const importId = Number.parseInt(url.searchParams.get("id") || "", 10);
  if (!Number.isInteger(importId) || importId < 1) {
    return jsonResponse({ error: "A valid import id is required." }, 400);
  }

  try {
    const result = await runTeletracKmPipeline(env, importId);
    return jsonResponse({ ok: true, importId, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

// GET/POST /api/filespec/locate-teletrac-km?id=<importId>
// Test-only endpoint: proves the engine can find the Daily Kms section and
// its date header in a real, already-ingested file. No database writes.
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

  if (!(importRecord.source in VENDOR_IDS_BY_SOURCE)) {
    return jsonResponse({ error: `Import ${importId}'s source '${importRecord.source}' is not a recognised Teletrac-format vendor.` }, 400);
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
  if (!(importRecord.source in VENDOR_IDS_BY_SOURCE)) {
    return jsonResponse({ error: `Import ${importId}'s source '${importRecord.source}' is not a recognised Teletrac-format vendor.` }, 400);
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
