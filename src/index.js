function parseContext(contextText) {
  try {
    return JSON.parse(contextText);
  } catch {
    return null;
  }
}

function buildImageLabel(mediaFile, index) {
  const sourceName = mediaFile.source || "Unknown";
  const detailedSources =
    mediaFile.imageDetails &&
    Array.isArray(mediaFile.imageDetails.sources) &&
    mediaFile.imageDetails.sources.length > 0
      ? mediaFile.imageDetails.sources.join(", ")
      : "";

  if (detailedSources) {
    return sourceName + " (" + detailedSources + ")";
  }

  return sourceName || "Camera " + (index + 1);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/events") {
      const vehicleId = url.searchParams.get("vehicleId");

      if (!vehicleId) {
        return Response.json(
          { error: "vehicleId is required." },
          { status: 400 }
        );
      }

      const upstreamUrl =
        "https://api-au.telematics.com/v1/events?types=camera&pruning=B2B&key=" +
        encodeURIComponent(env.TELEMATICS_API_KEY);

      const upstreamResponse = await fetch(upstreamUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });

      if (!upstreamResponse.ok) {
        const errorBody = await upstreamResponse.text();
        return Response.json(
          {
            error: "Upstream API failed.",
            details: errorBody
          },
          { status: upstreamResponse.status }
        );
      }

      const events = await upstreamResponse.json();

      if (!Array.isArray(events)) {
        return Response.json(
          { error: "Unexpected API response format." },
          { status: 500 }
        );
      }

      const matchingEvents = events
        .filter(function (event) {
          return String(event.vehicleId) === String(vehicleId);
        })
        .sort(function (a, b) {
          return new Date(b.timeAt) - new Date(a.timeAt);
        });

      if (matchingEvents.length === 0) {
        return Response.json(
          { error: "No events found for that vehicle ID." },
          { status: 404 }
        );
      }

      const latestEvent = matchingEvents[0];
      const context = parseContext(
        latestEvent.attributes && latestEvent.attributes.context
          ? latestEvent.attributes.context
          : ""
      );

      const mediaFiles =
        context &&
        context.response &&
        Array.isArray(context.response.mediaFiles)
          ? context.response.mediaFiles
          : [];

      if (mediaFiles.length === 0) {
        return Response.json(
          { error: "Vehicle found, but no camera images were available." },
          { status: 404 }
        );
      }

      const images = mediaFiles
        .filter(function (mediaFile) {
          return mediaFile.mediaType === "IMAGE" && mediaFile.mediaFile;
        })
        .map(function (mediaFile, index) {
          return {
            label: buildImageLabel(mediaFile, index),
            url: mediaFile.mediaFile
          };
        });

      return Response.json(
        {
          vehicleId: latestEvent.vehicleId,
          eventId: latestEvent.id,
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
    }

    return env.ASSETS.fetch(request);
  }
};
