// Suno requires a callBackUrl. The app polls for results instead,
// so this endpoint only acknowledges the webhook.
export default async () => new Response(JSON.stringify({ ok: true }), {
  headers: { "content-type": "application/json" },
});
