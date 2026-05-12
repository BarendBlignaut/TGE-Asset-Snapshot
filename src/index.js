async function handleAssetSearch(assetNumber) {
  clearAssetSearchMessage();
  resetActiveAssetLookup();

  const vehicleLookupResponse = await fetchVehicleByAssetNumber(assetNumber);
  const vehicle = vehicleLookupResponse.vehicle || vehicleLookupResponse;

  const devices = await fetchVehicleDevices(vehicle.id);
  const mappedDevices = mapVehicleDevices(devices);
  const meters = await fetchVehicleMeters(vehicle.id);
  const extractedMeters = extractVehicleMeters(meters);

  let hermesStats = null;
  let cameraStats = {
    overallStatus: null,
    sdCard1: {
      present: false,
      rawStatus: null,
      totalSizeBytes: null,
      totalSizeDisplay: null,
    },
    sdCard2: {
      present: false,
      rawStatus: null,
      totalSizeBytes: null,
      totalSizeDisplay: null,
    },
  };

  let cameraSnapshot = {
    snapshotTime: null,
    slots: {
      roadFacing: null,
      driverFacing: null,
      inCabDriverFacingCamera: null,
      driverExternal: null,
      leftExternal: null,
    },
  };

  if (mappedDevices.trackingSystem?.imei || mappedDevices.trackingSystem?.serialNumber) {
    const hermesIdentifier =
      mappedDevices.trackingSystem.imei || mappedDevices.trackingSystem.serialNumber;
    const hermesDevice = await fetchHermesDeviceStats(hermesIdentifier);
    hermesStats = extractHermesStats(hermesDevice);
  }

  if (mappedDevices.camera?.imei) {
    try {
      const cameraDevice = await fetchCameraDeviceStats(mappedDevices.camera.imei);
      cameraStats = extractCameraStats(cameraDevice);
    } catch (error) {
      console.warn("Camera device stats unavailable:", error);
    }
  }

  try {
    const snapshotEvents = await fetchCameraSnapshots(vehicle.id);
    const latestSnapshot = extractLatestSnapshot(snapshotEvents);

    cameraSnapshot = {
      snapshotTime: latestSnapshot.snapshotTime,
      slots: mapSnapshotLinksToSlots(latestSnapshot),
    };
  } catch (error) {
    console.warn("Camera snapshots unavailable:", error);
  }

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
