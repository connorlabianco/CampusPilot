// Study: the lectures you're learning, today's review, quizzes, progress and weak spots across every course.
import { h, state, views, send, act, plural, visibleSnapshot, courseName, courseColor, empty, seg, toggle, toast, rerender, openCourse, shortDate, lecturesFor } from "../core.js";
import { lectureMastery } from "../../lib/checklist.js";
import { icon } from "../../lib/icons.js";
import { handToAI } from "../aiflow.js";
import { importReply } from "../aiflow.js";
import { bank, scopeStats, quizRow } from "../sheet.js";
import { startSession } from "../runner.js";
import { buildSession, isDue, isMistake, weakTopics, accuracy, allSessions, mastery, allQuizzes } from "../../lib/quiz.js";


// Study: one thing to continue, what's due for review, and your lectures. Nothing else.
views.practice = async (root) => {
  root.replaceChildren();
  const snap = visibleSnapshot();
  const visible = new Set((snap?.courses || []).map((c) => c.id));
  const all = (await bank()).filter((q) => !snap || visible.has(q.courseId));
  root.append(h("div", { class: "page-head" }, h("h2", { class: "page-title" }, "Study")));

  const sets = await startedLectures(snap);
  const openSet = async (x) => {
    const list = await lecturesFor(x.r.courseId).catch(() => []);
    const l = list.find((y) => y.key === x.key) || { ...x.r.lecture, key: x.key };
    const { openSheet, lectureScope } = await import("../sheet.js");
    openSheet(lectureScope(x.r.courseId, l));
  };
  // 1. Continue where you left off (or how to start)
  const going = sets.filter((x) => x.m.mastered < x.m.total);
  if (going.length) {
    const x = going[0];
    root.append(h("div", { class: "card hero cont" },
      h("small", { class: "muted" }, "Continue"),
      h("b", { class: "cont-title" }, x.r.lecture?.title || "Lecture"),
      h("div", { class: "meta" }, `${courseName(x.r.courseId)} · ${x.m.mastered} of ${x.m.total} learned`),
      h("div", { class: "set-bar" }, h("i", { class: "done", style: `width:${(x.m.mastered / x.m.total) * 100}%` }), h("i", { class: "going", style: `width:${((x.m.learning + x.m.review) / x.m.total) * 100}%` })),
      h("button", { class: "btn block", onclick: () => openSet(x) }, "Keep learning")));
  } else {
    root.append(h("div", { class: "card hero cont" },
      h("b", { class: "cont-title" }, sets.length ? "Everything you started is learned" : "Start with a lecture"),
      h("p", { class: "muted", style: "margin:4px 0 10px" }, sets.length ? "Pick your next lecture to keep going." : "Pick a lecture, press Set up, and your AI lists what to learn. Then you get Learn, Flashcards and Test."),
      h("button", { class: "btn block", onclick: () => openCourse(null) }, "Pick a lecture")));
  }

  // 2. Review: questions you've seen, back when they're due
  const due = all.filter((q) => q.seen && isDue(q));
  const mistakes = all.filter(isMistake).length;
  const upcoming = all.filter((q) => q.seen && !isDue(q)).sort((a, b) => a.due - b.due)[0];
  const when = (t) => { const d = Math.round((t - Date.now()) / 864e5); return d <= 0 ? "later today" : d === 1 ? "tomorrow" : `in ${d} days`; };
  if (due.length || mistakes || upcoming) root.append(h("div", { class: "card review-card" },
    h("div", { class: "row" }, h("div", { class: "grow" }, h("b", {}, due.length ? `Review · ${due.length} due` : "Review"),
      h("div", { class: "meta" }, due.length ? `About ${Math.max(1, Math.round(Math.min(due.length, 20) * 0.6))} minutes. Questions come back right before you'd forget them.` : upcoming ? `Nothing due. Next review ${when(upcoming.due)}.` : "Nothing due.")),
      due.length ? h("button", { class: "btn small", onclick: () => startSession(buildSession(due, { mode: "review", count: 20 }), { mode: "review", title: "Review" }) }, "Start") : null),
    mistakes ? h("button", { class: "linkish", style: "margin-top:6px", title: "Questions you missed, until you get each right twice in a row", onclick: () => startSession(buildSession(all, { mode: "mistakes", count: 20 }), { mode: "practice", title: "My mistakes" }) }, `Practice the ${plural(mistakes, "question")} you missed`) : null));

  // 3. Your lectures (study sets), most recent first, and the next one to start
  const next = await nextLecture(sets, snap);
  if (sets.length > (going.length ? 1 : 0) || next) root.append(h("div", { class: "card" }, h("h3", {}, "Your lectures"),
    next ? h("div", { class: "next-lec" }, h("span", { class: "grow" }, h("small", {}, "Next up"), h("b", {}, next.l.title), h("small", {}, courseName(next.courseId))),
      h("button", { class: "btn small soft", onclick: async () => { const { openSheet, lectureScope } = await import("../sheet.js"); openSheet(lectureScope(next.courseId, next.l)); } }, "Start")) : null,
    sets.filter((x) => x !== going[0]).map((x) => h("button", { class: "progress-row", onclick: () => openSet(x) },
      h("span", { class: "dot", style: `background:${courseColor(x.r.courseId)}` }),
      h("span", { class: "grow" }, h("b", {}, x.r.lecture?.title || "Lecture"), h("small", {}, `${courseName(x.r.courseId)} · ${x.m.mastered === x.m.total ? "Learned" : `${x.m.mastered} of ${x.m.total} learned`}`)),
      h("span", { class: "meter wide", title: "Learned" }, h("i", { style: `width:${Math.round((x.m.mastered / x.m.total) * 100)}%` })),
      icon("chevron", 16))),
    h("button", { class: "linkish", style: "margin-top:8px", onclick: () => openCourse(null) }, "All courses and lectures")));

  // 3b. A test mixed from several lectures (also where an exam's "Quiz me" lands)
  if (all.some((q) => q.type !== "card")) {
    if (state.cqOpen) {
      const cq = await (await import("../coursequiz.js")).courseQuizCard(all, snap);
      if (cq) { cq.querySelector("h3").after(h("button", { class: "linkish cq-close", onclick: () => { state.cqOpen = false; rerender(); } }, "Close")); root.append(cq); }
    } else root.append(h("div", { class: "card mixed-card" }, h("div", { class: "row" },
      h("div", { class: "grow" }, h("b", {}, "Mixed test"), h("div", { class: "meta" }, "One test from several lectures, like before a midterm.")),
      h("button", { class: "btn small soft", onclick: () => { state.cqOpen = true; rerender(); } }, "Set up"))));
  }

  // 4. Quizzes you've made (from exams' "Quiz me", modules, or older practice)
  const quizzes = (await allQuizzes().catch(() => [])).filter((z) => !snap || visible.has(z.courseId)).sort((a, b) => b.createdAt - a.createdAt);
  if (quizzes.length) {
    state.quizShow ??= 4;
    root.append(h("div", { class: "card" }, h("h3", {}, "Your quizzes"),
      h("div", { class: "quiz-list" }, quizzes.slice(0, state.quizShow).map((z) => quizRow(z, { showScope: true }))),
      quizzes.length > state.quizShow ? h("button", { class: "btn small soft block", style: "margin-top:6px", onclick: () => { state.quizShow += 10; rerender(); } }, `Show more (${quizzes.length - state.quizShow})`) : null));
  }
};

// Every lecture that's been set up, most recently studied first.
// "Study now": about 10 minutes, picked for you. Due reviews first, then the next round of the lecture you're learning.
export async function studyNow() {
  const snap = visibleSnapshot();
  const visible = new Set((snap?.courses || []).map((c) => c.id));
  const all = (await bank()).filter((q) => !snap || visible.has(q.courseId));
  const due = all.filter((q) => q.seen && isDue(q));
  const going = (await startedLectures(snap)).filter((x) => x.m.mastered < x.m.total);
  const learn = async () => {
    const x = going[0];
    if (!x) return toast("You're caught up: nothing due and nothing half-learned. Pick a new lecture in Study.", { ms: 6000 });
    const list = await lecturesFor(x.r.courseId).catch(() => []);
    const l = list.find((y) => y.key === x.key) || { ...x.r.lecture, key: x.key };
    const { lectureScope, openSheet } = await import("../sheet.js");
    const scope = lectureScope(x.r.courseId, l);
    const { itemLevel } = await import("../../lib/checklist.js");
    const { ruleFor, startPart } = await import("../mastery.js");
    const { itemStats = {} } = await chrome.storage.local.get("itemStats");
    const st = itemStats[x.key] || {}, rule = ruleFor(x.r.courseId);
    const made = new Set(all.filter((q) => q.v === 2 && q.lectureKey === x.key).map((q) => q.part));
    const part = x.r.parts?.find((p) => made.has(p.n) && p.items.some((id) => itemLevel(st[id], rule) !== "mastered"));
    return part ? startPart(scope, part.n) : openSheet(scope);
  };
  if (!due.length) return learn();
  const count = Math.min(15, due.length);
  await startSession(buildSession(due, { mode: "review", count }), { mode: "review", title: "Study now · review",
    onDone: () => { if (going.length) toast(`Review done. Next: ${going[0].r.lecture?.title || "your lecture"}.`, { ms: 9000, action: { label: "Keep going", run: learn } }); } });
}

async function startedLectures(snap) {
  const { checklists = {}, itemStats = {} } = await chrome.storage.local.get(["checklists", "itemStats"]);
  const courses = new Set((snap?.courses || []).map((c) => String(c.id)));
  const rule = (id) => (state.settings.masteryLevel || {})[id] || "solid";
  return Object.entries(checklists).filter(([, r]) => courses.has(String(r.courseId)) && r.cl).map(([key, r]) => {
    const m = lectureMastery(r.cl, itemStats[key] || {}, rule(r.courseId));
    const last = Math.max(r.at || 0, ...Object.values(itemStats[key] || {}).flat().map((x) => x.at || 0));
    return { key, r, m, last };
  }).filter((x) => x.m.total).sort((a, b) => b.last - a.last).slice(0, 12);
}
// The next lecture to start: the newest one not set up yet, in the course studied most recently (or the first course).
async function nextLecture(sets, snap) {
  const courseId = sets[0]?.r.courseId ?? snap?.courses?.[0]?.id;
  if (courseId == null) return null;
  const { checklists = {} } = await chrome.storage.local.get("checklists");
  const { lectureKind, lectureTier } = await import("../../lib/lecturekind.js");
  const lecs = (await lecturesFor(courseId).catch(() => [])).filter((l) => lectureKind(l, state.settings.lectureKindOverride || {}, state.settings.moduleKindOverride || {}, state.aiKinds || {}) === "lecture" && !checklists[l.key]);
  const core = lecs.filter((l) => lectureTier(l, state.settings.lectureTierOverride || {}, state.aiKinds || {}) === "priority");
  const l = core.find((x) => x.is_new) || core[0] || lecs.find((x) => x.is_new) || lecs[0];
  return l ? { courseId, l } : null;
}

// For questions you asked an AI yourself (on your phone, in another chat).
export function pasteCard(snap) {
  const courses = snap?.courses || [];
  if (!courses.length) return null;
  state.pasteTarget ??= { courseId: courses[0].id, lectures: [], title: courses[0].code || courses[0].name };
  const ta = h("textarea", { rows: 3, placeholder: "Paste a reply that includes a campuspilot-quiz block…", "aria-label": "AI reply with questions" });
  return h("details", { class: "card adv-card" }, h("summary", {}, "Add questions you got elsewhere"),
    h("p", { class: "muted desc" }, "Asked an AI on your phone or in another chat? Paste its reply here. Ask it to answer in CampusPilot's format by sending any practice request from a lecture first."),
    h("select", { "aria-label": "Course", onchange: (e) => { const c = courses.find((x) => x.id === Number(e.target.value)); state.pasteTarget = { courseId: c.id, lectures: [], title: c.code || c.name }; } },
      courses.map((c) => h("option", { value: c.id, selected: c.id === state.pasteTarget.courseId }, c.name))),
    h("div", { style: "height:6px" }), ta,
    act("Add to my bank", async () => { await importReply(ta.value); }, { cls: "btn small block", busyLabel: "Reading…", attrs: { style: "margin-top:6px" } }));
}
