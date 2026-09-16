// Thin wrapper around the GitHub Contents API (no dependency needed — uses global fetch on Node 18+/Vercel).
// Reads and writes files directly on GITHUB_BRANCH; every write is a real commit, which is what
// triggers Vercel's auto-deploy for a GitHub-connected project.

function cfg() {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) {
    throw new Error("GITHUB_OWNER, GITHUB_REPO and GITHUB_TOKEN env vars must be set");
  }
  return { owner, repo, branch, token };
}

async function ghFetch(url, options = {}) {
  const { token } = cfg();
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${options.method || "GET"} ${url} -> ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.json();
}

// Returns { content: string (utf8), sha } for a text file, or null if it doesn't exist.
async function getFile(path) {
  const { owner, repo, branch } = cfg();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  try {
    const data = await ghFetch(url);
    const content = Buffer.from(data.content, data.encoding || "base64").toString("utf8");
    return { content, sha: data.sha };
  } catch (e) {
    if (String(e.message).includes(" 404:")) return null;
    throw e;
  }
}

// Commits a text file update/create. contentStr is the FULL new file content (utf8 text).
async function putFile(path, contentStr, message, sha /* optional, required for updates */) {
  const { owner, repo, branch } = cfg();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body = {
    message,
    content: Buffer.from(contentStr, "utf8").toString("base64"),
    branch,
  };
  if (sha) body.sha = sha;
  return ghFetch(url, { method: "PUT", body: JSON.stringify(body) });
}

// Uploads a binary asset (e.g. an uploaded image) given raw base64 data (no data: prefix).
async function putBinaryFile(path, base64Data, message) {
  const { owner, repo, branch } = cfg();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body = { message, content: base64Data, branch };
  return ghFetch(url, { method: "PUT", body: JSON.stringify(body) });
}

module.exports = { getFile, putFile, putBinaryFile };
