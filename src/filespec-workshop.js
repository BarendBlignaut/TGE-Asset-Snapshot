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
const COL_WORKSHOP = "Workshop";

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

  // Prefer the raw booking sheet, reduced here by column name. DatabaseData
  // (built by the Office Script) is only a fall-back if the raw sheet is absent.
  if (workbook.SheetNames.includes(RAW_SHEET_NAME)) {
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets[RAW_SHEET_NAME], { header: 1, defval: "", raw: false });
    return { sheetName: RAW_SHEET_NAME, rows: reduceBookingList(grid) };
  }

  if (!workbook.SheetNames.includes(SHEET_NAME)) {
    throw new Error(`Neither '${RAW_SHEET_NAME}' nor '${SHEET_NAME}' was found in the workbook.`);
  }

  const worksheet = workbook.Sheets[SHEET_NAME];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });
  return { sheetName: SHEET_NAME, rows };
}

// Raw sheet the Office Script used to reduce. Read here by header NAME so
// added or moved columns can't break it (the Office Script read by position).
const RAW_SHEET_NAME = "Workshop Booking List";

// "28/09/2026 2:00:00 PM", "28/09/2026", "2026-09-28" or a Date -> "2026-09-28".
// Returns "" when the value isn't a recognisable date.
function toIsoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = cleanText(value);
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

function isBlankCell(value) {
  const text = cleanText(value);
  return text === "" || text === "(blank)";
}

// Same reduction the Office Script did: fill LegacyNo down through grouped
// rows, keep only rows on the file's data date (the most common booking
// date), and output the date as YYYY-MM-DD.
// grid = the raw sheet as an array of rows (sheet_to_json header:1).
function reduceBookingList(grid) {
  const headerIndex = grid.findIndex((row, i) =>
    i < 30 && Array.isArray(row) &&
    row.some((c) => cleanText(c) === COL_LEGACY) &&
    row.some((c) => cleanText(c) === COL_BOOKING)
  );
  if (headerIndex === -1) {
    throw new Error(`'${RAW_SHEET_NAME}' has no header row with '${COL_LEGACY}' and '${COL_BOOKING}'.`);
  }

  const header = grid[headerIndex].map((c) => cleanText(c));
  const col = (name) => header.indexOf(name);
  const iLegacy = col(COL_LEGACY);
  const iTask = col(COL_TASK);
  const iStatus = col(COL_STATUS);
   const iBooking = col(COL_BOOKING);
  // Optional: older files or DatabaseData may not have it; saved blank then.
  const iWorkshop = col(COL_WORKSHOP);
  if (iTask === -1 || iStatus === -1) {
    throw new Error(`'${RAW_SHEET_NAME}' is missing the '${COL_TASK}' or '${COL_STATUS}' column.`);
  }

  const filled = [];
  let lastLegacy = "";
  let lastWorkshop = "";
  for (const row of grid.slice(headerIndex + 1)) {
    if (!Array.isArray(row) || row.every((c) => isBlankCell(c))) continue;
    if (!isBlankCell(row[iLegacy])) lastLegacy = cleanText(row[iLegacy]);
    // Workshop is grouped like LegacyNo (only on the first row of its group).
    if (iWorkshop !== -1 && !isBlankCell(row[iWorkshop])) lastWorkshop = cleanText(row[iWorkshop]);
    filled.push({
      legacy: lastLegacy,
      workshop: lastWorkshop,
      task: isBlankCell(row[iTask]) ? "" : cleanText(row[iTask]),
      status: isBlankCell(row[iStatus]) ? "" : cleanText(row[iStatus]),
      date: toIsoDate(row[iBooking]),
    });
  }

  const counts = {};
  for (const r of filled) if (r.date) counts[r.date] = (counts[r.date] || 0) + 1;
  let dataDate = "";
  for (const d of Object.keys(counts)) {
    if (!dataDate || counts[d] > counts[dataDate]) dataDate = d;
  }
  if (!dataDate) throw new Error(`No readable '${COL_BOOKING}' values were found in '${RAW_SHEET_NAME}'.`);

  return filled
    .filter((r) => r.date === dataDate && r.legacy && r.task)
    .map((r) => ({
      [COL_LEGACY]: r.legacy,
      [COL_TASK]: r.task,
      [COL_STATUS]: r.status,
      [COL_BOOKING]: r.date,
      [COL_WORKSHOP]: r.workshop,
    }));
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

    // Never save bookings without a usable date: they can't be shown on the
    // dashboard and they collapse into each other on the unique key.
    const badDate = walked.find((r) => !/^\d{4}-\d{2}-\d{2}$/.test(r.bookingDate));
    if (badDate) {
      throw new Error(
        `Booking date '${badDate.bookingDate}' for ${badDate.legacyNumber} is not a YYYY-MM-DD date. Nothing was saved.`
      );
    }

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

// ─────────────────────────────────────────────────────────────────────────────
// STATUS CONTROL (user-facing config)
// Session-authed, permission-gated read/write of workshop_status_config — the
// self-seeded status vocabulary. Modelled on handleGetStaticFields /
// handleUpdateStaticFields: same (request, env, auth) shape, same helper use
// (auth.hasPermission / auth.safeJson), gated on the 'workshop' feature.
// These sit beside the X-Import-Key loader above exactly as static keeps its
// field-def config handlers beside its own import handlers.
// ─────────────────────────────────────────────────────────────────────────────

async function getStatusConfig(env) {
  const rows = await env.DB.prepare(
    "SELECT id, status, display FROM workshop_status_config ORDER BY status ASC"
  ).all();
  return rows.results || [];
}

// GET /api/workshop/bookings?date=YYYY-MM-DD
// Returns real booking rows for one day — every row is immutable data as
// imported, this endpoint never filters by the display flag itself, so the
// File Spec screen can show the true, complete picture and preview the
// effect of a toggle live, before it's saved.
export async function handleGetWorkshopBookings(request, env, auth) {
  const perm = await auth.hasPermission(env, auth.session.role_id, "workshop", "view");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const url = new URL(request.url);
  let date = (url.searchParams.get("date") || "").trim();

  if (!date) {
    const latest = await env.DB.prepare(
      "SELECT booking_date FROM workshop_bookings ORDER BY booking_date DESC LIMIT 1"
    ).first();
    date = latest ? latest.booking_date : null;
  }

  if (!date) {
    return jsonResponse({ ok: true, date: null, bookings: [] });
  }

  const rows = await env.DB.prepare(
    "SELECT legacy_number, task, status, booking_date FROM workshop_bookings WHERE booking_date = ? ORDER BY legacy_number ASC, task ASC"
  ).bind(date).all();

  const availableDates = await env.DB.prepare(
    "SELECT DISTINCT booking_date FROM workshop_bookings ORDER BY booking_date DESC LIMIT 30"
  ).all();

  return jsonResponse({
    ok: true,
    date,
    bookings: rows.results || [],
    availableDates: (availableDates.results || []).map(r => r.booking_date),
  });
}

// GET /api/workshop/statuses
export async function handleGetWorkshopStatuses(request, env, auth) {
  const perm = await auth.hasPermission(env, auth.session.role_id, "workshop", "view");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);
  const statuses = await getStatusConfig(env);
  return jsonResponse({ ok: true, statuses });
}

// PUT /api/workshop/statuses
// Body: { statuses: [{ id, display }, ...] } — updates the display flag only.
// Status text itself is never edited here; it is owned by the loader's
// self-seed. Only display (0/1) is user-controllable.
export async function handleUpdateWorkshopStatuses(request, env, auth) {
  const perm = await auth.hasPermission(env, auth.session.role_id, "workshop", "manage-status");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const body = await auth.safeJson(request);
  const statuses = Array.isArray(body.statuses) ? body.statuses : [];

  const now = nowIso();
  for (const s of statuses) {
    if (!s.id) continue;
    await env.DB.prepare(
      "UPDATE workshop_status_config SET display = ?, updated_at = ? WHERE id = ?"
    ).bind(s.display ? 1 : 0, now, s.id).run();
  }

  return jsonResponse({ ok: true });
}

// GET /api/utilisation/workshop-bookings?start=&end=
// The Fleet Utilisation dashboard's own read of real bookings, but only
// ones whose status is currently switched on — an excluded status never
// reaches the dashboard at all. Lives here, not in utilisation-static-fleet,
// since this is genuinely Workshop's own data being served, not Static
// Fleet's.
export async function handleGetWorkshopBookingsForDashboard(request, env, auth) {
  const perm = await auth.hasPermission(env, auth.session.role_id, "utilisation", "view");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) {
    return jsonResponse({ error: "start and end date parameters are required." }, 400);
  }

  const rows = await env.DB.prepare(
    `SELECT wb.legacy_number, wb.booking_date, wb.task, wb.status
     FROM workshop_bookings wb
     JOIN workshop_status_config wsc ON wsc.status = wb.status
     WHERE wb.booking_date >= ? AND wb.booking_date <= ? AND wsc.display = 1
     ORDER BY wb.legacy_number ASC, wb.task ASC`
  ).bind(start, end).all();

  const grouped = {};
  for (const r of (rows.results || [])) {
    const key = `${r.legacy_number}|${r.booking_date}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ task: r.task, status: r.status });
  }

  return jsonResponse({ ok: true, bookings: grouped });
}
