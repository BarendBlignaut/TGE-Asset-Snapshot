const APP_VERSION = "live-1.3";

const CAMERA_SLOTS = [
  { id: "road", label: "Road Facing" },
  { id: "driver", label: "Driver Facing" },
  { id: "uvc", label: "In-Cab Driver Facing Camera" },
  { id: "tvi2", label: "Driver External" },
  { id: "tvi1", label: "Left External" }
];

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

async function fetchJson(url, label) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(label + " failed with status " + response.status + ": " + bodyText);
  }

  if (!bodyText || !bodyText.trim()) {
    throw new Error(label + " returned an empty response body.");
  }

  try {
    return JSON.parse(bodyText);
  } catch (error) {
    throw new Error(label + " returned invalid JSON: " + bodyText.slice(0, 500));
  }
}

function apiUrl(env, path, params = {}) {
  const url = new URL("https://api-au.telematics.com/v1" + path);
  url.searchParams.set("key", env.TELEMATICS_API_KEY);
  url.searchParams.set("pruning", "B2B");

  Object.entries(params).forEach(function ([key, value]) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
}

function normalize(value) {
  return String(value || "").trim();
}

function parseJsonString(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function mapVehicle(vehicle) {
  return {
    vehicleId: vehicle.id,
    fleetNumber: vehicle.name || "",
    assetType: vehicle.type && vehicle.type.name ? vehicle.type.name : "",
    registration: vehicle.registration || "",
    registrationState: vehicle.registrationStateName || "",
    make: vehicle.make || "",
    model: vehicle.model || "",
    vin: vehicle.vin || "",
    manufacturedDateOfAsset:
      vehicle.operationalVehicleModel &&
      vehicle.operationalVehicleModel.yearOfManufacture
        ? vehicle.operationalVehicleModel.yearOfManufacture
        : ""
  };
}

function cameraSlotMatch(slotId, mediaFile) {
  const sourceName = mediaFile && mediaFile.source ? mediaFile.source : "";
  const sources =
    mediaFile &&
    mediaFile.imageDetails &&
    Array.isArray(mediaFile.imageDetails.sources)
      ? mediaFile.imageDetails.sources
      : [];

  if (slotId === "road") {
    return sourceName === "ROAD_FACING" || sources.includes("ROAD");
  }

  if (slotId === "driver") {
    return sourceName === "DRIVER_FACING" || sources.includes("DRIVER");
  }

  if (slotId === "uvc") {
    return sources.includes("UVC");
  }

  if (slotId === "tvi2") {
    return sources.includes("TVI2");
  }

  if (slotId === "tvi1") {
    return sources.includes("TVI1");
  }

  return false;
}

function pickLatestSnapshotEvent(events, vehicleId) {
  const matches = events
    .filter(function (event) {
      return (
        String(event.vehicleId) === String(vehicleId) &&
        String(event.action || "").toUpperCase() === "SNAPSHOT"
      );
    })
    .sort(function (a, b) {
      return new Date(b.createdAt || b.timeAt || 0) - new Date(a.createdAt || a.timeAt || 0);
    });

  return matches[0] || null;
}

function buildCameraImages(eventRecord) {
  const contextText =
    eventRecord &&
    eventRecord.attributes &&
    eventRecord.attributes.context
      ? eventRecord.attributes.context
      : "";
  const context = parseJsonString(contextText, {});
  const mediaFiles =
    context &&
    context.response &&
    Array.isArray(context.response.mediaFiles)
      ? context.response.mediaFiles
      : [];

  return CAMERA_SLOTS.map(function (slot) {
    const match = mediaFiles.find(function (mediaFile) {
      return (
        mediaFile &&
        mediaFile.mediaType === "IMAGE" &&
        typeof mediaFile.mediaFile === "string" &&
        cameraSlotMatch(slot.id, mediaFile)
      );
    });

    return {
      id: slot.id,
      label: slot.label,
      imageUrl: match ? match.mediaFile : "",
      hasImage: Boolean(match)
    };
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/asset-snapshot") {
      const fleetNumber = normalize(url.searchParams.get("fleetNumber"));

      if (!fleetNumber) {
        return jsonResponse(
          {
            version: APP_VERSION,
            error: "Fleet number is required."
          },
          400
        );
      }

      try {
        const vehicles = await fetchJson(apiUrl(env, "/vehicles"), "Vehicles API");

        const matchedVehicle = vehicles.find(function (vehicle) {
          return normalize(vehicle.name) === fleetNumber;
        });

        if (!matchedVehicle) {
          return jsonResponse(
            {
              version: APP_VERSION,
              error: "No asset found. Check fleet number is correct."
            },
            404
          );
        }

        const vehicleDetails = mapVehicle(matchedVehicle);

        const cameraEvents = await fetchJson(
          apiUrl(env, "/events", { types: "camera" }),
          "Camera events API"
        );

        const latestSnapshotEvent = Array.isArray(cameraEvents)
          ? pickLatestSnapshotEvent(cameraEvents, matchedVehicle.id)
          : null;

        const cameras = buildCameraImages(latestSnapshotEvent);

        return jsonResponse({
          version: APP_VERSION,
          requestTime: new Date().toISOString(),
          vehicle: vehicleDetails,
          devices: [],
          trackerDataAvailable: false,
          cameraDeviceAvailable: false,
          driver: null,
          metrics: [],
          gpio: [],
          location: null,
          sdCards: [],
          cameras: cameras,
          latestSnapshotEventId: latestSnapshotEvent ? latestSnapshotEvent.id : "",
          latestSnapshotTime: latestSnapshotEvent
            ? latestSnapshotEvent.timeAt || latestSnapshotEvent.createdAt || ""
            : ""
        });
      } catch (error) {
        return jsonResponse(
          {
            version: APP_VERSION,
            error: error.message || "Snapshot request failed."
          },
          500
        );
      }
    }

    return new Response("Not found", { status: 404 });
  }
};
