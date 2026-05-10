const APP_VERSION = "2.0";

const CAMERA_RULES = [
  { key: "UVC", label: "In-Cab Driver Facing Camera" },
  { key: "ROAD", label: "Road Facing" },
  { key: "DRIVER", label: "Driver Facing" },
  { key: "TVI1", label: "Left External" },
  { key: "TVI2", label: "Driver External" }
];

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchCameraEvents(env) {
  const upstreamUrl =
    "https://api-au.telematics.com/v1/events?types=camera&pruning=B2B&key=" +
    encodeURIComponent(env.TELEMATICS_API_KEY);

  const upstreamResponse = await fetch(upstreamUrl, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  if (!upstreamResponse.ok) {
    const errorBody = await upstreamResponse.text();
    throw new Error("Upstream API failed: " + errorBody);
  }

  const events = await upstreamResponse.json();

  if (!Array.isArray(events)) {
    throw new Error("Unexpected API response format.");
  }

  return events;
}

function getLatestSnapshotEvent(events, vehicleId) {
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

function extractImagesFromContext(contextText) {
  const parsed = parseJson(contextText);
  const mediaFiles = parsed?.response?.mediaFiles;

  if (!Array.isArray(mediaFiles)) {
    return [];
  }

  const images = [];

  CAMERA_RULES.forEach(function (rule, index) {
    const match = mediaFiles.find(function (item) {
      const sources = item?.imageDetails?.sources;
      const sourceName = item?.source;

      return (
        item &&
        item.mediaType === "IMAGE" &&
        typeof item.mediaFile === "string" &&
        (
          (Array.isArray(sources) && sources.includes(rule.key)) ||
          sourceName === rule.key ||
          (rule.key === "ROAD" && sourceName === "ROAD_FACING") ||
          (rule.key === "DRIVER" && sourceName === "DRIVER_FACING")
        )
      );
    });

    if (match) {
      images.push({
        cameraNumber: index + 1,
        label: rule.label,
        url: match.mediaFile
      });
    }
  });

  return images;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/events") {
      const vehicleId = url.searchParams.get("vehicleId");

      if (!vehicleId) {
        return Response.json(
          { version: APP_VERSION, error: "vehicleId is required." },
          { status: 400 }
        );
      }

      try {
        const events = await fetchCameraEvents(env);
        const latestEvent = getLatestSnapshotEvent(events, vehicleId);

        if (!latestEvent) {
          return Response.json(
            { version: APP_VERSION, error: "No SNAPSHOT event found for that vehicle ID." },
            { status: 404 }
          );
        }

        const contextText = latestEvent?.attributes?.context || "";
        const images = extractImagesFromContext(contextText);

        if (!images.length) {
          return Response.json(
            { version: APP_VERSION, error: "Snapshot found, but no camera images were available." },
            { status: 404 }
          );
        }

        return Response.json(
          {
            version: APP_VERSION,
            vehicleId: latestEvent.vehicleId,
            eventId: latestEvent.id,
            createdAt: latestEvent.createdAt,
            timeAt: latestEvent.timeAt,
            imageCount: images.length,
            images: images
          },
          {
            headers: {
              "Cache-Control": "no-store"
            }
          }
        );
      } catch (error) {
        return Response.json(
          { version: APP_VERSION, error: error.message || "Request failed." },
          { status: 500 }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
