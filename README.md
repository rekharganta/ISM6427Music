# ISM6427Music — Waveform AI Music Studio

A web app where anyone can generate original songs with AI, powered by the [Suno API](https://docs.sunoapi.org/).

- **Simple mode** — describe a vibe ("dreamy synthwave about a neon city"), Suno writes the lyrics and the music.
- **Custom mode** — set the title, style, your own lyrics, styles to avoid, vocal gender, length, style strength, weirdness and variety.
- **✨ Write lyrics** — generate lyrics from a short theme, then edit them before making the song.
- Two versions per request, a built-in player, MP3 download, lyrics viewer, and a library saved in the browser.
- Shows your remaining Suno credits.

## Tech stack

- `public/` — plain HTML, CSS and JavaScript (no build step).
- `netlify/functions/` — Netlify Functions that call the Suno API. The API key stays on the server and is never sent to the browser.
- `netlify.toml` — tells Netlify to publish `public/` and deploy the functions.

| Route | What it does | Suno endpoint |
|---|---|---|
| `POST /api/generate` | Start a song | `POST /api/v1/generate` |
| `GET /api/status?taskId=` | Check progress / get tracks | `GET /api/v1/generate/record-info` |
| `POST /api/lyrics`, `GET /api/lyrics?taskId=` | Generate lyrics | `POST /api/v1/lyrics`, `GET /api/v1/lyrics/record-info` |
| `GET /api/credits` | Remaining credits | `GET /api/v1/generate/credit` |

## Deploy on Netlify

1. In Netlify: **Add new site → Import an existing project → GitHub →** pick this repo, branch `main`.
2. Build settings are read from `netlify.toml` (no build command, publish directory `public`).
3. Go to **Site configuration → Environment variables** and add:
   - `SUNO_API_KEY` — your key from https://sunoapi.org/api-key **(required)**
   - `APP_PASSWORD` — optional. If set, visitors must enter this password before generating, so strangers can't spend your credits.
4. Trigger a redeploy after adding the variables.

## Run locally

```bash
npm install -g netlify-cli
SUNO_API_KEY=your_key netlify dev
```

## Notes

- Suno keeps generated files for 14 days — download songs you want to keep.
- The library is stored in each visitor's browser (localStorage).
