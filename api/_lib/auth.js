// Minimal signed-cookie session auth (no external dependencies).
// Token format: base64url(payloadJSON) + "." + base64url(HMAC-SHA256(payloadJSON, SESSION_SECRET))
const crypto = require("crypto");

const COOKIE_NAME = "dttc_admin_session";
const SESSION_HOURS = 24 * 7; // 7 days

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

function getSecret() {
  const s = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("SESSION_SECRET (or ADMIN_PASSWORD) env var is not set");
  return s;
}

function sign(payloadObj) {
  const payload = JSON.stringify(payloadObj);
  const payloadB64 = b64url(payload);
  const sig = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${b64url(sig)}`;
}

function verify(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payloadB64, sigB64] = token.split(".");
  const expectedSig = b64url(crypto.createHmac("sha256", getSecret()).update(payloadB64).digest());
  const a = Buffer.from(sigB64 || "");
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(payloadB64).toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function createSessionCookie() {
  const token = sign({ ok: true, exp: Date.now() + SESSION_HOURS * 3600 * 1000 });
  const maxAge = SESSION_HOURS * 3600;
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  const payload = verify(token);
  return !!(payload && payload.ok);
}

module.exports = { createSessionCookie, clearSessionCookie, isAuthenticated, COOKIE_NAME };
