const state = {
  currentSessionUser: null,
  activeAssetLookup: null,
  approvedUsers: [],
  accessHistory: [],
  debugLog: [],
  lastDebugLabel: "No debug entries.",
  debugWindowOpen: false,
  activeVpmMode: "user-input",
  vpmResults: {
    mode: null,
    columns: [],
    rows: [],
    summary: "No VPM analysis has been run yet.",
  },
  vpmRunToken: 0,
  assetTrack: {
    mode: "user",
    rows: [],
    filteredRows: [],
    filters: {},
    selectedKeys: [],
    isRunning: false,
    summary: "No Asset Track analysis has been run yet.",
  },
};

const el = {
  loginForm: document.getElementById("login-form"),
  loginMessage: document.getElementById("login-message"),
  loginScreen: document.getElementById("login-screen"),
  appShell: document.getElementById("app-shell"),
  heroSection: document.getElementById("snapshot-hero"),
  headerActions: document.getElementById("header-actions"),
  heroDebugPanel: null,
  heroDebugTitle: null,
  heroDebugOutput: null,
  heroDebugSubcopy: null,
  debugToggleWrap: document.getElementById("debug-toggle-wrap"),
  debugToggle: document.getElementById("debug-toggle"),
  debugWindow: document.getElementById("debug-window"),
  debugWindowHandle: document.getElementById("debug-window-handle"),
  debugCloseButton: document.getElementById("debug-close-btn"),
  debugWindowPanelTitle: document.getElementById("debug-window-panel-title"),
  debugWindowPanelSubcopy: document.getElementById("debug-window-panel-subcopy"),
  debugWindowEventTitle: document.getElementById("debug-window-event-title"),
  debugWindowEventOutput: document.getElementById("debug-window-event-output"),
  debugOutput: document.getElementById("debug-output"),
  adminTab: document.getElementById("admin-tab"),
  vpmTab: document.getElementById("vpm-tab"),
  standardTab: document.getElementById("standard-tab"),
  assetTrackTab: document.getElementById("asset-track-tab"),
  standardView: document.getElementById("standard-view"),
  assetTrackView: document.getElementById("asset-track-view"),
  assetTrackResultsView: document.getElementById("asset-track-results-view"),
  adminView: document.getElementById("admin-view"),
  vpmView: document.getElementById("vpm-view"),
  approvedUserForm: document.getElementById("approved-user-form"),
  approvedUsersTableBody: document.getElementById("approved-users-table-body"),
  importUsersButton: document.getElementById("import-users-btn"),
  importUsersFile: document.getElementById("import-users-file"),
  historyUserFilter: document.getElementById("history-user-filter"),
  historyTableBody: document.getElementById("history-table-body"),
  assetSearchForm: document.getElementById("asset-search-form"),
  assetSearchMessage: document.getElementById("asset-search-message"),
  assetShell: document.getElementById("asset-shell"),
  refreshAssetButton: document.getElementById("refresh-asset-btn"),
  exportPdfButton: document.getElementById("export-pdf-btn"),
  emailPdfButton: document.getElementById("email-pdf-btn"),
  performanceDynamicGrid: document.getElementById("performance-dynamic-grid"),
  vpmUserInputTab: document.getElementById("vpm-user-input-tab"),
  vpmFleetEvaluationTab: document.getElementById("vpm-fleet-evaluation-tab"),
  vpmUserInputPanel: document.getElementById("vpm-user-input-panel"),
  vpmFleetPanel: document.getElementById("vpm-fleet-panel"),
  vpmImeiInput: document.getElementById("vpm-imei-input"),
  runVpmButton: document.getElementById("run-vpm-btn"),
  cancelVpmButton: document.getElementById("cancel-vpm-btn"),
  vpmExportButton: document.getElementById("vpm-export-btn"),
  vpmSummary: document.getElementById("vpm-summary"),
  vpmResultsHead: document.getElementById("vpm-results-head"),
  vpmResultsBody: document.getElementById("vpm-results-body"),
  logoutButton: document.getElementById("logout-btn"),
  approvedPassword: document.getElementById("approved-password"),
  assetTrackUserTab: document.getElementById("asset-track-user-tab"),
  assetTrackFleetTab: document.getElementById("asset-track-fleet-tab"),
  assetTrackRefreshButton: document.getElementById("asset-track-refresh-btn"),
  assetTrackExportPdfButton: document.getElementById("asset-track-export-pdf-btn"),
  assetTrackExportExcelButton: document.getElementById("asset-track-export-excel-btn"),
  assetTrackEmailButton: document.getElementById("asset-track-email-btn"),
  assetTrackUserPanel: document.getElementById("asset-track-user-panel"),
  assetTrackFleetPanel: document.getElementById("asset-track-fleet-panel"),
  assetTrackImeiInput: document.getElementById("asset-track-imei-input"),
  assetTrackImeiHelper: document.getElementById("asset-track-imei-helper"),
  assetTrackRunButton: document.getElementById("asset-track-run-btn"),
  assetTrackMessage: document.getElementById("asset-track-message"),
  assetTrackSummary: document.getElementById("asset-track-summary"),
  assetTrackResultsHead: document.getElementById("asset-track-results-head"),
  assetTrackResultsBody: document.getElementById("asset-track-results-body"),
};

function getNode(id) {
  return document.getElementById(id);
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function setText(ids, value, fallback = "") {
  const resolvedIds = Array.isArray(ids) ? ids : [ids];
  const text = safeText(value, fallback);

  resolvedIds.forEach((id) => {
    const node = getNode(id);
    if (node) node.textContent = text;
  });
}

function setVisible(node, visible, displayValue = "block") {
  if (!node) return;
  node.style.display = visible ? displayValue : "none";
}

function setFieldValue(id, value) {
  const node = getNode(id);
  if (node) node.value = safeText(value);
}

function currentIsoTime() {
  return new Date().toISOString();
}

function formatDisplayDate(value) {
  if (!value) return "--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return safeText(value, "--");

  return date.toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatMetric(value, suffix = "") {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return safeText(value, "");

  return `${Number.isInteger(numericValue) ? numericValue : numericValue.toFixed(2)}${suffix}`;
}

function formatBooleanState(value, truthyLabel, falsyLabel, fallback = "") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value ? truthyLabel : falsyLabel;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "on", "enabled", "active", "moving"].includes(normalized)) return truthyLabel;
  if (["false", "off", "disabled", "inactive", "stopped"].includes(normalized)) return falsyLabel;

  return safeText(value, fallback);
}

function isAdminUser() {
  return state.currentSessionUser?.role === "admin";
}

function showLoginError(message = "Access denied. Please contact Telematics.") {
  setText("login-message", message);
}

function showAssetSearchMessage(message = "", isError = true) {
  if (!el.assetSearchMessage) return;

  el.assetSearchMessage.textContent = message;
  el.assetSearchMessage.style.color = isError ? "" : "#0d5f3a";
}

function clearAssetSearchMessage() {
  showAssetSearchMessage("", true);
}

function setImage(imageId, emptyId, url) {
  const image = getNode(imageId);
  const empty = getNode(emptyId);
  const status = getNode(imageId + "-status");

  if (!image || !empty) return;

  if (url) {
    image.src = url;
    image.style.display = "block";
    empty.style.display = "none";
    if (status) status.textContent = "";
    return;
  }

  image.removeAttribute("src");
  image.style.display = "none";
  empty.textContent = "No image available";
  empty.style.display = "block";
  if (status) status.textContent = "No image to preview";
}

function safeParseJson(value) {
  if (!value || typeof value !== "string") return null;

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function formatMaxTwoDecimals(value) {
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return null;
  return Number(numericValue.toFixed(2));
}

function clampNegative(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return num < 0 ? 0 : num;
}

function formatBytesToGb(bytesValue) {
  const numericValue = Number(bytesValue);
  if (Number.isNaN(numericValue) || numericValue <= 0) return null;

  const gbValue = numericValue / (1024 * 1024 * 1024);
  return `${gbValue.toFixed(2)} GB`;
}

function writeDebug(label, data) {
  const timestamp = new Date().toLocaleTimeString("en-AU", { hour12: false });
  const detail = data !== undefined
    ? (typeof data === "string" ? data : JSON.stringify(data, null, 2))
    : "";

  const entry = `[${timestamp}] ${label}${detail ? "\n" + detail : ""}`;
  state.debugLog.push(entry);
  if (state.debugLog.length > 200) state.debugLog.shift();
  state.lastDebugLabel = label;
  renderDebug();
}

function setDebugWindowOpen(shouldOpen) {
  const isOpen = Boolean(shouldOpen && isAdminUser());
  state.debugWindowOpen = isOpen;

  if (el.debugToggle) {
    el.debugToggle.checked = isOpen;
  }

  if (!el.debugWindow) return;

  setVisible(el.debugWindow, isOpen, "flex");
  el.debugWindow.setAttribute("aria-hidden", String(!isOpen));
}

function renderDebug() {
  const isAdmin = isAdminUser();
  const fullLog = state.debugLog.join("\n\n");
  const latestLabel = state.lastDebugLabel || "No debug entries.";

  setVisible(el.debugToggleWrap, isAdmin, "inline-flex");

  if (!isAdmin) {
    setDebugWindowOpen(false);
  }

  if (el.debugWindowPanelTitle) {
    el.debugWindowPanelTitle.textContent = isAdmin ? "Live Admin Inspector" : "Admin debug only";
  }

  if (el.debugWindowPanelSubcopy) {
    el.debugWindowPanelSubcopy.textContent = isAdmin
      ? `${state.debugLog.length} events logged this session.`
      : "Debug output is available only for admin sessions.";
  }

  if (el.debugWindowEventTitle) {
    el.debugWindowEventTitle.textContent = isAdmin ? latestLabel : "Admin debug only";
  }

  if (el.debugWindowEventOutput) {
    el.debugWindowEventOutput.textContent = isAdmin
      ? fullLog || "No debug entries."
      : "Sign in with an admin account to inspect live debug output.";

    if (isAdmin) {
      el.debugWindowEventOutput.scrollTop = el.debugWindowEventOutput.scrollHeight;
    }
  }

  if (el.debugOutput) {
    el.debugOutput.textContent = fullLog;
  }
}

function showStandardView() {
  setVisible(el.heroSection, true, "grid");
  setVisible(el.standardView, true, "block");
  setVisible(el.assetTrackView, false);
  setVisible(el.assetTrackResultsView, false);
  setVisible(el.adminView, false);
  setVisible(el.vpmView, false);
}

function showAssetTrackView() {
  setVisible(el.heroSection, false);
  setVisible(el.standardView, false);
  setVisible(el.assetTrackView, true, "block");
  setVisible(el.assetTrackResultsView, state.assetTrack.rows.length > 0, "block");
  setVisible(el.adminView, false);
  setVisible(el.vpmView, false);
}

function showAdminView() {
  setVisible(el.heroSection, false);
  setVisible(el.standardView, false);
  setVisible(el.assetTrackView, false);
  setVisible(el.assetTrackResultsView, false);
  setVisible(el.adminView, true, "block");
  setVisible(el.vpmView, false);
}

function showVpmView() {
  setVisible(el.heroSection, false);
  setVisible(el.standardView, false);
  setVisible(el.assetTrackView, false);
  setVisible(el.assetTrackResultsView, false);
  setVisible(el.adminView, false);
  setVisible(el.vpmView, true, "block");
}

function clearSessionUi() {
  state.currentSessionUser = null;
  state.approvedUsers = [];
  state.accessHistory = [];
  setVisible(el.loginScreen, true, "grid");
  setVisible(el.appShell, false);
  setVisible(el.headerActions, false);
  setVisible(el.adminTab, false);
  setVisible(el.vpmTab, false);
  setVisible(el.assetTrackTab, false);
  setDebugWindowOpen(false);
  setText("login-message", "");
  resetActiveAssetLookup();
  resetAssetTrackView();
  renderDebug();
}

async function fetchJson(url, options = {}, fallbackMessage = "Request failed.") {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const payload = isJson ? await response.json().catch(() => ({})) : {};

  if (!response.ok) {
    if (response.status === 401) {
      clearSessionUi();
    }

    throw new Error(payload.detail || payload.error || fallbackMessage);
  }

  return payload;
}

async function fetchBlob(url, options = {}, fallbackMessage = "Download failed.") {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
  });

  if (!response.ok) {
    let message = fallbackMessage;

    try {
      const payload = await response.json();
      message = payload.detail || payload.error || fallbackMessage;
    } catch (error) {
      message = fallbackMessage;
    }

    if (response.status === 401) {
      clearSessionUi();
    }

    throw new Error(message);
  }

  return response.blob();
}

async function apiGet(url, fallbackMessage) {
  return fetchJson(url, { method: "GET" }, fallbackMessage);
}

async function apiPost(url, body, fallbackMessage) {
  return fetchJson(
    url,
    {
      method: "POST",
      body: JSON.stringify(body || {}),
    },
    fallbackMessage,
  );
}

async function loadSession() {
  try {
    const session = await apiGet("/api/session", "No active session.");
    state.currentSessionUser = session.user;
    openAppForUser(session.user);
    writeDebug("Session restored", session.user);
  } catch (error) {
    clearSessionUi();
  }
}

async function loadApprovedUsers() {
  if (state.currentSessionUser?.role !== "admin") return;

  state.approvedUsers = await apiGet("/api/approved-users", "Unable to load approved users.");
  renderApprovedUsersTable();
}

async function loadAccessHistory() {
  if (state.currentSessionUser?.role !== "admin") return;

  state.accessHistory = await apiGet("/api/access-history", "Unable to load access history.");
  renderHistoryUserFilter();
  renderHistoryTable();
}

async function loadAdminData() {
  await Promise.all([loadApprovedUsers(), loadAccessHistory()]);
}

function openAppForUser(sessionUser) {
  state.currentSessionUser = sessionUser;
  setVisible(el.loginScreen, false);
  setVisible(el.appShell, true, "block");
  setVisible(el.headerActions, true, "flex");
  setVisible(el.assetTrackTab, true, "inline-block");

  if (sessionUser.role === "admin") {
    setVisible(el.adminTab, true, "inline-block");
    setVisible(el.vpmTab, true, "inline-block");
    loadAdminData().catch((error) => {
      writeDebug("Admin data load failed", error.message);
    });
  } else {
    setVisible(el.adminTab, false);
    setVisible(el.vpmTab, false);
  }

  renderDebug();
  showVpmPanel("user-input");
  resetAssetTrackView();
  showStandardView();
}

function initialiseUi() {
  setVisible(el.appShell, false);
  setVisible(el.headerActions, false);
  setVisible(el.adminTab, false);
  setVisible(el.vpmTab, false);
  setVisible(el.assetTrackTab, false);
  setVisible(el.debugToggleWrap, false);
  setDebugWindowOpen(false);
  showStandardView();
  showVpmPanel("user-input");
  renderVpmResults();
  resetRenderedAsset();
  resetAssetTrackView();
  renderDebug();
}

function renderHistoryUserFilter() {
  if (!el.historyUserFilter) return;

  const usernames = [...new Set(state.accessHistory.map((item) => item.username))];
  el.historyUserFilter.innerHTML = '<option value="">All Users</option>';

  usernames.forEach((username) => {
    const option = document.createElement("option");
    option.value = username;
    option.textContent = username;
    el.historyUserFilter.appendChild(option);
  });
}

function renderHistoryTable() {
  if (!el.historyTableBody || !el.historyUserFilter) return;

  const selectedUser = el.historyUserFilter.value;
  const filteredHistory = selectedUser
    ? state.accessHistory.filter((item) => item.username === selectedUser)
    : state.accessHistory;

  el.historyTableBody.innerHTML = "";

  filteredHistory.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${safeText(item.username)}</td>
      <td>${formatDisplayDate(item.dateTime)}</td>
      <td>${safeText(item.assetRequested)}</td>
    `;
    el.historyTableBody.appendChild(row);
  });
}

function renderApprovedUsersTable() {
  if (!el.approvedUsersTableBody) return;

  el.approvedUsersTableBody.innerHTML = "";

  state.approvedUsers.forEach((user) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${safeText(user.firstName)}</td>
      <td>${safeText(user.lastName)}</td>
      <td>${safeText(user.username)}</td>
      <td>${safeText(user.role)}</td>
      <td>${safeText(user.status)}</td>
      <td>${safeText(user.updatedBy)}</td>
      <td>${formatDisplayDate(user.updatedDate)}</td>
      <td>
        <button type="button" data-action="edit" data-username="${user.username}">Edit</button>
        <button type="button" data-action="deactivate" data-username="${user.username}">Deactivate</button>
      </td>
    `;
    el.approvedUsersTableBody.appendChild(row);
  });
}

function resetApprovedUserForm() {
  if (el.approvedUserForm) el.approvedUserForm.reset();
}

function fillApprovedUserForm(user) {
  setFieldValue("approved-first-name", user.firstName);
  setFieldValue("approved-last-name", user.lastName);
  setFieldValue("approved-username", user.username);
  setFieldValue("approved-role", user.role);
  setFieldValue("approved-status", user.status);
}

function mapVehicleDevices(devices) {
  const trackingDevice = devices.find(
    (device) => String(device.type?.code || "").toUpperCase() === "HERMES",
  );
  const tabletDevice = devices.find(
    (device) => String(device.type?.code || "").toUpperCase() === "IFACE",
  );
  const cameraDevice = devices.find(
    (device) => String(device.type?.code || "").toUpperCase() === "CAMERA",
  );

  return {
    trackingSystem: trackingDevice
      ? {
          id: trackingDevice.id,
          imei: trackingDevice.imei || "",
          serialNumber: trackingDevice.serialNumber || "",
          releaseVersion: trackingDevice.releaseVersion || "",
        }
      : null,
    tablet: tabletDevice
      ? {
          id: tabletDevice.id,
          imei: tabletDevice.imei || "",
          serialNumber: tabletDevice.serialNumber || "",
          model: tabletDevice.model?.name || "",
        }
      : null,
    camera: cameraDevice
      ? {
          id: cameraDevice.id,
          imei: cameraDevice.imei || "",
          serialNumber: cameraDevice.serialNumber || "",
          model: cameraDevice.model?.name || "",
        }
      : null,
  };
}

function extractVehicleMeters(meters) {
  const engineHoursRecord = meters.find(
    (meter) =>
      String(meter.type || "").toLowerCase() === "hours" &&
      String(meter.maintenanceType || "").toUpperCase() === "TIME",
  );

  const odometerRecord = meters.find(
    (meter) =>
      String(meter.type || "").toLowerCase() === "odometer" &&
      String(meter.maintenanceType || "").toUpperCase() === "DISTANCE",
  );

  return {
    engineHours: engineHoursRecord ? formatMaxTwoDecimals(engineHoursRecord.computed) : null,
    odometer: odometerRecord ? formatMaxTwoDecimals(odometerRecord.computed) : null,
  };
}

function extractHermesStats(device) {
  const deviceStats = device.deviceStats || {};
  const attrs = deviceStats.attrs || {};
  const lastVpm = safeParseJson(deviceStats.lastVpm);
  const lastGpio = safeParseJson(deviceStats.lastGpio);
  const currentUser = deviceStats.currentUser || null;

  return {
    driverName: currentUser
      ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
      : "No driver",
    ignition: attrs.last_ignition ?? deviceStats.ignition ?? null,
    ignitionAt: attrs.last_ignition_at || null,
    movement: deviceStats.movement ?? null,
    tripId: deviceStats.tripId || null,
    location: deviceStats.location || null,
    gps: deviceStats.gps
      ? {
          latitude: deviceStats.gps.Lat ?? null,
          longitude: deviceStats.gps.Lng ?? null,
          at: deviceStats.gps.At ?? null,
        }
      : null,
    lastGpsAt: attrs.last_gps_at || deviceStats.gpsAt || null,
    performance: lastVpm
      ? {
          speed: clampNegative(lastVpm.speed),
          rpm: clampNegative(lastVpm.rpm),
          oilTemperature: clampNegative(lastVpm.oiltemp),
          oilPressure: clampNegative(lastVpm.oilpressure),
          engineLoad: clampNegative(lastVpm.engineload),
          gear: clampNegative(lastVpm.gear),
          fuelLevel: clampNegative(lastVpm.fuellevel),
          fuelConsumption: clampNegative(lastVpm.fuelconsumption),
          odometer: clampNegative(lastVpm.odometer),
          hours: clampNegative(lastVpm.hours),
          mil: lastVpm.mil ?? null,
          charge: clampNegative(lastVpm.charge),
        }
      : null,
    gpio: lastGpio || null,
  };
}

function extractCameraStats(device) {
  const deviceStats = device.deviceStats || {};
  const attrs = deviceStats.attrs || {};

  return {
    overallStatus: attrs["lm.sd_card.overall_status"] || null,
    sdCard1: {
      present: attrs["lm.sd_card.1"] === "sdCardPresent",
      rawStatus: attrs["lm.sd_card.1"] || null,
      totalSizeBytes: attrs["lm.sd_card.1_total_size_bytes"] || null,
      totalSizeDisplay: formatBytesToGb(attrs["lm.sd_card.1_total_size_bytes"]),
    },
    sdCard2: {
      present: attrs["lm.sd_card.2"] === "sdCardPresent",
      rawStatus: attrs["lm.sd_card.2"] || null,
      totalSizeBytes: attrs["lm.sd_card.2_total_size_bytes"] || null,
      totalSizeDisplay: formatBytesToGb(attrs["lm.sd_card.2_total_size_bytes"]),
    },
  };
}

function extractLatestSnapshot(events) {
  const snapshotEvents = events.filter((event) => {
    const eventType = String(event.type || "").toUpperCase();
    const eventAction = String(event.action || "").toUpperCase();
    return eventType === "CAMERA" && eventAction === "SNAPSHOT";
  });

  if (!snapshotEvents.length) {
    return {
      snapshotTime: null,
      links: [],
      rawEvent: null,
    };
  }

  snapshotEvents.sort((a, b) => {
    const aTime = new Date(a.timeAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.timeAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });

  const latestSnapshot = snapshotEvents[0];
  const context = safeParseJson(latestSnapshot.attributes?.context);
  const mediaFiles = Array.isArray(context?.response?.mediaFiles)
    ? context.response.mediaFiles
    : [];

  const links = mediaFiles.map((item) => ({
    source: item.source || null,
    mediaType: item.mediaType || null,
    mediaFile: item.mediaFile || null,
    status: item.status || null,
    sources: Array.isArray(item.imageDetails?.sources) ? item.imageDetails.sources : [],
  }));

  return {
    snapshotTime: latestSnapshot.timeAt || latestSnapshot.createdAt || null,
    links,
    rawEvent: latestSnapshot,
  };
}

function mapSnapshotLinksToSlots(snapshotData) {
  const slots = {
    roadFacing: null,
    driverFacing: null,
    inCabDriverFacingCamera: null,
    driverExternal: null,
    leftExternal: null,
  };

  const normalizeSnapshotHints = (link) => {
    const values = [
      link.source,
      link.mediaType,
      link.status,
      ...(Array.isArray(link.sources) ? link.sources : []),
    ];

    return values
      .filter(Boolean)
      .map((value) => String(value).trim().toUpperCase());
  };

  const slotRules = [
    { slot: "roadFacing", matches: ["ROAD_FACING", "ROAD", "FRONT", "FORWARD"] },
    { slot: "driverFacing", matches: ["DRIVER_FACING", "DRIVER", "CABIN"] },
    { slot: "inCabDriverFacingCamera", matches: ["IN_CAB", "IN_CAB_DRIVER", "INCAB", "UVC"] },
    { slot: "driverExternal", matches: ["DRIVER_EXTERNAL", "RIGHT_EXTERNAL", "SIDE_RIGHT", "TVI2"] },
    { slot: "leftExternal", matches: ["LEFT_EXTERNAL", "LEFT", "SIDE_LEFT", "TVI1"] },
  ];
  const remainingLinks = [];

  snapshotData.links.forEach((link) => {
    const hints = normalizeSnapshotHints(link);
    const matchedRule = slotRules.find(
      (rule) => !slots[rule.slot] && rule.matches.some((match) => hints.includes(match)),
    );

    if (matchedRule) {
      slots[matchedRule.slot] = link.mediaFile;
      return;
    }

    remainingLinks.push(link.mediaFile);
  });

  Object.keys(slots).forEach((slot) => {
    if (!slots[slot] && remainingLinks.length) {
      slots[slot] = remainingLinks.shift();
    }
  });

  return slots;
}

function buildLookupSummary(
  rawAssetNumber,
  vehicle,
  devices,
  meters,
  hermesStats,
  cameraStats,
  cameraSnapshot,
  durations,
) {
  return {
    requestedAssetNumber: rawAssetNumber,
    requestedAt: currentIsoTime(),
    renderDurationMs: durations.renderDurationMs,
       vehicle: {
      vehicleId: vehicle.id,
      assetNumber: vehicle.name || rawAssetNumber,
      registration: vehicle.registration,
      registrationState: vehicle.registrationState,
      vin: vehicle.vin,
      make: vehicle.operationalVehicleModel?.make || vehicle.make || "",
      model: vehicle.operationalVehicleModel?.model || vehicle.model || "",
      yearOfManufacture:
        vehicle.operationalVehicleModel?.yearOfManufacture || vehicle.yearOfManufacture || null,
    },    
    devices,
    meters,
    hermesStats,
    cameraStats,
    cameraSnapshot,
  };
}

function renderHero(lookup) {
  const vehicle = lookup.vehicle || {};

  setText("hero-current-asset", vehicle.registration || vehicle.assetNumber || "Asset loaded");
  setText("hero-request-time", formatDisplayDate(lookup.requestedAt), "--");
  setText("hero-lookup-status", "Loaded");
  setText("hero-fleet-number", vehicle.assetNumber || lookup.requestedAssetNumber, "--");
  setText("hero-vehicle-id", vehicle.vehicleId, "--");
  setText("hero-render-time", `${lookup.renderDurationMs} ms`, "--");
}

function renderVehicleDetails(lookup) {
  const vehicle = lookup.vehicle || {};
  const devices = lookup.devices || {};
  const hermesStats = lookup.hermesStats || {};

  setText("view-asset-number", vehicle.assetNumber);
  setText("view-registration", vehicle.registration);
  setText("view-vin", vehicle.vin);
  setText("view-make", vehicle.make);
  setText("view-model", vehicle.model);
  setText("view-system-id", vehicle.vehicleId);
  setText("view-year", vehicle.yearOfManufacture);
  setText("view-driver", hermesStats.driverName || "No driver");

  setText("view-tracker-imei", devices.trackingSystem?.imei, "Not fitted");
  setText("view-tracker-serial", devices.trackingSystem?.serialNumber, "Not fitted");
  setText("view-tablet-imei", devices.tablet?.imei, "Not fitted");
  setText("view-tablet-serial", devices.tablet?.serialNumber, "Not fitted");
  setText("view-camera-imei", devices.camera?.imei, "Not fitted");
  setText("view-camera-serial", devices.camera?.serialNumber, "Not fitted");
}

function renderMetrics(lookup) {
  const meters = lookup.meters || {};
  const hermesStats = lookup.hermesStats || {};
  const performance = hermesStats.performance || {};
  const ignitionText = formatBooleanState(hermesStats.ignition, "On", "Off", "");
  const movementText = formatBooleanState(hermesStats.movement, "Moving", "Stopped", "");

  setText("view-odometer", formatMetric(meters.odometer));
  setText("view-engine-hours", formatMetric(meters.engineHours));
  setText("view-speed", formatMetric(performance.speed));
  setText("view-rpm", formatMetric(performance.rpm));
  setText("view-oil-temp", formatMetric(performance.oilTemperature));
  setText("view-oil-pressure", formatMetric(performance.oilPressure));
  setText("view-location", hermesStats.location, "");
  setText("view-ignition-status", ignitionText || safeText(hermesStats.ignition, ""), "");

  const gps = hermesStats.gps || {};
  const lat = gps.latitude;
  const lng = gps.longitude;
  setText("view-latitude", lat != null ? String(lat) : "N/A");
  setText("view-longitude", lng != null ? String(lng) : "N/A");
  setText("view-gps-time", formatDisplayDate(hermesStats.lastGpsAt) || "N/A");

  const mapIframe = getNode("view-map-iframe");
  if (mapIframe && lat != null && lng != null) {
    const offset = 0.01;
    const bbox = `${lng - offset}%2C${lat - offset}%2C${lng + offset}%2C${lat + offset}`;
    mapIframe.src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
  }
}

function renderPerformanceDetails(lookup) {
  if (!el.performanceDynamicGrid) return;

  const performance = lookup.hermesStats?.performance || {};
  const movementText = formatBooleanState(
    lookup.hermesStats?.movement,
    "Moving",
    "Stopped",
    "N/A",
  );
  const cards = [
    { label: "Movement", value: movementText || "N/A" },
    { label: "Engine Load", value: formatMetric(performance.engineLoad, "%") || "N/A" },
    { label: "Gear", value: formatMetric(performance.gear) || "N/A" },
    { label: "Fuel Level", value: formatMetric(performance.fuelLevel, "%") || "N/A" },
    {
      label: "Fuel Consumption",
      value: formatMetric(performance.fuelConsumption, " L/100km") || "N/A",
    },
    {
      label: "Last GPS Time",
      value: formatDisplayDate(lookup.hermesStats?.lastGpsAt),
    },
  ];

  el.performanceDynamicGrid.innerHTML = cards
    .map(
      (card) => `
        <div class="metric-item">
          <span>${card.label}</span>
          <strong>${safeText(card.value, "N/A")}</strong>
        </div>
      `,
    )
    .join("");
}

function resolveGpioSignal(gpio, nouns) {
  if (!gpio || typeof gpio !== "object") return { value: null, at: null };

  const nounSet = new Set(nouns.map((n) => n.toLowerCase()));

  for (const entry of Object.values(gpio)) {
    if (!entry || typeof entry !== "object") continue;

    const entryNoun = String(entry.noun || "").toLowerCase();
    if (!nounSet.has(entryNoun)) continue;

    const verb = entry.custom_verb || entry.verb || null;
    const at = entry.eventat || entry.eventAt || null;

    return { value: verb, at };
  }

  return { value: null, at: null };
}

function renderGpioSignal(valueId, timeId, signal) {
  const displayValue = signal.value
    ? String(signal.value).charAt(0).toUpperCase() + String(signal.value).slice(1)
    : "N/A No Data";
  setText(valueId, displayValue);
  setText(timeId, signal.at ? formatDisplayDate(signal.at) : "N/A No Data");
}

function renderGpio(lookup) {
  const gpio = lookup.hermesStats?.gpio || {};

  renderGpioSignal("gpio-seatbelt", "gpio-seatbelt-at", resolveGpioSignal(gpio, ["seatbelt"]));
  renderGpioSignal("gpio-door", "gpio-door-at", resolveGpioSignal(gpio, ["door"]));
  renderGpioSignal("gpio-parkbrake", "gpio-parkbrake-at", resolveGpioSignal(gpio, ["parkbrake"]));
  renderGpioSignal("gpio-driverevent", "gpio-driverevent-at", resolveGpioSignal(gpio, ["driverevent"]));
  renderGpioSignal("gpio-siren", "gpio-siren-at", resolveGpioSignal(gpio, ["siren"]));
  renderGpioSignal("gpio-led", "gpio-led-at", resolveGpioSignal(gpio, ["led"]));
}

function renderStorage(lookup) {
  const cameraStats = lookup.cameraStats || {};

  setText("view-sd-overall", cameraStats.overallStatus, "");
  setText("view-sd1", cameraStats.sdCard1?.present ? "Present" : "Not present", "");
  setText("view-sd1-size", cameraStats.sdCard1?.totalSizeDisplay, "");
  setText("view-sd2", cameraStats.sdCard2?.present ? "Present" : "Not present", "");
  setText("view-sd2-size", cameraStats.sdCard2?.totalSizeDisplay, "");
}

function renderSnapshots(lookup) {
  const slots = lookup.cameraSnapshot?.slots || {};

  setImage("img-road-facing", "img-road-facing-empty", slots.roadFacing);
  setImage("img-driver-facing", "img-driver-facing-empty", slots.driverFacing);
  setImage("img-in-cab", "img-in-cab-empty", slots.inCabDriverFacingCamera);
  setImage("img-driver-external", "img-driver-external-empty", slots.driverExternal);
  setImage("img-left-external", "img-left-external-empty", slots.leftExternal);
}

function renderResolvedAsset() {
  if (!state.activeAssetLookup) return;

  renderHero(state.activeAssetLookup);
  renderVehicleDetails(state.activeAssetLookup);
  renderMetrics(state.activeAssetLookup);
  renderPerformanceDetails(state.activeAssetLookup);
  renderGpio(state.activeAssetLookup);
  renderStorage(state.activeAssetLookup);
  renderSnapshots(state.activeAssetLookup);

  setVisible(el.assetShell, true, "block");
  renderDebug();
}

function resetHero() {
  setText("hero-current-asset", "No asset loaded");
  setText("hero-request-time", "--");
  setText("hero-lookup-status", "Awaiting search");
  setText("hero-fleet-number", "--");
  setText("hero-vehicle-id", "--");
  setText("hero-render-time", "--");
}

function resetRenderedAsset() {
  resetHero();

  [
    "view-asset-number",
    "view-registration",
    "view-vin",
    "view-make",
    "view-model",
    "view-system-id",
    "view-year",
    "view-driver",
    "view-tracker-imei",
    "view-tracker-serial",
    "view-tablet-imei",
    "view-tablet-serial",
    "view-camera-imei",
    "view-camera-serial",
    "view-odometer",
    "view-engine-hours",
    "view-speed",
    "view-rpm",
    "view-oil-temp",
    "view-oil-pressure",
    "view-location",
    "view-latitude",
    "view-longitude",
    "view-gps-time",
    "view-ignition-status",
    "view-sd-overall",
    "view-sd1",
    "view-sd1-size",
    "view-sd2",
    "view-sd2-size",
    "gpio-seatbelt",
    "gpio-door",
    "gpio-parkbrake",
    "gpio-driverevent",
    "gpio-siren",
    "gpio-led",
  ].forEach((id) => setText(id, ""));

  [
    "gpio-seatbelt-at",
    "gpio-door-at",
    "gpio-parkbrake-at",
    "gpio-driverevent-at",
    "gpio-siren-at",
    "gpio-led-at",
  ].forEach((id) => setText(id, "N/A No Data"));

  if (el.performanceDynamicGrid) {
    el.performanceDynamicGrid.innerHTML = "";
  }


  setImage("img-road-facing", "img-road-facing-empty", null);
  setImage("img-driver-facing", "img-driver-facing-empty", null);
  setImage("img-in-cab", "img-in-cab-empty", null);
  setImage("img-driver-external", "img-driver-external-empty", null);
  setImage("img-left-external", "img-left-external-empty", null);

  setVisible(el.assetShell, true, "block");
}

function resetActiveAssetLookup() {
  state.activeAssetLookup = null;
  resetRenderedAsset();
}

function setVpmTabButtonState(button, active) {
  if (!button) return;
  button.classList.toggle("action-btn", active);
  button.classList.toggle("secondary-btn", !active);
}

function showVpmPanel(mode) {
  state.activeVpmMode = mode;
  setVisible(el.vpmUserInputPanel, mode === "user-input", "block");
  setVpmTabButtonState(el.vpmUserInputTab, mode === "user-input");
  setVpmTabButtonState(el.vpmFleetEvaluationTab, mode === "fleet");
}

function renderVpmResults() {
  const { columns, rows, summary } = state.vpmResults;

  if (el.vpmSummary) {
    el.vpmSummary.textContent = summary;
  }

  if (el.vpmResultsHead) {
    el.vpmResultsHead.innerHTML = columns.length
      ? `<tr>${columns.map((column) => `<th>${column}</th>`).join("")}</tr>`
      : "";
  }

  if (el.vpmResultsBody) {
    el.vpmResultsBody.innerHTML = rows
      .map(
        (row) => `
          <tr>${columns.map((column) => `<td>${safeText(row[column], "")}</td>`).join("")}</tr>
        `,
      )
      .join("");
  }
}

function buildVpmBaseRecord() {
  const lookup = state.activeAssetLookup;
  const performance = lookup?.hermesStats?.performance || {};

  return {
    "Fleet Number": lookup?.vehicle?.assetNumber || "",
    Registration: lookup?.vehicle?.registration || "",
    "Vehicle ID": lookup?.vehicle?.vehicleId || "",
    Driver: lookup?.hermesStats?.driverName || "",
    "Tracker IMEI": lookup?.devices?.trackingSystem?.imei || "",
    Ignition: formatBooleanState(lookup?.hermesStats?.ignition, "On", "Off", "Unknown"),
    Movement: formatBooleanState(lookup?.hermesStats?.movement, "Moving", "Stopped", "Unknown"),
    Speed: formatMetric(performance.speed, " km/h") || "",
    RPM: formatMetric(performance.rpm) || "",
    "Fuel Level": formatMetric(performance.fuelLevel, "%") || "",
    "Fuel Consumption": formatMetric(performance.fuelConsumption, " L/100km") || "",
    "Snapshot Time": formatDisplayDate(lookup?.cameraSnapshot?.snapshotTime),
  };
}

function parseUniqueImeis(rawValue) {
  return [...new Set(
    safeText(rawValue)
      .split(/[\n,;\t ]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  )].slice(0, 2000);
}

const VPM_BATCH_SIZE = 30;

function mapVpmRows(response) {
  const vpmColumns = Array.isArray(response.columns) ? response.columns : [];
  const rows = Array.isArray(response.rows) ? response.rows.map((row) => {
    const mapped = {
      "Fleet Number": row.fleetNumber || "N/D",
      Registration: row.registration || "N/D",
      Make: row.make || "N/D",
      Model: row.model || "N/D",
      "Year of Manufacture": String(row.yearOfManufacture || "N/D"),
      "Vehicle ID": String(row.vehicleId || "N/D"),
      IMEI: row.hermesImei || "N/D",
      Status: row.status || "N/D",
    };
    for (const key of vpmColumns) {
      mapped[key] = row.vpm && row.vpm[key] != null && row.vpm[key] !== "" ? String(row.vpm[key]) : "N/D";
    }
    return mapped;
  }) : [];
  return { vpmColumns, rows };
}

function setVpmRunning(isRunning, progressText) {
  if (el.runVpmButton) {
    el.runVpmButton.disabled = isRunning;
    el.runVpmButton.textContent = isRunning ? (progressText || "Running...") : "Run";
  }
  if (el.vpmExportButton) el.vpmExportButton.disabled = isRunning;
  setVisible(el.cancelVpmButton, isRunning);
}

function updateVpmProgress(processed, total) {
  if (el.runVpmButton) {
    el.runVpmButton.textContent = `Running... (${processed}/${total})`;
  }
  if (el.vpmSummary) {
    el.vpmSummary.textContent = `Processing ${processed} of ${total} devices...`;
  }
}

async function runVpmAnalysis(mode) {
  const token = Date.now();
  state.vpmRunToken = token;
  setVpmRunning(true, "Starting...");

  try {
    let imeis;

    if (mode === "user-input") {
      imeis = parseUniqueImeis(el.vpmImeiInput?.value);
      if (!imeis.length) {
        state.vpmResults = { mode, columns: [], rows: [], summary: "Enter at least one IMEI before running." };
        renderVpmResults();
        return;
      }
    } else {
      writeDebug("Fleet evaluation", "Fetching HERMES device list...");
      setVpmRunning(true, "Fetching fleet...");
      const fleetData = await apiGet("/api/vpm-fleet-imeis", "Failed to fetch fleet IMEI list.");
      imeis = Array.isArray(fleetData.imeis) ? fleetData.imeis : [];
      writeDebug("Fleet IMEI list loaded", `${imeis.length} HERMES devices found.`);
      if (!imeis.length) {
        state.vpmResults = { mode, columns: [], rows: [], summary: "No HERMES devices found in fleet." };
        renderVpmResults();
        return;
      }
    }

    const totalImeis = imeis.length;
    const totalBatches = Math.ceil(totalImeis / VPM_BATCH_SIZE);
    const allRows = [];
    const allVpmColumns = new Set();
    const baseColumns = ["Fleet Number", "Registration", "Make", "Model", "Year of Manufacture", "Vehicle ID", "IMEI", "Status"];

    writeDebug("VPM analysis started", `${totalImeis} IMEIs, ${totalBatches} batches of ${VPM_BATCH_SIZE}.`);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      if (state.vpmRunToken !== token) return;

      const start = batchIndex * VPM_BATCH_SIZE;
      const batchImeis = imeis.slice(start, start + VPM_BATCH_SIZE);
      const processed = start + batchImeis.length;

      updateVpmProgress(processed, totalImeis);
      writeDebug(`Batch ${batchIndex + 1}/${totalBatches}`, `Sending ${batchImeis.length} IMEIs (${start + 1}-${processed})...`);

      try {
        const response = await apiPost("/api/vpm-user-input", { imeis: batchImeis }, "Batch failed.");
        const { vpmColumns, rows } = mapVpmRows(response);

        vpmColumns.forEach((col) => allVpmColumns.add(col));
        allRows.push(...rows);

        writeDebug(`Batch ${batchIndex + 1} complete`, `${rows.length} results. ${allRows.length}/${totalImeis} total.`);
      } catch (error) {
        writeDebug(`Batch ${batchIndex + 1} failed`, error.message || "Unknown error");
        batchImeis.forEach((imei) => {
          allRows.push({
            "Fleet Number": "N/D", Registration: "N/D", Make: "N/D", Model: "N/D",
            "Year of Manufacture": "N/D", "Vehicle ID": "N/D", IMEI: imei, Status: "Batch Failed",
          });
        });
      }

      const sortedVpmColumns = [...allVpmColumns].sort((a, b) => a.localeCompare(b));
      state.vpmResults = {
        mode,
        columns: [...baseColumns, ...sortedVpmColumns],
        rows: allRows,
        summary: `${allRows.length} of ${totalImeis} processed...`,
      };
      renderVpmResults();
    }

    if (state.vpmRunToken !== token) return;

    const sortedVpmColumns = [...allVpmColumns].sort((a, b) => a.localeCompare(b));
    state.vpmResults = {
      mode,
      columns: [...baseColumns, ...sortedVpmColumns],
      rows: allRows,
      summary: `${allRows.length} queried, ${allRows.filter((r) => r.Status === "Matched").length} matched, ${sortedVpmColumns.length} VPM fields.`,
    };
    renderVpmResults();
    writeDebug("VPM analysis completed", { mode, total: allRows.length, matched: allRows.filter((r) => r.Status === "Matched").length });
  } catch (error) {
    if (state.vpmRunToken !== token) return;
    state.vpmResults = { mode, columns: [], rows: [], summary: `VPM analysis failed: ${error.message || "Unknown error"}` };
    renderVpmResults();
    writeDebug("VPM analysis failed", { mode, error: error.message });
  } finally {
    if (state.vpmRunToken === token) {
      setVpmRunning(false);
    }
  }
}

function cancelVpmAnalysis(mode) {
  state.vpmRunToken = 0;
  setVpmRunning(false);
  if (el.vpmSummary) {
    el.vpmSummary.textContent = "VPM analysis cancelled.";
  }
  writeDebug("VPM analysis cancelled", { mode });
}

function csvEscape(value) {
  const text = safeText(value, "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function downloadVpmCsv() {
  const { columns, rows } = state.vpmResults;

  if (!columns.length || !rows.length) {
    showAssetSearchMessage("Run a VPM analysis before exporting data.");
    return;
  }

  const csv = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `tge-vpm-${state.vpmResults.mode || "results"}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

const assetTrackColumns = [
  "Fleet Number",
  "Vehicle System ID",
  "Make",
  "Model",
  "Year Manufacture",
  "Odometer",
  "Shutdown Odo",
  "Ignition",
  "Movement",
  "Battery Status",
  "Battery Status At",
  "IMEI",
  "Status",
];

function showAssetTrackMessage(message = "", isError = true) {
  if (!el.assetTrackMessage) return;
  el.assetTrackMessage.textContent = message;
  el.assetTrackMessage.style.color = isError ? "" : "#0d5f3a";
}

function setAssetTrackModeButtonState(button, active) {
  if (!button) return;
  button.classList.toggle("action-btn", active);
  button.classList.toggle("secondary-btn", !active);
}

function assetTrackRowKey(row) {
  return `${safeText(row.IMEI)}::${safeText(row["Vehicle System ID"])}::${safeText(row.Status)}`;
}

function assetTrackSelectionSet() {
  return new Set(state.assetTrack.selectedKeys || []);
}

function formatAssetTrackRows(rows) {
  return rows.map((row) => ({
    "Fleet Number": safeText(row.fleetNumber, ""),
    "Vehicle System ID": safeText(row.vehicleSystemId, ""),
    Make: safeText(row.make, ""),
    Model: safeText(row.model, ""),
    "Year Manufacture": safeText(row.yearManufacture, ""),
    Odometer: safeText(row.odometer, ""),
    "Shutdown Odo": safeText(row.shutdownOdo, ""),
    Ignition: safeText(row.ignition, ""),
    Movement: safeText(row.movement, ""),
    "Battery Status": safeText(row.batteryStatus, ""),
    "Battery Status At": safeText(row.batteryStatusAt ? formatDisplayDate(row.batteryStatusAt) : "", ""),
    IMEI: safeText(row.imei, ""),
    Status: safeText(row.status, ""),
  }));
}

function applyAssetTrackFilters() {
  const filters = state.assetTrack.filters || {};
  state.assetTrack.filteredRows = state.assetTrack.rows.filter((row) =>
    assetTrackColumns.every((column) => {
      const filterValue = safeText(filters[column], "").trim().toLowerCase();
      if (!filterValue) return true;
      return safeText(row[column], "").toLowerCase().includes(filterValue);
    }),
  );
}

function renderAssetTrackResults() {
  applyAssetTrackFilters();

  const filteredRows = state.assetTrack.filteredRows;
  const selected = assetTrackSelectionSet();

  if (el.assetTrackSummary) {
    const selectedVisibleCount = filteredRows.filter((row) => selected.has(assetTrackRowKey(row))).length;
    el.assetTrackSummary.textContent = filteredRows.length
      ? `${filteredRows.length} rows visible, ${selectedVisibleCount} selected.`
      : state.assetTrack.summary;
  }

  if (el.assetTrackResultsHead) {
    const headerRow = `
      <tr>
        <th class="asset-track-select-cell">
          <input id="asset-track-select-all" type="checkbox" aria-label="Select all visible rows" />
        </th>
        ${assetTrackColumns.map((column) => `<th>${column}</th>`).join("")}
      </tr>
    `;

    const filterRow = `
      <tr>
        <th class="asset-track-select-cell"></th>
        ${assetTrackColumns
          .map(
            (column) => `
              <th>
                <input
                  class="asset-track-filter-input"
                  data-asset-track-filter="${column}"
                  type="text"
                  placeholder="Filter"
                  value="${safeText(state.assetTrack.filters?.[column], "")}"
                />
              </th>
            `,
          )
          .join("")}
      </tr>
    `;

    el.assetTrackResultsHead.innerHTML = headerRow + filterRow;
  }

  if (el.assetTrackResultsBody) {
    el.assetTrackResultsBody.innerHTML = filteredRows.length
      ? filteredRows
          .map((row) => {
            const rowKey = assetTrackRowKey(row);
            return `
              <tr>
                <td class="asset-track-select-cell">
                  <input class="asset-track-row-select" data-row-key="${rowKey}" type="checkbox" ${selected.has(rowKey) ? "checked" : ""} />
                </td>
                ${assetTrackColumns.map((column) => `<td>${safeText(row[column], "")}</td>`).join("")}
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="${assetTrackColumns.length + 1}">No rows match the current filters.</td></tr>`;
  }

  const selectAll = getNode("asset-track-select-all");
  if (selectAll) {
    const selectableRows = filteredRows.map((row) => assetTrackRowKey(row));
    selectAll.checked = Boolean(selectableRows.length) && selectableRows.every((key) => selected.has(key));
    selectAll.indeterminate = selectableRows.some((key) => selected.has(key)) && !selectAll.checked;
  }

  setVisible(el.assetTrackResultsView, state.assetTrack.rows.length > 0, "block");
}

function focusAssetTrackResults() {
  if (!el.assetTrackResultsView || !state.assetTrack.rows.length) return;
  requestAnimationFrame(() => {
    el.assetTrackResultsView.scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
    });
  });
}

function setAssetTrackMode(mode) {
  state.assetTrack.mode = mode;
  setVisible(el.assetTrackUserPanel, mode === "user", "block");
  setVisible(el.assetTrackFleetPanel, mode === "fleet", "block");
  setAssetTrackModeButtonState(el.assetTrackUserTab, mode === "user");
  setAssetTrackModeButtonState(el.assetTrackFleetTab, mode === "fleet");
  refreshAssetTrackRunButton();
}

function refreshAssetTrackRunButton() {
  if (!el.assetTrackRunButton) return;

  const imeiCount = parseUniqueImeis(el.assetTrackImeiInput?.value).length;
  const visible = state.assetTrack.mode === "fleet" || imeiCount > 0;

  setVisible(el.assetTrackRunButton, visible, "inline-flex");
  el.assetTrackRunButton.disabled = state.assetTrack.isRunning;
  el.assetTrackRunButton.textContent = state.assetTrack.isRunning ? "Running..." : "Run";
}

function resetAssetTrackState() {
  state.assetTrack.rows = [];
  state.assetTrack.filteredRows = [];
  state.assetTrack.filters = {};
  state.assetTrack.selectedKeys = [];
  state.assetTrack.summary = "No Asset Track analysis has been run yet.";
  state.assetTrack.isRunning = false;
}

function resetAssetTrackView() {
  resetAssetTrackState();
  if (el.assetTrackImeiInput) el.assetTrackImeiInput.value = "";
  if (el.assetTrackImeiHelper) {
    el.assetTrackImeiHelper.textContent = isAdminUser()
      ? "Admin users can enter up to 2000 IMEIs per run."
      : "Enter up to 20 IMEIs per run.";
  }
  showAssetTrackMessage("");
  setAssetTrackMode("user");
  if (el.assetTrackResultsHead) el.assetTrackResultsHead.innerHTML = "";
  if (el.assetTrackResultsBody) el.assetTrackResultsBody.innerHTML = "";
  if (el.assetTrackSummary) el.assetTrackSummary.textContent = state.assetTrack.summary;
  setVisible(el.assetTrackResultsView, false);
}

function getSelectedAssetTrackRows() {
  const selected = assetTrackSelectionSet();
  return state.assetTrack.filteredRows.filter((row) => selected.has(assetTrackRowKey(row)));
}

function assetTrackRowsToCsv(rows) {
  return [
    assetTrackColumns.join(","),
    ...rows.map((row) => assetTrackColumns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n");
}

function downloadAssetTrackCsv(rows, filenameBase) {
  const csv = assetTrackRowsToCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `${filenameBase}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function getAssetTrackExportRows() {
  const selectedRows = getSelectedAssetTrackRows();
  if (selectedRows.length) return selectedRows;
  return state.assetTrack.filteredRows.length ? state.assetTrack.filteredRows : state.assetTrack.rows;
}

async function handleAssetTrackRun() {
  const mode = state.assetTrack.mode;
  const imeis = parseUniqueImeis(el.assetTrackImeiInput?.value);
  const limit = isAdminUser() ? 2000 : 20;

  if (mode === "user") {
    if (!imeis.length) {
      showAssetTrackMessage("Enter at least one IMEI before running.");
      return;
    }

    if (imeis.length > limit) {
      showAssetTrackMessage(`This user can run up to ${limit} IMEIs at a time.`);
      return;
    }
  }

  try {
    state.assetTrack.isRunning = true;
    refreshAssetTrackRunButton();
    showAssetTrackMessage("Running Asset Track lookup...", false);
    state.assetTrack.summary = "Processing Asset Track data...";
    renderAssetTrackResults();

    const response = mode === "fleet"
      ? await apiGet("/api/asset-track-fleet", "Fleet Asset Track lookup failed.")
      : await apiPost("/api/asset-track-user", { imeis }, "Asset Track lookup failed.");

    const rows = formatAssetTrackRows(Array.isArray(response.rows) ? response.rows : []);
    state.assetTrack.rows = rows;
    state.assetTrack.filteredRows = rows;
    state.assetTrack.filters = {};
    state.assetTrack.selectedKeys = [];
    state.assetTrack.summary = response.summary || `${rows.length} rows returned.`;
    showAssetTrackMessage(`${rows.length} Asset Track row${rows.length === 1 ? "" : "s"} ready for review.`, false);
    renderAssetTrackResults();
    focusAssetTrackResults();
    writeDebug("Asset Track completed", { mode, rows: rows.length });
  } catch (error) {
    resetAssetTrackState();
    renderAssetTrackResults();
    showAssetTrackMessage(error.message || "Asset Track lookup failed.");
    writeDebug("Asset Track failed", { mode, error: error.message });
  } finally {
    state.assetTrack.isRunning = false;
    refreshAssetTrackRunButton();
  }
}

async function handleAssetTrackExportPdf() {
  const rows = getAssetTrackExportRows();
  if (!rows.length) {
    showAssetTrackMessage("Run Asset Track and keep at least one visible row before exporting the PDF.");
    return;
  }

  if (typeof jspdf === "undefined") {
    showAssetTrackMessage("PDF libraries are still loading. Please try again.");
    return;
  }

  const { jsPDF } = jspdf;
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margins = { left: 18, right: 18, top: 24, bottom: 18 };
  const columns = assetTrackColumns;
  const relativeWidths = [0.12, 0.09, 0.08, 0.09, 0.07, 0.07, 0.07, 0.06, 0.07, 0.08, 0.1, 0.11, 0.09];
  const usableWidth = pageWidth - margins.left - margins.right;
  const usableHeight = pageHeight - margins.top - margins.bottom;
  const columnWidths = relativeWidths.map((value) => value * usableWidth);
  const headerFontSize = 8;
  const bodyFontSize = 7;
  const lineHeight = 11;
  const rowPadding = 5;

  const wrapText = (value, width, fontSize) => {
    pdf.setFontSize(fontSize);
    const text = safeText(value, "");
    return pdf.splitTextToSize(text, Math.max(width - 6, 20));
  };

  const drawHeaderBlock = () => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text("TGE Asset Track Export", margins.left, margins.top);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(`Generated: ${formatDisplayDate(currentIsoTime())}`, margins.left, margins.top + 13);
  };

  let y = margins.top + 30;

  const drawTableHeader = () => {
    pdf.setDrawColor(180, 196, 186);
    pdf.setFillColor(245, 248, 246);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(headerFontSize);
    let x = margins.left;
    let maxHeight = 0;
    const headerLines = columns.map((column, index) => {
      const lines = wrapText(column, columnWidths[index], headerFontSize);
      maxHeight = Math.max(maxHeight, lines.length * lineHeight + rowPadding * 2);
      return lines;
    });

    columns.forEach((_, index) => {
      pdf.rect(x, y, columnWidths[index], maxHeight, "FD");
      pdf.text(headerLines[index], x + 3, y + rowPadding + lineHeight - 2);
      x += columnWidths[index];
    });

    y += maxHeight;
  };

  const drawBodyRow = (row) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(bodyFontSize);
    let maxHeight = 0;
    const rowLines = columns.map((column, index) => {
      const lines = wrapText(row[column], columnWidths[index], bodyFontSize);
      maxHeight = Math.max(maxHeight, lines.length * lineHeight + rowPadding * 2);
      return lines;
    });

    if (y + maxHeight > margins.top + usableHeight) {
      pdf.addPage("a4", "landscape");
      drawHeaderBlock();
      y = margins.top + 30;
      drawTableHeader();
    }

    let x = margins.left;
    rowLines.forEach((lines, index) => {
      pdf.rect(x, y, columnWidths[index], maxHeight);
      pdf.text(lines, x + 3, y + rowPadding + lineHeight - 2);
      x += columnWidths[index];
    });

    y += maxHeight;
  };

  drawHeaderBlock();
  drawTableHeader();

  rows.forEach((row) => {
    drawBodyRow(row);
  });

  pdf.save(`tge-asset-track-${state.assetTrack.mode}.pdf`);
  showAssetTrackMessage("Asset Track PDF exported.", false);
}

function handleAssetTrackExportExcel() {
  const rows = getAssetTrackExportRows();
  if (!rows.length) {
    showAssetTrackMessage("Run Asset Track and keep at least one visible row before exporting Excel.");
    return;
  }

  downloadAssetTrackCsv(rows, `tge-asset-track-${state.assetTrack.mode}`);
  showAssetTrackMessage("Asset Track Excel export downloaded.", false);
}

async function handleAssetTrackEmailExport() {
  const rows = getAssetTrackExportRows();
  if (!rows.length) {
    showAssetTrackMessage("Run Asset Track and keep at least one visible row before preparing the email export.");
    return;
  }

  const filenameBase = `tge-asset-track-${state.assetTrack.mode}`;
  downloadAssetTrackCsv(rows, filenameBase);

  const subject = encodeURIComponent("TGE Asset Track Export");
  const body = encodeURIComponent(
    [
      `Mode: ${state.assetTrack.mode}`,
      `Rows selected: ${rows.length}`,
      "",
      `The export file ${filenameBase}.csv has been downloaded.`,
      "Attach the file to this email before sending.",
    ].join("\n"),
  );

  window.location.href = `mailto:?subject=${subject}&body=${body}`;
  showAssetTrackMessage(`CSV "${filenameBase}.csv" downloaded. Attach it to the email that just opened.`, false);
}

function parseCsvRow(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseApprovedUsersCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvRow(lines[0]).map((header) => header.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = parseCsvRow(line);
    return headers.reduce((record, header, index) => {
      record[header] = cells[index] || "";
      return record;
    }, {});
  });
}

async function handleApprovedUsersImport(file) {
  if (!file) return;

  if (!file.name.toLowerCase().endsWith(".csv")) {
    showAssetSearchMessage("Bulk import currently supports CSV files in this browser build.");
    return;
  }

  const rows = parseApprovedUsersCsv(await file.text());
  if (!rows.length) {
    showAssetSearchMessage("The selected CSV file did not contain any import rows.");
    return;
  }

  for (const row of rows) {
    await apiPost(
      "/api/approved-users",
      {
        firstName: row.firstname || row.first_name || "",
        lastName: row.lastname || row.last_name || "",
        username: row.username || "",
        role: row.role || "user",
        status: row.status || "active",
        password: row.password || "",
      },
      "Unable to import approved users.",
    );
  }

  await loadApprovedUsers();
  showAssetSearchMessage(`Imported ${rows.length} approved user${rows.length === 1 ? "" : "s"}.`, false);
  writeDebug("Approved users imported", { importedCount: rows.length });
}

async function handleAssetSearch(assetNumber) {
  const startedAt = performance.now();

  clearAssetSearchMessage();

  setText("hero-lookup-status", "Loading");
  setText("hero-fleet-number", assetNumber || "--");
  setText("hero-request-time", formatDisplayDate(currentIsoTime()));
  setText("hero-render-time", "--");

  writeDebug("Lookup started", { assetNumber });

  const vehicleLookupResponse = await apiPost(
    "/api/vehicle-lookup",
    { assetNumber },
    "Asset not found.",
  );
  const vehicle = vehicleLookupResponse.vehicle || vehicleLookupResponse;

  const [devicesResponse, metersResponse, snapshotEvents] = await Promise.all([
    apiPost("/api/vehicle-devices", { vehicleId: vehicle.id }, "Device lookup failed."),
    apiPost("/api/vehicle-meters", { vehicleId: vehicle.id }, "Meters lookup failed."),
    apiPost("/api/camera-snapshots", { vehicleId: vehicle.id }, "Camera snapshot lookup failed.").catch(() => []),
  ]);

  const devices = mapVehicleDevices(devicesResponse);
  const meters = extractVehicleMeters(metersResponse);

  const [hermesDevice, cameraDevice] = await Promise.all([
    devices.trackingSystem?.imei || devices.trackingSystem?.serialNumber
      ? apiPost(
          "/api/hermes-device-stats",
          { trackerId: devices.trackingSystem.imei || devices.trackingSystem.serialNumber },
          "HERMES device stats lookup failed.",
        )
      : Promise.resolve(null),
    devices.camera?.imei
      ? apiPost(
          "/api/camera-device-stats",
          { cameraId: devices.camera.imei },
          "Camera device stats lookup failed.",
        )
      : Promise.resolve(null),
  ]);

  const hermesStats = hermesDevice ? extractHermesStats(hermesDevice) : null;
  const cameraStats = cameraDevice ? extractCameraStats(cameraDevice) : null;
  const latestSnapshot = extractLatestSnapshot(snapshotEvents);
  const cameraSnapshot = {
    snapshotTime: latestSnapshot.snapshotTime,
    slots: mapSnapshotLinksToSlots(latestSnapshot),
  };

  const nextLookup = buildLookupSummary(
    assetNumber,
    vehicle,
    devices,
    meters,
    hermesStats,
    cameraStats,
    cameraSnapshot,
    { renderDurationMs: Math.round(performance.now() - startedAt) },
  );

  state.activeAssetLookup = nextLookup;

  writeDebug("Lookup completed", nextLookup);
  renderResolvedAsset();

  try {
    await apiPost("/api/access-history", { assetRequested: assetNumber }, "Unable to record access history.");
    if (state.currentSessionUser?.role === "admin") {
      await loadAccessHistory();
    }
  } catch (_) {}
}

function handleAssetSearchError(assetNumber, error) {
  resetActiveAssetLookup();
  setText("hero-lookup-status", "Error");
  setText("hero-fleet-number", assetNumber || "--");
  showAssetSearchMessage(error.message || "Asset not found.");
  writeDebug("Lookup failed", {
    assetNumber,
    message: error.message || "Asset not found.",
  });
}


/**
 * Converts all camera snapshot <img> elements to canvas-safe data:image/jpeg URLs.
 * Returns a restore function that puts the original src values back.
 * This is needed because:
 *  - SVG data URLs are not rendered by html2canvas
 *  - External URLs (telematics CDN) are blocked by CORS when html2canvas tries to read pixels
 * We fetch each image through the worker proxy (or directly for data URLs),
 * draw it to an offscreen canvas, and swap the src before capturing.
 */

// ── PDF IMAGE HELPERS ────────────────────────────────────────────────────────
async function fetchImageViaProxy(url) {
  try {
    const res = await fetch("/api/image-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      // Log the failure details so we can diagnose blocked domains
      try {
        const errJson = await res.json();
        console.warn("[ImageProxy] failed for", url, "status:", res.status, "detail:", errJson);
      } catch(e) {
        console.warn("[ImageProxy] failed for", url, "status:", res.status);
      }
      return null;
    }
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("[ImageProxy] fetch error for", url, e);
    return null;
  }
}

function svgDataUrlToJpeg(svgDataUrl) {
  return new Promise((resolve, reject) => {
    try {
      const base64 = svgDataUrl.split(",")[1];
      if (!base64) { resolve(null); return; }
      const svgStr = decodeURIComponent(escape(atob(base64)));
      const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      const tmp = new Image();
      tmp.onload = () => {
        const W = Math.max(tmp.naturalWidth || 0, 320);
        const H = Math.max(tmp.naturalHeight || 0, 180);
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#1a2e20";
        ctx.fillRect(0, 0, W, H);
        try { ctx.drawImage(tmp, 0, 0, W, H); } catch(e) {}
        URL.revokeObjectURL(blobUrl);
        try { resolve(canvas.toDataURL("image/jpeg", 0.88)); }
        catch(e) { resolve(null); }
      };
      tmp.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(null); };
      tmp.src = blobUrl;
    } catch(e) { reject(e); }
  });
}



async function cameraImageToDataUrl(src) {
  if (!src) return null;

  // External URL — fetch via worker proxy
  if (src.startsWith("http://") || src.startsWith("https://")) {
    return await fetchImageViaProxy(src);
  }

  // SVG data URL — rasterise via Blob URL (avoids canvas taint)
  if (src.startsWith("data:image/svg")) {
    return await svgDataUrlToJpeg(src);
  }

  // Already a raster data URL
  if (src.startsWith("data:image/jpeg") || src.startsWith("data:image/png") || src.startsWith("data:image/webp")) {
    return src;
  }

  return null;
}

async function fetchAllCameraImages() {
  const results = [];
  for (let i = 0; i < cameraSlotIds.length; i++) {
    const img = document.getElementById(cameraSlotIds[i]);
    const src = img && img.style.display !== "none" ? img.getAttribute("src") : null;
    const dataUrl = src ? await cameraImageToDataUrl(src) : null;
    results.push({ label: cameraSlotNames[i], dataUrl });
  }
  return results;
}

// Build a clean structured PDF using jsPDF directly — no html2canvas
async function buildSnapshotPdf() {
  const lookup = state.activeAssetLookup;
  if (!lookup) throw new Error("No asset loaded.");
  if (typeof jspdf === "undefined") throw new Error("PDF library not loaded.");

  const { jsPDF } = jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  const PW = 595.28, PH = 841.89;
  const ML = 36, MR = 36, MT = 36;
  const CW = PW - ML - MR;
  let y = MT;

  const GREEN = [0, 90, 45], INK = [20, 30, 24], MUTED = [90, 105, 98];
  const LINE  = [215, 226, 219], SURF = [245, 249, 246];

  function newPage() { pdf.addPage(); y = MT; }
  function checkY(n) { if (y + n > PH - 40) newPage(); }

  function sectionHeader(kicker, title) {
    checkY(44);
    pdf.setFontSize(7).setFont(undefined, "bold").setTextColor(...MUTED);
    pdf.text(kicker.toUpperCase(), ML, y);
    y += 13;
    pdf.setFontSize(11).setFont(undefined, "bold").setTextColor(...INK);
    pdf.text(title, ML, y);
    y += 10;
    pdf.setDrawColor(...LINE).setLineWidth(0.5).line(ML, y, ML + CW, y);
    y += 10;
  }

  function dataGrid(items, cols) {
    const filtered = items.filter(i => i.value != null && i.value !== "" && i.value !== "null" && i.value !== "—" || i.showEmpty);
    if (!filtered.length) return;
    const colW = CW / cols;
    const rowH = 34;
    let col = 0, rowY = y;
    for (const item of filtered) {
      if (col === 0) { checkY(rowH); rowY = y; }
      const x = ML + col * colW;
      pdf.setFontSize(7).setFont(undefined, "bold").setTextColor(...MUTED);
      pdf.text(String(item.label || "").toUpperCase(), x + 4, rowY + 11);
      pdf.setFontSize(9.5).setFont(undefined, "bold").setTextColor(...INK);
      pdf.text(String(item.value ?? "—"), x + 4, rowY + 24);
      col++;
      if (col >= cols) { col = 0; y = rowY + rowH; rowY = y; }
    }
    if (col > 0) y = rowY + rowH;
    y += 4;
  }

  // ── HEADER ──────────────────────────────────────────────────────────────
  pdf.setFillColor(...GREEN).rect(0, 0, PW, 54, "F");
  pdf.setFontSize(15).setFont(undefined, "bold").setTextColor(255, 255, 255);
  pdf.text("TGE Asset Snapshot", ML, 24);
  const vehicle = lookup.vehicle || {};
  const hdr = [vehicle.assetNumber ? "Fleet " + vehicle.assetNumber : "", vehicle.registration, vehicle.make, vehicle.model].filter(Boolean).join("  ·  ");
  pdf.setFontSize(8).setFont(undefined, "normal").setTextColor(195, 230, 208);
  pdf.text(hdr, ML, 37);
  pdf.setFontSize(7).setTextColor(155, 200, 170);
  pdf.text("Generated: " + new Date().toLocaleString("en-AU", { hour12: false }), ML, 48);
  y = 68;

  // ── VEHICLE DETAILS ──────────────────────────────────────────────────────
  sectionHeader("Vehicle Information", "Asset Details");
  dataGrid([
    { label: "Fleet Number",   value: vehicle.assetNumber },
    { label: "Registration",   value: vehicle.registration },
    { label: "VIN",            value: vehicle.vin },
    { label: "Make",           value: vehicle.make },
    { label: "Model",          value: vehicle.model },
    { label: "System ID",      value: vehicle.vehicleId },
    { label: "Year",           value: vehicle.yearOfManufacture },
  ], 4);

  const devices = lookup.devices || {};
  dataGrid([
    { label: "Tracker IMEI",   value: devices.trackingSystem?.imei || "Not fitted" },
    { label: "Tracker Serial", value: devices.trackingSystem?.serialNumber || "Not fitted" },
    { label: "Camera IMEI",    value: devices.camera?.imei || "Not fitted" },
    { label: "Camera Serial",  value: devices.camera?.serialNumber || "Not fitted" },
    { label: "Tablet IMEI",    value: devices.tablet?.imei || "Not fitted" },
    { label: "Tablet Serial",  value: devices.tablet?.serialNumber || "Not fitted" },
  ], 3);
  y += 4;

  // ── PERFORMANCE ──────────────────────────────────────────────────────────
  sectionHeader("Performance", "Vehicle Tracking Metrics");
  const meters = lookup.meters || {};
  const hStats = lookup.hermesStats || {};
  const perf   = hStats.performance || {};

  const ignText = hStats.ignition === true  || hStats.ignition === "true"  || hStats.ignition === 1 ? "On"
                : hStats.ignition === false || hStats.ignition === "false" || hStats.ignition === 0 ? "Off"
                : String(hStats.ignition ?? "—");
  const movText = hStats.movement === true ? "Moving" : hStats.movement === false ? "Stopped" : String(hStats.movement ?? "—");

  dataGrid([
    { label: "Driver",           value: hStats.driverName || "No driver", showEmpty: true },
    { label: "Engine Hours",     value: meters.engineHours },
    { label: "Ignition",         value: ignText, showEmpty: true },
    { label: "Odometer",         value: meters.odometer },
    { label: "Oil Pressure",     value: perf.oilPressure },
    { label: "Oil Temperature",  value: perf.oilTemperature },
    { label: "RPM",              value: perf.rpm },
    { label: "Speed",            value: perf.speed != null ? perf.speed + " km/h" : null },
    { label: "Movement",         value: movText, showEmpty: true },
    { label: "Engine Load",      value: perf.engineLoad != null ? perf.engineLoad + "%" : null },
    { label: "Gear",             value: perf.gear },
    { label: "Fuel Level",       value: perf.fuelLevel != null ? perf.fuelLevel + "%" : null },
    { label: "Fuel Consumption", value: perf.fuelConsumption != null ? perf.fuelConsumption + " L/100km" : null },
    { label: "Last GPS Time",    value: hStats.lastGpsAt ? formatDisplayDate(hStats.lastGpsAt) : null },
  ], 4);
  y += 4;

  // ── CAMERA SNAPSHOTS ─────────────────────────────────────────────────────
  sectionHeader("Evidence", "Camera Snapshots");
  showAssetSearchMessage("Loading camera images for PDF...", false);
  const camImages = await fetchAllCameraImages();
  const hasImages = camImages.some(c => c.dataUrl);

  if (!hasImages) {
    pdf.setFontSize(9).setFont(undefined, "normal").setTextColor(...MUTED);
    pdf.text("No camera images available for this asset.", ML, y + 12);
    y += 28;
  } else {
    const imgW = (CW - 12) / 2;
    const imgH = imgW * (9 / 16);
    let col = 0, rowY = y;
    for (const cam of camImages) {
      if (col === 0) { checkY(imgH + 24); rowY = y; }
      const x = ML + col * (imgW + 12);
      if (cam.dataUrl) {
        try {
          const fmt = cam.dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
          pdf.addImage(cam.dataUrl, fmt, x, rowY, imgW, imgH);
        } catch(e) {
          pdf.setFillColor(...SURF).rect(x, rowY, imgW, imgH, "F");
          pdf.setDrawColor(...LINE).rect(x, rowY, imgW, imgH);
          pdf.setFontSize(8).setTextColor(...MUTED).text("Image unavailable", x + imgW / 2, rowY + imgH / 2, { align: "center" });
        }
      } else {
        pdf.setFillColor(...SURF).rect(x, rowY, imgW, imgH, "F");
        pdf.setDrawColor(...LINE).setLineWidth(0.4).rect(x, rowY, imgW, imgH);
        pdf.setFontSize(8).setFont(undefined, "normal").setTextColor(...MUTED);
        pdf.text("No image", x + imgW / 2, rowY + imgH / 2, { align: "center" });
      }
      pdf.setFontSize(7).setFont(undefined, "bold").setTextColor(...MUTED);
      pdf.text(cam.label.toUpperCase(), x + 2, rowY + imgH + 10);
      col++;
      if (col >= 2) { col = 0; y = rowY + imgH + 22; }
    }
    if (col > 0) y = rowY + imgH + 22;
    y += 6;
  }

  // ── GPIO ─────────────────────────────────────────────────────────────────
  checkY(50);
  sectionHeader("GPIO Data State", "Digital Inputs & Outputs");
  const gpio = hStats.gpio || {};
  function gpioVal(nouns) {
    const nounSet = new Set(nouns.map(n => n.toLowerCase()));
    for (const entry of Object.values(gpio)) {
      if (!entry || typeof entry !== "object") continue;
      if (nounSet.has(String(entry.noun || "").toLowerCase())) {
        const v = entry.custom_verb || entry.verb || null;
        const at = entry.eventat || entry.eventAt || null;
        if (v) return v.charAt(0).toUpperCase() + v.slice(1) + (at ? "  " + formatDisplayDate(at) : "");
      }
    }
    return "N/A";
  }
  dataGrid([
    { label: "Seatbelt",     value: gpioVal(["seatbelt"]),    showEmpty: true },
    { label: "Door",         value: gpioVal(["door"]),         showEmpty: true },
    { label: "Park Brake",   value: gpioVal(["parkbrake"]),   showEmpty: true },
    { label: "Event Button", value: gpioVal(["driverevent"]), showEmpty: true },
    { label: "Siren",        value: gpioVal(["siren"]),        showEmpty: true },
    { label: "LED",          value: gpioVal(["led"]),          showEmpty: true },
  ], 3);
  y += 4;

  // ── SD CARDS ──────────────────────────────────────────────────────────────
  const camStats = lookup.cameraStats || {};
  checkY(50);
  sectionHeader("Storage Diagnostics", "SD Card Status");
  dataGrid([
    { label: "SD Card 1", value: camStats.sdCard1?.present ? "Present" + (camStats.sdCard1.totalSizeDisplay ? " — " + camStats.sdCard1.totalSizeDisplay : "") : "Not present", showEmpty: true },
    { label: "SD Card 2", value: camStats.sdCard2?.present ? "Present" + (camStats.sdCard2.totalSizeDisplay ? " — " + camStats.sdCard2.totalSizeDisplay : "") : "Not present", showEmpty: true },
  ], 2);
  y += 4;

  // ── LOCATION ──────────────────────────────────────────────────────────────
  const gps = hStats.gps || {};
  if (gps.latitude && gps.longitude) {
    checkY(80);
    sectionHeader("Location", "Last Known Position");
    dataGrid([
      { label: "Latitude",  value: String(gps.latitude),  showEmpty: true },
      { label: "Longitude", value: String(gps.longitude), showEmpty: true },
      { label: "Location",  value: hStats.location || "—", showEmpty: true },
      { label: "GPS Time",  value: hStats.lastGpsAt ? formatDisplayDate(hStats.lastGpsAt) : "—", showEmpty: true },
    ], 2);
    try {
      const lat = encodeURIComponent(gps.latitude);
      const lng = encodeURIComponent(gps.longitude);
      const mapUrl = "https://staticmap.openstreetmap.de/staticmap.php?center=" + lat + "," + lng + "&zoom=14&size=520x200&markers=" + lat + "," + lng + ",red";
      const mapData = await fetchImageViaProxy(mapUrl);
      if (mapData) {
        checkY(160);
        pdf.addImage(mapData, "PNG", ML, y, CW, 150);
        y += 158;
      }
    } catch(e) { /* map not critical */ }
    y += 4;
  }

  // ── FOOTERS ───────────────────────────────────────────────────────────────
  const pageCount = pdf.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p);
    pdf.setFontSize(7).setFont(undefined, "normal").setTextColor(...MUTED);
    pdf.text("TGE Asset Snapshot  \xB7  Page " + p + " of " + pageCount, ML, PH - 18);
    pdf.text("Fleet " + (vehicle.assetNumber || "\u2014") + "  \xB7  " + (vehicle.registration || "\u2014"), PW - MR, PH - 18, { align: "right" });
  }

  return pdf;
}
async function handleExportPdf() {
  if (!state.activeAssetLookup) {
    showAssetSearchMessage("Load an asset before exporting the PDF.");
    return;
  }
  if (typeof jspdf === "undefined") {
    showAssetSearchMessage("PDF library is still loading. Please try again.");
    return;
  }
  try {
    showAssetSearchMessage("Building PDF...", false);
    writeDebug("PDF export started", "Building structured PDF...");
    const pdf = await buildSnapshotPdf();
    const vehicleLabel = state.activeAssetLookup.vehicle?.assetNumber || "snapshot";
    pdf.save(`tge-asset-snapshot-${vehicleLabel}.pdf`);
    showAssetSearchMessage("PDF exported successfully.", false);
    writeDebug("PDF export completed", "Done.");
  } catch (error) {
    showAssetSearchMessage(error.message || "PDF export failed.");
    writeDebug("PDF export failed", error.message);
  }
}

function handleRefreshAsset() {
  state.activeAssetLookup = null;
  const assetInput = getNode("asset-number");
  if (assetInput) assetInput.value = "";
  clearAssetSearchMessage();
  resetRenderedAsset();
  setVisible(el.assetShell, false);
  writeDebug("Page refreshed", "Ready for new search.");
}

async function handleEmailPdf() {
  if (!state.activeAssetLookup) {
    showAssetSearchMessage("Load an asset before preparing the email.");
    return;
  }
  if (typeof jspdf === "undefined") {
    showAssetSearchMessage("PDF library is still loading. Please try again.");
    return;
  }
  try {
    showAssetSearchMessage("Building PDF for email...", false);
    writeDebug("Email PDF started", "Building structured PDF...");
    const pdf = await buildSnapshotPdf();
    const vehicleLabel = state.activeAssetLookup.vehicle?.assetNumber || "snapshot";
    const filename = `tge-asset-snapshot-${vehicleLabel}.pdf`;
    const pdfBlob = pdf.output("blob");
    const objectUrl = URL.createObjectURL(pdfBlob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    const vehicle = state.activeAssetLookup.vehicle || {};
    const subject = encodeURIComponent(`TGE Asset Snapshot - ${vehicle.assetNumber || "Asset"}`);
    const body = encodeURIComponent(
      [
        `Asset: ${safeText(vehicle.assetNumber, "N/A")}`,
        `Registration: ${safeText(vehicle.registration, "N/A")}`,
        `Vehicle ID: ${safeText(vehicle.vehicleId, "N/A")}`,
        `Requested At: ${formatDisplayDate(state.activeAssetLookup.requestedAt)}`,
        "",
        `Please find the attached PDF snapshot: ${filename}`,
      ].join("\n"),
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    showAssetSearchMessage(`PDF "${filename}" downloaded. Attach it to the email that just opened.`, false);
    writeDebug("Email PDF completed", `PDF downloaded as ${filename}.`);
  } catch (error) {
    showAssetSearchMessage(error.message || "Email PDF failed.");
    writeDebug("Email PDF failed", error.message);
  }
}

if (el.loginForm) {
  el.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = safeText(getNode("username")?.value).trim();
    const password = safeText(getNode("password")?.value).trim();

    try {
      const result = await apiPost(
        "/api/login",
        { username, password },
        "Access denied. Please contact Telematics.",
      );

      setText("login-message", "");
      openAppForUser(result.user);
      writeDebug("Login successful", result.user);
    } catch (error) {
      showLoginError(error.message || "Access denied. Please contact Telematics.");
      writeDebug("Login failed", { username, message: error.message });
    }
  });
}

if (el.standardTab) {
  el.standardTab.addEventListener("click", () => {
    showStandardView();
  });
}

if (el.assetTrackTab) {
  el.assetTrackTab.addEventListener("click", () => {
    showAssetTrackView();
  });
}

if (el.adminTab) {
  el.adminTab.addEventListener("click", async () => {
    if (!state.currentSessionUser || state.currentSessionUser.role !== "admin") return;

    await loadAdminData().catch((error) => {
      writeDebug("Admin reload failed", error.message);
    });
    showAdminView();
  });
}

if (el.vpmTab) {
  el.vpmTab.addEventListener("click", () => {
    if (!state.currentSessionUser || state.currentSessionUser.role !== "admin") return;
    writeDebug("VPM view opened", {
      username: state.currentSessionUser.username,
      openedAt: currentIsoTime(),
    });
    showVpmView();
  });
}

if (el.vpmUserInputTab) {
  el.vpmUserInputTab.addEventListener("click", () => {
    showVpmPanel("user-input");
  });
}

if (el.vpmFleetEvaluationTab) {
  el.vpmFleetEvaluationTab.addEventListener("click", () => {
    showVpmPanel("fleet");
  });
}

if (el.assetTrackUserTab) {
  el.assetTrackUserTab.addEventListener("click", () => {
    setAssetTrackMode("user");
  });
}

if (el.assetTrackFleetTab) {
  el.assetTrackFleetTab.addEventListener("click", () => {
    setAssetTrackMode("fleet");
  });
}

if (el.assetTrackImeiInput) {
  el.assetTrackImeiInput.addEventListener("input", refreshAssetTrackRunButton);
}

if (el.assetTrackRunButton) {
  el.assetTrackRunButton.addEventListener("click", handleAssetTrackRun);
}

if (el.assetTrackRefreshButton) {
  el.assetTrackRefreshButton.addEventListener("click", () => {
    resetAssetTrackView();
    writeDebug("Asset Track reset", { mode: state.assetTrack.mode });
  });
}

if (el.assetTrackExportPdfButton) {
  el.assetTrackExportPdfButton.addEventListener("click", handleAssetTrackExportPdf);
}

if (el.assetTrackExportExcelButton) {
  el.assetTrackExportExcelButton.addEventListener("click", handleAssetTrackExportExcel);
}

if (el.assetTrackEmailButton) {
  el.assetTrackEmailButton.addEventListener("click", handleAssetTrackEmailExport);
}

if (el.runVpmButton) {
  el.runVpmButton.addEventListener("click", () => {
    runVpmAnalysis(state.activeVpmMode);
  });
}

if (el.cancelVpmButton) {
  el.cancelVpmButton.addEventListener("click", () => {
    cancelVpmAnalysis(state.activeVpmMode);
  });
}

if (el.vpmExportButton) {
  el.vpmExportButton.addEventListener("click", downloadVpmCsv);
}

if (el.debugToggle) {
  el.debugToggle.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    setDebugWindowOpen(target.checked);
  });
}

if (el.debugCloseButton) {
  el.debugCloseButton.addEventListener("click", () => {
    setDebugWindowOpen(false);
  });
}

if (el.debugWindowHandle && el.debugWindow) {
  el.debugWindowHandle.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("#debug-close-btn")) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = el.debugWindow.offsetLeft;
    const startTop = el.debugWindow.offsetTop;

    const move = (moveEvent) => {
      const nextLeft = Math.max(8, startLeft + moveEvent.clientX - startX);
      const nextTop = Math.max(8, startTop + moveEvent.clientY - startY);
      el.debugWindow.style.left = `${nextLeft}px`;
      el.debugWindow.style.top = `${nextTop}px`;
    };

    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  });
}

if (el.approvedUserForm) {
  el.approvedUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.currentSessionUser || state.currentSessionUser.role !== "admin") return;

    const passwordValue = safeText(el.approvedPassword?.value || "").trim();
    const formValues = {
      firstName: safeText(getNode("approved-first-name")?.value).trim(),
      lastName: safeText(getNode("approved-last-name")?.value).trim(),
      username: safeText(getNode("approved-username")?.value).trim(),
      role: safeText(getNode("approved-role")?.value).trim(),
      status: safeText(getNode("approved-status")?.value).trim(),
    };
    if (passwordValue) {
      formValues.password = passwordValue;
    }

    try {
      await apiPost("/api/approved-users", formValues, "Unable to save approved user.");
      await loadApprovedUsers();
      resetApprovedUserForm();
      writeDebug("Approved users updated", state.approvedUsers);
    } catch (error) {
      showAssetSearchMessage(error.message || "Unable to save approved user.");
    }
  });
}

if (el.importUsersButton && el.importUsersFile) {
  el.importUsersButton.addEventListener("click", () => {
    el.importUsersFile.click();
  });

  el.importUsersFile.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const [file] = target.files || [];

    try {
      await handleApprovedUsersImport(file);
    } catch (error) {
      showAssetSearchMessage(error.message || "Unable to import approved users.");
      writeDebug("Approved users import failed", error.message);
    } finally {
      target.value = "";
    }
  });
}

if (el.approvedUsersTableBody) {
  el.approvedUsersTableBody.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const action = target.getAttribute("data-action");
    const username = target.getAttribute("data-username");

    if (!action || !username) return;
    if (!state.currentSessionUser || state.currentSessionUser.role !== "admin") return;

    const user = state.approvedUsers.find(
      (item) => item.username.toLowerCase() === username.toLowerCase(),
    );

    if (action === "edit" && user) {
      fillApprovedUserForm(user);
      return;
    }

    if (action === "deactivate") {
      try {
        await apiPost(
          "/api/approved-users/deactivate",
          { username },
          "Unable to deactivate approved user.",
        );
        await loadApprovedUsers();
        writeDebug("Approved user deactivated", { username });
      } catch (error) {
        showAssetSearchMessage(error.message || "Unable to deactivate approved user.");
      }
    }
  });
}

if (el.historyUserFilter) {
  el.historyUserFilter.addEventListener("change", () => {
    renderHistoryTable();
  });
}

if (el.assetTrackResultsHead) {
  el.assetTrackResultsHead.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const filterColumn = target.getAttribute("data-asset-track-filter");
    if (!filterColumn) return;

    state.assetTrack.filters[filterColumn] = target.value;
    renderAssetTrackResults();
  });

  el.assetTrackResultsHead.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id !== "asset-track-select-all") return;

    const selected = assetTrackSelectionSet();
    state.assetTrack.filteredRows.forEach((row) => {
      const key = assetTrackRowKey(row);
      if (target.checked) {
        selected.add(key);
      } else {
        selected.delete(key);
      }
    });
    state.assetTrack.selectedKeys = [...selected];
    renderAssetTrackResults();
  });
}

if (el.assetTrackResultsBody) {
  el.assetTrackResultsBody.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains("asset-track-row-select")) return;

    const rowKey = target.getAttribute("data-row-key");
    if (!rowKey) return;

    const selected = assetTrackSelectionSet();
    if (target.checked) {
      selected.add(rowKey);
    } else {
      selected.delete(rowKey);
    }
    state.assetTrack.selectedKeys = [...selected];
    renderAssetTrackResults();
  });
}

if (el.assetSearchForm) {
  el.assetSearchForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const assetNumber = safeText(getNode("asset-number")?.value).trim();
    writeDebug("Asset search submitted", { assetNumber });

    try {
      await handleAssetSearch(assetNumber);
      showAssetSearchMessage("", false);
    } catch (error) {
      handleAssetSearchError(assetNumber, error);
    }
  });
}

if (el.exportPdfButton) {
  el.exportPdfButton.addEventListener("click", handleExportPdf);
}

if (el.refreshAssetButton) {
  el.refreshAssetButton.addEventListener("click", handleRefreshAsset);
}

if (el.emailPdfButton) {
  el.emailPdfButton.addEventListener("click", handleEmailPdf);
}

if (el.logoutButton) {
  el.logoutButton.addEventListener("click", async () => {
    try {
      await apiPost("/api/logout", {}, "Logout failed.");
    } catch (_) {}
    state.currentSessionUser = null;
    state.activeAssetLookup = null;
    state.approvedUsers = [];
    state.accessHistory = [];
    state.vpmResults = { mode: null, columns: [], rows: [], summary: "No VPM analysis has been run yet." };
    initialiseUi();
    setVisible(el.loginScreen, true, "grid");
    writeDebug("Logged out", {});
  });
}

const cameraSlotNames = ["Road Facing", "Driver Facing", "In-Cab Driver", "Driver External", "Left External"];
const cameraSlotIds = ["img-road-facing", "img-driver-facing", "img-in-cab", "img-driver-external", "img-left-external"];
let lightboxIndex = 0;

function getLightboxImages() {
  return cameraSlotIds
    .map((id, index) => {
      const img = getNode(id);
      return img && img.src && img.style.display !== "none" ? { src: img.src, label: cameraSlotNames[index], index } : null;
    })
    .filter(Boolean);
}

function openLightbox(startIndex) {
  const images = getLightboxImages();
  if (!images.length) return;

  const match = images.findIndex((item) => item.index === startIndex);
  lightboxIndex = match >= 0 ? match : 0;

  const overlay = getNode("lightbox-overlay");
  if (overlay) overlay.style.display = "grid";
  renderLightbox();
}

function renderLightbox() {
  const images = getLightboxImages();
  if (!images.length) return;

  if (lightboxIndex < 0) lightboxIndex = images.length - 1;
  if (lightboxIndex >= images.length) lightboxIndex = 0;

  const current = images[lightboxIndex];
  const img = getNode("lightbox-img");
  const caption = getNode("lightbox-caption");
  if (img) img.src = current.src;
  if (caption) caption.textContent = `${current.label} (${lightboxIndex + 1} of ${images.length})`;
}

function closeLightbox() {
  const overlay = getNode("lightbox-overlay");
  if (overlay) overlay.style.display = "none";
}

document.querySelectorAll(".camera-card").forEach((card) => {
  card.addEventListener("click", () => {
    const slot = parseInt(card.getAttribute("data-camera-slot") || "0", 10);
    openLightbox(slot);
  });
});

const lightboxClose = getNode("lightbox-close");
if (lightboxClose) lightboxClose.addEventListener("click", closeLightbox);

const lightboxOverlay = getNode("lightbox-overlay");
if (lightboxOverlay) lightboxOverlay.addEventListener("click", (e) => {
  if (e.target === lightboxOverlay) closeLightbox();
});

const lightboxPrev = getNode("lightbox-prev");
if (lightboxPrev) lightboxPrev.addEventListener("click", (e) => {
  e.stopPropagation();
  lightboxIndex--;
  renderLightbox();
});

const lightboxNext = getNode("lightbox-next");
if (lightboxNext) lightboxNext.addEventListener("click", (e) => {
  e.stopPropagation();
  lightboxIndex++;
  renderLightbox();
});

document.addEventListener("keydown", (e) => {
  const overlay = getNode("lightbox-overlay");
  if (!overlay || overlay.style.display === "none") return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") { lightboxIndex--; renderLightbox(); }
  if (e.key === "ArrowRight") { lightboxIndex++; renderLightbox(); }
});

initialiseUi();
loadSession();
