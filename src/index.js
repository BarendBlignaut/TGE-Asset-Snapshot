const SESSION_COOKIE = "tge_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
let _fallbackSecret = null;
function getFallbackSecret() {
  if (!_fallbackSecret) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    _fallbackSecret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return _fallbackSecret;
}

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
    password: "12345678",
  },
];

const accessHistory = [];

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

const ASSET_TRACK_ALLOWED_MODELS = new Set([
  "FLEX SOLAR TRACKER",
  "DMT OYSTER CELLULAR 3",
]);

const DEMO_ASSET_TRACK_VEHICLES = [
  {
    id: "306802",
    name: "1001",
    registration: "TGE-001",
    make: "Isuzu",
    model: "FRR",
    operationalVehicleModel: {
      yearOfManufacture: 2022,
    },
  },
  {
    id: "388728",
    name: "1002",
    registration: "TGE-002",
    make: "Hino",
    model: "500 Series",
    operationalVehicleModel: {
      yearOfManufacture: 2021,
    },
  },
];

const DEMO_ASSET_TRACK_DEVICES = [
  {
    id: "413919",
    status: "ENABLED",
    vehicleId: "306802",
    model: { name: "Flex Solar Tracker" },
    imei: "015262004121066",
    deviceStats: {
      odometer: 121247.365,
      ignition: "OFF",
      shutdownOdo: 0,
      movement: "Stationary",
      batteryStatus: "Good",
      batteryStatusAt: "2026-05-17T07:57:11.000+10:00",
    },
  },
  {
    id: "631562",
    status: "ENABLED",
    vehicleId: "388728",
    model: { name: "DMT Oyster Cellular 3" },
    imei: "350976658052433",
    deviceStats: {
      odometer: 31576.696,
      ignition: "OFF",
      shutdownOdo: 0,
      movement: "Stationary",
      batteryStatus: "Low",
      batteryStatusAt: "2026-05-12T12:18:09.000+10:00",
    },
  },
];

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function pdfResponse(bytes, filename) {
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


const EXCLUDED_VPM_KEYS = new Set([
  "gear",
  "charge",
  "gps",
  "at",
  "lng",
  "engineload",
  "alt",
  "dir",
  "nsat",
  "hdop",
  "lat",
  "spd",
  "id",
]);

function safeParseJsonString(value) {
  if (!value || typeof value !== "string") return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formatVpmValue(value) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  if (typeof value === "number") {
    const normalized = value < 0 ? 0 : value;
    return normalized.toFixed(2);
  }

  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : "N/A";
  }

  return "N/A";
}

function extractAllowedVpmFields(lastVpmRaw) {
  const parsed = typeof lastVpmRaw === "string" ? safeParseJsonString(lastVpmRaw) : lastVpmRaw;
  if (!isPlainObject(parsed)) {
    return {};
  }

  const result = {};

  for (const [key, value] of Object.entries(parsed)) {
    const normalizedKey = String(key || "").trim().toLowerCase();

    if (!normalizedKey || EXCLUDED_VPM_KEYS.has(normalizedKey)) {
      continue;
    }

    if (isPlainObject(value) || Array.isArray(value)) {
      continue;
    }

    result[key] = formatVpmValue(value);
  }

  return result;
}

function parseCookies(request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  return cookieHeader.split(";").reduce((accumulator, pair) => {
    const [rawKey, ...rawValue] = pair.trim().split("=");
    if (!rawKey) return accumulator;
    accumulator[rawKey] = decodeURIComponent(rawValue.join("="));
    return accumulator;
  }, {});
}

function publicUser(user) {
  const { password, ...rest } = user;
  return rest;
}

function addAccessHistory(username, assetRequested) {
  accessHistory.unshift({
    username,
    dateTime: new Date().toISOString(),
    assetRequested,
  });
}

function isDemoMode(env) {
  return !env.TN360_API_KEY;
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeText(text) {
  return base64UrlEncodeBytes(new TextEncoder().encode(text));
}

function base64UrlDecodeText(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function importSessionKey(env) {
  const secret = env.SESSION_SECRET || getFallbackSecret();
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signSessionValue(value, env) {
  const key = await importSessionKey(env);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

async function createSessionToken(user, env) {
  const payload = {
    user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncodeText(JSON.stringify(payload));
  const signature = await signSessionValue(encodedPayload, env);
  return `${encodedPayload}.${signature}`;
}

async function readSessionFromRequest(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];

  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = await signSessionValue(encodedPayload, env);
  if (signature !== expectedSignature) return null;

  let payload;
  try {
    payload = JSON.parse(base64UrlDecodeText(encodedPayload));
  } catch {
    return null;
  }

  if (!payload?.user || !payload?.exp) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload.user;
}

function sessionCookieHeader(token) {
  return {
    "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`,
  };
}

function clearSessionCookie() {
  return {
    "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  };
}

async function requireSession(request, env) {
  const user = await readSessionFromRequest(request, env);

  if (!user) {
    return {
      ok: false,
      response: jsonResponse({ error: "You are not signed in." }, 401, clearSessionCookie()),
    };
  }

  return {
    ok: true,
    user,
  };
}

async function requireAdmin(request, env) {
  const sessionCheck = await requireSession(request, env);
  if (!sessionCheck.ok) return sessionCheck;

  if (sessionCheck.user.role !== "admin") {
    return {
      ok: false,
      response: jsonResponse({ error: "Admin access is required." }, 403),
    };
  }

  return sessionCheck;
}

function demoImageDataUrl(label, tone) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${tone[0]}"/>
          <stop offset="100%" stop-color="${tone[1]}"/>
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#g)"/>
      <rect x="40" y="40" width="1200" height="640" rx="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)"/>
      <text x="640" y="350" text-anchor="middle" fill="white" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="700">${label}</text>
      <text x="640" y="410" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-family="Arial, Helvetica, sans-serif" font-size="24">Demo camera image</text>
    </svg>
  `.trim();

  const encoded = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${encoded}`;
}

function demoSnapshotEvents() {
  const mediaFiles = [
    {
      source: "ROAD_FACING",
      mediaFile: demoImageDataUrl("Road Facing", ["#315f45", "#8eb79d"]),
      imageDetails: { sources: ["ROAD"] },
    },
    {
      source: "DRIVER_FACING",
      mediaFile: demoImageDataUrl("Driver Facing", ["#4b4a6d", "#9fa0c8"]),
      imageDetails: { sources: ["DRIVER"] },
    },
    {
      source: "IN_CAB",
      mediaFile: demoImageDataUrl("In-Cab Driver", ["#68493d", "#c7a18f"]),
      imageDetails: { sources: ["TVI2"] },
    },
    {
      source: "DRIVER_EXTERNAL",
      mediaFile: demoImageDataUrl("Driver External", ["#2e5665", "#87b5c7"]),
      imageDetails: { sources: ["TVI1"] },
    },
    {
      source: "LEFT_EXTERNAL",
      mediaFile: demoImageDataUrl("Left External", ["#465d2f", "#9eb97c"]),
      imageDetails: { sources: ["UVC"] },
    },
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

function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildSimplePdf(snapshot) {
  const lines = [
    "TGE Asset Snapshot",
    "",
    `Generated: ${new Date().toLocaleString("en-AU", { hour12: false })}`,
    "",
    "Asset Details",
    `Fleet Number: ${snapshot.vehicle?.assetNumber || "-"}`,
    `Registration: ${snapshot.vehicle?.registration || "-"}`,
    `Vehicle ID: ${snapshot.vehicle?.vehicleId || "-"}`,
    `VIN: ${snapshot.vehicle?.vin || "-"}`,
    `Make: ${snapshot.vehicle?.make || "-"}`,
    `Model: ${snapshot.vehicle?.model || "-"}`,
    `Year: ${snapshot.vehicle?.yearOfManufacture || "-"}`,
    `Driver: ${snapshot.hermesStats?.driverName || "-"}`,
    `Ignition: ${snapshot.hermesStats?.ignition ?? "-"}`,
    `Movement: ${snapshot.hermesStats?.movement ?? "-"}`,
    "",
    "Tracking Metrics",
    `Odometer: ${snapshot.meters?.odometer ?? "-"}`,
    `Engine Hours: ${snapshot.meters?.engineHours ?? "-"}`,
    `Speed: ${snapshot.hermesStats?.performance?.speed ?? "-"}`,
    `RPM: ${snapshot.hermesStats?.performance?.rpm ?? "-"}`,
    `Oil Temperature: ${snapshot.hermesStats?.performance?.oilTemperature ?? "-"}`,
    `Oil Pressure: ${snapshot.hermesStats?.performance?.oilPressure ?? "-"}`,
    `Engine Load: ${snapshot.hermesStats?.performance?.engineLoad ?? "-"}`,
    `Gear: ${snapshot.hermesStats?.performance?.gear ?? "-"}`,
    `Location: ${snapshot.hermesStats?.location || "-"}`,
    "",
    "Devices",
    `Tracker IMEI: ${snapshot.devices?.trackingSystem?.imei || "-"}`,
    `Tracker Serial: ${snapshot.devices?.trackingSystem?.serialNumber || "-"}`,
    `Camera IMEI: ${snapshot.devices?.camera?.imei || "-"}`,
    `Camera Serial: ${snapshot.devices?.camera?.serialNumber || "-"}`,
    `Tablet IMEI: ${snapshot.devices?.tablet?.imei || "-"}`,
    `Tablet Serial: ${snapshot.devices?.tablet?.serialNumber || "-"}`,
    "",
    "Storage",
    `Overall Status: ${snapshot.cameraStats?.overallStatus || "-"}`,
    `SD Card 1: ${snapshot.cameraStats?.sdCard1?.present ? "Present" : "Not present"}`,
    `SD Card 1 Size: ${snapshot.cameraStats?.sdCard1?.totalSizeDisplay || "-"}`,
    `SD Card 2: ${snapshot.cameraStats?.sdCard2?.present ? "Present" : "Not present"}`,
    `SD Card 2 Size: ${snapshot.cameraStats?.sdCard2?.totalSizeDisplay || "-"}`,
  ];

  let y = 800;
  const content = lines
    .map((line, index) => {
      const fontSize = index === 0 ? 18 : line === "" ? 10 : 11;
      if (line === "") {
        y -= 10;
        return "";
      }
      const command = `BT /F1 ${fontSize} Tf 40 ${y} Td (${escapePdfText(line)}) Tj ET`;
      y -= fontSize + 6;
      return command;
    })
    .filter(Boolean)
    .join("\n");

  const objects = [];
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
  objects.push("3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj");
  objects.push("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");
  objects.push(`5 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += `${object}\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

async function fetchJsonFromTn360(url) {
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`TN360 request failed. HTTP ${response.status}. ${body}`);
  }

  return response.json();
}

function isDriverUser(tnUser) {
  const roles = Array.isArray(tnUser.roles) ? tnUser.roles : [];

  return roles.some((role) => {
    const roleName = String(role.name || "").toLowerCase();
    const features = Array.isArray(role.features) ? role.features : [];
    return roleName === "driver" || features.includes("DRIVER");
  });
}

function buildVehicleIdentity(vehicle, hermesDevice) {
  return {
    fleetNumber: vehicle?.name || "N/A",
    registration: vehicle?.registration || "N/A",
    make: vehicle?.operationalVehicleModel?.make || vehicle?.make || "N/A",
    model: vehicle?.operationalVehicleModel?.model || vehicle?.model || "N/A",
    yearOfManufacture:
      vehicle?.operationalVehicleModel?.yearOfManufacture ?? vehicle?.yearOfManufacture ?? "N/A",
    vehicleId: vehicle?.id ?? "N/A",
    hermesImei: hermesDevice?.imei || hermesDevice?.serialNumber || "N/A",
  };
}

function buildVpmRow(vehicle, hermesDevice, lastVpmRaw, status = "Matched", errorMessage = "") {
  return {
    ...buildVehicleIdentity(vehicle, hermesDevice),
    status,
    errorMessage: errorMessage || "",
    vpm: extractAllowedVpmFields(lastVpmRaw),
  };
}
  
async function handleLogin(request, env) {
  const body = await safeJson(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();

  if (!username || !password) {
    return jsonResponse({ error: "Username and password are required." }, 400);
  }

  const approvedUser = approvedUsers.find(
    (user) => user.username.toLowerCase() === username.toLowerCase(),
  );

  if (!approvedUser || approvedUser.status !== "active") {
    return jsonResponse({ error: "Access denied. Please contact Telematics." }, 401);
  }

  let sessionUser;

  if (isDemoMode(env)) {
    if (approvedUser.password !== password) {
      return jsonResponse({ error: "Access denied. Invalid username or password." }, 401);
    }

    sessionUser = {
      username: approvedUser.username,
      role: approvedUser.role,
      firstName: approvedUser.firstName,
      lastName: approvedUser.lastName,
      mode: "demo",
    };
  } else {
    const usersUrl = `https://api-au.telematics.com/v1/users/?key=${env.TN360_API_KEY}&pruning=B2B`;
    const users = await fetchJsonFromTn360(usersUrl);

    const matchedUser = users.find(
      (user) => String(user.username || "").toLowerCase() === username.toLowerCase(),
    );

    if (!matchedUser || matchedUser.status !== "ENABLED" || !isDriverUser(matchedUser)) {
      return jsonResponse({ error: "Access denied. Please contact Telematics." }, 401);
    }

    if (String(matchedUser.externalPin || "") !== password) {
      return jsonResponse({ error: "Access denied. Invalid username or password." }, 401);
    }

    sessionUser = {
      username: approvedUser.username,
      role: approvedUser.role,
      firstName: matchedUser.firstName,
      lastName: matchedUser.lastName,
      mode: "tn360",
    };
  }

  const token = await createSessionToken(sessionUser, env);
  addAccessHistory(sessionUser.username, "Login only");

  return jsonResponse({ user: sessionUser }, 200, sessionCookieHeader(token));
}

async function handleSession(request, env) {
  const sessionCheck = await requireSession(request, env);
  if (!sessionCheck.ok) return sessionCheck.response;

  return jsonResponse({ user: sessionCheck.user });
}

async function handleLogout() {
  return jsonResponse({ ok: true }, 200, clearSessionCookie());
}

async function handleApprovedUsersGet(request, env) {
  const adminCheck = await requireAdmin(request, env);
  if (!adminCheck.ok) return adminCheck.response;

  return jsonResponse(approvedUsers.map(publicUser));
}

async function handleApprovedUsersUpsert(request, env) {
  const adminCheck = await requireAdmin(request, env);
  if (!adminCheck.ok) return adminCheck.response;

  const body = await safeJson(request);
  const username = String(body.username || "").trim();

  if (!username) {
    return jsonResponse({ error: "Username is required." }, 400);
  }

  const existingUser = approvedUsers.find(
    (user) => user.username.toLowerCase() === username.toLowerCase(),
  );

  const now = new Date().toISOString();
  const currentUsername = adminCheck.user.username;

  if (existingUser) {
    existingUser.firstName = String(body.firstName || existingUser.firstName || "").trim();
    existingUser.lastName = String(body.lastName || existingUser.lastName || "").trim();
    existingUser.role = String(body.role || existingUser.role || "user").trim();
    existingUser.status = String(body.status || existingUser.status || "active").trim();
    existingUser.updatedBy = currentUsername;
    existingUser.updatedDate = now;

    if (String(body.password || "").trim()) {
      existingUser.password = String(body.password).trim();
    }
  } else {
    approvedUsers.push({
      firstName: String(body.firstName || "").trim(),
      lastName: String(body.lastName || "").trim(),
      username,
      role: String(body.role || "user").trim(),
      status: String(body.status || "active").trim(),
      createdBy: currentUsername,
      createdDate: now,
      updatedBy: currentUsername,
      updatedDate: now,
      password: String(body.password || "").trim(),
    });
  }

  return jsonResponse({ ok: true });
}

async function handleApprovedUsersDeactivate(request, env) {
  const adminCheck = await requireAdmin(request, env);
  if (!adminCheck.ok) return adminCheck.response;

  const body = await safeJson(request);
  const username = String(body.username || "").trim();

  const user = approvedUsers.find(
    (item) => item.username.toLowerCase() === username.toLowerCase(),
  );

  if (!user) {
    return jsonResponse({ error: "Approved user not found." }, 404);
  }

  user.status = "inactive";
  user.updatedBy = adminCheck.user.username;
  user.updatedDate = new Date().toISOString();

  return jsonResponse({ ok: true });
}

async function handleAccessHistoryGet(request, env) {
  const adminCheck = await requireAdmin(request, env);
  if (!adminCheck.ok) return adminCheck.response;

  return jsonResponse(accessHistory);
}

async function handleAccessHistoryPost(request, env) {
  const sessionCheck = await requireSession(request, env);
  if (!sessionCheck.ok) return sessionCheck.response;

  const body = await safeJson(request);
  const assetRequested = String(body.assetRequested || "").trim();

  if (!assetRequested) {
    return jsonResponse({ error: "Asset requested is required." }, 400);
  }

  addAccessHistory(sessionCheck.user.username, assetRequested);
  return jsonResponse({ ok: true });
}

async function handleTn360Users(request, env) {
  const sessionCheck = await requireSession(request, env);
  if (!sessionCheck.ok) return sessionCheck.response;

  if (isDemoMode(env)) {
    return jsonResponse({
      username: "bare1234",
      status: "ENABLED",
      firstName: "Barend",
      lastName: "Blignaut",
      roles: [{ name: "driver", features: ["DRIVER"] }],
      externalPin: "1234",
    });
  }

  const url = new URL(request.url);
  const username = String(url.searchParams.get("username") || "").trim();

  if (!username) {
    return jsonResponse({ error: "Username is required." }, 400);
  }

  const usersUrl = `https://api-au.telematics.com/v1/users/?key=${env.TN360_API_KEY}&pruning=B2B`;
  const users = await fetchJsonFromTn360(usersUrl);

  const matchedUser = users.find(
    (user) => String(user.username || "").toLowerCase() === username.toLowerCase(),
  );

  if (!matchedUser) {
    return jsonResponse({ error: "TN360 user not found." }, 404);
  }

  return jsonResponse(matchedUser);
}

async function handleVehicleLookup(request, env) {
  const sessionCheck = await requireSession(request, env);
  if (!sessionCheck.ok) return sessionCheck.response;

  const body = await safeJson(request);
  const assetNumber = String(body.assetNumber || "").trim();
  const searchValue = assetNumber.replace(/\s+/g, "").toLowerCase();

  if (!assetNumber) {
    return jsonResponse({ error: "Asset number is required." }, 400);
  }

  if (isDemoMode(env)) {
    const demoValue = DEMO_VEHICLE.name.replace(/\s+/g, "").toLowerCase();
    if (demoValue !== searchValue) {
      return jsonResponse({ error: "Asset not found." }, 404);
    }
    return jsonResponse(DEMO_VEHICLE);
  }

  const vehiclesUrl = `https://api-au.telematics.com/v1/vehicles/?key=${env.TN360_API_KEY}&pruning=B2B`;
  const vehicles = await fetchJsonFromTn360(vehiclesUrl);

  const matchedVehicle = vehicles.find((vehicle) => {
    const vehicleName = String(vehicle.name || "").replace(/\s+/g, "").toLowerCase();
    return vehicleName === searchValue;
  });

  if (!matchedVehicle) {
    return jsonResponse({ error: "Asset not found." }, 404);
  }

  return jsonResponse(matchedVehicle);
}

async function handleVehicleDevices(request, env) {
  const sessionCheck = await requireSession(request, env);
  if (!sessionCheck.ok) return sessionCheck.response;

  const body = await safeJson(request);
  const vehicleId = String(body.vehicleId || "").trim();

  if (!vehicleId) {
    return jsonResponse({ error: "Vehicle ID is required." }, 400);
  }

  if (isDemoMode(env)) {
    return jsonResponse(DEMO_DEVICES);
  }

  const devicesUrl = `https://api-au.telematics.com/v1/vehicles/${vehicleId}/devices?key=${env.TN360_API_KEY}&pruning=B2B`;
  return jsonResponse(await fetchJsonFromTn360(devicesUrl));
}

async function handleVehicleMeters(request, env) {
  const sessionCheck = await requireSession(request, env);
  if (!sessionCheck.ok) return sessionCheck.response;

  const body = await safeJson(request);
  const vehicleId = String(body.vehicleId || "").trim();

  if (!vehicleId) {
    return jsonResponse({ error: "Vehicle ID is required." }, 400);
  }

  if (isDemoMode(env)) {
    return jsonResponse(DEMO_METERS);
  }

  const metersUrl = `https://api-au.telematics.com/v1/vehicles/${vehicleId}/meters?key=${env.TN360_API_KEY}&pruning=B2B`;
  return jsonResponse(await fetchJsonFromTn360(metersUrl));
}

async function handleHermesDeviceStats(request, env) {
  const sessionCheck = await requireSession(request, env);
  if (!sessionCheck.ok) return sessionCheck.response;

  const body = await safeJson(request);
  const trackerId = String(body.trackerId || "").trim();

  if (!trackerId) {
    return jsonResponse({ error: "Tracker ID is required." }, 400);
  }

  if (isDemoMode(env)) {
    return jsonResponse(DEMO_HERMES_DEVICE);
  }

  const deviceUrl =
    `https://api-au.telematics.com/v1/devices/${encodeURIComponent(trackerId)}` +
    `?key=${env.TN360_API_KEY}&pruning=B2B&embed=devicestats`;

  const response = await fetch(deviceUrl);

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    return jsonResponse(
      {
        error: `HERMES device stats lookup failed. HTTP ${response.status}`,
        detail: responseText || "No response body returned from HERMES device endpoint.",
        request: {
          trackerId,
          deviceUrl,
        },
      },
      502,
    );
  }

  const device = await response.json();
  return jsonResponse(device);
}

async function handleCameraDeviceStats(request, env) {
  const sessionCheck = await requireSession(request, env);
  if (!sessionCheck.ok) return sessionCheck.response;

  const body = await safeJson(request);
  const cameraId = String(body.cameraId || "").trim();

  if (!cameraId) {
    return jsonResponse({ error: "Camera ID is required." }, 400);
  }

  if (isDemoMode(env)) {
    return jsonResponse(DEMO_CAMERA_DEVICE);
  }

  const deviceUrl =
  `https://api-au.telematics.com/v1/devices/${encodeURIComponent(cameraId)}` +
  `?key=${env.TN360_API_KEY}&pruning=B2B&embed=devicestats`;

const response = await fetch(deviceUrl);

if (!response.ok) {
  const responseText = await response.text().catch(() => "");
  return jsonResponse(
    {
      error: `Camera device stats lookup failed. HTTP ${response.status}`,
      detail: responseText || "No response body returned from camera device endpoint.",
      request: {
        cameraId,
        deviceUrl,
      },
    },
    502,
  );
}

const device = await response.json();
return jsonResponse(device);
}

async function handleCameraSnapshots(request, env) {
  const sessionCheck = await requireSession(request, env);
  if (!sessionCheck.ok) return sessionCheck.response;

  const body = await safeJson(request);
  const vehicleId = String(body.vehicleId || "").trim();

  if (!vehicleId) {
    return jsonResponse({ error: "Vehicle ID is required." }, 400);
  }

  if (isDemoMode(env)) {
    return jsonResponse(demoSnapshotEvents());
  }

  const eventsUrl =
    `https://api-au.telematics.com/v1/events?types=camera&pruning=B2B&key=${env.TN360_API_KEY}`;

  const response = await fetch(eventsUrl);

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    return jsonResponse(
      {
        error: `Camera snapshot lookup failed. HTTP ${response.status}`,
        detail: responseText || "No response body returned from TN360 events endpoint.",
        request: {
          vehicleId,
          eventsUrl,
        },
      },
      502,
    );
  }

  const events = await response.json();

  const matchedEvents = Array.isArray(events)
    ? events.filter((event) => String(event.vehicleId || "") === vehicleId)
    : [];

  return jsonResponse(matchedEvents);
}

function isAllowedAssetTrackModel(device) {
  const modelName = String(device?.model?.name || "").trim().toUpperCase();
  return ASSET_TRACK_ALLOWED_MODELS.has(modelName);
}

function buildAssetTrackVehicleMap(vehicles) {
  return new Map(
    (Array.isArray(vehicles) ? vehicles : []).map((vehicle) => [String(vehicle?.id ?? ""), vehicle]),
  );
}

function buildAssetTrackRow(device, vehicle, status) {
  const operationalModel = vehicle?.operationalVehicleModel || {};
  const deviceStats = device?.deviceStats || {};
  const trackerModel = String(device?.model?.name || "").trim().toUpperCase();
  const batteryStatus = trackerModel === "FLEX SOLAR TRACKER"
    ? "ST"
    : (deviceStats.batteryStatus ?? "");

  return {
    fleetNumber: vehicle?.name || "",
    vehicleSystemId: vehicle?.id ?? device?.vehicleId ?? "",
    make: operationalModel.make || vehicle?.make || "",
    model: operationalModel.model || vehicle?.model || "",
    yearManufacture: operationalModel.yearOfManufacture ?? vehicle?.yearOfManufacture ?? "",
    odometer: deviceStats.odometer ?? "",
    shutdownOdo: deviceStats.shutdownOdo ?? "",
    ignition: deviceStats.ignition ?? "",
    movement: deviceStats.movement ?? "",
    batteryStatus,
    batteryStatusAt: deviceStats.batteryStatusAt ?? "",
    imei: device?.imei || device?.serialNumber || "",
    status,
  };
}

function buildAssetTrackErrorRow(imei, status) {
  return buildAssetTrackRow({ imei, deviceStats: {} }, null, status);
}

async function fetchAssetTrackVehiclesAndDevices(env) {
  if (isDemoMode(env)) {
    return {
      vehicles: DEMO_ASSET_TRACK_VEHICLES,
      devices: DEMO_ASSET_TRACK_DEVICES,
    };
  }

  const vehiclesUrl = `https://api-au.telematics.com/v1/vehicles?key=${env.TN360_API_KEY}&pruning=B2B`;
  const devicesUrl =
    `https://api-au.telematics.com/v1/devices/?key=${env.TN360_API_KEY}` +
    `&pruning=B2B&embed=devicestats`;

  const [vehicles, devices] = await Promise.all([
    fetchJsonFromTn360(vehiclesUrl),
    fetchJsonFromTn360(devicesUrl),
  ]);

  return {
    vehicles: Array.isArray(vehicles) ? vehicles : [],
    devices: Array.isArray(devices) ? devices : [],
  };
}

async function handleAssetTrackUser(request, env) {
  const sessionCheck = await requireSession(request, env);
  if (!sessionCheck.ok) return sessionCheck.response;

  const body = await safeJson(request);
  const imeis = [...new Set(
    (Array.isArray(body.imeis) ? body.imeis : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  )];

  if (!imeis.length) {
    return jsonResponse({ error: "At least one IMEI is required." }, 400);
  }

  const limit = sessionCheck.user.role === "admin" ? 2000 : 20;
  if (imeis.length > limit) {
    return jsonResponse({ error: `This user can run up to ${limit} IMEIs at a time.` }, 400);
  }

  const { vehicles, devices } = await fetchAssetTrackVehiclesAndDevices(env);
  const vehicleMap = buildAssetTrackVehicleMap(vehicles);
  const deviceMap = new Map(
    devices.map((device) => [String(device?.imei || "").trim(), device]),
  );

  const rows = imeis.map((imei) => {
    const device = deviceMap.get(imei);
    if (!device) return buildAssetTrackErrorRow(imei, "IMEI not found");
    if (String(device?.status || "").toUpperCase() !== "ENABLED") return buildAssetTrackErrorRow(imei, "Inactive hardware");
    if (!isAllowedAssetTrackModel(device)) return buildAssetTrackErrorRow(imei, "Unsupported device model");
    if (!device?.vehicleId) return buildAssetTrackErrorRow(imei, "Not linked to asset");

    const vehicle = vehicleMap.get(String(device.vehicleId));
    if (!vehicle) return buildAssetTrackErrorRow(imei, "Vehicle not found");

    return buildAssetTrackRow(device, vehicle, "Matched");
  });

  return jsonResponse({
    rows,
    summary: `${rows.length} IMEI request${rows.length === 1 ? "" : "s"} processed.`,
  });
}

async function handleAssetTrackFleet(request, env) {
  const sessionCheck = await requireSession(request, env);
  if (!sessionCheck.ok) return sessionCheck.response;

  const { vehicles, devices } = await fetchAssetTrackVehiclesAndDevices(env);
  const vehicleMap = buildAssetTrackVehicleMap(vehicles);

  const rows = devices
    .filter((device) =>
      String(device?.status || "").toUpperCase() === "ENABLED" &&
      Boolean(device?.vehicleId) &&
      isAllowedAssetTrackModel(device),
    )
    .map((device) => {
      const vehicle = vehicleMap.get(String(device.vehicleId));
      return vehicle
        ? buildAssetTrackRow(device, vehicle, "Matched")
        : buildAssetTrackErrorRow(device?.imei || device?.serialNumber || "", "Vehicle not found");
    });

  return jsonResponse({
    rows,
    summary: `${rows.length} fleet-linked asset tracker${rows.length === 1 ? "" : "s"} returned.`,
  });
}
  
async function handleVpmUserInput(request, env) {
  const sessionCheck = await requireSession(request, env);
  if (!sessionCheck.ok) return sessionCheck.response;

  const body = await safeJson(request);
  const imeis = Array.isArray(body.imeis) ? body.imeis : [];

  const cleanedImeis = [...new Set(
    imeis.map((item) => String(item || "").trim()).filter(Boolean),
  )];

  if (!cleanedImeis.length) {
    return jsonResponse({ error: "At least one IMEI is required." }, 400);
  }

  if (isDemoMode(env)) {
    return handleVpmUserInputDemo(cleanedImeis);
  }

  const vehiclesUrl = `https://api-au.telematics.com/v1/vehicles?key=${env.TN360_API_KEY}&pruning=B2B`;
  const vehicles = await fetchJsonFromTn360(vehiclesUrl);
  const vehicleList = Array.isArray(vehicles) ? vehicles : [];

  const rows = [];
  const discoveredKeys = new Set();
  let apiCallCount = 0;

  for (const imei of cleanedImeis) {
    try {
      const deviceUrl =
        `https://api-au.telematics.com/v1/devices/${encodeURIComponent(imei)}` +
        `?key=${env.TN360_API_KEY}&pruning=B2B&embed=devicestats`;

      const device = await fetchJsonFromTn360(deviceUrl);
      apiCallCount++;

      if (String(device?.type?.code || "").toUpperCase() !== "HERMES") {
        rows.push(buildEmptyVpmRow(imei, "Not HERMES", "Device is not a HERMES type."));
        continue;
      }

      if (!device?.vehicleId) {
        rows.push(buildEmptyVpmRow(imei, "No Vehicle", "HERMES device is not assigned to a vehicle."));
        continue;
      }

      const vehicle = vehicleList.find(
        (v) => String(v?.id ?? "") === String(device.vehicleId ?? ""),
      );

      if (!vehicle) {
        rows.push(buildEmptyVpmRow(imei, "No Vehicle Match", "Vehicle ID not found in fleet list."));
        continue;
      }

      const lastVpmRaw = device?.deviceStats?.lastVpm || null;
      const row = buildVpmRow(vehicle, device, lastVpmRaw, "Matched", "");

      Object.keys(row.vpm).forEach((key) => discoveredKeys.add(key));
      rows.push(row);
    } catch (error) {
      apiCallCount++;
      rows.push(buildEmptyVpmRow(imei, "API Failed", error instanceof Error ? error.message : String(error)));
    }
  }

  const dynamicColumns = [...discoveredKeys].sort((a, b) => a.localeCompare(b));

  return jsonResponse({
    mode: "user-input",
    summary: {
      queriesSelected: cleanedImeis.length,
      queriesRun: rows.length,
      dynamicFieldCount: dynamicColumns.length,
    },
    columns: dynamicColumns,
    rows,
  });
}

function handleVpmUserInputDemo(cleanedImeis) {
  const demoImei = DEMO_DEVICES.find((d) => d.type?.code === "HERMES")?.imei || "";
  const rows = [];
  const discoveredKeys = new Set();

  for (const imei of cleanedImeis) {
    if (imei === demoImei) {
      const row = buildVpmRow(DEMO_VEHICLE, DEMO_DEVICES[0], DEMO_HERMES_DEVICE.deviceStats.lastVpm, "Matched", "");
      Object.keys(row.vpm).forEach((key) => discoveredKeys.add(key));
      rows.push(row);
    } else {
      rows.push({
        fleetNumber: "N/A",
        registration: "N/A",
        make: "N/A",
        model: "N/A",
        yearOfManufacture: "N/A",
        vehicleId: "N/A",
        hermesImei: imei,
        status: "No HERMES Match",
        errorMessage: "No active HERMES device matched the supplied IMEI.",
        vpm: {},
      });
    }
  }

  const dynamicColumns = [...discoveredKeys].sort((a, b) => a.localeCompare(b));

  return jsonResponse({
    mode: "user-input",
    summary: {
      queriesSelected: cleanedImeis.length,
      queriesRun: rows.length,
      dynamicFieldCount: dynamicColumns.length,
    },
    columns: dynamicColumns,
    rows,
  });
}

async function handleVpmFleetImeis(request, env) {
  const sessionCheck = await requireSession(request, env);
  if (!sessionCheck.ok) return sessionCheck.response;

  if (isDemoMode(env)) {
    const demoImei = DEMO_DEVICES.find((d) => d.type?.code === "HERMES")?.imei || "";
    return jsonResponse({ imeis: demoImei ? [demoImei] : [] });
  }

  const devicesUrl = `https://api-au.telematics.com/v1/devices?key=${env.TN360_API_KEY}&pruning=B2B`;
  const devices = await fetchJsonFromTn360(devicesUrl);

  const hermesImeis = Array.isArray(devices)
    ? devices
        .filter((d) => String(d?.type?.code || "").toUpperCase() === "HERMES" && d?.vehicleId)
        .map((d) => String(d.imei || "").trim())
        .filter(Boolean)
    : [];

  return jsonResponse({ imeis: hermesImeis });
}
  
async function handleExportPdf(request, env) {
  const sessionCheck = await requireSession(request, env);
  if (!sessionCheck.ok) return sessionCheck.response;

  const body = await safeJson(request);
  const snapshot = body.snapshot;

  if (!snapshot || !snapshot.vehicle) {
    return jsonResponse({ error: "Snapshot data is required." }, 400);
  }

  const pdfBytes = buildSimplePdf(snapshot);
  const filename = `tge-asset-snapshot-${snapshot.vehicle.assetNumber || "snapshot"}.pdf`;

  return pdfResponse(pdfBytes, filename);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/api/ping") {
        return jsonResponse({
          ok: true,
          mode: isDemoMode(env) ? "demo" : "tn360",
          hasKey: Boolean(env.TN360_API_KEY),
        });
      }

      if (request.method === "POST" && url.pathname === "/api/login") {
        return handleLogin(request, env);
      }

      if (request.method === "GET" && url.pathname === "/api/session") {
        return handleSession(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/logout") {
        return handleLogout();
      }

      if (request.method === "GET" && url.pathname === "/api/approved-users") {
        return handleApprovedUsersGet(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/approved-users") {
        return handleApprovedUsersUpsert(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/approved-users/deactivate") {
        return handleApprovedUsersDeactivate(request, env);
      }

      if (request.method === "GET" && url.pathname === "/api/access-history") {
        return handleAccessHistoryGet(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/access-history") {
        return handleAccessHistoryPost(request, env);
      }

      if (request.method === "GET" && url.pathname === "/api/tn360-users") {
        return handleTn360Users(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/vehicle-lookup") {
        return handleVehicleLookup(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/vehicle-devices") {
        return handleVehicleDevices(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/vehicle-meters") {
        return handleVehicleMeters(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/hermes-device-stats") {
        return handleHermesDeviceStats(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/camera-device-stats") {
        return handleCameraDeviceStats(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/camera-snapshots") {
        return handleCameraSnapshots(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/asset-track-user") {
        return handleAssetTrackUser(request, env);
      }

      if (request.method === "GET" && url.pathname === "/api/asset-track-fleet") {
        return handleAssetTrackFleet(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/vpm-user-input") {
        return handleVpmUserInput(request, env);
      }

      if (request.method === "GET" && url.pathname === "/api/vpm-fleet-imeis") {
        return handleVpmFleetImeis(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/export-pdf") {
        return handleExportPdf(request, env);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return jsonResponse(
        {
          error: "Worker runtime failure",
          detail: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  },
};
