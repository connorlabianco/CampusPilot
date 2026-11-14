// Gemini, run from inside CampusPilot with the student's own free key (made for them by "Sign in with Google", see
// lib/gkey.js, or pasted from Google AI Studio). Requests go straight from this browser to Google; the key is kept
// on this computer only (chrome.storage.local "aiKey"; never synced or exported).
import { analyzePptx, analyzeDocx, formatOf } from "./extract.js";
import { getFile, putFile } from "./filecache.js";

export const API = "https://generativelanguage.googleapis.com";
export const ORIGINS = ["https://generativelanguage.googleapis.com/*"];
const STORE = "aiKey";
const FILES = "geminiFiles";

// ---------- the key ----------
/** { key, source: "google" | "pasted", project, model, careful: [models], quick: [models], outs, usage, spent, dead, at } or null */
export const getKey = async () => (await chrome.storage.local.get(STORE))[STORE] || null;
export const setKey = (rec) => chrome.storage.local.set({ [STORE]: { ...rec, at: Date.now() } });
export const clearKey = () => chrome.storage.local.remove([STORE, FILES]);
/** Looks like a Google API key (AI Studio's keys start with "AIza"). */
export const looksLikeKey = (s) => /^AIza[0-9A-Za-z_-]{30,45}$/.test(String(s || "").trim());
export const findKeyIn = (s) => (String(s || "").match(/AIza[0-9A-Za-z_-]{35}/) || [])[0] || null;

export class GeminiError extends Error {
  /** kind: key | limit | busy | offline | region | disabled | blocked | cut | other */
  constructor(kind, message, detail = "") { super(message); this.kind = kind; this.detail = detail; }
}
async function fail(res) {
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  const e = body?.error || {}, msg = e.message || res.statusText || `HTTP ${res.status}`;
  const reason = JSON.stringify(e.details || []) + " " + (e.status || "") + " " + msg;
  if (/API_KEY_INVALID|API key not valid|API_KEY_.*(EXPIRED|REVOKED)|expired/i.test(reason)) return new GeminiError("key", "Your Gemini key isn't working anymore.", msg);
  if (res.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(reason)) {
    const err = new GeminiError("limit", "Gemini's free limit is used up for now.", msg);
    err.zero = /limit:\s*0\b/.test(reason);                  // this model isn't free at all
    err.perDay = /PerDay|per day|daily/i.test(reason);         // the day's requests are used up
    const d = (e.details || []).find((x) => x.retryDelay)?.retryDelay || (reason.match(/retry in ([\d.]+)s/i) || [])[1];
    err.retryMs = d ? Math.ceil(parseFloat(String(d)) * 1000) : null;
    return err;
  }
  if (/SERVICE_DISABLED|has not been used in project|is disabled/i.test(reason)) return new GeminiError("disabled", "The Gemini API isn't turned on for your key's project yet.", msg);
  if (/location is not supported|not available in your country/i.test(reason)) return new GeminiError("region", "Google doesn't offer the Gemini API where you are.", msg);
  if (res.status >= 500 || /UNAVAILABLE|overloaded/i.test(reason)) return new GeminiError("busy", "Gemini is busy right now.", msg);
  return new GeminiError("other", `Gemini said: ${msg}`, msg);
}
async function call(path, { key, method = "GET", body = null, signal } = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, { method, signal, headers: { "x-goog-api-key": key, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : null });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new GeminiError("offline", "Couldn't reach Gemini. Check your internet connection.");
  }
  if (!res.ok) throw await fail(res);
  return res;
}

// ---------- which model ----------
// Three pools, from Google's free limits (per model, per day; they reset at midnight Pacific time):
//   careful: the Flash models, about 20 a day each (3.8, 3.6, 3, 2.5 Flash, Gemini 4 Hydrogen), then 2.5 Flash-Lite
//            (also 20 a day). For lecture checklists, study plans, and questions while plenty are left.
//   quick:   3.5 and 3.1 Flash-Lite, about 500 a day each. Everything else.
//   small:   Gemma 4 (31B, 26B), about 14,400 a day each, but only about 16,000 tokens a minute: short text-only
//            jobs (checking answer keys, reading class times or grade weights from syllabus text).
// Models are chosen by name, newest first, never by Google's "latest" nicknames (those can point at a model with no
// free requests). One with no free requests is skipped from then on; one whose day is used up is skipped until
// Google's day ends; one at its per-minute limit is skipped for that minute.
const SKIP = /(image|tts|audio|live|embedding|aqa|vision|thinking-exp|robotics|computer-use|native|transcribe|translate|deep-research|banana|lyria|veo|imagen)/;
const ver = (name) => Number((name.match(/(?:gemini|gemma)-(\d+(?:\.\d+)?)/) || [])[1] || 0);
export function pickModels(models) {
  const ok = models.filter((m) => (m.supportedGenerationMethods || []).includes("generateContent") && !SKIP.test(m.name));
  const outs = Object.fromEntries(ok.map((m) => [m.name, Math.min(65536, m.outputTokenLimit || 8192)]));
  const order = (stable, preview, alias) => [
    ...ok.filter((m) => stable.test(m.name)).sort((x, y) => ver(y.name) - ver(x.name) || x.name.length - y.name.length),
    ...ok.filter((m) => preview.test(m.name) && !stable.test(m.name)).sort((x, y) => ver(y.name) - ver(x.name)),
    ...ok.filter((m) => alias.test(m.name)),
  ].map((m) => m.name).filter((n, i, a) => a.indexOf(n) === i);
  const flash = order(/^models\/gemini-\d+(\.\d+)?-flash(-\d{3})?$/, /^models\/gemini-\d+(\.\d+)?-flash-(preview|exp)[\w-]*$/, /^models\/gemini-flash-latest$/);
  // Gemini 4 Hydrogen and other new code-named Flash-tier models: after the known Flash models (more free requests)
  const named = ok.filter((m) => /hydrogen/i.test(`${m.name} ${m.displayName || ""}`)).map((m) => m.name);
  const lite = order(/^models\/gemini-\d+(\.\d+)?-flash-lite(-\d{3})?$/, /^models\/gemini-\d+(\.\d+)?-flash-lite-(preview|exp)[\w-]*$/, /^models\/gemini-flash-lite-latest$/);
  // 2.5 Flash-Lite (and older) has only about 20 free a day: a careful fallback, not a quick model
  const bigLite = lite.filter((n) => ver(n) >= 3 || /latest/.test(n)), smallLite = lite.filter((n) => !bigLite.includes(n));
  const careful = [...new Set([...flash, ...named, ...smallLite])];
  const quick = bigLite.length ? bigLite : lite;
  const small = ok.filter((m) => /^models\/gemma-\d/.test(m.name)).sort((x, y) => ver(y.name) - ver(x.name) || (Number((y.name.match(/(\d+)b/) || [])[1]) || 0) - (Number((x.name.match(/(\d+)b/) || [])[1]) || 0)).map((m) => m.name);
  return { careful, quick, small, outs, model: careful[0] || quick[0] || null };
}
/** Checks a key and finds its models. Throws GeminiError. */
export async function checkKey(key, { signal } = {}) {
  const res = await call("/v1beta/models?pageSize=1000", { key, signal });
  const { models = [] } = await res.json();
  const pick = pickModels(models);
  if (!pick.model) throw new GeminiError("other", "This key can't use any Gemini model.");
  return pick;
}
// Google's free day ends at midnight Pacific time.
export const googleDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);
const poolOf = (rec, model) => ((rec.small || []).includes(model) ? "small" : (rec.quick || []).includes(model) ? "quick" : "careful");
const PER_DAY = { careful: 20, quick: 500, small: 14400 }; // per model, from Google's free limits (checked as we go)
/** Today's requests: { careful, quick, small } (for Settings › Your AI). */
export async function usageToday() {
  const rec = await getKey();
  const u = rec?.usage?.day === googleDay() ? rec.usage.n : {};
  const out = { careful: 0, quick: 0, small: 0 };
  for (const [m, n] of Object.entries(u)) out[poolOf(rec, m)] += n;
  return out;
}
// Real models only ("…-latest" nicknames point at one of them), not ones found to have no free requests.
const counted = (rec, list) => (list || []).filter((m) => !/latest/.test(m) && !rec.dead?.[m]);
/** About how many requests each pool has per day ({ careful, quick }), for Settings. */
export const poolSizes = (rec) => ({ careful: counted(rec, rec?.careful).length * PER_DAY.careful, quick: counted(rec, rec?.quick).length * PER_DAY.quick });
/** About how many careful requests are left today (20 per Flash model not used up, minus what's been used). */
export async function carefulLeft() {
  const rec = await getKey();
  if (!rec?.careful) return 0;
  const day = googleDay(), u = rec.usage?.day === day ? rec.usage.n : {};
  return counted(rec, rec.careful).filter((m) => rec.spent?.[m] !== day).reduce((a, m) => a + Math.max(0, PER_DAY.careful - (u[m] || 0)), 0);
}
async function note(model, change) {
  const rec = await getKey();
  if (!rec) return;
  const day = googleDay();
  if (change === "used") {
    const usage = rec.usage?.day === day ? rec.usage : { day, n: {} };
    usage.n[model] = (usage.n[model] || 0) + 1;
    rec.usage = usage;
  } else if (change === "spent") rec.spent = { ...(rec.spent || {}), [model]: day };
  else if (change === "dead") rec.dead = { ...(rec.dead || {}), [model]: Date.now() };
  await chrome.storage.local.set({ [STORE]: rec });
}

// ---------- files ----------
const GEMINI_TYPES = /^(application\/pdf|image\/(png|jpeg|webp|heic|heif)|text\/[\w.+-]+|audio\/[\w.+-]+|video\/[\w.+-]+)$/;
const mimeOf = (name, type) => {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (/\.(jpe?g)$/.test(n)) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (/\.(txt|md|csv|py|r|tex|ipynb|json|sql|java|c|cpp|js|ts)$/.test(n)) return "text/plain";
  return (type || "").split(";")[0] || "application/octet-stream";
};
const b64 = (buf) => { let s = ""; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
const INLINE_MAX = 14e6; // all inline files together (Google's limit for one request is about 20 MB)

async function upload(key, blob, name, mime, signal) {
  const start = await fetch(`${API}/upload/v1beta/files`, { method: "POST", signal, headers: {
    "x-goog-api-key": key, "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
    "X-Goog-Upload-Header-Content-Length": String(blob.size), "X-Goog-Upload-Header-Content-Type": mime, "Content-Type": "application/json" },
    body: JSON.stringify({ file: { display_name: name.slice(0, 100) } }) }).catch(() => { throw new GeminiError("offline", "Couldn't reach Gemini to send the file."); });
  if (!start.ok) throw await fail(start);
  const url = start.headers.get("x-goog-upload-url");
  if (!url) throw new GeminiError("other", "Gemini didn't accept the file upload.");
  const put = await fetch(url, { method: "POST", signal, headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" }, body: blob });
  if (!put.ok) throw await fail(put);
  let { file } = await put.json();
  for (let i = 0; file?.state === "PROCESSING" && i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    file = await (await call(`/v1beta/${file.name}`, { key, signal })).json();
  }
  if (file?.state === "FAILED") throw new GeminiError("other", `Gemini couldn't read ${name}.`);
  return file;
}
/**
 * The files a request comes with ([{ url, name }], read with the student's Canvas login), as Gemini parts.
 * PDFs and pictures go as they are (Gemini reads them, handwriting and figures included); PowerPoint and Word files go
 * as their text, slide by slide (Gemini can't open those). Big files are uploaded once and reused for two days.
 */
export async function fileParts(files, key, { signal, onNote } = {}) {
  const parts = [];
  let inline = 0;
  const { [FILES]: cache = {} } = await chrome.storage.local.get(FILES);
  for (const f of files) {
    const hit = cache[f.url];
    if (hit && Date.now() - hit.at < 46 * 3600e3) { parts.push({ file_data: { mime_type: hit.mime, file_uri: hit.uri } }); continue; }
    // The copy saved on this computer, else a download (kept for next time), else the background downloads it.
    let blob = await getFile(f).catch(() => null);
    if (!blob) {
      const r = await fetch(f.url, { credentials: "include", signal }).catch(() => null);
      const html = r?.ok && /text\/html/.test(r.headers.get("content-type") || "") && !/\.html?$/i.test(f.name || "");
      if (r?.ok && !html) { blob = await r.blob(); putFile(f, blob, { name: f.name, type: f.type || blob.type }).catch(() => {}); }
      else if (globalThis.chrome?.runtime?.sendMessage) {
        const s = await chrome.runtime.sendMessage({ type: "FILE_SAVE", payload: { file: f } }).catch(() => null);
        if (s?.ok) blob = await getFile(f).catch(() => null);
      }
    }
    if (!blob) { parts.push({ text: `(The file "${f.name}" couldn't be loaded.)` }); onNote?.(`Couldn't load ${f.name}`); continue; }
    const fmt = formatOf(f.name, blob.type);
    if (fmt === "pptx" || fmt === "docx") {
      try {
        const doc = await (fmt === "pptx" ? analyzePptx : analyzeDocx)(await blob.arrayBuffer());
        parts.push({ text: `## The attached file "${f.name}", as text (${fmt === "pptx" ? "slide by slide, with speaker notes" : "the whole document"})\n\n${(doc.text || "").slice(0, 200000)}` });
      } catch { parts.push({ text: `(The file "${f.name}" couldn't be read.)` }); }
      continue;
    }
    const mime = mimeOf(f.name, blob.type);
    if (!GEMINI_TYPES.test(mime)) { parts.push({ text: `(The file "${f.name}" is a type Gemini can't open, so it was left out.)` }); continue; }
    // Small files go inline; bigger ones are uploaded to Google once and reused (every round of a lecture sends the
    // same file) for two days.
    if (blob.size < 1e6 && inline + blob.size * 1.37 <= INLINE_MAX) {
      inline += blob.size * 1.37;
      parts.push({ inline_data: { mime_type: mime, data: b64(await blob.arrayBuffer()) } });
    } else {
      const up = await upload(key, blob, f.name, mime, signal);
      cache[f.url] = { uri: up.uri, mime: up.mimeType || mime, at: Date.now() };
      await chrome.storage.local.set({ [FILES]: cache });
      parts.push({ file_data: { mime_type: up.mimeType || mime, file_uri: up.uri } });
    }
  }
  return parts;
}

// ---------- asking ----------
/**
 * Streams Gemini's answer. contents: [{ role: "user" | "model", parts }]. onText(fullTextSoFar) as it writes.
 * kind: "careful" or "quick" (see "which model"). Moves on to the next model when one's free requests are used up,
 * waits out a per-minute limit, and tries again (twice) when Gemini is busy. Returns { text, model, finish }.
 */
export const modelName = (m) => String(m || "").replace(/^models\//, "").replace(/^gemini-/, "Gemini ").replace(/-flash-lite/, " Flash-Lite").replace(/-flash/, " Flash").replace(/-(preview|latest)[\w-]*$/, "");
const cooling = new Map(); // model → time its per-minute limit clears
/**
 * kind: "careful", "quick", "question" (careful while more than RESERVE careful requests are left today, else quick),
 * "check" or "small" (Gemma first when the text is short enough, else quick). json: ask for a JSON reply (Gemini's
 * JSON mode: always valid JSON, so no broken or cut-off code blocks).
 */
export const RESERVE = 20;
export async function generate(contents, { onText, signal, system = null, kind = "quick", onStatus = () => {}, json = false } = {}) {
  let rec = await getKey();
  if (!rec?.key) throw new GeminiError("key", "Set up Gemini first (Settings › Your AI).");
  if (!rec.careful || !rec.small || Date.now() - (rec.modelsAt || 0) > 7 * 864e5) {
    try { rec = { ...rec, ...(await checkKey(rec.key, { signal })), modelsAt: Date.now() }; await setKey(rec); rec = await getKey(); }
    catch (e) { if (!rec.careful) throw e; }
  }
  if (kind === "question") kind = (await carefulLeft()) > RESERVE ? "careful" : "quick";
  const day = googleDay();
  const usable = (m) => !(rec.spent?.[m] === day) && !(rec.dead?.[m] && Date.now() - rec.dead[m] < 7 * 864e5);
  // Gemma only for short text (its limit is about 16,000 tokens a minute; ~4 characters a token)
  const textLen = JSON.stringify(contents).length;
  const gemmaOk = (kind === "check" || kind === "small") && textLen < 40000 && !contents.some((c) => c.parts.some((p) => p.inline_data || p.file_data));
  const lists = kind === "careful" ? [rec.careful, rec.quick] : gemmaOk ? [rec.small || [], rec.quick, rec.careful] : [rec.quick, rec.careful];
  const tries = [...new Set(lists.flat().filter(Boolean))].filter(usable);
  if (!tries.length) throw new GeminiError("limit", "Gemini's free requests for today are used up (they come back at midnight Pacific time).");
  let last = null;
  for (let round = 0; round < 2; round++) {
    for (const [n, model] of tries.entries()) {
      if (rec.spent?.[model] === day) continue;
      const cool = cooling.get(model) || 0;
      if (cool > Date.now()) { if (round === 0) continue; onStatus("Waiting a moment for Gemini's per-minute limit…"); await new Promise((r) => setTimeout(r, Math.min(60e3, cool - Date.now()) + 300)); }
      if (n > 0 && last) onStatus(`${last.kind === "limit" ? `${modelName(tries[n - 1])} is used up for today` : `${modelName(tries[n - 1])} is busy`}: using ${modelName(model)} instead`);
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const gemma = /gemma/.test(model);
          const r = await stream(rec.key, model, contents, { out: rec.outs?.[model] || 8192, onText, signal, system: gemma ? null : system, kind, json: json && !gemma, prefix: gemma ? system : null });
          await note(model, "used");
          return r;
        } catch (e) {
          if (e.name === "AbortError") throw e;
          last = e;
          if (e.kind === "limit") {
            if (e.zero) { await note(model, "dead"); break; }
            if (e.perDay) { await note(model, "spent"); rec.spent = { ...(rec.spent || {}), [model]: day }; break; }
            // a per-minute limit: skip this model for that minute (another one usually has room)
            cooling.set(model, Date.now() + Math.min(60e3, e.retryMs ?? 30e3));
            break;
          }
          if (e.kind === "busy" && attempt < 2) { onStatus(`${modelName(model)} is busy. Trying again (${attempt + 2} of 3)…`); await new Promise((r) => setTimeout(r, 2500 * (attempt + 1))); continue; }
          if (e.kind === "busy" || e.kind === "other") break; // next model
          throw e;
        }
      }
    }
    // second round only when everything left was just at its per-minute limit
    if (!tries.some((m) => rec.spent?.[m] !== day && (cooling.get(m) || 0) > Date.now())) break;
  }
  if (last?.kind === "limit") throw new GeminiError("limit", "Gemini's free requests for today are used up (they come back at midnight Pacific time).");
  throw last;
}
// How long Gemini "thinks" before it writes. CampusPilot's requests spell out exactly what to do, so a little is
// enough: Gemini 3 and newer take a level, 2.5 a token budget. Lower means the answer starts much sooner.
function thinking(model, kind) {
  const v = Number((model.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  // "check" (re-solving questions to catch wrong answer keys) needs a little reasoning even on the quick models.
  if (v >= 3) return { thinkingLevel: kind === "careful" || kind === "check" ? "low" : "minimal" };
  if (v >= 2.5) return { thinkingBudget: kind === "check" ? 1024 : /lite/.test(model) ? 0 : kind === "careful" ? 1024 : 0 };
  return null;
}
async function stream(key, model, contents, { out, onText, signal, system, kind = "quick", json = false, prefix = null }) {
  if (prefix) contents = contents.map((c, i) => (i === 0 ? { ...c, parts: [{ text: prefix }, ...c.parts] } : c));
  const body = { contents, generationConfig: { maxOutputTokens: out } };
  if (json) body.generationConfig.responseMimeType = "application/json";
  const th = /gemma/.test(model) ? null : thinking(model, kind);
  if (th) body.generationConfig.thinkingConfig = th;
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  let res;
  try { res = await call(`/v1beta/${model}:streamGenerateContent?alt=sse`, { key, method: "POST", body, signal }); }
  catch (e) {
    // a model that doesn't take this thinking setting: ask again without it
    if (th && e.kind === "other" && /thinking/i.test(e.detail || e.message)) { delete body.generationConfig.thinkingConfig; res = await call(`/v1beta/${model}:streamGenerateContent?alt=sse`, { key, method: "POST", body, signal }); }
    else throw e;
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", text = "", finish = null, blocked = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      let j; try { j = JSON.parse(line.slice(5)); } catch { continue; }
      if (j.error) throw new GeminiError("other", `Gemini said: ${j.error.message || "error"}`);
      if (j.promptFeedback?.blockReason) blocked = j.promptFeedback.blockReason;
      const c = j.candidates?.[0];
      for (const p of c?.content?.parts || []) if (p.text && !p.thought) text += p.text;
      if (c?.finishReason) finish = c.finishReason;
      onText?.(text);
    }
  }
  if (blocked || (!text && /SAFETY|BLOCKLIST|PROHIBITED|RECITATION/.test(finish || ""))) throw new GeminiError("blocked", "Gemini wouldn't answer this request.");
  if (finish === "MAX_TOKENS") throw new GeminiError("cut", "Gemini's answer was too long and got cut off.");
  if (!text.trim()) throw new GeminiError("busy", "Gemini sent an empty answer.");
  return { text, model, finish };
}
