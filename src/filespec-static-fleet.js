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

if (importRecord.processed_at) {
  return jsonResponse(
    {
      error: `Import ${importRecord.id} has already been promoted.`,
      processedAt: importRecord.processed_at,
    },
    409
  );
}

  const startedAt = nowIso();

  await env.DB.prepare(
    `UPDATE filespec_imports
     SET status = 'parsing',
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
       SET status = 'parsed',
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
      status: "parsed",
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
// Promotes a fully parsed Static Fleet import from staging into the live fleet.
// This is separate from parsing so the staged data can be checked first.
export async function handlePromoteStaticFleet(request, env) {
  const keyCheck = await requireImportKey(request, env);

  if (!keyCheck.ok) {
    return keyCheck.response;
  }

  const url = new URL(request.url);
  const importId = Number.parseInt(
    url.searchParams.get("id") || "",
    10
  );

  if (!Number.isInteger(importId) || importId < 1) {
    return jsonResponse(
      { error: "A valid import id is required." },
      400
    );
  }

  const importRecord = await env.DB.prepare(
    `SELECT *
     FROM filespec_imports
     WHERE id = ?`
  )
    .bind(importId)
    .first();

  if (!importRecord) {
    return jsonResponse(
      { error: `Import ${importId} was not found.` },
      404
    );
  }

  if (importRecord.source !== SOURCE_NAME) {
    return jsonResponse(
      { error: `Import ${importId} is not a Static Fleet import.` },
      400
    );
  }

  if (importRecord.status !== "parsed") {
    return jsonResponse(
      {
        error:
          `Import ${importId} must have status 'parsed' before promotion. ` +
          `Current status: ${importRecord.status}`,
      },
      409
    );
  }

  if (importRecord.processed_at) {
    return jsonResponse(
      {
        error: `Import ${importId} has already been promoted.`,
        processedAt: importRecord.processed_at,
      },
      409
    );
  }

  const stagedCountRow = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM utilisation_static_fleet_staging
     WHERE import_id = ?`
  )
    .bind(importId)
    .first();

  const stagedCount = Number(stagedCountRow?.count || 0);

  if (stagedCount < 1) {
    return jsonResponse(
      {
        error:
          `Import ${importId} has no staged rows. ` +
          "The live fleet has not been changed.",
      },
      400
    );
  }

  if (
    Number(importRecord.row_count || 0) !== stagedCount
  ) {
    return jsonResponse(
      {
        error:
          `Staged row validation failed. Import record contains ` +
          `${importRecord.row_count} rows but staging contains ` +
          `${stagedCount} rows.`,
        liveFleetChanged: false,
        buHistoryChanged: false,
        assetsDefleeted: false,
      },
      409
    );
  }

  // Count the expected effects before making any live changes.
  const effectCounts = await env.DB.prepare(
    `SELECT
       (
         SELECT COUNT(*)
         FROM utilisation_static_fleet_staging s
         WHERE s.import_id = ?
           AND NOT EXISTS (
             SELECT 1
             FROM utilisation_static_fleet f
             WHERE f.legacy_number = s.legacy_number
           )
       ) AS inserted_count,

       (
         SELECT COUNT(*)
         FROM utilisation_static_fleet_staging s
         WHERE s.import_id = ?
           AND EXISTS (
             SELECT 1
             FROM utilisation_static_fleet f
             WHERE f.legacy_number = s.legacy_number
           )
       ) AS updated_count,

       (
         SELECT COUNT(*)
         FROM utilisation_static_fleet_staging s
         JOIN utilisation_asset_bu_history h
           ON h.legacy_number = s.legacy_number
          AND h.effective_to IS NULL
         WHERE s.import_id = ?
           AND COALESCE(h.business_unit, '') <>
               COALESCE(s.business_unit, '')
       ) AS bu_change_count,

       (
         SELECT COUNT(*)
         FROM utilisation_static_fleet_staging s
         JOIN utilisation_static_fleet f
           ON f.legacy_number = s.legacy_number
         WHERE s.import_id = ?
           AND f.status = 'inactive'
       ) AS reactivated_count,

       (
         SELECT COUNT(*)
         FROM utilisation_static_fleet f
         WHERE f.status = 'active'
           AND NOT EXISTS (
             SELECT 1
             FROM utilisation_static_fleet_staging s
             WHERE s.import_id = ?
               AND s.legacy_number = f.legacy_number
           )
       ) AS deactivated_count`
  )
    .bind(
      importId,
      importId,
      importId,
      importId,
      importId
    )
    .first();

  const insertedCount = Number(
    effectCounts?.inserted_count || 0
  );

  const updatedCount = Number(
    effectCounts?.updated_count || 0
  );

  const buChangeCount = Number(
    effectCounts?.bu_change_count || 0
  );

  const reactivatedCount = Number(
    effectCounts?.reactivated_count || 0
  );

  const deactivatedCount = Number(
    effectCounts?.deactivated_count || 0
  );

  const promotedAt = nowIso();
  const sourceFile = importRecord.filename || null;

  try {
    await env.DB.batch([
      // Close the current BU period when:
      // 1. the asset has moved to another BU; or
      // 2. the asset is absent from this successful complete import.
      env.DB.prepare(
        `UPDATE utilisation_asset_bu_history
         SET effective_to = ?
         WHERE effective_to IS NULL
           AND (
             EXISTS (
               SELECT 1
               FROM utilisation_static_fleet_staging s
               WHERE s.import_id = ?
                 AND s.legacy_number =
                     utilisation_asset_bu_history.legacy_number
                 AND COALESCE(s.business_unit, '') <>
                     COALESCE(
                       utilisation_asset_bu_history.business_unit,
                       ''
                     )
             )
             OR NOT EXISTS (
               SELECT 1
               FROM utilisation_static_fleet_staging s
               WHERE s.import_id = ?
                 AND s.legacy_number =
                     utilisation_asset_bu_history.legacy_number
             )
           )`
      ).bind(
        promotedAt,
        importId,
        importId
      ),

      // Create an open BU-history record for:
      // - new assets;
      // - assets that changed BU;
      // - previously inactive assets that returned.
      env.DB.prepare(
        `INSERT INTO utilisation_asset_bu_history
          (
            legacy_number,
            business_unit,
            effective_from,
            effective_to,
            source_import_id,
            source_file,
            created_at
          )
         SELECT
           s.legacy_number,
           s.business_unit,
           ?,
           NULL,
           ?,
           ?,
           ?
         FROM utilisation_static_fleet_staging s
         WHERE s.import_id = ?
           AND NOT EXISTS (
             SELECT 1
             FROM utilisation_asset_bu_history h
             WHERE h.legacy_number = s.legacy_number
               AND h.effective_to IS NULL
           )`
      ).bind(
        promotedAt,
        importId,
        sourceFile,
        promotedAt,
        importId
      ),

      // Update assets that already exist and reactivate them where required.
      env.DB.prepare(
        `UPDATE utilisation_static_fleet
         SET
           field_values = (
             SELECT s.field_values
             FROM utilisation_static_fleet_staging s
             WHERE s.import_id = ?
               AND s.legacy_number =
                   utilisation_static_fleet.legacy_number
           ),
           status = 'active',
           source_file = ?,
           last_seen_at = ?,
           updated_at = ?
         WHERE EXISTS (
           SELECT 1
           FROM utilisation_static_fleet_staging s
           WHERE s.import_id = ?
             AND s.legacy_number =
                 utilisation_static_fleet.legacy_number
         )`
      ).bind(
        importId,
        sourceFile,
        promotedAt,
        promotedAt,
        importId
      ),

      // Insert assets that have never previously appeared.
      env.DB.prepare(
        `INSERT INTO utilisation_static_fleet
          (
            legacy_number,
            status,
            field_values,
            source_file,
            first_seen_at,
            last_seen_at,
            created_at,
            updated_at
          )
         SELECT
           s.legacy_number,
           'active',
           s.field_values,
           ?,
           ?,
           ?,
           ?,
           ?
         FROM utilisation_static_fleet_staging s
         WHERE s.import_id = ?
           AND NOT EXISTS (
             SELECT 1
             FROM utilisation_static_fleet f
             WHERE f.legacy_number = s.legacy_number
           )`
      ).bind(
        sourceFile,
        promotedAt,
        promotedAt,
        promotedAt,
        promotedAt,
        importId
      ),

      // Defleet only after a complete parsed import has reached promotion.
      // Records are retained and changed to inactive, never deleted.
      env.DB.prepare(
        `UPDATE utilisation_static_fleet
         SET
           status = 'inactive',
           updated_at = ?
         WHERE status = 'active'
           AND NOT EXISTS (
             SELECT 1
             FROM utilisation_static_fleet_staging s
             WHERE s.import_id = ?
               AND s.legacy_number =
                   utilisation_static_fleet.legacy_number
           )`
      ).bind(
        promotedAt,
        importId
      ),

      // Sync File Spec headers to this import: the latest Static Fleet file is
      // the source of truth. New headers are added (visible, not a filter);
      // headers missing from this file are hidden (enabled = 0) but keep their
      // settings, so they come back as they were if the header returns.
      env.DB.prepare(
        `INSERT INTO utilisation_static_field_defs
          (source_column, display_label, save_to_db, is_identity, use_as_filter,
           filter_type, display_order, enabled, created_at, updated_at, is_telematics_source)
         SELECT
           j.key, TRIM(j.key), 0, 0, 0, 'select',
           (SELECT COALESCE(MAX(display_order), 0) FROM utilisation_static_field_defs)
             + ROW_NUMBER() OVER (ORDER BY j.id),
           1, ?, ?, 0
         FROM json_each((
           SELECT field_values FROM utilisation_static_fleet_staging
           WHERE import_id = ? ORDER BY id LIMIT 1
         )) j
         WHERE j.key NOT IN (SELECT source_column FROM utilisation_static_field_defs)`
      ).bind(promotedAt, promotedAt, importId),

      env.DB.prepare(
        `UPDATE utilisation_static_field_defs
         SET enabled = (source_column IN (
               SELECT key FROM json_each((
                 SELECT field_values FROM utilisation_static_fleet_staging
                 WHERE import_id = ? ORDER BY id LIMIT 1
               ))
             )),
             updated_at = ?
         WHERE enabled <> (source_column IN (
               SELECT key FROM json_each((
                 SELECT field_values FROM utilisation_static_fleet_staging
                 WHERE import_id = ? ORDER BY id LIMIT 1
               ))
             ))`
      ).bind(importId, promotedAt, importId),

      // Record successful promotion.
      // The existing status constraint uses 'parsed' as the completed status;
      // processed_at distinguishes parsed-only from fully promoted.
      env.DB.prepare(
        `UPDATE filespec_imports
         SET
           status = 'parsed',
           processed_at = ?,
           inserted_count = ?,
           updated_count = ?,
           bu_change_count = ?,
           error = NULL
         WHERE id = ?`
      ).bind(
        promotedAt,
        insertedCount,
        updatedCount,
        buChangeCount,
        importId
      ),
    ]);

    return jsonResponse({
      ok: true,
      importId,
      status: "completed",
      databaseStatus: "parsed",
      processedAt: promotedAt,
      stagedRowCount: stagedCount,
      insertedCount,
      updatedCount,
      buChangeCount,
      reactivatedCount,
      deactivatedCount,
      liveFleetChanged: true,
      buHistoryChanged: true,
      assetsDefleeted: deactivatedCount > 0,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    await env.DB.prepare(
      `UPDATE filespec_imports
       SET error = ?
       WHERE id = ?`
    )
      .bind(message, importId)
      .run();

    return jsonResponse(
      {
        ok: false,
        importId,
        status: "promotion_failed",
        error: message,
        liveFleetChanged: false,
        buHistoryChanged: false,
        assetsDefleeted: false,
      },
      500
    );
  }
}

// Runs the complete Static Fleet workflow for a newly received import.
// Intended for background execution after the original file is stored in R2.
export async function runStaticFleetPipeline(env, importId) {
  const internalHeaders = new Headers({
    "X-Import-Key": env.UTILISATION_IMPORT_KEY,
  });

  const processRequest = new Request(
    `https://internal/api/filespec/process-static-fleet?id=${importId}`,
    {
      method: "POST",
      headers: internalHeaders,
    }
  );

  const processResponse = await handleProcessStaticFleet(
    processRequest,
    env
  );

  const processResult = await processResponse.json();

  if (!processResponse.ok || processResult.status !== "parsed") {
    throw new Error(
      processResult.error ||
      `Static Fleet parsing failed for import ${importId}.`
    );
  }

  const promoteRequest = new Request(
    `https://internal/api/filespec/promote-static-fleet?id=${importId}`,
    {
      method: "POST",
      headers: internalHeaders,
    }
  );

  const promoteResponse = await handlePromoteStaticFleet(
    promoteRequest,
    env
  );

  const promoteResult = await promoteResponse.json();

  if (!promoteResponse.ok || promoteResult.status !== "completed") {
    throw new Error(
      promoteResult.error ||
      `Static Fleet promotion failed for import ${importId}.`
    );
  }

  return {
    process: processResult,
    promotion: promoteResult,
  };
}
