const state = {
  currentSessionUser: null,
  activeAssetLookup: null,
  approvedUsers: [],
  accessHistory: [],
  lastDebugEntries: ["No debug entries."],
};

const el = {
  loginForm: document.getElementById("login-form"),
  loginMessage: document.getElementById("login-message"),
  loginScreen: document.getElementById("login-screen"),
  appShell: document.getElementById("app-shell"),
  headerActions: document.getElementById("header-actions"),
  adminTab: document.getElementById("admin-tab"),
  standardTab: document.getElementById("standard-tab"),
  standardView: document.getElementById("standard-view"),
  adminView: document.getElementById("admin-view"),
  approvedUserForm: document.getElementById("approved-user-form"),
  approvedUsersTableBody: document.getElementById("approved-users-table-body"),
  historyUserFilter: document.getElementById("history-user-filter"),
  historyTableBody: document.getElementById("history-table-body"),
  assetSearchForm: document.getElementById("asset-search-form"),
  assetSearchMessage: document.getElementById("asset-search-message"),
  assetShell: document.getElementById("asset-shell"),
  debugPanel: document.getElementById("debug-panel"),
  debugOutput: document.getElementById("debug-output"),
  exportPdfButton: document.getElementById("export-pdf-btn"),
  emailPdfButton: document.getElementById("email-pdf-btn"),
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
  const output = [label];

  if (data !== undefined) {
    output.push(typeof data === "string" ? data : JSON.stringify(data, null, 2));
  }

  state.lastDebugEntries = output;
  renderDebug();
}

function renderDebug() {
  const isAdmin = state.currentSessionUser?.role === "admin";

  if (!el.debugPanel || !el.debugOutput) return;

  setVisible(el.debugPanel, Boolean(isAdmin));
  if (isAdmin) {
    el.debugOutput.textContent = state.lastDebugEntries.join("\n\n");
  }
}

function showStandardView() {
  setVisible(el.standardView, true, "block");
  setVisible(el.adminView, false);
}

function showAdminView() {
  setVisible(el.standardView, false);
  setVisible(el.adminView, true, "block");
}

function clearSessionUi() {
  state.currentSessionUser = null;
  state.approvedUsers = [];
  state.accessHistory = [];
  setVisible(el.loginScreen, true, "grid");
  setVisible(el.appShell, false);
  setVisible(el.headerActions, false);
  setVisible(el.adminTab, false);
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
    loadAdminData().catch((error) => {
      writeDebug("Admin data load failed", error.message);
    });
  } else {
    setVisible(el.adminTab, false);
  }

  renderDebug();
  showStandardView();
}

function initialiseUi() {
  setVisible(el.appShell, false);
  setVisible(el.headerActions, false);
  setVisible(el.adminTab, false);
  showStandardView();
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
  setFieldValue("approved-password", "");
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
    ignition: attrs.last_ignition || deviceStats.ignition || null,
    ignitionAt: attrs.last_ignition_at || null,
    movement: deviceStats.movement || null,
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

  snapshotData.links.forEach((link) => {
    const source = String(link.source || "").toUpperCase();
    const firstChannel = String(link.sources?.[0] || "").toUpperCase();

    if (!slots.roadFacing && (source === "ROAD_FACING" || firstChannel === "ROAD")) {
      slots.roadFacing = link.mediaFile;
      return;
    }

    if (!slots.driverFacing && (source === "DRIVER_FACING" || firstChannel === "DRIVER")) {
      slots.driverFacing = link.mediaFile;
      return;
    }

    if (!slots.inCabDriverFacingCamera && firstChannel === "TVI2") {
      slots.inCabDriverFacingCamera = link.mediaFile;
      return;
    }

    if (!slots.driverExternal && firstChannel === "TVI1") {
      slots.driverExternal = link.mediaFile;
      return;
    }

    if (!slots.leftExternal && firstChannel === "UVC") {
      slots.leftExternal = link.mediaFile;
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
  setText(["hero-vehicle-id", "hero-vehicle-id-copy"], vehicle.vehicleId, "--");
  setText("hero-render-time", `${lookup.renderDurationMs} ms`, "--");
}

function renderVehicleDetails(lookup) {
  const vehicle = lookup.vehicle || {};
  const devices = lookup.devices || {};
  const hermesStats = lookup.hermesStats || {};
  const combinedMakeModel = [vehicle.make, vehicle.model].filter(Boolean).join(" ");

  setText("view-asset-number", vehicle.assetNumber);
  setText("view-registration", vehicle.registration);
  setText("view-vin", vehicle.vin);
  setText("view-make-model", combinedMakeModel);
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
  setText("view-engine-load", formatMetric(performance.engineLoad));
  setText("view-gear", formatMetric(performance.gear));
  setText("view-location", hermesStats.location, "");
  setText("view-ignition", ignitionText, "");
  setText("view-movement", movementText, "");
  setText("view-ignition-status", hermesStats.ignition || ignitionText || "", "");
}

function renderStorage(lookup) {
  const cameraStats = lookup.cameraStats || {};

  setText("view-sd-overall", cameraStats.overallStatus, "");
  setText("view-sd1", cameraStats.sdCard1?.present ? "Present" : "Not present", "");
  setText("view-sd1-size", cameraStats.sdCard1?.totalSizeDisplay, "");
  setText("view-sd2", cameraStats.sdCard2?.present ? "Present" : "Not present", "");
  setText("view-sd2-size", cameraStats.sdCard2?.totalSizeDisplay, "");
}

function getGpioVerb(entry, fallback = "Current state tracked") {
  if (!entry) return fallback;

  const rawValue = safeText(entry.custom_verb || entry.verb, "").trim();
  if (!rawValue) return fallback;

  return rawValue;
}

function renderGpio(lookup) {
  const gpio = lookup.hermesStats?.gpio || {};

  setText("gpio-seatbelt", getGpioVerb(gpio["digin.1"]));
  setText("gpio-door", getGpioVerb(gpio["digin.2"]));
  setText("gpio-parkbrake", getGpioVerb(gpio["digin.3"]));
  setText("gpio-driverevent", getGpioVerb(gpio["digin.4"]));
  setText("gpio-siren", getGpioVerb(gpio["digout.2"]));
  setText("gpio-led", getGpioVerb(gpio["digout.3"]));
}
function formatCoordinate(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return "";
  }

  return numericValue.toFixed(5);
}

function buildMapEmbedUrl(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return "";
  }

  const paddingLat = 0.02;
  const paddingLng = 0.02;

  const left = lng - paddingLng;
  const right = lng + paddingLng;
  const top = lat + paddingLat;
  const bottom = lat - paddingLat;

  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${lat}%2C${lng}`;
}

function renderLocationMap(lookup) {
  const gps = lookup.hermesStats?.gps || {};
  const latitude = gps.latitude;
  const longitude = gps.longitude;

  setText("view-location", lookup.hermesStats?.location, "");
  setText("view-latitude", formatCoordinate(latitude), "");
  setText("view-longitude", formatCoordinate(longitude), "");
  setText("view-map-source", "OpenStreetMap", "");

  const mapFrame = getNode("location-map");
  if (!mapFrame) return;

  const mapUrl = buildMapEmbedUrl(latitude, longitude);

  if (mapUrl) {
    mapFrame.src = mapUrl;
  } else {
    mapFrame.removeAttribute("src");
  }
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
  renderStorage(state.activeAssetLookup);
  renderGpio(state.activeAssetLookup);
  renderLocationMap(state.activeAssetLookup);
  renderSnapshots(state.activeAssetLookup);

  setVisible(el.assetShell, true, "block");
  renderDebug();
}

function resetHero() {
  setText("hero-current-asset", "No asset loaded");
  setText("hero-request-time", "--");
  setText("hero-lookup-status", "Awaiting search");
  setText("hero-fleet-number", "--");
  setText(["hero-vehicle-id", "hero-vehicle-id-copy"], "--");
  setText("hero-render-time", "--");
}

function resetRenderedAsset() {
  resetHero();

  [
    "view-asset-number",
    "view-registration",
    "view-vin",
    "view-make-model",
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
    "view-engine-load",
    "view-gear",
    "view-location",
    "view-ignition",
    "view-movement",
    "view-ignition-status",
    "view-sd-overall",
    "view-sd1",
    "view-sd1-size",
    "view-sd2",
    "view-sd2-size",
    "view-latitude",
    "view-longitude",
    "view-map-source",
    "gpio-seatbelt",
    "gpio-door",
    "gpio-parkbrake",
    "gpio-driverevent",
    "gpio-siren",
    "gpio-led",
  ].forEach((id) => setText(id, ""));

  const mapFrame = getNode("location-map");
if (mapFrame) {
  mapFrame.removeAttribute("src");
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

  await apiPost(
    "/api/access-history",
    { assetRequested: assetNumber },
    "Unable to record access history.",
  );

  if (state.currentSessionUser.role === "admin") {
    await loadAccessHistory();
  }

  state.activeAssetLookup = nextLookup;

  writeDebug("Lookup completed", nextLookup);
  renderResolvedAsset();
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

  showAssetSearchMessage("PDF export is temporarily disabled while we fix the new export layout.", true);
  writeDebug("PDF export skipped", {
    assetNumber: state.activeAssetLookup.vehicle?.assetNumber || "",
  });
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

if (el.approvedUserForm) {
  el.approvedUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.currentSessionUser || state.currentSessionUser.role !== "admin") return;

    const formValues = {
      firstName: safeText(getNode("approved-first-name")?.value).trim(),
      lastName: safeText(getNode("approved-last-name")?.value).trim(),
      username: safeText(getNode("approved-username")?.value).trim(),
      role: safeText(getNode("approved-role")?.value).trim(),
      status: safeText(getNode("approved-status")?.value).trim(),
      password: safeText(getNode("approved-password")?.value).trim(),
    };

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

if (el.emailPdfButton) {
  el.emailPdfButton.addEventListener("click", handleEmailPdf);
}

initialiseUi();
// loadSession();
