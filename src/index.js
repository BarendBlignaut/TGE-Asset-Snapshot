function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function handleTn360Users(request, env) {
  const url = new URL(request.url);
  const username = String(url.searchParams.get("username") || "").trim();

  if (!username) {
    return jsonResponse({ error: "Username is required." }, 400);
  }

  const listUrl = `${env.TN360_BASE_URL}/v1/users/?key=${env.TN360_API_KEY}&pruning=B2B`;
  const listResponse = await fetch(listUrl);

  if (!listResponse.ok) {
    return jsonResponse({ error: "Unable to load TN360 users." }, 502);
  }

  const users = await listResponse.json();

  const matchedUser = users.find(
    (user) => String(user.username || "").toLowerCase() === username.toLowerCase(),
  );

  if (!matchedUser || !matchedUser.id) {
    return jsonResponse({ error: "TN360 user not found." }, 404);
  }

  const detailUrl = `${env.TN360_BASE_URL}/v1/users/${matchedUser.id}?key=${env.TN360_API_KEY}&pruning=B2B`;
  const detailResponse = await fetch(detailUrl);

  if (!detailResponse.ok) {
    return jsonResponse({ error: "Unable to load TN360 user detail." }, 502);
  }

  const detailedUser = await detailResponse.json();
  return jsonResponse(detailedUser);
}

async function handleVehicleLookup(request, env) {
  const body = await request.json();
  const assetNumber = String(body.assetNumber || "").trim();

  if (!assetNumber) {
    return jsonResponse({ error: "Asset number is required." }, 400);
  }

  const url = `${env.TN360_BASE_URL}/v1/vehicles/?key=${env.TN360_API_KEY}&pruning=B2B`;
  const response = await fetch(url);

  if (!response.ok) {
    return jsonResponse({ error: "Vehicle lookup failed." }, 502);
  }

  const vehicles = await response.json();
  const matchedVehicle = vehicles.find(
    (vehicle) => String(vehicle.name || "").trim().toLowerCase() === assetNumber.toLowerCase(),
  );

  if (!matchedVehicle) {
    return jsonResponse({ error: "Asset not found." }, 404);
  }

  return jsonResponse(matchedVehicle);
}

async function handleVehicleDevices(request, env) {
  const body = await request.json();
  const vehicleId = String(body.vehicleId || "").trim();

  if (!vehicleId) {
    return jsonResponse({ error: "Vehicle ID is required." }, 400);
  }

  const url = `${env.TN360_BASE_URL}/v1/vehicles/${vehicleId}/devices?key=${env.TN360_API_KEY}&pruning=B2B`;
  const response = await fetch(url);

  if (!response.ok) {
    return jsonResponse({ error: "Device lookup failed." }, 502);
  }

  const devices = await response.json();
  return jsonResponse(devices);
}

async function handleVehicleMeters(request, env) {
  const body = await request.json();
  const vehicleId = String(body.vehicleId || "").trim();

  if (!vehicleId) {
    return jsonResponse({ error: "Vehicle ID is required." }, 400);
  }

  const url = `${env.TN360_BASE_URL}/v1/vehicles/${vehicleId}/meters?key=${env.TN360_API_KEY}&pruning=B2B`;
  const response = await fetch(url);

  if (!response.ok) {
    return jsonResponse({ error: "Meters lookup failed." }, 502);
  }

  const meters = await response.json();
  return jsonResponse(meters);
}

async function handleHermesDeviceStats(request, env) {
  const body = await request.json();
  const trackerId = String(body.trackerId || "").trim();

  if (!trackerId) {
    return jsonResponse({ error: "Tracker ID is required." }, 400);
  }

  const url = `${env.TN360_BASE_URL}/v1/devices/${trackerId}?key=${env.TN360_API_KEY}&pruning=B2B&embed=devicestats`;
  const response = await fetch(url);

  if (!response.ok) {
    return jsonResponse({ error: "HERMES device stats lookup failed." }, 502);
  }

  const device = await response.json();
  return jsonResponse(device);
}

async function handleCameraDeviceStats(request, env) {
  const body = await request.json();
  const cameraId = String(body.cameraId || "").trim();

  if (!cameraId) {
    return jsonResponse({ error: "Camera ID is required." }, 400);
  }

  const url = `${env.TN360_BASE_URL}/v1/devices/${cameraId}?key=${env.TN360_API_KEY}&pruning=B2B&embed=devicestats`;
  const response = await fetch(url);

  if (!response.ok) {
    return jsonResponse({ error: "Camera device stats lookup failed." }, 502);
  }

  const device = await response.json();
  return jsonResponse(device);
}

async function handleCameraSnapshots(request, env) {
  const body = await request.json();
  const vehicleId = String(body.vehicleId || "").trim();

  if (!vehicleId) {
    return jsonResponse({ error: "Vehicle ID is required." }, 400);
  }

  const url = `${env.TN360_BASE_URL}/v1/events/?key=${env.TN360_API_KEY}&vehicleId=${vehicleId}&pruning=B2B`;
  const response = await fetch(url);

  if (!response.ok) {
    return jsonResponse({ error: "Camera snapshot lookup failed." }, 502);
  }

  const events = await response.json();
  return jsonResponse(events);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

    if (request.method === "GET" && url.pathname === "/api/tn360-users") {
      return handleTn360Users(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
