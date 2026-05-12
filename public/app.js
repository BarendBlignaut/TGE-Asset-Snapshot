const approvedUsers = [
  {
    firstName: "Barend",
    lastName: "Blignaut",
    username: "bare1234",
    role: "admin",
    status: "active",
    createdBy: "system",
    createdDate: "2026-05-12T00:00:00Z",
    updatedBy: "system",
    updatedDate: "2026-05-12T00:00:00Z",
  },
];

const loginHistory = [];
let currentSessionUser = null;
let activeAssetLookup = null;

const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const loginScreen = document.getElementById("login-screen");
const appShell = document.getElementById("app-shell");
const headerActions = document.getElementById("header-actions");
const adminTab = document.getElementById("admin-tab");
const standardTab = document.getElementById("standard-tab");
const standardView = document.getElementById("standard-view");
const adminView = document.getElementById("admin-view");

const approvedUserForm = document.getElementById("approved-user-form");
const approvedUsersTableBody = document.getElementById("approved-users-table-body");
const historyUserFilter = document.getElementById("history-user-filter");
const historyTableBody = document.getElementById("history-table-body");

const assetSearchForm = document.getElementById("asset-search-form");
const assetSearchMessage = document.getElementById("asset-search-message");
const assetShell = document.getElementById("asset-shell");

function findApprovedUser(username) {
  return approvedUsers.find(
    (user) => user.username.toLowerCase() === String(username).trim().toLowerCase(),
  );
}

function showLoginError() {
  loginMessage.textContent = "Access denied. Please contact Telematics.";
}

function showLoginSuccess(user) {
  loginMessage.textContent = "";
  currentSessionUser = user;
}

function showStandardView() {
  standardView.style.display = "block";
  adminView.style.display = "none";
}

function showAdminView() {
  standardView.style.display = "none";
  adminView.style.display = "block";
}

function openAppForUser(sessionUser) {
  loginScreen.style.display = "none";
  appShell.style.display = "block";
  headerActions.style.display = "flex";

  if (sessionUser.role === "admin") {
    adminTab.style.display = "inline-block";
    renderApprovedUsersTable();
    renderHistoryUserFilter();
    renderHistoryTable();
  } else {
    adminTab.style.display = "none";
  }

  showStandardView();
}

function isDriverUser(tnUser) {
  const roles = Array.isArray(tnUser.roles) ? tnUser.roles : [];

  return roles.some((role) => {
    const roleName = String(role.name || "").toLowerCase();
    const features = Array.isArray(role.features) ? role.features : [];
    return roleName === "driver" || features.includes("DRIVER");
  });
}

async function fetchTn360Users() {
  const response = await fetch("/api/tn360-users");
  if (!response.ok) {
    throw new Error("Unable to validate user.");
  }
  return response.json();
}

async function validateLogin(username, password) {
  const approvedUser = findApprovedUser(username);

  if (!approvedUser || approvedUser.status !== "active") {
    return { success: false };
  }

  const tnUsers = await fetchTn360Users();
  const tnUser = tnUsers.find(
    (user) => String(user.username || "").toLowerCase() === String(username).trim().toLowerCase(),
  );

  if (!tnUser) return { success: false };
  if (tnUser.status !== "ENABLED") return { success: false };
  if (!isDriverUser(tnUser)) return { success: false };
  if (String(tnUser.externalPin || "") !== String(password)) return { success: false };

  return {
    success: true,
    approvedUser,
    tnUser,
  };
}

function addHistoryRecord({ username, dateTime, assetRequested }) {
  loginHistory.push({ username, dateTime, assetRequested });
}

function renderHistoryUserFilter() {
  const usernames = [...new Set(loginHistory.map((item) => item.username))];
  historyUserFilter.innerHTML = '<option value="">All Users</option>';

  usernames.forEach((username) => {
    const option = document.createElement("option");
    option.value = username;
    option.textContent = username;
    historyUserFilter.appendChild(option);
  });
}

function renderHistoryTable() {
  const selectedUser = historyUserFilter.value;
  const filteredHistory = selectedUser
    ? loginHistory.filter((item) => item.username === selectedUser)
    : loginHistory;

  historyTableBody.innerHTML = "";

  filteredHistory.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.username}</td>
      <td>${item.dateTime}</td>
      <td>${item.assetRequested}</td>
    `;
    historyTableBody.appendChild(row);
  });
}

function renderApprovedUsersTable() {
  approvedUsersTableBody.innerHTML = "";

  approvedUsers.forEach((user) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${user.firstName}</td>
      <td>${user.lastName}</td>
      <td>${user.username}</td>
      <td>${user.role}</td>
      <td>${user.status}</td>
      <td>${user.updatedBy}</td>
      <td>${user.updatedDate}</td>
      <td>
        <button type="button" data-action="edit" data-username="${user.username}">Edit</button>
        <button type="button" data-action="deactivate" data-username="${user.username}">Deactivate</button>
      </td>
    `;
    approvedUsersTableBody.appendChild(row);
  });
}

function resetApprovedUserForm() {
  approvedUserForm.reset();
}

function fillApprovedUserForm(user) {
  document.getElementById("approved-first-name").value = user.firstName;
  document.getElementById("approved-last-name").value = user.lastName;
  document.getElementById("approved-username").value = user.username;
  document.getElementById("approved-role").value = user.role;
  document.getElementById("approved-status").value = user.status;
}

function upsertApprovedUser(formValues) {
  const existingUser = approvedUsers.find(
    (user) => user.username.toLowerCase() === formValues.username.toLowerCase(),
  );

  if (existingUser) {
    existingUser.firstName = formValues.firstName;
    existingUser.lastName = formValues.lastName;
    existingUser.role = formValues.role;
    existingUser.status = formValues.status;
    existingUser.updatedBy = currentSessionUser.username;
    existingUser.updatedDate = new Date().toISOString();
    return;
  }

  approvedUsers.push({
    firstName: formValues.firstName,
    lastName: formValues.lastName,
    username: formValues.username,
    role: formValues.role,
    status: formValues.status,
    createdBy: currentSessionUser.username,
    createdDate: new Date().toISOString(),
    updatedBy: currentSessionUser.username,
    updatedDate: new Date().toISOString(),
  });
}

function deactivateApprovedUser(username) {
  const user = approvedUsers.find(
    (item) => item.username.toLowerCase() === String(username).toLowerCase(),
  );

  if (!user) return;

  user.status = "inactive";
  user.updatedBy = currentSessionUser.username;
  user.updatedDate = new Date().toISOString();
}

function showAssetSearchMessage(message) {
  assetSearchMessage.textContent = message;
}

function clearAssetSearchMessage() {
  assetSearchMessage.textContent = "";
}

function resetActiveAssetLookup() {
  activeAssetLookup = null;
  assetShell.style.display = "none";
}

async function fetchVehicleByAssetNumber(assetNumber) {
  const response = await fetch("/api/vehicle-lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetNumber }),
  });

  if (!response.ok) {
    throw new Error("Asset not found.");
  }

  return response.json();
}

async function fetchVehicleDevices(vehicleId) {
  const response = await fetch("/api/vehicle-devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vehicleId }),
  });

  if (!response.ok) {
    throw new Error("Device lookup failed.");
  }

  return response.json();
}

async function fetchVehicleMeters(vehicleId) {
  const response = await fetch("/api/vehicle-meters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vehicleId }),
  });

  if (!response.ok) {
    console.warn("Meters lookup failed.", { vehicleId, status: response.status });
    return [];
  }

  return response.json();
}

async function fetchHermesDeviceStats(trackerId) {
  const response = await fetch("/api/hermes-device-stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trackerId }),
  });

  if (!response.ok) {
    throw new Error("HERMES device stats lookup failed.");
  }

  return response.json();
}

async function fetchCameraDeviceStats(cameraId) {
  const response = await fetch("/api/camera-device-stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cameraId }),
  });

  if (!response.ok) {
    throw new Error("Camera device stats lookup failed.");
  }

  return response.json();
}

async function fetchCameraSnapshots(vehicleId) {
  const response = await fetch("/api/camera-snapshots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vehicleId }),
  });

  if (!response.ok) {
    throw new Error("Camera snapshot lookup failed.");
  }

  return response.json();
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

function formatMaxTwoDecimals(value) {
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return null;
  return Number(numericValue.toFixed(2));
}

function extractVehicleMeters(meters) {
  const meterList = Array.isArray(meters) ? meters : [];

  const engineHoursRecord = meterList.find(
    (meter) =>
      String(meter.type || "").toLowerCase() === "hours" &&
      (!meter.maintenanceType || String(meter.maintenanceType || "").toUpperCase() === "TIME"),
  );

  const odometerRecord = meterList.find(
    (meter) =>
      ["odometer", "distance"].includes(String(meter.type || "").toLowerCase()) &&
      (!meter.maintenanceType ||
        String(meter.maintenanceType || "").toUpperCase() === "DISTANCE"),
  );

  return {
    engineHours: engineHoursRecord ? formatMaxTwoDecimals(engineHoursRecord.computed) : null,
    odometer: odometerRecord ? formatMaxTwoDecimals(odometerRecord.computed) : null,
  };
}

function safeParseJson(value) {
  if (!value || typeof value !== "string") return null;

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function extractHermesStats(device) {
  const deviceStats = device.deviceStats || {};
  const lastVpm = safeParseJson(deviceStats.lastVpm);
  const lastGpio = safeParseJson(deviceStats.lastGpio);
  const currentUser = deviceStats.currentUser || null;

  return {
    driverName: currentUser
      ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
      : "No driver",
    ignition: deviceStats.ignition || null,
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

function formatBytesToGb(bytesValue) {
  const numericValue = Number(bytesValue);
  if (Number.isNaN(numericValue) || numericValue <= 0) return null;
  const gbValue = numericValue / (1024 * 1024 * 1024);
  return `${gbValue.toFixed(2)} GB`;
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
  const snapshotEvents = events.filter(
    (event) => String(event.type || "").toUpperCase() === "SNAPSHOT",
  );

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
  const mediaFiles = context?.response?.mediaFiles || [];

  const links = mediaFiles.map((item) => ({
    source: item.source || null,
    mediaType: item.mediaType || null,
    mediaFile: item.mediaFile || null,
    status: item.status || null,
    sources: item.imageDetails?.sources || [],
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

function safeText(value, fallback = "") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  return String(value);
}

function setText(id, value, fallback = "") {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = safeText(value, fallback);
}

function setImage(imageId, emptyId, url) {
  const image = document.getElementById(imageId);
  const empty = document.getElementById(emptyId);

  if (!image || !empty) return;

  if (url) {
    image.src = url;
    image.style.display = "block";
    empty.style.display = "none";
  } else {
    image.removeAttribute("src");
    image.style.display = "none";
    empty.style.display = "block";
  }
}

function renderResolvedAsset() {
  if (!activeAssetLookup) return;

  const vehicle = activeAssetLookup.vehicle || {};
  const devices = activeAssetLookup.devices || {};
  const meters = activeAssetLookup.meters || {};
  const hermesStats = activeAssetLookup.hermesStats || {};
  const performance = hermesStats.performance || {};
  const cameraStats = activeAssetLookup.cameraStats || {};
  const cameraSnapshot = activeAssetLookup.cameraSnapshot || {};
  const slots = cameraSnapshot.slots || {};

  setText("view-asset-number", vehicle.assetNumber);
  setText("view-registration", vehicle.registration);
  setText("view-vin", vehicle.vin);
  setText("view-make-model", `${safeText(vehicle.make)} ${safeText(vehicle.model)}`.trim());
  setText("view-year", vehicle.yearOfManufacture);
  setText("view-driver", hermesStats.driverName || "No driver");

  setText("view-tracker-imei", devices.trackingSystem?.imei, "Not fitted");
  setText("view-tracker-serial", devices.trackingSystem?.serialNumber, "Not fitted");
  setText("view-tablet-imei", devices.tablet?.imei, "Not fitted");
  setText("view-tablet-serial", devices.tablet?.serialNumber, "Not fitted");
  setText("view-camera-imei", devices.camera?.imei, "Not fitted");
  setText("view-camera-serial", devices.camera?.serialNumber, "Not fitted");

  setText("view-odometer", meters.odometer, "");
  setText("view-engine-hours", meters.engineHours, "");

  setText("view-ignition", hermesStats.ignition, "");
  setText("view-movement", hermesStats.movement, "");
  setText("view-location", hermesStats.location, "");
  setText("view-speed", performance.speed, "");
  setText("view-rpm", performance.rpm, "");
  setText("view-oil-temp", performance.oilTemperature, "");
  setText("view-oil-pressure", performance.oilPressure, "");
  setText("view-engine-load", performance.engineLoad, "");
  setText("view-gear", performance.gear, "");

  setText("view-sd-overall", cameraStats.overallStatus, "");
  setText("view-sd1", cameraStats.sdCard1?.present ? "Present" : "Not present", "");
  setText("view-sd1-size", cameraStats.sdCard1?.totalSizeDisplay, "");
  setText("view-sd2", cameraStats.sdCard2?.present ? "Present" : "Not present", "");
  setText("view-sd2-size", cameraStats.sdCard2?.totalSizeDisplay, "");

  setImage("img-road-facing", "img-road-facing-empty", slots.roadFacing);
  setImage("img-driver-facing", "img-driver-facing-empty", slots.driverFacing);
  setImage("img-in-cab", "img-in-cab-empty", slots.inCabDriverFacingCamera);
  setImage("img-driver-external", "img-driver-external-empty", slots.driverExternal);
  setImage("img-left-external", "img-left-external-empty", slots.leftExternal);
}

async function handleAssetSearch(assetNumber) {
  clearAssetSearchMessage();
  resetActiveAssetLookup();

  const vehicle = await fetchVehicleByAssetNumber(assetNumber);
  const devices = await fetchVehicleDevices(vehicle.id);
  const mappedDevices = mapVehicleDevices(devices);
  const meters = await fetchVehicleMeters(vehicle.id);
  const extractedMeters = extractVehicleMeters(meters);

  let hermesStats = null;
  let cameraStats = null;
  let cameraSnapshot = null;

  if (mappedDevices.trackingSystem?.imei || mappedDevices.trackingSystem?.serialNumber) {
    const hermesIdentifier =
      mappedDevices.trackingSystem.imei || mappedDevices.trackingSystem.serialNumber;
    const hermesDevice = await fetchHermesDeviceStats(hermesIdentifier);
    hermesStats = extractHermesStats(hermesDevice);
  }

  if (mappedDevices.camera?.imei) {
    const cameraDevice = await fetchCameraDeviceStats(mappedDevices.camera.imei);
    cameraStats = extractCameraStats(cameraDevice);
  }

  const snapshotEvents = await fetchCameraSnapshots(vehicle.id);
  const latestSnapshot = extractLatestSnapshot(snapshotEvents);

  cameraSnapshot = {
    snapshotTime: latestSnapshot.snapshotTime,
    slots: mapSnapshotLinksToSlots(latestSnapshot),
  };

  activeAssetLookup = {
    requestedAssetNumber: assetNumber,
    vehicle: {
      vehicleId: vehicle.id,
      assetNumber: vehicle.name,
      registration: vehicle.registration,
      registrationState: vehicle.registrationState,
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      yearOfManufacture: vehicle.operationalVehicleModel?.yearOfManufacture || null,
    },
    devices: mappedDevices,
    meters: extractedMeters,
    hermesStats,
    cameraStats,
    cameraSnapshot,
  };

  addHistoryRecord({
    username: currentSessionUser.username,
    dateTime: new Date().toISOString(),
    assetRequested: assetNumber,
  });

  if (currentSessionUser.role === "admin") {
    renderHistoryUserFilter();
    renderHistoryTable();
  }

  renderResolvedAsset();
  assetShell.style.display = "block";
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  try {
    const result = await validateLogin(username, password);

    if (!result.success) {
      showLoginError();
      return;
    }

    showLoginSuccess({
      username: result.approvedUser.username,
      role: result.approvedUser.role,
      firstName: result.tnUser.firstName,
      lastName: result.tnUser.lastName,
    });

    addHistoryRecord({
      username: currentSessionUser.username,
      dateTime: new Date().toISOString(),
      assetRequested: "Login only",
    });

    openAppForUser(currentSessionUser);
  } catch (error) {
    showLoginError();
  }
});

standardTab.addEventListener("click", () => {
  showStandardView();
});

adminTab.addEventListener("click", () => {
  if (!currentSessionUser || currentSessionUser.role !== "admin") return;
  showAdminView();
});

approvedUserForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!currentSessionUser || currentSessionUser.role !== "admin") return;

  const formValues = {
    firstName: document.getElementById("approved-first-name").value.trim(),
    lastName: document.getElementById("approved-last-name").value.trim(),
    username: document.getElementById("approved-username").value.trim(),
    role: document.getElementById("approved-role").value,
    status: document.getElementById("approved-status").value,
  };

  upsertApprovedUser(formValues);
  renderApprovedUsersTable();
  resetApprovedUserForm();
});

approvedUsersTableBody.addEventListener("click", (event) => {
  const action = event.target.getAttribute("data-action");
  const username = event.target.getAttribute("data-username");

  if (!action || !username) return;
  if (!currentSessionUser || currentSessionUser.role !== "admin") return;

  const user = approvedUsers.find(
    (item) => item.username.toLowerCase() === username.toLowerCase(),
  );

  if (action === "edit" && user) {
    fillApprovedUserForm(user);
    return;
  }

  if (action === "deactivate") {
    deactivateApprovedUser(username);
    renderApprovedUsersTable();
  }
});

historyUserFilter.addEventListener("change", () => {
  renderHistoryTable();
});

assetSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const assetNumber = document.getElementById("asset-number").value.trim();

  try {
    await handleAssetSearch(assetNumber);
    showAssetSearchMessage("");
  } catch (error) {
    resetActiveAssetLookup();
    showAssetSearchMessage("Asset not found.");
  }
});
