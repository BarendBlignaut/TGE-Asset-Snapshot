const APP_VERSION = "1.4";

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

function getMatchingEvents(events, vehicleId) {
  return events
    .filter(function (event) {
      return (
        String(event.vehicleId) === String(vehicleId) &&
        String(event.action || "").toUpperCase() === "SNAPSHOT"
      );
    })
    .sort(function (a, b) {
      return new Date(b.timeAt) - new Date(a.timeAt);
    });
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractImagesFromParsedContext(contextText) {
  const parsed = parseJson(contextText);
  const mediaFiles = parsed?.response?.mediaFiles;

  if (!Array.isArray(mediaFiles)) {
    return [];
  }

  const extracted = [];

  CAMERA_RULES.forEach(function (rule, index) {
    const match = mediaFiles.find(function (item) {
      const sources = item?.imageDetails?.sources;
      return (
        item &&
        item.mediaType === "IMAGE" &&
        typeof item.mediaFile === "string" &&
        Array.isArray(sources) &&
        sources.includes(rule.key)
      );
    });

    if (match) {
      extracted.push({
        cameraNumber: index + 1,
        cameraKey: rule.key,
        label: rule.label,
        rawUrl: match.mediaFile
      });
    }
  });

  return extracted;
}

function extractImagesFromRawContext(contextText) {
  const extracted = [];

  CAMERA_RULES.forEach(function (rule, index) {
    const pattern = new RegExp(
      '"sources":\\["' +
        escapeRegex(rule.key) +
        '"\\][\\s\\S]*?"mediaType":"IMAGE"[\\s\\S]*?"mediaFile":"(https:\\\\/\\\\/[^"]+response-content-disposition=attachment)"',
      "i"
    );

    const match = contextText.match(pattern);

    if (match && match[1]) {
      const rawUrl = match[1].replace(/\\\//g, "/");

      extracted.push({
        cameraNumber: index + 1,
        cameraKey: rule.key,
        label: rule.label,
        rawUrl: rawUrl
      });
    }
  });

  return extracted;
}

function extractCameraImages(contextText) {
  const fromParsed = extractImagesFromParsedContext(contextText);

  if (fromParsed.length > 0) {
    return {
      method: "parsed-json",
      images: fromParsed
    };
  }

  const fromRaw = extractImagesFromRawContext(contextText);

  return {
    method: "raw-text",
    images: fromRaw
  };
}

function buildEventSummary(event) {
  const contextText = event?.attributes?.context || "";
  const extraction = extractCameraImages(contextText);

  return {
    eventId: event?.id ?? null,
    vehicleId: event?.vehicleId ?? null,
    action: event?.action ?? null,
    timeAt: event?.timeAt ?? null,
    imageCount: extraction.images.length,
    extractionMethod: extraction.method,
    images: extraction.images,
    rawEvent: event
  };
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
        const matchingEvents = getMatchingEvents(events, vehicleId);

        if (matchingEvents.length === 0) {
          return Response.json(
            {
              version: APP_VERSION,
              error: "No SNAPSHOT events found for that vehicle ID."
            },
            { status: 404 }
          );
        }

        const eventSummaries = matchingEvents.map(buildEventSummary);
        const firstEvent = eventSummaries[0];

        return Response.json(
          {
            version: APP_VERSION,
            requestedVehicleId: vehicleId,
            matchedVehicleId: firstEvent.vehicleId,
            eventCount: eventSummaries.length,
            latestEventId: firstEvent.eventId,
            latestEventTime: firstEvent.timeAt,
            latestAction: firstEvent.action,
            latestImageCount: firstEvent.imageCount,
            latestExtractionMethod: firstEvent.extractionMethod,
            latestImages: firstEvent.images,
            matchingEvents: eventSummaries
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
