// GET /api/status?taskId=... — poll a music generation task.
import { json, suno, checkAccess } from "../lib/suno.mjs";

const FAILED = ["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"];

// The API has used both snake_case and camelCase field names; accept either.
const pick = (o, ...keys) => {
  for (const k of keys) if (o && o[k] != null && o[k] !== "") return o[k];
  return "";
};

function normalizeTrack(t) {
  return {
    id: pick(t, "id"),
    title: pick(t, "title"),
    tags: pick(t, "tags"),
    lyrics: pick(t, "prompt"),
    duration: Number(pick(t, "duration")) || null,
    audioUrl: pick(t, "audioUrl", "audio_url", "sourceAudioUrl", "source_audio_url"),
    streamUrl: pick(t, "streamAudioUrl", "stream_audio_url", "sourceStreamAudioUrl", "source_stream_audio_url"),
    imageUrl: pick(t, "imageUrl", "image_url", "sourceImageUrl", "source_image_url"),
    model: pick(t, "modelName", "model_name"),
    createdAt: pick(t, "createTime", "create_time"),
  };
}

export default async (req) => {
  const denied = checkAccess(req);
  if (denied) return denied;
  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId || !/^[\w-]{1,128}$/.test(taskId)) return json({ ok: false, error: "Missing taskId" }, 400);

  const result = await suno(`/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
  if (!result.ok) return json(result, result.status);

  const d = result.data || {};
  const status = d.status || "PENDING";
  const raw = (d.response && (d.response.sunoData || d.response.data)) || [];
  return json({
    ok: true,
    taskId,
    status,
    done: status === "SUCCESS",
    failed: FAILED.includes(status),
    error: d.errorMessage || (FAILED.includes(status) ? status.replace(/_/g, " ").toLowerCase() : null),
    tracks: Array.isArray(raw) ? raw.map(normalizeTrack) : [],
  });
};

export const config = { path: "/api/status" };
