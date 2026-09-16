const { isAuthenticated } = require("./_lib/auth");
const { readJsonBody, sendJson } = require("./_lib/util");
const { getEditPlan } = require("./_lib/ai");
const github = require("./_lib/github");
const editor = require("./_lib/editor");
const manifest = require("./_lib/manifest.json");

const PUBLIC_SITE_BASE = process.env.PUBLIC_SITE_URL || "https://www.dulwichttc.com";

function manifestById(id) {
  return manifest.find((m) => m.id === id) || null;
}

// Guess a file extension from a data URL mime type.
function extFromMime(mime) {
  if (!mime) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
  if (!isAuthenticated(req)) return sendJson(res, 401, { error: "Session expired, dobara login karein." });

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return sendJson(res, 400, { error: "Bad request body" });
  }

  const message = (body.message || "").toString().trim();
  const history = Array.isArray(body.history) ? body.history : [];
  const image = body.image && body.image.data ? body.image : null; // { data: base64 (no prefix), mimeType, filename }

  if (!message && !image) {
    return sendJson(res, 400, { error: "Message khali hai." });
  }

  let plan;
  try {
    plan = await getEditPlan({
      message: message || "(image attached, no text)",
      manifestSubset: manifest,
      history,
      hasImage: !!image,
    });
  } catch (e) {
    return sendJson(res, 200, {
      reply: `AI se baat karte waqt error aaya: ${e.message}. Thodi der baad dobara try karein.`,
      changes: [],
    });
  }

  const actions = Array.isArray(plan.actions) ? plan.actions : [];
  if (actions.length === 0) {
    return sendJson(res, 200, { reply: plan.reply || "Samajh nahi aaya, thoda aur clear karein.", changes: [] });
  }

  // Upload the attached image (if any) to GitHub once, reuse its path for every action that needs it.
  let uploadedImagePath = null;
  const needsImage = actions.some((a) => a.type === "edit_image" || (a.type === "add_item" && !("src" in (a.fields || {}))));
  if (needsImage) {
    if (!image) {
      return sendJson(res, 200, {
        reply: (plan.reply || "") + "\n\nImage attach karein, phir main woh section update kar dunga.",
        changes: [],
      });
    }
    const ext = extFromMime(image.mimeType);
    const safeName = (image.filename || "upload").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40);
    uploadedImagePath = `uploads/${Date.now()}-${safeName || "image"}.${ext}`;
    try {
      await github.putBinaryFile(uploadedImagePath, image.data, `Admin chat: upload ${uploadedImagePath}`);
    } catch (e) {
      return sendJson(res, 200, { reply: `Image upload karte waqt error aaya: ${e.message}`, changes: [] });
    }
  }

  // Group actions by the file they touch, applying them in-memory, then commit once per file.
  const byFile = new Map(); // filename -> { page, actions: [{action, marker}] }
  const changes = [];
  const problems = [];

  for (const action of actions) {
    const lookupId = action.type === "add_item" ? action.container_id : action.id;
    const marker = manifestById(lookupId);
    if (!marker) {
      problems.push(`Marker "${lookupId}" nahi mila — shayad naam thoda alag hai.`);
      continue;
    }
    let file;
    try {
      file = editor.fileForPage(marker.page);
    } catch (e) {
      problems.push(e.message);
      continue;
    }
    if (!byFile.has(file)) byFile.set(file, { page: marker.page, items: [] });
    byFile.get(file).items.push({ action, marker });
  }

  for (const [file, { items }] of byFile.entries()) {
    let fileData;
    try {
      fileData = await github.getFile(file);
    } catch (e) {
      problems.push(`${file} fetch nahi ho saka: ${e.message}`);
      continue;
    }
    if (!fileData) {
      problems.push(`${file} GitHub par nahi mili.`);
      continue;
    }
    let content = fileData.content;
    let changedInFile = 0;

    for (const { action, marker } of items) {
      try {
        if (action.type === "edit_text") {
          if (marker.kind !== "text" && marker.kind !== "link") {
            problems.push(`${marker.id} ek text/link field nahi hai.`);
            continue;
          }
          content = editor.applyEditText(content, marker, action.new_text || "");
          changedInFile++;
          changes.push(marker.label);
        } else if (action.type === "edit_image") {
          if (marker.kind !== "image") {
            problems.push(`${marker.id} ek image field nahi hai.`);
            continue;
          }
          content = editor.applyEditImage(content, marker, uploadedImagePath, action.alt);
          changedInFile++;
          changes.push(marker.label);
        } else if (action.type === "add_item") {
          if (marker.kind !== "container") {
            problems.push(`${marker.id} ek list container nahi hai.`);
            continue;
          }
          const fields = { ...(action.fields || {}) };
          if (uploadedImagePath && !fields.src) fields.src = uploadedImagePath;
          content = editor.applyAddItem(content, marker, fields);
          changedInFile++;
          changes.push(marker.label + " (naya item)");
        } else {
          problems.push(`Unknown action type: ${action.type}`);
        }
      } catch (e) {
        problems.push(`${marker.id}: ${e.message}`);
      }
    }

    if (changedInFile > 0) {
      try {
        await github.putFile(file, content, `Admin chat update: ${file}`, fileData.sha);
      } catch (e) {
        problems.push(`${file} save nahi ho saka: ${e.message}`);
      }
    }
  }

  let reply = plan.reply || "";
  if (changes.length) {
    reply += `\n\n✅ Update ho gaya (${changes.length}): ${changes.join(", ")}.\nSite 1-2 minute me live ho jayegi: ${PUBLIC_SITE_BASE}`;
  }
  if (problems.length) {
    reply += `\n\n⚠️ Kuch issues: ${problems.join(" | ")}`;
  }

  return sendJson(res, 200, { reply: reply.trim(), changes, problems });
};
