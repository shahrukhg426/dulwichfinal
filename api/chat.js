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
  if (!isAuthenticated(req)) return sendJson(res, 401, { error: "Session expired, please log in again." });

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
    return sendJson(res, 400, { error: "Message is empty." });
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
      reply: `Error contacting the AI: ${e.message}. Please try again shortly.`,
      changes: [],
    });
  }

  const actions = Array.isArray(plan.actions) ? plan.actions : [];
  if (actions.length === 0) {
    return sendJson(res, 200, { reply: plan.reply || "I didn't quite catch that — could you rephrase?", changes: [] });
  }

  // Upload the attached image (if any) to GitHub once, reuse its path for every action that needs it.
  let uploadedImagePath = null;
  const needsImage = actions.some((a) => a.type === "edit_image" || (a.type === "add_item" && !("src" in (a.fields || {}))));
  if (needsImage) {
    if (!image) {
      return sendJson(res, 200, {
        reply: (plan.reply || "") + "\n\nPlease attach the image and I'll update that section.",
        changes: [],
      });
    }
    const ext = extFromMime(image.mimeType);
    const safeName = (image.filename || "upload").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40);
    uploadedImagePath = `uploads/${Date.now()}-${safeName || "image"}.${ext}`;
    try {
      await github.putBinaryFile(uploadedImagePath, image.data, `Admin chat: upload ${uploadedImagePath}`);
    } catch (e) {
      return sendJson(res, 200, { reply: `Error uploading the image: ${e.message}`, changes: [] });
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
      problems.push(`Could not find marker "${lookupId}".`);
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
      problems.push(`Could not fetch ${file}: ${e.message}`);
      continue;
    }
    if (!fileData) {
      problems.push(`${file} was not found on GitHub.`);
      continue;
    }
    let content = fileData.content;
    let changedInFile = 0;

    for (const { action, marker } of items) {
      try {
        if (action.type === "edit_text") {
          if (marker.kind !== "text" && marker.kind !== "link") {
            problems.push(`${marker.id} is not a text/link field.`);
            continue;
          }
          content = editor.applyEditText(content, marker, action.new_text || "");
          changedInFile++;
          changes.push(marker.label);
        } else if (action.type === "edit_image") {
          if (marker.kind !== "image") {
            problems.push(`${marker.id} is not an image field.`);
            continue;
          }
          content = editor.applyEditImage(content, marker, uploadedImagePath, action.alt);
          changedInFile++;
          changes.push(marker.label);
        } else if (action.type === "add_item") {
          if (marker.kind !== "container") {
            problems.push(`${marker.id} is not a list container.`);
            continue;
          }
          const fields = { ...(action.fields || {}) };
          if (uploadedImagePath && !fields.src) fields.src = uploadedImagePath;
          content = editor.applyAddItem(content, marker, fields);
          changedInFile++;
          changes.push(marker.label + " (new item)");
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
        problems.push(`Could not save ${file}: ${e.message}`);
      }
    }
  }

  let reply = plan.reply || "";
  if (changes.length) {
    reply += `\n\n✅ Updated (${changes.length}): ${changes.join(", ")}.\nThe live site will reflect this in 1-2 minutes: ${PUBLIC_SITE_BASE}`;
  }
  if (problems.length) {
    reply += `\n\n⚠️ Issues: ${problems.join(" | ")}`;
  }

  return sendJson(res, 200, { reply: reply.trim(), changes, problems });
};
