// Today: what's due, what to review, and planning the week.
import { lecturesFor, doneButton, refreshAfterConnect } from "../core.js";
import { h, state, views, send, toast, act, ai, plural, relDue, shortDate, visibleSnapshot, openCourse, go, sync, saveSettings, empty, tz, downloadText, today, courseColor, DAY, rerender } from "../core.js";
import { handToAI } from "../aiflow.js";
import { bank, makeQuiz, makeStudyGuide, lectureScope } from "../sheet.js";
import { examPlan } from "../../lib/examplan.js";
import { openFocusSheet } from "../focus.js";
import { startSession } from "../runner.js";
import { openWork } from "../../lib/packs.js";
import { deadlinesIcs } from "../../lib/ics.js";
import { buildSession, isDue } from "../../lib/quiz.js";
import { PROVIDERS } from "../../lib/ai.js";
import { canFill, requestFillPermission } from "../../lib/autofill.js";
import { icon } from "../../lib/icons.js";
import { connOn, connPick } from "../../lib/conn.js";
let gsAskedAt = 0; // when Today last asked Gradescope what is turned in
import { weekEvents, mondayOf, ymd, niceTime, toMin, emptyWeek } from "../../lib/schedule.js";

// ---------- "For your AI": everything waiting for the student's AI, run one after another ----------
async function aiListCard() {
  const Q = await import("../queue.js");
  const list = await Q.getQueue();
  if (!list.length) return null; // the one being answered right now is shown by the bar at the bottom
  const name = ai().url ? ai().name : "your AI";
  const running = state.queueRun;
  const rows = list.slice(0, 6).map((j) => {
    const lb = Q.jobLabel(j);
    return h("div", { class: "ai-job" },
      h("span", { class: "grow" }, h("b", {}, lb.title), lb.sub ? h("small", {}, lb.sub) : null),
      h("button", { class: "btn tiny soft", title: "Do just this one now", onclick: () => Q.startQueue(j.id).catch((e) => toast(e.message, { error: true })) }, "Now"),
      h("button", { class: "x-btn", title: "Remove from the list", "aria-label": `Remove ${lb.title}`, onclick: async () => {
        if (j.kind === "checklist") await Q.skipLecture(j.lecture?.key);
        await Q.removeJob(j.id);
      } }, icon("close", 14)));
  });
  return h("div", { class: "card ai-list" },
    h("div", { class: "row" }, h("h3", { class: "grow", style: "margin:0" }, `For ${name}`), h("span", { class: "pill" }, running ? `${list.length} more` : plural(list.length, "request"))),
    h("p", { class: "muted desc", style: "margin:4px 0 8px" }, ai().direct ? (running ? `Working through the list right here (${running.done} done).` : "Start runs them one after another, right here. Nothing to send or paste.")
      : running ? `Working through the list (${running.done} done). Press Send in ${name} each time; CampusPilot picks up each answer and fills in the next.`
      : `Start fills in the first request in ${name}. Press Send; when the answer comes in, the next one is filled in. You only press Send.`),
    rows, list.length > 6 ? h("div", { class: "muted" }, `and ${list.length - 6} more`) : null,
    h("div", { class: "actions", style: "margin-top:8px" },
      running ? h("button", { class: "btn small soft", onclick: Q.stopQueue }, "Stop after this one")
        : list.length ? h("button", { class: "btn small", onclick: () => Q.startQueue().catch((e) => toast(e.message, { error: true })) }, `Start (${list.length})`) : null));
}

// ---------- today's classes and study time (from My week), for the Today card ----------
async function todaySchedule() {
  const week = { ...emptyWeek(), ...((await chrome.storage.local.get("week")).week || {}) };
  const courses = visibleSnapshot()?.courses || [];
  const has = !!((week.blocks || []).length || Object.values(week.classes || {}).some((c) => c.meetings?.length));
  if (!has) return { has, rows: [] };
  const now = new Date(), key = ymd(now), nowMin = now.getHours() * 60 + now.getMinutes();
  const terms = Object.fromEntries(courses.map((c) => [c.id, { start: c.term_start ? ymd(new Date(c.term_start)) : null, end: c.term_end ? ymd(new Date(c.term_end)) : null }]));
  const evs = weekEvents(week, mondayOf(now), { courses, terms }).filter((e) => e.date === key && e.type !== "choose").sort((a, b) => toMin(a.start) - toMin(b.start));
  const name = (id) => { const c = courses.find((x) => x.id === id); return c ? c.code || c.name : ""; };
  const rows = evs.map((e) => {
    const past = toMin(e.end) <= nowMin, nowOn = toMin(e.start) <= nowMin && nowMin < toMin(e.end);
    return { start: e.start, end: e.end, type: e.type, node: h("div", { class: `sched-row${past ? " past" : ""}${nowOn ? " now" : ""}`, style: e.courseId ? `--c:${courseColor(e.courseId)}` : "" },
      h("span", { class: "plan-gap", "aria-hidden": "true" }),
      h("span", { class: "sched-time" }, `${niceTime(e.start)}–${niceTime(e.end)}`),
      h("span", { class: `sched-bar ${e.type}` }),
      h("span", { class: "grow" }, e.type === "study" ? h("b", {}, "Study time") : [h("b", {}, `${name(e.courseId)} ${e.meeting.label}`), e.meeting.location ? h("small", {}, ` · ${e.meeting.location}`) : null]),
      nowOn ? h("span", { class: "pill now" }, "Now") : null) };
  });
  return { has, rows };
}

// Exam prep: a course quiz on the lectures this exam covers.
async function prepFor(exam, allExams) {
  const { examLectures } = await import("../../lib/examplan.js");
  const lectures = await lecturesFor(exam.courseId).catch(() => []);
  const keys = examLectures(exam, allExams.filter((x) => x.courseId === exam.courseId), lectures).map((l) => l.key);
  (await import("../coursequiz.js")).openCourseQuiz(exam.courseId, { preselect: keys.length ? keys : null });
}

// "What changed": due dates moved, new work, new grades, exam dates (since you last cleared it).
const CHANGE_ICON = { new: "spark", moved: "clock", earlier: "clock", grade: "check", regrade: "check", "course-grade": "chart", exam: "calendar", "exam-new": "calendar" };
async function changesCard() {
  const { changes = [], changesClearedAt = 0 } = await chrome.storage.local.get(["changes", "changesClearedAt"]);
  const hidden = new Set(state.settings.hiddenCourses || []);
  const list = changes.filter((c) => c.at > changesClearedAt && !hidden.has(c.courseId));
  if (!list.length) return "";
  const canNotify = await chrome.permissions.contains({ permissions: ["notifications"] }).catch(() => false);
  const shown = state.changesAll ? list : list.slice(0, 5);
  return h("div", { class: "card changes" },
    h("h3", {}, "What changed"),
    shown.map((c) => h("div", { class: "item" + (c.important ? " important" : "") },
      h("span", { class: "dot", style: `background:${courseColor(c.courseId)}` }),
      h("div", { class: "main" },
        c.url ? h("a", { class: "name", href: c.url, target: "_blank" }, c.title) : h("div", { class: "name" }, c.title),
        h("div", { class: "meta" }, h("button", { class: "linkish", onclick: () => openCourse(c.courseId) }, c.course), ` · ${c.detail}`)),
      h("span", { class: "ico-sm", "aria-hidden": "true" }, icon(CHANGE_ICON[c.kind] || "info", 16)))),
    h("div", { class: "actions" },
      h("button", { class: "btn small soft", onclick: async () => { await chrome.storage.local.set({ changesClearedAt: Date.now() }); state.changesAll = false; rerender(); } }, "Got it, clear these"),
      list.length > 5 && !state.changesAll ? h("button", { class: "btn small soft", onclick: () => { state.changesAll = true; rerender(); } }, `Show all ${list.length}`) : null),
    !canNotify && !state.settings.alertsAsked ? h("div", { class: "hint" }, "Want a heads-up when a due date moves earlier, new work is due soon, or an exam date changes? ",
      h("button", { class: "linkish", onclick: async () => {
        const ok = await chrome.permissions.request({ permissions: ["notifications"] }).catch(() => false);
        await saveSettings({ alertsAsked: true, alertsNotify: ok });
        toast(ok ? "You'll get a notification for important changes." : "No notifications. You can turn them on in Settings.");
        rerender();
      } }, "Turn on notifications"), " · ", h("button", { class: "linkish", onclick: async () => { await saveSettings({ alertsAsked: true }); rerender(); } }, "No thanks")) : null);
}

async function pushDeadlines() {
  if (state.gcal.connected) { const r = await send("GCAL_PUSH_DEADLINES"); toast(`Added ${r.count} deadlines to Google Calendar`); }
  else { await downloadText(`canvas-deadlines-${today()}.ics`, deadlinesIcs(state.snapshot), "text/calendar"); toast("Open the downloaded file to add deadlines to your calendar.", { ms: 7000 }); }
}

// Canvas sites CampusPilot can spot in your open tabs (custom school domains are typed in instead).
const NOT_CANVAS = /^(www|community|status|help|guides|canvas-docs|developerdocs|sso)\./i;
async function findCanvasTabs() {
  const tabs = await chrome.tabs.query({ url: "https://*.instructure.com/*" }).catch(() => []);
  const origins = [...new Set(tabs.map((t) => { try { return new URL(t.url).origin; } catch { return null; } }).filter((o) => o && !NOT_CANVAS.test(new URL(o).host)))];
  return origins;
}
async function connectCanvas(url) {
  if (!url.endsWith(".instructure.com")) {
    const ok = await chrome.permissions.request({ origins: [url + "/*"] });
    if (!ok) throw new Error("CampusPilot needs permission to read your Canvas site.");
  }
  await saveSettings({ canvasUrl: url });
  try { state.snapshot = await send("SYNC"); }
  catch (e) { await saveSettings({ canvasUrl: "" }); throw new Error(`Couldn't read your courses from ${new URL(url).host}. Make sure you're logged in to Canvas in a tab, then try again.`); }
  toast(`Connected. Found ${plural(state.snapshot.courses.length, "course")}.`);
  rerender();
}
let watchingTabs = false;
const autoTried = new Set();
let autoError = "";

function welcome(root) {
  const step = state.settings.canvasUrl ? 2 : 1;
  if (step === 1) {
    // Notice Canvas being opened in another tab while this screen is showing.
    if (!watchingTabs) {
      watchingTabs = true;
      chrome.tabs.onUpdated.addListener((id, info, tab) => {
        if (info.status === "complete" && /^https:\/\/[^/]+\.instructure\.com\//.test(tab.url || "") && !state.settings.canvasUrl && state.tab === "today") { autoTried.clear(); rerender(); } // e.g. just logged in: try again
      });
    }
    const box = h("div", { class: "card", style: "text-align:left" },
      h("h3", { style: "margin:0 0 4px" }, "Connect Canvas"),
      h("p", { class: "muted", style: "margin:0" }, "Looking for Canvas in your open tabs…"));
    const manual = (open = false) => {
      const input = h("input", { type: "url", id: "welcomeUrl", placeholder: "https://canvas.yourschool.edu", "aria-label": "Canvas address" });
      return h("details", { class: "adv", open },
        h("summary", {}, "Type your Canvas address instead"),
        h("p", { class: "hint", style: "margin-top:4px" }, "Use the address you see when you're logged in to Canvas, like yourschool.instructure.com or canvas.yourschool.edu."),
        input, h("div", { style: "height:8px" }),
        act("Connect", async () => {
          let url;
          try { url = new URL(/^https?:/.test(input.value.trim()) ? input.value.trim() : `https://${input.value.trim()}`).origin; } catch { throw new Error("That doesn't look like a web address."); }
          await connectCanvas(url);
        }, { cls: "btn block", busyLabel: "Connecting…" }));
    };
    findCanvasTabs().then((found) => {
      const body = [];
      // Exactly one Canvas open: connect right away (once; if it fails, show why and let them retry or type it).
      if (found.length === 1 && !autoTried.has(found[0])) {
        autoTried.add(found[0]);
        box.replaceChildren(box.firstChild, h("p", { class: "muted", style: "margin:0" }, `Found ${new URL(found[0]).host}. Connecting…`));
        connectCanvas(found[0]).catch((e) => { autoError = e.message; rerender(); });
        return;
      }
      if (autoError) body.push(h("p", { class: "hint", style: "margin:0 0 8px;color:var(--bad)" }, autoError));
      if (found.length) {
        body.push(h("p", { class: "muted", style: "margin:0 0 10px" }, found.length === 1 ? "Found Canvas in one of your tabs:" : "Found these Canvas sites in your tabs. Pick yours:"),
          ...found.map((o) => act(`Connect ${new URL(o).host}`, () => connectCanvas(o), { cls: "btn block", busyLabel: "Connecting…", attrs: { style: "margin-bottom:6px" } })),
          manual(false));
      } else {
        body.push(h("p", { class: "muted", style: "margin:0 0 6px" }, "Open Canvas in a tab and log in like you normally do. CampusPilot will spot it here automatically."),
          h("div", { class: "hint", style: "margin:0 0 10px" }, "Waiting for Canvas…"),
          manual(false));
      }
      box.replaceChildren(box.firstChild, ...body);
    });
    root.append(h("div", { class: "welcome" },
      h("div", { class: "big", "aria-hidden": "true" }, h("img", { src: "../icons/icon128.png", alt: "", width: 64, height: 64 })),
      h("h2", {}, "Welcome to CampusPilot"),
      h("p", { class: "muted" }, "Your courses, practice quizzes and grades in one place. Works with any AI you like."),
      box));
    return;
  }
}

// Today is built off-screen and swapped in at the end, so two redraws that overlap (a sync finishing while the AI
// list changes) can't both add their cards to the page.
let todaySeq = 0;
views.today = async (root) => {
  const seq = ++todaySeq;
  const draft = document.createElement("div");
  try { await buildToday(draft); }
  finally { if (seq === todaySeq) root.replaceChildren(...draft.childNodes); }
  // The first-run tour starts once the courses are in (right after connecting Canvas, too).
  if (!tourChecked && !state.worker && state.snapshot?.courses?.length) { tourChecked = true; setTimeout(() => import("../tour.js").then((m) => m.maybeTour()).catch(() => {}), 800); }
};
let tourChecked = false;
async function buildToday(root) {
  root.replaceChildren();
  // Only Canvas is needed to start. Your AI is asked for the first time you use an AI feature (aiflow.js › ensureAi).
  if (!state.settings.canvasUrl) return welcome(root);
  const s = state.snapshot;
  const hour = new Date().getHours();
  // Just updated: say so once, with a link to what changed.
  const { justUpdated } = await chrome.storage.local.get("justUpdated");
  if (justUpdated && Date.now() - justUpdated.at < 7 * 864e5) root.append(h("div", { class: "note update-note" },
    h("b", {}, `CampusPilot updated to ${justUpdated.to}. `),
    h("a", { href: `https://campuspilot.clabianco.fyi/changelog.html#v${justUpdated.to.split(".").slice(0, 2).join(".")}`, target: "_blank", rel: "noopener" }, "What's new"),
    h("button", { class: "linkish", style: "float:right", onclick: async () => { await chrome.storage.local.remove("justUpdated"); rerender(); } }, "Got it")));
  root.append(h("div", { class: "hello-row" }, h("div", { class: "hello grow" }, hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"),
    h("button", { class: "btn small soft", title: "A timer for a focused study session", onclick: () => import("../focus.js").then((m) => m.focusClick()) }, icon("timer", 14), " Focus timer")));
  if (!s) { root.append(empty("refresh", "Getting your courses from Canvas…")); sync(); return; }

  const snap = visibleSnapshot();
  const work = openWork(snap, { daysAhead: 30 });
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  const overdue = work.filter((a) => a.overdue).length;
  const dueToday = work.filter((a) => !a.overdue && Date.parse(a.due_at) <= endToday).length;
  const week = work.filter((a) => !a.overdue && Date.parse(a.due_at) <= Date.now() + 7 * DAY).length;
  // Gradescope found in a course, but not allowed yet: at the top, so it's seen.
  const upcoming0 = work.slice(0, 7);
  let gsCard = null;
  {
    const upcoming = upcoming0;
    const gsOn = upcoming.some((a) => connOn(state.settings, "gradescope", a.course_id));
    // Gradescope found in a course, but CampusPilot can't read gradescope.com yet: one click to allow it.
    if (gsOn && !(await chrome.permissions.contains({ origins: ["https://www.gradescope.com/*"] }).catch(() => true))) {
      const names = [...new Set(upcoming.filter((a) => connOn(state.settings, "gradescope", a.course_id)).map((a) => a.course))].join(", ");
      gsCard = h("div", { class: "card note-card gs-found" },
        h("b", {}, "Gradescope found"), h("p", { class: "muted", style: "margin:4px 0 8px" }, `${names} uses Gradescope. Allow CampusPilot to read it, and work you turn in there comes off your list by itself.`),
        h("div", { class: "actions" },
          h("button", { class: "btn small", onclick: async () => { if (await chrome.permissions.request({ origins: ["https://www.gradescope.com/*"] }).catch(() => false)) { gsAskedAt = Date.now(); refreshAfterConnect("gradescope"); } } }, "Allow"),
          h("button", { class: "btn small soft", onclick: async () => {
            let s = state.settings; for (const c of visibleSnapshot()?.courses || []) if (connOn(s, "gradescope", c.id)) s = { ...s, conn: connPick(s, "gradescope", c.id, false) };
            await saveSettings({ conn: s.conn }); rerender();
          } }, "Not now")));
    }
  }
  if (gsCard) root.append(gsCard);
  if (!week && !overdue) root.append(h("div", { class: "muted" }, "Nothing due this week. Nice work!"));
  // One line instead of three tiles: the list right below has the details.
  if (week || overdue) root.append(h("div", { class: "sum-line" },
    overdue ? h("span", { class: "bad-text" }, `${overdue} overdue`) : null, overdue ? " · " : "",
    dueToday ? h("b", {}, `${dueToday} due today`) : "Nothing due today", " · ", `${week} this week`));
  root.append(await changesCard());
  const aiList = await aiListCard();
  if (aiList) root.append(aiList);
  // Study sets that make themselves (asked once), and sorting what's in each course (Gemini only; in the background).
  const AS = await import("../autosets.js");
  const auto = await AS.autoCard().catch(() => null);
  if (auto) root.append(auto);
  AS.keepGoing().catch(() => {});
  // Outside tools the courses use that CampusPilot can't connect to yet: one tap tells the developer which.
  const tools = await (await import("../report.js")).toolsCard().catch(() => null);
  if (tools) root.append(tools);
  // One card for the day: classes and study sittings in time order.
  const P = await import("../plan.js");
  root.append(await P.planCard({ schedule: await todaySchedule() }).catch((e) => h("div", { class: "note" }, `Study plan: ${e.message}`)));

  // Questions due for review (only when there are some)
  const all = await bank();
  const hidden = new Set(state.settings.hiddenCourses || []);
  const due = all.filter((q) => !hidden.has(q.courseId) && q.seen && isDue(q));
  // Study now: one button for "I have 10 minutes" (due reviews first, then the next round of what you're learning).
  const { checklists = {} } = await chrome.storage.local.get("checklists");
  if (due.length || Object.keys(checklists).length) root.append(h("div", { class: "card review-card study-now" }, h("div", { class: "row" },
    h("span", { class: "ico-wrap", "aria-hidden": "true" }, icon(due.length ? "review" : "play", 18)),
    h("div", { class: "grow" }, h("b", {}, "Study now"), h("div", { class: "meta desc" }, due.length
      ? `About 10 minutes: ${plural(Math.min(15, due.length), "question")} to review first, then your next round.`
      : "About 10 minutes: the next round of the lecture you're learning.")),
    h("button", { class: "btn small", onclick: () => import("./practice.js").then((m) => m.studyNow()) }, "Start"))));

  // Exams: a short list; the study plan does the planning, "Quiz me" practices the lectures each one covers.
  const allExams = await send("ALL_EXAMS").catch(() => []);
  const exams = allExams.filter((e) => Date.parse(e.date) < Date.now() + 21 * DAY);
  if (exams.length) root.append(h("div", { class: "card" }, h("h3", {}, "Exams coming up"),
    exams.slice(0, 5).map((e) => {
      const n = Math.round((new Date(new Date(e.date).toDateString()) - new Date(new Date().toDateString())) / DAY);
      return h("div", { class: "item" }, h("span", { class: "dot", style: `background:${courseColor(e.courseId)}` }),
        h("div", { class: "main" }, h("div", { class: "name" }, `${e.course}: ${e.title}`), h("div", { class: "meta" }, new Date(e.date).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }))),
        h("span", { class: `pill ${n <= 3 ? "now" : n <= 10 ? "soon" : ""}` }, n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`),
        h("button", { class: "btn small soft", title: "A quiz on the lectures this exam covers, from your mastery questions", onclick: () => prepFor(e, allExams) }, "Quiz me"));
    })));

  const next = h("div", { class: "card" }, h("h3", {}, "Next up"));
  const upcoming = work.slice(0, 7);
  if (!upcoming.length) next.append(h("div", { class: "empty" }, h("span", { class: "big" }, icon("check", 28)), "You're all caught up."));
  upcoming.forEach((a) => {
    const d = relDue(a.due_at, a);
    next.append(h("div", { class: "item next-item" },
      h("span", { class: "dot", style: `background:${courseColor(a.course_id)}` }),
      h("div", { class: "main" },
        h("a", { class: "name", href: a.url, target: "_blank" }, a.name),
        h("div", { class: "meta" }, h("span", { class: `pill ${d.tone}`, title: d.title || null }, d.text), " ",
          h("button", { class: "linkish", onclick: () => openCourse(a.course_id) }, a.course), a.points ? ` · ${a.points} pts` : "", " ",
          a.is_quiz ? h("span", { class: "pill quiz" }, "Quiz") : a.kind === "tool" ? h("span", { class: "pill" }, a.kind_label.replace("submitted on ", "")) : null)),
      doneButton(a)));
  });
  if (work.length > 7) next.append(h("div", { class: "muted" }, `+${work.length - 7} more`));
  // Work Canvas can't see turned in (Gradescope): ask Gradescope each time Today opens (the background keeps it to
  // once a minute at most, and checks every 15 minutes on its own).
  const gsOn = upcoming.some((a) => connOn(state.settings, "gradescope", a.course_id));
  if (gsOn && Date.now() - gsAskedAt > 3 * 60e3) {
    gsAskedAt = Date.now();
    send("GS_RECHECK", { force: true }).then((snap) => {
      if (snap?.courses && JSON.stringify(snap.courses) !== JSON.stringify(state.snapshot?.courses)) { state.snapshot = snap; rerender(); }
    }).catch(() => {});
  }
  const unsure = upcoming.filter((a) => a.kind === "tool" && /gradescope/i.test(a.kind_label || "") && !a.gs && Date.parse(a.due_at) < Date.now());
  if (unsure.length && !gsOn) next.append(h("div", { class: "hint" }, "Turn on Gradescope in Settings › Connections and CampusPilot checks what you've turned in there."));
  root.append(next);
  root.querySelector(".plan-card")?.before(next); // what's due comes first, then the day

  if (s.announcements?.length) {
    const names = Object.fromEntries(s.courses.map((c) => [c.id, c.code || c.name]));
    const ann = h("div", { class: "card" }, h("h3", {}, "Recent announcements"));
    s.announcements.filter((a) => !hidden.has(a.course_id)).slice(0, 3).forEach((a) => ann.append(h("div", { class: "item" },
      h("div", { class: "main" }, h("a", { class: "name", href: a.url, target: "_blank" }, a.title),
        h("div", { class: "meta" }, `${names[a.course_id] || ""} · ${shortDate(a.posted_at)}`)))));
    root.append(ann);
  }
  root.append(h("div", { class: "muted", style: "text-align:center" }, `Updated ${new Date(s.fetched_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · `,
    h("button", { class: "linkish", onclick: (e) => sync(e.currentTarget) }, "Refresh")));
}
