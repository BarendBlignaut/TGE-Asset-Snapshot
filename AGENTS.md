# AGENTS.md

## Cursor Cloud specific instructions

This is a **Cloudflare Workers** application (TGE Asset Snapshot) — a fleet/vehicle telematics dashboard. It has no build step and uses plain JavaScript with static HTML/CSS assets.

### Running locally

```bash
npm run dev        # starts wrangler dev on port 8787
```

The app runs in **demo mode** by default (no `TN360_API_KEY` needed). Demo mode provides hardcoded vehicle/device data so all features can be tested without external API access.

### Demo login credentials

- Username: `bare1234`
- Password: `12345678`
- Demo vehicle fleet number: `1001`

### Key architecture notes

- Single Cloudflare Worker entry point at `src/index.js` — handles all API routes and session auth
- Static frontend in `public/` — vanilla JS SPA (`app.js` + `index.html`)
- No database — all user and history data is in-memory (resets on Worker restart)
- Session auth uses HMAC-SHA256 signed cookies; defaults to a hardcoded demo secret when `SESSION_SECRET` is not set

### Environment variables (optional)

- `TN360_API_KEY` — enables live mode connecting to `api-au.telematics.com`; omit for demo mode
- `SESSION_SECRET` — production session signing key; defaults to a demo value

### Testing

No automated test framework is configured. Manual testing via the browser or `curl` against `http://localhost:8787` is the primary validation method. The `/api/ping` endpoint returns `{"ok":true,"mode":"demo","hasKey":false}` in demo mode and is useful for health checks.

### Gotchas

- The wrangler dev server binds to `localhost:8787` by default.
- In-memory data (approved users, access history) resets every time the Worker restarts.
- The `wrangler.jsonc` config references `node_modules/wrangler/config-schema.json`, so `npm install` must run before wrangler can validate the config schema.
