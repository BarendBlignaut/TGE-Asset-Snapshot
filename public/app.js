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
  standardView: document.getElementById("standard-view"),
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

  if (!image || !empty) return;

  if (url) {
    image.src = url;
    image.style.display = "block";
    empty.style.display = "none";
    return;
  }

  image.removeAttribute("src");
  image.style.display = "none";
  empty.style.display = "block";
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
  setVisible(el.adminView, false);
  setVisible(el.vpmView, false);
}

function showAdminView() {
  setVisible(el.heroSection, false);
  setVisible(el.standardView, false);
  setVisible(el.adminView, true, "block");
  setVisible(el.vpmView, false);
}

function showVpmView() {
  setVisible(el.heroSection, false);
  setVisible(el.standardView, false);
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
  setDebugWindowOpen(false);
  setText("login-message", "");
  resetActiveAssetLookup();
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
  showStandardView();
}

function initialiseUi() {
  setVisible(el.appShell, false);
  setVisible(el.headerActions, false);
  setVisible(el.adminTab, false);
  setVisible(el.vpmTab, false);
  setVisible(el.debugToggleWrap, false);
  setDebugWindowOpen(false);
  showStandardView();
  showVpmPanel("user-input");
  renderVpmResults();
  resetRenderedAsset();
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
    performance: lastVpm
      ? {
          speed: lastVpm.speed ?? null,
          rpm: lastVpm.rpm ?? null,
          oilTemperature: lastVpm.oiltemp ?? null,
          oilPressure: lastVpm.oilpressure ?? null,
          engineLoad: lastVpm.engineload ?? null,
          gear: lastVpm.gear ?? null,
          fuelLevel: lastVpm.fuellevel ?? null,
          fuelConsumption: lastVpm.fuelconsumption ?? null,
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
    { slot: "inCabDriverFacingCamera", matches: ["IN_CAB", "IN_CAB_DRIVER", "INCAB", "TVI2"] },
    { slot: "driverExternal", matches: ["DRIVER_EXTERNAL", "RIGHT_EXTERNAL", "SIDE_RIGHT", "TVI1"] },
    { slot: "leftExternal", matches: ["LEFT_EXTERNAL", "LEFT", "SIDE_LEFT", "UVC"] },
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
      label: "Snapshot Time",
      value: formatDisplayDate(lookup.cameraSnapshot?.snapshotTime),
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

function resolveSignalAt(gpio, keys) {
  const suffixes = ["At", "_at", "Timestamp", "TimeAt", "UpdatedAt", "RecordedAt"];

  for (const key of keys) {
    for (const suffix of suffixes) {
      const value = gpio?.[`${key}${suffix}`];
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }

  return null;
}

function resolveGpioSignal(gpio, keys) {
  for (const key of keys) {
    const value = gpio?.[key];
    if (value === undefined || value === null || value === "") continue;

    if (typeof value === "object" && !Array.isArray(value)) {
      return {
        value:
          value.value
          ?? value.state
          ?? value.status
          ?? value.active
          ?? value.enabled
          ?? value.on
          ?? null,
        at:
          value.at
          || value.timeAt
          || value.updatedAt
          || value.recordedAt
          || resolveSignalAt(gpio, keys),
      };
    }

    return {
      value,
      at: resolveSignalAt(gpio, keys),
    };
  }

  return {
    value: null,
    at: null,
  };
}

function renderGpioSignal(valueId, timeId, signal, truthyLabel, falsyLabel) {
  setText(valueId, formatBooleanState(signal.value, truthyLabel, falsyLabel, "N/A No Data"));
  setText(timeId, signal.at ? formatDisplayDate(signal.at) : "N/A No Data");
}

function renderGpio(lookup) {
  const gpio = lookup.hermesStats?.gpio || {};

  renderGpioSignal(
    "gpio-seatbelt",
    "gpio-seatbelt-at",
    resolveGpioSignal(gpio, ["seatbelt", "seatBelt"]),
    "Fastened",
    "Unfastened",
  );
  renderGpioSignal(
    "gpio-door",
    "gpio-door-at",
    resolveGpioSignal(gpio, ["door"]),
    "Open",
    "Closed",
  );
  renderGpioSignal(
    "gpio-parkbrake",
    "gpio-parkbrake-at",
    resolveGpioSignal(gpio, ["parkBrake", "parkbrake", "park_brake"]),
    "Applied",
    "Released",
  );
  renderGpioSignal(
    "gpio-driverevent",
    "gpio-driverevent-at",
    resolveGpioSignal(gpio, ["driverEvent", "driverevent", "eventButton"]),
    "Triggered",
    "Idle",
  );
  renderGpioSignal(
    "gpio-siren",
    "gpio-siren-at",
    resolveGpioSignal(gpio, ["siren", "speedSiren"]),
    "Active",
    "Inactive",
  );
  renderGpioSignal(
    "gpio-led",
    "gpio-led-at",
    resolveGpioSignal(gpio, ["led", "speedLed"]),
    "Active",
    "Inactive",
  );
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
    apiPost("/api/camera-snapshots", { vehicleId: vehicle.id }, "Camera snapshot lookup failed."),
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

async function handleExportPdf() {
  if (!state.activeAssetLookup) {
    showAssetSearchMessage("Load an asset before exporting the PDF.");
    return;
  }

  try {
    showAssetSearchMessage("Generating PDF...", false);
    const blob = await fetchBlob(
      "/api/export-pdf",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: state.activeAssetLookup }),
      },
      "PDF export failed.",
    );

    const vehicleLabel = state.activeAssetLookup.vehicle?.assetNumber || "snapshot";
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `tge-asset-snapshot-${vehicleLabel}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);

    showAssetSearchMessage("PDF exported successfully.", false);
  } catch (error) {
    showAssetSearchMessage(error.message || "PDF export failed.");
    writeDebug("PDF export failed", error.message);
  }
}

async function handleRefreshAsset() {
  const assetNumber = safeText(getNode("asset-number")?.value).trim()
    || safeText(state.activeAssetLookup?.requestedAssetNumber).trim();

  if (!assetNumber) {
    showAssetSearchMessage("Enter or load an asset before refreshing.");
    return;
  }

  writeDebug("Asset refresh submitted", { assetNumber });

  try {
    await handleAssetSearch(assetNumber);
    showAssetSearchMessage("Asset refreshed.", false);
  } catch (error) {
    handleAssetSearchError(assetNumber, error);
  }
}

function handleEmailPdf() {
  if (!state.activeAssetLookup) {
    showAssetSearchMessage("Load an asset before preparing the email.");
    return;
  }

  const vehicle = state.activeAssetLookup.vehicle || {};
  const subject = encodeURIComponent(`TGE Asset Snapshot - ${vehicle.assetNumber || "Asset"}`);
  const body = encodeURIComponent(
    [
      `Asset: ${safeText(vehicle.assetNumber, "N/A")}`,
      `Registration: ${safeText(vehicle.registration, "N/A")}`,
      `Vehicle ID: ${safeText(vehicle.vehicleId, "N/A")}`,
      `Requested At: ${formatDisplayDate(state.activeAssetLookup.requestedAt)}`,
      "",
      "Attach the exported PDF snapshot to this email before sending.",
    ].join("\n"),
  );

  window.location.href = `mailto:?subject=${subject}&body=${body}`;
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

initialiseUi();
loadSession();
