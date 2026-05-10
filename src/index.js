export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/events") {
      const upstreamUrl =
        "https://api-au.telematics.com/v1/events?types=camera&pruning=B2B&key=" +
        encodeURIComponent(env.TELEMATICS_API_KEY);

      const upstreamResponse = await fetch(upstreamUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });

      const body = await upstreamResponse.text();

      return new Response(body, {
        status: upstreamResponse.status,
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "Cache-Control": "no-store"
        }
      });
    }

    return env.ASSETS.fetch(request);
  }
};
