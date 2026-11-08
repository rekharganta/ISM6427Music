// POST /api/generate — start a music generation task.
import { json, suno, checkAccess, callbackUrl } from "../lib/suno.mjs";

const MODELS = ["V6", "V6_WILD", "V6_MINI"];

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num01 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? Math.round(n * 100) / 100 : undefined;
};

export default async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);
  const denied = checkAccess(req);
  if (denied) return denied;

  let input;
  try {
    input = await req.json();
  } catch {
    return json({ ok: false, error: "Body must be JSON" }, 400);
  }

  const customMode = Boolean(input.customMode);
  const instrumental = Boolean(input.instrumental);
  const model = MODELS.includes(input.model) ? input.model : "V6";
  const body = { customMode, instrumental, model, callBackUrl: callbackUrl(req) };

  if (!customMode) {
    // Simple mode: describe the song, Suno writes the lyrics.
    const prompt = str(input.prompt, 3000);
    const style = str(input.style, 1000);
    if (!prompt && !style) return json({ ok: false, error: "Describe the song you want." }, 400);
    if (prompt) body.prompt = prompt;
    if (style) body.style = style;
  } else {
    // Custom mode: you control title, style, lyrics and fine-tuning.
    const title = str(input.title, 80);
    const style = str(input.style, 1000);
    const lyrics = instrumental ? "" : str(input.lyrics, 5000);
    const negativeTags = str(input.negativeTags, 1000);
    if (!style && !lyrics && !negativeTags) {
      return json({ ok: false, error: "Add a style, lyrics, or styles to avoid." }, 400);
    }
    if (title) body.title = title;
    if (style) body.style = style;
    if (lyrics) body.lyrics = lyrics;
    if (negativeTags) body.negativeTags = negativeTags;
    if (!instrumental && (input.vocalGender === "m" || input.vocalGender === "f")) {
      body.vocalGender = input.vocalGender;
    }
    const sw = num01(input.styleWeight);
    if (sw !== undefined) body.styleWeight = sw;
    const wc = num01(input.weirdnessConstraint);
    if (wc !== undefined) body.weirdnessConstraint = wc;
    const variety = Number(input.variety);
    if (Number.isInteger(variety) && variety >= 0 && variety <= 4) body.variety = variety;
    const duration = Number(input.duration);
    if (Number.isFinite(duration) && duration >= 10 && duration <= 360) body.duration = Math.round(duration);
  }

  const result = await suno("/api/v1/generate", { method: "POST", body });
  if (!result.ok) return json(result, result.status);
  return json({ ok: true, taskId: result.data.taskId });
};

export const config = { path: "/api/generate" };
