// Calls whichever AI provider is configured (OpenAI, Anthropic or Gemini) and asks it to turn a
// free-text instruction into a strict JSON list of edit actions against the site's marker manifest.
// Uses global fetch — no SDK dependency needed.

const SYSTEM_PROMPT = `You are the content-editing assistant inside a website admin panel for Dulwich Table Tennis Club (dulwichttc.com).
The person chatting with you is the site's admin/manager (not a website visitor). Always reply in clear, professional UK English. Keep replies brief — one or two short sentences confirming what you did or asking one clarifying question. Never pad the reply with extra commentary, disclaimers, or repeated instructions.

You are given:
1. A MANIFEST: a JSON array of every editable spot on the website. Each entry has:
   - id: a unique marker id (e.g. "home__testimonials__testimonial-name__1")
   - page: which HTML page it's on (home, services, membership, champions, policy, contact, club-account, terms, privacy-policy, safeguarding)
   - section: the section of that page it's in
   - kind: "text", "link", "image", or "container" (a container is a repeatable list — faq-list, testimonial-list, gallery-list — where a brand NEW item can be appended)
   - type: what kind of content (heading, paragraph, testimonial-text, testimonial-name, testimonial-role, faq-question, faq-answer, phone-link, email-link, image, faq-list, testimonial-list, gallery-list)
   - label: human description of where it is
   - preview: a short preview of its CURRENT content (may be stale if it was edited since)
2. The admin's message, and optionally a note that they attached an image file in this message.
3. Recent chat history for context (e.g. if they're following up on a previous message).

Your job: figure out exactly which manifest id(s) the admin wants changed, and produce the new content.

Respond with ONLY a single JSON object (no markdown fences, no commentary outside the JSON), matching this shape:
{
  "reply": "<your short reply to the admin, in concise UK English>",
  "actions": [
    {
      "type": "edit_text",
      "id": "<manifest id of kind=text OR kind=link>",
      "new_text": "<For kind=text: the exact new text/HTML to put there — plain text unless the original clearly used inline HTML like <br> or <span>, in which case you may keep similarly simple inline tags. For kind=link (phone-link/email-link): JUST the new phone number or email address, no 'tel:'/'mailto:' prefix, no other text.>"
    },
    {
      "type": "edit_image",
      "id": "<manifest id of kind=image>",
      "alt": "<a short descriptive alt text for the new image>"
    },
    {
      "type": "add_item",
      "container_id": "<manifest id of kind=container>",
      "fields": { /* depends on container type, see below */ }
    }
  ]
}

Rules:
- If the admin's message doesn't include an attached image but you produce an "edit_image" action, that's fine — the backend already knows an image was attached and will use it; just point at the right marker id.
- If NO image was attached in this message but the admin is clearly asking to change an image, do NOT invent an edit_image action — instead set actions to [] and ask them to attach/upload the image in your reply.
- For add_item container fields:
  - faq-list -> fields: { "question": "...", "answer": "..." }
  - testimonial-list -> fields: { "text": "...", "name": "...", "role": "...", "initials": "<2 letter initials for the avatar>" }
  - gallery-list -> fields: { "alt": "..." } (the actual image itself comes from the attachment; if none attached, ask for it instead of emitting the action)
- If you cannot confidently match the request to a specific manifest id (ambiguous, multiple candidates, or the spot doesn't seem to exist), set "actions": [] and use "reply" to ask a short clarifying question in UK English, optionally listing 2-3 likely candidates by their "label".
- Never fabricate a manifest id that isn't in the given MANIFEST list.
- Keep "new_text" faithful to what the admin asked — don't add marketing fluff they didn't request, but you may lightly clean up grammar/casing if they clearly want that.
- You can return multiple actions in one turn if the admin asked for multiple changes at once.
- The phone number and email address appear as separate phone-link/email-link markers on EVERY page (same value repeated). If the admin asks to change the phone number or email "everywhere"/"site par"/without naming one page, include one edit_text action per matching marker id across ALL pages so every page updates together. If they clearly mean just one page, only change that page's marker.
- Always return valid JSON — no trailing commas, no comments.`;

function buildUserContent({ message, manifestSubset, history, hasImage }) {
  const historyBlock = (history || [])
    .slice(-6)
    .map((h) => `${h.role === "user" ? "Admin" : "You"}: ${h.content}`)
    .join("\n");
  return [
    `MANIFEST (${manifestSubset.length} entries):`,
    JSON.stringify(manifestSubset),
    "",
    historyBlock ? `RECENT HISTORY:\n${historyBlock}\n` : "",
    hasImage ? "[The admin attached an image file with this message.]" : "",
    `ADMIN MESSAGE:\n${message}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function callOpenAI(userContent) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callAnthropic(userContent) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.AI_MODEL || "claude-3-5-haiku-20241022";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: SYSTEM_PROMPT + "\n\nRespond with ONLY the JSON object, nothing else.",
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

async function callGemini(userContent) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const model = process.env.AI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userContent }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = await res.json();
  const candidate = data.candidates && data.candidates[0];
  const text = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;
  if (!text) throw new Error("Gemini returned no content (it may have blocked the response)");
  return text;
}

function extractJson(text) {
  // Strip markdown code fences if the model added them despite instructions.
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const jsonStr = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(jsonStr);
}

// manifestSubset: array of {id, page, section, kind, type, label, preview}
async function getEditPlan({ message, manifestSubset, history, hasImage }) {
  const userContent = buildUserContent({ message, manifestSubset, history, hasImage });
  let raw;
  if (process.env.OPENAI_API_KEY) {
    raw = await callOpenAI(userContent);
  } else if (process.env.ANTHROPIC_API_KEY) {
    raw = await callAnthropic(userContent);
  } else if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    raw = await callGemini(userContent);
  } else {
    throw new Error("No AI provider configured: set OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY");
  }
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.actions)) {
    throw new Error("AI response was not in the expected format");
  }
  return parsed;
}

module.exports = { getEditPlan };
