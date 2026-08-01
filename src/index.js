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

import {
  handleProcessStaticFleet,
  handlePromoteStaticFleet,
  runStaticFleetPipeline,
} from "./filespec-static-fleet.js";

const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const SESSION_COOKIE      = "tge_session";

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

function randomId() { return crypto.randomUUID().replace(/-/g, ""); }
function nowIso()    { return new Date().toISOString(); }
function expiresIso(){ return new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(); }
async function safeJson(request) { try { return await request.json(); } catch { return {}; } }

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
  if (!session) return { ok: false, response: jsonResponse({ error: "Unauthorised" }, 401) };
  return { ok: true, session };
}

async function hasPermission(env, roleId, feature, action) {
  const row = await env.DB.prepare(
    "SELECT enabled, limit_value FROM permissions WHERE role_id = ? AND feature = ? AND action = ?"
  ).bind(roleId, feature, action).first();
  if (!row) return { allowed: false, limit: null };
  return { allowed: row.enabled === 1, limit: row.limit_value };
}

const utilisationAuthHelpers = { hasPermission, safeJson };

async function logActivity(env, userId, feature, action, detail, ip) {
  await env.DB.prepare(
    "INSERT INTO activity_log (user_id, feature, action, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(userId, feature, action, detail || null, ip || null, nowIso()).run();
}

// POST /api/auth/login
async function handleLogin(request, env) {
  const body     = await safeJson(request);
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "").trim();
  if (!username || !password) return jsonResponse({ error: "Username and password are required." }, 400);
  const hash = await sha256(password);
  const user = await env.DB.prepare(
    "SELECT u.id, u.username, u.first_name, u.last_name, u.email, u.status, u.login_type, u.role_id, u.created_at, u.updated_at, r.name as role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.username = ? AND u.password_hash = ?"
  ).bind(username, hash).first();
  if (!user) return jsonResponse({ error: "Invalid username or password." }, 401);
  if (user.status !== "active") return jsonResponse({ error: "Account is inactive. Contact your administrator." }, 403);
  if (user.login_type === "db_vendor" && env.TN360_API_KEY) {
    try {
      const tn360Res = await fetch(`https://api-au.telematics.com/v1/users/?key=${env.TN360_API_KEY}&pruning=B2B`);
      if (!tn360Res.ok) return jsonResponse({ error: "Vendor verification service unavailable. Please try again." }, 503);
      const tn360Users = await tn360Res.json();
      const tn360User = Array.isArray(tn360Users) ? tn360Users.find(u => String(u.username || "").toLowerCase() === username) : null;
      if (!tn360User) return jsonResponse({ error: "Vendor verification failed — user not found in vendor system." }, 401);
      const isDriver = Array.isArray(tn360User.roles) ? tn360User.roles.some(r => r.name === "Driver") : false;
      if (!isDriver) return jsonResponse({ error: "Vendor verification failed — account is not a Driver." }, 403);
      if (String(tn360User.externalPin || "") !== password) return jsonResponse({ error: "Vendor verification failed — invalid credentials." }, 401);
    } catch (e) {
      return jsonResponse({ error: "Vendor verification error: " + e.message }, 503);
    }
  }
  const sessionId = randomId();
  const ip        = request.headers.get("CF-Connecting-IP") || null;
  await env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?)").bind(sessionId, user.id, nowIso(), expiresIso(), ip).run();
  await logActivity(env, user.id, "auth", "login", "login_type:" + (user.login_type || "db_only"), ip);
  const perms = await env.DB.prepare("SELECT feature, action, enabled, limit_value FROM permissions WHERE role_id = ? AND enabled = 1").bind(user.role_id).all();
  const permMap = {};
  for (const p of (perms.results || [])) {
    if (!permMap[p.feature]) permMap[p.feature] = {};
    permMap[p.feature][p.action] = { enabled: true, limit: p.limit_value };
  }
  const response = jsonResponse({ ok: true, user: { id: user.id, username: user.username, firstName: user.first_name, lastName: user.last_name, email: user.email, role: user.role_name, roleId: user.role_id, loginType: user.login_type || "db_only" }, permissions: permMap });
  return new Response(response.body, { status: 200, headers: { "Content-Type": "application/json", "Set-Cookie": setCookieHeader(sessionId, SESSION_TTL_SECONDS) } });
}

// POST /api/auth/logout
async function handleLogout(request, env) {
  const id = getCookieValue(request, SESSION_COOKIE);
  if (id) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json", "Set-Cookie": setCookieHeader("", 0) } });
}

// GET /api/auth/session
async function handleSession(request, env) {
  const session = await getSession(request, env);
  if (!session) return jsonResponse({ ok: false });
  const perms = await env.DB.prepare("SELECT feature, action, enabled, limit_value FROM permissions WHERE role_id = ? AND enabled = 1").bind(session.role_id).all();
  const permMap = {};
  for (const p of (perms.results || [])) {
    if (!permMap[p.feature]) permMap[p.feature] = {};
    permMap[p.feature][p.action] = { enabled: true, limit: p.limit_value };
  }
  return jsonResponse({ ok: true, user: { id: session.user_id, username: session.username, firstName: session.first_name, lastName: session.last_name, role: session.role_name, roleId: session.role_id }, permissions: permMap });
}

// GET /api/admin/users
async function handleGetUsers(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const perm = await hasPermission(env, auth.session.role_id, "admin", "view");
  if (!perm.allowed) return jsonResponse({ error: "Access denied." }, 403);
  const users = await env.DB.prepare("SELECT u.id, u.username, u.first_name, u.last_name, u.email, u.status, u.login_type, u.role_id, u.created_at, u.updated_at, r.name as role_name FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.first_name").all();
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
  if (!username || !password || !firstName || !lastName) return jsonResponse({ error: "Username, password, first name and last name are required." }, 400);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (existing) return jsonResponse({ error: "Username already exists." }, 409);
  const hash = await sha256(password);
  const loginType = ["db_only","db_vendor"].includes(body.loginType) ? body.loginType : "db_only";
  await env.DB.prepare("INSERT INTO users (username, password_hash, first_name, last_name, email, role_id, status, login_type, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(username, hash, firstName, lastName, email || null, roleId, status, loginType, auth.session.user_id, nowIso(), nowIso()).run();
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
  if (!firstName || !lastName || !username) return jsonResponse({ error: "First name, last name and username are required." }, 400);
  if (isNaN(roleId) || roleId < 1) return jsonResponse({ error: "Invalid role." }, 400);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?").bind(username, userId).first();
  if (existing) return jsonResponse({ error: "Username '" + username + "' is already taken by another user." }, 409);
  const debugInfo = { userId, firstName, lastName, username, email, roleId, status };
  const loginType = ["db_only","db_vendor"].includes(body.loginType) ? body.loginType : "db_only";
  let sql    = "UPDATE users SET first_name=?, last_name=?, username=?, email=?, role_id=?, status=?, login_type=?, updated_at=?";
  let params = [firstName, lastName, username, email || null, roleId, status, loginType, nowIso()];
  
  if (body.password && String(body.password).trim()) {
    const hash = await sha256(String(body.password).trim());
    sql += ", password_hash=?";
    params.push(hash);
  }
  sql += " WHERE id=?";
  params.push(userId);
  await env.DB.prepare(sql).bind(...params).run();
  await logActivity(env, auth.session.user_id, "admin", "update-user", `Updated user id: ${userId} (${username})`, null);
  const updated = await env.DB.prepare("SELECT id, username, first_name, last_name, role_id, status, updated_at FROM users WHERE id = ?").bind(userId).first();
  return jsonResponse({ ok: true, user: updated, debug: debugInfo, params: params });
}

// DELETE /api/admin/users/:id
async function handleDeleteUser(request, env, userId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  if (String(userId) === String(auth.session.user_id)) return jsonResponse({ error: "You cannot delete your own account." }, 400);
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
  const perms = await env.DB.prepare("SELECT * FROM permissions WHERE role_id = ? ORDER BY feature, action").bind(roleId).all();
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
    await env.DB.prepare("INSERT INTO permissions (role_id, feature, action, enabled, limit_value) VALUES (?, ?, ?, ?, ?) ON CONFLICT(role_id, feature, action) DO UPDATE SET enabled=excluded.enabled, limit_value=excluded.limit_value").bind(roleId, p.feature, p.action, p.enabled ? 1 : 0, p.limit || null).run();
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
  const url     = new URL(request.url);
  const userId  = url.searchParams.get("userId")  || null;
  const feature = url.searchParams.get("feature") || null;
  const limit   = Math.min(parseInt(url.searchParams.get("limit") || "200"), 500);
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
  const result = await env.DB.prepare("INSERT INTO roles (name, description, created_at) VALUES (?, ?, ?)").bind(name, description || null, nowIso()).run();
  await env.DB.prepare("INSERT INTO permissions (role_id, feature, action, enabled, limit_value) SELECT ?, feature, action, 0, limit_value FROM permissions WHERE role_id = 3").bind(result.meta.last_row_id).run();
  await logActivity(env, auth.session.user_id, "admin", "create-role", `Created role: ${name}`, null);
  return jsonResponse({ ok: true, roleId: result.meta.last_row_id });
}

async function handleGetVendors(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const perm = await hasPermission(env, auth.session.role_id, "vendor", "view");
  if (!perm.allowed) return jsonResponse({ error: "Access denied" }, 403);
  const vendors = await env.DB.prepare("SELECT * FROM vendors ORDER BY name").all();
  return jsonResponse({ ok: true, vendors: vendors.results || [] });
}

async function handleSaveVendor(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const perm = await hasPermission(env, auth.session.role_id, "vendor", "manage");
  if (!perm.allowed) return jsonResponse({ error: "Access denied" }, 403);
  const body   = await safeJson(request);
  const id     = body.id ? parseInt(body.id, 10) : null;
  const name   = String(body.name  || "").trim();
  const notes  = String(body.notes || "").trim();
  const active = body.active === false ? 0 : 1;
  if (!name) return jsonResponse({ error: "Vendor name is required." }, 400);
  const dupe = await env.DB.prepare("SELECT id FROM vendors WHERE name = ? AND id != ?").bind(name, id || 0).first();
  if (dupe) return jsonResponse({ error: "A vendor with this name already exists." }, 400);
  let vendorId = id;
  if (vendorId) {
    await env.DB.prepare("UPDATE vendors SET name=?, notes=?, active=?, updated_at=? WHERE id=?").bind(name, notes || null, active, nowIso(), vendorId).run();
    await logActivity(env, auth.session.user_id, "vendor", "update", `Updated vendor: ${name}`, null);
  } else {
    const result = await env.DB.prepare("INSERT INTO control_tables (name, feature, output_field, value_source, hardware_match, active, notes, vendor_id, evaluate_as, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(name, feature, outputField, valueSource, hardware.join("|"), active, notes || null, vendorId, String(body.evaluateAs || "number"), nowIso(), nowIso()).run();
    vendorId = result.meta.last_row_id;
    await logActivity(env, auth.session.user_id, "vendor", "create", `Created vendor: ${name}`, null);
  }
  return jsonResponse({ ok: true, id: vendorId });
}

async function handleGetControlTables(request, env, vendorId = null) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  if (vendorId != null) {
    const perm = await hasPermission(env, auth.session.role_id, "vendor", "view");
    if (!perm.allowed) return jsonResponse({ error: "Access denied" }, 403);
  }
  const tables = vendorId != null
    ? await env.DB.prepare("SELECT * FROM control_tables WHERE vendor_id = ? ORDER BY feature, name").bind(vendorId).all()
    : await env.DB.prepare("SELECT * FROM control_tables ORDER BY feature, name").all();
  const rules    = await env.DB.prepare("SELECT * FROM control_table_rules ORDER BY control_table_id, sort_order, min_value").all();
  const hardware = await env.DB.prepare("SELECT * FROM control_table_hardware ORDER BY control_table_id, hardware_match").all();
  return jsonResponse({ ok: true, tables: tables.results || [], rules: rules.results || [], hardware: hardware.results || [] });
}

async function handleSaveControlTable(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const body = await safeJson(request);
  const id          = body.id ? parseInt(body.id, 10) : null;
  const name        = String(body.name        || "").trim();
  const feature     = String(body.feature     || "").trim();
  const outputField = String(body.outputField || "").trim();
  const valueSource = String(body.valueSource || "").trim();
  const notes       = String(body.notes       || "").trim();
  const active      = body.active === false ? 0 : 1;
const hardware    = Array.isArray(body.hardware) ? body.hardware : [];
  const rules       = Array.isArray(body.rules)    ? body.rules    : [];
  const vendorId    = body.vendorId ? parseInt(body.vendorId, 10) : null;
  if (vendorId != null) {
    const perm = await hasPermission(env, auth.session.role_id, "vendor", "manage");
    if (!perm.allowed) return jsonResponse({ error: "Access denied" }, 403);
  }
  if (!name || !feature || !outputField || !valueSource) return jsonResponse({ error: "name, feature, outputField and valueSource are required." }, 400);
  if (!hardware.length) return jsonResponse({ error: "At least one hardware assignment is required." }, 400);
  if (!rules.length)    return jsonResponse({ error: "At least one rule is required." }, 400);
  let tableId = id;
  if (tableId) {
    await env.DB.prepare("UPDATE control_tables SET name=?, feature=?, output_field=?, value_source=?, hardware_match=?, active=?, notes=?, vendor_id=COALESCE(?, vendor_id), evaluate_as=?, updated_at=? WHERE id=?").bind(name, feature, outputField, valueSource, hardware.join("|"), active, notes || null, vendorId, String(body.evaluateAs || "number"), nowIso(), tableId).run();
    await env.DB.prepare("DELETE FROM control_table_rules WHERE control_table_id=?").bind(tableId).run();
    await env.DB.prepare("DELETE FROM control_table_hardware WHERE control_table_id=?").bind(tableId).run();
  } else {
    const result = await env.DB.prepare("INSERT INTO control_tables (name, feature, output_field, value_source, hardware_match, active, notes, vendor_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(name, feature, outputField, valueSource, hardware.join("|"), active, notes || null, vendorId, nowIso(), nowIso()).run();
    tableId = result.meta.last_row_id;
  }
  for (let i = 0; i < hardware.length; i++) {
    const h = String(hardware[i] || "").trim();
    if (!h) continue;
    await env.DB.prepare("INSERT INTO control_table_hardware (control_table_id, hardware_match, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").bind(tableId, h, nowIso(), nowIso()).run();
  }
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const minValue    = Number(r.minValue);
    const maxValue    = Number(r.maxValue);
    const outputValue = String(r.outputValue  || "").trim();
    const outputColour= String(r.outputColour || "gray").trim().toLowerCase();
    if (isNaN(minValue) || isNaN(maxValue) || !outputValue) return jsonResponse({ error: "Each rule requires minValue, maxValue and outputValue." }, 400);
    await env.DB.prepare("INSERT INTO control_table_rules (control_table_id, min_value, max_value, output_value, output_colour, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(tableId, minValue, maxValue, outputValue, outputColour, i, r.active === false ? 0 : 1, nowIso(), nowIso()).run();
  }
  return jsonResponse({ ok: true, id: tableId });
}

// ── Telematics API proxy ──────────────────────────────────────────────────────
async function handleTelematicsProxy(request, env, path) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  if (!env.TN360_API_KEY) return jsonResponse({ error: "Telematics API key not configured." }, 503);
  const url          = new URL(request.url);
  const sessionToken = request.headers.get("X-TN360-Token") || request.headers.get("x-tn360-token") || url.searchParams.get("_token") || null;

  url.searchParams.delete("_token");
  const upstream   = sessionToken ? `https://api-au.telematics.com${path}?${url.searchParams.toString()}` : `https://api-au.telematics.com${path}?key=${env.TN360_API_KEY}&${url.searchParams.toString()}`;
  
  const authHeader = sessionToken ? `Token token="${sessionToken}"` : null;
  const fetchOpts  = { method: request.method, headers: authHeader ? { "Authorization": authHeader, "Content-Type": "application/json" } : { "Content-Type": "application/json" } };
 
  if (request.method === "POST" || request.method === "PUT") {
    const body = await request.text();
    if (body) fetchOpts.body = body;
  }
  const res = await fetch(upstream, fetchOpts);
  if (!res.ok) return jsonResponse({ error: `Upstream error: HTTP ${res.status}` }, 502);
  const text = await res.text();
  if (!text) return jsonResponse({ ok: true, status: res.status });
  try { return jsonResponse(JSON.parse(text)); } catch(e) { return jsonResponse({ ok: true, raw: text }); }
}
async function handleAttachmentContent(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const attachmentId = parts[parts.indexOf('attachments') + 1];
  const params = url.searchParams.toString();
  const token = env.TN360_PERSONAL_KEY || env.TN360_API_KEY;
  const upstream = `https://api-au.telematics.com/v1/attachments/${attachmentId}/content?${params}`;
  const res = await fetch(upstream, {
    method: 'GET',
    headers: {
      'Authorization': `Token token="${token}"`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) return jsonResponse2({ error: `Upstream error: HTTP ${res.status}` }, 502);
  const data = await res.json();
  return jsonResponse2(data);
}

// ── Registry ──────────────────────────────────────────────────────────────────
async function handleRegistryGetApis(request, env, vendorId = null) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "1";

  let query;
  let params = [];

  if (vendorId != null) {
    query = all
      ? "SELECT * FROM registry_apis WHERE vendor_id = ? ORDER BY api_id"
      : "SELECT * FROM registry_apis WHERE vendor_id = ? AND active = 1 ORDER BY api_id";
    params.push(vendorId);
  } else {
    query = all
      ? "SELECT * FROM registry_apis ORDER BY api_id"
      : "SELECT * FROM registry_apis WHERE active = 1 ORDER BY api_id";
  }

  const rows = params.length
    ? await env.DB.prepare(query).bind(...params).all()
    : await env.DB.prepare(query).all();

  const apis = (rows.results || []).map(function(r) {
    return {
      apiId: r.api_id,
      label: r.label,
      group: r.group_name,
      method: r.method,
      url: r.url,
      notes: r.notes,
      vendor: r.vendor,
      vendorId: r.vendor_id,
      category: r.module_tag || null,
     sampleResponse: r.sample_response,
      fields: r.fields ? JSON.parse(r.fields) : [],
      active: r.active === 1,
      authProfileId: r.auth_profile_id != null ? r.auth_profile_id : null,
      callSpec: r.call_spec || null
    };
  });

  return jsonResponse({ apis });
}
// ── Auth profiles: resolve-or-create (deduped on recipe) ─────────────────────
async function resolveAuthProfile(env, vendorId, body) {
  if (body.authProfileId) return parseInt(body.authProfileId, 10);
  const p = body.newAuthProfile;
  if (!p || !vendorId || !String(p.name || "").trim() || !String(p.authType || "").trim()) return null;
  const name = String(p.name).trim(), authType = String(p.authType).trim();
  const authName = String(p.authName || "").trim() || null, secretRef = String(p.secretRef || "").trim() || null;
  const existing = await env.DB.prepare(
    "SELECT id FROM vendor_auth_profiles WHERE vendor_id=? AND auth_type=? AND IFNULL(auth_name,'')=IFNULL(?,'') AND IFNULL(secret_ref,'')=IFNULL(?,'')"
  ).bind(vendorId, authType, authName, secretRef).first();
  if (existing) return existing.id;
  const result = await env.DB.prepare(
    "INSERT INTO vendor_auth_profiles (vendor_id, name, auth_type, auth_name, secret_ref, active, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)"
  ).bind(vendorId, name, authType, authName, secretRef, nowIso(), nowIso()).run();
  return result.meta.last_row_id;
}

function normalizeCallSpec(body) {
  if (!body.callSpec) return null;
  try { return JSON.stringify(typeof body.callSpec === "string" ? JSON.parse(body.callSpec) : body.callSpec); }
  catch (e) { return null; }
}

async function handleRegistryCreateApi(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const body = await safeJson(request);
  if (body.sampleResponse && String(body.sampleResponse).length > 100000) {
    return jsonResponse({ error: "Sample response too large (max 100KB). Trim to 1–2 example records — a sample shows shape, not volume." }, 400);
  }
const authProfileId = await resolveAuthProfile(env, body.vendorId ? parseInt(body.vendorId, 10) : null, body);
  const active = body.active === false ? 0 : 1;
  // module_tag = the screen this definition serves. UI/payload call it
  // "category"; the column matches flows.module_tag so the engine reads one
  // screen-key vocabulary. This boundary is the only category ↔ module_tag map.
  await env.DB.prepare("INSERT OR REPLACE INTO registry_apis (api_id, label, group_name, method, url, notes, vendor, vendor_id, module_tag, sample_response, fields, active, auth_profile_id, call_spec, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(body.apiId, body.label, body.group, body.method, body.url, body.notes||null, null, body.vendorId||null, body.category||null, body.sampleResponse||null, JSON.stringify(body.fields||[]), active, authProfileId, normalizeCallSpec(body), nowIso()).run();
  return jsonResponse({ ok: true });
}
async function handleRegistryUpdateApi(request, env, apiId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const body   = await safeJson(request);
  if (body.sampleResponse && String(body.sampleResponse).length > 100000) {
    return jsonResponse({ error: "Sample response too large (max 100KB). Trim to 1–2 example records — a sample shows shape, not volume." }, 400);
  }
  const active = body.active === false ? 0 : 1;
  const authProfileId = await resolveAuthProfile(env, body.vendorId ? parseInt(body.vendorId, 10) : null, body);
 await env.DB.prepare("INSERT OR REPLACE INTO registry_apis (api_id, label, group_name, method, url, notes, vendor, vendor_id, module_tag, sample_response, fields, active, auth_profile_id, call_spec, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(apiId, body.label, body.group, body.method, body.url, body.notes||null, null, body.vendorId||null, body.category||null, body.sampleResponse||null, JSON.stringify(body.fields||[]), active, authProfileId, normalizeCallSpec(body), nowIso()).run();
  return jsonResponse({ ok: true });
}
async function handleGetAuthProfiles(request, env, vendorId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const perm = await hasPermission(env, auth.session.role_id, "vendor", "view");
  if (!perm.allowed) return jsonResponse({ error: "Access denied" }, 403);
  const rows = await env.DB.prepare("SELECT id, name, auth_type, auth_name, secret_ref, active FROM vendor_auth_profiles WHERE vendor_id=? ORDER BY name").bind(vendorId).all();
  return jsonResponse({ ok: true, profiles: rows.results || [] });
}

// ── Flow engine call primitive ────────────────────────────────────────────────
// Executes a saved definition with its auth profile + {param} substitution and
// returns the FULL parsed response. Gated on the consuming screen's own
// 'run' permission (body.feature), so flow access follows tick-and-flick —
// a user who can run Asset Track can run its flows, and nothing else.
// ── Flow bundle: everything the engine needs for one screen, one fetch ───────
// Gated on the screen's own run permission. Returns active flows for the tag
// with steps, plus referenced definitions (tags/call_spec), hardware sets,
// and control tables with rules + hardware matches.
async function handleEngineFlowBundle(request, env, moduleTag) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const perm = await hasPermission(env, auth.session.role_id, moduleTag, "run");
  if (!perm.allowed) return jsonResponse({ error: "Access denied" }, 403);

  const flows = await env.DB.prepare("SELECT * FROM flows WHERE module_tag=? AND active=1 ORDER BY vendor_id, name").bind(moduleTag).all();
  const flowRows = flows.results || [];
  if (!flowRows.length) return jsonResponse({ ok: true, flows: [], steps: [], definitions: [], hardwareSets: {}, controlTables: [] });

  const flowIds = flowRows.map(f => f.id);
  const qMarks = flowIds.map(() => "?").join(",");
  const steps = (await env.DB.prepare(`SELECT * FROM flow_steps WHERE flow_id IN (${qMarks}) AND active=1 ORDER BY flow_id, sort_order`).bind(...flowIds).all()).results || [];

  const apiIds = [...new Set(steps.filter(s => s.step_type === "api_definition").map(s => s.step_ref))];
  let definitions = [];
  if (apiIds.length) {
    const qa = apiIds.map(() => "?").join(",");
    definitions = (await env.DB.prepare(`SELECT api_id, label, method, url, fields, call_spec, notes FROM registry_apis WHERE api_id IN (${qa}) AND active=1`).bind(...apiIds).all()).results || [];
  }

  const hardwareSets = {};
  for (const s of steps.filter(x => x.step_type === "hardware_set")) {
    const flow = flowRows.find(f => f.id === s.flow_id);
    const key = s.flow_id + ":" + s.step_ref;
    hardwareSets[key] = (await env.DB.prepare("SELECT * FROM hardware_types WHERE vendor_id=? AND applies_to_feature=? AND active=1").bind(flow.vendor_id, s.step_ref).all()).results || [];
  }

  const ctIds = [...new Set(steps.filter(s => s.step_type === "control_table").map(s => parseInt(s.step_ref, 10)).filter(n => !isNaN(n)))];
  let controlTables = [];
  if (ctIds.length) {
    const qc = ctIds.map(() => "?").join(",");
    const cts   = (await env.DB.prepare(`SELECT * FROM control_tables WHERE id IN (${qc}) AND active=1`).bind(...ctIds).all()).results || [];
    const rules = (await env.DB.prepare(`SELECT * FROM control_table_rules WHERE control_table_id IN (${qc}) AND active=1 ORDER BY control_table_id, sort_order`).bind(...ctIds).all()).results || [];
    const hw    = (await env.DB.prepare(`SELECT * FROM control_table_hardware WHERE control_table_id IN (${qc}) AND active=1`).bind(...ctIds).all()).results || [];
    controlTables = cts.map(ct => ({
      ...ct,
      rules: rules.filter(r => r.control_table_id === ct.id),
      hardware: hw.filter(h => h.control_table_id === ct.id).map(h => h.hardware_match),
    }));
  }

  return jsonResponse({ ok: true, flows: flowRows, steps, definitions, hardwareSets, controlTables });
}

async function handleRegistryExecuteApi(request, env, apiId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const reqBody = await safeJson(request);
  const feature = String(reqBody.feature || "").trim();
  if (!feature) return jsonResponse({ error: "Missing feature context." }, 400);
  const perm = await hasPermission(env, auth.session.role_id, feature, "run");
  if (!perm.allowed) return jsonResponse({ error: "Access denied" }, 403);

  const def = await env.DB.prepare("SELECT * FROM registry_apis WHERE api_id=? AND active=1").bind(apiId).first();
  if (!def) return jsonResponse({ error: "Definition not found or inactive: " + apiId }, 404);

  let finalUrl = def.url;
  if (reqBody.params && typeof reqBody.params === "object") {
    for (const [k, val] of Object.entries(reqBody.params)) {
      finalUrl = finalUrl.split("{" + k + "}").join(encodeURIComponent(String(val)));
    }
  }
  if (finalUrl.includes("{")) {
    return jsonResponse({ error: "Unresolved placeholder in URL: " + finalUrl.replace(/key=[^&]+/, "key=***") }, 400);
  }

  const headers = { "Content-Type": "application/json" };
  let secretName = null;

  if (def.auth_profile_id) {
    const profile = await env.DB.prepare("SELECT * FROM vendor_auth_profiles WHERE id=? AND active=1").bind(def.auth_profile_id).first();
    if (profile) {
      secretName = profile.secret_ref;
      const secret = secretName ? env[secretName] : null;
      if (secretName && !secret) return jsonResponse({ error: `Secret '${secretName}' is not configured in the worker.` }, 503);
      const t = String(profile.auth_type || "");
      if (t === "query_param" && secret)        finalUrl += (finalUrl.includes("?") ? "&" : "?") + encodeURIComponent(profile.auth_name || "key") + "=" + encodeURIComponent(secret);
      else if (t === "header_bearer" && secret) headers["Authorization"] = `Bearer ${secret}`;
      else if (t === "header_token" && secret)  headers[profile.auth_name || "Authorization"] = `Token token="${secret}"`;
      else if (t === "header_custom" && secret) headers[profile.auth_name || "X-Api-Key"] = secret;
      else if (t === "session_passthrough") {
        const sess = request.headers.get("X-TN360-Token");
        if (!sess) return jsonResponse({ error: "This definition requires a session token." }, 400);
        headers[profile.auth_name || "X-TN360-Token"] = sess;
      }
    }
  }

  try {
    const upstream = await fetch(finalUrl, { method: def.method || "GET", headers });
    const text = await upstream.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    return jsonResponse({
      ok: upstream.ok,
      status: upstream.status,
      apiId: apiId,
      data: data,
      raw: data === null ? text.slice(0, 2000) : undefined,
    });
  } catch (e) {
    return jsonResponse({ error: "Call failed: " + e.message }, 502);
  }
}

async function handleRegistryTestApi(request, env, apiId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const perm = await hasPermission(env, auth.session.role_id, "vendor", "manage");
  if (!perm.allowed) return jsonResponse({ error: "Access denied" }, 403);

  const def = await env.DB.prepare("SELECT * FROM registry_apis WHERE api_id=?").bind(apiId).first();
  if (!def) return jsonResponse({ error: "Definition not found." }, 404);

const reqBody = await safeJson(request);
  let finalUrl = def.url;
  if (reqBody && reqBody.params && typeof reqBody.params === "object") {
    for (const [k, val] of Object.entries(reqBody.params)) {
      finalUrl = finalUrl.split("{" + k + "}").join(encodeURIComponent(String(val)));
    }
  }
  const headers = { "Content-Type": "application/json" };
  let secretName = null;

  if (def.auth_profile_id) {
    const profile = await env.DB.prepare("SELECT * FROM vendor_auth_profiles WHERE id=?").bind(def.auth_profile_id).first();
    if (profile) {
      secretName = profile.secret_ref;
      const secret = secretName ? env[secretName] : null;
      if (secretName && !secret) return jsonResponse({ error: `Secret '${secretName}' is not configured in the worker. Set it with: wrangler secret put ${secretName}` }, 503);
      const t = String(profile.auth_type || "");
      if (t === "query_param" && secret)   finalUrl += (finalUrl.includes("?") ? "&" : "?") + encodeURIComponent(profile.auth_name || "key") + "=" + encodeURIComponent(secret);
      else if (t === "header_bearer" && secret) headers["Authorization"] = `Bearer ${secret}`;
      else if (t === "header_token" && secret)  headers[profile.auth_name || "Authorization"] = `Token token="${secret}"`;
      else if (t === "header_custom" && secret) headers[profile.auth_name || "X-Api-Key"] = secret;
      else if (t === "session_passthrough") return jsonResponse({ error: "This definition uses a session token supplied at run time — raw test not applicable." }, 400);
    }
  }

  try {
   const upstream = await fetch(finalUrl, { method: def.method || "GET", headers });
    const text = await upstream.text();
    const redactedUrl = secretName && env[secretName] ? finalUrl.split(env[secretName]).join("***") : finalUrl;
    // Parse the FULL body (before display truncation) so the sample picker
    // always slices complete, valid records regardless of display cutoff.
    let records = null, recordCount = null;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) { recordCount = parsed.length; records = parsed.slice(0, 25); }
    } catch (e) { /* not JSON or unparseable — picker simply won't show */ }
    return jsonResponse({
      ok: upstream.ok,
      status: upstream.status,
      executedUrl: redactedUrl,
      body: text.length > 60000 ? text.slice(0, 60000) + "\n... [truncated]" : text,
      records: records,
      recordCount: recordCount,
    });
  } catch (e) {
    return jsonResponse({ error: "Call failed: " + e.message }, 502);
  }
}

async function handleRegistryDeleteApi(request, env, apiId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  await env.DB.prepare("DELETE FROM registry_apis WHERE api_id = ?").bind(apiId).run();
  return jsonResponse({ ok: true });
}
// ── Vendor Hardware Types ───────────────────────────────────────────────────

async function handleVendorHardwareTypes(request, env, vendorId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const perm = await hasPermission(env, auth.session.role_id, "vendor", "view");
  if (!perm.allowed) return jsonResponse({ error: "Access denied" }, 403);

  const rows = await env.DB.prepare(
    `SELECT *
       FROM hardware_types
      WHERE vendor_id = ?
      ORDER BY name`
  ).bind(vendorId).all();

  return jsonResponse({
    hardware: rows.results || []
  });
}

async function handleVendorHardwareTypeSave(request, env, vendorId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  const body = await safeJson(request);

 const perm = await hasPermission(env, auth.session.role_id, "vendor", "manage");
  if (!perm.allowed) return jsonResponse({ error: "Access denied" }, 403);
  const dupe = await env.DB.prepare("SELECT id FROM hardware_types WHERE vendor_id = ? AND code = ?").bind(vendorId, body.hardwareKey).first();
  if (dupe) return jsonResponse({ error: "This vendor already has hardware with that code." }, 400);

  await env.DB.prepare(`
   INSERT INTO hardware_types
    (
      vendor_id,
      code,
      name,
      applies_to_feature,
      device_type,
      type_id,
      type_code,
      type_name,
      model_id,
      model_name,
      category,
      family,
      capabilities,
      raw_example,
      active,
      created_at,
      updated_at
    )
    VALUES
    (
      ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
      datetime('now'),
      datetime('now')
    )
  `).bind(
      vendorId,
      body.hardwareKey,
      body.hardwareLabel,
      body.appliesToFeature || null,
      body.deviceType || null,
      body.typeId || null,
      body.typeCode || null,
      body.typeName || null,
      body.modelId || null,
      body.modelName || null,
      body.category || null,
      body.family || null,
      JSON.stringify(body.capabilities || []),
      body.rawExample || null,
      1
  ).run();

  return jsonResponse({ ok: true });
}

// ── Vendor Flows ──────────────────────────────────────────────────────────────

async function handleGetVendorFlows(request, env, vendorId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const perm = await hasPermission(env, auth.session.role_id, "vendor", "view");
  if (!perm.allowed) return jsonResponse({ error: "Access denied" }, 403);

  const flows = await env.DB.prepare("SELECT * FROM flows WHERE vendor_id = ? ORDER BY module_tag, name").bind(vendorId).all();
  const steps = await env.DB.prepare(
    "SELECT fs.* FROM flow_steps fs JOIN flows f ON f.id = fs.flow_id WHERE f.vendor_id = ? ORDER BY fs.flow_id, fs.sort_order"
  ).bind(vendorId).all();

  return jsonResponse({ ok: true, flows: flows.results || [], steps: steps.results || [] });
}

async function handleSaveVendorFlow(request, env, vendorId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const perm = await hasPermission(env, auth.session.role_id, "vendor", "manage");
  if (!perm.allowed) return jsonResponse({ error: "Access denied" }, 403);

  const body      = await safeJson(request);
  const id        = body.id ? parseInt(body.id, 10) : null;
  const name      = String(body.name      || "").trim();
  const moduleTag = String(body.moduleTag || "").trim();
  const notes     = String(body.notes     || "").trim();
  const active    = body.active === false ? 0 : 1;
  const steps     = Array.isArray(body.steps) ? body.steps : [];

  if (!name)      return jsonResponse({ error: "Flow name is required." }, 400);
  if (!moduleTag) return jsonResponse({ error: "Select which screen this flow feeds." }, 400);
  if (!steps.length) return jsonResponse({ error: "A flow needs at least one step." }, 400);

 const VALID_STEP_TYPES = ["api_definition", "control_table", "hardware_type", "hardware_set"];
  // Per-type role vocabularies (open lists — new roles are words here, never migrations)
  const VALID_ROLES = {
    api_definition: ["seed", "join", "enrich"],
    hardware_set:   ["filter", "annotate"],
    control_table:  ["grade"],
    hardware_type:  ["filter", "annotate"],
  };
  const ROLE_DEFAULTS = { hardware_set: "filter", control_table: "grade", hardware_type: "filter" };

  let seenSeed = false;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const type = String(s.stepType);
    if (!VALID_STEP_TYPES.includes(type)) return jsonResponse({ error: "Invalid step type: " + s.stepType }, 400);
    if (!String(s.stepRef || "").trim()) return jsonResponse({ error: "Every step must reference an item." }, 400);

    let role = String(s.stepRole || "").trim();
    if (!role && ROLE_DEFAULTS[type]) role = ROLE_DEFAULTS[type];
    if (type === "api_definition") {
      if (!role) return jsonResponse({ error: `Step ${i + 1}: API steps must declare a role (seed, join or enrich).` }, 400);
      if (!seenSeed && role !== "seed") return jsonResponse({ error: `Step ${i + 1}: the first API step must be 'seed' — a flow needs a population before it can ${role}.` }, 400);
      if (role === "seed") seenSeed = true;
    }
    if (!(VALID_ROLES[type] || []).includes(role)) return jsonResponse({ error: `Step ${i + 1}: '${role}' is not a valid role for ${type}.` }, 400);
    s.stepRole = role; // normalised — defaults written into the row
  }

  const dupe = await env.DB.prepare("SELECT id FROM flows WHERE vendor_id = ? AND name = ? AND id != ?").bind(vendorId, name, id || 0).first();
  if (dupe) return jsonResponse({ error: "This vendor already has a flow with that name." }, 400);

  let flowId = id;
  if (flowId) {
    await env.DB.prepare("UPDATE flows SET name=?, module_tag=?, notes=?, active=?, updated_at=? WHERE id=? AND vendor_id=?")
      .bind(name, moduleTag, notes || null, active, nowIso(), flowId, vendorId).run();
    await env.DB.prepare("DELETE FROM flow_steps WHERE flow_id=?").bind(flowId).run();
  } else {
    const result = await env.DB.prepare("INSERT INTO flows (vendor_id, name, module_tag, notes, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
      .bind(vendorId, name, moduleTag, notes || null, active, nowIso(), nowIso()).run();
    flowId = result.meta.last_row_id;
  }

  for (let i = 0; i < steps.length; i++) {
await env.DB.prepare("INSERT INTO flow_steps (flow_id, sort_order, step_type, step_ref, step_role, notes, active, created_at, updated_at) VALUES (?,?,?,?,?,?,1,?,?)")
      .bind(flowId, i, String(steps[i].stepType), String(steps[i].stepRef), steps[i].stepRole || null, steps[i].notes ? String(steps[i].notes) : null, nowIso(), nowIso()).run();
  }

  await logActivity(env, auth.session.user_id, "vendor", id ? "update" : "create", `${id ? "Updated" : "Created"} flow: ${name} (${moduleTag})`, null);
  return jsonResponse({ ok: true, id: flowId });
}

// ── Image proxy ───────────────────────────────────────────────────────────────
async function handleImageProxy(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
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
  const res         = await fetch(imageUrl);
  if (!res.ok) return jsonResponse({ error: `Upstream error: HTTP ${res.status}` }, 502);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buffer      = await res.arrayBuffer();
  return new Response(buffer, { status: 200, headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=300" } });
}

async function signImageUrl(env, imageUrl, expiresAt) {
  const secret  = env.SESSION_SECRET || "fallback-secret";
  const payload = `${imageUrl}|${expiresAt}`;
  const key     = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf  = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
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
  return new Response(buffer, { status: 200, headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" } });
}

// ── Mailer signatures ─────────────────────────────────────────────────────────
async function handleListSignatures(request, env) {
  const auth  = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const url   = new URL(request.url);
  const all   = url.searchParams.get("all") === "1";
  const query = all ? "SELECT id, label, html, active, created_at, updated_at FROM mailer_signatures ORDER BY id ASC" : "SELECT id, label, html, active, created_at, updated_at FROM mailer_signatures WHERE active = 1 ORDER BY id ASC";
  const result = await env.DB.prepare(query).all();
  return jsonResponse({ ok: true, signatures: result.results || [] });
}
async function handleCreateSignature(request, env) {
  const auth  = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const body  = await safeJson(request);
  const label = String(body.label || "").trim();
  const html  = String(body.html  || "").trim();
  if (!label || !html) return jsonResponse({ error: "label and html are required." }, 400);
  await env.DB.prepare("INSERT INTO mailer_signatures (label, html, active, created_at, updated_at) VALUES (?, ?, 1, datetime('now'), datetime('now'))").bind(label, html).run();
  return jsonResponse({ ok: true });
}
async function handleUpdateSignature(request, env, id) {
  const auth    = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const body    = await safeJson(request);
  const updates = [];
  const values  = [];
  if (body.label  != null) { updates.push("label = ?");  values.push(String(body.label).trim()); }
  if (body.html   != null) { updates.push("html = ?");   values.push(String(body.html).trim()); }
  if (body.active != null) { updates.push("active = ?"); values.push(body.active ? 1 : 0); }
  if (!updates.length) return jsonResponse({ error: "Nothing to update." }, 400);
  updates.push("updated_at = datetime('now')");
  values.push(id);
  await env.DB.prepare(`UPDATE mailer_signatures SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
  return jsonResponse({ ok: true });
}

async function handleSignImageUrl(request, env) {
  const auth     = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const body     = await safeJson(request);
  const imageUrl = String(body.url || "").trim();
  if (!imageUrl) return jsonResponse({ error: "url is required." }, 400);
  const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
  const sig        = await signImageUrl(env, imageUrl, expiresAt);
  const reqUrlObj  = new URL(request.url);
  const publicUrl  = `${reqUrlObj.origin}/api/public-image?url=${encodeURIComponent(imageUrl)}&exp=${expiresAt}&sig=${sig}`;
  return jsonResponse({ ok: true, publicUrl });
}

// ── PDF constants ─────────────────────────────────────────────────────────────
const PDF_PAGE_W = 841.89;
const PDF_PAGE_H = 595.28;
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
const PDF_NUM_SLOTS   = 5;
const PDF_PHOTO_GAP_X = 8;
const PDF_SLOT_LABELS = ["Road", "Driver", "In-Cab", "R.Ext", "L.Ext"];
const PDF_BRAND_GREEN = rgb(0.078, 0.325, 0.176);

function pdfBandHeight() {
  return PDF_BAND_INTERNAL_PAD + PDF_HEADER_HEIGHT + PDF_PHOTO_LABEL_GAP + PDF_PHOTO_BOX_H + PDF_PHOTO_LABEL_H + PDF_STATUS_ROW_H + PDF_BAND_INTERNAL_PAD;
}
function pdfMaxBandsPerPage() {
  const usableH = PDF_PAGE_H - PDF_MARGIN_TOP - PDF_MARGIN_BOTTOM;
  const bandH   = pdfBandHeight();
  let n = 1;
  while (n * bandH + (n - 1) * PDF_BAND_GAP <= usableH) n++;
  return n - 1;
}
async function fetchImageForPdf(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const buf = await res.arrayBuffer();
    if (contentType.includes("png")) return { bytes: buf, format: "png" };
    return { bytes: buf, format: "jpg" };
  } catch (e) { return null; }
}
function pdfDrawStatusDot(page, font, centerX, baselineY, isWorking) {
  const color  = isWorking ? rgb(0.09, 0.64, 0.29) : rgb(0.86, 0.15, 0.15);
  const label  = isWorking ? "OK" : "FAULT";
  const dotR   = 2.6;
  const labelW = font.widthOfTextAtSize(label, 7);
  const totalW = dotR * 2 + 3 + labelW;
  const startX = centerX - totalW / 2;
  page.drawCircle({ x: startX + dotR, y: baselineY + 2, size: dotR, color });
  page.drawText(label, { x: startX + dotR * 2 + 3, y: baselineY, size: 7, font, color });
}

async function buildCameraFaultPdf(assets) {
  const pdfDoc      = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const bandHeight  = pdfBandHeight();
  const maxPerPage  = pdfMaxBandsPerPage();
  const usableW     = PDF_PAGE_W - PDF_MARGIN_LEFT - PDF_MARGIN_RIGHT;
  const usableH     = PDF_PAGE_H - PDF_MARGIN_TOP - PDF_MARGIN_BOTTOM;
  const availInnerW = usableW - 12;
  const fixedPhotoBoxW = (availInnerW - (PDF_NUM_SLOTS - 1) * PDF_PHOTO_GAP_X) / PDF_NUM_SLOTS;
  const urlToImage = {};
  const fetchJobs  = [];
  assets.forEach((asset) => {
    asset.slots.forEach((slot) => {
      if (slot && slot.url && !urlToImage[slot.url]) {
        urlToImage[slot.url] = null;
        fetchJobs.push(fetchImageForPdf(slot.url).then((result) => { urlToImage[slot.url] = result; }));
      }
    });
  });
  await Promise.all(fetchJobs);
  const urlToEmbedded = {};
  for (const url of Object.keys(urlToImage)) {
    const img = urlToImage[url];
    if (!img) continue;
    try { urlToEmbedded[url] = img.format === "png" ? await pdfDoc.embedPng(img.bytes) : await pdfDoc.embedJpg(img.bytes); } catch (e) { urlToEmbedded[url] = null; }
  }
  let totalCams = 0, totalWorking = 0, totalNotWorking = 0;
  assets.forEach((a) => { a.slots.forEach((s) => { if (!s) return; totalCams++; if (s.status === "working") totalWorking++; else if (s.status === "not_working") totalNotWorking++; }); });
  const pages = [];
  let page = null;
  let bandIndexOnPage = 0;
  function startNewPage() {
    page = pdfDoc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
    pages.push(page);
    bandIndexOnPage = 0;
    page.drawRectangle({ x: PDF_MARGIN_LEFT - 10, y: PDF_MARGIN_BOTTOM - 10, width: usableW + 20, height: usableH + 20, borderColor: rgb(0.82, 0.84, 0.86), borderWidth: 1 });
    const title   = "Camera Fault Report";
    const titleW  = fontBold.widthOfTextAtSize(title, 15);
    page.drawText(title, { x: (PDF_PAGE_W - titleW) / 2, y: PDF_PAGE_H - 26, size: 15, font: fontBold, color: rgb(0.07, 0.07, 0.07) });
    const summary  = `${assets.length} Asset${assets.length !== 1 ? "s" : ""}   |   ${totalCams} Camera${totalCams !== 1 ? "s" : ""}   |   ${totalWorking} Working   |   ${totalNotWorking} Not Working`;
    const summaryW = fontRegular.widthOfTextAtSize(summary, 9);
    page.drawText(summary, { x: (PDF_PAGE_W - summaryW) / 2, y: PDF_PAGE_H - 42, size: 9, font: fontRegular, color: rgb(0.42, 0.45, 0.50) });
  }
  startNewPage();
  assets.forEach((asset, assetIdx) => {
    if (bandIndexOnPage >= maxPerPage) startNewPage();
    const bandTopY    = PDF_PAGE_H - PDF_MARGIN_TOP - bandIndexOnPage * (bandHeight + PDF_BAND_GAP);
    const bandBottomY = bandTopY - bandHeight;
    const isDown      = !!asset.systemDown;
    const isZebra     = bandIndexOnPage % 2 === 1;
    if (isDown)       page.drawRectangle({ x: PDF_MARGIN_LEFT, y: bandBottomY, width: usableW, height: bandHeight, color: rgb(0.996, 0.953, 0.953) });
    else if (isZebra) page.drawRectangle({ x: PDF_MARGIN_LEFT, y: bandBottomY, width: usableW, height: bandHeight, color: rgb(0.980, 0.984, 0.988) });
    page.drawRectangle({ x: PDF_MARGIN_LEFT, y: bandBottomY, width: usableW, height: bandHeight, borderColor: isDown ? rgb(0.99, 0.65, 0.65) : rgb(0.90, 0.91, 0.92), borderWidth: 1 });
    let cursorY = bandTopY - PDF_BAND_INTERNAL_PAD;
    const headerLabel  = `Asset ${asset.legacyNo || "—"} — ${asset.model || "—"}`;
    page.drawText(headerLabel, { x: PDF_MARGIN_LEFT + 6, y: cursorY - 9, size: 10.5, font: fontBold, color: rgb(0.07, 0.07, 0.07) });
    const headerLabelW = fontBold.widthOfTextAtSize(headerLabel, 10.5);
    page.drawText(asset.imei || "—", { x: PDF_MARGIN_LEFT + 6 + headerLabelW + 10, y: cursorY - 9, size: 8, font: fontRegular, color: rgb(0.42, 0.45, 0.50) });
    const rightText  = isDown ? "⚠ NON-FUNCTIONAL" : `Last Comms: ${asset.lastComms || "Unknown"}`;
    const rightColor = isDown ? rgb(0.86, 0.15, 0.15) : rgb(0.22, 0.25, 0.32);
    const rightW     = fontBold.widthOfTextAtSize(rightText, 8);
    page.drawText(rightText, { x: PDF_MARGIN_LEFT + usableW - 6 - rightW, y: cursorY - 9, size: 8, font: fontBold, color: rightColor });
    const headerBottomY = bandTopY - PDF_BAND_INTERNAL_PAD - PDF_HEADER_HEIGHT;
    page.drawLine({ start: { x: PDF_MARGIN_LEFT + 6, y: headerBottomY }, end: { x: PDF_MARGIN_LEFT + usableW - 6, y: headerBottomY }, thickness: 1.3, color: isDown ? rgb(0.86, 0.15, 0.15) : PDF_BRAND_GREEN });
    cursorY -= PDF_HEADER_HEIGHT + PDF_PHOTO_LABEL_GAP;
    const photoTopY = cursorY;
    const n         = asset.slots.length;
    const rowW      = n > 0 ? n * fixedPhotoBoxW + (n - 1) * PDF_PHOTO_GAP_X : 0;
    const startX    = PDF_MARGIN_LEFT + 6 + (availInnerW - rowW) / 2;
    for (let slotIdx = 0; slotIdx < n; slotIdx++) {
      const slot     = asset.slots[slotIdx];
      const bx       = startX + slotIdx * (fixedPhotoBoxW + PDF_PHOTO_GAP_X);
      const by       = photoTopY - PDF_PHOTO_BOX_H;
      const embedded = slot && slot.url ? urlToEmbedded[slot.url] : null;
      if (embedded) {
        const scaled  = embedded.scaleToFit(fixedPhotoBoxW, PDF_PHOTO_BOX_H);
        const offsetX = bx + (fixedPhotoBoxW - scaled.width) / 2;
        const offsetY = by + (PDF_PHOTO_BOX_H - scaled.height) / 2;
        page.drawRectangle({ x: bx, y: by, width: fixedPhotoBoxW, height: PDF_PHOTO_BOX_H, color: rgb(0.96, 0.96, 0.97) });
        page.drawImage(embedded, { x: offsetX, y: offsetY, width: scaled.width, height: scaled.height });
        page.drawRectangle({ x: bx, y: by, width: fixedPhotoBoxW, height: PDF_PHOTO_BOX_H, borderColor: rgb(0.82, 0.84, 0.86), borderWidth: 1 });
      } else {
        page.drawRectangle({ x: bx, y: by, width: fixedPhotoBoxW, height: PDF_PHOTO_BOX_H, color: rgb(0.96, 0.96, 0.97), borderColor: rgb(0.82, 0.84, 0.86), borderWidth: 1 });
        const label     = "no image";
        const textWidth = fontRegular.widthOfTextAtSize(label, 7);
        page.drawText(label, { x: bx + fixedPhotoBoxW/2 - textWidth/2, y: by + PDF_PHOTO_BOX_H/2 - 3, size: 7, font: fontRegular, color: rgb(0.61, 0.64, 0.69) });
      }
      const slotLabel = (slot && slot.label) || PDF_SLOT_LABELS[slotIdx] || "—";
      const labelW    = fontBold.widthOfTextAtSize(slotLabel, 7.5);
      page.drawText(slotLabel, { x: bx + fixedPhotoBoxW/2 - labelW/2, y: by - PDF_PHOTO_LABEL_H + 2, size: 7.5, font: fontBold, color: rgb(0.07, 0.07, 0.07) });
      if (slot && slot.status) {
        pdfDrawStatusDot(page, fontBold, bx + fixedPhotoBoxW/2, by - PDF_PHOTO_LABEL_H - PDF_STATUS_ROW_H + 6, slot.status === "working");
      } else {
        const dash  = "—";
        const dashW = fontBold.widthOfTextAtSize(dash, 7);
        page.drawText(dash, { x: bx + fixedPhotoBoxW/2 - dashW/2, y: by - PDF_PHOTO_LABEL_H - PDF_STATUS_ROW_H + 6, size: 7, font: fontBold, color: rgb(0.82, 0.84, 0.86) });
      }
    }
    bandIndexOnPage++;
  });
  const generatedAt = new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
  pages.forEach((pg, idx) => {
    const footerText = `Page ${idx + 1} of ${pages.length}   —   Generated ${generatedAt}`;
    const footerW    = fontRegular.widthOfTextAtSize(footerText, 7.5);
    pg.drawText(footerText, { x: (PDF_PAGE_W - footerW) / 2, y: PDF_MARGIN_BOTTOM - 22, size: 7.5, font: fontRegular, color: rgb(0.61, 0.64, 0.69) });
  });
  return await pdfDoc.save();
}

// ── Snapshot PDF ──────────────────────────────────────────────────────────────
// Portrait A4, auto-spacing, rounded header/footer, brand green scheme.
// Sections are measured first, spare space distributed as equal gaps between
// sections. Photo rows use natural aspect ratio — never stretched.

const SNAP_PAGE_W  = 595.28;
const SNAP_PAGE_H  = 841.89;
const SNAP_ML      = 18;
const SNAP_MR      = 18;
const SNAP_UW      = SNAP_PAGE_W - SNAP_ML - SNAP_MR;
const SNAP_HDR_H   = 38;
const SNAP_FOOT_H  = 28;
const SNAP_TOP_PAD = 12;
const SNAP_BOT_PAD = 12;
const SNAP_CARD_H  = 24;
const SNAP_GAP_X   = 4;
const SNAP_GAP_Y   = 3;
const SNAP_LABEL_H = 13;
const SNAP_RADIUS  = 10;
const SNAP_PHOTO_RATIO = 0.65;  // natural aspect ratio for photo boxes

const SNAP_DARK   = rgb(0.000, 0.235, 0.122);  // #003c1f
const SNAP_BRAND  = rgb(0.078, 0.325, 0.176);  // #14532d
const SNAP_YELLOW = rgb(0.831, 0.941, 0.149);  // #d4f026
const SNAP_WHITE  = rgb(1.000, 1.000, 1.000);
const SNAP_SURF   = rgb(0.941, 0.980, 0.957);  // #f0faf4
const SNAP_LGREEN = rgb(0.910, 0.961, 0.933);  // #e8f5ee
const SNAP_LINE   = rgb(0.784, 0.867, 0.816);  // #c8ddd0
const SNAP_INK    = rgb(0.067, 0.067, 0.067);
const SNAP_MUTED  = rgb(0.420, 0.450, 0.500);

function snapDataH(rowCount, cols) {
  const lines = Math.max(1, Math.ceil(rowCount / cols));
  return lines * (SNAP_CARD_H + SNAP_GAP_Y) - SNAP_GAP_Y;
}

function snapDrawHeader(page, fontR, fontB, title, sub) {
  const w = SNAP_PAGE_W, h = SNAP_HDR_H, r = SNAP_RADIUS;
  const x = SNAP_ML - 10, y = SNAP_PAGE_H - h, bw = SNAP_UW + 20;
  // rounded rect with top corners rounded, bottom square
  page.drawRectangle({ x, y: y + r, width: bw, height: h - r, color: SNAP_DARK });
  page.drawRectangle({ x: x + r, y, width: bw - r * 2, height: r, color: SNAP_DARK });
  page.drawCircle({ x: x + r,      y: y + r, size: r, color: SNAP_DARK });
  page.drawCircle({ x: x + bw - r, y: y + r, size: r, color: SNAP_DARK });

  const titleW = fontB.widthOfTextAtSize(title, 13);
  page.drawText(title, { x: (SNAP_PAGE_W - titleW) / 2, y: SNAP_PAGE_H - 22, size: 13, font: fontB, color: SNAP_WHITE });
  const subW = fontR.widthOfTextAtSize(sub, 7.5);
  page.drawText(sub, { x: (SNAP_PAGE_W - subW) / 2, y: SNAP_PAGE_H - 32, size: 7.5, font: fontR, color: SNAP_YELLOW });
}

function snapDrawFooter(page, fontR, footerText) {
  const x = SNAP_ML - 10, bw = SNAP_UW + 20, h = SNAP_FOOT_H, r = SNAP_RADIUS;
  // rounded rect with bottom corners rounded, top square
  page.drawRectangle({ x, y: r, width: bw, height: h - r, color: SNAP_DARK });
  page.drawRectangle({ x: x + r, y: 0, width: bw - r * 2, height: r, color: SNAP_DARK });
  page.drawCircle({ x: x + r,      y: r, size: r, color: SNAP_DARK });
  page.drawCircle({ x: x + bw - r, y: r, size: r, color: SNAP_DARK });

  const fw = fontR.widthOfTextAtSize(footerText, 7.5);
  page.drawText(footerText, { x: (SNAP_PAGE_W - fw) / 2, y: 10, size: 7.5, font: fontR, color: SNAP_YELLOW });
}

function snapDrawLabel(page, fontB, y, text) {
  const lbl = text.toUpperCase();
  const lw  = fontB.widthOfTextAtSize(lbl, 6.5);
  page.drawRectangle({ x: SNAP_ML - 2, y: y - 9, width: lw + 8, height: 11, color: SNAP_LGREEN, borderRadius: 3 });
  page.drawText(lbl, { x: SNAP_ML + 2, y: y - 7, size: 6.5, font: fontB, color: SNAP_BRAND });
  page.drawLine({ start: { x: SNAP_ML + lw + 10, y: y - 3 }, end: { x: SNAP_PAGE_W - SNAP_MR, y: y - 3 }, thickness: 0.5, color: SNAP_LINE });
}

function snapDrawDataCards(page, fontR, fontB, y, rows, cols) {
  const colW = (SNAP_UW - (cols - 1) * SNAP_GAP_X) / cols;
  rows.forEach((row, i) => {
    const col  = i % cols;
    const line = Math.floor(i / cols);
    const x    = SNAP_ML + col * (colW + SNAP_GAP_X);
    const ry   = y - line * (SNAP_CARD_H + SNAP_GAP_Y);
    page.drawRectangle({ x, y: ry - SNAP_CARD_H, width: colW, height: SNAP_CARD_H, color: SNAP_SURF, borderColor: SNAP_LINE, borderWidth: 0.5, borderRadius: 4 });
    const lbl = String(row.label || "").toUpperCase().slice(0, 22);
    page.drawText(lbl, { x: x + 5, y: ry - 8, size: 5.5, font: fontB, color: SNAP_BRAND });
    let val = String(row.value == null || row.value === "" ? "—" : row.value);
    if (val.length > 24) val = val.slice(0, 23) + "…";
    page.drawText(val, { x: x + 5, y: ry - 19, size: 8.5, font: fontR, color: SNAP_INK });
  });
}

async function snapDrawPhotos(pdfDoc, page, y, photos, boxH) {
  const n    = photos.length;
  if (!n) return y;
  const gap  = 4;
  const boxW = (SNAP_UW - (n - 1) * gap) / n;
  const actualH = Math.min(boxH, boxW * 0.68);

  const fetched = await Promise.all(photos.map(p =>
    p && p.url ? fetchImageForPdf(p.url) : Promise.resolve(null)
  ));

  for (let i = 0; i < n; i++) {
    const bx = SNAP_ML + i * (boxW + gap);
    const by = y - actualH;
    let embedded = null;
    if (fetched[i]) {
      try {
        embedded = fetched[i].format === "png"
          ? await pdfDoc.embedPng(fetched[i].bytes)
          : await pdfDoc.embedJpg(fetched[i].bytes);
      } catch(e) { embedded = null; }
    }

    if (embedded) {
      const scaled  = embedded.scaleToFit(boxW, actualH);
      const offsetX = bx + (boxW - scaled.width) / 2;
      const offsetY = by + (actualH - scaled.height) / 2;
      page.drawRectangle({ x: bx, y: by, width: boxW, height: actualH, color: rgb(0.06, 0.06, 0.06), borderRadius: 5 });
      page.drawImage(embedded, { x: offsetX, y: offsetY, width: scaled.width, height: scaled.height });
      page.drawRectangle({ x: bx, y: by, width: boxW, height: actualH, borderColor: SNAP_LINE, borderWidth: 0.6, borderRadius: 5 });
    } else {
      page.drawRectangle({ x: bx, y: by, width: boxW, height: actualH, color: rgb(0.96, 0.96, 0.97), borderColor: SNAP_LINE, borderWidth: 0.6, borderRadius: 5 });
      const noImg  = "no image";
      const noImgW = 30;
      page.drawText(noImg, { x: bx + boxW / 2 - noImgW / 2, y: by + actualH / 2 - 3, size: 7, font: await pdfDoc.embedFont(StandardFonts.Helvetica), color: SNAP_MUTED });
    }
  }
  return y - actualH;
}

async function buildSnapshotPdf(asset) {
  const pdfDoc = await PDFDocument.create();
  const fontR  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const sections = asset.sections || [];
  const slotW    = (SNAP_UW - 4 * 4) / 5;
  const photoH   = slotW * SNAP_PHOTO_RATIO;

  // ── Measure fixed content height ──────────────────────────────────────────
  const usableH = SNAP_PAGE_H - SNAP_HDR_H - SNAP_FOOT_H - SNAP_TOP_PAD - SNAP_BOT_PAD;
  let fixedH = 0;
  for (const s of sections) {
    fixedH += SNAP_LABEL_H;
    if (s.photos && s.photos.length) {
      fixedH += Math.min(photoH, slotW * 0.68);
    } else {
      fixedH += snapDataH((s.rows || []).length, s.cols || 4);
    }
  }

  // ── Distribute spare space as equal section gaps ───────────────────────────
  const spare  = usableH - fixedH;
  const secGap = Math.max(spare / Math.max(sections.length, 1), 4);

  // ── Generated timestamp ───────────────────────────────────────────────────
  const generatedAt = new Date().toLocaleString("en-AU", {
    timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true
  });

  // ── Build page ────────────────────────────────────────────────────────────
  const page = pdfDoc.addPage([SNAP_PAGE_W, SNAP_PAGE_H]);

  const docTitle = `Asset ${asset.legacyNo || "—"} — Snapshot Report`;
  const docSub   = `Generated ${generatedAt}   |   ${asset.registration || "—"}   |   ${asset.state || "—"}` +
                   (asset.vehicleType ? `   |   ${asset.vehicleType}` : "");

  snapDrawHeader(page, fontR, fontB, docTitle, docSub);

  const footerText = `Page 1 of 1   —   Asset Snapshot Report   —   Generated ${generatedAt}`;
  snapDrawFooter(page, fontR, footerText);

  let y = SNAP_PAGE_H - SNAP_HDR_H - SNAP_TOP_PAD;

  for (const s of sections) {
    snapDrawLabel(page, fontB, y, s.label || s.title || s.kicker || "");
    y -= SNAP_LABEL_H;

    if (s.photos && s.photos.length) {
      y = await snapDrawPhotos(pdfDoc, page, y, s.photos, photoH);
    } else {
      const rows = (s.rows || []);
      const cols = s.cols || 4;
      snapDrawDataCards(page, fontR, fontB, y, rows, cols);
      y -= snapDataH(rows.length, cols);
    }

    y -= secGap;
  }

  return await pdfDoc.save();
}

async function handleSnapshotPdf(request, env) {
  const auth  = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const body  = await safeJson(request);
  const asset = body && body.asset;
  if (!asset || typeof asset !== "object") return jsonResponse({ error: "asset object is required." }, 400);
  if (!Array.isArray(asset.sections) || !asset.sections.length) return jsonResponse({ error: "asset.sections must be a non-empty array." }, 400);
  try {
    const pdfBytes  = await buildSnapshotPdf(asset);
    let binary      = "";
    const chunkSize = 8192;
    const bytes     = new Uint8Array(pdfBytes);
    for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    const base64   = btoa(binary);
    const safeName = String(asset.legacyNo || "asset").replace(/[\\/:*?"<>|]+/g, "-").trim() || "asset";
    return jsonResponse({ ok: true, base64, fileName: "Asset " + safeName + " snapshot.pdf", sizeBytes: pdfBytes.length });
  } catch (e) {
    return jsonResponse({ error: "Snapshot PDF generation failed: " + e.message }, 500);
  }
}
async function handleMergeMailPdf(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const body    = await safeJson(request);
  const row     = body.row || {};
  const columns = Array.isArray(body.columns) ? body.columns : Object.keys(row);
  const titleField    = String(body.titleField    || '').trim();
  const subtitleField = String(body.subtitleField || '').trim();
  const includeDate   = body.includeDate !== false;
  const fileName      = String(body.fileName || 'Merge Mail').trim();

  try {
    const pdfDoc = await PDFDocument.create();
    const fontR  = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const generatedAt = new Date().toLocaleString("en-AU", {
      timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit",
      year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true
    });
    const todayDate = new Date().toLocaleDateString("en-AU", {
      timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit", year: "numeric"
    });

    // Build header text
    const titleVal    = titleField    && row[titleField]    ? String(row[titleField])    : fileName;
    const subtitleVal = subtitleField && row[subtitleField] ? String(row[subtitleField]) : null;

    const docTitle = titleVal + (subtitleVal ? ' — ' + subtitleVal : '');
    const docSub   = includeDate ? todayDate + '   |   Generated ' + generatedAt : 'Generated ' + generatedAt;

    // Build sections — all columns as data cards
    const rows = columns
      .filter(function(c) { return row[c] != null && String(row[c]).trim() !== ''; })
      .map(function(c) { return { label: c, value: String(row[c]) }; });

    const sections = [{ label: fileName, cols: 4, rows: rows, photos: null }];

    // Measure and auto-space
    const usableH = SNAP_PAGE_H - SNAP_HDR_H - SNAP_FOOT_H - SNAP_TOP_PAD - SNAP_BOT_PAD;
    let fixedH = 0;
    for (const s of sections) {
      fixedH += SNAP_LABEL_H;
      fixedH += snapDataH((s.rows || []).length, s.cols || 4);
    }
    const spare  = usableH - fixedH;
    const secGap = Math.max(spare / Math.max(sections.length, 1), 4);

    const page = pdfDoc.addPage([SNAP_PAGE_W, SNAP_PAGE_H]);

    snapDrawHeader(page, fontR, fontB, docTitle, docSub);
    snapDrawFooter(page, fontR, `Page 1 of 1   —   ${fileName}   —   Generated ${generatedAt}`);

    let y = SNAP_PAGE_H - SNAP_HDR_H - SNAP_TOP_PAD;

    for (const s of sections) {
      snapDrawLabel(page, fontB, y, s.label || '');
      y -= SNAP_LABEL_H;
      snapDrawDataCards(page, fontR, fontB, y, s.rows, s.cols || 4);
      y -= snapDataH(s.rows.length, s.cols || 4);
      y -= secGap;
    }

    const pdfBytes = await pdfDoc.save();
    let binary = '';
    const bytes = new Uint8Array(pdfBytes);
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const base64   = btoa(binary);
    const safeName = titleVal.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'merge-mail';
    return jsonResponse({ ok: true, base64, fileName: safeName + '.pdf', sizeBytes: pdfBytes.length });
  } catch(e) {
    return jsonResponse({ error: 'Merge Mail PDF generation failed: ' + e.message }, 500);
  }
}

async function handleSdHealthPdf(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const body    = await safeJson(request);
  const rows    = Array.isArray(body.rows) ? body.rows : [];
  const summary = body.summary || {};
  if (!rows.length) return jsonResponse({ error: "rows array is required." }, 400);
  try {
    const pdfDoc   = await PDFDocument.create();
    const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pageW = 841.89, pageH = 595.28, margin = 28;
    const brand = PDF_BRAND_GREEN;
    const ink   = rgb(0.07,0.09,0.08);
    const muted = rgb(0.42,0.45,0.50);
    const line  = rgb(0.82,0.84,0.86);
    const headerFill = rgb(0.94,0.97,0.95);
    const zebraFill  = rgb(0.985,0.988,0.990);
    const issueFill  = rgb(0.996,0.953,0.953);
    const reviewFill = rgb(0.999,0.980,0.940);

    const cols = [
      { key:'fleetNo',   label:'Fleet No',      w:55  },
      { key:'imei',      label:'IMEI',           w:115 },
      { key:'model',     label:'Model',          w:90  },
      { key:'sd1',       label:'SD 1 Status',    w:80  },
      { key:'sd1size',   label:'SD 1 Size',      w:65  },
      { key:'sd2',       label:'SD 2 Status',    w:80  },
      { key:'sd2size',   label:'SD 2 Size',      w:65  },
      { key:'overall',   label:'Overall',        w:60  },
      { key:'lastConn',  label:'Last Connected', w:105 },
      { key:'status',    label:'Status',         w:80  },
    ];

    const tableX = margin, tableW = pageW - margin*2;
    const rowH = 20, headerH = 22;
    const tableTopFirst = pageH - 145, tableTopNext = pageH - 78, tableBottom = 42;
    const footerY = 18;

    const generatedAt = summary.generated || new Date().toLocaleString("en-AU", {
      timeZone:"Australia/Sydney", day:"2-digit", month:"2-digit", year:"numeric",
      hour:"2-digit", minute:"2-digit", hour12:true
    });

    let pages = [], page = null, y = 0;

    function tw(text, size, fnt) { return fnt.widthOfTextAtSize(String(text||""), size); }
    function dtf(pg, text, x, yy, maxW, size, fnt, color) {
      let s = String(text == null || text === "" ? "—" : text);
      while (s.length && tw(s, size, fnt) > maxW) s = s.slice(0,-1);
      if (s !== String(text == null || text === "" ? "—" : text)) s = s.length > 1 ? s.slice(0,-1) + "…" : "…";
      pg.drawText(s, { x, y:yy, size, font:fnt, color });
    }

    function drawPageFrame(pg) {
      pg.drawRectangle({ x:margin-10, y:30, width:pageW-(margin-10)*2, height:pageH-48, borderColor:line, borderWidth:0.8 });
    }

    function drawTitle(pg) {
      const t = "SD Card Health Report", tW = tw(t, 17, fontBold);
      pg.drawText(t, { x:(pageW-tW)/2, y:pageH-34, size:17, font:fontBold, color:ink });
      const sub = "Camera device SD card status across fleet assets", sW = tw(sub, 8.5, font);
      pg.drawText(sub, { x:(pageW-sW)/2, y:pageH-49, size:8.5, font, color:muted });
      pg.drawLine({ start:{x:margin, y:pageH-60}, end:{x:pageW-margin, y:pageH-60}, thickness:1.4, color:brand });
    }

    function drawSummary(pg) {
      const cards = [
        ["Generated",     generatedAt],
        ["Total Assets",  summary.totalAssets  || rows.length],
        ["With Camera",   summary.withCamera   || rows.filter(r=>!r.exception).length],
        ["Reporting",     summary.reporting    || rows.filter(r=>r.status==="Reporting").length],
        ["Not Reporting", summary.notReporting || rows.filter(r=>r.status==="Not Reporting").length],
        ["SD Faults",     summary.sdFaults     || rows.filter(r=>r.sdFault).length],
      ];
      const gap = 6, cardW = (tableW - gap*(cards.length-1)) / cards.length, cardH = 38;
      let x = margin;
      cards.forEach(function(card) {
        pg.drawRectangle({ x, y:pageH-111, width:cardW, height:cardH, color:rgb(0.960,0.976,0.965), borderColor:rgb(0.900,0.940,0.920), borderWidth:0.7 });
        pg.drawText(String(card[0]).toUpperCase(), { x:x+6, y:pageH-88, size:6.5, font:fontBold, color:rgb(0.32,0.42,0.36) });
        dtf(pg, card[1], x+6, pageH-103, cardW-12, 9, fontBold, ink);
        x += cardW + gap;
      });
    }

    function drawTableHeader(pg, yy) {
      pg.drawRectangle({ x:tableX, y:yy-headerH, width:tableW, height:headerH, color:headerFill, borderColor:line, borderWidth:0.7 });
      let x = tableX;
      cols.forEach(function(col) {
        pg.drawText(col.label, { x:x+4, y:yy-14, size:7.2, font:fontBold, color:rgb(0.19,0.31,0.23) });
        x += col.w;
      });
      pg.drawLine({ start:{x:tableX, y:yy-headerH}, end:{x:tableX+tableW, y:yy-headerH}, thickness:1, color:brand });
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
        const t = "SD Card Health Report", tW = tw(t, 13, fontBold);
        page.drawText(t, { x:(pageW-tW)/2, y:pageH-38, size:13, font:fontBold, color:ink });
        const c = "Continued", cW = tw(c, 8.5, font);
        page.drawText(c, { x:(pageW-cW)/2, y:pageH-52, size:8.5, font, color:muted });
        page.drawLine({ start:{x:margin, y:pageH-50}, end:{x:pageW-margin, y:pageH-50}, thickness:1.2, color:brand });
        y = tableTopNext;
      }
      drawTableHeader(page, y);
      y -= headerH;
    }

    newPage(true);

    rows.forEach(function(row, idx) {
      if (y - rowH < tableBottom) newPage(false);

      // Exception row
      if (row.exception) {
        page.drawRectangle({ x:tableX, y:y-rowH, width:tableW, height:rowH, color:rgb(0.996,0.953,0.953), borderColor:line, borderWidth:0.35 });
        dtf(page, row.fleetNo, tableX+4, y-13, cols[0].w-6, 7, fontBold, ink);
        dtf(page, row.exception, tableX+cols[0].w+4, y-13, tableW-cols[0].w-8, 7, font, rgb(0.75,0.12,0.12));
        y -= rowH;
        return;
      }

      const isIssue  = row.status === "Not Reporting";
      const isReview = row.status === "Review";
      const isFault  = row.sdFault;
      const fill = isIssue ? issueFill : (isReview ? reviewFill : (idx%2===1 ? zebraFill : rgb(1,1,1)));

      page.drawRectangle({ x:tableX, y:y-rowH, width:tableW, height:rowH, color:fill, borderColor:rgb(0.90,0.91,0.92), borderWidth:0.35 });

      let x = tableX;
      cols.forEach(function(col) {
        const value = row[col.key] == null || row[col.key] === "" ? "—" : row[col.key];
        let color = ink;
        if (col.key === "status") {
          color = row.status === "Reporting" ? rgb(0.05,0.42,0.18) : (row.status === "Review" ? rgb(0.60,0.35,0.00) : rgb(0.75,0.12,0.12));
        }
        if (col.key === "sd1" || col.key === "sd2") {
          color = value === "Present" ? rgb(0.05,0.42,0.18) : (value === "—" ? muted : rgb(0.75,0.12,0.12));
        }
        if (col.key === "overall") {
          color = value === "OK" ? rgb(0.05,0.42,0.18) : (value === "—" ? muted : rgb(0.75,0.12,0.12));
        }
        dtf(page, value, x+4, y-13, col.w-6, col.key==="status"?7.1:6.8, col.key==="status"?fontBold:font, color);
        x += col.w;
      });
      y -= rowH;
    });

    pages.forEach(function(pg, idx) {
      const footer = `Page ${idx+1} of ${pages.length}   —   Generated ${generatedAt}`;
      const footerW = tw(footer, 7.5, font);
      pg.drawText(footer, { x:(pageW-footerW)/2, y:footerY, size:7.5, font, color:muted });
    });

    const pdfBytes = await pdfDoc.save();
    let binary = "";
    const bytes = new Uint8Array(pdfBytes);
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i+8192));
    return jsonResponse({ ok:true, base64:btoa(binary), fileName:"SD Card Health Report.pdf", sizeBytes:pdfBytes.length });
  } catch(e) {
    return jsonResponse({ error:"SD Health PDF generation failed: " + e.message }, 500);
  }
}

async function handleAssetTrackPdf(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const body    = await safeJson(request);
  const rows    = Array.isArray(body.rows) ? body.rows : [];
  const summary = body.summary || {};
  if (!rows.length) return jsonResponse({ error: "rows array is required." }, 400);
  try {
    const pdfDoc   = await PDFDocument.create();
    const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pageW = 841.89, pageH = 595.28, margin = 28;
    const brand = PDF_BRAND_GREEN, ink = rgb(0.07,0.09,0.08), muted = rgb(0.42,0.45,0.50), line = rgb(0.82,0.84,0.86);
    const headerFill = rgb(0.94,0.97,0.95), zebraFill = rgb(0.985,0.988,0.990), issueFill = rgb(0.996,0.953,0.953);
    const cols = [
      {key:"fleetNo",label:"Fleet",w:50},{key:"registration",label:"Registration",w:72},{key:"imei",label:"IMEI",w:105},
      {key:"model",label:"Model",w:128},{key:"battBase",label:"Batt Base",w:70},{key:"battCurrent",label:"Batt Current",w:78},
      {key:"battStatus",label:"Batt Status",w:76},{key:"lastSeen",label:"Last Seen",w:112},{key:"status",label:"Status",w:86}
    ];
    const tableX=margin, tableW=pageW-margin*2, rowH=20, headerH=22, footerY=18;
    const tableTopFirst=pageH-145, tableTopNext=pageH-78, tableBottom=42;
    let pages=[], page=null, y=0;
    const generatedAt = summary.generated || new Date().toLocaleString("en-AU",{timeZone:"Australia/Sydney",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true});
    function tw(text,size,fnt){return fnt.widthOfTextAtSize(String(text||""),size);}
    function dtf(pg,text,x,yy,maxW,size,fnt,color){let s=String(text==null||text===""?"—":text);while(s.length&&tw(s,size,fnt)>maxW)s=s.slice(0,-1);if(s!==String(text==null||text===""?"—":text))s=s.length>1?s.slice(0,-1)+"…":"…";pg.drawText(s,{x,y:yy,size,font:fnt,color});}
    function drawPageFrame(pg){pg.drawRectangle({x:margin-10,y:30,width:pageW-(margin-10)*2,height:pageH-48,borderColor:line,borderWidth:0.8});}
    function drawTitle(pg){const t="Asset Track Report",tW=tw(t,17,fontBold);pg.drawText(t,{x:(pageW-tW)/2,y:pageH-34,size:17,font:fontBold,color:ink});const sub="Asset Tracker device assignment, battery and reporting status",sW=tw(sub,8.5,font);pg.drawText(sub,{x:(pageW-sW)/2,y:pageH-49,size:8.5,font,color:muted});pg.drawLine({start:{x:margin,y:pageH-60},end:{x:pageW-margin,y:pageH-60},thickness:1.4,color:brand});}
    function drawSummary(pg){const cards=[["Generated",generatedAt],["Total Rows",summary.totalAssets||rows.length],["With Tracker",summary.withTracker||rows.filter(r=>r.imei&&r.imei!=="—").length],["Reporting",summary.reporting||rows.filter(r=>r.status==="Reporting").length],["Issues",summary.notReporting||rows.filter(r=>r.status!=="Reporting").length]];const gap=8,cardW=(tableW-gap*(cards.length-1))/cards.length,cardH=38;let x=margin;cards.forEach(card=>{pg.drawRectangle({x,y:pageH-111,width:cardW,height:cardH,color:rgb(0.960,0.976,0.965),borderColor:rgb(0.900,0.940,0.920),borderWidth:0.7});pg.drawText(String(card[0]).toUpperCase(),{x:x+8,y:pageH-88,size:6.5,font:fontBold,color:rgb(0.32,0.42,0.36)});dtf(pg,card[1],x+8,pageH-103,cardW-16,9,fontBold,ink);x+=cardW+gap;});}
    function drawTableHeader(pg,yy){pg.drawRectangle({x:tableX,y:yy-headerH,width:tableW,height:headerH,color:headerFill,borderColor:line,borderWidth:0.7});let x=tableX;cols.forEach(col=>{pg.drawText(col.label,{x:x+5,y:yy-14,size:7.2,font:fontBold,color:rgb(0.19,0.31,0.23)});x+=col.w;});pg.drawLine({start:{x:tableX,y:yy-headerH},end:{x:tableX+tableW,y:yy-headerH},thickness:1,color:brand});}
    function newPage(isFirst){page=pdfDoc.addPage([pageW,pageH]);pages.push(page);drawPageFrame(page);if(isFirst){drawTitle(page);drawSummary(page);y=tableTopFirst;}else{const t="Asset Track Report",tW=tw(t,13,fontBold);page.drawText(t,{x:(pageW-tW)/2,y:pageH-38,size:13,font:fontBold,color:ink});const c="Continued",cW=tw(c,8.5,font);page.drawText(c,{x:(pageW-cW)/2,y:pageH-52,size:8.5,font,color:muted});page.drawLine({start:{x:margin,y:pageH-50},end:{x:pageW-margin,y:pageH-50},thickness:1.2,color:brand});y=tableTopNext;}drawTableHeader(page,y);y-=headerH;}
    newPage(true);
    rows.forEach((row,idx)=>{if(y-rowH<tableBottom)newPage(false);const isIssue=row.status&&row.status!=="Reporting";const fill=isIssue?issueFill:(idx%2===1?zebraFill:rgb(1,1,1));page.drawRectangle({x:tableX,y:y-rowH,width:tableW,height:rowH,color:fill,borderColor:rgb(0.90,0.91,0.92),borderWidth:0.35});let x=tableX;cols.forEach(col=>{const value=row[col.key]==null||row[col.key]===""?"—":row[col.key];const isStatus=col.key==="status"||col.key==="battStatus";const c=value==="Critical"||value==="Low"||value==="No Meter Data"||value==="Not Asset Tracker"||value==="No Device Assigned"||value==="Fleet Not Found"?rgb(0.75,0.12,0.12):(value==="Fresh"||value==="Good"||value==="Reporting"?rgb(0.05,0.42,0.18):ink);dtf(page,value,x+5,y-13,col.w-8,isStatus?7.1:6.8,isStatus?fontBold:font,c);x+=col.w;});y-=rowH;});
    pages.forEach((pg,idx)=>{const footer=`Page ${idx+1} of ${pages.length}   —   Generated ${generatedAt}`;const footerW=tw(footer,7.5,font);pg.drawText(footer,{x:(pageW-footerW)/2,y:footerY,size:7.5,font,color:muted});});
    const pdfBytes=await pdfDoc.save();let binary="";const bytes=new Uint8Array(pdfBytes);for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return jsonResponse({ok:true,base64:btoa(binary),fileName:"Asset Track Report.pdf",sizeBytes:pdfBytes.length});
  } catch(e) { return jsonResponse({error:"Asset Track PDF generation failed: "+e.message},500); }
}

async function handleCameraFaultPdf(request, env) {
  const auth   = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const body   = await safeJson(request);
  const assets = Array.isArray(body.assets) ? body.assets : [];
  if (!assets.length) return jsonResponse({ error: "assets array is required." }, 400);
  if (assets.length > 200) return jsonResponse({ error: "Maximum 200 assets per PDF." }, 400);
  try {
    const pdfBytes  = await buildCameraFaultPdf(assets);
    let binary      = "";
    const chunkSize = 8192;
    const bytes     = new Uint8Array(pdfBytes);
    for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    return jsonResponse({ ok: true, base64: btoa(binary), sizeBytes: pdfBytes.length });
  } catch (e) { return jsonResponse({ error: "PDF generation failed: " + e.message }, 500); }
}

// ── Send email ────────────────────────────────────────────────────────────────
async function handleSendEmail(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  if (!env.POWER_AUTOMATE_WEBHOOK_URL) return jsonResponse({ error: "Email webhook not configured." }, 503);
  const body     = await safeJson(request);
  const to       = String(body.to      || "").trim();
  const cc       = String(body.cc      || "").trim();
  const bcc      = String(body.bcc     || "").trim();
  const subject  = String(body.subject || "").trim();
  const htmlBody = String(body.htmlBody|| "").trim();
  const attachmentBase64 = body.attachmentBase64 ? String(body.attachmentBase64) : null;
  const attachmentName   = body.attachmentName   ? String(body.attachmentName)   : "attachment.pdf";
  if (!to || !subject || !htmlBody) return jsonResponse({ error: "to, subject and htmlBody are required." }, 400);
  const payload = { to, cc, bcc, subject, htmlBody };
  if (attachmentBase64) { payload.attachmentName = attachmentName; payload.attachmentBase64 = attachmentBase64; }
  try {
    const res = await fetch(env.POWER_AUTOMATE_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) { const text = await res.text(); return jsonResponse({ error: `Power Automate error: HTTP ${res.status}`, detail: text.slice(0,300) }, 502); }
    await logActivity(env, auth.session.user_id, "email", "send", `To: ${to}${cc?" | CC: "+cc:""}${bcc?" | BCC: "+bcc:""} | Subject: ${subject}${attachmentBase64?" | +PDF attachment":""}`, null);
    return jsonResponse({ ok: true });
  } catch(e) { return jsonResponse({ error: e.message }, 502); }
}

// ── Image size ────────────────────────────────────────────────────────────────
async function handleImageSize(request, env) {
  const auth     = await requireSession(request, env);
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
    const res  = await fetch(imageUrl, { method: "HEAD" });
    const size = res.headers.get("content-length");
    const type = res.headers.get("content-type");
    return jsonResponse({ ok: res.ok, status: res.status, sizeBytes: size ? parseInt(size) : null, sizeKb: size ? Math.round(parseInt(size)/1024) : null, contentType: type });
  } catch(e) { return jsonResponse({ error: e.message }, 502); }
}

// ── Camera History ────────────────────────────────────────────────────────────
const BACKFILL_START    = '2024-02-01';
const BACKFILL_TZ       = '+10:00';
const ENRICH_BATCH_SIZE = 50;

function buildChunks(fromDate, toDate, days) {
  const chunks  = [];
  const chunkMs = days * 24 * 60 * 60 * 1000;
  let t = new Date(fromDate + 'T00:00:00' + BACKFILL_TZ).getTime();
  const end = toDate.getTime();
  while (t < end) {
    const from    = new Date(t);
    const to      = new Date(Math.min(t + chunkMs - 1000, end));
    const fromEnc = encodeURIComponent(from.toISOString().slice(0,19) + BACKFILL_TZ);
    const toEnc   = encodeURIComponent(to.toISOString().slice(0,19)   + BACKFILL_TZ);
    chunks.push({ from: from.toISOString(), to: to.toISOString(), fromEnc, toEnc });
    t += chunkMs;
  }
  return chunks;
}

async function fetchAndSaveChunk(env, chunk, log) {
  const companyId = env.TN360_COMPANY_ID || '432639';
  const url = `https://api-au.telematics.com/v1/events/camera?company_id=${companyId}&from=${chunk.fromEnc}&to=${chunk.toEnc}&pruning=B2B&key=${env.TN360_API_KEY}`;
  log.push({ phase: 1, action: 'fetch', url: url.replace(env.TN360_API_KEY, '***'), from: chunk.from, to: chunk.to });

  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) {
    const text = await res.text();
    log.push({ phase: 1, action: 'fetch_error', status: res.status, detail: text.slice(0, 200) });
    throw new Error(`Camera events fetch failed: HTTP ${res.status}`);
  }

  const data   = await res.json();
  const events = Array.isArray(data) ? data : (Array.isArray(data.events) ? data.events : []);
  log.push({ phase: 1, action: 'fetch_result', returned: events.length });

  let saved = 0, skipped = 0;
  for (const ev of events) {
    const vehicleId  = String(ev.vehicleId || ev.vehicleID || '').trim();
    const eventId    = String(ev.id || '').trim();
    if (!vehicleId || !eventId) continue;
    const deviceId   = String(ev.deviceId  || '').trim();
    const eventType  = String(ev.type      || 'CAMERA').toUpperCase();
    const action     = String(ev.action    || ev.type || 'UNKNOWN').toUpperCase();
    const capturedAt = ev.timeAt || ev.eventTime || ev.createdAt || '';
    const attrs      = ev.attributes || {};
    const provider   = String(attrs.provider || '').toUpperCase();
    const uuid       = String(attrs.uuid     || '').trim();
   let channels     = [];
    try {
      const extras = typeof attrs.extras === 'string' ? JSON.parse(attrs.extras) : (attrs.extras || {});
      channels = Array.isArray(extras.tn360_channels) ? extras.tn360_channels : [];
    } catch(e) { channels = []; }

    // Extract image dimensions from context.mediaFiles
    let mediaDetails = [];
    try {
      const ctx = typeof attrs.context === 'string' ? JSON.parse(attrs.context) : (attrs.context || {});
      const mediaFiles = (ctx.response && Array.isArray(ctx.response.mediaFiles))
        ? ctx.response.mediaFiles
        : (Array.isArray(ctx.mediaFiles) ? ctx.mediaFiles : []);
      mediaFiles.forEach(function(m) {
        if (!m || !m.imageDetails) return;
        const d       = m.imageDetails;
        const sources = Array.isArray(d.sources) ? d.sources : [];
        const source  = sources[0] || (m.source || '');
        if (!source) return;
        mediaDetails.push({
          source:  String(source).toUpperCase(),
          width:   d.imageWidth  || null,
          height:  d.imageHeight || null,
          quality: d.imageQuality || null,
          collage: d.collage || null,
        });
      });
    } catch(e) { mediaDetails = []; }

    try {
      const result = await env.DB.prepare(
        `INSERT OR IGNORE INTO camera_history
         (event_id, vehicle_id, device_id, event_type, action, provider, captured_at, uuid, channels, attachments, media_details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
     ).bind(eventId, vehicleId, deviceId || null, eventType, action, provider || null, capturedAt, uuid || null, JSON.stringify(channels), JSON.stringify([]), JSON.stringify(mediaDetails), nowIso()).run();
      if (result.meta && result.meta.changes > 0) {
        saved++;
        log.push({ phase: 1, action: 'saved', eventId, vehicleId, capturedAt });
      } else {
        skipped++;
        log.push({ phase: 1, action: 'skipped_duplicate', eventId });
      }
    } catch(e) {
      log.push({ phase: 1, action: 'save_error', eventId, error: e.message });
    }
  }
  log.push({ phase: 1, action: 'chunk_complete', returned: events.length, saved, skipped });
  return { returned: events.length, saved, skipped };
}

async function enrichBatch(env, fromIso, toIso, startAfterEventId, batchSize, log) {
  const token    = env.TN360_SNAPSHOT_KEY || env.TN360_API_KEY;
  const fromDate = fromIso.slice(0, 10);
  const toDate   = new Date(new Date(toIso).getTime() + 24*60*60*1000).toISOString().slice(0, 10);

  let sql    = `SELECT event_id, vehicle_id, device_id, captured_at
                FROM camera_history
                WHERE (attachments = '[]' OR attachments IS NULL)
                AND SUBSTR(captured_at, 1, 10) >= ? AND SUBSTR(captured_at, 1, 10) <= ?`;
  let params = [fromDate, toDate];
  if (startAfterEventId) { sql += ' AND event_id > ?'; params.push(startAfterEventId); }
  sql += ' ORDER BY captured_at ASC, event_id ASC LIMIT ?';
  params.push(batchSize);

  const rows   = await env.DB.prepare(sql).bind(...params).all();
  const events = rows.results || [];
  log.push({ phase: 2, action: 'batch_start', count: events.length, startAfterEventId: startAfterEventId || 'beginning' });

  let enriched = 0, noMatch = 0, errors = 0;
  let lastEventId = startAfterEventId || null;

  for (const ev of events) {
    lastEventId = ev.event_id;
    const fromEnc = encodeURIComponent(fromIso.slice(0, 19) + BACKFILL_TZ);
    const toEnc   = encodeURIComponent(toIso.slice(0, 19)   + BACKFILL_TZ);

    const payload = {
      vehicles:      [ev.vehicle_id],
      devices:       ev.device_id ? [ev.device_id] : [],
      orderField:    'EventTime',
      orderDirection:'asc',
      latestOnly:    false,
      rowCountLimit: 100,
      rowOffset:     0,
      search:        null,
    };

    log.push({ phase: 2, action: 'call', eventId: ev.event_id, vehicleId: ev.vehicle_id, deviceId: ev.device_id });

    try {
      const res = await fetch(
        `https://api-au.telematics.com/v1/devices/events/camera/snapshots?from=${fromEnc}&to=${toEnc}`,
        {
          method:  'POST',
          headers: { 'Authorization': `Token token="${token}"`, 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        log.push({ phase: 2, action: 'call_error', eventId: ev.event_id, status: res.status, detail: text.slice(0, 200) });
        errors++;
        await new Promise(r => setTimeout(r, 700));
        continue;
      }

      const data       = await res.json();
      const snapEvents = Array.isArray(data.events) ? data.events : [];
      log.push({ phase: 2, action: 'call_result', eventId: ev.event_id, totalCount: data.totalCount, eventsReturned: snapEvents.length });

      const match = snapEvents.find(s => String(s.id) === String(ev.event_id));
      if (!match || !Array.isArray(match.attachments) || !match.attachments.length) {
        log.push({ phase: 2, action: 'no_match', eventId: ev.event_id });
        noMatch++;
        await new Promise(r => setTimeout(r, 700));
        continue;
      }

      const capturedAt  = match.timeAt || '';
      const attachments = match.attachments
        .filter(a => a.attachmentId != null)
        .map(a => ({
          attachmentId:       a.attachmentId,
          cameraPosition:     a.cameraPosition     || '',
          cameraPositionName: a.cameraPositionName || a.cameraPosition || '',
          timeAt:             a.timeAt || capturedAt,
          attachmentStatus:   a.attachmentStatus   || 'UNKNOWN',
        }));

      await env.DB.prepare(`UPDATE camera_history SET attachments = ? WHERE event_id = ?`)
        .bind(JSON.stringify(attachments), ev.event_id).run();

      log.push({ phase: 2, action: 'enriched', eventId: ev.event_id, attachments: attachments.length });
      enriched++;

    } catch(e) {
      log.push({ phase: 2, action: 'error', eventId: ev.event_id, error: e.message });
      errors++;
    }

    await new Promise(r => setTimeout(r, 700));
  }

  const hasMore = events.length === batchSize;
  log.push({ phase: 2, action: 'batch_complete', enriched, noMatch, errors, hasMore, lastEventId });
  return { enriched, noMatch, errors, hasMore, lastEventId, processed: events.length };
}

async function updateSyncState(env, fields) {
  const sets   = Object.keys(fields).map(k => k + ' = ?').join(', ');
  const values = Object.values(fields);
  await env.DB.prepare(`UPDATE camera_history_sync SET ${sets} WHERE id = 1`).bind(...values).run();
}

async function handleCameraHistoryStatus(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const perm = await hasPermission(env, auth.session.role_id, 'admin', 'view');
  if (!perm.allowed) return jsonResponse({ error: 'Access denied.' }, 403);
  const sync   = await env.DB.prepare('SELECT * FROM camera_history_sync WHERE id = 1').first();
  const counts = await env.DB.prepare(`
    SELECT COUNT(*) as total,
           COUNT(DISTINCT vehicle_id) as vehicles,
           MIN(captured_at) as oldest,
           MAX(captured_at) as newest,
           SUM(CASE WHEN attachments != '[]' AND attachments IS NOT NULL THEN 1 ELSE 0 END) as with_attachments,
           SUM(json_array_length(attachments)) as total_attachment_ids
    FROM camera_history`).first();
  const byAction = await env.DB.prepare(`SELECT action, COUNT(*) as count FROM camera_history GROUP BY action ORDER BY count DESC`).all();
  return jsonResponse({ sync: sync || {}, counts: counts || {}, byAction: byAction.results || [] });
}

async function handleCameraHistoryBackfill(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const perm = await hasPermission(env, auth.session.role_id, 'admin', 'run');
  if (!perm.allowed) return jsonResponse({ error: 'Access denied.' }, 403);
  if (!env.TN360_API_KEY) return jsonResponse({ error: 'TN360_API_KEY not configured.' }, 503);

  const body              = await safeJson(request);
  const chunkIndex        = parseInt(body.chunkIndex || 0, 10);
  const phase             = String(body.phase || 'phase1');
  const startAfterEventId = body.startAfterEventId || null;
  const log               = [];
  const chunks            = buildChunks(BACKFILL_START, new Date(), 7);
  const total             = chunks.length;

  if (chunkIndex >= total) {
    await updateSyncState(env, { status: 'complete', current_chunk: null, chunks_done: total, chunks_total: total });
    return jsonResponse({ ok: true, complete: true, message: 'Backfill complete.', chunksTotal: total, log });
  }

  const chunk = chunks[chunkIndex];
  await updateSyncState(env, {
    status: 'running', chunks_total: total, chunks_done: chunkIndex,
    current_chunk: chunk.from.slice(0,10) + ' → ' + chunk.to.slice(0,10) + ' (' + phase + ')',
  });

  try {
    if (phase === 'phase1') {
      const result = await fetchAndSaveChunk(env, chunk, log);
      await updateSyncState(env, { backfill_from: BACKFILL_START, backfill_to: chunk.to });
      return jsonResponse({
        ok: true, complete: false, chunkIndex, chunksTotal: total,
        chunk: { from: chunk.from, to: chunk.to }, phase: 'phase1', result,
        nextAction: { phase: 'phase2', chunkIndex, startAfterEventId: null }, log,
      });
    } else {
      const result = await enrichBatch(env, chunk.from, chunk.to, startAfterEventId, ENRICH_BATCH_SIZE, log);
      await updateSyncState(env, { chunks_done: chunkIndex + (result.hasMore ? 0 : 1) });
      const nextAction = result.hasMore
        ? { phase: 'phase2', chunkIndex, startAfterEventId: result.lastEventId }
        : { phase: 'phase1', chunkIndex: chunkIndex + 1, startAfterEventId: null };
      return jsonResponse({
        ok: true, complete: false, chunkIndex, chunksTotal: total,
        chunk: { from: chunk.from, to: chunk.to }, phase: 'phase2', result, nextAction, log,
      });
    }
  } catch(e) {
    await updateSyncState(env, { status: 'idle', current_chunk: null });
    log.push({ action: 'fatal_error', error: e.message });
    return jsonResponse({ ok: false, error: e.message, chunkIndex, log }, 500);
  }
}

async function handleCameraHistorySync(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  if (!env.TN360_API_KEY) return jsonResponse({ error: 'TN360_API_KEY not configured.' }, 503);

  const body              = await safeJson(request);
  const phase             = String(body.phase || 'phase1');
  const startAfterEventId = body.startAfterEventId || null;
  const log               = [];
  const now               = new Date();
  const from7             = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromEnc           = encodeURIComponent(from7.toISOString().slice(0,19) + BACKFILL_TZ);
  const toEnc             = encodeURIComponent(now.toISOString().slice(0,19)   + BACKFILL_TZ);
  const chunk             = { from: from7.toISOString(), to: now.toISOString(), fromEnc, toEnc };

  await updateSyncState(env, { status: 'running', current_chunk: 'Last 7 days (' + phase + ')' });

  try {
    if (phase === 'phase1') {
      const result = await fetchAndSaveChunk(env, chunk, log);
      return jsonResponse({
        ok: true, complete: false, phase: 'phase1', result,
        nextAction: { phase: 'phase2', startAfterEventId: null }, log,
      });
    } else {
      const result = await enrichBatch(env, chunk.from, chunk.to, startAfterEventId, ENRICH_BATCH_SIZE, log);
      if (!result.hasMore) {
        await updateSyncState(env, { status: 'idle', last_sync_at: nowIso(), current_chunk: null, backfill_to: now.toISOString() });
      }
      return jsonResponse({
        ok: true, complete: !result.hasMore, phase: 'phase2', result,
        nextAction: result.hasMore ? { phase: 'phase2', startAfterEventId: result.lastEventId } : null, log,
      });
    }
  } catch(e) {
    await updateSyncState(env, { status: 'idle', current_chunk: null });
    log.push({ action: 'fatal_error', error: e.message });
    return jsonResponse({ ok: false, error: e.message, log }, 500);
  }
}

async function handleCameraHistoryClear(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const perm = await hasPermission(env, auth.session.role_id, 'admin', 'run');
  if (!perm.allowed) return jsonResponse({ error: 'Access denied.' }, 403);
  await env.DB.prepare('DELETE FROM camera_history').run();
  await env.DB.prepare(`UPDATE camera_history_sync SET backfill_from=NULL, backfill_to=NULL, last_sync_at=NULL, total_events=0, status='idle', current_chunk=NULL, chunks_done=0, chunks_total=0 WHERE id=1`).run();
  await logActivity(env, auth.session.user_id, 'admin', 'camera-history-clear', 'Cleared all camera history and reset sync state', null);
  return jsonResponse({ ok: true });
}

async function handleGetVehicleCameraHistory(request, env, vehicleId) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const url    = new URL(request.url);
  const limit  = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
  const before = url.searchParams.get('before') || null;
  let sql    = `SELECT event_id, action, provider, captured_at, attachments
                FROM camera_history
                WHERE vehicle_id = ?
                AND attachments != '[]' AND attachments IS NOT NULL`;
  let params = [vehicleId];
  if (before) { sql += ' AND captured_at < ?'; params.push(before); }
  sql += ' ORDER BY captured_at DESC LIMIT ?';
  params.push(limit);
  const rows   = await env.DB.prepare(sql).bind(...params).all();
  const events = (rows.results || []).map(r => ({
    eventId:     r.event_id,
    action:      r.action,
    provider:    r.provider,
    capturedAt:  r.captured_at,
    attachments: JSON.parse(r.attachments || '[]'),
  }));
  return jsonResponse({ events, count: events.length });
}

async function runDailySync(env) {
  if (!env.TN360_API_KEY) return;
  const now   = new Date();
  const from7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  try {
    const events = await fetchCameraEventsChunk(env, from7.toISOString(), now.toISOString());
    const saved  = await saveCameraEvents(env, events);
    await env.DB.prepare(`UPDATE camera_history_sync SET last_sync_at=?, status='idle', backfill_to=? WHERE id=1`).bind(now.toISOString(), now.toISOString()).run();
    console.log('[DailySync] fetched:', events.length, 'saved:', saved);
  } catch(e) { console.error('[DailySync] failed:', e.message); }
}

// ── Historical Snapshots ──────────────────────────────────────────────────────
async function handleHistoricalSnapshots(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  if (!env.TN360_SNAPSHOT_KEY) {
    return jsonResponse({ error: 'Snapshot history API key not configured.', detail: 'Add TN360_SNAPSHOT_KEY as a Worker secret.' }, 503);
  }
  const body      = await safeJson(request);
  const vehicleId = String(body.vehicleId || '').trim();
  const deviceId  = String(body.deviceId  || '').trim();
  const from      = String(body.from      || '').trim();
  const to        = String(body.to        || '').trim();
  if (!vehicleId || !deviceId || !from || !to) return jsonResponse({ error: 'vehicleId, deviceId, from and to are required.' }, 400);
  const authHeader = `Token token="${env.TN360_SNAPSHOT_KEY}"`;

  // Step 1 — get events with attachment IDs
  let events = [];
  try {
    const eventsRes = await fetch(
      `https://api-au.telematics.com/v1/devices/events/camera/snapshots?from=${from}&to=${to}`,
      {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicles: [vehicleId], devices: [deviceId], orderField: 'EventTime', orderDirection: 'desc', latestOnly: false, rowCountLimit: 100, rowOffset: 0 }),
      }
    );
    if (!eventsRes.ok) {
      const errText = await eventsRes.text();
      return jsonResponse({ error: 'Failed to fetch snapshot events from TN360.', detail: errText.slice(0,200), status: eventsRes.status }, 502);
    }
    const eventsData = await eventsRes.json();
    events = Array.isArray(eventsData.events) ? eventsData.events : [];
  } catch(e) {
    return jsonResponse({ error: 'Network error fetching snapshot events: ' + e.message }, 502);
  }
  if (!events.length) return jsonResponse({ groups: [], totalEvents: 0 });

  // Step 2 — get fresh image URL per attachment
  const groups = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!Array.isArray(ev.attachments) || !ev.attachments.length) continue;
    const availableAtts = ev.attachments.filter(att => att.attachmentStatus === 'AVAILABLE');
    if (!availableAtts.length) continue;
    const attachmentResults = await Promise.all(
      availableAtts.map(async function(att) {
        const timeAt = new Date(att.timeAt || ev.timeAt || '');
        const year   = timeAt.getFullYear();
        const month  = timeAt.getMonth() + 1;
        try {
         const imgRes = await fetch(
          `https://api-au.telematics.com/v1/attachments/${attachmentId}/content?pruning=WEB&thumbnail=false&year=${year}&month=${month}&presigned=true`,
          {
            headers: {
              'Authorization': authHeader,
              'Origin':  'https://tn360-au.telematics.com',
              'Referer': 'https://tn360-au.telematics.com/',
              'User-Agent': 'Mozilla/5.0',
            },
            redirect: 'follow',
          }
        );
          if (!imgRes.ok) return { position: att.cameraPosition, url: '' };
          const contentType = imgRes.headers.get('content-type') || '';
          if (contentType.includes('image/')) return { position: att.cameraPosition, url: imgRes.url };
          try {
            const json = await imgRes.json();
            const url  = json.attachmentLink || json.url || json.mediaFile || json.contentUrl || imgRes.url || '';
            return { position: att.cameraPosition, url };
          } catch(e) {
            return { position: att.cameraPosition, url: imgRes.url };
          }
        } catch(e) {
          return { position: att.cameraPosition, url: '' };
        }
      })
    );
    const hasImage = attachmentResults.some(a => !!a.url);
    if (!hasImage) continue;
    groups.push({ eventId: ev.id, timeAt: ev.timeAt || (availableAtts[0] && availableAtts[0].timeAt) || '', attachments: attachmentResults });
  }
  return jsonResponse({ groups, totalEvents: events.length, found: groups.length });
}

async function handleHistoricalSnapshotsAttachments(request, env) {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  if (!env.TN360_SNAPSHOT_KEY) return jsonResponse({ error: 'TN360_SNAPSHOT_KEY not configured.' }, 503);
  const body        = await safeJson(request);
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  if (!attachments.length) return jsonResponse({ attachments: [] });
  const authHeader = `Token token="${env.TN360_SNAPSHOT_KEY}"`;
  const results = await Promise.all(
    attachments.map(async function(att) {
      const attachmentId = att.attachmentId;
      const position     = att.position || '';
     const timeAt       = new Date(att.timeAt || '');
      // TN360 stores images by AEST local month — extract from the ISO string directly
      // to avoid UTC conversion issues (e.g. 2026-07-01T00:02+10:00 → UTC June 30)
      const timeAtStr    = String(att.timeAt || '');
      const year         = parseInt(timeAtStr.slice(0, 4), 10)  || timeAt.getFullYear();
      const month        = parseInt(timeAtStr.slice(5, 7), 10)  || (timeAt.getMonth() + 1);
      if (!attachmentId || !year || !month) return { position, url: '' };
     try {
        const imgRes = await fetch(
          `https://api-au.telematics.com/v1/attachments/${attachmentId}/content?pruning=WEB&thumbnail=false&year=${year}&month=${month}&presigned=true`,
          {
            headers: {
              'Authorization': authHeader,
              'Origin':  'https://tn360-au.telematics.com',
              'Referer': 'https://tn360-au.telematics.com/',
              'User-Agent': 'Mozilla/5.0',
            },
            redirect: 'follow',
          }
        );
        if (!imgRes.ok) return { position, url: '' };
        const contentType = imgRes.headers.get('content-type') || '';
        if (contentType.includes('image/')) return { position, url: imgRes.url };
        try {
          const json = await imgRes.json();
          const url  = json.attachmentLink || json.url || json.mediaFile || json.contentUrl || imgRes.url || '';
          return { position, url };
        } catch(e) { return { position, url: imgRes.url }; }
      } catch(e) { return { position, url: '' }; }
    })
  );
  return jsonResponse({ attachments: results });
}

// ── Utilisation static fleet ──────────────────────────────────────────────────
// (handlers imported from utilisation-static-fleet.js)

// ── Main fetch handler ────────────────────────────────────────────────────────
// ── File Spec ingest: receive a raw file, park it in R2, record it in D1 ──────
async function handleFileSpecIngest(request, env) {
  const key = request.headers.get("X-Import-Key") || "";
  if (!env.UTILISATION_IMPORT_KEY) {
    return new Response(JSON.stringify({ error: "Import key not configured on server." }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
  if (key !== env.UTILISATION_IMPORT_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorised." }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const source   = request.headers.get("X-Source") || "";
  const filename = request.headers.get("X-Filename") || "";
  if (!source) {
    return new Response(JSON.stringify({ error: "X-Source header is required." }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const bytes = await request.arrayBuffer();
  if (!bytes || bytes.byteLength === 0) {
    return new Response(JSON.stringify({ error: "Empty file body." }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeSource = source.replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "_");
  const safeName = (filename || "upload.xlsx").replace(/[^A-Za-z0-9._-]/g, "_");
  const r2Key = `${safeSource}/${stamp}__${safeName}`;

  await env.FILESPEC_BUCKET.put(r2Key, bytes, {
    httpMetadata: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  });

  const rec = await env.DB.prepare(
    `INSERT INTO filespec_imports (source, filename, r2_key, size_bytes, status, received_at)
     VALUES (?, ?, ?, ?, 'received', ?)`
  ).bind(source, filename || null, r2Key, bytes.byteLength, new Date().toISOString()).run();

  return new Response(JSON.stringify({
    ok: true,
    importId: rec.meta.last_row_id,
    source,
    filename: filename || null,
    r2Key,
    sizeBytes: bytes.byteLength,
    status: "received",
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

export default {
  
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailySync(env));
  },
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    if (path.startsWith("/api/")) {
      // Auth
      if (method === "POST" && path === "/api/auth/login")   return handleLogin(request, env);
      if (method === "POST" && path === "/api/auth/logout")  return handleLogout(request, env);
      if (method === "GET"  && path === "/api/auth/session") return handleSession(request, env);

      // Admin — users
      if (method === "GET"    && path === "/api/admin/users") return handleGetUsers(request, env);
      if (method === "POST"   && path === "/api/admin/users") return handleCreateUser(request, env);
      if (method === "PUT"    && path.match(/^\/api\/admin\/users\/\d+$/)) return handleUpdateUser(request, env, parseInt(path.split("/").pop(), 10));
      if (method === "DELETE" && path.match(/^\/api\/admin\/users\/\d+$/)) return handleDeleteUser(request, env, parseInt(path.split("/").pop(), 10));

      // Admin — roles & permissions
      if (method === "GET"  && path === "/api/admin/roles") return handleGetRoles(request, env);
      if (method === "POST" && path === "/api/admin/roles") return handleCreateRole(request, env);
      if (method === "GET" && path.match(/^\/api\/admin\/permissions\/\d+$/)) return handleGetPermissions(request, env, parseInt(path.split("/").pop(), 10));
      if (method === "PUT" && path.match(/^\/api\/admin\/permissions\/\d+$/)) return handleUpdatePermissions(request, env, parseInt(path.split("/").pop(), 10));

      // Admin — activity & control tables
      if (method === "GET"  && path === "/api/admin/activity")        return handleGetActivity(request, env);
     if (method === "GET" && path.match(/^\/api\/vendors\/\d+\/control-tables$/)) {
        return handleGetControlTables(request, env, parseInt(path.split("/")[3], 10));
      }
      if (method === "GET"  && path === "/api/admin/control-tables")  return handleGetControlTables(request, env);
      if (method === "POST" && path === "/api/admin/control-tables")  return handleSaveControlTable(request, env);
      if (method === "GET"  && path === "/api/admin/vendors")         return handleGetVendors(request, env);
      if (method === "POST" && path === "/api/admin/vendors")         return handleSaveVendor(request, env);
      if (method === "PUT"  && path.match(/^\/api\/admin\/control-tables\/\d+$/)) {
        const id   = parseInt(path.split("/").pop(), 10);
        const body = await safeJson(request);
        body.id    = id;
        return handleSaveControlTable(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) }), env);
      }

           // Registry
      if (method === "GET" && path.match(/^\/api\/vendors\/\d+\/apis$/)) {
        const vendorId = parseInt(path.split("/")[3], 10);
        return handleRegistryGetApis(request, env, vendorId);
      }
      if (method === "GET" && path.match(/^\/api\/vendors\/\d+\/auth-profiles$/)) {
        return handleGetAuthProfiles(request, env, parseInt(path.split("/")[3], 10));
      }
      if (method === "POST" && path.match(/^\/api\/registry\/apis\/[^\/]+\/test$/)) {
       return handleRegistryTestApi(request, env, decodeURIComponent(path.split("/")[4]));
      }
if (method === "POST" && path.match(/^\/api\/registry\/apis\/[^\/]+\/execute$/)) {
        return handleRegistryExecuteApi(request, env, decodeURIComponent(path.split("/")[4]));
      }
if (method === "GET" && path.match(/^\/api\/engine\/flows\/[^\/]+$/)) {
        return handleEngineFlowBundle(request, env, decodeURIComponent(path.split("/")[4]));
      }
      if (method === "GET"    && path === "/api/registry/apis")             return handleRegistryGetApis(request, env);
      if (method === "POST"   && path === "/api/registry/apis")             return handleRegistryCreateApi(request, env);
      if (method === "PUT"    && path.match(/^\/api\/registry\/apis\//))   return handleRegistryUpdateApi(request, env, decodeURIComponent(path.split("/").pop()));
      if (method === "DELETE" && path.match(/^\/api\/registry\/apis\//))   return handleRegistryDeleteApi(request, env, decodeURIComponent(path.split("/").pop()));

      // Vendor hardware types
if (method === "GET" && path.match(/^\/api\/vendors\/\d+\/hardware-types$/)) {
  const vendorId = parseInt(path.split("/")[3], 10);
  return handleVendorHardwareTypes(request, env, vendorId);
}

if (method === "POST" && path.match(/^\/api\/vendors\/\d+\/hardware-types$/)) {
  const vendorId = parseInt(path.split("/")[3], 10);
  return handleVendorHardwareTypeSave(request, env, vendorId);
}

      // Vendor flows
      if (method === "GET" && path.match(/^\/api\/vendors\/\d+\/flows$/)) {
        return handleGetVendorFlows(request, env, parseInt(path.split("/")[3], 10));
      }
      if (method === "POST" && path.match(/^\/api\/vendors\/\d+\/flows$/)) {
        return handleSaveVendorFlow(request, env, parseInt(path.split("/")[3], 10));
      }

      // Historical snapshots
      if (method === "POST" && path === "/api/historical-snapshots")             return handleHistoricalSnapshots(request, env);
      if (method === "POST" && path === "/api/historical-snapshots/attachments") return handleHistoricalSnapshotsAttachments(request, env);

      // Camera history — admin
      if (method === "GET"    && path === "/api/admin/camera-history/status")   return handleCameraHistoryStatus(request, env);
      if (method === "POST"   && path === "/api/admin/camera-history/backfill") return handleCameraHistoryBackfill(request, env);
      if (method === "POST"   && path === "/api/admin/camera-history/sync")     return handleCameraHistorySync(request, env);
      if (method === "DELETE" && path === "/api/admin/camera-history")          return handleCameraHistoryClear(request, env);

      // Camera history — per vehicle
      if (method === "GET" && path.match(/^\/api\/camera-history\/vehicle\/.+$/)) return handleGetVehicleCameraHistory(request, env, path.split("/").pop());

      // Image proxy & helpers
      if (path === "/api/image-proxy")                                      return handleImageProxy(request, env);
      if (path === "/api/image-size")                                       return handleImageSize(request, env);
      if (path === "/api/public-image")                                     return handlePublicImageProxy(request, env);
      if (method === "POST" && path === "/api/sign-image-url")              return handleSignImageUrl(request, env);

      // Mailer
      if (path === "/api/mailer/signatures" && method === "GET")            return handleListSignatures(request, env);
      if (path === "/api/mailer/signatures" && method === "POST")           return handleCreateSignature(request, env);
      if (path.startsWith("/api/mailer/signatures/") && method === "PUT")  return handleUpdateSignature(request, env, parseInt(path.split("/").pop(), 10));

      // PDFs
      if (method === "POST" && path === "/api/camera-fault-pdf")            return handleCameraFaultPdf(request, env);
      if (method === "POST" && path === "/api/snapshot-pdf")                return handleSnapshotPdf(request, env);
      if (method === "POST" && path === "/api/asset-track-pdf")             return handleAssetTrackPdf(request, env);
      if (method === "POST" && path === "/api/sd-health-pdf")               return handleSdHealthPdf(request, env);
      if (method === "POST" && path === "/api/merge-mail-pdf")              return handleMergeMailPdf(request, env);
      if (method === "POST" && path === "/api/send-email")                  return handleSendEmail(request, env);

      // Utilisation
     if (method === "POST" && path === "/api/filespec/ingest") {
  const ingestResponse = await handleFileSpecIngest(request, env);

  if (ingestResponse.ok) {
    try {
      const ingestResult = await ingestResponse.clone().json();

      if (
        ingestResult.source === "Static Fleet" &&
        Number.isInteger(Number(ingestResult.importId))
      ) {
        ctx.waitUntil(
          runStaticFleetPipeline(
            env,
            Number(ingestResult.importId)
          ).catch(async (error) => {
            await env.DB.prepare(
              `UPDATE filespec_imports
               SET error = ?
               WHERE id = ?`
            )
              .bind(
                error instanceof Error
                  ? error.message
                  : String(error),
                Number(ingestResult.importId)
              )
              .run();
          })
        );
      }
    } catch (error) {
      console.error(
        "Unable to start Static Fleet pipeline:",
        error
      );
    }
  }

  return ingestResponse;
}
      if (method === "POST" && path === "/api/filespec/process-static-fleet") {
  return handleProcessStaticFleet(request, env);
}

      if (method === "POST" && path === "/api/filespec/promote-static-fleet") {
  return handlePromoteStaticFleet(request, env);
}
      if (method === "POST" && path === "/api/utilisation/static-fleet/import") return handleImportStaticFleet(request, env);
      if (method === "GET"  && path === "/api/utilisation/static-fleet") {
        const auth = await requireSession(request, env);
        if (!auth.ok) return auth.response;
        return handleGetStaticFleet(request, env, { session: auth.session, ...utilisationAuthHelpers });
      }
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

      // Telematics proxy
      if (method === "GET" && path.match(/^\/api\/attachment-content\/\d+$/)) return handleAttachmentContent(request, env);
      if (path.startsWith("/api/tn360/")) return handleTelematicsProxy(request, env, path.replace("/api/tn360", ""));

      // Health check
      if (path === "/api/ping") return jsonResponse({ ok: true });

      return jsonResponse({ error: "Not found." }, 404);
    }

    // Static assets
    try {
      if (env.ASSETS) {
        const assetRes = await env.ASSETS.fetch(request);
        if (assetRes.status !== 404) return assetRes;
        return new Response('Not found', { status: 404 });
      }
      return new Response('Not found', { status: 404 });
    } catch (e) {
      return new Response('Asset error: ' + e.message, { status: 500 });
    }
  },
};
