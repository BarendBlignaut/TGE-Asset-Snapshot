const APP_VERSION = "live-1.0";

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

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error("API request failed: " + body);
  }

  return response.json();
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

function bytesToReadable(value) {
  const bytes = Number(value || 0);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }

  const gb = bytes / (1024 * 1024 * 1024);
  return gb.toFixed(0) + " GB";
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

function mapDeviceRole(typeCode) {
  if (typeCode === "HERMES") {
    return "Tracking System";
  }

  if (typeCode === "CAMERA") {
    return "Camera System";
  }

  if (typeCode === "IFACE") {
    return "Tablet";
  }

  return typeCode || "Unknown Device";
}

function mapDevice(device) {
  return {
    role: mapDeviceRole(device.type && device.type.code ? device.type.code : ""),
    typeCode: device.type && device.type.code ? device.type.code : "",
    model: device.model && device.model.name ? device.model.name : "",
    serialNumber: device.serialNumber || "",
    imei: device.imei || "",
    status: device.status || ""
  };
}

function buildMetrics(hermesDetails) {
  const stats = hermesDetails && hermesDetails.deviceStats ? hermesDetails.deviceStats : null;
  const lastVpm = stats && stats.lastVpm ? parseJsonString(stats.lastVpm, {}) : {};

  return [
    { label: "Odometer", value: lastVpm.odometer ?? (stats ? stats.odometer : ""), suffix: " km" },
    { label: "Speed", value: lastVpm.speed ?? "", suffix: " km/h" },
    { label: "RPM", value: lastVpm.rpm ?? "", suffix: "" },
    { label: "Hours", value: lastVpm.hours ?? "", suffix: "" },
    { label: "Oil Temperature", value: lastVpm.oiltemp ?? "", suffix: "°C" },
    { label: "Oil Pressure", value: lastVpm.oilpressure ?? "", suffix: "" },
    { label: "Engine Load", value: lastVpm.engineload ?? "", suffix: "%" },
    { label: "Gear", value: lastVpm.gear ?? "", suffix: "" },
    { label: "Fuel Consumption", value: lastVpm.fuelconsumption ?? "", suffix: "" }
  ].map(function (item) {
    const hasValue = item.value !== "" && item.value !== null && item.value !== undefined;
    return {
      label: item.label,
      value: hasValue ? String(item.value) + item.suffix : "No data"
    };
  });
}

function buildDriver(hermesDetails) {
  const currentUser =
    hermesDetails &&
    hermesDetails.deviceStats &&
    hermesDetails.deviceStats.currentUser
      ? hermesDetails.deviceStats.currentUser
      : null;

  if (!currentUser) {
    return null;
  }

  return {
    name: currentUser.name || [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" "),
    username: currentUser.username || "",
    externalPin: currentUser.externalPin || "",
    status: currentUser.status || ""
  };
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, function (char) {
      return char.toUpperCase();
    });
}

function buildGpio(hermesDetails) {
  const gpioText =
    hermesDetails &&
    hermesDetails.deviceStats &&
    hermesDetails.deviceStats.lastGpio
      ? hermesDetails.deviceStats.lastGpio
      : "";
  const gpio = parseJsonString(gpioText, {});
  const keys = ["digin.1", "digin.2", "digin.3", "digin.4", "digout.2", "digout.3"];

  return keys.map(function (key) {
    const item = gpio[key];

    if (!item) {
      return {
        key: key,
        label: titleCase(key),
        state: "No data",
        eventAt: ""
      };
    }

    const label = item.custom_noun || item.noun || titleCase(key);
    const state = item.custom_verb || item.verb || "";

    return {
      key: key,
      label: titleCase(label),
      state: state || "No state",
      eventAt: item.eventat || ""
    };
  });
}

function buildLocation(hermesDetails) {
  const attrs =
    hermesDetails &&
    hermesDetails.deviceStats &&
    hermesDetails.deviceStats.attrs
      ? hermesDetails.deviceStats.attrs
      : {};

  const lastPr = attrs.last_pr ? parseJsonString(attrs.last_pr, null) : null;

  if (!lastPr || lastPr.Lat === undefined || lastPr.Lng === undefined) {
    return null;
  }

  return {
    lat: lastPr.Lat,
    lng: lastPr.Lng,
    at: lastPr.At || "",
    speed: lastPr.Spd ?? "",
    altitude: lastPr.Alt ?? "",
    direction: lastPr.Dir ?? "",
    satellites: lastPr.NSat ?? "",
    hdop: lastPr.HDOP ?? ""
  };
}

function buildSdCards(cameraDetails) {
  const attrs =
    cameraDetails &&
    cameraDetails.deviceStats &&
    cameraDetails.deviceStats.attrs
      ? cameraDetails.deviceStats.attrs
      : {};

  return [
    {
      label: "SD Card 1",
      present: attrs["lm.sd_card.1"] === "sdCardPresent" ? "Yes" : "No",
      space: bytesToReadable(attrs["lm.sd_card.1_total_size_bytes"]) || "No data"
    },
    {
      label: "SD Card 2",
      present: attrs["lm.sd_card.2"] === "sdCardPresent" ? "Yes" : "No",
      space: bytesToReadable(attrs["lm.sd_card.2_total_size_bytes"]) || "No data"
    }
  ];
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
        const vehicles = await fetchJson(apiUrl(env, "/vehicles"));
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
        const devices = await fetchJson(apiUrl(env, "/vehicles/" + matchedVehicle.id + "/devices"));
        const normalizedDevices = Array.isArray(devices) ? devices.map(mapDevice) : [];

        const hermesDevice = Array.isArray(devices)
          ? devices.find(function (device) {
              return device.type && device.type.code === "HERMES";
            })
          : null;

        const cameraDevice = Array.isArray(devices)
          ? devices.find(function (device) {
              return device.type && device.type.code === "CAMERA";
            })
          : null;

        const hermesKey = hermesDevice ? (hermesDevice.serialNumber || hermesDevice.imei || hermesDevice.name) : "";
        const cameraKey = cameraDevice ? (cameraDevice.serialNumber || cameraDevice.imei || cameraDevice.name) : "";

        const results = await Promise.all([
          hermesKey
            ? fetchJson(apiUrl(env, "/devices/" + encodeURIComponent(hermesKey), { embed: "devicestats" }))
            : Promise.resolve(null),
          cameraKey
            ? fetchJson(apiUrl(env, "/devices/" + encodeURIComponent(cameraKey), { embed: "devicestats" }))
            : Promise.resolve(null),
          fetchJson(apiUrl(env, "/events", { types: "camera" }))
        ]);

        const hermesDetails = results[0];
        const cameraDetails = results[1];
        const cameraEvents = results[2];

        const latestSnapshotEvent = Array.isArray(cameraEvents)
          ? pickLatestSnapshotEvent(cameraEvents, matchedVehicle.id)
          : null;

        return jsonResponse({
          version: APP_VERSION,
          requestTime: new Date().toISOString(),
          vehicle: vehicleDetails,
          devices: normalizedDevices,
          trackerDataAvailable: Boolean(hermesDetails),
          cameraDeviceAvailable: Boolean(cameraDetails),
          driver: buildDriver(hermesDetails),
          metrics: buildMetrics(hermesDetails),
          gpio: buildGpio(hermesDetails),
          location: buildLocation(hermesDetails),
          sdCards: buildSdCards(cameraDetails),
          cameras: buildCameraImages(latestSnapshotEvent),
          latestSnapshotEventId: latestSnapshotEvent ? latestSnapshotEvent.id : "",
          latestSnapshotTime: latestSnapshotEvent ? (latestSnapshotEvent.timeAt || latestSnapshotEvent.createdAt || "") : ""
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
