const { clearSessionCookie } = require("./_lib/auth");
const { sendJson } = require("./_lib/util");

module.exports = async (req, res) => {
  res.setHeader("Set-Cookie", clearSessionCookie());
  return sendJson(res, 200, { ok: true });
};
