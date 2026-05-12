async function handleCameraSnapshots(request, env) {
  requireEnv(env);

  const body = await request.json();
  const vehicleId = String(body.vehicleId || "").trim();

  if (!vehicleId) {
    return jsonResponse({ error: "Vehicle ID is required." }, 400);
  }

  const now = new Date();
  const to = now.toISOString();
  const fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const from = fromDate.toISOString();

  const eventsUrl = `https://api-au.telematics.com/v1/events/?key=${env.TN360_API_KEY}&pruning=B2B&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const response = await fetch(eventsUrl);

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    return jsonResponse(
      {
        error: `Camera snapshot lookup failed. HTTP ${response.status}`,
        detail: responseText || "No response body returned from TN360 events endpoint.",
        request: {
          vehicleId,
          from,
          to,
        },
      },
      502,
    );
  }

  const events = await response.json();

  const matchedEvents = Array.isArray(events)
    ? events.filter((event) => String(event.vehicleId || "") === vehicleId)
    : [];

  return jsonResponse(matchedEvents);
}
