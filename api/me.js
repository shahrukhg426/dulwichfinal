const { isAuthenticated } = require("./_lib/auth");
const { sendJson } = require("./_lib/util");

module.exports = async (req, res) => {
  return sendJson(res, 200, { authenticated: isAuthenticated(req) });
};
