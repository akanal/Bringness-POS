// An unset mode preserves existing combined installations.
export function runtimeMode(value = process.env.APP_MODE) {
  const mode = (value ?? "combined").trim().toLowerCase();
  if (!["pos", "combined"].includes(mode)) {
    throw new Error("APP_MODE must be pos or combined; a dedicated AI runtime is not available yet.");
  }
  return mode;
}

export async function loadAiFeatures(mode, importer = () => import("./ai-platform.js")) {
  return mode === "pos" ? null : importer();
}

export function blockAiRequest(req, res, mode) {
  if (mode !== "pos") return false;
  const rawPath = new URL(req.url, "http://localhost").pathname;
  let pathname;
  try { pathname = decodeURIComponent(rawPath); }
  catch { pathname = rawPath; }
  const blocked = pathname === "/api/ai" || pathname.startsWith("/api/ai/") ||
    /^\/ai(?:[./-]|$)/i.test(pathname) ||
    /^\/assets\/bringness-ai(?:[./-]|$)/i.test(pathname);
  if (!blocked) return false;
  res.writeHead(404, {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"});
  res.end(JSON.stringify({error: "Nicht gefunden"}));
  return true;
}


// Migrate only the public production Bringness installation, preserving custom installs.
export function configurePosOrigin(env, mode) {
  if (mode !== 'pos' || env.NODE_ENV !== 'production') return;
  for (const key of ['PUBLIC_BASE_URL', 'PUBLIC_URL']) {
    const value = String(env[key] || '').replace(/\/$/, '');
    if (!value || /^https:\/\/(?:www\.)?bringness-pos\.de$/i.test(value) ||
        value === 'https://bringness-pos-app-production.up.railway.app') {
      env[key] = 'https://bringness.de';
    }
  }
}
