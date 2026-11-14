// Running AI requests inside CampusPilot: with the student's Gemini key (everything), or Chrome's built-in AI (small,
// text-only jobs while the student uses their own AI for the rest). The reply goes through the same importReply()
// a pasted reply does, so every feature works the same way. Anything that can't run here (limit used up, offline,
// a job too big for the built-in AI) goes to the student's AI website the usual way.
import { h, $, state, toast, rerender, views, copyText, plural } from "./core.js";
import { icon } from "../lib/icons.js";
import { rich } from "../lib/rich.js";
import { getKey, generate, fileParts, GeminiError } from "../lib/gemini.js";
import { nanoAsk, nanoStatus } from "../lib/nano.js";
import { replyProgress, redoPrompt } from "../lib/finished.js";

const PENDING_KEY = "aiPending";
// With Gemini's JSON mode the reply is plain JSON; this says which shape (the request shows it inside a code block).
const JSON_ONLY = "Reply with JSON only: no code fences and nothing before or after it. Use exactly the shape the request shows inside its code block. For practice questions, reply {\"questions\":[ one object per question, in the shape shown ], \"end\": true} instead of one object per line.";
const TAGS = { quiz: "campuspilot-quiz", checklist: "campuspilot-checklist", weights: "campuspilot-weights", schedule: "campuspilot-schedule", sizes: "campuspilot-sizes", priorities: "campuspilot-priorities" };
// Small, text-only jobs Chrome's built-in AI may take (only when they fit what it can read at once).
const NANO_KINDS = new Set(["schedule", "weights"]);

/** Where this request runs: "gemini", "nano", or null (the student's AI website, as before). */
export async function engineFor({ expect, files = [], chat = null }) {
  const s = state.settings;
  if (s.aiProvider === "gemini-key" && (await getKey())?.key) return "gemini";
  if (s.localAi !== false && expect && NANO_KINDS.has(expect) && !files.length && !chat && (await nanoStatus()) === "available") return "nano";
  return null;
}
export const engineName = (e) => (e === "nano" ? "Chrome's built-in AI" : "Gemini");

let running = null; // { ctl, seq }
let seq = 0;

/**
 * Runs a request that expects a reply (questions, a checklist, a plan…). Shows the usual progress bar; the reply is
 * added by itself. Returns false when it couldn't run here (the caller then uses the AI website).
 */
export async function runDirect(engine, { text, files = [], expect, meta, title }, { importReply, fallback }) {
  const my = ++seq;
  running?.ctl.abort();
  const ctl = new AbortController();
  running = { ctl, seq: my };
  state.pending = { expect, meta, title, at: Date.now(), tabId: null, provider: engine, direct: engine, request: { text, files } };
  state.imported = null;
  state.watch = { phase: "thinking", got: 0, total: 0 };
  await chrome.storage.local.set({ [PENDING_KEY]: state.pending });
  views.banner?.();
  const sheet = $("#sheet"); if (sheet?.open && !sheet.classList.contains("answer")) sheet.close();
  const onText = (t) => {
    if (my !== seq) return;
    const prog = replyProgress(expect, t);
    setWatch({ ...state.watch, phase: "writing", got: prog.got, total: prog.total, note: null });
  };
  // What's happening, in words ("3.8 Flash is busy: using 3.6 Flash instead"), and a clock, so a long lecture
  // doesn't look stuck.
  const onStatus = (note) => { if (my === seq) setWatch({ ...state.watch, note }); };
  const started = Date.now();
  state.watch.started = started;
  const tick = setInterval(() => { if (my !== seq || !state.pending?.direct) return clearInterval(tick); views.paintWatch?.(); }, 1000);
  try {
    let reply;
    if (engine === "nano") {
      reply = await nanoAsk(text, { onText, signal: ctl.signal });
      if (reply == null) { // too big for it after all: the usual way
        if (my === seq) { state.pending = null; await chrome.storage.local.remove(PENDING_KEY); }
        return false;
      }
    } else {
      const key = (await getKey())?.key;
      const parts = [...(await fileParts(files, key, { signal: ctl.signal })), { text }];
      let contents = [{ role: "user", parts }];
      // Few, careful requests for what everything else builds on; quick ones for the rest.
      // Careful (Flash) for what everything builds on; questions on Flash while plenty are left today; short text-only
      // jobs on Gemma; the rest quick (Flash-Lite).
      const kind = (expect === "checklist" && !meta?.termsOnly) || expect === "sizes" || expect === "priorities" ? "careful"
        : expect === "quiz" ? "question" : (expect === "schedule" || expect === "weights") && !files.length ? "small" : "quick";
      const json = !!TAGS[expect];
      if (expect === "checklist" && meta?.pieces?.length > 1) {
        // A long lecture, read in parts and joined here (lib/checklist.js › mergePieces)
        const { pieceNote, mergePieces } = await import("../lib/checklist.js");
        const objs = [];
        for (const [i, r] of meta.pieces.entries()) {
          onStatus(`Reading ${meta.unit || "slide"}s ${r[0]}–${r[1]} (part ${i + 1} of ${meta.pieces.length})`);
          const piece = [{ role: "user", parts: [...parts.slice(0, -1), { text: text + pieceNote(r, i, meta.pieces.length, meta.unit || "slide") }] }];
          const out = (await generate(piece, { onText: () => {}, signal: ctl.signal, kind, onStatus, json, system: JSON_ONLY })).text;
          const m2 = out.match(/\{[\s\S]*\}/);
          if (!m2) throw new GeminiError("other", `Part ${i + 1} of the lecture came back empty. Try again.`);
          objs.push(JSON.parse(m2[0]));
          if (my !== seq) return true;
          setWatch({ ...state.watch, phase: "writing", got: objs.reduce((a, o) => a + (o.sections || []).reduce((x, s) => x + (s.items || []).length, 0), 0), total: 0, note: null });
        }
        reply = JSON.stringify(mergePieces(objs));
      } else
      reply = (await generate(contents, { onText, signal: ctl.signal, kind, onStatus, json, system: json ? JSON_ONLY : null })).text;
      // Not in the right shape (rare): ask once more in the same conversation.
      if (!replyProgress(expect, wrap(expect, reply)).done) {
        setWatch({ phase: "thinking", got: 0, total: 0 });
        contents = [...contents, { role: "model", parts: [{ text: reply }] }, { role: "user", parts: [{ text: redoPrompt(expect) }] }];
        reply = (await generate(contents, { onText, signal: ctl.signal, kind, onStatus, json, system: json ? JSON_ONLY : null })).text;
      }
    }
    if (my !== seq) return true;
    setWatch({ phase: "reading", got: replyProgress(expect, wrap(expect, reply)).got, total: 0 });
    await importReply(wrap(expect, reply));
  } catch (e) {
    if (e.name === "AbortError" || my !== seq) return true;
    await trouble(e, { text, files, expect, meta, title }, fallback);
  } finally { clearInterval(tick); if (running?.seq === my) running = null; }
  return true;
}
const wrap = (expect, t) => (/```/.test(t) || !TAGS[expect] ? t : `\`\`\`${TAGS[expect]}\n${t}\n\`\`\``);

// Something went wrong: say what, in plain words, and offer the way that always works.
async function trouble(e, req, fallback) {
  const k = e instanceof GeminiError ? e.kind : "other";
  state.watch = { phase: "failed", got: 0, total: 0, why: e.message, kind: k };
  views.banner?.();
  if (k === "key") {
    const { openAiSetup } = await import("./aisetup.js");
    toast(`${e.message} Set it up again (it takes a minute), or use your AI's website.`, { error: true, ms: 12000, action: { label: "Set up again", run: () => openAiSetup({ again: true }) } });
    return;
  }
  const why = { limit: e.message, offline: "You seem to be offline.", busy: "Gemini is busy right now.", region: e.message, blocked: e.message, cut: e.message, disabled: e.message }[k] || e.message;
  const Q = await import("./queue.js");
  // In a running list, one failed step doesn't hold up the rest (except when the day's free requests are gone:
  // then everything would fail, so the list pauses and keeps its place).
  if (k !== "limit" && k !== "region" && k !== "disabled" && Q.isRunning()) {
    state.pending = null; state.watch = null;
    await chrome.storage.local.remove(PENDING_KEY);
    views.banner?.();
    if (await Q.skipFailed(k === "busy" ? "Gemini was busy" : k === "offline" ? "offline" : "")) return;
  }
  if (k === "limit" && Q.isRunning()) {
    // Keep this step (first) and the rest of the list for tomorrow.
    const j = state.queueRun?.job;
    if (j) await Q.addJob(j, { front: true, quiet: true });
    Q.stopQueue();
    state.pending = null; state.watch = null;
    await chrome.storage.local.remove(PENDING_KEY);
    views.banner?.();
    toast(`${why} Your list is kept under Home › For your AI: press Start there after midnight Pacific time, or send this step through Gemini's website now.`, { error: true, ms: 16000,
      action: { label: "Use the website", run: async () => { if (j) await Q.removeJob(Q.jobKey(j)); return fallback(req); } } });
    return;
  }
  toast(`${why} You can send this one through Gemini's website instead.`, { error: true, ms: 14000, action: { label: "Use the website", run: () => fallback(req) } });
}

/** Cancels whatever is running here (the banner's ×). */
export function stopDirect() { seq++; running?.ctl.abort(); running = null; }
/** "Try again" in the banner, and after the panel was closed while a request ran. */
export async function rerunPending({ importReply, fallback }) {
  const p = state.pending;
  if (!p?.direct || !p.request) return false;
  return runDirect(p.direct, { ...p.request, expect: p.expect, meta: p.meta, title: p.title }, { importReply, fallback });
}

// ---------- the progress bar (shared with the website way, in aiflow.js) ----------
function setWatch(w) {
  const before = state.watch?.phase;
  state.watch = w;
  if (before !== w.phase && (w.phase === "failed" || before === "failed")) return views.banner?.();
  views.paintWatch?.();
}
const NOUN = { quiz: "question", checklist: "item", schedule: "class time", sizes: "estimate", priorities: "task" };
export function directWatchText() {
  const p = state.pending, w = state.watch || { phase: "thinking" }, name = engineName(p?.direct);
  const noun = NOUN[p?.expect];
  const so = noun && w.got ? `${plural(w.got, noun)} so far` : "";
  const secs = w.started ? Math.floor((Date.now() - w.started) / 1000) : 0;
  const clock = secs >= 5 ? ` · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : "";
  const big = p?.expect === "checklist" || p?.expect === "sizes" || p?.expect === "priorities";
  switch (w.phase) {
    case "writing": return { label: `${name} is writing${so ? `: ${so}` : "…"}${clock}`, sub: w.note || "It's added by itself when it's done. You can keep using CampusPilot.", pct: w.total ? Math.min(99, (100 * w.got) / w.total) : null };
    case "reading": return { label: `Adding ${so ? plural(w.got, noun) : "the answer"}…`, sub: "", pct: 100 };
    case "failed": return { label: "This request didn't finish", sub: w.why || "Something went wrong.", pct: 0, cut: true };
    default: return { label: `${name} is reading and thinking…${clock}`, sub: w.note || (big ? "A whole lecture can take a few minutes. You can keep using CampusPilot." : "Usually under a minute. You can keep using CampusPilot."), pct: null };
  }
}

// ---------- answers to read (study guide, questions about a lecture, search) ----------
// Requests that don't come back as data open here as a short chat: the answer, and a box for follow-up questions.
export async function openAnswer({ text, files = [], title = "" }) {
  const dlg = $("#sheet");
  const log = h("div", { class: "chat-log", role: "log", "aria-live": "polite" });
  const input = h("textarea", { rows: 2, placeholder: "Ask a follow-up…", "aria-label": "Ask a follow-up question" });
  const send = h("button", { class: "btn small", type: "submit" }, "Ask");
  const contents = [];
  let ctl = null;
  const bubble = (who) => { const b = h("div", { class: `chat-msg ${who}` }); log.append(b); return b; };
  const ask = async (parts, shown) => {
    if (shown) bubble("me").append(shown);
    const out = bubble("ai");
    out.append(h("span", { class: "muted" }, "Gemini is thinking…"));
    contents.push({ role: "user", parts });
    send.disabled = true; ctl = new AbortController();
    try {
      const r = await generate(contents, { signal: ctl.signal, onText: (t) => { out.replaceChildren(md(t)); } });
      contents.push({ role: "model", parts: [{ text: r.text }] });
      out.replaceChildren(md(r.text), h("button", { class: "linkish chat-copy", onclick: async () => { await copyText(r.text); toast("Copied"); } }, "Copy"));
    } catch (e) {
      if (e.name === "AbortError") return;
      contents.pop();
      out.replaceChildren(h("span", { class: "note warn" }, e.message));
      if (e instanceof GeminiError && e.kind !== "key") out.append(" ", h("button", { class: "linkish", onclick: () => { dlg.close(); import("./aiflow.js").then((m) => m.handToAI(text, { title, files, forceWeb: "gemini" })); } }, "Ask on Gemini's website instead"));
    } finally { send.disabled = false; input.focus(); }
  };
  const form = h("form", { class: "chat-form", onsubmit: (e) => { e.preventDefault(); const q = input.value.trim(); if (!q || send.disabled) return; input.value = ""; ask([{ text: q }], q); } }, input, send);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  dlg.classList.add("answer");
  dlg.replaceChildren(h("div", { class: "sheet-in" },
    h("div", { class: "sheet-head" }, h("div", { class: "grow" }, h("b", {}, title || "Gemini"), h("div", { class: "meta" }, "Answered by Gemini, right here")),
      h("button", { class: "ghost", "aria-label": "Close", onclick: () => dlg.close() }, icon("close", 18))),
    log, form));
  dlg.onclick = null;
  dlg.addEventListener("close", () => { ctl?.abort(); dlg.classList.remove("answer"); }, { once: true });
  if (!dlg.open) dlg.showModal();
  // Answers in the background, so the button that opened this is done right away.
  (async () => {
    const key = (await getKey())?.key;
    let parts;
    try { parts = [...(await fileParts(files, key)), { text }]; }
    catch (e) { log.append(h("div", { class: "note warn" }, e.message)); return; }
    await ask(parts, null);
  })();
}

// A little Markdown for answers: headings, lists, bold, paragraphs; code and math as in questions.
export function md(src) {
  const box = h("div", { class: "md" });
  const blocks = String(src || "").split(/(```[\s\S]*?(?:```|$))/);
  for (const b of blocks) {
    if (!b) continue;
    if (b.startsWith("```")) { box.append(rich(b)); continue; }
    let list = null;
    for (const raw of b.split("\n")) {
      const line = raw.trimEnd();
      const hm = line.match(/^(#{1,4})\s+(.*)$/), bm = line.match(/^\s*[-*•]\s+(.*)$/), nm = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
      if (hm) { list = null; box.append(h(`h${Math.min(4, hm[1].length + 2)}`, {}, inline(hm[2]))); continue; }
      if (bm || nm) {
        const tag = bm ? "ul" : "ol";
        if (!list || list.tagName.toLowerCase() !== tag) { list = h(tag, {}); box.append(list); }
        list.append(h("li", {}, inline(bm ? bm[1] : nm[2])));
        continue;
      }
      list = null;
      if (line.trim()) box.append(h("p", {}, inline(line)));
    }
  }
  return box;
}
function inline(s) {
  const frag = document.createDocumentFragment();
  s.split(/\*\*(.+?)\*\*/g).forEach((seg, i) => { if (seg) frag.append(i % 2 ? h("b", {}, rich(seg)) : rich(seg)); });
  return frag;
}
