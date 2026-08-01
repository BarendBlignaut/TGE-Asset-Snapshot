// TGE Asset Snapshot — Static Fleet filespec processor
// Reads an uploaded XLSX file from R2 and loads validated rows into staging.
// Live fleet promotion is deliberately handled separately.

import * as XLSX from "xlsx";

const SOURCE_NAME = "Static Fleet";
const WORKSHEET_NAME = "Static_Fleet_List";
const IDENTITY_COLUMN = "Legacy Number";
const BUSINESS_UNIT_COLUMN = "BU";
const BATCH_SIZE = 100;

function nowIso() {
  return new Date().toISOString();
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normaliseCellValue(value) {
  if (value === null || value === undefined) return "";

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function requireImportKey(request, env) {
  const suppliedKey = request.headers.get("X-Import-Key") || "";

  if (!env.UTILISATION_IMPORT_KEY) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "Import key not configured on server." },
        503
      ),
    };
  }

  if (suppliedKey !== env.UTILISATION_IMPORT_KEY) {
    return {
      ok: false,
      response: jsonResponse({ error: "Unauthorised." }, 401),
    };
  }

  return { ok: true };
}

async function updateImportFailure(env, importId, message) {
  await env.DB.prepare(
    `UPDATE filespec_imports
     SET status = 'failed',
         error = ?,
         processed_at = ?
     WHERE id = ?`
  )
    .bind(message, nowIso(), importId)
    .run();
}

function parseWorkbook(arrayBuffer) {
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), {
    type: "array",
    cellDates: true,
    raw: true,
  });

  const worksheetName = workbook.SheetNames.includes(WORKSHEET_NAME)
    ? WORKSHEET_NAME
    : workbook.SheetNames[0];

  if (!worksheetName) {
    throw new Error("Workbook does not contain any worksheets.");
  }

  const worksheet = workbook.Sheets[worksheetName];

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: "",
    raw: true,
  });

  return {
    worksheetName,
    rows,
  };
}

function validateAndPrepareRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("The workbook contains no data rows.");
  }

  const firstRow = rows[0] || {};
  const headers = Object.keys(firstRow);

  if (!headers.includes(IDENTITY_COLUMN)) {
    throw new Error(
      `Required column '${IDENTITY_COLUMN}' was not found.`
    );
  }

  if (!headers.includes(BUSINESS_UNIT_COLUMN)) {
    throw new Error(
      `Required column '${BUSINESS_UNIT_COLUMN}' was not found.`
    );
  }

  const rowsByLegacyNumber = new Map();
  let missingIdentityCount = 0;
  let duplicateCount = 0;

  for (const originalRow of rows) {
    const legacyNumber = cleanText(originalRow[IDENTITY_COLUMN]);

    if (!legacyNumber) {
      missingIdentityCount += 1;
      continue;
    }

    const normalisedRow = {};

    for (const [columnName, value] of Object.entries(originalRow)) {
      normalisedRow[columnName] = normaliseCellValue(value);
    }

    normalisedRow[IDENTITY_COLUMN] = legacyNumber;

    const businessUnit = cleanText(
      normalisedRow[BUSINESS_UNIT_COLUMN]
    );

    normalisedRow[BUSINESS_UNIT_COLUMN] = businessUnit;

    if (rowsByLegacyNumber.has(legacyNumber)) {
      duplicateCount += 1;
    }

    // Last occurrence wins where the source file contains duplicate assets.
    rowsByLegacyNumber.set(legacyNumber, {
      legacyNumber,
      businessUnit: businessUnit || null,
      fieldValues: normalisedRow,
    });
  }

  const preparedRows = Array.from(rowsByLegacyNumber.values());

  if (preparedRows.length === 0) {
    throw new Error(
      "No rows containing a valid Legacy Number were found."
    );
  }

  return {
    headers,
    preparedRows,
    sourceRowCount: rows.length,
    validRowCount: preparedRows.length,
    missingIdentityCount,
    duplicateCount,
  };
}

async function loadRowsIntoStaging(env, importId, preparedRows) {
  await env.DB.prepare(
    "DELETE FROM utilisation_static_fleet_staging WHERE import_id = ?"
  )
    .bind(importId)
    .run();

  const statements = preparedRows.map((row) =>
    env.DB.prepare(
      `INSERT INTO utilisation_static_fleet_staging
        (
          import_id,
          legacy_number,
          business_unit,
          field_values,
          staged_at
        )
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      importId,
      row.legacyNumber,
      row.businessUnit,
      JSON.stringify(row.fieldValues),
      nowIso()
    )
  );

  for (const chunk of chunkArray(statements, BATCH_SIZE)) {
    await env.DB.batch(chunk);
  }
}

async function getImportRecord(env, importId) {
  if (importId) {
    return env.DB.prepare(
      `SELECT *
       FROM filespec_imports
       WHERE id = ?`
    )
      .bind(importId)
      .first();
  }

  return env.DB.prepare(
    `SELECT *
     FROM filespec_imports
     WHERE source = ?
       AND status = 'received'
     ORDER BY id ASC
     LIMIT 1`
  )
    .bind(SOURCE_NAME)
    .first();
}

export async function handleProcessStaticFleet(request, env) {
  const keyCheck = await requireImportKey(request, env);

  if (!keyCheck.ok) {
    return keyCheck.response;
  }

  const url = new URL(request.url);
  const requestedId = Number.parseInt(
    url.searchParams.get("id") || "",
    10
  );

  const importId = Number.isInteger(requestedId)
    ? requestedId
    : null;

  const importRecord = await getImportRecord(env, importId);

  if (!importRecord) {
    return jsonResponse(
      { error: "No matching Static Fleet import was found." },
      404
    );
  }

  if (importRecord.source !== SOURCE_NAME) {
    return jsonResponse(
      {
        error: `Import ${importRecord.id} is not a Static Fleet import.`,
      },
      400
    );
  }

  if (importRecord.status === "success") {
    return jsonResponse(
      {
        error: `Import ${importRecord.id} has already been completed.`,
      },
      409
    );
  }

  const startedAt = nowIso();

  await env.DB.prepare(
    `UPDATE filespec_imports
     SET status = 'processing',
         processing_started_at = ?,
         processed_at = NULL,
         parsed_at = NULL,
         row_count = 0,
         inserted_count = 0,
         updated_count = 0,
         bu_change_count = 0,
         error = NULL
     WHERE id = ?`
  )
    .bind(startedAt, importRecord.id)
    .run();

  try {
    const r2Object = await env.FILESPEC_BUCKET.get(
      importRecord.r2_key
    );

    if (!r2Object) {
      throw new Error(
        `R2 object was not found: ${importRecord.r2_key}`
      );
    }

    const workbookBytes = await r2Object.arrayBuffer();

    if (!workbookBytes || workbookBytes.byteLength === 0) {
      throw new Error("The R2 workbook is empty.");
    }

    const parsed = parseWorkbook(workbookBytes);

    const validation = validateAndPrepareRows(parsed.rows);

    await loadRowsIntoStaging(
      env,
      importRecord.id,
      validation.preparedRows
    );

    const stagedCountRow = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM utilisation_static_fleet_staging
       WHERE import_id = ?`
    )
      .bind(importRecord.id)
      .first();

    const stagedCount = Number(stagedCountRow?.count || 0);

    if (stagedCount !== validation.validRowCount) {
      throw new Error(
        `Staging validation failed. Expected ${validation.validRowCount} rows but found ${stagedCount}.`
      );
    }

    const parsedAt = nowIso();

    await env.DB.prepare(
      `UPDATE filespec_imports
       SET status = 'staged',
           parsed_at = ?,
           row_count = ?,
           error = NULL
       WHERE id = ?`
    )
      .bind(
        parsedAt,
        validation.validRowCount,
        importRecord.id
      )
      .run();

    return jsonResponse({
      ok: true,
      importId: importRecord.id,
      source: importRecord.source,
      filename: importRecord.filename,
      worksheet: parsed.worksheetName,
      sourceRowCount: validation.sourceRowCount,
      stagedRowCount: stagedCount,
      missingIdentityCount: validation.missingIdentityCount,
      duplicateCount: validation.duplicateCount,
      headerCount: validation.headers.length,
      status: "staged",
      liveFleetChanged: false,
      buHistoryChanged: false,
      assetsDefleeted: false,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    await updateImportFailure(
      env,
      importRecord.id,
      message
    );

    return jsonResponse(
      {
        ok: false,
        importId: importRecord.id,
        status: "failed",
        error: message,
        liveFleetChanged: false,
        buHistoryChanged: false,
        assetsDefleeted: false,
      },
      500
    );
  }
}
