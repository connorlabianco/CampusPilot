// "Report a problem" and "Your courses also use…": the only things CampusPilot ever sends to its developer, and only
// when the student presses Send. Everything that would go is shown first ("See exactly what's sent").
import { h, $, state, toast, visibleSnapshot, ai, send } from "./core.js";
import { icon } from "../lib/icons.js";
import { recentErrors, scrub } from "../lib/errlog.js";

export const API = "https://campuspilot.clabianco.fyi/api";
const KINDS = [["bug", "Something isn't working"], ["idea", "An idea or request"], ["other", "Something else"]];

async function post(path, body) {
  const res = await fetch(`${API}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `The report server said ${res.status}. Try again in a little while.`);
  return j;
}

// Settings without anything personal: on/off switches and choices kept, everything else only says it's set.
const SAFE_TEXT = new Set(["aiProvider", "theme", "quizDifficulty", "textSize", "lookTheme"]);
function safeSettings(s = {}) {
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (/token|key|secret|password|email|name|url|link|path|note/i.test(k)) { out[k] = v ? "(set)" : "(empty)"; continue; }
    if (typeof v === "boolean" || typeof v === "number") out[k] = v;
    else if (typeof v === "string") out[k] = SAFE_TEXT.has(k) ? v.slice(0, 40) : v ? "(set)" : "(empty)";
    else if (Array.isArray(v)) out[k] = `(${v.length} items)`;
    else if (v && typeof v === "object") out[k] = `(${Object.keys(v).length} entries)`;
  }
  return out;
}
// What's on screen, as text: course names become "Course A", "Course B"…, and every number and email is hidden
// (so no grades, points or IDs).
function screenText() {
  const courses = visibleSnapshot()?.courses || [];
  const panel = document.querySelector("section[role=tabpanel]:not([hidden])");
  const sheet = $("#sheet")?.open && !$("#sheet").querySelector(".report-sheet") ? `\n[Open sheet]\n${$("#sheet").innerText}` : "";
  const runner = !$("#runner")?.hidden ? `\n[Practice window]\n${$("#runner").innerText}` : "";
  let t = `${panel?.innerText || ""}${sheet}${runner}`.replace(/\n{2,}/g, "\n");
  courses.forEach((c, i) => {
    for (const n of [c.name, c.code, c.course_code].filter((x) => x && x.length > 2)) t = t.split(n).join(`Course ${String.fromCharCode(65 + (i % 26))}`);
  });
  return t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]").replace(/\d/g, "#").slice(0, 3000);
}

/** The technical details a report carries when "Include technical details" is on. */
export async function snapshot() {
  const m = chrome.runtime.getManifest();
  const st = await chrome.storage.local.get(["checklists", "aiQueue", "aiKey", "syncAccount", "connScan", "errLog"]);
  const ua = navigator.userAgentData;
  const s = state.settings || {};
  let usage = null;
  if (st.aiKey) usage = await (await import("../lib/gemini.js")).usageToday().catch(() => null);
  return {
    version: m.version,
    browser: ua ? `${ua.brands?.filter((b) => !/not/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`).join(", ")} · ${ua.platform}${ua.mobile ? " (mobile)" : ""}` : navigator.userAgent.slice(0, 160),
    language: navigator.language,
    screen: { tab: state.tab, width: innerWidth, dark: matchMedia("(prefers-color-scheme: dark)").matches },
    canvas: s.canvasUrl ? (/instructure\.com/i.test(s.canvasUrl) ? "instructure.com address" : "school's own address") : "not connected",
    courses: visibleSnapshot()?.courses?.length || 0,
    ai: { provider: ai().id, gemini: !!st.aiKey, usage, pending: state.pending?.kind || state.pending?.expect || null, listRunning: !!state.queueRun, listLength: (st.aiQueue || []).length },
    studySets: Object.keys(st.checklists || {}).length,
    sync: !!st.syncAccount,
    connections: Object.fromEntries(["gradescope", "jupyter"].map((k) => [k, Object.values(st.connScan || {}).filter((x) => x?.[k]).length])),
    settings: safeSettings(s),
    errors: (await recentErrors()).slice(-20).map((e) => ({ where: e.where, msg: scrub(e.msg), stack: scrub(e.stack), at: new Date(e.at).toISOString() })),
    onScreen: screenText(),
  };
}

// A picture the student picks, made small (at most 1280 px wide, JPEG) so it sends quickly.
async function shrink(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / img.width, 1600 / img.height);
  const cv = new OffscreenCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
  cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
  const blob = await cv.convertToBlob({ type: "image/jpeg", quality: 0.72 });
  if (blob.size > 900e3) throw new Error("That picture is too big even after shrinking. Try a smaller screenshot.");
  return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
}

/** The "Report a problem" sheet. */
export function openReport({ kind = "bug", text = "" } = {}) {
  const dlg = $("#sheet");
  let picture = null, tech = true;
  const what = h("textarea", { rows: 5, placeholder: "What happened, and what did you expect? The more specific, the faster it gets fixed.", "aria-label": "What happened" });
  what.value = text;
  const kindSel = h("select", { "aria-label": "What it's about" }, KINDS.map(([v, l]) => h("option", { value: v, selected: v === kind }, l)));
  const email = h("input", { type: "email", placeholder: "Your email (only if you'd like a reply)", "aria-label": "Your email, optional", autocomplete: "email" });
  const preview = h("pre", { class: "rp-preview" });
  const shotName = h("span", { class: "meta" }, "");
  const fileIn = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { picture = await shrink(f); shotName.textContent = `${f.name} (attached)`; } catch (err) { picture = null; shotName.textContent = ""; toast(err.message, { error: true }); }
  } });
  const techBox = h("input", { type: "checkbox", checked: true, onchange: (e) => { tech = e.target.checked; } });
  const sendBtn = h("button", { class: "btn block" }, "Send");
  const body = () => ({ kind: kindSel.value, text: what.value.trim().slice(0, 5000), email: email.value.trim().slice(0, 200) || null });
  sendBtn.onclick = async () => {
    const b = body();
    if (b.text.length < 8) { toast("Say a little about what happened first.", { error: true }); what.focus(); return; }
    if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) { toast("That email doesn't look right (or leave it empty).", { error: true }); return; }
    sendBtn.disabled = true; sendBtn.textContent = "Sending…";
    try {
      const r = await post("report", { ...b, details: tech ? await snapshot() : null, picture, version: chrome.runtime.getManifest().version });
      dlg.close();
      toast(`Thanks! Your report was sent${r.id ? ` (reference ${r.id})` : ""}.${b.email ? " You'll get a reply by email." : ""}`, { ms: 8000 });
    } catch (e) { toast(e.message || "Couldn't send. Check your internet connection and try again.", { error: true }); sendBtn.disabled = false; sendBtn.textContent = "Send"; }
  };
  dlg.replaceChildren(h("div", { class: "sheet-in report-sheet" },
    h("div", { class: "sheet-head" }, h("div", { class: "grow" }, h("b", {}, "Report a problem or send an idea"), h("div", { class: "meta" }, "Goes to CampusPilot's developer.")),
      h("button", { class: "ghost", "aria-label": "Close", onclick: () => dlg.close() }, icon("close", 18))),
    h("label", { class: "field" }, "What it's about"), kindSel,
    h("label", { class: "field" }, "What happened"), what,
    h("div", { class: "row", style: "gap:8px;margin-top:8px" }, h("button", { class: "btn small soft", onclick: () => fileIn.click() }, "Attach a screenshot"), shotName, fileIn),
    h("label", { class: "rp-tech" }, techBox, h("span", {}, h("b", {}, "Include technical details"), h("small", { class: "muted" },
      "Recommended: it helps us find and fix the problem much faster. The CampusPilot version, your browser, which features are on, recent error messages, and the text of the screen you're on, with course names replaced by letters and every number hidden. Never your Canvas files or grades, passwords, keys or what you've written."))),
    h("details", { class: "rp-see", ontoggle: async (e) => { if (e.target.open) preview.textContent = JSON.stringify({ ...body(), details: tech ? await snapshot() : null, picture: picture ? "(your screenshot)" : null }, null, 2); } },
      h("summary", {}, "See exactly what's sent"), preview),
    email,
    h("div", { class: "su-foot" }, sendBtn, h("div", { class: "hint", style: "margin-top:6px" }, "Sent only when you press Send. See the privacy policy for how reports are kept."))));
  if (!dlg.open) dlg.showModal();
  setTimeout(() => what.focus(), 50);
}

// ---------- "Your courses also use…" ----------
/** Tools the student's courses link to that CampusPilot doesn't connect to yet (and not already sent or dismissed). */
export async function wantedTools() {
  const { connScan = {}, toolAsk = {} } = await chrome.storage.local.get(["connScan", "toolAsk"]);
  const ids = new Set((visibleSnapshot()?.courses || []).map((c) => String(c.id)));
  const count = new Map();
  for (const [id, r] of Object.entries(connScan)) if (ids.has(String(id))) for (const t of r?.tools || []) if (!t.supported) count.set(t.name, (count.get(t.name) || 0) + 1);
  return [...count].filter(([name]) => !toolAsk[name]).map(([name, courses]) => ({ name, courses }));
}
export async function toolsCard() {
  const tools = await wantedTools();
  if (!tools.length) return null;
  const names = tools.map((t) => t.name);
  const list = names.length <= 3 ? names.join(", ").replace(/, ([^,]*)$/, " and $1") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
  const mark = async (v) => { const { toolAsk = {} } = await chrome.storage.local.get("toolAsk"); for (const n of names) toolAsk[n] = v; await chrome.storage.local.set({ toolAsk }); };
  const card = h("div", { class: "card note-card tools-card" },
    h("b", {}, "Your courses also use " + list),
    h("p", { class: "muted", style: "margin:4px 0 8px" }, "CampusPilot can't connect to these yet. Want it to? Tell us, and the most-asked-for ones get built first. Only the names are sent (" + names.join(", ") + "), nothing about you or your courses."),
    h("div", { class: "actions" },
      h("button", { class: "btn small", onclick: async (e) => {
        e.currentTarget.disabled = true;
        try { await post("suggest", { tools: tools.map((t) => ({ name: t.name, courses: Math.min(t.courses, 9) })), version: chrome.runtime.getManifest().version }); await mark("sent"); card.remove(); toast("Thanks! Noted."); }
        catch (err) { e.currentTarget.disabled = false; toast(err.message, { error: true }); }
      } }, "Ask for these"),
      h("button", { class: "btn small soft", onclick: async () => { await mark("no"); card.remove(); } }, "No thanks")));
  return card;
}
export { send };
