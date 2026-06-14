// TGE Asset Snapshot — Cloudflare Worker
// src/index.js

const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const SESSION_COOKIE      = "tge_session";

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setCookieHeader(id, maxAge) {
  return `${SESSION_COOKIE}=${id}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

function getCookieValue(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match  = header.split(";").map(c => c.trim()).find(c => c.startsWith(name + "="));
  return match ? match.slice(name.length + 1) : null;
}

async function sha256(text) {
  const buf    = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomId() {
  return crypto.randomUUID().replace(/-/g, "");
}

function nowIso() {
  return new Date().toISOString();
}

function expiresIso() {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
}

async function safeJson(request) {
  try { return await request.json(); } catch { return {}; }
}

// ── Session ───────────────────────────────────────────────────────────────────

async function getSession(request, env) {
  const id = getCookieValue(request, SESSION_COOKIE);
  if (!id) return null;

  const row = await env.DB.prepare(
    "SELECT s.id, s.user_id, s.expires_at, u.username, u.first_name, u.last_name, u.role_id, r.name as role_name, u.status FROM sessions s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id WHERE s.id = ? AND s.expires_at > ?"
  ).bind(id, nowIso()).first();

  if (!row) return null;
  if (row.status !== "active") return null;
  return row;
}

async function requireSession(request, env) {
  const session = await getSession(request, env);
  if (!session) {
    return { ok: false, response: jsonResponse({ error: "Unauthorised" }, 401) };
  }
  return { ok: true, session };
}

// ── Permission check ──────────────────────────────────────────────────────────

async function hasPermission(env, roleId, feature, action) {
  const row = await env.DB.prepare(
    "SELECT enabled, limit_value FROM permissions WHERE role_id = ? AND feature = ? AND action = ?"
  ).bind(roleId, feature, action).first();
  if (!row) return { allowed: false, limit: null };
  return { allowed: row.enabled === 1, limit: row.limit_value };
}

// ── Activity log ──────────────────────────────────────────────────────────────

async function logActivity(env, userId, feature, action, detail, ip) {
  await env.DB.prepare(
    "INSERT INTO activity_log (user_id, feature, action, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(userId, feature, action, detail || null, ip || null, nowIso()).run();
}

// ── Route handlers ────────────────────────────────────────────────────────────

// POST /api/auth/login
async function handleLogin(request, env) {
  const body     = await safeJson(request);
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "").trim();

  if (!username || !password) {
    return jsonResponse({ error: "Username and password are required." }, 400);
  }

  const hash = await sha256(password);

  const user = await env.DB.prepare(
    "SELECT u.id, u.username, u.first_name, u.last_name, u.email, u.role_id, u.status, r.name as role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.username = ? AND u.password_hash = ?"
  ).bind(username, hash).first();

  if (!user) {
    return jsonResponse({ error: "Invalid username or password." }, 401);
  }

  if (user.status !== "active") {
    return jsonResponse({ error: "Account is inactive. Contact your administrator." }, 403);
  }

  // Create session
  const sessionId = randomId();
  const ip        = request.headers.get("CF-Connecting-IP") || null;

  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?)"
  ).bind(sessionId, user.id, nowIso(), expiresIso(), ip).run();

  // Log activity
  await logActivity(env, user.id, "auth", "login", null, ip);

  const response = jsonResponse({
    ok:        true,
    user: {
      id:        user.id,
      username:  user.username,
      firstName: user.first_name,
      lastName:  user.last_name,
      email:     user.email,
      role:      user.role_name,
      roleId:    user.role_id,
    },
  });

  return new Response(response.body, {
    status:  200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie":   setCookieHeader(sessionId, SESSION_TTL_SECONDS),
    },
  });
}

// POST /api/auth/logout
async function handleLogout(request, env) {
  const id = getCookieValue(request, SESSION_COOKIE);
  if (id) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
  }
  return new Response(JSON.stringify({ ok: true }), {
    status:  200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie":   setCookieHeader("", 0),
    },
  });
}

// GET /api/auth/session
async function handleSession(request, env) {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ ok: false });

  // Load permissions for this role
  const perms = await env.DB.prepare(
    "SELECT feature, action, enabled, limit_value FROM permissions WHERE role_id = ? AND enabled = 1"
  ).bind(session.role_id).all();

  // Build permission map: { feature: { action: { enabled, limit } } }
  const permMap = {};
  for (const p of (perms.results || [])) {
    if (!permMap[p.feature]) permMap[p.feature] = {};
    permMap[p.feature][p.action] = { enabled: true, limit: p.limit_value };
  }

  return jsonResponse({
    ok: true,
    user: {
      id:        session.user_id,
      username:  session.username,
      firstName: session.first_name,
      lastName:  session.last_name,
      role:      session.role_name,
      roleId:    session.role_id,
    },
    permissions: permMap,
  });
}

// GET /api/admin/users
async function handleGetUsers(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const perm = await hasPermission(env, auth.session.role_id, "admin", "view");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const users = await env.DB.prepare(
    "SELECT u.id, u.username, u.first_name, u.last_name, u.email, u.status, u.created_at, u.updated_at, r.name as role_name FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.first_name"
  ).all();

  return jsonResponse({ users: users.results || [] });
}

// POST /api/admin/users
async function handleCreateUser(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const perm = await hasPermission(env, auth.session.role_id, "admin", "run");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const body      = await safeJson(request);
  const username  = String(body.username  || "").trim().toLowerCase();
  const password  = String(body.password  || "").trim();
  const firstName = String(body.firstName || "").trim();
  const lastName  = String(body.lastName  || "").trim();
  const email     = String(body.email     || "").trim();
  const roleId    = parseInt(body.roleId) || 3;
  const status    = body.status === "inactive" ? "inactive" : "active";

  if (!username || !password || !firstName || !lastName) {
    return jsonResponse({ error: "Username, password, first name and last name are required." }, 400);
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (existing) return jsonResponse({ error: "Username already exists." }, 409);

  const hash = await sha256(password);

  await env.DB.prepare(
    "INSERT INTO users (username, password_hash, first_name, last_name, email, role_id, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(username, hash, firstName, lastName, email || null, roleId, status, auth.session.user_id, nowIso(), nowIso()).run();

  await logActivity(env, auth.session.user_id, "admin", "create-user", `Created user: ${username}`, null);

  return jsonResponse({ ok: true });
}

// PUT /api/admin/users/:id
async function handleUpdateUser(request, env, userId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const perm = await hasPermission(env, auth.session.role_id, "admin", "run");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const body      = await safeJson(request);
  const firstName = String(body.firstName || "").trim();
  const lastName  = String(body.lastName  || "").trim();
  const username  = String(body.username  || "").trim().toLowerCase();
  const email     = String(body.email     || "").trim();
  const roleId    = parseInt(body.roleId, 10);
  const status    = body.status === "inactive" ? "inactive" : "active";

  // Validate
  if (!firstName || !lastName || !username) {
    return jsonResponse({ error: "First name, last name and username are required." }, 400);
  }
  if (isNaN(roleId) || roleId < 1) {
    return jsonResponse({ error: "Invalid role." }, 400);
  }

  // Check username not taken by another user
  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?"
  ).bind(username, userId).first();
  if (existing) return jsonResponse({ error: "Username '" + username + "' is already taken by another user." }, 409);

  // Debug — return what we are about to update
  const debugInfo = { userId, firstName, lastName, username, email, roleId, status };

  let sql    = "UPDATE users SET first_name=?, last_name=?, username=?, email=?, role_id=?, status=?, updated_at=?";
  let params = [firstName, lastName, username, email || null, roleId, status, nowIso()];

  if (body.password && String(body.password).trim()) {
    const hash = await sha256(String(body.password).trim());
    sql    += ", password_hash=?";
    params.push(hash);
  }

  sql += " WHERE id=?";
  params.push(userId);

  await env.DB.prepare(sql).bind(...params).run();
  await logActivity(env, auth.session.user_id, "admin", "update-user", `Updated user id: ${userId} (${username})`, null);

  // Return updated user for confirmation
  const updated = await env.DB.prepare(
    "SELECT id, username, first_name, last_name, role_id, status, updated_at FROM users WHERE id = ?"
  ).bind(userId).first();

  return jsonResponse({ ok: true, user: updated, debug: debugInfo });
}

// DELETE /api/admin/users/:id
async function handleDeleteUser(request, env, userId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  // Prevent deleting own account
  if (String(userId) === String(auth.session.user_id)) {
    return jsonResponse({ error: "You cannot delete your own account." }, 400);
  }

  const perm = await hasPermission(env, auth.session.role_id, "admin", "run");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  await env.DB.prepare("UPDATE users SET status='inactive', updated_at=? WHERE id=?").bind(nowIso(), userId).run();
  await logActivity(env, auth.session.user_id, "admin", "delete-user", `Deactivated user id: ${userId}`, null);

  return jsonResponse({ ok: true });
}

// GET /api/admin/roles
async function handleGetRoles(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const roles = await env.DB.prepare("SELECT * FROM roles ORDER BY id").all();
  return jsonResponse({ roles: roles.results || [] });
}

// GET /api/admin/permissions/:roleId
async function handleGetPermissions(request, env, roleId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const perm = await hasPermission(env, auth.session.role_id, "admin", "view");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const perms = await env.DB.prepare(
    "SELECT * FROM permissions WHERE role_id = ? ORDER BY feature, action"
  ).bind(roleId).all();

  return jsonResponse({ permissions: perms.results || [] });
}

// PUT /api/admin/permissions/:roleId
async function handleUpdatePermissions(request, env, roleId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const perm = await hasPermission(env, auth.session.role_id, "admin", "run");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const body = await safeJson(request);
  const permissions = Array.isArray(body.permissions) ? body.permissions : [];

  for (const p of permissions) {
    await env.DB.prepare(
      "INSERT INTO permissions (role_id, feature, action, enabled, limit_value) VALUES (?, ?, ?, ?, ?) ON CONFLICT(role_id, feature, action) DO UPDATE SET enabled=excluded.enabled, limit_value=excluded.limit_value"
    ).bind(roleId, p.feature, p.action, p.enabled ? 1 : 0, p.limit || null).run();
  }

  await logActivity(env, auth.session.user_id, "admin", "update-permissions", `Updated permissions for role: ${roleId}`, null);
  return jsonResponse({ ok: true });
}

// GET /api/admin/activity
async function handleGetActivity(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const perm = await hasPermission(env, auth.session.role_id, "admin", "view");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const url      = new URL(request.url);
  const userId   = url.searchParams.get("userId") || null;
  const feature  = url.searchParams.get("feature") || null;
  const limit    = Math.min(parseInt(url.searchParams.get("limit") || "200"), 500);

  let sql    = "SELECT a.*, u.username, u.first_name, u.last_name FROM activity_log a JOIN users u ON u.id = a.user_id WHERE 1=1";
  let params = [];

  if (userId)  { sql += " AND a.user_id = ?"; params.push(userId); }
  if (feature) { sql += " AND a.feature = ?"; params.push(feature); }

  sql += " ORDER BY a.created_at DESC LIMIT ?";
  params.push(limit);

  const rows = await env.DB.prepare(sql).bind(...params).all();
  return jsonResponse({ activity: rows.results || [] });
}

// POST /api/admin/roles
async function handleCreateRole(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const perm = await hasPermission(env, auth.session.role_id, "admin", "run");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);

  const body        = await safeJson(request);
  const name        = String(body.name        || "").trim().toLowerCase().replace(/\s+/g, "-");
  const description = String(body.description || "").trim();

  if (!name) return jsonResponse({ error: "Role name is required." }, 400);

  const existing = await env.DB.prepare("SELECT id FROM roles WHERE name = ?").bind(name).first();
  if (existing) return jsonResponse({ error: "Role name already exists." }, 409);

  const result = await env.DB.prepare(
    "INSERT INTO roles (name, description, created_at) VALUES (?, ?, ?)"
  ).bind(name, description || null, nowIso()).run();

  // Copy permissions from user role as default
  await env.DB.prepare(
    "INSERT INTO permissions (role_id, feature, action, enabled, limit_value) SELECT ?, feature, action, 0, limit_value FROM permissions WHERE role_id = 3"
  ).bind(result.meta.last_row_id).run();

  await logActivity(env, auth.session.user_id, "admin", "create-role", `Created role: ${name}`, null);
  return jsonResponse({ ok: true, roleId: result.meta.last_row_id });
}

// ── Telematics API proxy ──────────────────────────────────────────────────────

async function handleTelematicsProxy(request, env, path) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  if (!env.TN360_API_KEY) {
    return jsonResponse({ error: "Telematics API key not configured." }, 503);
  }

  const url      = new URL(request.url);
  const upstream = `https://api-au.telematics.com${path}?key=${env.TN360_API_KEY}&${url.searchParams.toString()}`;

  const res = await fetch(upstream, { method: request.method });
  if (!res.ok) return jsonResponse({ error: `Upstream error: HTTP ${res.status}` }, 502);

  const data = await res.json();
  return jsonResponse(data);
}

// ── Image proxy ───────────────────────────────────────────────────────────────

async function handleImageProxy(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const body     = await safeJson(request);
  const imageUrl = String(body.url || "").trim();
  if (!imageUrl) return jsonResponse({ error: "url is required." }, 400);

  let parsed;
  try { parsed = new URL(imageUrl); } catch { return jsonResponse({ error: "Invalid URL." }, 400); }

  const allowedSuffixes = [".amazonaws.com", ".cloudfront.net", "telematics.com", "tn360.com", "openstreetmap.org", "openstreetmap.de"];
  const allowed = allowedSuffixes.some(s => parsed.hostname.endsWith(s));
  if (!allowed) return jsonResponse({ error: "URL host not permitted.", blockedHost: parsed.hostname }, 403);

  const res = await fetch(imageUrl);
  if (!res.ok) return jsonResponse({ error: `Upstream error: HTTP ${res.status}` }, 502);

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buffer      = await res.arrayBuffer();

  return new Response(buffer, {
    status:  200,
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=300" },
  });
}

// ── Main fetch handler ────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    // ── API routes ──────────────────────────────────────────────────────────
    if (path.startsWith("/api/")) {

      // Auth
      if (method === "POST" && path === "/api/auth/login")   return handleLogin(request, env);
      if (method === "POST" && path === "/api/auth/logout")  return handleLogout(request, env);
      if (method === "GET"  && path === "/api/auth/session") return handleSession(request, env);

      // Admin — users
      if (method === "GET"    && path === "/api/admin/users")       return handleGetUsers(request, env);
      if (method === "POST"   && path === "/api/admin/users")       return handleCreateUser(request, env);
      if (method === "PUT"    && path.match(/^\/api\/admin\/users\/\d+$/)) {
        const id = parseInt(path.split("/").pop(), 10);
        return handleUpdateUser(request, env, id);
      }
      if (method === "DELETE" && path.match(/^\/api\/admin\/users\/\d+$/)) {
        const id = parseInt(path.split("/").pop(), 10);
        return handleDeleteUser(request, env, id);
      }

      // Admin — roles
      if (method === "GET"  && path === "/api/admin/roles") return handleGetRoles(request, env);
      if (method === "POST" && path === "/api/admin/roles") return handleCreateRole(request, env);

      // Admin — permissions
      if (method === "GET" && path.match(/^\/api\/admin\/permissions\/\d+$/)) {
        const roleId = parseInt(path.split("/").pop(), 10);
        return handleGetPermissions(request, env, roleId);
      }
      if (method === "PUT" && path.match(/^\/api\/admin\/permissions\/\d+$/)) {
        const roleId = parseInt(path.split("/").pop(), 10);
        return handleUpdatePermissions(request, env, roleId);
      }

      // Admin — activity log
      if (method === "GET" && path === "/api/admin/activity") return handleGetActivity(request, env);

      // Image proxy
      if (method === "POST" && path === "/api/image-proxy") return handleImageProxy(request, env);

      // Telematics proxy — forward /api/tn360/* to telematics API
      if (path.startsWith("/api/tn360/")) {
        const tnPath = path.replace("/api/tn360", "");
        return handleTelematicsProxy(request, env, tnPath);
      }

      // Health check
      if (path === "/api/ping") return jsonResponse({ ok: true });

      return jsonResponse({ error: "Not found." }, 404);
    }

    // ── Static assets ───────────────────────────────────────────────────────
    try {
      if (env.ASSETS) {
        const assetRes = await env.ASSETS.fetch(request);
        if (assetRes.status !== 404) return assetRes;
        // Return 404 for missing assets instead of crashing
        return new Response('Not found', { status: 404 });
      }
      return new Response('Not found', { status: 404 });
    } catch (e) {
      return new Response('Asset error: ' + e.message, { status: 500 });
    }
  },
};
