// Shared helpers and state for the side panel.
import { download } from "../lib/dl.js";
import { DEFAULT_LOOK, FONTS } from "../lib/look.js";
import { icon } from "../lib/icons.js";
import { providerOf, PROVIDERS } from "../lib/ai.js";

export const $ = (s) => document.querySelector(s);
export const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const DAY = 864e5;

export function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith("aria-")) { n.setAttribute(k, String(v)); continue; }
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  kids.flat(Infinity).forEach((k) => k != null && k !== false && n.append(k));
  return n;
}

export function send(type, payload) {
  return chrome.runtime.sendMessage({ type, payload }).then((r) => {
    if (!r?.ok) throw new Error(r?.error || "Something went wrong");
    return r.data;
  });
}

let toastTimer;
export function toast(text, { error = false, ms = 5000, action = null } = {}) {
  if (error) import("../lib/errlog.js").then((m) => m.logError("panel:message", text)).catch(() => {});
  // Every error message offers to report it (prefilled), unless it already has its own button.
  if (error && !action && !state.worker) action = { label: "Report", run: () => import("./report.js").then((m) => m.openReport({ kind: "bug", text: `CampusPilot said: "${text}"\n\nWhat I was doing: ` })) };
  const t = $("#toast");
  // Shown in the top layer, above any open sheet or dialog (re-shown so it's above the newest one).
  try { if (t.popover) { if (t.matches(":popover-open")) t.hidePopover(); t.showPopover(); } } catch { /* older Chrome: under dialogs */ }
  t.textContent = text; t.classList.toggle("error", error); t.classList.add("show");
  if (action) t.append(" ", h("button", { class: "toast-act", onclick: async () => { t.classList.remove("show"); await action.run(); } }, action.label));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

export async function busy(btn, label, fn) {
  const old = [...btn.childNodes]; btn.disabled = true; btn.textContent = label;
  try { return await fn(); }
  catch (e) { toast(e.message, { error: true, ms: 8000 }); }
  finally { btn.disabled = false; btn.replaceChildren(...old); }
}

// A button that runs an async action with a busy label and error toast.
export const act = (label, fn, { cls = "btn", ico = null, busyLabel = "Working…", attrs = {} } = {}) =>
  h("button", { class: cls, ...attrs, onclick: (e) => busy(e.currentTarget, busyLabel, fn) }, ico ? icon(ico, 16) : null, label);

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return; } catch { /* activation expired */ }
  const ta = h("textarea", { style: "position:fixed;opacity:0" }); ta.value = text;
  document.body.append(ta); ta.select();
  const ok = document.execCommand("copy"); ta.remove();
  if (!ok) throw new Error("Couldn't copy. Use Download instead.");
}

// Single files go into Downloads › CampusPilot, never loose in Downloads.
export async function downloadText(name, text, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const id = await download(url, `CampusPilot/${name}`, { conflictAction: "uniquify" });
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return id;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const fmtBytes = (b) => b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
export const shortDate = (iso) => iso ? new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" }) : "";
export const plural = (n, w, p = w + "s") => `${n} ${n === 1 ? w : p}`;
export const safeFile = (n) => {
  let s = String(n).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "").slice(0, 120);
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s)) s = "_" + s;
  return s || "file";
};

export function relDue(iso, a) {
  const d = new Date(iso), diff = d - Date.now();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diff < 0 && a?.gs === "open") return { text: "Not turned in", tone: "late", title: `Gradescope shows nothing turned in yet (checked ${new Date(a.gsAt || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}).` };
  if (diff < 0 && a?.kind === "tool") { const tool = String(a.kind_label || "").replace(/^submitted on /, "") || "the outside site"; return { text: "Past due", tone: "maybe", title: /gradescope/i.test(tool) ? "Canvas doesn't see work turned in on Gradescope until it's graded. With Gradescope on in Settings › Connections, CampusPilot checks Gradescope itself." : `Turned in on ${tool}? Canvas can't see it until it's graded. Mark it done once you have.` }; }
  if (diff < 0 && a?.kind === "offline") return { text: "Past due", tone: "maybe", title: "Handed in on paper or elsewhere, so Canvas can't tell whether it's done." };
  if (diff < 0) return { text: "Overdue", tone: "late" };
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const days = Math.floor((d - start) / DAY);
  if (days === 0) return { text: `Today ${time}`, tone: diff < 3 * 3600e3 ? "now" : "soon" };
  if (days === 1) return { text: `Tomorrow ${time}`, tone: "soon" };
  if (days < 7) return { text: `${d.toLocaleDateString([], { weekday: "short" })} ${time}`, tone: "week" };
  return { text: d.toLocaleDateString([], { month: "short", day: "numeric" }), tone: "" };
}

// ---------- state ----------
export const state = {
  settings: {}, snapshot: null, gcal: { connected: false },
  tab: "today", course: null, courseSub: "lectures",
  lectureCache: {}, lectureFilter: "new", libraryStats: null,
  pending: null, imported: null, handoff: null, attachOffer: null,
  bank: null, // all questions (loaded lazily)
  jup: {}, // per hub: { status, scan, links }
};

// ---------- small building blocks ----------
export const card = (title, ...kids) => h("div", { class: "card" }, title ? h("h3", {}, title) : null, ...kids);
export const empty = (ico, text, ...kids) => h("div", { class: "card empty" }, h("span", { class: "big" }, icon(ico, 28)), text, ...kids);
export const seg = (options, current, onPick, label) => h("div", { class: "seg", role: "group", "aria-label": label },
  options.map(([v, l]) => h("button", { "aria-pressed": current === v, onclick: () => onPick(v) }, l)));
export function toggle(title, sub, checked, onChange) {
  return h("label", { class: "switch" }, h("span", {}, h("b", {}, title), sub ? h("small", {}, sub) : null),
    h("input", { type: "checkbox", role: "switch", checked: !!checked, onchange: (e) => onChange(e.target.checked, e) }));
}
// state.aiOverride: one request sent to a website other than the usual one (Gemini's site when the key can't be used).
export const ai = () => (state.aiOverride && PROVIDERS[state.aiOverride] ? { id: state.aiOverride, ...PROVIDERS[state.aiOverride] } : providerOf(state.settings));

// ---------- views & navigation ----------
export const views = {};
export const TABS = ["today", "courses", "practice", "settings"];

export function go(tab, extra = {}) {
  Object.assign(state, extra);
  state.tab = tab;
  TABS.forEach((t) => {
    const b = $(`#tab-${t}`), on = t === tab;
    b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1;
    $(`#${t}`).hidden = !on;
  });
  rerender();
  window.scrollTo(0, 0);
}
export function rerender() {
  views.banner?.();
  const root = $(`#${state.tab}`);
  Promise.resolve(views[state.tab]?.(root)).catch((e) => toast(e.message, { error: true }));
}
// ---------- bringing what was just opened into view ----------
// Like a chat jumping to the newest reply: when something expands, scroll just enough to show it, as much as fits,
// never past its title. Works in the panel and inside sheets.
function scrollBox(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return document.scrollingElement;
}
export function reveal(el, { pad = 12 } = {}) {
  if (!el?.isConnected || !el.getClientRects().length) return;
  const box = scrollBox(el);
  const whole = box === document.scrollingElement;
  const area = whole ? { top: 0, bottom: innerHeight } : box.getBoundingClientRect();
  // sticky things at the top of that area (the tabs, a course's sub-tabs, a sheet's title bar) cover part of it
  let cover = area.top;
  // (where they'll sit once the page has scrolled: their sticky offset plus their height)
  for (const s of (whole ? document : box).querySelectorAll(whole ? ".tabs, .subtabs" : ".sheet-head")) {
    const r = s.getBoundingClientRect(), cs = getComputedStyle(s);
    if (r.height && cs.position === "sticky") cover = Math.max(cover, area.top + (parseFloat(cs.top) || 0) + r.height);
  }
  const top = cover + pad, bottom = area.bottom - pad;
  const r = el.getBoundingClientRect();
  let dy = 0;
  if (r.top < top) dy = r.top - top;
  else if (r.bottom > bottom) dy = Math.min(r.bottom - bottom, r.top - top);
  if (Math.abs(dy) < 2) return;
  const calm = document.documentElement.classList.contains("reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;
  (whole ? window : box).scrollBy({ top: dy, behavior: calm ? "auto" : "smooth" });
}
/** Waits for something that's about to appear (after a redraw), lets it settle, then brings it into view. */
export function revealSoon(find, { timeout = 2000 } = {}) {
  const start = performance.now();
  let last = -1, still = 0;
  const tick = () => {
    const el = typeof find === "function" ? find() : document.querySelector(find);
    if (el?.isConnected) {
      const hgt = el.getBoundingClientRect().height;
      still = Math.abs(hgt - last) < 1 ? still + 1 : 0; last = hgt;
      if (still >= 3 || performance.now() - start > timeout) return reveal(el);
    } else if (performance.now() - start > timeout) return;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
// Any <details> the student opens (Settings groups, "Advanced", folder lists…). Only their own click or key counts:
// a redraw that recreates an already-open one must not move the page.
let summaryAt = 0;
// (A "⋯" menu is a <details> too, but opening one never needs scrolling.)
for (const ev of ["click", "keydown"]) document.addEventListener(ev, (e) => { const s = e.target.closest?.("summary"); if (s && !s.closest(".menu")) summaryAt = performance.now(); }, true);
document.addEventListener("toggle", (e) => {
  if (e.target.tagName === "DETAILS" && e.target.open && performance.now() - summaryAt < 600) revealSoon(() => e.target);
}, true);

export const openCourse = (id, sub = "lectures") => go("courses", { course: id, courseSub: sub });

// ---------- settings / look ----------
export function currentLook() {
  const s = state.settings;
  const look = { ...DEFAULT_LOOK, ...(s.look || {}) };
  if (!s.look && s.darkMode) look.theme = "dark";
  return look;
}
export function applyA11y() {
  const s = state.settings, root = document.documentElement;
  const look = currentLook();
  root.dataset.look = look.theme;
  if (look.accent) root.style.setProperty("--accent", look.accent); else root.style.removeProperty("--accent");
  const f = FONTS[look.font]?.css;
  if (f && !s.readableFont) root.style.setProperty("--font", f); else root.style.removeProperty("--font");
  root.classList.toggle("size-large", s.textSize === "large");
  root.classList.toggle("size-xl", s.textSize === "xl");
  root.classList.toggle("readable", !!s.readableFont);
  root.classList.toggle("contrast", !!s.highContrast);
  root.classList.toggle("reduce-motion", !!s.reduceMotion);
  // The "?" button: explanations shown (blue) or hidden (gray)
  root.classList.toggle("no-help", s.showHelp === false);
  document.getElementById("helpBtn")?.setAttribute("aria-pressed", String(s.showHelp !== false));
}
export const panelIsDark = () => {
  const t = document.documentElement.dataset.look;
  if (["dark", "midnight", "dim", "liquid-dark"].includes(t)) return true;
  if (["paper", "liquid"].includes(t)) return false;
  return matchMedia("(prefers-color-scheme: dark)").matches;
};

export async function saveSettings(patch, quiet = true) {
  state.settings = await send("SAVE_SETTINGS", patch);
  applyA11y();
  if (!quiet) toast("Saved", { ms: 1500 });
}

// ---------- Canvas data ----------
export async function sync(btn) {
  const b = btn || $("#syncBtn"); // (the top bar's refresh button is gone; Home's "Refresh" passes its own)
  b?.classList.add("spinning");
  try { state.snapshot = await send("SYNC"); state.lectureCache = {}; toast("Canvas is up to date", { ms: 2000 }); }
  catch (e) { toast(e.message, { error: true, ms: 8000 }); }
  finally { b?.classList.remove("spinning"); }
  rerender();
}

// Right after a connection is turned on (Gradescope allowed, or a course ticked in Settings): refresh Canvas, then
// check what's turned in on Gradescope (following each course's Gradescope link in Canvas once, so courses whose
// names don't match are found too), and redraw. Turned-in work leaves the list without a manual refresh.
let connecting = null;
export function refreshAfterConnect(kind = "gradescope") {
  if (connecting) return connecting;
  connecting = (async () => {
    toast(kind === "jupyter" ? "Connected. Reading the course's notebooks…" : "Connected. Checking what you've turned in on Gradescope…", { ms: 15000 });
    try {
      state.snapshot = (await send("SYNC").catch(() => null)) || state.snapshot;
      state.lectureCache = {}; state.gsCache = {};
      if (kind === "gradescope") {
        const snap = await send("GS_RECHECK", { force: true, linkFromCanvas: true }).catch(() => null);
        if (snap?.courses) state.snapshot = snap;
        const r = snap?.gsLastCheck;
        const done = (r?.courses || []).reduce((a, c) => a + (c.turnedIn || 0), 0);
        toast(r?.state === "login" ? "Log in to Gradescope once, then CampusPilot can see what you've turned in." : r?.state === "ok" ? `Gradescope checked: ${done} turned-in item${done === 1 ? "" : "s"} found. Your list is up to date.` : "Connected. Your list is up to date.", { ms: 7000 });
      } else toast("Connected. Your courses are up to date.", { ms: 5000 });
    } finally { connecting = null; rerender(); }
  })();
  return connecting;
}

// Courses the student hid (clubs, trainings, advising pages) stay out of everything.
// "Mark done" button for a to-do row (Undo in the toast).
export function doneButton(a, courseId = a.course_id) {
  return h("button", { class: "ghost done-btn", "aria-label": `Mark “${a.name}” done`, title: "Mark done (hides it from your to-do list)",
    onclick: async (e) => {
      e.currentTarget.disabled = true;
      await send("MARK_DONE", { courseId, assignmentId: a.id, done: true });
      toast(`Marked “${a.name}” done.`, { ms: 7000, action: { label: "Undo", run: () => send("MARK_DONE", { courseId, assignmentId: a.id, done: false }) } });
    } }, icon("check", 16));
}

export function visibleSnapshot() {
  const hidden = new Set(state.settings.hiddenCourses || []);
  return state.snapshot ? { ...state.snapshot, courses: state.snapshot.courses.filter((c) => !hidden.has(c.id)) } : null;
}
export const courseById = (id) => state.snapshot?.courses.find((c) => c.id === id);
export const courseName = (id) => { const c = courseById(id); return c ? (c.code || c.name) : "Course"; };
export function courseColor(id) {
  const own = state.settings.look?.courseColors?.[id];
  return (own && own !== "none" ? own : null) || state.snapshot?.colors?.[id] || "#8a8a8a";
}

export async function lecturesFor(courseId, { fresh = false } = {}) {
  if (!fresh && state.lectureCache[courseId]) return state.lectureCache[courseId];
  return (state.lectureCache[courseId] = await send("LECTURES", { courseId }));
}

// Canvas often serves file contents from a separate storage host; reading (not just downloading) needs access to it.
export async function askFileHostAccess() {
  const origins = ["https://*.amazonaws.com/*", "https://*.instructure-uploads.com/*", "https://*.inscloudgate.net/*"];
  if (await chrome.permissions.contains({ origins }).catch(() => false)) return true;
  return chrome.permissions.request({ origins }).catch(() => false);
}


// ---------- Video speed (applies to lecture videos on Canvas and your video site) ----------
export function speedControl({ compact = false } = {}) {
  const MIN = 0.25, MAX = 16;
  const stepAt = (r) => (r < 2 ? 0.1 : r < 4 ? 0.25 : r < 8 ? 0.5 : 1);
  const toPos = (r) => Math.log(r / MIN) / Math.log(MAX / MIN), fromPos = (x) => MIN * Math.pow(MAX / MIN, x);
  const snap = (r) => (r < 2 ? Math.round(r * 20) / 20 : r < 4 ? Math.round(r * 4) / 4 : Math.round(r * 2) / 2);
  const clamp = (r) => Math.round(Math.min(MAX, Math.max(MIN, Number(r) || 1)) * 100) / 100;
  // One slider (fine steps at normal speeds, coarser up to 16x), the value beside it, and Reset. Arrow keys nudge it.
  const sl = h("input", { type: "range", min: 0, max: 1, step: 0.001, "aria-label": "Video speed", class: "grow" });
  const val = h("output", { class: "speed-val", "aria-live": "polite" });
  const reset = h("button", { class: "btn small soft", title: "Back to normal speed" }, "Reset");
  let rate = 1;
  const show = (r) => { rate = r; sl.value = toPos(r); sl.setAttribute("aria-valuetext", `${r}×`); val.textContent = `${r}×`; reset.disabled = r === 1; };
  const set = (r) => { show(clamp(r)); chrome.storage.local.set({ videoSpeed: rate }); };
  chrome.storage.local.get("videoSpeed").then(({ videoSpeed }) => show(clamp(videoSpeed || 1)));
  sl.oninput = (e) => set(snap(fromPos(Number(e.target.value))));
  sl.onkeydown = (e) => {
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!d) return;
    e.preventDefault(); set(d > 0 ? rate + stepAt(rate) + 1e-9 : rate - stepAt(rate - 1e-9));
  };
  reset.onclick = () => set(1);
  return h("div", { class: "speed" + (compact ? " compact" : "") },
    compact ? h("span", { class: "speed-label" }, "Speed") : null,
    sl, val, reset);
}

// Big downloads (over 200 MB) ask first and say how big they are.
export const BIG_DOWNLOAD = 200e6;
export function confirmSize(bytes, what = "This download", extra = "") {
  if (!(bytes > BIG_DOWNLOAD)) return true;
  return confirm(`${what} is about ${fmtBytes(bytes)}.${extra ? " " + extra : ""} Download it?`);
}
