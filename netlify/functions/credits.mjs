// GET /api/credits — remaining Suno credits.
import { json, suno, checkAccess } from "../lib/suno.mjs";

export default async (req) => {
  const denied = checkAccess(req);
  if (denied) return denied;
  const result = await suno("/api/v1/generate/credit");
  if (!result.ok) return json(result, result.status);
  return json({ ok: true, credits: result.data });
};

export const config = { path: "/api/credits" };
