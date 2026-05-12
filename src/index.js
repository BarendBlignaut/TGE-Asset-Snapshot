const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const APPROVED_USERS_FILE = path.join(DATA_DIR, "approved-users.json");
const ACCESS_HISTORY_FILE = path.join(DATA_DIR, "access-history.json");
const SESSION_COOKIE = "tge_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const MEDIA_FILES = {
  road: path.resolve(ROOT, "../user_files/14-IMG_20260510_130341.jpg"),
  driver: path.resolve(ROOT, "../user_files/17-d1ec3735-0cf5-4a30-826d-efae38840526.png"),
  incab: path.resolve(ROOT, "../user_files/18-fa66eb60-fea8-4429-9a5a-4cb3edbdd450.png"),
  external: path.resolve(ROOT, "../user_files/19-437502a0-ce09-4814-9858-9372a4b89fa9.png"),
  left: path.resolve(ROOT, "../user_files/20-0c096e6b-743f-439e-b4ff-f57e5592a5f0.png"),
};

const sessions = new Map();

const DEMO_VEHICLE = {
  id: "veh-001",
  name: "1001",
  registration: "TGE-001",
  registrationState: "NSW",
  vin: "JH4DA9450LS000101",
  make: "Hino",
  model: "500 Series",
  operationalVehicleModel: {
    yearOfManufacture: 2022,
  },
};

const DEMO_DEVICES = [
  {
    id: "hermes-001",
    imei: "356938035643809",
    serialNumber: "HERMES-001",
    releaseVersion: "3.7.2",
    type: { code: "HERMES" },
  },
  {
    id: "camera-001",
    imei: "866301234567890",
    serialNumber: "CAM-001",
    model: { name: "SureCam" },
    type: { code: "CAMERA" },
  },
  {
    id: "iface-001",
    imei: "352099001761481",
    serialNumber: "TAB-001",
    model: { name: "Samsung Tab Active" },
    type: { code: "IFACE" },
  },
];

const DEMO_METERS = [
  { type: "hours", maintenanceType: "TIME", computed: 1243.5 },
  { type: "odometer", maintenanceType: "DISTANCE", computed: 84751.2 },
];

const DEMO_HERMES_DEVICE = {
  id: "hermes-001",
  type: { code: "HERMES" },
  deviceStats: {
    ignition: true,
    movement: false,
    tripId: "trip-001",
    location: "Sydney Depot",
    gps: {
      Lat: -33.8688,
      Lng: 151.2093,
      At: new Date().toISOString(),
    },
    currentUser: {
      firstName: "Demo",
      lastName: "Driver",
    },
    lastVpm: JSON.stringify({
      speed: 0,
      rpm: 650,
      oiltemp: 92,
      oilpressure: 43,
      engineload: 18,
      gear: 1,
      fuellevel: 65,
      fuelconsumption: 21.4,
    }),
    lastGpio: JSON.stringify({
      seatbelt: true,
      door: false,
      parkBrake: true,
    }),
  },
};

const DEMO_CAMERA_DEVICE = {
  id: "camera-001",
  type: { code: "CAMERA" },
  deviceStats: {
    attrs: {
      "lm.sd_card.overall_status": "Healthy",
      "lm.sd_card.1": "sdCardPresent",
      "lm.sd_card.1_total_size_bytes": String(64 * 1024 * 1024 * 1024),
      "lm.sd_card.2": "sdCardPresent",
      "lm.sd_card.2_total_size_bytes": String(64 * 1024 * 1024 * 1024),
    },
  },
};

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function seedApprovedUsers() {
  return [
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
      passwordHash: hashPassword("1234"),
    },
  ];
}

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(APPROVED_USERS_FILE)) {
    fs.writeFileSync(APPROVED_USERS_FILE, JSON.stringify(seedApprovedUsers(), null, 2));
  }

  if (!fs.existsSync(ACCESS_HISTORY_FILE)) {
    fs.writeFileSync(ACCESS_HISTORY_FILE, JSON.stringify([], null, 2));
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function publicUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function json(response, status, data, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(JSON.stringify(data));
}

function sendPdf(response, filename, bytes) {
  response.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });
  response.end(Buffer.from(bytes));
}

function sendFile(response, filePath) {
  if (!fs.existsSync(filePath)) {
    json(response, 404, { error: "File not found." });
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".json": "application/json; charset=utf-8",
  };

  response.writeHead(200, {
    "Content-Type": contentTypes[extension] || "application/octet-stream",
    "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=300",
  });

  fs.createReadStream(filePath).pipe(response);
}

function parseCookies(request) {
  const rawCookie = request.headers.cookie || "";
  return rawCookie.split(";").reduce((accumulator, item) => {
    const [key, ...rest] = item.trim().split("=");
    if (!key) return accumulator;
    accumulator[key] = decodeURIComponent(rest.join("="));
    return accumulator;
  }, {});
}

function setSessionCookie(response, token) {
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`,
  );
}

function clearSessionCookie(response) {
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
  );
}

function getSession(request) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];

  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  return { token, session };
}

function createSession(user) {
  const token = crypto.randomUUID();
  sessions.set(token, {
    user,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function requireSession(request, response) {
  const sessionRecord = getSession(request);

  if (!sessionRecord) {
    json(response, 401, { error: "You are not signed in." });
    return null;
  }

  return sessionRecord;
}

function requireAdmin(request, response) {
  const sessionRecord = requireSession(request, response);
  if (!sessionRecord) return null;

  if (sessionRecord.session.user.role !== "admin") {
    json(response, 403, { error: "Admin access is required." });
    return null;
  }

  return sessionRecord;
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(payload);
      } catch (error) {
        reject(new Error("Invalid JSON request body."));
      }
    });
    request.on("error", reject);
  });
}

function addAccessHistoryRecord(username, assetRequested) {
  const history = readJson(ACCESS_HISTORY_FILE);
  history.unshift({
    username,
    dateTime: new Date().toISOString(),
    assetRequested,
  });
  writeJson(ACCESS_HISTORY_FILE, history);
}

async function fetchJsonFromTn360(url) {
  const response = await fetch(url);
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(`TN360 request failed. HTTP ${response.status}. ${message}`);
  }

  return payload;
}

function isDriverUser(tnUser) {
  const roles = Array.isArray(tnUser.roles) ? tnUser.roles : [];

  return roles.some((role) => {
    const roleName = String(role.name || "").toLowerCase();
    const features = Array.isArray(role.features) ? role.features : [];
    return roleName === "driver" || features.includes("DRIVER");
  });
}

function getDemoSnapshotEvents(origin) {
  const mediaFiles = [
    { source: "ROAD_FACING", mediaFile: `${origin}/mock-media/road`, imageDetails: { sources: ["ROAD"] } },
    { source: "DRIVER_FACING", mediaFile: `${origin}/mock-media/driver`, imageDetails: { sources: ["DRIVER"] } },
    { source: "IN_CAB", mediaFile: `${origin}/mock-media/incab`, imageDetails: { sources: ["TVI2"] } },
    { source: "DRIVER_EXTERNAL", mediaFile: `${origin}/mock-media/external`, imageDetails: { sources: ["TVI1"] } },
    { source: "LEFT_EXTERNAL", mediaFile: `${origin}/mock-media/left`, imageDetails: { sources: ["UVC"] } },
  ];

  return [
    {
      vehicleId: DEMO_VEHICLE.id,
      type: "CAMERA",
      action: "SNAPSHOT",
      timeAt: new Date().toISOString(),
      attributes: {
        context: JSON.stringify({
          response: {
            mediaFiles,
          },
        }),
      },
    },
  ];
}

function demoModeEnabled() {
  return !process.env.TN360_API_KEY;
}

async function handleLogin(request, response) {
  const body = await parseBody(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();

  if (!username || !password) {
    json(response, 400, { error: "Username and password are required." });
    return;
  }

  const approvedUsers = readJson(APPROVED_USERS_FILE);
  const approvedUser = approvedUsers.find(
    (user) => String(user.username || "").toLowerCase() === username.toLowerCase(),
  );

  if (!approvedUser || approvedUser.status !== "active") {
    json(response, 401, { error: "Access denied. Please contact Telematics." });
    return;
  }

  let sessionUser;

  if (demoModeEnabled()) {
    const passwordHash = approvedUser.passwordHash || "";
    if (passwordHash !== hashPassword(password)) {
      json(response, 401, { error: "Access denied. Invalid username or password." });
      return;
    }

    sessionUser = {
      username: approvedUser.username,
      role: approvedUser.role,
      firstName: approvedUser.firstName,
      lastName: approvedUser.lastName,
      mode: "demo",
    };
  } else {
    const usersUrl = `https://api-au.telematics.com/v1/users/?key=${process.env.TN360_API_KEY}&pruning=B2B`;
    const users = await fetchJsonFromTn360(usersUrl);
    const matchedUser = users.find(
      (user) => String(user.username || "").toLowerCase() === username.toLowerCase(),
    );

    if (!matchedUser || matchedUser.status !== "ENABLED" || !isDriverUser(matchedUser)) {
      json(response, 401, { error: "Access denied. Please contact Telematics." });
      return;
    }

    if (String(matchedUser.externalPin || "") !== password) {
      json(response, 401, { error: "Access denied. Invalid username or password." });
      return;
    }

    sessionUser = {
      username: approvedUser.username,
      role: approvedUser.role,
      firstName: matchedUser.firstName,
      lastName: matchedUser.lastName,
      mode: "tn360",
    };
  }

  const token = createSession(sessionUser);
  setSessionCookie(response, token);
  addAccessHistoryRecord(sessionUser.username, "Login only");
  json(response, 200, { user: sessionUser });
}

async function handleSession(request, response) {
  const sessionRecord = requireSession(request, response);
  if (!sessionRecord) return;

  json(response, 200, { user: sessionRecord.session.user });
}

async function handleLogout(request, response) {
  const sessionRecord = getSession(request);
  if (sessionRecord) {
    sessions.delete(sessionRecord.token);
  }

  clearSessionCookie(response);
  json(response, 200, { ok: true });
}

async function handleApprovedUsersGet(request, response) {
  const sessionRecord = requireAdmin(request, response);
  if (!sessionRecord) return;

  const approvedUsers = readJson(APPROVED_USERS_FILE).map(publicUser);
  json(response, 200, approvedUsers);
}

async function handleApprovedUsersUpsert(request, response) {
  const sessionRecord = requireAdmin(request, response);
  if (!sessionRecord) return;

  const body = await parseBody(request);
  const username = String(body.username || "").trim();

  if (!username) {
    json(response, 400, { error: "Username is required." });
    return;
  }

  const approvedUsers = readJson(APPROVED_USERS_FILE);
  const existingUser = approvedUsers.find(
    (user) => user.username.toLowerCase() === username.toLowerCase(),
  );
  const now = new Date().toISOString();

  if (existingUser) {
    existingUser.firstName = String(body.firstName || existingUser.firstName || "").trim();
    existingUser.lastName = String(body.lastName || existingUser.lastName || "").trim();
    existingUser.role = String(body.role || existingUser.role || "user").trim();
    existingUser.status = String(body.status || existingUser.status || "active").trim();
    existingUser.updatedBy = sessionRecord.session.user.username;
    existingUser.updatedDate = now;

    if (String(body.password || "").trim()) {
      existingUser.passwordHash = hashPassword(String(body.password).trim());
    }
  } else {
    approvedUsers.push({
      firstName: String(body.firstName || "").trim(),
      lastName: String(body.lastName || "").trim(),
      username,
      role: String(body.role || "user").trim(),
      status: String(body.status || "active").trim(),
      createdBy: sessionRecord.session.user.username,
      createdDate: now,
      updatedBy: sessionRecord.session.user.username,
      updatedDate: now,
      passwordHash: String(body.password || "").trim()
        ? hashPassword(String(body.password).trim())
        : "",
    });
  }

  writeJson(APPROVED_USERS_FILE, approvedUsers);
  json(response, 200, { ok: true });
}

async function handleApprovedUsersDeactivate(request, response) {
  const sessionRecord = requireAdmin(request, response);
  if (!sessionRecord) return;

  const body = await parseBody(request);
  const username = String(body.username || "").trim();
  const approvedUsers = readJson(APPROVED_USERS_FILE);
  const user = approvedUsers.find(
    (item) => item.username.toLowerCase() === username.toLowerCase(),
  );

  if (!user) {
    json(response, 404, { error: "Approved user not found." });
    return;
  }

  user.status = "inactive";
  user.updatedBy = sessionRecord.session.user.username;
  user.updatedDate = new Date().toISOString();

  writeJson(APPROVED_USERS_FILE, approvedUsers);
  json(response, 200, { ok: true });
}

async function handleAccessHistoryGet(request, response) {
  const sessionRecord = requireAdmin(request, response);
  if (!sessionRecord) return;

  json(response, 200, readJson(ACCESS_HISTORY_FILE));
}

async function handleAccessHistoryPost(request, response) {
  const sessionRecord = requireSession(request, response);
  if (!sessionRecord) return;

  const body = await parseBody(request);
  const assetRequested = String(body.assetRequested || "").trim();

  if (!assetRequested) {
    json(response, 400, { error: "Asset requested is required." });
    return;
  }

  addAccessHistoryRecord(sessionRecord.session.user.username, assetRequested);
  json(response, 200, { ok: true });
}

async function handleTn360Users(request, response) {
  const sessionRecord = requireSession(request, response);
  if (!sessionRecord) return;

  if (demoModeEnabled()) {
    json(response, 200, {
      username: "bare1234",
      status: "ENABLED",
      firstName: "Barend",
      lastName: "Blignaut",
      roles: [{ name: "driver", features: ["DRIVER"] }],
      externalPin: "1234",
    });
    return;
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const username = String(requestUrl.searchParams.get("username") || "").trim();

  if (!username) {
    json(response, 400, { error: "Username is required." });
    return;
  }

  const usersUrl = `https://api-au.telematics.com/v1/users/?key=${process.env.TN360_API_KEY}&pruning=B2B`;
  const users = await fetchJsonFromTn360(usersUrl);
  const matchedUser = users.find(
    (user) => String(user.username || "").toLowerCase() === username.toLowerCase(),
  );

  if (!matchedUser) {
    json(response, 404, { error: "TN360 user not found." });
    return;
  }

  json(response, 200, matchedUser);
}

async function handleVehicleLookup(request, response) {
  const sessionRecord = requireSession(request, response);
  if (!sessionRecord) return;

  const body = await parseBody(request);
  const assetNumber = String(body.assetNumber || "").trim();
  const searchValue = assetNumber.replace(/\s+/g, "").toLowerCase();

  if (!assetNumber) {
    json(response, 400, { error: "Asset number is required." });
    return;
  }

  if (demoModeEnabled()) {
    const demoValue = DEMO_VEHICLE.name.replace(/\s+/g, "").toLowerCase();
    if (demoValue !== searchValue) {
      json(response, 404, { error: "Asset not found." });
      return;
    }

    json(response, 200, DEMO_VEHICLE);
    return;
  }

  const vehiclesUrl = `https://api-au.telematics.com/v1/vehicles/?key=${process.env.TN360_API_KEY}&pruning=B2B`;
  const vehicles = await fetchJsonFromTn360(vehiclesUrl);
  const matchedVehicle = vehicles.find((vehicle) => {
    const vehicleName = String(vehicle.name || "").replace(/\s+/g, "").toLowerCase();
    return vehicleName === searchValue;
  });

  if (!matchedVehicle) {
    json(response, 404, { error: "Asset not found." });
    return;
  }

  json(response, 200, matchedVehicle);
}

async function handleVehicleDevices(request, response) {
  const sessionRecord = requireSession(request, response);
  if (!sessionRecord) return;

  const body = await parseBody(request);
  const vehicleId = String(body.vehicleId || "").trim();

  if (!vehicleId) {
    json(response, 400, { error: "Vehicle ID is required." });
    return;
  }

  if (demoModeEnabled()) {
    json(response, 200, DEMO_DEVICES);
    return;
  }

  const devicesUrl = `https://api-au.telematics.com/v1/vehicles/${vehicleId}/devices?key=${process.env.TN360_API_KEY}&pruning=B2B`;
  json(response, 200, await fetchJsonFromTn360(devicesUrl));
}

async function handleVehicleMeters(request, response) {
  const sessionRecord = requireSession(request, response);
  if (!sessionRecord) return;

  const body = await parseBody(request);
  const vehicleId = String(body.vehicleId || "").trim();

  if (!vehicleId) {
    json(response, 400, { error: "Vehicle ID is required." });
    return;
  }

  if (demoModeEnabled()) {
    json(response, 200, DEMO_METERS);
    return;
  }

  const metersUrl = `https://api-au.telematics.com/v1/vehicles/${vehicleId}/meters?key=${process.env.TN360_API_KEY}&pruning=B2B`;
  json(response, 200, await fetchJsonFromTn360(metersUrl));
}

async function handleHermesDeviceStats(request, response) {
  const sessionRecord = requireSession(request, response);
  if (!sessionRecord) return;

  const body = await parseBody(request);
  const trackerId = String(body.trackerId || "").trim();

  if (!trackerId) {
    json(response, 400, { error: "Tracker ID is required." });
    return;
  }

  if (demoModeEnabled()) {
    json(response, 200, DEMO_HERMES_DEVICE);
    return;
  }

  const devicesUrl = `https://api-au.telematics.com/v1/devices/?key=${process.env.TN360_API_KEY}&pruning=B2B`;
  const devices = await fetchJsonFromTn360(devicesUrl);
  const searchValue = normalizeValue(trackerId);

  const matchedDevice = devices.find((device) => {
    const typeCode = normalizeValue(device?.type?.code);
    const deviceId = normalizeValue(device?.id);
    const imei = normalizeValue(device?.imei);
    const serialNumber = normalizeValue(device?.serialNumber);

    return typeCode === "hermes" && (
      deviceId === searchValue ||
      imei === searchValue ||
      serialNumber === searchValue
    );
  });

  if (!matchedDevice) {
    json(response, 404, { error: "HERMES device not found." });
    return;
  }

  json(response, 200, matchedDevice);
}

async function handleCameraDeviceStats(request, response) {
  const sessionRecord = requireSession(request, response);
  if (!sessionRecord) return;

  const body = await parseBody(request);
  const cameraId = String(body.cameraId || "").trim();

  if (!cameraId) {
    json(response, 400, { error: "Camera ID is required." });
    return;
  }

  if (demoModeEnabled()) {
    json(response, 200, DEMO_CAMERA_DEVICE);
    return;
  }

  const devicesUrl = `https://api-au.telematics.com/v1/devices/?key=${process.env.TN360_API_KEY}&pruning=B2B`;
  const devices = await fetchJsonFromTn360(devicesUrl);
  const searchValue = normalizeValue(cameraId);

  const matchedDevice = devices.find((device) => {
    const deviceId = normalizeValue(device?.id);
    const imei = normalizeValue(device?.imei);
    const serialNumber = normalizeValue(device?.serialNumber);
    return deviceId === searchValue || imei === searchValue || serialNumber === searchValue;
  });

  if (!matchedDevice) {
    json(response, 404, { error: "Camera device not found." });
    return;
  }

  json(response, 200, matchedDevice);
}

async function handleCameraSnapshots(request, response) {
  const sessionRecord = requireSession(request, response);
  if (!sessionRecord) return;

  const body = await parseBody(request);
  const vehicleId = String(body.vehicleId || "").trim();

  if (!vehicleId) {
    json(response, 400, { error: "Vehicle ID is required." });
    return;
  }

  if (demoModeEnabled()) {
    const origin = `http://${request.headers.host}`;
    json(response, 200, getDemoSnapshotEvents(origin));
    return;
  }

  const now = new Date();
  const to = now.toISOString();
  const fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const from = fromDate.toISOString();

  const eventsUrl = `https://api-au.telematics.com/v1/events/?key=${process.env.TN360_API_KEY}&pruning=B2B&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const events = await fetchJsonFromTn360(eventsUrl);
  const matchedEvents = Array.isArray(events)
    ? events.filter((event) => String(event.vehicleId || "") === vehicleId)
    : [];

  json(response, 200, matchedEvents);
}

function wrapText(text, maxWidth, font, fontSize) {
  if (!text) return [""];

  const words = String(text).split(/\s+/);
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, fontSize);

    if (width <= maxWidth || !current) {
      current = candidate;
      return;
    }

    lines.push(current);
    current = word;
  });

  if (current) lines.push(current);
  return lines;
}

async function buildSnapshotPdf(snapshot) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();
  let y = height - 48;

  function drawTextBlock(text, x, fontRef, fontSize, color = rgb(0.12, 0.16, 0.14)) {
    const lines = wrapText(text, width - x - 48, fontRef, fontSize);
    lines.forEach((line) => {
      page.drawText(line, {
        x,
        y,
        size: fontSize,
        font: fontRef,
        color,
      });
      y -= fontSize + 4;
    });
  }

  function section(title) {
    y -= 8;
    page.drawRectangle({
      x: 36,
      y: y - 6,
      width: width - 72,
      height: 24,
      color: rgb(0.91, 0.97, 0.93),
    });
    page.drawText(title, {
      x: 44,
      y,
      size: 12,
      font: bold,
      color: rgb(0.0, 0.48, 0.23),
    });
    y -= 24;
  }

  function keyValue(label, value) {
    page.drawText(`${label}:`, {
      x: 44,
      y,
      size: 10,
      font: bold,
      color: rgb(0.12, 0.16, 0.14),
    });

    drawTextBlock(String(value || "-"), 170, font, 10);
  }

  page.drawText("TGE Asset Snapshot", {
    x: 36,
    y,
    size: 20,
    font: bold,
    color: rgb(0.0, 0.48, 0.23),
  });
  y -= 26;

  drawTextBlock(
    `Generated ${new Date().toLocaleString("en-AU", { hour12: false })}`,
    36,
    font,
    10,
    rgb(0.39, 0.45, 0.42),
  );
  y -= 8;

  section("Asset Details");
  keyValue("Fleet Number", snapshot.vehicle?.assetNumber);
  keyValue("Registration", snapshot.vehicle?.registration);
  keyValue("Vehicle ID", snapshot.vehicle?.vehicleId);
  keyValue("VIN", snapshot.vehicle?.vin);
  keyValue("Make", snapshot.vehicle?.make);
  keyValue("Model", snapshot.vehicle?.model);
  keyValue("Year", snapshot.vehicle?.yearOfManufacture);
  keyValue("Driver", snapshot.hermesStats?.driverName);
  keyValue("Ignition", snapshot.hermesStats?.ignition);
  keyValue("Movement", snapshot.hermesStats?.movement);

  section("Tracking Metrics");
  keyValue("Odometer", snapshot.meters?.odometer);
  keyValue("Engine Hours", snapshot.meters?.engineHours);
  keyValue("Speed", snapshot.hermesStats?.performance?.speed);
  keyValue("RPM", snapshot.hermesStats?.performance?.rpm);
  keyValue("Oil Temperature", snapshot.hermesStats?.performance?.oilTemperature);
  keyValue("Oil Pressure", snapshot.hermesStats?.performance?.oilPressure);
  keyValue("Engine Load", snapshot.hermesStats?.performance?.engineLoad);
  keyValue("Gear", snapshot.hermesStats?.performance?.gear);
  keyValue("Location", snapshot.hermesStats?.location);

  section("Devices");
  keyValue("Tracker IMEI", snapshot.devices?.trackingSystem?.imei);
  keyValue("Tracker Serial", snapshot.devices?.trackingSystem?.serialNumber);
  keyValue("Camera IMEI", snapshot.devices?.camera?.imei);
  keyValue("Camera Serial", snapshot.devices?.camera?.serialNumber);
  keyValue("Tablet IMEI", snapshot.devices?.tablet?.imei);
  keyValue("Tablet Serial", snapshot.devices?.tablet?.serialNumber);

  section("Storage");
  keyValue("SD Overall", snapshot.cameraStats?.overallStatus);
  keyValue("SD Card 1", snapshot.cameraStats?.sdCard1?.present ? "Present" : "Not present");
  keyValue("SD Card 1 Size", snapshot.cameraStats?.sdCard1?.totalSizeDisplay);
  keyValue("SD Card 2", snapshot.cameraStats?.sdCard2?.present ? "Present" : "Not present");
  keyValue("SD Card 2 Size", snapshot.cameraStats?.sdCard2?.totalSizeDisplay);

  return pdf.save();
}

async function handleExportPdf(request, response) {
  const sessionRecord = requireSession(request, response);
  if (!sessionRecord) return;

  const body = await parseBody(request);
  const snapshot = body.snapshot;

  if (!snapshot || !snapshot.vehicle) {
    json(response, 400, { error: "Snapshot data is required." });
    return;
  }

  const bytes = await buildSnapshotPdf(snapshot);
  const filename = `tge-asset-snapshot-${snapshot.vehicle.assetNumber || "snapshot"}.pdf`;
  sendPdf(response, filename, bytes);
}

function handlePing(request, response) {
  json(response, 200, {
    ok: true,
    mode: demoModeEnabled() ? "demo" : "tn360",
    hasKey: Boolean(process.env.TN360_API_KEY),
  });
}

function cleanupSessions() {
  const now = Date.now();
  sessions.forEach((session, token) => {
    if (session.expiresAt < now) {
      sessions.delete(token);
    }
  });
}

async function routeRequest(request, response) {
  cleanupSessions();

  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const pathname = requestUrl.pathname;

  if (request.method === "GET" && pathname === "/") {
    sendFile(response, path.join(ROOT, "index.html"));
    return;
  }

  if (request.method === "GET" && pathname === "/index.html") {
    sendFile(response, path.join(ROOT, "index.html"));
    return;
  }

  if (request.method === "GET" && pathname === "/app.js") {
    sendFile(response, path.join(ROOT, "app.js"));
    return;
  }

  if (request.method === "GET" && pathname === "/api/ping") {
    handlePing(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/login") {
    await handleLogin(request, response);
    return;
  }

  if (request.method === "GET" && pathname === "/api/session") {
    await handleSession(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/logout") {
    await handleLogout(request, response);
    return;
  }

  if (request.method === "GET" && pathname === "/api/approved-users") {
    await handleApprovedUsersGet(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/approved-users") {
    await handleApprovedUsersUpsert(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/approved-users/deactivate") {
    await handleApprovedUsersDeactivate(request, response);
    return;
  }

  if (request.method === "GET" && pathname === "/api/access-history") {
    await handleAccessHistoryGet(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/access-history") {
    await handleAccessHistoryPost(request, response);
    return;
  }

  if (request.method === "GET" && pathname === "/api/tn360-users") {
    await handleTn360Users(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/vehicle-lookup") {
    await handleVehicleLookup(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/vehicle-devices") {
    await handleVehicleDevices(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/vehicle-meters") {
    await handleVehicleMeters(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/hermes-device-stats") {
    await handleHermesDeviceStats(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/camera-device-stats") {
    await handleCameraDeviceStats(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/camera-snapshots") {
    await handleCameraSnapshots(request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/api/export-pdf") {
    await handleExportPdf(request, response);
    return;
  }

  if (request.method === "GET" && pathname.startsWith("/mock-media/")) {
    const key = pathname.split("/").pop();
    const filePath = MEDIA_FILES[key];

    if (!filePath) {
      json(response, 404, { error: "Mock media not found." });
      return;
    }

    sendFile(response, filePath);
    return;
  }

  json(response, 404, { error: "Not found." });
}

ensureDataFiles();

const server = http.createServer((request, response) => {
  routeRequest(request, response).catch((error) => {
    json(response, 500, {
      error: "Server failure",
      detail: error instanceof Error ? error.message : String(error),
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`TGE Asset Snapshot server running at http://${HOST}:${PORT}`);
  if (demoModeEnabled()) {
    console.log("Running in demo mode with local credentials and mock asset data.");
  }
});
