const CONFIG = {
  apiBaseUrl: "YOUR_API_BASE_URL",
  apiKey: "YOUR_API_KEY",
  snapshotLivePath: "/api/live-1.3/vehicles/{vehicleId}",
  snapshotEventPath: "/api/snapshot-events/{snapshotEventId}",
  vehicleMetricsPath: "/api/vehicles/{vehicleId}/metrics",
  deviceByVehiclePath: "/api/vehicles/{vehicleId}/device",
};

const state = {
  payload: null,
  loading: false,
  error: null,
};

const els = {
  form: document.querySelector("[data-asset-form]"),
  vehicleId: document.querySelector("[data-vehicle-id]"),
  snapshotTime: document.querySelector("[data-snapshot-time]"),
  imageCount: document.querySelector("[data-image-count]"),
  status: document.querySelector("[data-status]"),
  sync: document.querySelector("[data-sync]"),
  assetTitle: document.querySelector("[data-asset-title]"),
  assetMeta: document.querySelector("[data-asset-meta]"),
  performance: document.querySelector("[data-performance]"),
  gpsCards: document.querySelector("[data-gps-cards]"),
  storageCards: document.querySelector("[data-storage-cards]"),
  cameraGrid: document.querySelector("[data-camera-grid]"),
  liveCards: document.querySelector("[data-live-cards]"),
  message: document.querySelector("[data-message]"),
};

els.form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const vehicleId = els.vehicleId?.value?.trim();
  if (!vehicleId) return;
  await loadAsset(vehicleId);
});

async function loadAsset(vehicleId) {
  state.loading = true;
  state.error = null;
  render();

  try {
    const payload = await buildAssetSnapshot(vehicleId);
    state.payload = payload;
  } catch (error) {
    state.payload = null;
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.loading = false;
    render();
  }
}

async function buildAssetSnapshot(vehicleId) {
  const liveSnapshot = await getJson(buildUrl(CONFIG.snapshotLivePath, { vehicleId }));

  const latestSnapshotEventId = liveSnapshot?.latestSnapshotEventId || null;

  const [deviceRecord, metricsList, snapshotEvent] = await Promise.all([
    getJson(buildUrl(CONFIG.deviceByVehiclePath, { vehicleId })).catch(() => null),
    getJson(buildUrl(CONFIG.vehicleMetricsPath, { vehicleId })).catch(() => []),
    latestSnapshotEventId
      ? getJson(buildUrl(CONFIG.snapshotEventPath, { snapshotEventId: latestSnapshotEventId })).catch(() => null)
      : null,
  ]);

  const assetVehicle = liveSnapshot?.vehicle ?? null;
  const deviceStats = deviceRecord?.deviceStats ?? {};
  const parsedLastVpm = safeJson(deviceStats.lastVpm);
  const parsedLastGpio = safeJson(deviceStats.lastGpio);
  const snapshotContext = safeJson(snapshotEvent?.attributes?.context);
  const snapshotResponse = snapshotContext?.response ?? {};
  const snapshotLocation = snapshotContext?.location ?? null;
  const metricMap = indexMetrics(metricsList);

  const liveGps = normalizeLiveGps(deviceStats?.gps, deviceStats?.attrs);
  const liveLocation = liveGps
    ? {
        latitude: liveGps.latitude,
        longitude: liveGps.longitude,
        bearing: liveGps.bearing ?? null,
        altitude: liveGps.altitude ?? null,
        speedKph: liveGps.speedKph ?? null,
        accuracy: liveGps.accuracy ?? null,
        capturedAt: deviceStats?.gpsAt ?? deviceStats?.lastEventAt ?? null,
        label: deviceStats?.location ?? null,
      }
    : null;

  const cameras = mapCameras({
    liveCameras: liveSnapshot?.cameras ?? [],
    eventMediaFiles: snapshotResponse?.mediaFiles ?? [],
  });

  return {
    asset: {
      vehicleId: assetVehicle?.vehicleId ?? assetVehicle?.id ?? Number(vehicleId),
      fleetNumber: assetVehicle?.fleetNumber ?? assetVehicle?.name ?? null,
      assetType: assetVehicle?.assetType ?? assetVehicle?.type?.name ?? null,
      registration: assetVehicle?.registration ?? null,
      registrationState:
        assetVehicle?.registrationStateName ??
        assetVehicle?.registrationState ??
        null,
      make: assetVehicle?.make ?? null,
      model: assetVehicle?.model ?? null,
      vin: assetVehicle?.vin ?? null,
      manufacturedYear:
        assetVehicle?.yearOfManufacture ??
        assetVehicle?.manufacturedDateOfAsset ??
        null,
    },
    snapshot: {
      latestSnapshotEventId,
      latestSnapshotTime:
        liveSnapshot?.latestSnapshotTime ??
        snapshotEvent?.timeAt ??
        snapshotEvent?.createdAt ??
        null,
      createdAt: snapshotContext?.createdAt ?? snapshotEvent?.createdAt ?? null,
      status: snapshotContext?.status ?? snapshotEvent?.attributes?.status ?? null,
      syncStatus:
        liveSnapshot?.trackerDataAvailable === false ? "Pending live tracker data" : "Ready",
      location: snapshotLocation
        ? {
            latitude: snapshotLocation.latitude ?? null,
            longitude: snapshotLocation.longitude ?? null,
            bearing: snapshotLocation.bearing ?? null,
            altitude: snapshotLocation.altitude ?? null,
            speedKph: metersPerSecondToKph(snapshotLocation.speed),
            accuracy: snapshotLocation.accuracy ?? null,
          }
        : null,
      imageCount: cameras.length,
      cameras,
    },
    live: {
      deviceId: deviceRecord?.id ?? null,
      deviceName: deviceRecord?.name ?? null,
      deviceModel: deviceRecord?.model?.name ?? null,
      firmwareVersion: deviceRecord?.releaseVersion ?? null,
      ignition: deviceStats?.ignition ?? null,
      movement: deviceStats?.movement ?? null,
      liveLocation,
      odometerKm:
        numberOrNull(deviceStats?.odometer) ??
        numberOrNull(parsedLastVpm?.odometer) ??
        null,
      speedKph:
        numberOrNull(parsedLastVpm?.speed) ??
        liveLocation?.speedKph ??
        null,
      engineHours:
        numberOrNull(metricMap.hours?.value) ??
        numberOrNull(parsedLastVpm?.hours) ??
        null,
      driver: deviceStats?.currentUser
        ? {
            id: deviceStats.currentUser.id ?? null,
            name: deviceStats.currentUser.name ?? null,
            email: deviceStats.currentUser.email ?? null,
            username: deviceStats.currentUser.username ?? null,
          }
        : null,
      gpio: mapGpio(parsedLastGpio),
      vpm: {
        rpm: numberOrNull(parsedLastVpm?.rpm),
        gear: numberOrNull(parsedLastVpm?.gear),
        engineLoadPct: numberOrNull(parsedLastVpm?.engineload),
        oilTempC: numberOrNull(parsedLastVpm?.oiltemp),
        oilPressureKpa: numberOrNull(parsedLastVpm?.oilpressure),
        fuelLevelPct: nonNegativeOrNull(parsedLastVpm?.fuellevel),
        chargePct: nonNegativeOrNull(parsedLastVpm?.charge),
        sourceTime: deviceStats?.lastVpmAt ?? null,
      },
    },
    metrics: {
      batteryVolts: numberOrNull(metricMap.battery?.value),
      chargePct: numberOrNull(metricMap.charge?.value),
      totalDistanceKm: numberOrNull(metricMap.distance?.value),
      fuelUsedLitres: numberOrNull(metricMap.fuel?.value),
      engineHours: numberOrNull(metricMap.hours?.value),
    },
  };
}

function render() {
  if (els.message) {
    els.message.textContent = state.loading
      ? "Loading asset snapshot..."
      : state.error
      ? state.error
      : "";
  }

  if (!state.payload) return;

  const { asset, snapshot, live, metrics } = state.payload;

  text(els.assetTitle, asset?.fleetNumber ? `Asset ${asset.fleetNumber}` : `Asset ${asset?.vehicleId ?? "-"}`);
  text(
    els.assetMeta,
    [
      asset?.registration,
      asset?.registrationState,
      asset?.make,
      asset?.model,
      asset?.vin,
    ].filter(Boolean).join(" | "),
  );

  text(els.snapshotTime, formatDateTime(snapshot?.latestSnapshotTime));
  text(els.imageCount, `${snapshot?.imageCount ?? 0} Cameras`);
  text(els.status, humanizeIgnition(live?.ignition));
  text(els.sync, snapshot?.syncStatus ?? "Unavailable");

  renderPerformance(metrics, live);
  renderGps(snapshot, live);
  renderStorage(snapshot);
  renderLive(live);
  renderCameras(snapshot?.cameras ?? []);
}

function renderPerformance(metrics, live) {
  const cards = [
    metricCard("Total Distance", formatNumber(metrics?.totalDistanceKm, "km")),
    metricCard("Current Speed", formatNumber(live?.speedKph, "km/h")),
    metricCard("Odometer", formatNumber(live?.odometerKm, "km")),
    metricCard("Fuel Used", formatNumber(metrics?.fuelUsedLitres, "L")),
    metricCard("Engine Hours", formatNumber(metrics?.engineHours, "hrs")),
    metricCard("Battery", formatNumber(metrics?.batteryVolts, "V")),
  ];
  html(els.performance, cards.join(""));
}

function renderGps(snapshot, live) {
  const snapshotLocation = snapshot?.location;
  const liveLocation = live?.liveLocation;

  const cards = [
    infoCard(
      "Snapshot Latitude / Longitude",
      latLng(snapshotLocation?.latitude, snapshotLocation?.longitude),
      snapshotLocation ? "Snapshot Match" : "Unavailable",
    ),
    infoCard(
      "Live Latitude / Longitude",
      latLng(liveLocation?.latitude, liveLocation?.longitude),
      liveLocation?.label ?? "Unavailable",
    ),
    infoCard(
      "Bearing / Altitude",
      [snapshotLocation?.bearing != null ? `${snapshotLocation.bearing}°` : null, snapshotLocation?.altitude != null ? `${snapshotLocation.altitude}m` : null]
        .filter(Boolean)
        .join(", ") || "Unavailable",
      snapshotLocation?.speedKph != null ? `${snapshotLocation.speedKph} km/h at capture` : "No snapshot speed",
    ),
    infoCard(
      "Motion State",
      live?.movement ?? "Unavailable",
      humanizeIgnition(live?.ignition),
    ),
    infoCard(
      "Capture Window",
      formatDateTime(snapshot?.createdAt || snapshot?.latestSnapshotTime),
      snapshot?.status ?? "Unknown",
    ),
    infoCard(
      "Driver",
      live?.driver?.name ?? "Unassigned",
      live?.driver?.email ?? "No driver email",
    ),
  ];
  html(els.gpsCards, cards.join(""));
}

function renderStorage(snapshot) {
  const cameras = snapshot?.cameras ?? [];
  const available = cameras.filter((camera) => camera.hasImage).length;
  const cards = [
    metricCard("Image Set", `${available}/${cameras.length || 0} ready`),
    metricCard("Snapshot Status", snapshot?.status ?? "Unavailable"),
    metricCard("Upload Request", snapshot?.latestSnapshotEventId ? String(snapshot.latestSnapshotEventId) : "Unavailable"),
    metricCard("Sync", snapshot?.syncStatus ?? "Unavailable"),
  ];
  html(els.storageCards, cards.join(""));
}

function renderLive(live) {
  const cards = [
    infoCard("Tracker Device", live?.deviceName ?? "Unavailable", live?.deviceModel ?? "Unknown model"),
    infoCard("Firmware", live?.firmwareVersion ?? "Unavailable", live?.deviceId ? `Device ${live.deviceId}` : "No device"),
    infoCard("RPM / Gear", joinValues([formatPlain(live?.vpm?.rpm), formatPlain(live?.vpm?.gear)], ["rpm", "gear"]), "From last VPM"),
    infoCard("Oil / Load", joinValues([formatPlain(live?.vpm?.oilTempC), formatPlain(live?.vpm?.engineLoadPct)], ["°C", "%"]), "From last VPM"),
    infoCard("GPIO", live?.gpio?.length ? `${live.gpio.length} signals` : "Unavailable", live?.gpio?.[0] ? `${live.gpio[0].noun} ${live.gpio[0].verb}` : "No GPIO state"),
    infoCard("Live Update", formatDateTime(live?.liveLocation?.capturedAt || live?.vpm?.sourceTime), ""),
  ];
  html(els.liveCards, cards.join(""));
}

function renderCameras(cameras) {
  if (!cameras.length) {
    html(els.cameraGrid, '<div>No camera images available.</div>');
    return;
  }

  html(
    els.cameraGrid,
    cameras.map((camera, index) => `
      <article>
        <div>
          ${camera.imageUrl
            ? `<img src="${escapeHtml(camera.imageUrl)}" alt="${escapeHtml(camera.label)}" loading="lazy" />`
            : `<div>No image</div>`
          }
        </div>
        <div>
          <strong>Camera ${index + 1}</strong>
          <div>${escapeHtml(camera.label || "Unknown")}</div>
          <small>${escapeHtml(camera.status || "Unavailable")}</small>
        </div>
      </article>
    `).join(""),
  );
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": CONFIG.apiKey,
      Authorization: `Bearer ${CONFIG.apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Upstream ${response.status} for ${url}`);
  }

  return response.json();
}

function buildUrl(template, params) {
  const path = template.replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(String(params[key])));
  return `${CONFIG.apiBaseUrl.replace(/\/$/, "")}${path}`;
}

function mapCameras({ liveCameras, eventMediaFiles }) {
  const mediaByLabel = new Map();

  for (const mediaFile of eventMediaFiles) {
    const label = mediaSourceToLabel(mediaFile?.source, mediaFile?.imageDetails?.sources);
    if (label) mediaByLabel.set(label, mediaFile);
  }

  return liveCameras.map((camera, index) => {
    const eventMedia = mediaByLabel.get(camera.label) || null;
    return {
      id: camera.id ?? `camera-${index + 1}`,
      label: camera.label ?? `Camera ${index + 1}`,
      imageUrl: camera.imageUrl ?? eventMedia?.mediaFile ?? null,
      hasImage: Boolean(camera.hasImage ?? eventMedia?.mediaFile),
      source: eventMedia?.source ?? null,
      status: eventMedia?.status ?? null,
    };
  });
}

function mapGpio(parsedLastGpio) {
  if (!parsedLastGpio || typeof parsedLastGpio !== "object") return [];
  return Object.entries(parsedLastGpio).map(([channel, value]) => ({
    channel,
    noun: value?.noun ?? null,
    verb: value?.verb ?? null,
    which: value?.which ?? null,
    type: value?.type ?? null,
    eventAt: value?.eventat ?? null,
  }));
}

function indexMetrics(metricsList) {
  const map = {};
  for (const metric of Array.isArray(metricsList) ? metricsList : []) {
    if (metric?.type) map[metric.type] = metric;
  }
  return map;
}

function normalizeLiveGps(gps, attrs) {
  if (gps?.valid) {
    return {
      latitude: numberOrNull(gps.Lat),
      longitude: numberOrNull(gps.Lng),
      bearing: null,
      altitude: null,
      speedKph: null,
      accuracy: null,
    };
  }

  const lastPr = safeJson(attrs?.last_pr);
  const lastGps = safeJson(attrs?.last_gps);
  const source = lastPr || lastGps;
  if (!source) return null;

  return {
    latitude: numberOrNull(source.Lat),
    longitude: numberOrNull(source.Lng),
    bearing: numberOrNull(source.Dir),
    altitude: numberOrNull(source.Alt),
    speedKph: numberOrNull(source.Spd),
    accuracy: numberOrNull(source.HDOP),
  };
}

function mediaSourceToLabel(source, sources) {
  if (Array.isArray(sources) && sources.includes("ROAD")) return "Road Facing";
  if (Array.isArray(sources) && sources.includes("DRIVER")) return "Driver Facing";
  if (Array.isArray(sources) && sources.includes("UVC")) return "In-Cab Driver Facing Camera";
  if (Array.isArray(sources) && sources.includes("TVI2")) return "Driver External";
  if (Array.isArray(sources) && sources.includes("TVI1")) return "Left External";
  if (source === "ROAD_FACING") return "Road Facing";
  if (source === "DRIVER_FACING") return "Driver Facing";
  return null;
}

function safeJson(value) {
  if (!value || typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function metersPerSecondToKph(value) {
  const num = numberOrNull(value);
  return num === null ? null : Number((num * 3.6).toFixed(1));
}

function metricCard(label, value) {
  return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function infoCard(label, value, subtext) {
  return `<article><strong>${escapeHtml(label)}</strong><div>${escapeHtml(value || "Unavailable")}</div><small>${escapeHtml(subtext || "")}</small></article>`;
}

function text(el, value) {
  if (el) el.textContent = value ?? "";
}

function html(el, value) {
  if (el) el.innerHTML = value ?? "";
}

function formatDateTime(value) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatNumber(value, suffix) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "Unavailable";
  }
  return `${Number(value).toLocaleString("en-AU", { maximumFractionDigits: 1 })} ${suffix}`;
}

function formatPlain(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return Number(value).toLocaleString("en-AU", { maximumFractionDigits: 1 });
}

function latLng(lat, lng) {
  if (lat == null || lng == null) return "Unavailable";
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
}

function joinValues(values, suffixes) {
  const filled = values.filter(Boolean);
  if (!filled.length) return "Unavailable";
  return filled.map((value, index) => `${value} ${suffixes[index]}`).join(" | ");
}

function humanizeIgnition(value) {
  if (!value) return "Unavailable";
  return value === "ON" ? "Ignition Active" : value;
}

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function nonNegativeOrNull(value) {
  const num = numberOrNull(value);
  return num !== null && num >= 0 ? num : null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
