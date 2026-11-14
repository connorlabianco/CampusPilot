// CampusPilot side panel: Home · Courses · Study · Settings.
import { h, $, state, send, TABS, go, rerender, applyA11y, sync, lecturesFor, openCourse, toast, saveSettings } from "./core.js";
import { restorePending } from "./aiflow.js";
import { logError } from "../lib/errlog.js";
window.addEventListener("error", (e) => logError("panel", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => logError("panel", e.reason));
import { openSheet, lectureScope, moduleScope } from "./sheet.js";
import "./views/today.js";
import "./views/courses.js";
import "./views/practice.js";
import "./views/settings.js";
import { icon } from "../lib/icons.js";
import { initFocus, focusClick } from "./focus.js";
import { openSearch } from "./search.js";
import { enableCollapse } from "../lib/collapse.js";

// Worker mode: the pinned tab that finishes a Gemini list after the panel was closed (see background.js).
const WORKER = new URLSearchParams(location.search).has("worker");
state.worker = WORKER;
if (WORKER) document.documentElement.classList.add("worker");
// Tell the background this panel is open (so it doesn't start a worker tab), and keep it awake.
let port = null;
const connectPort = () => {
  if (WORKER) return;
  try { port = chrome.runtime.connect({ name: "panel" }); port.onDisconnect.addListener(() => { port = null; setTimeout(connectPort, 1000); }); } catch { /* reloaded */ }
};
connectPort();
setInterval(() => { try { port?.postMessage({ beat: Date.now() }); } catch { /* reconnects */ } }, 20e3);

enableCollapse(document.body, { scope: "panel", onOpen: (card) => import("./core.js").then((m) => m.revealSoon(() => card)) });

TABS.forEach((t, i) => {
  const tab = $(`#tab-${t}`);
  tab.onclick = () => go(t, t === "courses" && state.tab === "courses" ? { course: null } : {});
  tab.onkeydown = (e) => {
    if (e.key === "ArrowRight") { go(TABS[(i + 1) % TABS.length]); $(`#tab-${state.tab}`).focus(); }
    if (e.key === "ArrowLeft") { go(TABS[(i + TABS.length - 1) % TABS.length]); $(`#tab-${state.tab}`).focus(); }
  };
});
initFocus();
$("#focusBtn").onclick = () => focusClick();
$("#searchBtn").onclick = () => openSearch();
// "?": shows or hides the explanations under things (on for new students; experienced ones turn it off).
$("#helpBtn").onclick = async () => { await saveSettings({ showHelp: state.settings.showHelp === false }); };
$("#sheet").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
// After practice, sync soon (signed-in only); after a sync, show fresh data.
let syncSoon = null;
const syncAfter = (ms) => { clearTimeout(syncSoon); syncSoon = setTimeout(async () => {
  if (!state.sync?.account) return;
  try { await send("SYNC_NOW"); state.sync = await send("SYNC_STATUS"); state.bank = null; if ($("#runner").hidden) rerender(); } catch { /* offline: next time */ }
}, ms); };
state.onRunnerClose = () => { rerender(); syncAfter(3000); };

function showProgress(p) {
  const box = $("#progress");
  if (!p) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  const pct = p.total ? Math.round((p.done / p.total) * 100) : null;
  box.classList.toggle("indeterminate", pct == null);
  box.querySelector(".fill").style.width = pct == null ? "" : `${Math.max(6, pct)}%`;
  box.querySelector(".label").textContent = p.label + (p.total ? ` · ${p.done}/${p.total}` : "");
}
chrome.storage.session.onChanged.addListener((ch) => {
  if (ch.progress) showProgress(ch.progress.newValue);
  if (ch.queuedLecture?.newValue) handleQueued(ch.queuedLecture.newValue);
});
// Gradescope allowed from anywhere (Home, Settings, a course's Files): refresh and check right away.
chrome.permissions.onAdded?.addListener((p) => {
  if ((p.origins || []).some((o) => /gradescope\.com/.test(o))) import("./core.js").then((m) => m.refreshAfterConnect("gradescope"));
});
chrome.storage.local.onChanged.addListener((ch) => {
  if (ch.snapshot) { state.snapshot = ch.snapshot.newValue; if (state.tab === "today" && $("#runner").hidden) rerender(); }
});

// "Practice" buttons on Canvas lecture pages and module headers open the action sheet here.
let lastQueued = 0;
async function handleQueued(q) {
  if (q.at === lastQueued) return;
  lastQueued = q.at;
  await chrome.storage.session.remove("queuedLecture");
  if (Date.now() - q.at > 60e3) return;
  // From the My week page: find class times with the student's AI.
  if (q.action === "classTimes") {
    try { await (await import("./queue.js")).aiAction({ kind: "classTimes", courseIds: q.courseIds }); } catch (e) { toast(e.message, { error: true, ms: 8000 }); }
    return;
  }
  openCourse(q.courseId, "lectures");
  try {
    const all = await lecturesFor(q.courseId).catch(() => []);
    if (q.lecture) {
      const key = `${q.courseId}:${q.lecture.type}:${q.lecture.page_url || q.lecture.file_id}`;
      const found = all.find((l) => l.key === key || (q.lecture.type === "File" ? l.file_id === q.lecture.file_id : l.page_url === q.lecture.page_url));
      await openSheet(lectureScope(q.courseId, found || { ...q.lecture, key }));
    } else if (q.module) {
      const items = all.filter((l) => l.module.trim() === q.module.trim());
      if (!items.length) throw new Error("This module has no lecture pages or slides CampusPilot can read.");
      await openSheet(moduleScope(q.courseId, q.module, items));
    }
  } catch (e) { toast(e.message, { error: true, ms: 8000 }); }
}

document.querySelectorAll("[data-icon]").forEach((el) => el.replaceChildren(icon(el.dataset.icon, el.classList.contains("logo") ? 18 : 20)));

(async () => {
  state.settings = await send("GET_SETTINGS");
  applyA11y();
  ({ snapshot: state.snapshot = null } = await chrome.storage.local.get("snapshot"));
  state.gcal = await send("GCAL_STATUS").catch(() => ({ connected: false }));
  await restorePending();
  await import("./queue.js").then((q) => q.restoreRun()).catch(() => {});
  state.sync = await send("SYNC_STATUS").catch(() => ({}));
  go("today");
  if (WORKER) return startWorker();
  syncAfter(500);
  // Look for exam dates in courses not checked recently (quietly; Today updates when done).
  // New lectures in courses where the student uses lecture mastery join the AI list (checked a few times a day).
  if (state.snapshot) setTimeout(() => import("./queue.js").then((q) => q.checkNewLectures()).catch(() => {}), 4000);
  // A plan that's a week old, or missing new assignments, gets a fresh look from the AI (put in the AI list).
  if (state.snapshot) setTimeout(() => import("./plan.js").then((m) => m.checkPlan()).catch(() => {}), 6000);
  if (state.snapshot) send("EXAMS_STALE").then((r) => { if (r?.checked && state.tab === "today" && $("#runner").hidden) rerender(); }).catch(() => {});
  const { queuedLecture, progress } = await chrome.storage.session.get(["queuedLecture", "progress"]);
  if (progress) showProgress(progress);
  if (queuedLecture) handleQueued(queuedLecture);
})();

// CampusPilot was reloaded (an update, or reloaded on chrome://extensions) while this panel stayed open: the old panel
// can't open tabs or show its own pages any more (buttons do nothing, the What-If calculator shows a broken page).
// Load the new version in place as soon as that happens.
{
  const orphaned = () => { try { return !chrome.runtime?.id; } catch { return true; } };
  const recover = () => { if (orphaned()) location.reload(); };
  setInterval(recover, 2000);
  document.addEventListener("visibilitychange", recover);
  window.addEventListener("focus", recover);
  document.addEventListener("pointerdown", recover, true);
}

// ---------- worker mode ----------
// Shows what's being done (the progress bar) and why the tab is open; closes itself when the list is finished, or
// when what's left needs the student (a request for their own AI's website).
function startWorker() {
  const info = h("div", { class: "card worker-info" },
    h("b", {}, "CampusPilot is finishing your list"),
    h("p", { class: "muted" }, "You closed CampusPilot while Gemini was still setting things up, so it carries on here. You can keep browsing; this tab closes by itself when it's done. Opening CampusPilot takes over from here."),
    h("button", { class: "btn small soft", onclick: async () => { (await import("./queue.js")).stopQueue(); (await import("./aiflow.js")).cancelPending(); closeSelf(); } }, "Stop and close"));
  $("#banner").before(info);
  const closeSelf = async () => { const t = await chrome.tabs.getCurrent().catch(() => null); if (t) chrome.tabs.remove(t.id); else window.close(); };
  let idle = 0;
  setInterval(() => {
    const p = state.pending, run = state.queueRun;
    const label = $("#wait-progress .wait-label")?.textContent || "";
    document.title = p ? `CampusPilot · ${run && run.total > 1 ? `Step ${run.done + 1} of ${run.total} · ` : ""}${label}` : "CampusPilot";
    if (p && !p.direct) return closeSelf(); // needs the student's own AI: nothing to do here
    idle = !p && !run ? idle + 1 : 0;
    if (idle >= 4) closeSelf(); // finished (or nothing to do) for a few seconds
  }, 1500);
}
