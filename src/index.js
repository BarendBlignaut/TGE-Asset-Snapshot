function jsonResponse(data, status = 200) {
return new Response(JSON.stringify(data), {
status,
headers: {
"Content-Type": "application/json",
"Cache-Control": "no-store",
},
});
}

function requireEnv(env) {
if (!env.TN360_API_KEY) {
throw new Error("Missing TN360_API_KEY");
}
}

function normalizeValue(value) {
return String(value || "").trim().toLowerCase();
}

function tn360Headers(env) {
  return {
    Accept: "application/json",
    "X-API-Key": env.TN360_API_KEY,
  };
}

function formatDateOnly(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function handleTn360Users(request, env) {
requireEnv(env);

@@ -183,8 +197,10 @@
return jsonResponse({ error: "Camera ID is required." }, 400);
}

  const devicesUrl = `https://api-au.telematics.com/v1/devices/?key=${env.TN360_API_KEY}&pruning=B2B`;
  const response = await fetch(devicesUrl);
  const devicesUrl = "https://api-au.telematics.com/v1/devices/?pruning=B2B";
  const response = await fetch(devicesUrl, {
    headers: tn360Headers(env),
  });

if (!response.ok) {
return jsonResponse(
@@ -201,8 +217,14 @@
const deviceId = normalizeValue(device?.id);
const imei = normalizeValue(device?.imei);
const serialNumber = normalizeValue(device?.serialNumber);
    const modelName = normalizeValue(device?.model?.name);

    return typeCode === "camera" && (
    const looksLikeCamera =
      typeCode === "camera" ||
      typeCode === "iqcamera" ||
      modelName.includes("camera");

    return looksLikeCamera && (
deviceId === searchValue ||
imei === searchValue ||
serialNumber === searchValue
@@ -216,6 +238,52 @@
return jsonResponse(matchedDevice);
}

async function handleCameraSnapshots(request, env) {
  requireEnv(env);

  const body = await request.json();
  const vehicleId = String(body.vehicleId || "").trim();

  if (!vehicleId) {
    return jsonResponse({ error: "Vehicle ID is required." }, 400);
  }

  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 6);

  const fromDate = formatDateOnly(from);
  const toDate = formatDateOnly(now);

  const eventsUrl = new URL("https://api-au.telematics.com/v1/events");
  eventsUrl.searchParams.set("types", "camera");
  eventsUrl.searchParams.set("from", fromDate);
  eventsUrl.searchParams.set("to", toDate);

  const response = await fetch(eventsUrl.toString(), {
    headers: tn360Headers(env),
  });

  if (!response.ok) {
    return jsonResponse(
      { error: `Camera snapshot lookup failed. HTTP ${response.status}` },
      502,
    );
  }

  const events = await response.json();
  const searchVehicleId = normalizeValue(vehicleId);

  const matchedEvents = Array.isArray(events)
    ? events
        .filter((event) => normalizeValue(event?.vehicleId) === searchVehicleId)
        .filter((event) => normalizeValue(event?.type) === "camera")
        .filter((event) => normalizeValue(event?.action) === "snapshot")
    : [];

  return jsonResponse(matchedEvents);
}

export default {
async fetch(request, env) {
try {
@@ -252,6 +320,10 @@
return handleCameraDeviceStats(request, env);
}

      if (request.method === "POST" && url.pathname === "/api/camera-snapshots") {
        return handleCameraSnapshots(request, env);
      }

return env.ASSETS.fetch(request);
} catch (error) {
return jsonResponse(
