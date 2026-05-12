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
},
  // Add your real login user here if it is not bare1234.
  // Example:
  // {
  //   firstName: "YourFirstName",
  //   lastName: "YourLastName",
  //   username: "yourusername",
  //   role: "admin",
  //   status: "active",
  //   createdBy: "system",
  //   createdDate: "2026-05-12T00:00:00Z",
  //   updatedBy: "system",
  //   updatedDate: "2026-05-12T00:00:00Z",
  // },
];

const loginHistory = [];
@@ -54,8 +41,8 @@
);
}

function showLoginError() {
  loginMessage.textContent = "Access denied. Please contact Telematics.";
function showLoginError(message = "Access denied. Please contact Telematics.") {
  loginMessage.textContent = message;
}

function showLoginSuccess(user) {
@@ -100,11 +87,14 @@
});
}

async function fetchTn360Users() {
  const response = await fetch("/api/tn360-users");
async function fetchTn360UserByUsername(username) {
  const response = await fetch(`/api/tn360-users?username=${encodeURIComponent(username)}`);

if (!response.ok) {
    throw new Error("Unable to validate user.");
    const payload = await response.json().catch(() => ({ error: "Unable to validate user." }));
    throw new Error(payload.error || "Unable to validate user.");
}

return response.json();
}

@@ -115,10 +105,7 @@
return { success: false };
}

  const tnUsers = await fetchTn360Users();
  const tnUser = tnUsers.find(
    (user) => String(user.username || "").toLowerCase() === String(username).trim().toLowerCase(),
  );
  const tnUser = await fetchTn360UserByUsername(username);

if (!tnUser) return { success: false };
if (tnUser.status !== "ENABLED") return { success: false };
@@ -262,7 +249,8 @@
});

if (!response.ok) {
    throw new Error("Asset not found.");
    const payload = await response.json().catch(() => ({ error: "Asset not found." }));
    throw new Error(payload.error || "Asset not found.");
}

return response.json();
@@ -290,8 +278,7 @@
});

if (!response.ok) {
    console.warn("Meters lookup failed.", { vehicleId, status: response.status });
    return [];
    throw new Error("Meters lookup failed.");
}

return response.json();
@@ -387,19 +374,16 @@
}

function extractVehicleMeters(meters) {
  const meterList = Array.isArray(meters) ? meters : [];

  const engineHoursRecord = meterList.find(
  const engineHoursRecord = meters.find(
(meter) =>
String(meter.type || "").toLowerCase() === "hours" &&
      (!meter.maintenanceType || String(meter.maintenanceType || "").toUpperCase() === "TIME"),
      String(meter.maintenanceType || "").toUpperCase() === "TIME",
);

  const odometerRecord = meterList.find(
  const odometerRecord = meters.find(
(meter) =>
      ["odometer", "distance"].includes(String(meter.type || "").toLowerCase()) &&
      (!meter.maintenanceType ||
        String(meter.maintenanceType || "").toUpperCase() === "DISTANCE"),
      String(meter.type || "").toLowerCase() === "odometer" &&
      String(meter.maintenanceType || "").toUpperCase() === "DISTANCE",
);

return {
@@ -648,7 +632,9 @@
clearAssetSearchMessage();
resetActiveAssetLookup();

  const vehicle = await fetchVehicleByAssetNumber(assetNumber);
  const vehicleLookupResponse = await fetchVehicleByAssetNumber(assetNumber);
  const vehicle = vehicleLookupResponse.vehicle || vehicleLookupResponse;

const devices = await fetchVehicleDevices(vehicle.id);
const mappedDevices = mapVehicleDevices(devices);
const meters = await fetchVehicleMeters(vehicle.id);
@@ -741,7 +727,7 @@

openAppForUser(currentSessionUser);
} catch (error) {
    showLoginError();
    showLoginError(error.message || "Access denied. Please contact Telematics.");
}
});

@@ -808,6 +794,6 @@
showAssetSearchMessage("");
} catch (error) {
resetActiveAssetLookup();
    showAssetSearchMessage("Asset not found.");
    showAssetSearchMessage(error.message || "Asset not found.");
}
});
