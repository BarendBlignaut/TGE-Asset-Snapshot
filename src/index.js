function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/api/ping") {
        return jsonResponse({
          ok: true,
          hasKey: Boolean(env.TN360_API_KEY),
        });
      }

      if (url.pathname === "/api/tn360-users") {
        const username = String(url.searchParams.get("username") || "").trim();

        if (!username) {
          return jsonResponse({ error: "Username is required." }, 400);
        }

        if (!env.TN360_API_KEY) {
          return jsonResponse({ error: "Missing TN360_API_KEY" }, 500);
        }

        const tnUrl = `https://api-au.telematics.com/v1/users/?key=${env.TN360_API_KEY}&pruning=B2B`;
        const tnResponse = await fetch(tnUrl);

        if (!tnResponse.ok) {
          return jsonResponse(
            { error: `TN360 HTTP ${tnResponse.status}` },
            502,
          );
        }

        const users = await tnResponse.json();

        const matchedUser = users.find(
          (user) =>
            String(user.username || "").toLowerCase() === username.toLowerCase(),
        );

        if (!matchedUser) {
          return jsonResponse({ error: "TN360 user not found." }, 404);
        }

        return jsonResponse({
          ok: true,
          username: matchedUser.username,
          status: matchedUser.status,
          externalPin: matchedUser.externalPin || null,
          roles: matchedUser.roles || [],
        });
      }

      return new Response("Not found", { status: 404 });
    } catch (error) {
      return jsonResponse(
        {
          error: "Worker runtime failure",
          detail: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  },
};
