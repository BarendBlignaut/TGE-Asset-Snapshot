// TGE Asset Snapshot — Cloudflare Worker
// src/index.js

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

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

  // Step 1 — find user by username + password hash
  const user = await env.DB.prepare(
    "SELECT u.id, u.username, u.first_name, u.last_name, u.email, u.role_id, u.status, u.login_type, r.name as role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.username = ? AND u.password_hash = ?"
  ).bind(username, hash).first();

  if (!user) {
    return jsonResponse({ error: "Invalid username or password." }, 401);
  }

  if (user.status !== "active") {
    return jsonResponse({ error: "Account is inactive. Contact your administrator." }, 403);
  }

  // Step 2 — if login_type is db_vendor, run TN360 hard checks
  if (user.login_type === "db_vendor" && env.TN360_API_KEY) {
    try {
      const tn360Res = await fetch(
        `https://api-au.telematics.com/v1/users/?key=${env.TN360_API_KEY}&pruning=B2B`
      );
      if (!tn360Res.ok) {
        return jsonResponse({ error: "Vendor verification service unavailable. Please try again." }, 503);
      }
      const tn360Users = await tn360Res.json();

      // Hard Check 1 — find matching username in TN360
      const tn360User = Array.isArray(tn360Users)
        ? tn360Users.find(u => String(u.username || "").toLowerCase() === username)
        : null;
      if (!tn360User) {
        return jsonResponse({ error: "Vendor verification failed — user not found in vendor system." }, 401);
      }

      // Hard Check 2 — must have Driver role in TN360
      const isDriver = Array.isArray(tn360User.roles)
        ? tn360User.roles.some(r => r.name === "Driver")
        : false;
      if (!isDriver) {
        return jsonResponse({ error: "Vendor verification failed — account is not a Driver." }, 403);
      }

      // Hard Check 3 — externalPin must match password
      if (String(tn360User.externalPin || "") !== password) {
        return jsonResponse({ error: "Vendor verification failed — invalid credentials." }, 401);
      }
    } catch (e) {
      return jsonResponse({ error: "Vendor verification error: " + e.message }, 503);
    }
  }

  // Step 3 — create session
  const sessionId = randomId();
  const ip        = request.headers.get("CF-Connecting-IP") || null;

  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?)"
  ).bind(sessionId, user.id, nowIso(), expiresIso(), ip).run();

  await logActivity(env, user.id, "auth", "login", "login_type:" + (user.login_type || "db_only"), ip);

  // Build the same permission map handleSession returns, so a fresh login
  // gets full permissions immediately without requiring a page refresh.
  const perms = await env.DB.prepare(
    "SELECT feature, action, enabled, limit_value FROM permissions WHERE role_id = ? AND enabled = 1"
  ).bind(user.role_id).all();

  const permMap = {};
  for (const p of (perms.results || [])) {
    if (!permMap[p.feature]) permMap[p.feature] = {};
    permMap[p.feature][p.action] = { enabled: true, limit: p.limit_value };
  }

  const response = jsonResponse({
    ok:   true,
    user: {
      id:        user.id,
      username:  user.username,
      firstName: user.first_name,
      lastName:  user.last_name,
      email:     user.email,
      role:      user.role_name,
      roleId:    user.role_id,
      loginType: user.login_type || "db_only",
    },
    permissions: permMap,
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

  const loginType = ["db_only","db_vendor"].includes(body.loginType) ? body.loginType : "db_only";

  await env.DB.prepare(
    "INSERT INTO users (username, password_hash, first_name, last_name, email, role_id, status, login_type, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(username, hash, firstName, lastName, email || null, roleId, status, loginType, auth.session.user_id, nowIso(), nowIso()).run();

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

  const loginType = ["db_only","db_vendor"].includes(body.loginType) ? body.loginType : "db_only";
  let sql    = "UPDATE users SET first_name=?, last_name=?, username=?, email=?, role_id=?, status=?, login_type=?, updated_at=?";
  let params = [firstName, lastName, username, email || null, roleId, status, loginType, nowIso()];
  
  console.log("[Worker] UPDATE params:", JSON.stringify({ sql, params, userId }));

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

  return jsonResponse({ ok: true, user: updated, debug: debugInfo, params: params });
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

  const url = new URL(request.url);

  // Check if caller supplied a session token — try header first, then query param
  const sessionToken = request.headers.get("X-TN360-Token") || 
                       request.headers.get("x-tn360-token") ||
                       url.searchParams.get("_token") || null;

  console.log("[Worker] sessionToken present:", !!sessionToken, sessionToken ? sessionToken.slice(0,8) + "..." : "none");
  
  // Remove _token from params so it doesn't get forwarded
  url.searchParams.delete("_token");

  // Build upstream URL — session token endpoints don't use API key query param
  const upstream = sessionToken
    ? `https://api-au.telematics.com${path}?${url.searchParams.toString()}`
    : `https://api-au.telematics.com${path}?key=${env.TN360_API_KEY}&${url.searchParams.toString()}`;

  console.log("[Worker] upstream:", upstream.slice(0, 80));

  // Build fetch options
  const authHeader = sessionToken
    ? `Token token="${sessionToken}"`
    : null;

  const fetchOpts = {
    method: request.method,
    headers: authHeader
      ? { "Authorization": authHeader, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" },
  };

  console.log("[Worker] auth header:", authHeader ? authHeader.slice(0,20) + "..." : "none");

  if (request.method === "POST" || request.method === "PUT") {
    const body = await request.text();
    if (body) fetchOpts.body = body;
  }

  const res = await fetch(upstream, fetchOpts);
  if (!res.ok) return jsonResponse({ error: `Upstream error: HTTP ${res.status}` }, 502);

  const text = await res.text();
  if (!text) return jsonResponse({ ok: true, status: res.status });

  try {
    const data = JSON.parse(text);
    return jsonResponse(data);
  } catch(e) {
    return jsonResponse({ ok: true, raw: text });
  }
}

// ── Image proxy ───────────────────────────────────────────────────────────────


// ── Registry: API Definitions ─────────────────────────────────────────────────

async function handleRegistryGetApis(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const url   = new URL(request.url);
  const all   = url.searchParams.get("all") === "1";
  const query = all
    ? "SELECT * FROM registry_apis ORDER BY api_id"
    : "SELECT * FROM registry_apis WHERE active = 1 ORDER BY api_id";
  const rows  = await env.DB.prepare(query).all();
  const apis  = (rows.results || []).map(function(r) {
    return {
      apiId:          r.api_id,
      label:          r.label,
      group:          r.group_name,
      method:         r.method,
      url:            r.url,
      notes:          r.notes,
      vendor:         r.vendor,
      sampleResponse: r.sample_response,
      fields:         r.fields ? JSON.parse(r.fields) : [],
      active:         r.active === 1,
    };
  });
  return jsonResponse({ apis });
}

async function handleRegistryCreateApi(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const body = await safeJson(request);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO registry_apis (api_id, label, group_name, method, url, notes, vendor, sample_response, fields, active, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(body.apiId, body.label, body.group, body.method, body.url, body.notes||null, body.vendor||null, body.sampleResponse||null, JSON.stringify(body.fields||[]), 1, nowIso()).run();
  return jsonResponse({ ok: true });
}

async function handleRegistryUpdateApi(request, env, apiId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const body = await safeJson(request);
  const active = body.active === false ? 0 : 1;
  await env.DB.prepare(
    "INSERT OR REPLACE INTO registry_apis (api_id, label, group_name, method, url, notes, vendor, sample_response, fields, active, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(apiId, body.label, body.group, body.method, body.url, body.notes||null, body.vendor||null, body.sampleResponse||null, JSON.stringify(body.fields||[]), active, nowIso()).run();
  return jsonResponse({ ok: true });
}

async function handleRegistryDeleteApi(request, env, apiId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  await env.DB.prepare("DELETE FROM registry_apis WHERE api_id = ?").bind(apiId).run();
  return jsonResponse({ ok: true });
}

async function handleImageProxy(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  // Support both GET ?url=... and POST {url:...}
  let imageUrl = "";
  if (request.method === "GET") {
    const reqUrl = new URL(request.url);
    imageUrl = decodeURIComponent(reqUrl.searchParams.get("url") || "").trim();
  } else {
    const body = await safeJson(request);
    imageUrl = String(body.url || "").trim();
  }
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

// ── Public signed image proxy (for emails — no session required) ─────────────
// Uses HMAC signature with expiry so links work in email clients without login,
// but can't be abused as an open proxy by random third parties.

async function signImageUrl(env, imageUrl, expiresAt) {
  const secret = env.SESSION_SECRET || "fallback-secret";
  const payload = `${imageUrl}|${expiresAt}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

async function handlePublicImageProxy(request, env) {
  const reqUrl    = new URL(request.url);
  const imageUrl  = decodeURIComponent(reqUrl.searchParams.get("url") || "").trim();
  const expiresAt = reqUrl.searchParams.get("exp") || "";
  const sig       = reqUrl.searchParams.get("sig") || "";

  if (!imageUrl || !expiresAt || !sig) return new Response("Missing parameters", { status: 400 });
  if (Date.now() > parseInt(expiresAt, 10)) return new Response("Link expired", { status: 410 });

  const expectedSig = await signImageUrl(env, imageUrl, expiresAt);
  if (expectedSig !== sig) return new Response("Invalid signature", { status: 403 });

  let parsed;
  try { parsed = new URL(imageUrl); } catch { return new Response("Invalid URL", { status: 400 }); }

  const allowedSuffixes = [".amazonaws.com", ".cloudfront.net", "telematics.com"];
  const allowed = allowedSuffixes.some(s => parsed.hostname.endsWith(s));
  if (!allowed) return new Response("Host not permitted", { status: 403 });

  const res = await fetch(imageUrl);
  if (!res.ok) return new Response(`Upstream error: HTTP ${res.status}`, { status: 502 });

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buffer      = await res.arrayBuffer();

  return new Response(buffer, {
    status:  200,
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" },
  });
}

// ── Mailer signatures (D1-backed) ────────────────────────────────────────────

async function handleListSignatures(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const url    = new URL(request.url);
  const all    = url.searchParams.get("all") === "1";
  const query  = all
    ? "SELECT id, label, html, active, created_at, updated_at FROM mailer_signatures ORDER BY id ASC"
    : "SELECT id, label, html, active, created_at, updated_at FROM mailer_signatures WHERE active = 1 ORDER BY id ASC";

  const result = await env.DB.prepare(query).all();
  return jsonResponse({ ok: true, signatures: result.results || [] });
}

async function handleCreateSignature(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const body  = await safeJson(request);
  const label = String(body.label || "").trim();
  const html  = String(body.html  || "").trim();
  if (!label || !html) return jsonResponse({ error: "label and html are required." }, 400);

  await env.DB.prepare(
    "INSERT INTO mailer_signatures (label, html, active, created_at, updated_at) VALUES (?, ?, 1, datetime('now'), datetime('now'))"
  ).bind(label, html).run();

  return jsonResponse({ ok: true });
}

async function handleUpdateSignature(request, env, id) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const body = await safeJson(request);
  const updates = [];
  const values  = [];

  if (body.label != null) { updates.push("label = ?"); values.push(String(body.label).trim()); }
  if (body.html  != null) { updates.push("html = ?");  values.push(String(body.html).trim()); }
  if (body.active != null) { updates.push("active = ?"); values.push(body.active ? 1 : 0); }

  if (!updates.length) return jsonResponse({ error: "Nothing to update." }, 400);

  updates.push("updated_at = datetime('now')");
  values.push(id);

  await env.DB.prepare(
    `UPDATE mailer_signatures SET ${updates.join(", ")} WHERE id = ?`
  ).bind(...values).run();

  return jsonResponse({ ok: true });
}

// POST /api/sign-image-url — generates a signed public URL for embedding in emails
async function handleSignImageUrl(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const body     = await safeJson(request);
  const imageUrl = String(body.url || "").trim();
  if (!imageUrl) return jsonResponse({ error: "url is required." }, 400);

  // Links valid for 7 days — long enough for someone to open an email and view images
  const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
  const sig        = await signImageUrl(env, imageUrl, expiresAt);

  const reqUrlObj  = new URL(request.url);
  const publicUrl  = `${reqUrlObj.origin}/api/public-image?url=${encodeURIComponent(imageUrl)}&exp=${expiresAt}&sig=${sig}`;

  return jsonResponse({ ok: true, publicUrl });
}

// ── Camera fault report PDF generation ───────────────────────────────────────
//
// Layout constants below were measured and visually validated as a fixed
// spec (see project notes) — every asset-band has the EXACT same height
// regardless of content, so pagination is pure arithmetic: no band is ever
// measured at render time, and no band can ever overlap a page break.

const PDF_PAGE_W = 841.89;  // A4 landscape width in points
const PDF_PAGE_H = 595.28;  // A4 landscape height in points

const PDF_MARGIN_TOP    = 60;
const PDF_MARGIN_BOTTOM = 34;
const PDF_MARGIN_LEFT   = 26;
const PDF_MARGIN_RIGHT  = 26;

const PDF_HEADER_HEIGHT     = 14;
const PDF_PHOTO_LABEL_GAP   = 4;
const PDF_PHOTO_BOX_H       = 71;
const PDF_PHOTO_LABEL_H     = 10;
const PDF_STATUS_ROW_H      = 12;
const PDF_BAND_INTERNAL_PAD = 6;
const PDF_BAND_GAP          = 7;

const PDF_NUM_SLOTS   = 5;   // box width is always calculated for 5 slots, even
                              // when an asset has fewer — boxes never resize.
const PDF_PHOTO_GAP_X = 8;

const PDF_SLOT_LABELS = ["Road", "Driver", "In-Cab", "R.Ext", "L.Ext"];
const PDF_BRAND_GREEN = rgb(0.078, 0.325, 0.176); // #14532d

function pdfBandHeight() {
  return (
    PDF_BAND_INTERNAL_PAD +
    PDF_HEADER_HEIGHT +
    PDF_PHOTO_LABEL_GAP +
    PDF_PHOTO_BOX_H +
    PDF_PHOTO_LABEL_H +
    PDF_STATUS_ROW_H +
    PDF_BAND_INTERNAL_PAD
  );
}

function pdfMaxBandsPerPage() {
  const usableH = PDF_PAGE_H - PDF_MARGIN_TOP - PDF_MARGIN_BOTTOM;
  const bandH   = pdfBandHeight();
  let n = 1;
  while (n * bandH + (n - 1) * PDF_BAND_GAP <= usableH) n++;
  return n - 1;
}

// Fetches an image and returns its raw bytes + detected format ("jpg" or "png").
// Returns null if the fetch fails or the format isn't supported, so the
// caller can render an "image unavailable" placeholder instead of crashing.
async function fetchImageForPdf(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const buf = await res.arrayBuffer();
    if (contentType.includes("png")) return { bytes: buf, format: "png" };
    // Default to jpg — TN360 camera snapshots are always JPEG in practice.
    return { bytes: buf, format: "jpg" };
  } catch (e) {
    return null;
  }
}

function pdfDrawStatusDot(page, font, centerX, baselineY, isWorking) {
  const color = isWorking ? rgb(0.09, 0.64, 0.29) : rgb(0.86, 0.15, 0.15);
  const label = isWorking ? "OK" : "FAULT";
  const dotR  = 2.6;
  const labelW = font.widthOfTextAtSize(label, 7);
  const totalW = dotR * 2 + 3 + labelW;
  const startX = centerX - totalW / 2;
  page.drawCircle({ x: startX + dotR, y: baselineY + 2, size: dotR, color });
  page.drawText(label, { x: startX + dotR * 2 + 3, y: baselineY, size: 7, font, color });
}

// Builds the full multi-page camera fault report PDF.
// assets: [{ legacyNo, imei, model, slots: [{label, url|null, status:'working'|'not_working'|null}, ...up to 5], lastComms, systemDown }]
// Note: slots.length may be LESS than 5 (e.g. 2 for IQCamera) — only that
// many boxes are drawn, fixed-size, centered in the row. Never padded with
// placeholder/n-a boxes.
async function buildCameraFaultPdf(assets) {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const bandHeight = pdfBandHeight();
  const maxPerPage = pdfMaxBandsPerPage();
  const usableW     = PDF_PAGE_W - PDF_MARGIN_LEFT - PDF_MARGIN_RIGHT;
  const usableH     = PDF_PAGE_H - PDF_MARGIN_TOP - PDF_MARGIN_BOTTOM;
  const availInnerW = usableW - 12;
  // Fixed box width, ALWAYS based on 5 slots — identical size regardless of
  // how many cameras a given asset actually has (locked-in design decision).
  const fixedPhotoBoxW = (availInnerW - (PDF_NUM_SLOTS - 1) * PDF_PHOTO_GAP_X) / PDF_NUM_SLOTS;

  // Pre-fetch every image referenced across all assets, once each, in parallel
  // (deduped — same URL never fetched twice even if it appears more than once).
  const urlToImage = {};
  const fetchJobs = [];
  assets.forEach((asset) => {
    asset.slots.forEach((slot) => {
      if (slot && slot.url && !urlToImage[slot.url]) {
        urlToImage[slot.url] = null;
        fetchJobs.push(
          fetchImageForPdf(slot.url).then((result) => { urlToImage[slot.url] = result; })
        );
      }
    });
  });
  await Promise.all(fetchJobs);

  const urlToEmbedded = {};
  for (const url of Object.keys(urlToImage)) {
    const img = urlToImage[url];
    if (!img) continue;
    try {
      urlToEmbedded[url] = img.format === "png"
        ? await pdfDoc.embedPng(img.bytes)
        : await pdfDoc.embedJpg(img.bytes);
    } catch (e) {
      urlToEmbedded[url] = null;
    }
  }

  // Summary stats for the header strip
  let totalCams = 0, totalWorking = 0, totalNotWorking = 0;
  assets.forEach((a) => {
    a.slots.forEach((s) => {
      if (!s) return;
      totalCams++;
      if (s.status === "working") totalWorking++;
      else if (s.status === "not_working") totalNotWorking++;
    });
  });

  const pages = [];
  let page = null;
  let bandIndexOnPage = 0;

  function startNewPage() {
    page = pdfDoc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
    pages.push(page);
    bandIndexOnPage = 0;

    // Outer page border/frame
    page.drawRectangle({
      x: PDF_MARGIN_LEFT - 10, y: PDF_MARGIN_BOTTOM - 10,
      width: usableW + 20, height: usableH + 20,
      borderColor: rgb(0.82, 0.84, 0.86), borderWidth: 1,
    });

    // Title — centered
    const title = "Camera Fault Report";
    const titleW = fontBold.widthOfTextAtSize(title, 15);
    page.drawText(title, { x: (PDF_PAGE_W - titleW) / 2, y: PDF_PAGE_H - 26, size: 15, font: fontBold, color: rgb(0.07, 0.07, 0.07) });

    // Summary strip
    const summary = `${assets.length} Asset${assets.length !== 1 ? "s" : ""}   |   ${totalCams} Camera${totalCams !== 1 ? "s" : ""}   |   ${totalWorking} Working   |   ${totalNotWorking} Not Working`;
    const summaryW = fontRegular.widthOfTextAtSize(summary, 9);
    page.drawText(summary, { x: (PDF_PAGE_W - summaryW) / 2, y: PDF_PAGE_H - 42, size: 9, font: fontRegular, color: rgb(0.42, 0.45, 0.50) });
  }

  startNewPage();

  assets.forEach((asset, assetIdx) => {
    if (bandIndexOnPage >= maxPerPage) startNewPage();

    const bandTopY    = PDF_PAGE_H - PDF_MARGIN_TOP - bandIndexOnPage * (bandHeight + PDF_BAND_GAP);
    const bandBottomY = bandTopY - bandHeight;
    const isDown      = !!asset.systemDown;
    const isZebra      = bandIndexOnPage % 2 === 1;

    // Band background — system-down gets a red tint (takes priority over zebra)
    if (isDown) {
      page.drawRectangle({ x: PDF_MARGIN_LEFT, y: bandBottomY, width: usableW, height: bandHeight, color: rgb(0.996, 0.953, 0.953) });
    } else if (isZebra) {
      page.drawRectangle({ x: PDF_MARGIN_LEFT, y: bandBottomY, width: usableW, height: bandHeight, color: rgb(0.980, 0.984, 0.988) });
    }

    // Band border — always neutral grey (red tint comes from the fill above + accent line below, not the border)
    page.drawRectangle({
      x: PDF_MARGIN_LEFT, y: bandBottomY, width: usableW, height: bandHeight,
      borderColor: isDown ? rgb(0.99, 0.65, 0.65) : rgb(0.90, 0.91, 0.92), borderWidth: 1,
    });

    let cursorY = bandTopY - PDF_BAND_INTERNAL_PAD;

    // Compact header — name+model, IMEI, and Last Comms/Non-Functional all on ONE line
    const headerLabel = `Asset ${asset.legacyNo || "—"} — ${asset.model || "—"}`;
    page.drawText(headerLabel, {
      x: PDF_MARGIN_LEFT + 6, y: cursorY - 9, size: 10.5, font: fontBold, color: rgb(0.07, 0.07, 0.07),
    });
    const headerLabelW = fontBold.widthOfTextAtSize(headerLabel, 10.5);
    page.drawText(asset.imei || "—", {
      x: PDF_MARGIN_LEFT + 6 + headerLabelW + 10, y: cursorY - 9, size: 8, font: fontRegular, color: rgb(0.42, 0.45, 0.50),
    });

    const rightText  = isDown ? "⚠ NON-FUNCTIONAL" : `Last Comms: ${asset.lastComms || "Unknown"}`;
    const rightColor = isDown ? rgb(0.86, 0.15, 0.15) : rgb(0.22, 0.25, 0.32);
    const rightW = fontBold.widthOfTextAtSize(rightText, 8);
    page.drawText(rightText, { x: PDF_MARGIN_LEFT + usableW - 6 - rightW, y: cursorY - 9, size: 8, font: fontBold, color: rightColor });

    // Brand accent line under the header row (green normally, red if system-down)
    const headerBottomY = bandTopY - PDF_BAND_INTERNAL_PAD - PDF_HEADER_HEIGHT;
    page.drawLine({
      start: { x: PDF_MARGIN_LEFT + 6, y: headerBottomY },
      end:   { x: PDF_MARGIN_LEFT + usableW - 6, y: headerBottomY },
      thickness: 1.3, color: isDown ? rgb(0.86, 0.15, 0.15) : PDF_BRAND_GREEN,
    });

    cursorY -= PDF_HEADER_HEIGHT + PDF_PHOTO_LABEL_GAP;
    const photoTopY = cursorY;

    // Smart centering — only draw as many boxes as this asset actually has
    // slots for (n <= 5), all at the SAME fixed size, centered as a group.
    const n = asset.slots.length;
    const rowW   = n > 0 ? n * fixedPhotoBoxW + (n - 1) * PDF_PHOTO_GAP_X : 0;
    const startX = PDF_MARGIN_LEFT + 6 + (availInnerW - rowW) / 2;

    for (let slotIdx = 0; slotIdx < n; slotIdx++) {
      const slot = asset.slots[slotIdx];
      const bx = startX + slotIdx * (fixedPhotoBoxW + PDF_PHOTO_GAP_X);
      const by = photoTopY - PDF_PHOTO_BOX_H;
      const embedded = slot && slot.url ? urlToEmbedded[slot.url] : null;

      // Photo box border is ALWAYS neutral grey, even on system-down assets —
      // only the band background/accent line signals the fault, not the photo itself.
      if (embedded) {
        const scaled = embedded.scaleToFit(fixedPhotoBoxW, PDF_PHOTO_BOX_H);
        const offsetX = bx + (fixedPhotoBoxW - scaled.width) / 2;
        const offsetY = by + (PDF_PHOTO_BOX_H - scaled.height) / 2;
        page.drawRectangle({ x: bx, y: by, width: fixedPhotoBoxW, height: PDF_PHOTO_BOX_H, color: rgb(0.96, 0.96, 0.97) });
        page.drawImage(embedded, { x: offsetX, y: offsetY, width: scaled.width, height: scaled.height });
        page.drawRectangle({ x: bx, y: by, width: fixedPhotoBoxW, height: PDF_PHOTO_BOX_H, borderColor: rgb(0.82, 0.84, 0.86), borderWidth: 1 });
      } else {
        page.drawRectangle({ x: bx, y: by, width: fixedPhotoBoxW, height: PDF_PHOTO_BOX_H, color: rgb(0.96, 0.96, 0.97), borderColor: rgb(0.82, 0.84, 0.86), borderWidth: 1 });
        const label = "no image";
        const textWidth = fontRegular.widthOfTextAtSize(label, 7);
        page.drawText(label, { x: bx + fixedPhotoBoxW/2 - textWidth/2, y: by + PDF_PHOTO_BOX_H/2 - 3, size: 7, font: fontRegular, color: rgb(0.61, 0.64, 0.69) });
      }

      const slotLabel = (slot && slot.label) || PDF_SLOT_LABELS[slotIdx] || "—";
      const labelW = fontBold.widthOfTextAtSize(slotLabel, 7.5);
      page.drawText(slotLabel, {
        x: bx + fixedPhotoBoxW/2 - labelW/2, y: by - PDF_PHOTO_LABEL_H + 2, size: 7.5, font: fontBold, color: rgb(0.07, 0.07, 0.07),
      });

      if (slot && slot.status) {
        pdfDrawStatusDot(page, fontBold, bx + fixedPhotoBoxW/2, by - PDF_PHOTO_LABEL_H - PDF_STATUS_ROW_H + 6, slot.status === "working");
      } else {
        const dash = "—";
        const dashW = fontBold.widthOfTextAtSize(dash, 7);
        page.drawText(dash, { x: bx + fixedPhotoBoxW/2 - dashW/2, y: by - PDF_PHOTO_LABEL_H - PDF_STATUS_ROW_H + 6, size: 7, font: fontBold, color: rgb(0.82, 0.84, 0.86) });
      }
    }

    bandIndexOnPage++;
  });

  // Footer on every page — page number + generated timestamp
  const generatedAt = new Date().toLocaleString("en-AU", {
    timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
  });
  pages.forEach((pg, idx) => {
    const footerText = `Page ${idx + 1} of ${pages.length}   —   Generated ${generatedAt}`;
    const footerW = fontRegular.widthOfTextAtSize(footerText, 7.5);
    pg.drawText(footerText, { x: (PDF_PAGE_W - footerW) / 2, y: PDF_MARGIN_BOTTOM - 22, size: 7.5, font: fontRegular, color: rgb(0.61, 0.64, 0.69) });
  });

  return await pdfDoc.save();
}

// POST /api/camera-fault-pdf — builds the PDF and returns it base64-encoded
// so the caller (email composer) can attach it to the Power Automate payload.
async function handleCameraFaultPdf(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const body   = await safeJson(request);
  const assets = Array.isArray(body.assets) ? body.assets : [];
  if (!assets.length) return jsonResponse({ error: "assets array is required." }, 400);
  if (assets.length > 200) return jsonResponse({ error: "Maximum 200 assets per PDF." }, 400);

  try {
    const pdfBytes = await buildCameraFaultPdf(assets);
    // Convert to base64 in chunks to avoid call-stack issues with large buffers
    let binary = "";
    const chunkSize = 8192;
    const bytes = new Uint8Array(pdfBytes);
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    return jsonResponse({ ok: true, base64, sizeBytes: pdfBytes.length });
  } catch (e) {
    return jsonResponse({ error: "PDF generation failed: " + e.message }, 500);
  }
}

function pdfBytesToBase64(pdfBytes) {
  let binary = "";
  const chunkSize = 8192;
  const bytes = new Uint8Array(pdfBytes);
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function cleanPdfText(value) {
  const text = value == null ? "-" : String(value);
  return text.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim() || "-";
}

function safePdfFilePart(value) {
  return cleanPdfText(value).replace(/[\\/:*?"<>|]+/g, "-").trim() || "asset";
}

function toPdfNumber(value) {
  if (value == null || value === "" || value === "-") return null;
  const num = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(num) ? num : null;
}

function openStreetMapTileUrl(lat, lng, zoom) {
  const latRad = lat * Math.PI / 180;
  const scale = 2 ** zoom;
  const x = Math.floor((lng + 180) / 360 * scale);
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * scale);
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

function drawWrappedPdfText(page, text, opts) {
  const font = opts.font;
  const size = opts.size || 9;
  const maxWidth = opts.maxWidth || 200;
  const lineHeight = opts.lineHeight || size + 3;
  const maxLines = opts.maxLines || 2;
  const words = cleanPdfText(text).split(" ");
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);

  const clipped = lines.slice(0, maxLines);
  if (lines.length > maxLines && clipped.length) {
    let last = clipped[clipped.length - 1];
    while (font.widthOfTextAtSize(`${last}...`, size) > maxWidth && last.length > 3) {
      last = last.slice(0, -1);
    }
    clipped[clipped.length - 1] = `${last}...`;
  }

  clipped.forEach((drawLine, idx) => {
    page.drawText(drawLine, {
      x: opts.x,
      y: opts.y - idx * lineHeight,
      size,
      font,
      color: opts.color || rgb(0.12, 0.16, 0.13),
    });
  });
  return clipped.length * lineHeight;
}

async function buildSnapshotPdf(asset) {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageW = 841.89;
  const pageH = 595.28;
  const margin = 26;
  const contentW = pageW - margin * 2;
  const green = rgb(0.078, 0.325, 0.176);
  const greenDark = rgb(0.039, 0.176, 0.078);
  const line = rgb(0.86, 0.90, 0.87);
  const muted = rgb(0.38, 0.45, 0.40);
  const light = rgb(0.965, 0.982, 0.970);
  const white = rgb(1, 1, 1);
  const ink = rgb(0.06, 0.10, 0.07);
  const sections = Array.isArray(asset.sections) ? asset.sections : [];
  const cameras = Array.isArray(asset.cameras) ? asset.cameras : [];
  const embeddedImages = {};
  let embeddedMapTile = null;

  await Promise.all(cameras.map(async (camera) => {
    if (!camera || !camera.url || embeddedImages[camera.url] !== undefined) return;
    embeddedImages[camera.url] = null;
    const img = await fetchImageForPdf(camera.url);
    if (!img) return;
    try {
      embeddedImages[camera.url] = img.format === "png"
        ? await pdfDoc.embedPng(img.bytes)
        : await pdfDoc.embedJpg(img.bytes);
    } catch (e) {
      embeddedImages[camera.url] = null;
    }
  }));

  const mapLat = toPdfNumber(asset.map && asset.map.lat);
  const mapLng = toPdfNumber(asset.map && asset.map.lng);
  if (mapLat != null && mapLng != null) {
    const tile = await fetchImageForPdf(openStreetMapTileUrl(mapLat, mapLng, 14));
    if (tile) {
      try {
        embeddedMapTile = tile.format === "png"
          ? await pdfDoc.embedPng(tile.bytes)
          : await pdfDoc.embedJpg(tile.bytes);
      } catch (e) {
        embeddedMapTile = null;
      }
    }
  }

  const pages = [];
  let page;
  let cursorY;

  function startPage() {
    page = pdfDoc.addPage([pageW, pageH]);
    pages.push(page);
    page.drawRectangle({ x: margin, y: pageH - 82, width: contentW, height: 62, color: greenDark, borderColor: greenDark, borderWidth: 1 });
    const title = cleanPdfText(asset.title || `Asset ${asset.legacyNo || "-"} Snapshot`);
    page.drawText("OPERATIONS", { x: margin + 18, y: pageH - 42, size: 7.5, font: fontBold, color: rgb(0.83, 0.94, 0.15) });
    page.drawText(title, { x: margin + 18, y: pageH - 62, size: 17, font: fontBold, color: white });
    const generated = new Date().toLocaleString("en-AU", {
      timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
    });
    const generatedText = `Generated ${generated}`;
    const generatedW = fontRegular.widthOfTextAtSize(generatedText, 8);
    page.drawText(generatedText, { x: margin + contentW - 18 - generatedW, y: pageH - 62, size: 8, font: fontRegular, color: rgb(0.86, 0.94, 0.88) });
    cursorY = pageH - 104;
  }

  function ensureSpace(height) {
    if (cursorY - height < margin + 22) startPage();
  }

  function drawCardShell(x, yTop, width, height) {
    page.drawRectangle({ x, y: yTop - height, width, height, color: white, borderColor: line, borderWidth: 1 });
  }

  function drawDataItem(x, yTop, width, height, label, value) {
    page.drawRectangle({ x, y: yTop - height, width, height, color: light, borderColor: line, borderWidth: 0.5 });
    page.drawText(cleanPdfText(label).toUpperCase(), { x: x + 6, y: yTop - 8, size: 5.8, font: fontBold, color: muted });
    drawWrappedPdfText(page, value, {
      x: x + 6,
      y: yTop - 20,
      maxWidth: width - 12,
      size: 7.4,
      lineHeight: 8,
      maxLines: 1,
      font: fontRegular,
      color: ink,
    });
  }

  function isLocationSection(section) {
    const key = `${section.kicker || ""} ${section.title || ""}`.toLowerCase();
    return key.includes("location") || key.includes("known position");
  }

  function drawMapPreview(x, yTop, width, height) {
    page.drawRectangle({ x, y: yTop - height, width, height, color: rgb(0.93, 0.96, 0.94), borderColor: line, borderWidth: 0.5 });
    if (embeddedMapTile) {
      const scaled = embeddedMapTile.scaleToFit(width, height);
      page.drawImage(embeddedMapTile, {
        x: x + (width - scaled.width) / 2,
        y: yTop - height + (height - scaled.height) / 2,
        width: scaled.width,
        height: scaled.height,
      });
    } else {
      for (let i = 1; i < 5; i++) {
        const gx = x + (width / 5) * i;
        page.drawLine({ start: { x: gx, y: yTop - height }, end: { x: gx, y: yTop }, thickness: 0.4, color: rgb(0.80, 0.87, 0.82) });
      }
      for (let i = 1; i < 3; i++) {
        const gy = yTop - (height / 3) * i;
        page.drawLine({ start: { x, y: gy }, end: { x: x + width, y: gy }, thickness: 0.4, color: rgb(0.80, 0.87, 0.82) });
      }
    }

    const pinX = x + width / 2;
    const pinY = yTop - height / 2;
    page.drawCircle({ x: pinX, y: pinY + 3, size: 6, color: green });
    page.drawCircle({ x: pinX, y: pinY + 3, size: 2.2, color: white });
    page.drawText("Last known position", { x: x + 10, y: yTop - height + 12, size: 8, font: fontBold, color: greenDark });
    if (mapLat != null && mapLng != null) {
      const coordText = `${mapLat.toFixed(6)}, ${mapLng.toFixed(6)}`;
      const coordW = fontRegular.widthOfTextAtSize(coordText, 7.2);
      page.drawText(coordText, { x: x + width - coordW - 10, y: yTop - height + 12, size: 7.2, font: fontRegular, color: muted });
    }
  }

  function drawSection(section) {
    const rows = Array.isArray(section.rows) ? section.rows : [];
    if (!rows.length) return;
    const cols = 4;
    const gap = 5;
    const innerPad = 9;
    const headerH = 24;
    const itemH = 26;
    const gridW = contentW - innerPad * 2;
    const itemW = (gridW - gap * (cols - 1)) / cols;
    const gridRows = Math.ceil(rows.length / cols);
    const mapH = isLocationSection(section) ? 106 : 0;
    const cardH = innerPad + headerH + gridRows * itemH + Math.max(0, gridRows - 1) * gap + (mapH ? gap + mapH : 0) + innerPad;
    ensureSpace(cardH + 7);

    const cardTop = cursorY;
    drawCardShell(margin, cardTop, contentW, cardH);
    page.drawText(cleanPdfText(section.kicker || section.title || "Snapshot").toUpperCase(), {
      x: margin + innerPad,
      y: cardTop - 12,
      size: 6.2,
      font: fontBold,
      color: green,
    });
    page.drawText(cleanPdfText(section.title || section.kicker || "Snapshot"), {
      x: margin + innerPad,
      y: cardTop - 25,
      size: 10.2,
      font: fontBold,
      color: ink,
    });

    const gridTop = cardTop - innerPad - headerH;
    rows.forEach((item, idx) => {
      const col = idx % cols;
      const rowIdx = Math.floor(idx / cols);
      const x = margin + innerPad + col * (itemW + gap);
      const yTop = gridTop - rowIdx * (itemH + gap);
      drawDataItem(x, yTop, itemW, itemH, item.label, item.value);
    });

    if (mapH) {
      const mapTop = gridTop - gridRows * itemH - Math.max(0, gridRows - 1) * gap - gap;
      drawMapPreview(margin + innerPad, mapTop, gridW, mapH);
    }

    cursorY -= cardH + 7;
  }

  function drawCameras() {
    if (!cameras.length) return;
    const innerPad = 13;
    const boxGap = 10;
    const boxW = (contentW - innerPad * 2 - boxGap * 4) / 5;
    const boxH = 86;
    const cardH = 31 + boxH + 43;
    ensureSpace(cardH + 10);

    const cardTop = cursorY;
    drawCardShell(margin, cardTop, contentW, cardH);
    page.drawText("EVIDENCE", { x: margin + innerPad, y: cardTop - 15, size: 6.8, font: fontBold, color: green });
    page.drawText("Camera Snapshots", { x: margin + innerPad, y: cardTop - 30, size: 11.5, font: fontBold, color: ink });
    if (asset.cameraCapturedAt) {
      page.drawText(`Captured ${cleanPdfText(asset.cameraCapturedAt)}`, { x: margin + 140, y: cardTop - 30, size: 8, font: fontRegular, color: muted });
    }

    cameras.slice(0, 5).forEach((camera, idx) => {
      const x = margin + innerPad + idx * (boxW + boxGap);
      const y = cardTop - 46 - boxH;
      const embedded = camera && camera.url ? embeddedImages[camera.url] : null;
      page.drawRectangle({ x, y, width: boxW, height: boxH, color: rgb(0.96, 0.96, 0.96), borderColor: line, borderWidth: 0.5 });
      if (embedded) {
        const scaled = embedded.scaleToFit(boxW, boxH);
        page.drawImage(embedded, { x: x + (boxW - scaled.width) / 2, y: y + (boxH - scaled.height) / 2, width: scaled.width, height: scaled.height });
      } else {
        page.drawText("No image", { x: x + 22, y: y + 31, size: 7, font: fontRegular, color: muted });
      }
      const label = cleanPdfText(camera && camera.label);
      const labelW = fontBold.widthOfTextAtSize(label, 7);
      page.drawText(label, { x: x + boxW / 2 - labelW / 2, y: y - 11, size: 7, font: fontBold, color: rgb(0.10, 0.12, 0.10) });
      const status = cleanPdfText(camera && camera.status);
      const statusW = fontRegular.widthOfTextAtSize(status, 6.5);
      page.drawText(status, { x: x + boxW / 2 - statusW / 2, y: y - 21, size: 6.5, font: fontRegular, color: muted });
    });

    cursorY -= cardH + 10;
  }

  startPage();
  sections.forEach(drawSection);
  drawCameras();

  pages.forEach((pg, idx) => {
    const footer = `Page ${idx + 1} of ${pages.length}`;
    pg.drawText(footer, { x: pageW - margin - 52, y: 18, size: 7.5, font: fontRegular, color: muted });
  });

  return await pdfDoc.save();
}

async function handleSnapshotPdf(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const body = await safeJson(request);
  const asset = body.asset || {};
  if (!asset || !asset.legacyNo) return jsonResponse({ error: "asset.legacyNo is required." }, 400);

  try {
    const pdfBytes = await buildSnapshotPdf(asset);
    const fileName = `Asset ${safePdfFilePart(asset.legacyNo)} snapshot.pdf`;
    return jsonResponse({ ok: true, base64: pdfBytesToBase64(pdfBytes), sizeBytes: pdfBytes.length, fileName });
  } catch (e) {
    return jsonResponse({ error: "Snapshot PDF generation failed: " + e.message }, 500);
  }
}

// ── Send email via Power Automate ──────────────────────────────────────────────

async function handleSendEmail(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  if (!env.POWER_AUTOMATE_WEBHOOK_URL) {
    return jsonResponse({ error: "Email webhook not configured." }, 503);
  }

  const body     = await safeJson(request);
  const to       = String(body.to || "").trim();
  const cc       = String(body.cc || "").trim();
  const bcc      = String(body.bcc || "").trim();
  const subject  = String(body.subject || "").trim();
  const htmlBody = String(body.htmlBody || "").trim();
  // Optional PDF attachment — base64 string + filename, built client-side
  // beforehand by calling /api/camera-fault-pdf. Power Automate's "Send an
  // email (V2)" action accepts attachments as { Name, ContentBytes } pairs.
  const attachmentBase64 = body.attachmentBase64 ? String(body.attachmentBase64) : null;
  const attachmentName   = body.attachmentName ? String(body.attachmentName) : "attachment.pdf";

  if (!to || !subject || !htmlBody) {
    return jsonResponse({ error: "to, subject and htmlBody are required." }, 400);
  }

  const payload = { to, cc, bcc, subject, htmlBody };
  if (attachmentBase64) {
    payload.attachmentName   = attachmentName;
    payload.attachmentBase64 = attachmentBase64;
  }

  try {
    const res = await fetch(env.POWER_AUTOMATE_WEBHOOK_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      return jsonResponse({ error: `Power Automate error: HTTP ${res.status}`, detail: text.slice(0,300) }, 502);
    }

    await logActivity(env, auth.session.user_id, "email", "send", `To: ${to}${cc ? " | CC: "+cc : ""}${bcc ? " | BCC: "+bcc : ""} | Subject: ${subject}${attachmentBase64 ? " | +PDF attachment" : ""}`, null);

    return jsonResponse({ ok: true });
  } catch(e) {
    return jsonResponse({ error: e.message }, 502);
  }
}

// ── Image size (HEAD request) ────────────────────────────────────────────────

async function handleImageSize(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const reqUrl   = new URL(request.url);
  const imageUrl = decodeURIComponent(reqUrl.searchParams.get("url") || "").trim();
  if (!imageUrl) return jsonResponse({ error: "url is required." }, 400);

  let parsed;
  try { parsed = new URL(imageUrl); } catch { return jsonResponse({ error: "Invalid URL." }, 400); }

  const allowedSuffixes = [".amazonaws.com", ".cloudfront.net", "telematics.com"];
  const allowed = allowedSuffixes.some(s => parsed.hostname.endsWith(s));
  if (!allowed) return jsonResponse({ error: "URL host not permitted." }, 403);

  try {
    const res = await fetch(imageUrl, { method: "HEAD" });
    const size = res.headers.get("content-length");
    const type = res.headers.get("content-type");
    return jsonResponse({
      ok:          res.ok,
      status:      res.status,
      sizeBytes:   size ? parseInt(size) : null,
      sizeKb:      size ? Math.round(parseInt(size) / 1024) : null,
      contentType: type,
    });
  } catch(e) {
    return jsonResponse({ error: e.message }, 502);
  }
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

      // Camera history
      if (method === "GET" && path.startsWith("/api/camera-history/")) {
        const vid = path.split('/').pop();
        const rows = await env.DB.prepare(
          "SELECT * FROM camera_history WHERE vehicle_id = ? ORDER BY captured_at DESC LIMIT 30"
        ).bind(vid).all();
        return jsonResponse(rows.results || []);
      }

      if (method === "POST" && path.startsWith("/api/camera-history/")) {
        const auth = await requireSession(request, env);
        if (!auth.ok) return auth.response;
        const vid  = path.split('/').pop();
        const body = await safeJson(request);
        if (!body.eventId || !body.capturedAt) return jsonResponse({ error: "eventId and capturedAt required" }, 400);
        await env.DB.prepare(
          "INSERT OR IGNORE INTO camera_history (vehicle_id, event_id, captured_at, snapshot_data) VALUES (?,?,?,?)"
        ).bind(vid, body.eventId, body.capturedAt, body.snapshotData || null).run();
        await env.DB.prepare(
          "DELETE FROM camera_history WHERE vehicle_id = ? AND id NOT IN (SELECT id FROM camera_history WHERE vehicle_id = ? ORDER BY captured_at DESC LIMIT 30)"
        ).bind(vid, vid).run();
        return jsonResponse({ ok: true });
      }

      // Registry
      if (method === "GET"    && path === "/api/registry/apis")                              return handleRegistryGetApis(request, env);
      if (method === "POST"   && path === "/api/registry/apis")                              return handleRegistryCreateApi(request, env);
      if (method === "PUT"    && path.match(/^\/api\/registry\/apis\//))                  return handleRegistryUpdateApi(request, env, decodeURIComponent(path.split("/").pop()));
      if (method === "DELETE" && path.match(/^\/api\/registry\/apis\//))                  return handleRegistryDeleteApi(request, env, decodeURIComponent(path.split("/").pop()));

      // Image proxy
      if (path === "/api/image-proxy") return handleImageProxy(request, env);
      if (path === "/api/image-size") return handleImageSize(request, env);
      if (path === "/api/public-image") return handlePublicImageProxy(request, env);
      if (method === "POST" && path === "/api/sign-image-url") return handleSignImageUrl(request, env);
      if (path === "/api/mailer/signatures" && method === "GET") return handleListSignatures(request, env);
      if (path === "/api/mailer/signatures" && method === "POST") return handleCreateSignature(request, env);
      if (path.startsWith("/api/mailer/signatures/") && method === "PUT") {
        const sigId = parseInt(path.split("/").pop(), 10);
        return handleUpdateSignature(request, env, sigId);
      }
      if (method === "POST" && path === "/api/camera-fault-pdf") return handleCameraFaultPdf(request, env);
      if (method === "POST" && path === "/api/snapshot-pdf") return handleSnapshotPdf(request, env);
      if (method === "POST" && path === "/api/send-email") return handleSendEmail(request, env);

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
