// The first-run tour: a few click-through cards, each pointing at the part of the panel it explains.
// Shown once after a fresh install (when Canvas is connected); Settings has a small "Show the tour" link to see it again.
import { h, state, go, saveSettings } from "./core.js";
import { icon } from "../lib/icons.js";

// ---------- small pictures of the real parts (not clickable), so every student sees the same thing ----------
const setDemo = () => h("div", { class: "card" },
  h("b", {}, "Lecture 7: Designing Experiments"),
  h("div", { class: "set-prog", style: "margin-top:6px" }, h("b", {}, "5 of 15 learned"),
    h("div", { class: "set-bar" }, h("i", { class: "done", style: "width:33%" }), h("i", { class: "going", style: "width:27%" }))),
  h("div", { class: "set-modes" },
    h("span", { class: "mode-btn primary" }, icon("play", 20), h("b", {}, "Learn"), h("small", {}, "Round 2 of 4")),
    h("span", { class: "mode-btn" }, icon("cards", 20), h("b", {}, "Flashcards"), h("small", {}, "Key terms")),
    h("span", { class: "mode-btn" }, icon("timer", 20), h("b", {}, "Test"), h("small", {}, "15 questions"))));
const studyDemo = () => h("div", {},
  h("div", { class: "card hero cont" }, h("small", { class: "muted" }, "Continue"), h("b", { class: "cont-title" }, "Lecture 7: Designing Experiments"),
    h("div", { class: "meta" }, "BIO 2 · 5 of 15 learned"), h("div", { class: "set-bar" }, h("i", { class: "done", style: "width:33%" }), h("i", { class: "going", style: "width:27%" })),
    h("span", { class: "btn block" }, "Keep learning")),
  h("div", { class: "card review-card" }, h("div", { class: "row" }, h("div", { class: "grow" }, h("b", {}, "Review · 6 due"), h("div", { class: "meta" }, "About 4 minutes")), h("span", { class: "btn small" }, "Start"))));
const kindsDemo = () => h("div", { class: "card tight lec-top" }, h("div", { class: "kind-chips" },
  h("span", { class: "kind-chip on" }, "Priority", h("small", {}, "12")), h("span", { class: "kind-chip" }, "Additional", h("small", {}, "4")), h("span", { class: "kind-chip on" }, "Practice exams", h("small", {}, "2")),
  h("span", { class: "kind-chip" }, "Homework", h("small", {}, "5")), h("span", { class: "kind-chip" }, "Other", h("small", {}, "9"))));
const speedDemo = () => h("div", { class: "card videos" }, h("b", {}, "Lecture videos"),
  h("div", { class: "speed compact", style: "margin-top:6px" }, h("span", { class: "speed-label" }, "Speed"), h("input", { type: "range", min: 0, max: 1, step: 0.01, value: 0.42, class: "grow", tabindex: "-1" }), h("output", { class: "speed-val" }, "1.5×"), h("span", { class: "btn small soft" }, "Reset")));

const calDemo = () => h("div", { class: "cal-demo" },
  h("div", { class: "cal-days" }, ["Mon", "Tue", "Wed"].map((d, k) => h("div", { class: "cal-day" }, h("small", {}, d),
    k === 0 ? [h("span", { class: "cal-chip" }, h("i", {}, "4p"), "Learn Lecture 13"), h("span", { class: "cal-chip" }, h("i", {}, "5p"), "HW 5: problems 1-3")]
      : k === 1 ? h("span", { class: "cal-chip" }, h("i", {}, "10a"), "HW 5: problems 4-6") : h("span", { class: "cal-chip free" }, "Study time 2h")))),
  h("span", { class: "cal-pill" }, "Your plan · 2 today"));
const aiDemo = () => h("div", { class: "card" }, h("div", { class: "row" }, h("span", { class: "dot", style: "background:var(--accent)" }),
  h("div", { class: "grow" }, h("b", {}, "Gemini is writing: 6 questions so far"), h("div", { class: "meta" }, "It's added by itself when it's done. You can keep using CampusPilot."))));
const canvasDemo = () => h("div", { class: "card" }, h("b", {}, "Due soon"), h("div", { class: "meta", style: "margin:2px 0 8px" }, "On your Canvas dashboard"),
  h("div", { class: "row" }, h("span", { class: "dot", style: "background:#4aa3df" }), h("span", { class: "grow" }, "Lab report 4"), h("small", { class: "muted" }, "Today 11:59pm")),
  h("div", { class: "row", style: "margin-top:4px" }, h("span", { class: "dot", style: "background:#8e44ad" }), h("span", { class: "grow" }, "Homework 10"), h("small", { class: "muted" }, "Tomorrow")));
const mixedDemo = () => h("div", { class: "card mixed-card" }, h("div", { class: "row" },
  h("div", { class: "grow" }, h("b", {}, "Mixed test"), h("div", { class: "meta" }, "One test from several lectures, like before a midterm.")), h("span", { class: "btn small soft" }, "Set up")));

// ---------- a sample quiz, in the real quiz screen (nothing is saved) ----------
const SAMPLE = [
  { id: "tour-1", type: "mcq", topic: "Sample quiz · how CampusPilot works", prompt: "You miss a question in CampusPilot. What happens next?",
    options: ["It comes back later, right before you'd forget it", "It's deleted", "Your grade in Canvas goes down", "Nothing"], answer: 0,
    explanation: "Missed questions come back as reviews. Ones you get right come back less and less often." },
  { id: "tour-2", type: "tf", topic: "Sample quiz · how CampusPilot works", prompt: "CampusPilot can change things in your Canvas courses.", answer: false,
    explanation: "It only reads Canvas. It never submits, edits, or opens quizzes there." },
  { id: "tour-3", type: "short", topic: "Sample quiz · how CampusPilot works", prompt: "Where do your quiz questions come from?",
    answer: "Your AI writes them from your own lecture slides, pages and recordings.",
    explanation: "In real quizzes the line above each question names the lecture and slide; click it (or “Stuck?”) to open the lecture right there. Short answers: type yours (or answer in your head), then grade yourself." },
];
async function sampleQuiz(resume) {
  const { startSession } = await import("./runner.js");
  startSession(SAMPLE, { title: "Sample quiz", demo: true, onClose: resume });
}

const byText = (sel, re) => [...document.querySelectorAll(sel)].find((el) => re.test(el.textContent || "") && el.offsetParent);
const byId = (id) => () => document.getElementById(id);
const card = (sel, re) => () => { const hd = byText(sel, re); return hd?.closest(".card") || hd || null; };
const settingsGroup = (name) => () => byText("#settings details.group > summary", new RegExp(`^\\s*${name}`));
// The first course, for the steps inside a course.
const firstCourse = () => (state.snapshot?.courses || []).find((c) => !(state.settings.hiddenCourses || []).includes(c.id))?.id ?? null;

// Steps, in parts. `tab` goes there first; `course` opens the first course on that course tab; `target` is what's
// highlighted (an element, or a list of them); `demo` is a small, inert picture of the real thing.
const STEPS = [
  { part: "Start", title: "Welcome to CampusPilot", text: "CampusPilot reads your Canvas courses (it never changes anything there) and helps you plan your week and learn each lecture, with questions your own AI writes from your slides. This takes about three minutes; skip a part, or the whole tour, any time." },

  { part: "Home", tab: "today", target: card("#today .card h3", /^Next up/), title: "Home", text: "The line at the top counts what's overdue, due today and due this week. Next up lists it, across all your courses. Tick something when it's done (work turned in on Gradescope or on paper too); it moves out of the way." },
  { part: "Home", target: byId("focusBtn"), title: "Focus timer", text: "A Pomodoro timer: focus for a set time, then a short break, then again. It keeps running with the panel closed and chimes at each break. It's here on every tab." },

  { part: "Your week", tab: "today", target: () => byText("#today .plan-card button", /My week/), title: "My week", text: "Your class times (CampusPilot finds them in Canvas, your syllabus or your school's schedule file, and asks which section is yours) and the hours you're free to study. Drag to mark study time." },
  { part: "Your week", tab: "today", target: () => document.querySelector("#today .plan-card"), title: "Study plan", text: "Pick what you're studying for. Your AI sizes each assignment from its files; CampusPilot fits the work into your study time. It puts the lectures an assignment needs before the assignment, leaves the assignment its full time, finishes it a day early, and moves anything you miss." },
  { part: "Your week", title: "Your plan on Canvas's calendar", demo: calDemo, text: "Open Calendar in Canvas: each study sitting is drawn in its day (and in the hours, on Week and Day view). The “Your plan” button in the corner lists the next seven days. Optional: Google Calendar gets it too (Settings › Connections)." },

  { part: "Courses", tab: "courses", course: false, target: () => [byText("#courses .linkish", /^Export courses/), byText("#courses .linkish", /^Edit$/)].filter(Boolean), title: "Your courses", text: "Every course with its grade and what's due. Edit hides old courses and changes the order. Export courses saves everything (files, your submissions, Gradescope work) as one tidy zip." },
  { part: "Courses", course: "lectures", target: () => document.querySelector("#courses .lec-top"), demo: kindsDemo, title: "What a course lists", text: "Inside a course, Lectures comes first. These buttons choose what's listed: Priority is the core lectures, Additional is extra or optional material, then practice exams, homework and other items. The “⋯” next to them marks new items as seen, arranges modules, and has the course's lecture settings." },
  { part: "Courses", course: "lectures", target: () => document.querySelector("#courses .lec"), title: "Each lecture", text: "Tap a lecture to study it. Its own “⋯” opens it in Canvas, and “This is…” moves it to another list if it was filed wrong (homework listed as a lecture, say)." },
  { part: "Courses", course: "lectures", title: "A lecture is a study set", demo: setDemo, text: "The first time, press “Set up this lecture” and your AI lists everything to learn, slide by slide. Then: Learn (short rounds of questions), Flashcards (key terms) and Test. The bar shows how much you've learned. More has a study guide, a chat about the lecture, and the slides as a download." },
  { part: "Courses", course: "lectures", title: "How questions work", action: { label: "Try a sample quiz", run: sampleQuiz }, text: "Pick an answer and you see right away whether it's right, and why. Stuck? opens the slide that explains it. Missed ones come back later. Try 3 sample questions (nothing is saved), or press Next." },
  { part: "Courses", course: "lectures", target: () => document.querySelector("#courses .card.videos"), demo: () => (document.querySelector("#courses .card.videos") ? null : speedDemo()), title: "Lecture videos and speed", text: "Recordings are listed under the lectures, and work like slides once they're read: search finds the minute something was said. The Speed slider sets how fast lecture videos play, on Canvas and on your video site." },
  { part: "Courses", course: "grades", target: () => document.querySelector("#courses .ledger-frame") || byText("#courses .subtabs button", /^Grades/), title: "Grades and the What-If calculator", text: "Your grade with each category's weight (from Canvas, or your syllabus). Type a score you might get to see your final grade, or how much you need on what's left. “?” at the top shows how it's worked out." },
  { part: "Courses", course: "files", target: () => byText("#courses .subtabs button", /^Files/), title: "Files", text: "All the course's files as one zip, a copy of the lecture slides that stays up to date in Downloads, everything you've turned in, and your graded Gradescope work (with “Learn from it” for the questions you lost points on)." },

  { part: "Study", tab: "practice", target: () => document.querySelector("#practice .cont") || byId("tab-practice")(), demo: () => (document.querySelector("#practice .cont") ? null : studyDemo()), title: "Study", text: "The quickest way back in. Continue picks up your last lecture. Review brings back questions right before you'd forget them, and the ones you missed until you get them right." },
  { part: "Study", tab: "practice", target: () => document.querySelector("#practice .mixed-card, #practice .course-quiz"), demo: () => (document.querySelector("#practice .mixed-card, #practice .course-quiz") ? null : mixedDemo()), title: "Mixed test", text: "One test from several lectures, for a midterm: pick the lectures and how much each counts. An exam's “Quiz me” (on Home and under a course's lectures) opens it with the lectures that exam covers." },

  { part: "Your AI", title: "How your AI helps", demo: aiDemo, text: "The easiest way: sign in with a personal Google account (school accounts don't work), and CampusPilot sets up free Gemini for you (it shows exactly what it does first). Then answers come straight back here. Or use your own AI's website: CampusPilot fills in the request, you press Send, and it picks up the reply. It asks which you'd like the first time." },
  { part: "On Canvas", title: "On Canvas itself", demo: canvasDemo, text: "CampusPilot adds a few things to Canvas: a due-soon list on the dashboard, recent announcements and grades, Practice buttons on lecture pages and modules, a speed control on videos, and your theme. Turn any of them off in Settings › Advanced." },

  { part: "Find anything", target: () => [byId("searchBtn")(), byId("helpBtn")()].filter(Boolean), title: "Search and “?”", text: "Search looks inside every slide, recording, assignment and announcement, and finds any feature by name (try “timer” or “dark mode”). Press / to open it. “?” shows or hides the short explanations under things." },
  { part: "Find anything", tab: "settings", target: byId("setSearch"), title: "Settings", text: "Type here to find any setting; it opens the right group and points to it. Account & sync (sync between computers), Your AI, Appearance, Connections (Gradescope, Jupyter notebooks, videos, Google Calendar) and Advanced." },
  { part: "Find anything", tab: "settings", target: settingsGroup("Appearance"), title: "Make it yours", text: "Seven themes (they restyle Canvas too), your accent color, course card styles, text size and accessibility options." },

  { part: "Done", tab: "today", title: "You're set", text: "Start with a course: pick a lecture and press Set up. Then mark your study time on My week and make a study plan. See this tour again any time: Settings, at the bottom, “Show the tour”.", done: true },
];
export const TOUR_STEPS = STEPS.map((s) => s.title);

let el = null;
export function startTour(at = 0) {
  endTour(false);
  const prevTab = state.tab;
  let i = Math.max(0, Math.min(STEPS.length - 1, at));
  let seq = 0, follow = 0, target = null;
  el = h("div", { class: "tour", role: "dialog", "aria-modal": "true", "aria-label": "CampusPilot tour" });
  const hole = h("div", { class: "tour-hole", "aria-hidden": "true" });
  const box = h("div", { class: "tour-card", tabindex: "-1" });
  el.append(hole, box);
  document.body.append(el);
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const targetsOf = (st) => { const got = st.target?.(); return (Array.isArray(got) ? got : [got]).filter((x) => x && x.isConnected && x.getClientRects().length); };
  const rectOf = (els) => {
    const rs = els.map((x) => x.getBoundingClientRect());
    const r = { left: Math.min(...rs.map((x) => x.left)), top: Math.min(...rs.map((x) => x.top)), right: Math.max(...rs.map((x) => x.right)), bottom: Math.max(...rs.map((x) => x.bottom)) };
    // only the part that's on screen (a tall card is highlighted where you can see it)
    r.top = Math.max(r.top, 4); r.bottom = Math.min(r.bottom, window.innerHeight - 4);
    return r;
  };
  // Puts the highlight and the card where the target is now. Runs every frame while a step is up, so they stay
  // on it while the page settles, scrolls or resizes (no lag behind).
  let last = "";
  let cur = null;
  const place = () => {
    // the page redrew (new data, a sync): point at the new copy of the same thing
    if (cur && (!target?.length || target.some((x) => !x.isConnected))) { const now = targetsOf(cur); if (now.length) { target = now; last = ""; } }
    if (!target?.length || target.some((x) => !x.isConnected)) return;
    const r = rectOf(target), pad = 6;
    const key = [r.left, r.top, r.right, r.bottom, box.offsetHeight].map(Math.round).join(",");
    if (key === last) return;
    last = key;
    Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.right - r.left + pad * 2}px`, height: `${Math.max(0, r.bottom - r.top) + pad * 2}px` });
    const need = box.offsetHeight + 14, below = window.innerHeight - r.bottom - 14, above = r.top - 14;
    if (below >= need || below >= above) { box.style.top = `${Math.min(r.bottom + 14, Math.max(12, window.innerHeight - need))}px`; box.style.bottom = ""; }
    else { box.style.bottom = `${Math.min(window.innerHeight - r.top + 14, Math.max(12, window.innerHeight - need))}px`; box.style.top = ""; }
  };
  const loop = () => { if (!el) return; place(); follow = requestAnimationFrame(loop); };

  const show = async () => {
    const my = ++seq;
    const st = STEPS[i];
    cur = null;
    cancelAnimationFrame(follow);
    el.classList.add("moving"); // hide the old highlight while the next page draws
    // go where the step is
    if (st.course !== undefined) {
      const want = st.course === false ? { course: null } : { course: firstCourse(), courseSub: st.course };
      if (state.tab !== "courses" || state.course !== want.course || (st.course && state.courseSub !== st.course)) go("courses", want);
    } else if (st.tab && state.tab !== st.tab) go(st.tab);
    // wait for what it points at (the page draws in a moment), then for it to stop moving
    let els = [];
    if (st.target) {
      const until = performance.now() + 1200;
      let prev = "", same = 0;
      while (performance.now() < until) {
        await frame();
        if (my !== seq) return;
        els = targetsOf(st);
        if (!els.length) { same = 0; continue; }
        const r = rectOf(els), k = [r.left, r.top, r.right, r.bottom].map(Math.round).join(",");
        same = k === prev ? same + 1 : 0; prev = k;
        if (same >= 2) break;
      }
      if (els.length) { els[0].scrollIntoView({ block: "center", behavior: "instant" }); await frame(); }
    } else await frame();
    if (my !== seq) return;
    target = els.length ? els : null;
    cur = target ? st : null;
    const n = STEPS.length, partSteps = STEPS.filter((s) => s.part === st.part), nextPart = STEPS.findIndex((s, k) => k > i && s.part !== st.part);
    box.replaceChildren(...[
      h("div", { class: "tour-count" }, st.part === "Start" || st.done ? `${i + 1} of ${n}` : `${st.part} · ${partSteps.indexOf(st) + 1} of ${partSteps.length}`),
      h("div", { class: "tour-bar", "aria-hidden": "true" }, h("i", { style: `width:${((i + 1) / n) * 100}%` })),
      h("h2", {}, st.title),
      h("p", {}, st.text),
      st.demo ? (() => { const d = st.demo(); return d ? h("div", { class: "tour-demo", "aria-hidden": "true", inert: "" }, d) : null; })() : null,
      st.action ? h("button", { class: "btn block tour-try", onclick: () => {
        // the sample runs in the real quiz screen; the tour waits and picks up at the next step
        el.style.display = "none";
        st.action.run(() => { if (el) { el.style.display = ""; i++; show(); } });
      } }, st.action.label) : null,
      h("div", { class: "tour-acts" },
        st.done ? null : h("button", { class: "linkish tour-skip", onclick: () => endTour(true) }, "Skip tour"),
        !st.done && i > 0 && nextPart > 0 && STEPS[nextPart].part !== "Done" && partSteps.length > 1 ? h("button", { class: "linkish tour-skip", onclick: () => { i = nextPart; show(); } }, "Skip this part") : null,
        h("span", { class: "grow" }),
        i > 0 ? h("button", { class: "btn small soft", onclick: () => { i--; show(); } }, "Back") : null,
        h("button", { class: "btn small", onclick: () => { if (st.done) return endTour(true, "today"); i++; show(); } }, st.done ? "Start using CampusPilot" : i === 0 ? "Show me around" : "Next"))].filter(Boolean));
    last = "";
    if (target) { el.classList.remove("center"); hole.style.display = "block"; place(); loop(); }
    else { hole.style.display = "none"; box.style.top = box.style.bottom = ""; el.classList.add("center"); }
    el.classList.remove("moving");
    box.focus({ preventScroll: true });
  };
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") endTour(true, prevTab);
    if (e.key === "ArrowRight" && i < STEPS.length - 1) { i++; show(); }
    if (e.key === "ArrowLeft" && i > 0) { i--; show(); }
  });
  el.cleanup = () => { seq++; cancelAnimationFrame(follow); };
  show();
}
export function endTour(seen = true, tab = null) {
  if (!el) return;
  el.cleanup?.(); el.remove(); el = null;
  if (seen) { saveSettings({ tourSeen: true }); chrome.storage.local.remove("freshInstall"); }
  if (tab) go(tab, tab === "courses" ? {} : { course: null });
}
/** After a fresh install, once Canvas is connected and the courses are loaded. */
export async function maybeTour() {
  if (state.settings?.tourSeen || !state.snapshot?.courses?.length) return;
  const { freshInstall } = await chrome.storage.local.get("freshInstall");
  if (freshInstall) startTour();
}
