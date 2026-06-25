// TGE Asset Snapshot — Cloudflare Worker
// src/index.js

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  handleGetStaticFields,
  handleUpdateStaticFields,
  handleGetStaticExclusions,
  handleSaveStaticExclusionsDraft,
  handlePreviewStaticExclusions,
  handlePublishStaticExclusions,
  handleImportStaticFleet,
  handleGetStaticFleet,
} from "./utilisation-static-fleet.js";

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

const utilisationAuthHelpers = {
  hasPermission,
  safeJson,
};

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
    "SELECT u.id, u.username, u.first_name, u.last_name, u.email, u.status, u.login_type, u.role_id, u.created_at, u.updated_at, r.name as role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.username = ? AND u.password_hash = ?"
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
    "SELECT u.id, u.username, u.first_name, u.last_name, u.email, u.status, u.login_type, u.role_id, u.created_at, u.updated_at, r.name as role_name FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.first_name"
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
let sql = "UPDATE users SET first_name=?, last_name=?, username=?, email=?, role_id=?, status=?, login_type=?, updated_at=?";
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

async function handleGetControlTables(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const tables = await env.DB.prepare(
    "SELECT * FROM control_tables ORDER BY feature, name"
  ).all();

  const rules = await env.DB.prepare(
    "SELECT * FROM control_table_rules ORDER BY control_table_id, sort_order, min_value"
  ).all();

  const hardware = await env.DB.prepare(
    "SELECT * FROM control_table_hardware ORDER BY control_table_id, hardware_match"
  ).all();

  return jsonResponse({
    ok: true,
    tables: tables.results || [],
    rules: rules.results || [],
    hardware: hardware.results || []
  });
}

async function handleSaveControlTable(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const body = await safeJson(request);

  const id = body.id ? parseInt(body.id, 10) : null;
  const name = String(body.name || "").trim();
  const feature = String(body.feature || "").trim();
  const outputField = String(body.outputField || "").trim();
  const valueSource = String(body.valueSource || "").trim();
  const notes = String(body.notes || "").trim();
  const active = body.active === false ? 0 : 1;
  const hardware = Array.isArray(body.hardware) ? body.hardware : [];
  const rules = Array.isArray(body.rules) ? body.rules : [];

  if (!name || !feature || !outputField || !valueSource) {
    return jsonResponse({ error: "name, feature, outputField and valueSource are required." }, 400);
  }

  if (!hardware.length) {
    return jsonResponse({ error: "At least one hardware assignment is required." }, 400);
  }

  if (!rules.length) {
    return jsonResponse({ error: "At least one rule is required." }, 400);
  }

  let tableId = id;

  if (tableId) {
    await env.DB.prepare(
      "UPDATE control_tables SET name=?, feature=?, output_field=?, value_source=?, hardware_match=?, active=?, notes=?, updated_at=? WHERE id=?"
    ).bind(
      name,
      feature,
      outputField,
      valueSource,
      hardware.join("|"),
      active,
      notes || null,
      nowIso(),
      tableId
    ).run();

    await env.DB.prepare("DELETE FROM control_table_rules WHERE control_table_id=?").bind(tableId).run();
    await env.DB.prepare("DELETE FROM control_table_hardware WHERE control_table_id=?").bind(tableId).run();

  } else {
    const result = await env.DB.prepare(
      "INSERT INTO control_tables (name, feature, output_field, value_source, hardware_match, active, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      name,
      feature,
      outputField,
      valueSource,
      hardware.join("|"),
      active,
      notes || null,
      nowIso(),
      nowIso()
    ).run();

    tableId = result.meta.last_row_id;
  }

  for (let i = 0; i < hardware.length; i++) {
    const h = String(hardware[i] || "").trim();
    if (!h) continue;

    await env.DB.prepare(
      "INSERT INTO control_table_hardware (control_table_id, hardware_match, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)"
    ).bind(tableId, h, nowIso(), nowIso()).run();
  }

  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];

    const minValue = Number(r.minValue);
    const maxValue = Number(r.maxValue);
    const outputValue = String(r.outputValue || "").trim();
    const outputColour = String(r.outputColour || "gray").trim().toLowerCase();

    if (isNaN(minValue) || isNaN(maxValue) || !outputValue) {
      return jsonResponse({ error: "Each rule requires minValue, maxValue and outputValue." }, 400);
    }

    await env.DB.prepare(
      "INSERT INTO control_table_rules (control_table_id, min_value, max_value, output_value, output_colour, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      tableId,
      minValue,
      maxValue,
      outputValue,
      outputColour,
      i,
      r.active === false ? 0 : 1,
      nowIso(),
      nowIso()
    ).run();
  }

  return jsonResponse({ ok: true, id: tableId });
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

// ── Asset Snapshot PDF generation ────────────────────────────────────────────
//
// Builds a single-asset report with variable-length sections (Vehicle Info,
// Driver, Live Status, VPM, GPIO, Location). Unlike buildCameraFaultPdf
// (fixed-height repeating bands, pure-arithmetic pagination), this uses a
// measured-content cursor: each section's height is calculated before drawing
// so a whole section always moves to a new page together — never split mid-
// section across a page break.
//
// Reuses from the existing camera-fault-pdf code above: PDFDocument, rgb,
// StandardFonts, PDF_PAGE_W, PDF_PAGE_H, PDF_BRAND_GREEN, fetchImageForPdf,
// PDF_PHOTO_BOX_H, PDF_PHOTO_GAP_X — no redefinitions needed.

const SNAP_MARGIN_TOP    = 50;
const SNAP_MARGIN_BOTTOM = 34;
const SNAP_MARGIN_LEFT   = 30;
const SNAP_MARGIN_RIGHT  = 30;

const SNAP_ROW_COLS   = 4;   // 4 columns per row-line, matching app's data-grid-4
const SNAP_ROW_H      = 30;  // fixed height per data row cell (label + value)
const SNAP_ROW_GAP_X  = 8;
const SNAP_ROW_GAP_Y  = 6;
const SNAP_SECTION_GAP = 18;

function snapUsableW() {
  return PDF_PAGE_W - SNAP_MARGIN_LEFT - SNAP_MARGIN_RIGHT;
}

// Measures how tall a section will be when drawn, so we can decide before
// drawing whether it fits on the current page.
function snapMeasureSection(section) {
  const rowCount = (section.rows || []).length;
  const rowLines = Math.max(1, Math.ceil(rowCount / SNAP_ROW_COLS));
  const kickerH  = section.kicker ? 9 + 3  : 0;
  const titleH   = section.title  ? 11 + 10 : 0;
  const rowsH    = rowLines * SNAP_ROW_H + Math.max(0, rowLines - 1) * SNAP_ROW_GAP_Y;
  const photosH  = (section.photos && section.photos.length)
    ? PDF_PHOTO_BOX_H + 10 + 10  // box + label + gap
    : 0;
  return kickerH + titleH + rowsH + photosH + SNAP_SECTION_GAP;
}

// Draws one section's label/value rows as a 4-column grid, matching the
// app's existing data-grid-4 card style.
function snapDrawRows(page, fontR, fontB, rows, startX, startY, usableW) {
  const colW = (usableW - (SNAP_ROW_COLS - 1) * SNAP_ROW_GAP_X) / SNAP_ROW_COLS;
  rows.forEach((row, i) => {
    const col  = i % SNAP_ROW_COLS;
    const line = Math.floor(i / SNAP_ROW_COLS);
    const x    = startX + col * (colW + SNAP_ROW_GAP_X);
    const y    = startY - line * (SNAP_ROW_H + SNAP_ROW_GAP_Y);

    // Light card background, matching .data-item style
    page.drawRectangle({
      x, y: y - SNAP_ROW_H, width: colW, height: SNAP_ROW_H,
      color: rgb(0.960, 0.976, 0.965),
      borderColor: rgb(0.920, 0.950, 0.940), borderWidth: 0.75,
    });

    // Label — small uppercase muted text
    const label = String(row.label || "").toUpperCase().slice(0, 32);
    page.drawText(label, {
      x: x + 6, y: y - 11, size: 6.5, font: fontB,
      color: rgb(0.35, 0.43, 0.38),
    });

    // Value — bold, truncated if long
    let value = (row.value == null || row.value === "") ? "—" : String(row.value);
    if (value.length > 28) value = value.slice(0, 27) + "…";
    page.drawText(value, {
      x: x + 6, y: y - 23, size: 9.5, font: fontR,
      color: rgb(0.06, 0.10, 0.075),
    });
  });
}

// Embeds camera photo boxes for a section that includes photos (Evidence
// section). Reuses PDF_PHOTO_BOX_H and PDF_PHOTO_GAP_X from the existing
// camera-fault-pdf constants — deliberately kept the same to save space.
async function snapDrawPhotos(pdfDoc, page, fontR, fontB, photos, startX, startY, usableW) {
  const n = Math.min(photos.length, 5);
  if (!n) return;
  const totalGap = (n - 1) * PDF_PHOTO_GAP_X;
  const boxW     = (usableW - totalGap) / n;

  const fetched = await Promise.all(
    photos.slice(0, n).map(p => (p && p.url) ? fetchImageForPdf(p.url) : Promise.resolve(null))
  );

  for (let i = 0; i < n; i++) {
    const photo = photos[i];
    const bx    = startX + i * (boxW + PDF_PHOTO_GAP_X);
    const by    = startY - PDF_PHOTO_BOX_H;
    let embedded = null;

    if (fetched[i]) {
      try {
        embedded = fetched[i].format === "png"
          ? await pdfDoc.embedPng(fetched[i].bytes)
          : await pdfDoc.embedJpg(fetched[i].bytes);
      } catch (e) { embedded = null; }
    }

    if (embedded) {
      const scaled  = embedded.scaleToFit(boxW, PDF_PHOTO_BOX_H);
      const offsetX = bx + (boxW - scaled.width) / 2;
      const offsetY = by + (PDF_PHOTO_BOX_H - scaled.height) / 2;
      page.drawRectangle({ x: bx, y: by, width: boxW, height: PDF_PHOTO_BOX_H, color: rgb(0.96, 0.96, 0.97) });
      page.drawImage(embedded, { x: offsetX, y: offsetY, width: scaled.width, height: scaled.height });
      page.drawRectangle({ x: bx, y: by, width: boxW, height: PDF_PHOTO_BOX_H, borderColor: rgb(0.82, 0.84, 0.86), borderWidth: 1 });
    } else {
      page.drawRectangle({ x: bx, y: by, width: boxW, height: PDF_PHOTO_BOX_H, color: rgb(0.96, 0.96, 0.97), borderColor: rgb(0.82, 0.84, 0.86), borderWidth: 1 });
      const noImgW = fontR.widthOfTextAtSize("no image", 7);
      page.drawText("no image", { x: bx + boxW / 2 - noImgW / 2, y: by + PDF_PHOTO_BOX_H / 2 - 3, size: 7, font: fontR, color: rgb(0.61, 0.64, 0.69) });
    }

    const slotLabel = (photo && photo.label) || ("Camera " + (i + 1));
    const slotLabelW = fontB.widthOfTextAtSize(slotLabel, 7.5);
    page.drawText(slotLabel, {
      x: bx + boxW / 2 - slotLabelW / 2, y: by - 8, size: 7.5, font: fontB, color: rgb(0.07, 0.07, 0.07),
    });
  }
}

// Builds the full Asset Snapshot PDF for a single asset.
// asset: { legacyNo, title, generatedAt, sections: [{kicker, title, rows:[{label,value}], photos?:[{label,url}]}] }
async function buildSnapshotPdf(asset) {
  const pdfDoc   = await PDFDocument.create();
  const fontR    = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontB    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const usableW  = snapUsableW();
  const usableH  = PDF_PAGE_H - SNAP_MARGIN_TOP - SNAP_MARGIN_BOTTOM;

  const pages = [];
  let page    = null;
  let cursorY = 0;

  const generatedAt = asset.generatedAt
    ? new Date(asset.generatedAt).toLocaleString("en-AU", { timeZone:"Australia/Sydney", day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:true })
    : new Date().toLocaleString("en-AU", { timeZone:"Australia/Sydney", day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:true });

  function newPage(isFirst) {
    page = pdfDoc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
    pages.push(page);
    cursorY = PDF_PAGE_H - SNAP_MARGIN_TOP;

    // Page border
    page.drawRectangle({
      x: SNAP_MARGIN_LEFT - 10, y: SNAP_MARGIN_BOTTOM - 10,
      width: usableW + 20, height: usableH + 20,
      borderColor: rgb(0.82, 0.84, 0.86), borderWidth: 1,
    });

    if (isFirst) {
      // Report title
      const docTitle = asset.title || ("Asset " + (asset.legacyNo || "—") + " Snapshot");
      page.drawText(docTitle, {
        x: SNAP_MARGIN_LEFT, y: PDF_PAGE_H - 28, size: 16, font: fontB,
        color: rgb(0.07, 0.07, 0.07),
      });
      // Generated timestamp — right-aligned
      const genText = "Generated " + generatedAt;
      const genW    = fontR.widthOfTextAtSize(genText, 9);
      page.drawText(genText, {
        x: PDF_PAGE_W - SNAP_MARGIN_RIGHT - genW, y: PDF_PAGE_H - 28, size: 9, font: fontR,
        color: rgb(0.42, 0.45, 0.50),
      });
      // Brand green rule under title
      page.drawLine({
        start: { x: SNAP_MARGIN_LEFT,                    y: PDF_PAGE_H - 36 },
        end:   { x: PDF_PAGE_W - SNAP_MARGIN_RIGHT,      y: PDF_PAGE_H - 36 },
        thickness: 1.5, color: PDF_BRAND_GREEN,
      });
    }
  }

  newPage(true);

  for (const section of (asset.sections || [])) {
    const sectionH = snapMeasureSection(section);

    // Move whole section to next page if it won't fit — never split a section.
    if (cursorY - sectionH < SNAP_MARGIN_BOTTOM) {
      newPage(false);
    }

    // Kicker
    if (section.kicker) {
      page.drawText(String(section.kicker).toUpperCase(), {
        x: SNAP_MARGIN_LEFT, y: cursorY - 9, size: 9, font: fontB,
        color: PDF_BRAND_GREEN,
      });
      cursorY -= 12;
    }

    // Section title
    if (section.title) {
      page.drawText(String(section.title), {
        x: SNAP_MARGIN_LEFT, y: cursorY - 11, size: 11, font: fontB,
        color: rgb(0.07, 0.07, 0.07),
      });
      cursorY -= 21;
    }

    // Data rows
    const rows = section.rows || [];
    if (rows.length) {
      const rowLines = Math.max(1, Math.ceil(rows.length / SNAP_ROW_COLS));
      snapDrawRows(page, fontR, fontB, rows, SNAP_MARGIN_LEFT, cursorY, usableW);
      cursorY -= rowLines * SNAP_ROW_H + Math.max(0, rowLines - 1) * SNAP_ROW_GAP_Y;
    }

    // Camera photos (Evidence section only)
    if (section.photos && section.photos.length) {
      cursorY -= 6;
      await snapDrawPhotos(pdfDoc, page, fontR, fontB, section.photos, SNAP_MARGIN_LEFT, cursorY, usableW);
      cursorY -= PDF_PHOTO_BOX_H + 10 + 4;
    }

    cursorY -= SNAP_SECTION_GAP;
  }

  // Footer — page X of Y + generated timestamp, centered, on every page
  pages.forEach((pg, idx) => {
    const footerText = `Page ${idx + 1} of ${pages.length}   —   Generated ${generatedAt}`;
    const footerW    = fontR.widthOfTextAtSize(footerText, 7.5);
    pg.drawText(footerText, {
      x: (PDF_PAGE_W - footerW) / 2, y: SNAP_MARGIN_BOTTOM - 22, size: 7.5, font: fontR,
      color: rgb(0.61, 0.64, 0.69),
    });
  });

  return await pdfDoc.save();
}

// POST /api/snapshot-pdf
// Builds the single-asset Snapshot PDF and returns it base64-encoded.
// Response shape: { ok, base64, fileName, sizeBytes } — matches what
// buildSnapshotAttachment() in snapshot.js already expects.
async function handleSnapshotPdf(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const body  = await safeJson(request);
  const asset = body && body.asset;
  if (!asset || typeof asset !== "object") {
    return jsonResponse({ error: "asset object is required." }, 400);
  }
  if (!Array.isArray(asset.sections) || !asset.sections.length) {
    return jsonResponse({ error: "asset.sections must be a non-empty array." }, 400);
  }

  try {
    const pdfBytes  = await buildSnapshotPdf(asset);
    let binary      = "";
    const chunkSize = 8192;
    const bytes     = new Uint8Array(pdfBytes);
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64       = btoa(binary);
    const safeName     = String(asset.legacyNo || "asset").replace(/[\\/:*?"<>|]+/g, "-").trim() || "asset";
    const fileName     = "Asset " + safeName + " snapshot.pdf";
    return jsonResponse({ ok: true, base64, fileName, sizeBytes: pdfBytes.length });
  } catch (e) {
    return jsonResponse({ error: "Snapshot PDF generation failed: " + e.message }, 500);
  }
}

async function handleAssetTrackPdf(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const body = await safeJson(request);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const summary = body.summary || {};

  if (!rows.length) {
    return jsonResponse({ error: "rows array is required." }, 400);
  }

  try {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageW = 841.89;
    const pageH = 595.28;
    const margin = 28;
    const brand = PDF_BRAND_GREEN;
    const ink = rgb(0.07, 0.09, 0.08);
    const muted = rgb(0.42, 0.45, 0.50);
    const line = rgb(0.82, 0.84, 0.86);
    const headerFill = rgb(0.94, 0.97, 0.95);
    const zebraFill = rgb(0.985, 0.988, 0.990);
    const issueFill = rgb(0.996, 0.953, 0.953);

    const cols = [
      { key: "fleetNo", label: "Fleet", w: 50 },
      { key: "registration", label: "Registration", w: 72 },
      { key: "imei", label: "IMEI", w: 105 },
      { key: "model", label: "Model", w: 128 },
      { key: "battBase", label: "Batt Base", w: 70 },
      { key: "battCurrent", label: "Batt Current", w: 78 },
      { key: "battStatus", label: "Batt Status", w: 76 },
      { key: "lastSeen", label: "Last Seen", w: 112 },
      { key: "status", label: "Status", w: 86 }
    ];

    const tableX = margin;
    const tableW = pageW - margin * 2;
    const rowH = 20;
    const headerH = 22;
    const footerY = 18;
    const tableTopFirst = pageH - 145;
    const tableTopNext = pageH - 78;
    const tableBottom = 42;

    let pages = [];
    let page = null;
    let y = 0;

    const generatedAt = summary.generated || new Date().toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });

    function textWidth(text, size, fnt) {
      return fnt.widthOfTextAtSize(String(text || ""), size);
    }

    function drawTextFit(pg, text, x, yy, maxW, size, fnt, color) {
      let s = String(text == null || text === "" ? "—" : text);
      while (s.length && textWidth(s, size, fnt) > maxW) {
        s = s.slice(0, -1);
      }
      if (s !== String(text == null || text === "" ? "—" : text)) {
        s = s.length > 1 ? s.slice(0, -1) + "…" : "…";
      }
      pg.drawText(s, { x, y: yy, size, font: fnt, color });
    }

    function drawPageFrame(pg) {
      pg.drawRectangle({
        x: margin - 10,
        y: 30,
        width: pageW - (margin - 10) * 2,
        height: pageH - 48,
        borderColor: line,
        borderWidth: 0.8
      });
    }

    function drawTitle(pg) {
      const title = "Asset Track Report";
      const titleW = textWidth(title, 17, fontBold);
      pg.drawText(title, {
        x: (pageW - titleW) / 2,
        y: pageH - 34,
        size: 17,
        font: fontBold,
        color: ink
      });

      const sub = "Asset Tracker device assignment, battery and reporting status";
      const subW = textWidth(sub, 8.5, font);
      pg.drawText(sub, {
        x: (pageW - subW) / 2,
        y: pageH - 49,
        size: 8.5,
        font,
        color: muted
      });

      pg.drawLine({
        start: { x: margin, y: pageH - 60 },
        end: { x: pageW - margin, y: pageH - 60 },
        thickness: 1.4,
        color: brand
      });
    }

    function drawSummary(pg) {
      const cards = [
        ["Generated", generatedAt],
        ["Total Rows", summary.totalAssets || rows.length],
        ["With Tracker", summary.withTracker || rows.filter(r => r.imei && r.imei !== "—").length],
        ["Reporting", summary.reporting || rows.filter(r => r.status === "Reporting").length],
        ["Issues", summary.notReporting || rows.filter(r => r.status !== "Reporting").length]
      ];

      const gap = 8;
      const cardW = (tableW - gap * (cards.length - 1)) / cards.length;
      const cardH = 38;
      let x = margin;

      cards.forEach(card => {
        pg.drawRectangle({
          x,
          y: pageH - 111,
          width: cardW,
          height: cardH,
          color: rgb(0.960, 0.976, 0.965),
          borderColor: rgb(0.900, 0.940, 0.920),
          borderWidth: 0.7
        });

        pg.drawText(String(card[0]).toUpperCase(), {
          x: x + 8,
          y: pageH - 88,
          size: 6.5,
          font: fontBold,
          color: rgb(0.32, 0.42, 0.36)
        });

        drawTextFit(pg, card[1], x + 8, pageH - 103, cardW - 16, 9, fontBold, ink);
        x += cardW + gap;
      });
    }

    function drawTableHeader(pg, yy) {
      pg.drawRectangle({
        x: tableX,
        y: yy - headerH,
        width: tableW,
        height: headerH,
        color: headerFill,
        borderColor: line,
        borderWidth: 0.7
      });

      let x = tableX;
      cols.forEach(col => {
        pg.drawText(col.label, {
          x: x + 5,
          y: yy - 14,
          size: 7.2,
          font: fontBold,
          color: rgb(0.19, 0.31, 0.23)
        });
        x += col.w;
      });

      pg.drawLine({
        start: { x: tableX, y: yy - headerH },
        end: { x: tableX + tableW, y: yy - headerH },
        thickness: 1,
        color: brand
      });
    }

    function newPage(isFirst) {
      page = pdfDoc.addPage([pageW, pageH]);
      pages.push(page);
      drawPageFrame(page);

      if (isFirst) {
        drawTitle(page);
        drawSummary(page);
        y = tableTopFirst;
      } else {
       const title = "Asset Track Report";
const titleW = textWidth(title, 13, fontBold);

page.drawText(title, {
  x: (pageW - titleW) / 2,
  y: pageH - 38,
  size: 13,
  font: fontBold,
  color: ink
});
      
const cont = "Continued";
const contW = textWidth(cont, 8.5, font);

page.drawText(cont, {
  x: (pageW - contW) / 2,
  y: pageH - 52,
  size: 8.5,
  font,
  color: muted
});
        page.drawLine({
          start: { x: margin, y: pageH - 50 },
          end: { x: pageW - margin, y: pageH - 50 },
          thickness: 1.2,
          color: brand
        });
        y = tableTopNext;
      }

      drawTableHeader(page, y);
      y -= headerH;
    }

    newPage(true);

    rows.forEach((row, idx) => {
      if (y - rowH < tableBottom) {
        newPage(false);
      }

      const isIssue = row.status && row.status !== "Reporting";
      const fill = isIssue ? issueFill : (idx % 2 === 1 ? zebraFill : rgb(1, 1, 1));

      page.drawRectangle({
        x: tableX,
        y: y - rowH,
        width: tableW,
        height: rowH,
        color: fill,
        borderColor: rgb(0.90, 0.91, 0.92),
        borderWidth: 0.35
      });

      let x = tableX;
      cols.forEach(col => {
        const value = row[col.key] == null || row[col.key] === "" ? "—" : row[col.key];
        const isStatus = col.key === "status" || col.key === "battStatus";
        const c = value === "Critical" || value === "Low" || value === "No Meter Data" || value === "Not Asset Tracker" || value === "No Device Assigned" || value === "Fleet Not Found"
          ? rgb(0.75, 0.12, 0.12)
          : (value === "Fresh" || value === "Good" || value === "Reporting" ? rgb(0.05, 0.42, 0.18) : ink);

        drawTextFit(page, value, x + 5, y - 13, col.w - 8, isStatus ? 7.1 : 6.8, isStatus ? fontBold : font, c);
        x += col.w;
      });

      y -= rowH;
    });

    pages.forEach((pg, idx) => {
      const footer = `Page ${idx + 1} of ${pages.length}   —   Generated ${generatedAt}`;
      const footerW = textWidth(footer, 7.5, font);
      pg.drawText(footer, {
        x: (pageW - footerW) / 2,
        y: footerY,
        size: 7.5,
        font,
        color: muted
      });
    });

    const pdfBytes = await pdfDoc.save();

    let binary = "";
    const bytes = new Uint8Array(pdfBytes);
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }

    return jsonResponse({
      ok: true,
      base64: btoa(binary),
      fileName: "Asset Track Report.pdf",
      sizeBytes: pdfBytes.length
    });

  } catch (e) {
    return jsonResponse({
      error: "Asset Track PDF generation failed: " + e.message
    }, 500);
  }
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
// ── Camera History Routes ─────────────────────────────────────────────────────
// Add these to src/index.js
//
// Uses TN360_API_KEY (existing) for fetching event metadata
// Uses TN360_SNAPSHOT_KEY (new) for fresh image URLs on demand
//
// D1 Schema — run these migrations:
// ─────────────────────────────────────────────────────────────────────────────
// DROP TABLE IF EXISTS camera_history;
//
// CREATE TABLE camera_history (
//   id          INTEGER PRIMARY KEY AUTOINCREMENT,
//   vehicle_id  TEXT NOT NULL,
//   event_id    TEXT NOT NULL,
//   event_type  TEXT NOT NULL DEFAULT 'CAMERA',
//   action      TEXT NOT NULL DEFAULT 'SNAPSHOT',
//   provider    TEXT,
//   captured_at TEXT NOT NULL,
//   attachments TEXT NOT NULL,
//   created_at  TEXT NOT NULL,
//   UNIQUE(event_id)
// );
// CREATE INDEX idx_ch_vehicle ON camera_history(vehicle_id, captured_at DESC);
// CREATE INDEX idx_ch_action  ON camera_history(vehicle_id, action, captured_at DESC);
//
// CREATE TABLE IF NOT EXISTS camera_history_sync (
//   id            INTEGER PRIMARY KEY CHECK (id = 1),
//   backfill_from TEXT,
//   backfill_to   TEXT,
//   last_sync_at  TEXT,
//   total_events  INTEGER DEFAULT 0,
//   status        TEXT DEFAULT 'idle',
//   current_chunk TEXT,
//   chunks_done   INTEGER DEFAULT 0,
//   chunks_total  INTEGER DEFAULT 0
// );
// INSERT OR IGNORE INTO camera_history_sync (id) VALUES (1);
//
// wrangler.toml — add cron trigger:
// [[triggers.crons]]
// cron = "0 20 * * *"   # runs daily at 6am AEST (20:00 UTC)
// ─────────────────────────────────────────────────────────────────────────────

// Earliest possible backfill date — February 2024
const BACKFILL_START = '2024-02-01';

// ── Shared: fetch one 6-day chunk of camera events via existing API key ───────
async function fetchCameraEventsChunk(env, fromIso, toIso) {
  const allEvents = [];
  let rowOffset   = 0;
  const rowLimit  = 100;

  const fromEnc = fromIso.replace(/\+/g, '%2B').replace(/:/g, '%3A');
  const toEnc   = toIso.replace(/\+/g, '%2B').replace(/:/g, '%3A');

  while (true) {
    const res = await fetch(
      `https://api-au.telematics.com/v1/devices/events/camera/snapshots?from=${fromEnc}&to=${toEnc}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Token token="${env.TN360_API_KEY}"`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          orderField:     'EventTime',
          orderDirection: 'asc',
          latestOnly:     false,
          rowCountLimit:  rowLimit,
          rowOffset:      rowOffset,
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`TN360 snapshots fetch failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
    }

    const data   = await res.json();
    const events = Array.isArray(data.events) ? data.events : [];
    allEvents.push(...events);

    const total = data.totalCount || 0;
    rowOffset  += rowLimit;
    if (rowOffset >= total || events.length < rowLimit) break;
  }

  return allEvents;
}

// ── Shared: save events to D1 ─────────────────────────────────────────────────
async function saveCameraEvents(env, events) {
  if (!events.length) return 0;
  let saved = 0;

  for (const ev of events) {
    const vehicleId = String(ev.vehicleId || ev.vehicleID || '').trim();
    const eventId   = String(ev.id || '').trim();
    if (!vehicleId || !eventId) continue;

    const action = String(ev.type || ev.action || ev.actionType || ev.subType || 'UNKNOWN').toUpperCase();
    const provider = String(ev.provider || ev.providerType || '').toUpperCase();
    const capturedAt = ev.timeAt || ev.eventTime || ev.createdAt || '';

    // Extract attachment metadata only — no URLs
    const attachments = Array.isArray(ev.attachments)
      ? ev.attachments
          .filter(function(att) { return att.attachmentId != null; })
          .map(function(att) {
            return {
              attachmentId: att.attachmentId,
              position:     att.cameraPosition || att.position || '',
              timeAt:       att.timeAt || capturedAt,
              status:       att.attachmentStatus || att.status || '',
            };
          })
      : [];

    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO camera_history
         (vehicle_id, event_id, event_type, action, provider, captured_at, attachments, created_at)
         VALUES (?, ?, 'CAMERA', ?, ?, ?, ?, ?)`
      ).bind(
        vehicleId,
        eventId,
        action,
        provider || null,
        capturedAt,
        JSON.stringify(attachments),
        nowIso()
      ).run();
      saved++;
    } catch(e) {
      console.error('[CameraHistory] insert error for event', eventId, ':', e.message);
    }
  }
  return saved;
}

// ── Shared: update sync state ─────────────────────────────────────────────────
async function updateSyncState(env, fields) {
  const sets   = Object.keys(fields).map(function(k) { return k + ' = ?'; }).join(', ');
  const values = Object.values(fields);
  await env.DB.prepare(
    `UPDATE camera_history_sync SET ${sets} WHERE id = 1`
  ).bind(...values).run();
}

// ── GET /api/admin/camera-history/status ─────────────────────────────────────
async function handleCameraHistoryStatus(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const perm = await hasPermission(env, auth.session.role_id, 'admin', 'view');
  if (!perm.allowed) return jsonResponse({ error: 'Access denied.' }, 403);

  const sync   = await env.DB.prepare('SELECT * FROM camera_history_sync WHERE id = 1').first();
  const counts = await env.DB.prepare(
    `SELECT
       COUNT(*)                                          as total,
       COUNT(DISTINCT vehicle_id)                        as vehicles,
       COUNT(DISTINCT action)                            as action_types,
       MIN(captured_at)                                  as oldest,
       MAX(captured_at)                                  as newest,
       SUM(CASE WHEN action = 'SNAPSHOT'     THEN 1 ELSE 0 END) as snapshots,
       SUM(CASE WHEN action = 'DRIVER_INPUT' THEN 1 ELSE 0 END) as driver_inputs,
       SUM(CASE WHEN action = 'VIDEO_REQUEST'THEN 1 ELSE 0 END) as video_requests
     FROM camera_history`
  ).first();

  // Build action breakdown
  const byAction = await env.DB.prepare(
    `SELECT action, COUNT(*) as count FROM camera_history GROUP BY action ORDER BY count DESC`
  ).all();

  return jsonResponse({
    sync:      sync || {},
    counts:    counts || {},
    byAction:  byAction.results || [],
  });
}

// ── POST /api/admin/camera-history/backfill ───────────────────────────────────
// Runs chunked backfill from BACKFILL_START to today
// Safe to call multiple times — resumes from where it left off
// Uses TN360_API_KEY only — no snapshot key needed for metadata
async function handleCameraHistoryBackfill(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const perm = await hasPermission(env, auth.session.role_id, 'admin', 'run');
  if (!perm.allowed) return jsonResponse({ error: 'Access denied.' }, 403);

  if (!env.TN360_API_KEY) {
    return jsonResponse({ error: 'TN360_API_KEY not configured.' }, 503);
  }

  const body   = await safeJson(request);
  const reset  = body.reset === true; // pass reset:true to start over from beginning

  // Get current sync state
  const sync = await env.DB.prepare('SELECT * FROM camera_history_sync WHERE id = 1').first();

  // Build list of all 6-day chunks from BACKFILL_START to today
  const startDate = new Date(BACKFILL_START + 'T00:00:00.000Z');
  const endDate   = new Date();
  const chunkMs   = 6 * 24 * 60 * 60 * 1000;
  const allChunks = [];

  for (let t = startDate.getTime(); t < endDate.getTime(); t += chunkMs) {
    allChunks.push({
      from: new Date(t).toISOString(),
      to:   new Date(Math.min(t + chunkMs - 1, endDate.getTime())).toISOString(),
    });
  }

  // Find resume point — skip chunks we've already completed
  // backfill_to tracks the latest chunk end date we've successfully processed
  let startChunkIdx = 0;
  if (!reset && sync && sync.backfill_to) {
    const doneUntil = new Date(sync.backfill_to).getTime();
    startChunkIdx   = allChunks.findIndex(function(c) {
      return new Date(c.to).getTime() > doneUntil;
    });
    if (startChunkIdx === -1) {
      // All chunks done
      await updateSyncState(env, {
        status:       'complete',
        chunks_done:  allChunks.length,
        chunks_total: allChunks.length,
        current_chunk: null,
      });
      return jsonResponse({ ok: true, message: 'Backfill already complete.', chunksTotal: allChunks.length });
    }
  }

  const remainingChunks = allChunks.slice(startChunkIdx);

  // Update sync state — mark as running
  await updateSyncState(env, {
    status:       'running',
    chunks_total: allChunks.length,
    chunks_done:  startChunkIdx,
    backfill_from: sync && sync.backfill_from ? sync.backfill_from : BACKFILL_START,
  });

  // Process chunks — Cloudflare Workers have a 30s CPU limit on free plan,
  // 30 mins on paid. We process as many as possible and return progress.
  // The frontend calls this repeatedly until complete.
  const CHUNKS_PER_CALL = 10; // process 10 chunks per HTTP call (~10 weeks)
  const chunksToProcess = remainingChunks.slice(0, CHUNKS_PER_CALL);
  let totalSaved = 0;
  let lastTo     = sync && sync.backfill_to ? sync.backfill_to : null;

  for (let i = 0; i < chunksToProcess.length; i++) {
    const chunk = chunksToProcess[i];
    await updateSyncState(env, {
      current_chunk: chunk.from.slice(0,10) + ' → ' + chunk.to.slice(0,10),
      chunks_done:   startChunkIdx + i,
    });

    try {
      const events = await fetchCameraEventsChunk(env, chunk.from, chunk.to);
      const saved  = await saveCameraEvents(env, events);
      totalSaved  += saved;
      lastTo       = chunk.to;

      await updateSyncState(env, {
        backfill_to: lastTo,
        chunks_done: startChunkIdx + i + 1,
      });
    } catch(e) {
      console.error('[Backfill] chunk failed:', chunk.from, '—', e.message);
      // Continue to next chunk rather than failing entire backfill
    }

    // Small delay between chunks to be respectful to TN360 rate limits
    await new Promise(function(r) { setTimeout(r, 200); });
  }

  const chunksCompleted = startChunkIdx + chunksToProcess.length;
  const isComplete      = chunksCompleted >= allChunks.length;

  await updateSyncState(env, {
    status:        isComplete ? 'complete' : 'idle',
    current_chunk: null,
    chunks_done:   chunksCompleted,
    backfill_to:   lastTo || (sync && sync.backfill_to),
  });

  return jsonResponse({
    ok:             true,
    savedThisCall:  totalSaved,
    chunksProcessed: chunksToProcess.length,
    chunksCompleted: chunksCompleted,
    chunksTotal:    allChunks.length,
    isComplete:     isComplete,
    percentComplete: Math.round((chunksCompleted / allChunks.length) * 100),
  });
}

// ── POST /api/admin/camera-history/sync ──────────────────────────────────────
// Fetches last 7 days — used by daily cron AND manual "Sync Today" button
// Uses TN360_API_KEY only
async function handleCameraHistorySync(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  if (!env.TN360_API_KEY) {
    return jsonResponse({ error: 'TN360_API_KEY not configured.' }, 503);
  }

  const now     = new Date();
  const from7   = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromIso = from7.toISOString();
  const toIso   = now.toISOString();

  await updateSyncState(env, { status: 'running', current_chunk: 'Last 7 days' });

  try {
    const events = await fetchCameraEventsChunk(env, fromIso, toIso);
    const saved  = await saveCameraEvents(env, events);

    await updateSyncState(env, {
      status:        'idle',
      last_sync_at:  nowIso(),
      current_chunk: null,
      backfill_to:   toIso,
    });

    await logActivity(env, auth.session.user_id, 'admin', 'camera-history-sync',
      `Synced last 7 days — ${events.length} events fetched, ${saved} new saved`, null);

    return jsonResponse({
      ok:       true,
      fetched:  events.length,
      saved:    saved,
      from:     fromIso,
      to:       toIso,
    });
  } catch(e) {
    await updateSyncState(env, { status: 'idle', current_chunk: null });
    return jsonResponse({ error: e.message }, 502);
  }
}

// ── DELETE /api/admin/camera-history ─────────────────────────────────────────
async function handleCameraHistoryClear(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const perm = await hasPermission(env, auth.session.role_id, 'admin', 'run');
  if (!perm.allowed) return jsonResponse({ error: 'Access denied.' }, 403);

  await env.DB.prepare('DELETE FROM camera_history').run();
  await env.DB.prepare(
    `UPDATE camera_history_sync SET
       backfill_from = NULL, backfill_to = NULL, last_sync_at = NULL,
       total_events = 0, status = 'idle', current_chunk = NULL,
       chunks_done = 0, chunks_total = 0
     WHERE id = 1`
  ).run();

  await logActivity(env, auth.session.user_id, 'admin', 'camera-history-clear',
    'Cleared all camera history and reset sync state', null);

  return jsonResponse({ ok: true });
}

// ── GET /api/camera-history/vehicle/:vehicleId ───────────────────────────────
// Called by snapshot.js history panel — returns stored events for a vehicle
// Frontend then fetches fresh URLs per attachmentId using TN360_SNAPSHOT_KEY
async function handleGetVehicleCameraHistory(request, env, vehicleId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const url    = new URL(request.url);
  const action = url.searchParams.get('action') || null; // optional filter e.g. SNAPSHOT
  const limit  = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
  const before = url.searchParams.get('before') || null; // for pagination

  let sql    = 'SELECT event_id, action, provider, captured_at, attachments FROM camera_history WHERE vehicle_id = ?';
  let params = [vehicleId];

  if (action) { sql += ' AND action = ?'; params.push(action.toUpperCase()); }
  if (before) { sql += ' AND captured_at < ?'; params.push(before); }

  sql += ' ORDER BY captured_at DESC LIMIT ?';
  params.push(limit);

  const rows = await env.DB.prepare(sql).bind(...params).all();
  const events = (rows.results || []).map(function(r) {
    return {
      eventId:    r.event_id,
      action:     r.action,
      provider:   r.provider,
      capturedAt: r.captured_at,
      attachments: JSON.parse(r.attachments || '[]'),
    };
  });

  return jsonResponse({ events: events, count: events.length });
}

// ── Cron handler ──────────────────────────────────────────────────────────────
// Add to export default in src/index.js:
//
// async scheduled(event, env, ctx) {
//   ctx.waitUntil(runDailySync(env));
// }
//
async function runDailySync(env) {
  if (!env.TN360_API_KEY) return;
  const now   = new Date();
  const from7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  try {
    const events = await fetchCameraEventsChunk(env, from7.toISOString(), now.toISOString());
    const saved  = await saveCameraEvents(env, events);
    await env.DB.prepare(
      `UPDATE camera_history_sync SET last_sync_at = ?, status = 'idle', backfill_to = ? WHERE id = 1`
    ).bind(now.toISOString(), now.toISOString()).run();
    console.log('[DailySync] fetched:', events.length, 'saved:', saved);
  } catch(e) {
    console.error('[DailySync] failed:', e.message);
  }
}

// ── Historical Snapshots ──────────────────────────────────────────────────────
// POST /api/historical-snapshots
//
// Required Cloudflare Worker secret:
//   TN360_SNAPSHOT_KEY — personal TN360 API token (Token token="...")
//   Add via: Cloudflare Dashboard → Workers → tge-asset-snapshot → Settings
//            → Variables → Secret variables → Add: TN360_SNAPSHOT_KEY
//
// This route handles both API steps server-side so the personal key
// never touches the browser.
//
// Step 1: POST /v1/devices/events/camera/snapshots — get event list with attachmentIds
// Step 2: GET  /v1/attachments/{id}/content?presigned=true — get fresh image URL per attachment
//
// Returns: { groups: [ { timeAt, attachments: [ { position, url } ] } ] }

async function handleHistoricalSnapshots(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  // Require the personal snapshot key
  if (!env.TN360_SNAPSHOT_KEY) {
    return jsonResponse({
      error: 'Snapshot history API key not configured.',
      detail: 'Add TN360_SNAPSHOT_KEY as a Worker secret in the Cloudflare dashboard: Workers → tge-asset-snapshot → Settings → Variables → Secret variables.'
    }, 503);
  }

  const body = await safeJson(request);
  const vehicleId = String(body.vehicleId || '').trim();
  const deviceId  = String(body.deviceId  || '').trim();
  const from      = String(body.from      || '').trim(); // pre-encoded AEST ISO
  const to        = String(body.to        || '').trim();

  if (!vehicleId || !deviceId || !from || !to) {
    return jsonResponse({ error: 'vehicleId, deviceId, from and to are required.' }, 400);
  }

  const authHeader = `Token token="${env.TN360_SNAPSHOT_KEY}"`;

  // ── Step 1: Get events list ───────────────────────────────────────────────
  let events = [];
  try {
    const eventsRes = await fetch(
      `https://api-au.telematics.com/v1/devices/events/camera/snapshots?from=${from}&to=${to}`,
      {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          vehicles:       [vehicleId],
          devices:        [deviceId],
          orderField:     'EventTime',
          orderDirection: 'desc',
          latestOnly:     false,
          rowCountLimit:  100,
          rowOffset:      0,
        }),
      }
    );

    if (!eventsRes.ok) {
      const errText = await eventsRes.text();
      console.error('[HistSnap] Step 1 failed:', eventsRes.status, errText.slice(0, 200));
      return jsonResponse({
        error: 'Failed to fetch snapshot events from TN360.',
        detail: errText.slice(0, 200),
        status: eventsRes.status,
      }, 502);
    }

    const eventsData = await eventsRes.json();
    events = Array.isArray(eventsData.events) ? eventsData.events : [];
  } catch(e) {
    return jsonResponse({ error: 'Network error fetching snapshot events: ' + e.message }, 502);
  }

  if (!events.length) {
    return jsonResponse({ groups: [], totalEvents: 0 });
  }

  // ── Step 2: Get fresh image URL for each attachment ───────────────────────
  // Process events in parallel (up to 5 at a time to avoid rate limiting)
  const groups = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!Array.isArray(ev.attachments) || !ev.attachments.length) continue;

    // Only process AVAILABLE attachments
    const availableAtts = ev.attachments.filter(function(att) {
      return att.attachmentStatus === 'AVAILABLE';
    });
    if (!availableAtts.length) continue;

    // Fetch fresh URLs for all attachments in this event concurrently
    const attachmentResults = await Promise.all(
      availableAtts.map(async function(att) {
        const timeAt  = new Date(att.timeAt || ev.timeAt || '');
        const year    = timeAt.getFullYear();
        const month   = timeAt.getMonth() + 1; // no leading zero

        try {
          const imgRes = await fetch(
            `https://api-au.telematics.com/v1/attachments/${att.attachmentId}/content` +
            `?pruning=WEB&thumbnail=false&year=${year}&month=${month}&presigned=true`,
            {
              headers: { 'Authorization': authHeader },
              redirect: 'follow',
            }
          );

          if (!imgRes.ok) {
            console.warn('[HistSnap] attachment', att.attachmentId, 'returned', imgRes.status);
            return { position: att.cameraPosition, url: '' };
          }

          // The response is either a redirect (final URL is imgRes.url)
          // or a JSON containing the URL — handle both
          const contentType = imgRes.headers.get('content-type') || '';
          if (contentType.includes('image/')) {
            // It's the actual image — return the final URL after redirect
            return { position: att.cameraPosition, url: imgRes.url };
          }

          // Try JSON response containing URL
          try {
            const json = await imgRes.json();
            const url  = json.attachmentLink || json.url || json.mediaFile || json.contentUrl || imgRes.url || '';
            return { position: att.cameraPosition, url: url };
          } catch(e) {
            // Fallback — return the final URL after any redirects
            return { position: att.cameraPosition, url: imgRes.url };
          }

        } catch(e) {
          console.warn('[HistSnap] attachment', att.attachmentId, 'fetch error:', e.message);
          return { position: att.cameraPosition, url: '' };
        }
      })
    );

    // Only include groups that have at least one image
    const hasImage = attachmentResults.some(function(a) { return !!a.url; });
    if (!hasImage) continue;

    groups.push({
      eventId:     ev.id,
      timeAt:      ev.timeAt || (availableAtts[0] && availableAtts[0].timeAt) || '',
      attachments: attachmentResults,
    });
  }

  return jsonResponse({
    groups:      groups,
    totalEvents: events.length,
    found:       groups.length,
  });
}

// ── Route additions for main fetch handler ────────────────────────────────────
// Add these inside the if (path.startsWith('/api/')) block in export default fetch():
//
// Camera history — admin management
// if (method === 'GET'    && path === '/api/admin/camera-history/status')   return handleCameraHistoryStatus(request, env);
// if (method === 'POST'   && path === '/api/admin/camera-history/backfill') return handleCameraHistoryBackfill(request, env);
// if (method === 'POST'   && path === '/api/admin/camera-history/sync')     return handleCameraHistorySync(request, env);
// if (method === 'DELETE' && path === '/api/admin/camera-history')          return handleCameraHistoryClear(request, env);
//
// Camera history — per vehicle (used by snapshot.js history panel)
// if (method === 'GET' && path.match(/^\/api\/camera-history\/vehicle\/.+$/)) {
//   const vehicleId = path.split('/').pop();
//   return handleGetVehicleCameraHistory(request, env, vehicleId);
// }

// ── POST /api/historical-snapshots/attachments ────────────────────────────────
// Takes an array of stored attachment metadata from D1 and returns fresh URLs.
// Uses TN360_SNAPSHOT_KEY (personal token).
//
// Body: { attachments: [{ attachmentId, position, timeAt }] }
// Returns: { attachments: [{ position, url }] }

async function handleHistoricalSnapshotsAttachments(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  if (!env.TN360_SNAPSHOT_KEY) {
    return jsonResponse({
      error: 'TN360_SNAPSHOT_KEY not configured.',
    }, 503);
  }

  const body        = await safeJson(request);
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!attachments.length) {
    return jsonResponse({ attachments: [] });
  }

  const authHeader = `Token token="${env.TN360_SNAPSHOT_KEY}"`;

  const results = await Promise.all(
    attachments.map(async function(att) {
      const attachmentId = att.attachmentId;
      const position     = att.position || '';
      const timeAt       = new Date(att.timeAt || '');
      const year         = timeAt.getFullYear();
      const month        = timeAt.getMonth() + 1; // no leading zero

      if (!attachmentId || !year || !month) {
        return { position: position, url: '' };
      }

      try {
        const imgRes = await fetch(
          `https://api-au.telematics.com/v1/attachments/${attachmentId}/content` +
          `?pruning=WEB&thumbnail=false&year=${year}&month=${month}&presigned=true`,
          {
            headers: { 'Authorization': authHeader },
            redirect: 'follow',
          }
        );

        if (!imgRes.ok) {
          return { position: position, url: '' };
        } 

        const contentType = imgRes.headers.get('content-type') || '';
        if (contentType.includes('image/')) {
          return { position: position, url: imgRes.url };
        }

        try {
          const json = await imgRes.json();
          const url  = json.url || json.mediaFile || json.contentUrl || imgRes.url || '';
          return { position: position, url: url };
        } catch(e) {
          return { position: position, url: imgRes.url };
        }

      } catch(e) {
        console.warn('[HistSnap/attachments]', attachmentId, 'error:', e.message);
        return { position: position, url: '' };
      }
    })
  );

  return jsonResponse({ attachments: results });
}

// Add this route to src/index.js main fetch handler:
// if (method === 'POST' && path === '/api/historical-snapshots/attachments') return handleHistoricalSnapshotsAttachments(request, env);

// ── Main fetch handler ────────────────────────────────────────────────────────

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailySync(env));
  },
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
      if (method === "GET" && path === "/api/admin/control-tables") return handleGetControlTables(request, env);
      if (method === "POST" && path === "/api/admin/control-tables") return handleSaveControlTable(request, env);

      if (method === "PUT" && path.match(/^\/api\/admin\/control-tables\/\d+$/)) {
  const id = parseInt(path.split("/").pop(), 10);
  const body = await safeJson(request);
  body.id = id;
  return handleSaveControlTable(new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(body)
  }), env);
}
    
      // Registry
      if (method === "GET"    && path === "/api/registry/apis")                              return handleRegistryGetApis(request, env);
      if (method === "POST"   && path === "/api/registry/apis")                              return handleRegistryCreateApi(request, env);
      if (method === "PUT"    && path.match(/^\/api\/registry\/apis\//))                  return handleRegistryUpdateApi(request, env, decodeURIComponent(path.split("/").pop()));
      if (method === "DELETE" && path.match(/^\/api\/registry\/apis\//))                  return handleRegistryDeleteApi(request, env, decodeURIComponent(path.split("/").pop()));

// Historical snapshots (fresh URLs via personal key)
if (method === "POST" && path === "/api/historical-snapshots") return handleHistoricalSnapshots(request, env);
if (method === "POST" && path === "/api/historical-snapshots/attachments") return handleHistoricalSnapshotsAttachments(request, env);      

// Camera history — admin
if (method === "GET"    && path === "/api/admin/camera-history/status")   return handleCameraHistoryStatus(request, env);
if (method === "POST"   && path === "/api/admin/camera-history/backfill") return handleCameraHistoryBackfill(request, env);
if (method === "POST"   && path === "/api/admin/camera-history/sync")     return handleCameraHistorySync(request, env);
if (method === "DELETE" && path === "/api/admin/camera-history")          return handleCameraHistoryClear(request, env);

// Camera history — per vehicle
if (method === "GET" && path.match(/^\/api\/camera-history\/vehicle\/.+$/)) {
  const vehicleId = path.split("/").pop();
  return handleGetVehicleCameraHistory(request, env, vehicleId);
}
      
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
      if (method === "POST" && path === "/api/asset-track-pdf") return handleAssetTrackPdf(request, env);
      if (method === "POST" && path === "/api/send-email") return handleSendEmail(request, env);

      // Utilisation — Static Fleet List import (Power Automate, key-auth, no session)
      if (method === "POST" && path === "/api/utilisation/static-fleet/import") {
        return handleImportStaticFleet(request, env);
      }

      // Utilisation — Static Fleet List dashboard query (session required)
      if (method === "GET" && path === "/api/utilisation/static-fleet") {
        const auth = await requireSession(request, env);
        if (!auth.ok) return auth.response;
        return handleGetStaticFleet(request, env, { session: auth.session, ...utilisationAuthHelpers });
      }

      // Utilisation — field definitions admin (session required)
      if (method === "GET" && path === "/api/utilisation/static-fields") {
        const auth = await requireSession(request, env);
        if (!auth.ok) return auth.response;
        return handleGetStaticFields(request, env, { session: auth.session, ...utilisationAuthHelpers });
      }
      if (method === "PUT" && path === "/api/utilisation/static-fields") {
        const auth = await requireSession(request, env);
        if (!auth.ok) return auth.response;
        return handleUpdateStaticFields(request, env, { session: auth.session, ...utilisationAuthHelpers });
      }

      // Utilisation — exclusion rules admin (session required)
      if (method === "GET" && path === "/api/utilisation/static-exclusions") {
        const auth = await requireSession(request, env);
        if (!auth.ok) return auth.response;
        return handleGetStaticExclusions(request, env, { session: auth.session, ...utilisationAuthHelpers });
      }
      if (method === "PUT" && path === "/api/utilisation/static-exclusions/draft") {
        const auth = await requireSession(request, env);
        if (!auth.ok) return auth.response;
        return handleSaveStaticExclusionsDraft(request, env, { session: auth.session, ...utilisationAuthHelpers });
      }
      if (method === "POST" && path === "/api/utilisation/static-exclusions/preview") {
        const auth = await requireSession(request, env);
        if (!auth.ok) return auth.response;
        return handlePreviewStaticExclusions(request, env, { session: auth.session, ...utilisationAuthHelpers });
      }
      if (method === "POST" && path === "/api/utilisation/static-exclusions/publish") {
        const auth = await requireSession(request, env);
        if (!auth.ok) return auth.response;
        return handlePublishStaticExclusions(request, env, { session: auth.session, ...utilisationAuthHelpers });
      }

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
