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
  const source = mediaFile?.source || "Camera";
  const details = mediaFile?.imageDetails?.sources;

  if (Array.isArray(details) && details.length > 0) {
    return source + " (" + details.join(", ") + ")";
  }

  return source + " " + (index + 1);
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
          { error: "vehicleId is required." },
          { status: 400 }
        );
      }

      try {
        const events = await fetchCameraEvents(env);
        const latestEvent = getLatestMatchingEvent(events, vehicleId);

        if (!latestEvent) {
          return Response.json(
            { error: "No events found for that vehicle ID." },
            { status: 404 }
          );
        }

        const mediaFiles = getMediaFilesFromEvent(latestEvent);

        if (mediaFiles.length === 0) {
          return Response.json(
            { error: "Vehicle found, but no camera images were available." },
            { status: 404 }
          );
        }

        const images = mediaFiles.map(function (mediaFile, index) {
          return {
            index: index,
            label: buildLabel(mediaFile, index),
            imageUrl:
              "/api/image?vehicleId=" +
              encodeURIComponent(vehicleId) +
              "&index=" +
              index
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
      } catch (error) {
        return Response.json(
          { error: error.message || "Request failed." },
          { status: 500 }
        );
      }
    }

    if (url.pathname === "/api/image") {
      const vehicleId = url.searchParams.get("vehicleId");
      const indexParam = url.searchParams.get("index");

      if (!vehicleId || indexParam === null) {
        return new Response("Missing vehicleId or index.", { status: 400 });
      }

      const imageIndex = Number(indexParam);

      if (!Number.isInteger(imageIndex) || imageIndex < 0) {
        return new Response("Invalid image index.", { status: 400 });
      }

      try {
        const events = await fetchCameraEvents(env);
        const latestEvent = getLatestMatchingEvent(events, vehicleId);

        if (!latestEvent) {
          return new Response("No matching vehicle found.", { status: 404 });
        }

        const mediaFiles = getMediaFilesFromEvent(latestEvent);

        if (!mediaFiles[imageIndex]) {
          return new Response("Image not found.", { status: 404 });
        }

        const upstreamImageUrl = mediaFiles[imageIndex].mediaFile;
        const imageResponse = await fetch(upstreamImageUrl);

        if (!imageResponse.ok) {
          return new Response("Failed to fetch image.", { status: 502 });
        }

        return new Response(imageResponse.body, {
          status: 200,
          headers: {
            "Content-Type":
              imageResponse.headers.get("Content-Type") || "image/jpeg",
            "Cache-Control": "no-store"
          }
        });
      } catch (error) {
        return new Response("Image request failed.", { status: 500 });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
