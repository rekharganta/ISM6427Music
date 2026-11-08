// POST /api/lyrics            — start a lyrics-only task ({ prompt })
// GET  /api/lyrics?taskId=... — poll it
import { json, suno, checkAccess, callbackUrl } from "../lib/suno.mjs";

export default async (req) => {
  const denied = checkAccess(req);
  if (denied) return denied;

  if (req.method === "POST") {
    let input;
    try {
      input = await req.json();
    } catch {
      return json({ ok: false, error: "Body must be JSON" }, 400);
    }
    const prompt = typeof input.prompt === "string" ? input.prompt.trim().slice(0, 200) : "";
    if (!prompt) return json({ ok: false, error: "Tell me what the lyrics should be about." }, 400);
    const result = await suno("/api/v1/lyrics", {
      method: "POST",
      body: { prompt, callBackUrl: callbackUrl(req) },
    });
    if (!result.ok) return json(result, result.status);
    return json({ ok: true, taskId: result.data.taskId });
  }

  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId || !/^[\w-]{1,128}$/.test(taskId)) return json({ ok: false, error: "Missing taskId" }, 400);
  const result = await suno(`/api/v1/lyrics/record-info?taskId=${encodeURIComponent(taskId)}`);
  if (!result.ok) return json(result, result.status);

  const d = result.data || {};
  const status = d.status || "PENDING";
  const items = (d.response && d.response.data) || [];
  const failed = /FAIL|ERROR|EXCEPTION/.test(status);
  return json({
    ok: true,
    status,
    done: status === "SUCCESS",
    failed,
    error: d.errorMessage || (failed ? status : null),
    lyrics: items
      .filter((x) => x && x.text)
      .map((x) => ({ title: x.title || "", text: x.text })),
  });
};

export const config = { path: "/api/lyrics" };
