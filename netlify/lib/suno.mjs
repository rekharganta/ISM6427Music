// Shared helpers for talking to the Suno API from Netlify Functions.
// The API key lives only in the SUNO_API_KEY environment variable on Netlify,
// so it is never sent to the browser.

export const SUNO_BASE = process.env.SUNO_API_BASE || "https://api.sunoapi.org";

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

// Optional shared password. If APP_PASSWORD is set on Netlify, every request
// must send it in the x-app-password header. Stops strangers spending credits.
export function checkAccess(req) {
  const required = process.env.APP_PASSWORD;
  if (!required) return null;
  if (req.headers.get("x-app-password") === required) return null;
  return json({ ok: false, error: "Wrong or missing app password.", needPassword: true }, 401);
}

export async function suno(path, { method = "GET", body } = {}) {
  const key = process.env.SUNO_API_KEY;
  if (!key) {
    return { ok: false, status: 500, error: "SUNO_API_KEY is not set on the server." };
  }
  let res;
  try {
    res = await fetch(SUNO_BASE + path, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    return { ok: false, status: 502, error: "Could not reach the Suno API: " + err.message };
  }
  let payload;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, status: 502, error: `Suno API returned a non-JSON response (HTTP ${res.status}).` };
  }
  // Suno returns HTTP 200 with its own "code" field for errors.
  if (!res.ok || payload.code !== 200) {
    return {
      ok: false,
      status: res.ok ? 400 : res.status,
      code: payload.code,
      error: friendlyError(payload.code, payload.msg),
    };
  }
  return { ok: true, data: payload.data };
}

function friendlyError(code, msg) {
  const known = {
    400: "Invalid parameters",
    401: "Unauthorized — check the SUNO_API_KEY",
    405: "Rate limit exceeded",
    413: "Prompt or style is too long",
    429: "Not enough Suno credits",
    430: "Too many requests — please wait a moment",
    455: "Suno is under maintenance",
    500: "Suno server error",
  };
  const base = known[code] || "Suno API error";
  return msg && msg !== base ? `${base}: ${msg}` : base;
}

export function callbackUrl(req) {
  const origin = process.env.URL || new URL(req.url).origin;
  return `${origin}/.netlify/functions/callback`;
}
