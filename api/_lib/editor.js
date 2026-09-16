// Applies a single AI-proposed action to a page's raw HTML string, using the
// <!--EDIT:id-->...<!--/EDIT--> / <!--CONTAINER:id--> markers injected ahead of time.
// The marker's *actual* kind is always read from our own manifest (never trusted
// from the AI response) before deciding how to apply the edit — e.g. a "link"
// marker gets its href value swapped, a plain "text" marker gets its inner
// content replaced, an "image" marker gets only its src attribute swapped.

const PAGE_TO_FILE = {
  home: "index.html",
  services: "services.html",
  membership: "membership.html",
  champions: "champions.html",
  policy: "policy.html",
  contact: "contact.html",
  "club-account": "club-account.html",
  terms: "terms.html",
  "privacy-policy": "privacy-policy.html",
  safeguarding: "safeguarding.html",
};

function fileForPage(page) {
  const f = PAGE_TO_FILE[page];
  if (!f) throw new Error(`Unknown page "${page}"`);
  return f;
}

function escapeForHtmlText(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function findMarkerBlock(content, id) {
  const openTag = `<!--EDIT:${id}-->`;
  const closeTag = `<!--/EDIT-->`;
  const start = content.indexOf(openTag);
  if (start === -1) return null;
  const innerStart = start + openTag.length;
  const end = content.indexOf(closeTag, innerStart);
  if (end === -1) return null;
  return { openTag, closeTag, start, innerStart, end, endWithClose: end + closeTag.length };
}

// --- individual action appliers, each returns the new full file content ---

function applyEditText(content, marker, newText) {
  const block = findMarkerBlock(content, marker.id);
  if (!block) throw new Error(`Marker ${marker.id} not found in file (content may already differ from manifest)`);

  if (marker.kind === "link") {
    const oldTag = content.slice(block.innerStart, block.end);
    const scheme = marker.type === "phone-link" ? "tel:" : "mailto:";
    const cleaned = String(newText).trim();
    const newTag = oldTag.replace(new RegExp(scheme + "[^\"]*", "i"), scheme + cleaned);
    return content.slice(0, block.innerStart) + newTag + content.slice(block.end);
  }

  // plain text marker: allow a small safe set of inline tags the admin/AI may have used
  // (br, span, strong, em, b, i) but escape everything else so we can never inject
  // broken markup or script tags into the live site.
  const safe = String(newText).replace(/<(?!\/?(br|span|strong|em|b|i)\b)[^>]*>/gi, (m) => escapeForHtmlText(m));
  return content.slice(0, block.innerStart) + safe + content.slice(block.end);
}

function applyEditImage(content, marker, newSrcPath, altText) {
  const block = findMarkerBlock(content, marker.id);
  if (!block) throw new Error(`Marker ${marker.id} not found in file (content may already differ from manifest)`);
  let tag = content.slice(block.innerStart, block.end);
  tag = tag.replace(/src="[^"]*"/i, `src="${newSrcPath}"`);
  if (altText) {
    if (/alt="[^"]*"/i.test(tag)) {
      tag = tag.replace(/alt="[^"]*"/i, `alt="${escapeForHtmlText(altText)}"`);
    } else {
      tag = tag.replace(/^<img/i, `<img alt="${escapeForHtmlText(altText)}"`);
    }
  }
  return content.slice(0, block.innerStart) + tag + content.slice(block.end);
}

const ITEM_TEMPLATES = {
  "faq-list": (f) => `<div class="faq-item fade-in" onclick="toggleFaq(this)">
<div class="faq-q">${escapeForHtmlText(f.question || "")} <span class="faq-arrow">▼</span></div>
<div class="faq-a">${escapeForHtmlText(f.answer || "")}</div>
</div>`,
  "testimonial-list": (f) => `<div class="testi-card fade-in">
<div class="testi-stars">★★★★★</div>
<div class="testi-text">"${escapeForHtmlText(f.text || "")}"</div>
<div class="testi-author">
<div class="testi-avatar">${escapeForHtmlText((f.initials || "??").slice(0, 2).toUpperCase())}</div>
<div>
<div class="testi-name">${escapeForHtmlText(f.name || "")}</div>
<div class="testi-role">${escapeForHtmlText(f.role || "")}</div>
</div>
</div>
</div>`,
  "gallery-list": (f) => `<div class="gallery-item fade-in">
<img alt="${escapeForHtmlText(f.alt || "")}" onerror="this.style.display='none';" src="${f.src || ""}"/>
</div>`,
};

function applyAddItem(content, marker, fields) {
  const containerTag = `<!--CONTAINER:${marker.id}-->`;
  const idx = content.indexOf(containerTag);
  if (idx === -1) throw new Error(`Container marker ${marker.id} not found in file`);
  const templateFn = ITEM_TEMPLATES[marker.type];
  if (!templateFn) throw new Error(`No item template for container type "${marker.type}"`);
  const block = templateFn(fields || {});
  return content.slice(0, idx) + block + "\n" + content.slice(idx);
}

module.exports = { fileForPage, applyEditText, applyEditImage, applyAddItem, PAGE_TO_FILE };
