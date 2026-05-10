const APP_VERSION = "1.1";

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getMediaFilesFromEvent(event) {
  const contextText = event?.attributes?.context || "";
  const context = parseJson(contextText);
  const mediaFiles = context?.response?.mediaFiles;

  if (!Array.isArray(mediaFiles)) {
    return [];
  }

  return mediaFiles.filter(function (item) {
    return item && item.mediaType === "IMAGE" && item.mediaFile;
  });
}

function buildLabel(mediaFile, index) {
  const detailedSources = mediaFile?.imageDetails?.sources;
  const firstSource =
    Array.isArray(detailedSources) && detailedSources.length > 0
      ? detailedSources[0]
      : null;

  if (firstSource) {
    return firstSource;
  }

  return "CAM " + (index + 1);
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

function getLatestMatchingEvent(events, vehicleId) {
  const matches = events
    .filter(function (event) {
      return String(event.vehicleId) === String(vehicleId);
    })
    .sort(function (a, b) {
      return new Date(b.timeAt) - new Date(a.timeAt);
    });

  if (matches.length === 0) {
    return null;
  }

  return matches[0];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/events") {
      const vehicleId = url.searchParams.get("vehicleId");

      if (!vehicleId) {
        return Response.json(
          {
            version: APP_VERSION,
            error: "vehicleId is required."
          },
          { status: 400 }
        );
      }

      try {
        const events = await fetchCameraEvents(env);
        const matchedEvent = getLatestMatchingEvent(events, vehicleId);

        if (!matchedEvent) {
          return Response.json(
            {
              version: APP_VERSION,
              error: "No events found for that vehicle ID."
            },
            { status: 404 }
          );
        }

        const mediaFiles = getMediaFilesFromEvent(matchedEvent);

        const images = mediaFiles.map(function (mediaFile, index) {
          return {
            cameraNumber: index + 1,
            label: buildLabel(mediaFile, index),
            rawUrl: mediaFile.mediaFile
          };
        });

        return Response.json(
          {
            version: APP_VERSION,
            requestedVehicleId: vehicleId,
            matchedVehicleId: matchedEvent.vehicleId,
            eventId: matchedEvent.id,
            eventTime: matchedEvent.timeAt,
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
          {
            version: APP_VERSION,
            error: error.message || "Request failed."
          },
          { status: 500 }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
