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

async function handleTn360Users(request, env) {
  requireEnv(env);

  const url = new URL(request.url);
  const username = String(url.searchParams.get("username") || "").trim();

  if (!username) {
    return jsonResponse({ error: "Username is required." }, 400);
  }

  const usersUrl = `https://api-au.telematics.com/v1/users/?key=${env.TN360_API_KEY}&pruning=B2B`;
  const usersResponse = await fetch(usersUrl);

  if (!usersResponse.ok) {
    return jsonResponse({ error: `Unable to load TN360 users. HTTP ${usersResponse.status}` }, 502);
  }

  const users = await usersResponse.json();

  const matchedUser = users.find(
    (user) => String(user.username || "").toLowerCase() === username.toLowerCase(),
  );

  if (!matchedUser) {
    return jsonResponse({ error: "TN360 user not found." }, 404);
  }

  return jsonResponse(matchedUser);
}

async function handleVehicleLookup(request, env) {
  requireEnv(env);

  const body = await request.json();
  const assetNumber = String(body.assetNumber || "").trim();
  const searchValue = assetNumber.replace(/\s+/g, "").toLowerCase();

  if (!assetNumber) {
    return jsonResponse({ error: "Asset number is required." }, 400);
  }

  const vehiclesUrl = `https://api-au.telematics.com/v1/vehicles/?key=${env.TN360_API_KEY}&pruning=B2B`;
  const response = await fetch(vehiclesUrl);

  if (!response.ok) {
    return jsonResponse({ error: `Vehicle lookup failed. HTTP ${response.status}` }, 502);
  }

  const vehicles = await response.json();

  const matchedVehicle = vehicles.find((vehicle) => {
    const vehicleName = String(vehicle.name || "").replace(/\s+/g, "").toLowerCase();
    return vehicleName === searchValue;
  });

  if (!matchedVehicle) {
    return jsonResponse(
      {
        error: "Asset not found.",
        searchedAsset: assetNumber,
        normalizedSearch: searchValue,
        totalVehiclesReturned: vehicles.length,
      },
      404,
    );
  }

  return jsonResponse(matchedVehicle);
}

async function handleVehicleDevices(request, env) {
  requireEnv(env);

  const body = await request.json();
  const vehicleId = String(body.vehicleId || "").trim();

  if (!vehicleId) {
    return jsonResponse({ error: "Vehicle ID is required." }, 400);
  }

  const devicesUrl = `https://api-au.telematics.com/v1/vehicles/${vehicleId}/devices?key=${env.TN360_API_KEY}&pruning=B2B`;
  const response = await fetch(devicesUrl);

  if (!response.ok) {
    return jsonResponse({ error: `Device lookup failed. HTTP ${response.status}` }, 502);
  }

  const devices = await response.json();
  return jsonResponse(devices);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/api/ping") {
        return jsonResponse({
          ok: true,
          hasKey: Boolean(env.TN360_API_KEY),
        });
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
