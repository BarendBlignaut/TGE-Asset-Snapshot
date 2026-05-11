const snapshotPayload = {
  assetId: "349521",
  snapshotTime: "2026-05-09T22:09:39+10:00",
  status: "Ignition Active",
  sync: "Ready",
  vehicle: {
    id: 349521,
    name: "90134",
    registration: "XW79SI",
    make: "Volvo",
    model: "FH",
    location: "Depot - NSW - PE - Eastern Creek, Southridge Street, Eastern Creek, NSW",
    movement: "Stationary",
    ignition: "ON",
    tripId: 687190025
  },
  metrics: {
    distanceKm: 317417.77,
    currentSpeedKph: 27.88,
    fuelLitres: 161718.25,
    batteryVolts: 28.603
  },
  gps: {
    latitude: -28.22533,
    longitude: 153.55599,
    accuracy: "High",
    bearing: 315.9,
    altitudeM: 6
  },
  storage: {
    sdCard1: "Operational",
    sdCard2: "Operational",
    videoStatus: "Available",
    uploadRequest: "Queued Successfully"
  },
  cameras: [
    { id: 1, label: "Road Facing" },
    { id: 2, label: "Driver Facing" },
    { id: 3, label: "In-Cab Driver Facing" },
    { id: 4, label: "Camera 4" },
    { id: 5, label: "Driver External" }
  ]
};

function json(data, init = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init.headers
    },
    status: init.status ?? 200
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, worker: "tge-asset-snapshot" });
    }

    if (url.pathname === "/api/asset-snapshot") {
      const assetId = url.searchParams.get("assetId") || snapshotPayload.assetId;
      return json({
        ...snapshotPayload,
        assetId
      });
    }

    return env.ASSETS.fetch(request);
  }
};
