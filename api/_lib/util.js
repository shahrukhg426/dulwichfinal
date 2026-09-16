// Small helpers shared by the API route handlers.

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length) {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }
  // Fallback: read the raw stream ourselves (covers runtimes that don't auto-parse).
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function sendJson(res, status, obj) {
  res.status(status).setHeader("Content-Type", "application/json").end(JSON.stringify(obj));
}

module.exports = { readJsonBody, sendJson };
