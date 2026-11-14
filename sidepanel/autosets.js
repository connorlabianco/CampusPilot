// Study sets that make themselves: with Gemini set up and the student's OK (asked once, on Home), every Priority
// lecture in their courses gets its checklist and rounds of questions in the background, the most urgent first
// (queue.js › urgentFirst). Only Gemini's careful models are used for these; when today's are used up the list
// waits for tomorrow. Additional material is made only when the student picks it (Courses › ⋯ › Set up lectures…).
import { h, state, ai, plural, saveSettings, rerender, toast, visibleSnapshot, lecturesFor, courseName } from "./core.js";
import { lectureKind, lectureTier } from "../lib/lecturekind.js";

const PER_LECTURE = 6; // careful requests for one lecture: the checklist and about five rounds of questions

/** Priority lectures in the visible courses that aren't set up yet: [{ c, l }] */
export async function priorityTodo() {
  const snap = visibleSnapshot();
  const { checklists = {}, aiQueueSkip = [], aiKinds = {} } = await chrome.storage.local.get(["checklists", "aiQueueSkip", "aiKinds"]);
  const s = state.settings;
  const out = [], seen = new Set();
  for (const c of snap?.courses || []) {
    const list = await lecturesFor(c.id).catch(() => []);
    for (const l of list) {
      if (!["File", "Page", "Notebook"].includes(l.type) || checklists[l.key] || aiQueueSkip.includes(l.key) || seen.has(l.key)) continue;
      seen.add(l.key);
      if (lectureKind(l, s.lectureKindOverride || {}, s.moduleKindOverride || {}, aiKinds) !== "lecture") continue;
      if (lectureTier(l, s.lectureTierOverride || {}, aiKinds) !== "priority") continue;
      out.push({ c, l });
    }
  }
  return out;
}
async function perDay() {
  const { getKey, poolSizes, RESERVE } = await import("../lib/gemini.js");
  const rec = await getKey().catch(() => null);
  return Math.max(1, Math.floor(((rec ? poolSizes(rec).careful : 100) - RESERVE) / PER_LECTURE));
}
async function setupCount() {
  const { checklists = {} } = await chrome.storage.local.get("checklists");
  const ids = new Set((visibleSnapshot()?.courses || []).map((c) => String(c.id)));
  return Object.values(checklists).filter((r) => ids.has(String(r.courseId))).length;
}

/** Adds every Priority lecture that isn't set up to the list (marked as made by itself) and starts it. */
export async function queuePriority({ start = true } = {}) {
  if (!ai().direct || state.settings.autoSets !== true) return 0;
  const Q = await import("./queue.js");
  const todo = await priorityTodo();
  // newest first within a course (what the next homework needs); urgentFirst then orders courses by exams and plan
  todo.sort((a, b) => String(b.l.date || "").localeCompare(String(a.l.date || "")));
  let n = 0;
  for (const { c, l } of todo) if (await Q.addJob({ kind: "checklist", courseId: c.id, course: c.code || c.name, lecture: l, auto: true }, { quiet: true })) n++;
  const { autoPausedOn } = await chrome.storage.local.get("autoPausedOn");
  if (start && !state.queueRun && !state.pending && autoPausedOn !== new Date().toDateString()) Q.startQueue();
  return n;
}

/** Called when Home opens: sort the courses' items (cheap), then keep the list topped up. */
let lastRun = 0;
export async function keepGoing() {
  if (!ai().direct || Date.now() - lastRun < 10 * 60e3) return;
  lastRun = Date.now();
  const snap = visibleSnapshot();
  await (await import("./triage.js")).triageAll(snap?.courses || [], lecturesFor).catch(() => {});
  if (state.settings.autoSets === true) await queuePriority();
}

/** Home card: asks once; then shows how far along it is while lectures are still being made. */
export async function autoCard() {
  if (!ai().direct || state.settings.autoSets === false) return null;
  const todo = await priorityTodo();
  if (state.settings.autoSets !== true) {
    if (!todo.length) return null;
    const day = await perDay(), days = Math.ceil(todo.length / day);
    const courses = new Set(todo.map((x) => x.c.id)).size;
    return h("div", { class: "card note-card auto-card" },
      h("b", {}, "Get your lectures ready to study"),
      h("p", { class: "muted", style: "margin:4px 0 8px" },
        `${plural(todo.length, "core lecture")} in ${plural(courses, "course")} ${todo.length === 1 ? "isn't" : "aren't"} set up yet. Gemini can make their study sets in the background, most urgent first (nearest exam, then the newest lectures). `
        + (days <= 1 ? "They'd all be ready today." : `About ${day} a day on the free plan, so all of them in about ${days} days.`) + " Each one is ready to study as soon as it's done."),
      h("div", { class: "actions" },
        h("button", { class: "btn small", onclick: async () => { await saveSettings({ autoSets: true }); const n = await queuePriority(); toast(`Making ${plural(n, "study set")}. Progress is in the bar at the bottom.`, { ms: 6000 }); rerender(); } }, "Make them"),
        h("button", { class: "btn small soft", onclick: async () => { await saveSettings({ autoSets: false }); toast("OK. You can turn it on in Settings › Your AI, or set up lectures from each course."); rerender(); } }, "Not now")),
      h("div", { class: "hint", style: "margin-top:6px" }, "Extra and optional material isn't included; pick those yourself in each course (⋯ › Set up lectures…)."));
  }
  if (!todo.length) return null;
  const done = await setupCount();
  const { autoPausedOn } = await chrome.storage.local.get("autoPausedOn");
  const paused = autoPausedOn === new Date().toDateString();
  const cur = state.queueRun?.job;
  const now = cur?.auto ? `Now: ${cur.lecture?.title || "a lecture"}${cur.kind === "part" ? `, part ${cur.n}` : ""} (${courseName(cur.courseId)})` : null;
  return h("div", { class: "card auto-card" },
    h("div", { class: "row" }, h("div", { class: "grow" }, h("b", {}, "Making your study sets"),
      h("div", { class: "meta" }, `${done} ready · ${todo.length} to go${paused ? " · the rest start tomorrow (free requests come back at midnight Pacific)" : ""}`),
      now ? h("div", { class: "meta" }, now) : null),
      !paused && !state.queueRun ? h("button", { class: "btn small soft", onclick: () => queuePriority() }, "Continue") : null),
    h("div", { class: "meter wide", style: "margin-top:8px" }, h("i", { style: `width:${Math.round((done / (done + todo.length)) * 100)}%` })));
}

/** For a lecture's sheet: is its study set being made? → a short line, or null. */
export async function makingNote(key, rec) {
  const Q = await import("./queue.js");
  const list = await Q.getQueue();
  const cur = state.queueRun?.job;
  const mine = list.filter((j) => j.lecture?.key === key);
  if (cur?.lecture?.key === key) {
    if (cur.kind === "checklist") return "Gemini is reading this lecture and listing what to learn. Its first round of questions comes right after; this takes a few minutes.";
    if (cur.kind === "part") {
      const total = rec?.parts?.length || 0;
      return `Round ${cur.n}${total ? ` of ${total}` : ""} is being written now.${rec?.generated?.[1] && cur.n > 1 ? " You can start the rounds that are ready." : ""}`;
    }
  }
  if (!mine.length) return null;
  const order = await Q.urgentFirst(list).catch(() => list);
  const pos = order.findIndex((j) => j.lecture?.key === key) + 1;
  const { autoPausedOn } = await chrome.storage.local.get("autoPausedOn");
  if (autoPausedOn === new Date().toDateString() && mine.some((j) => j.auto)) return "This study set is next in line for tomorrow, when Gemini's free requests come back.";
  return rec ? `${plural(mine.filter((j) => j.kind === "part").length, "more round")} ${mine.length === 1 ? "is" : "are"} waiting their turn (${pos === 1 ? "next" : `#${pos} in line`}).`
    : `This study set is being made: ${pos === 1 ? "it's next" : `#${pos} in line`}. You can also set it up now with the button below.`;
}
