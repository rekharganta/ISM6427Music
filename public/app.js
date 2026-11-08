// Waveform — front end for the Suno music generator.
// Talks only to our own Netlify Functions under /api/*, which hold the API key.

const $ = (sel) => document.querySelector(sel);
const STORE_KEY = "waveform.jobs.v1";
const PW_KEY = "waveform.pw";
const POLL_MS = 6000;
const MAX_POLL_MS = 10 * 60 * 1000;

const IDEAS = [
  "A dreamy synthwave track about driving through a neon city at night",
  "An acoustic folk song about a grandmother's garden",
  "High-energy K-pop anthem about chasing your dreams",
  "Chill lo-fi study beat with rain sounds",
  "A soulful R&B ballad about long-distance love",
  "Epic orchestral trailer music with choir",
];
const STYLES = ["pop", "lo-fi", "rock", "hip hop", "EDM", "jazz", "acoustic", "cinematic", "R&B", "country", "synthwave", "reggaeton"];
const VARIETY = ["Off", "Normal", "High", "Extra", "Max"];

let mode = "simple";
let jobs = load();
const timers = new Map();

/* ---------- storage ---------- */
function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(jobs.slice(0, 100))); } catch {}
}
function getPw() { try { return sessionStorage.getItem(PW_KEY) || ""; } catch { return ""; } }
function setPw(v) { try { sessionStorage.setItem(PW_KEY, v); } catch {} }

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const headers = { "content-type": "application/json" };
  const pw = getPw();
  if (pw) headers["x-app-password"] = pw;
  let res;
  try {
    res = await fetch(path, { ...opts, headers });
  } catch {
    throw new Error("Network error — check your connection.");
  }
  const data = await res.json().catch(() => ({ ok: false, error: `Server error (HTTP ${res.status})` }));
  if (data.needPassword) {
    const ok = await askPassword();
    if (ok) return api(path, opts);
  }
  if (!data.ok) {
    const err = new Error(data.error || "Something went wrong");
    err.code = data.code;
    throw err;
  }
  return data;
}

let pwPromise = null;
function askPassword() {
  if (pwPromise) return pwPromise;
  const dlg = $("#pwDialog");
  pwPromise = new Promise((resolve) => {
    dlg.addEventListener("close", function onClose() {
      dlg.removeEventListener("close", onClose);
      const v = $("#pwInput").value;
      pwPromise = null;
      if (dlg.returnValue === "ok" && v) { setPw(v); resolve(true); } else resolve(false);
    });
    dlg.showModal();
  });
  return pwPromise;
}

/* ---------- UI helpers ---------- */
function toast(msg, ms = 3500) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}
const fmt = (s) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : "");

function setMode(m) {
  mode = m;
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.mode === m;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on);
  });
  document.querySelectorAll(".mode").forEach((el) => {
    el.hidden = !el.classList.contains(m);
  });
  syncInstrumental();
}

function syncInstrumental() {
  const instrumental = $("#instrumental").checked;
  $("#lyrics").disabled = instrumental;
  $("#lyricsIdea").disabled = instrumental;
  $("#writeLyrics").disabled = instrumental;
  $("#vocalGender").disabled = instrumental;
}

function showError(msg) {
  const el = $("#formError");
  el.textContent = msg || "";
  el.hidden = !msg;
}

/* ---------- credits ---------- */
async function refreshCredits() {
  const box = $("#credits");
  try {
    const { credits } = await api("/api/credits");
    $("#creditsText").textContent = `Credits: ${Number(credits).toLocaleString()}`;
    box.className = "credits ok";
  } catch (e) {
    $("#creditsText").textContent = "Credits unavailable";
    box.className = "credits bad";
    box.title = e.message;
  }
}

/* ---------- generation ---------- */
function collect() {
  const v = (id) => $(id).value.trim();
  const body = {
    customMode: mode === "custom",
    instrumental: $("#instrumental").checked,
    model: $("#model").value,
    style: v("#style"),
  };
  if (mode === "simple") {
    body.prompt = v("#prompt");
    if (!body.prompt && !body.style) return { error: "Describe the song you want, or pick a style." };
  } else {
    body.title = v("#title");
    body.lyrics = body.instrumental ? "" : v("#lyrics");
    body.negativeTags = v("#negativeTags");
    if (!body.style && !body.lyrics && !body.negativeTags) {
      return { error: body.instrumental ? "Add a style for your instrumental." : "Add lyrics or a style." };
    }
    if (!body.instrumental) body.vocalGender = $("#vocalGender").value;
    const adv = $(".advanced").open;
    if (adv) {
      body.duration = Number($("#duration").value);
      body.styleWeight = Number($("#styleWeight").value);
      body.weirdnessConstraint = Number($("#weirdnessConstraint").value);
      body.variety = Number($("#variety").value);
    }
  }
  return { body };
}

async function onGenerate(e) {
  e.preventDefault();
  showError("");
  const { body, error } = collect();
  if (error) return showError(error);

  const btn = $("#generateBtn");
  btn.disabled = true;
  btn.classList.add("loading");
  btn.querySelector(".btn-label").textContent = "Starting…";
  try {
    const { taskId } = await api("/api/generate", { method: "POST", body: JSON.stringify(body) });
    const job = {
      taskId,
      createdAt: Date.now(),
      label: body.title || body.prompt || body.style || "Untitled",
      style: body.style,
      instrumental: body.instrumental,
      model: body.model,
      status: "PENDING",
      tracks: [],
    };
    jobs.unshift(job);
    save();
    render();
    poll(job);
    toast("Your song is being created 🎶");
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.classList.remove("loading");
    btn.querySelector(".btn-label").textContent = "Generate music";
  }
}

function poll(job) {
  if (timers.has(job.taskId)) return;
  const tick = async () => {
    timers.delete(job.taskId);
    try {
      const r = await api(`/api/status?taskId=${encodeURIComponent(job.taskId)}`);
      job.status = r.status;
      if (r.tracks.length) job.tracks = r.tracks;
      if (r.failed) job.error = r.error || "Generation failed";
      save();
      render();
      if (r.done) {
        refreshCredits();
        toast(`“${job.tracks[0]?.title || job.label}” is ready`);
        return;
      }
      if (r.failed) return;
    } catch (err) {
      job.lastError = err.message;
    }
    if (Date.now() - job.createdAt > MAX_POLL_MS) {
      job.status = "TIMEOUT";
      job.error = "This is taking longer than usual. Click Refresh to check again.";
      save();
      render();
      return;
    }
    timers.set(job.taskId, setTimeout(tick, POLL_MS));
  };
  timers.set(job.taskId, setTimeout(tick, 2500));
}

/* ---------- lyrics helper ---------- */
async function onWriteLyrics() {
  const idea = $("#lyricsIdea").value.trim() || $("#title").value.trim();
  if (!idea) return toast("Describe what the lyrics should be about first.");
  const btn = $("#writeLyrics");
  btn.disabled = true;
  btn.textContent = "Writing…";
  try {
    const { taskId } = await api("/api/lyrics", { method: "POST", body: JSON.stringify({ prompt: idea }) });
    const started = Date.now();
    while (Date.now() - started < 3 * 60 * 1000) {
      await new Promise((r) => setTimeout(r, 4000));
      const r = await api(`/api/lyrics?taskId=${encodeURIComponent(taskId)}`);
      if (r.failed) throw new Error(r.error || "Lyrics generation failed");
      if (r.lyrics.length) {
        const first = r.lyrics[0];
        $("#lyrics").value = first.text;
        if (!$("#title").value.trim() && first.title) $("#title").value = first.title.slice(0, 80);
        updateCounts();
        toast("Lyrics ready — edit them however you like.");
        return;
      }
    }
    throw new Error("Lyrics are taking too long. Try again.");
  } catch (err) {
    toast(err.message, 5000);
  } finally {
    btn.disabled = $("#instrumental").checked;
    btn.textContent = "✨ Write lyrics";
  }
}

/* ---------- rendering ---------- */
const STATUS_TEXT = {
  PENDING: "Queued",
  TEXT_SUCCESS: "Writing music",
  FIRST_SUCCESS: "Almost done",
  SUCCESS: "Ready",
  TIMEOUT: "Slow",
};

function render() {
  const host = $("#jobs");
  $("#empty").hidden = jobs.length > 0;
  $("#clearLib").hidden = jobs.length === 0;
  host.innerHTML = jobs.map(renderJob).join("");
  markPlaying();
}

function renderJob(job) {
  const failed = !!job.error && job.status !== "TIMEOUT";
  const done = job.status === "SUCCESS";
  const badgeClass = failed ? "failed" : done ? "done" : "working";
  const badge = failed ? "Failed" : STATUS_TEXT[job.status] || "Working";
  const working = !failed && !done;

  let body;
  if (failed) {
    body = `<p class="job-error">${esc(job.error)}</p>`;
  } else if (job.tracks.length) {
    body = `<div class="tracks">${job.tracks.map((t, i) => renderTrack(job, t, i)).join("")}</div>`;
  } else {
    body = `<div class="tracks"><div class="skeleton"></div><div class="skeleton"></div></div>`;
  }
  const progress = working
    ? `<p class="progress">${job.status === "TIMEOUT" ? esc(job.error) : "Generating… you can start listening once a preview appears."}</p>`
    : "";

  return `
  <article class="job" data-task="${esc(job.taskId)}">
    <div class="job-head">
      <div class="job-prompt" title="${esc(job.label)}">${esc(job.label)}</div>
      <div class="job-actions">
        <span class="badge ${badgeClass}">${badge}</span>
        ${job.status === "TIMEOUT" ? `<button class="btn ghost small" data-act="refresh">Refresh</button>` : ""}
        <button class="x" data-act="remove" aria-label="Remove">×</button>
      </div>
    </div>
    ${body}
    ${progress}
  </article>`;
}

function renderTrack(job, t, i) {
  const playable = safeUrl(t.audioUrl) || safeUrl(t.streamUrl);
  const img = safeUrl(t.imageUrl);
  const title = t.title || job.label;
  const dl = safeUrl(t.audioUrl)
    ? `<a href="${esc(t.audioUrl)}" target="_blank" rel="noopener" download>Download MP3</a>`
    : `<span class="pending">MP3 coming…</span>`;
  const lyr = t.lyrics && !job.instrumental ? `<button data-act="lyrics" data-i="${i}">Lyrics</button>` : "";
  return `
  <div class="track-card" data-i="${i}">
    <div class="art">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" />` : ""}
      ${playable ? `<button data-act="play" data-i="${i}" aria-label="Play ${esc(title)}">▶</button>` : ""}
    </div>
    <div class="track-info">
      <div class="track-title" title="${esc(title)}">${esc(title)}</div>
      <div class="track-tags">${esc(t.tags || job.style || "")}${t.duration ? ` · ${fmt(t.duration)}` : ""}</div>
      <div class="track-links">${dl}${lyr}</div>
    </div>
  </div>`;
}

/* ---------- player ---------- */
const audio = $("#audio");
let current = null; // { taskId, i }

function play(job, i) {
  const t = job.tracks[i];
  const src = safeUrl(t.audioUrl) || safeUrl(t.streamUrl);
  if (!src) return;
  const same = current && current.taskId === job.taskId && current.i === i;
  if (same) {
    audio.paused ? audio.play() : audio.pause();
    return;
  }
  current = { taskId: job.taskId, i };
  audio.src = src;
  audio.play().catch(() => toast("Couldn't play this track yet — try again in a moment."));
  $("#player").hidden = false;
  $("#playerTitle").textContent = t.title || job.label;
  $("#playerTags").textContent = t.tags || job.style || "";
  const art = $("#playerArt");
  const img = safeUrl(t.imageUrl);
  if (img) art.src = img; else art.removeAttribute("src");
  markPlaying();
}

function markPlaying() {
  document.querySelectorAll(".track-card").forEach((c) => {
    const task = c.closest(".job").dataset.task;
    const on = current && task === current.taskId && Number(c.dataset.i) === current.i;
    c.classList.toggle("playing", !!on);
    const b = c.querySelector('[data-act="play"]');
    if (b) b.textContent = on && !audio.paused ? "❚❚" : "▶";
  });
  $("#playPause").textContent = audio.paused ? "▶" : "❚❚";
}

audio.addEventListener("play", markPlaying);
audio.addEventListener("pause", markPlaying);
audio.addEventListener("loadedmetadata", () => ($("#tDur").textContent = fmt(audio.duration)));
audio.addEventListener("timeupdate", () => {
  $("#tCur").textContent = fmt(audio.currentTime);
  if (Number.isFinite(audio.duration)) {
    $("#seek").value = (audio.currentTime / audio.duration) * 100;
    $("#tDur").textContent = fmt(audio.duration);
  }
});
$("#seek").addEventListener("input", (e) => {
  if (Number.isFinite(audio.duration)) audio.currentTime = (e.target.value / 100) * audio.duration;
});
$("#playPause").addEventListener("click", () => (audio.paused ? audio.play() : audio.pause()));

/* ---------- events ---------- */
$("#jobs").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const job = jobs.find((j) => j.taskId === btn.closest(".job").dataset.task);
  if (!job) return;
  const act = btn.dataset.act;
  if (act === "play") play(job, Number(btn.dataset.i));
  if (act === "lyrics") {
    const t = job.tracks[Number(btn.dataset.i)];
    $("#dlgTitle").textContent = t.title || job.label;
    $("#dlgText").textContent = t.lyrics;
    $("#lyricsDialog").showModal();
  }
  if (act === "remove") {
    clearTimeout(timers.get(job.taskId));
    timers.delete(job.taskId);
    jobs = jobs.filter((j) => j !== job);
    save();
    render();
  }
  if (act === "refresh") {
    job.status = "PENDING";
    job.error = null;
    job.createdAt = Date.now();
    render();
    poll(job);
  }
});

$("#clearLib").addEventListener("click", () => {
  if (!confirm("Remove all songs from this browser's library?")) return;
  timers.forEach(clearTimeout);
  timers.clear();
  jobs = [];
  save();
  render();
});

document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));
$("#instrumental").addEventListener("change", syncInstrumental);
$("#form").addEventListener("submit", onGenerate);
$("#writeLyrics").addEventListener("click", onWriteLyrics);

function updateCounts() {
  document.querySelectorAll(".count").forEach((c) => {
    const el = document.getElementById(c.dataset.for);
    c.textContent = `${el.value.length} / ${el.maxLength}`;
  });
}
["#prompt", "#lyrics"].forEach((id) => $(id).addEventListener("input", updateCounts));

const bindRange = (id, out, f) => {
  const el = $(id);
  const upd = () => ($(out).textContent = f(Number(el.value)));
  el.addEventListener("input", upd);
  upd();
};
bindRange("#duration", "#durationVal", fmt);
bindRange("#styleWeight", "#styleWeightVal", (v) => v.toFixed(2));
bindRange("#weirdnessConstraint", "#weirdnessVal", (v) => v.toFixed(2));
bindRange("#variety", "#varietyVal", (v) => VARIETY[v]);

$("#ideaChips").innerHTML = IDEAS.map((s) => `<button type="button" class="chip" data-idea="${esc(s)}">${esc(s.split(" ").slice(0, 4).join(" "))}…</button>`).join("");
$("#ideaChips").addEventListener("click", (e) => {
  const c = e.target.closest("[data-idea]");
  if (c) { $("#prompt").value = c.dataset.idea; updateCounts(); }
});
$("#styleChips").innerHTML = STYLES.map((s) => `<button type="button" class="chip" data-style="${esc(s)}">${esc(s)}</button>`).join("");
$("#styleChips").addEventListener("click", (e) => {
  const c = e.target.closest("[data-style]");
  if (!c) return;
  const cur = $("#style").value.split(",").map((x) => x.trim()).filter(Boolean);
  if (!cur.includes(c.dataset.style)) cur.push(c.dataset.style);
  $("#style").value = cur.join(", ");
});

/* ---------- start ---------- */
setMode("simple");
updateCounts();
render();
refreshCredits();
// Resume any jobs that were still running when the page was closed.
jobs.forEach((j) => {
  const finished = j.status === "SUCCESS" || (j.error && j.status !== "TIMEOUT");
  if (!finished && j.status !== "TIMEOUT") {
    j.createdAt = Math.max(j.createdAt, Date.now() - MAX_POLL_MS + 60000);
    poll(j);
  }
});
