const { createSessionCookie } = require("./_lib/auth");
const { readJsonBody, sendJson } = require("./_lib/util");

module.exports = async (req, res) => {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return sendJson(res, 500, { error: "Server not configured: ADMIN_PASSWORD is not set" });
  }

  const body = await readJsonBody(req);
  const { password } = body || {};

  if (!password || password !== adminPassword) {
    return sendJson(res, 401, { error: "Incorrect password. Please try again." });
  }

  res.setHeader("Set-Cookie", createSessionCookie());
  return sendJson(res, 200, { ok: true });
};
