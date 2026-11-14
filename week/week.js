// My week: class times, the student's own sections, study blocks they paint, deadlines and exams.
// Everything stays in this browser (and the student's own sync). Nothing is written to Canvas.
import {
  DAYS, KINDS, KIND_LABEL, CHOOSABLE, emptyWeek, toMin, hhmm, niceTime, ymd, dayIndex, mondayOf, addDays,
  weekEvents, paintWeekly, paintOnce, sectionGroups, groupKey, normalizeMeeting, buildIcs, timeChangeNotices, suggestPicks, sectionSteps, isMine, applyCanvasGroups, meetingsFromCalendar, parseScheduleIcs, addOwnMeetings,
} from "../lib/schedule.js";
import { ZipWriter } from "../lib/zipwrite.js";
import { planDays, planInfo } from "../lib/planner.js";
import { enableCollapse } from "../lib/collapse.js";

const $ = (s, el = document) => el.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") for (const [p, val] of Object.entries(v)) { if (p.startsWith("--")) el.style.setProperty(p, val); else el.style[p] = val; }
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
};
const send = (type, payload = {}) => new Promise((res, rej) => chrome.runtime.sendMessage({ type, payload }, (r) => (r?.ok ? res(r.data) : rej(new Error(r?.error || "No answer")))));
let toastT = null;
function toast(msg, ms = 4000) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms); }

const S = { week: emptyWeek(), snapshot: null, settings: {}, exams: [], monday: mondayOf(new Date()), mode: "week", drag: null, adding: null, skipSteps: new Set(), stepChoice: null };
const ROW = 22; // pixels per half hour

// ---------- data ----------
async function load() {
  const got = await chrome.storage.local.get(["week", "snapshot", "settings", "plan", "planDone", "planDay", "checklists", "itemStats"]);
  S.planData = got;
  S.week = { ...emptyWeek(), ...(got.week || {}) };
  S.snapshot = got.snapshot || null;
  S.settings = got.settings || {};
  const theme = S.settings.look?.theme || (S.settings.darkMode ? "dark" : "default");
  document.documentElement.dataset.look = theme;
  if (S.settings.look?.accent) document.documentElement.style.setProperty("--accent", S.settings.look.accent);
  S.exams = await send("ALL_EXAMS").catch(() => []);
}
async function save(change) {
  S.week = { ...S.week, ...change, at: Date.now() };
  await chrome.storage.local.set({ week: S.week });
  draw();
}
const courses = () => {
  const hidden = new Set(S.settings.hiddenCourses || []);
  return (S.snapshot?.courses || []).filter((c) => !hidden.has(c.id));
};
const courseOf = (id) => courses().find((c) => String(c.id) === String(id));
const nameOf = (id) => { const c = courseOf(id); return c ? c.code || c.name : "Course"; };
function color(id) {
  const own = S.settings.look?.courseColors?.[id];
  return (own && own !== "none" ? own : null) || S.snapshot?.colors?.[id] || "#8a8a8a";
}
const terms = () => Object.fromEntries(courses().map((c) => [c.id, { start: c.term_start ? ymd(new Date(c.term_start)) : null, end: c.term_end ? ymd(new Date(c.term_end)) : null }]));

// ---------- the calendar ----------
function draw() {
  drawGrid();
  drawSide();
  const end = addDays(S.monday, 6);
  const f = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  $("#range").textContent = `${f(S.monday)} – ${f(end)}`;
  $("#office").checked = !!S.week.showOffice;
  $("#mode-week").setAttribute("aria-checked", String(S.mode === "week"));
  $("#mode-once").setAttribute("aria-checked", String(S.mode === "once"));
}

function hoursFor(events) {
  let a = 7 * 60, b = 23 * 60;
  for (const e of events) { a = Math.min(a, toMin(e.start)); b = Math.max(b, toMin(e.end)); }
  return [Math.floor(a / 60) * 60, Math.min(24 * 60, Math.ceil(b / 60) * 60)];
}

// The study plan's sittings (from Today's plan and the days after), shown inside the study blocks.
function plannedByDate() {
  const d = S.planData || {};
  if (!d.plan) return {};
  const info = planInfo({ snapshot: S.snapshot, checklists: d.checklists, itemStats: d.itemStats, masteryLevel: S.settings.masteryLevel || {} });
  const days = planDays(d.plan, S.week, { today: ymd(new Date()), done: d.planDone || {}, info, day: d.planDay, nowMin: new Date().getHours() * 60 + new Date().getMinutes(), courses: courses(), terms: terms() });
  const out = {};
  for (const c of [...days.today.map((x) => ({ ...x, date: ymd(new Date()) })), ...days.later]) (out[c.date] ||= []).push(c);
  return out;
}

function drawGrid() {
  const grid = $("#grid");
  const planned = plannedByDate();
  const events = weekEvents(S.week, S.monday, { courses: courses(), terms: terms() });
  const [from, to] = hoursFor(events);
  S.range = [from, to];
  const todayKey = ymd(new Date());
  const cal = h("div", { class: "cal", style: { "--row": `${ROW}px` } });
  // header
  cal.append(h("div", {}));
  for (let d = 0; d < 7; d++) {
    const date = addDays(S.monday, d);
    cal.append(h("div", { class: `dayhead${ymd(date) === todayKey ? " today" : ""}` }, DAYS[d], h("small", {}, date.toLocaleDateString(undefined, { month: "short", day: "numeric" }))));
  }
  // deadlines and exams (by day; time shown on each)
  cal.append(h("div", { class: "corner" }, "Due"));
  for (let d = 0; d < 7; d++) {
    const key = ymd(addDays(S.monday, d));
    const cell = h("div", { class: "allday" });
    for (const x of S.exams.filter((e) => ymd(new Date(e.date)) === key)) {
      cell.append(h("div", { class: "chip exam", style: { "--c": color(x.courseId) }, title: `${x.title} (${x.course})${x.hasTime ? ` at ${niceTime(new Date(x.date).getHours() * 60 + new Date(x.date).getMinutes())}` : ""}` },
        `${x.hasTime ? niceTime(new Date(x.date).getHours() * 60 + new Date(x.date).getMinutes()) + " " : ""}${x.title}`));
    }
    for (const c of courses()) for (const a of c.assignments || []) {
      if (!a.due_at || a.blocked || ymd(new Date(a.due_at)) !== key) continue;
      const t = new Date(a.due_at);
      const done = a.submitted || a.graded;
      cell.append(h("div", { class: `chip${done ? " done" : ""}`, style: { "--c": color(c.id) }, title: `${a.name} · ${c.code || c.name} · due ${niceTime(t.getHours() * 60 + t.getMinutes())}${done ? " (submitted)" : ""}` },
        `${niceTime(t.getHours() * 60 + t.getMinutes())} ${a.name}`));
    }
    cal.append(cell);
  }
  // time labels
  const times = h("div", { class: "times" });
  for (let m = from; m < to; m += 60) times.append(h("div", {}, m === from ? "" : niceTime(m)));
  cal.append(times);
  // day columns
  const height = ((to - from) / 30) * ROW;
  for (let d = 0; d < 7; d++) {
    const date = addDays(S.monday, d), key = ymd(date);
    const col = h("div", { class: `col${key === todayKey ? " today" : ""}`, style: { height: `${height}px` }, "data-day": d, "data-date": key,
      role: "group", "aria-label": `${DAYS[d]} ${date.toLocaleDateString()}` });
    const mine = events.filter((e) => e.day === d);
    // side by side when two classes overlap
    const cls = mine.filter((e) => e.type !== "study").sort((a, b) => toMin(a.start) - toMin(b.start));
    cls.forEach((e, i) => { const prev = cls[i - 1]; if (prev && toMin(prev.end) > toMin(e.start)) { prev._split = "narrow2"; e._split = "narrow"; } });
    for (const e of mine) col.append(eventEl(e, from));
    for (const c of planned[key] || []) {
      const top = ((toMin(c.start) - from) / 30) * ROW, hgt = Math.max(ROW - 4, ((toMin(c.end) - toMin(c.start)) / 30) * ROW - 4);
      col.append(h("div", { class: `ev planned${c.done ? " done" : ""}`, style: { top: `${top + 1}px`, height: `${hgt}px`, "--c": color(c.ref.split(":")[1]) }, title: `${c.title} · ${niceTime(c.start)}–${niceTime(c.end)}` },
        h("b", {}, c.title), h("span", {}, `${niceTime(c.start)}–${niceTime(c.end)}`)));
    }
    if (key === todayKey) {
      const n = new Date(), nm = n.getHours() * 60 + n.getMinutes();
      if (nm >= from && nm <= to) col.append(h("div", { class: "now", style: { top: `${((nm - from) / 30) * ROW}px` }, "aria-hidden": "true" }));
    }
    col.addEventListener("pointerdown", (ev) => startPaint(ev, col));
    cal.append(col);
  }
  grid.replaceChildren(cal);
}

function eventEl(e, from) {
  const top = ((toMin(e.start) - from) / 30) * ROW, height = Math.max(ROW - 2, ((toMin(e.end) - toMin(e.start)) / 30) * ROW - 2);
  const pos = { top: `${top}px`, height: `${height}px` };
  const when = `${niceTime(e.start)}–${niceTime(e.end)}`;
  if (e.type === "study") return h("div", { class: `ev study${e.repeat ? "" : " once"}`, style: pos, title: `Study time ${when}${e.repeat ? " (every week)" : " (this week only)"}` }, h("b", {}, "Study"), h("span", {}, when));
  const m = e.meeting;
  const cls = e.type === "choose" ? "choose" : m.kind === "office" ? "class office" : "class";
  const label = `${nameOf(e.courseId)} ${m.label}`;
  return h("button", { class: `ev ${cls} ${e._split || ""}`, style: { ...pos, "--c": color(e.courseId) }, title: `${label} · ${when}${m.location ? ` · ${m.location}` : ""}`,
    onclick: (ev) => { ev.stopPropagation(); openPop(ev.currentTarget, e); }, onpointerdown: (ev) => ev.stopPropagation() },
    h("b", {}, label), h("span", {}, [when, m.location].filter(Boolean).join(" · ")), m.kind === "office" && m.who ? h("span", {}, m.who) : null);
}

// ---------- painting study time ----------
function slotAt(col, y) {
  const r = col.getBoundingClientRect();
  const [from, to] = S.range;
  const m = from + Math.floor(Math.max(0, Math.min(r.height - 1, y - r.top)) / ROW) * 30;
  return Math.min(to - 30, m);
}
function isStudy(day, date, min) {
  return weekEvents(S.week, S.monday, { courses: [], terms: {} }).some((e) => e.type === "study" && e.date === date && toMin(e.start) <= min && min < toMin(e.end));
}
function startPaint(ev, col) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  closePop();
  const day = Number(col.dataset.day), date = col.dataset.date;
  const a = slotAt(col, ev.clientY);
  S.drag = { col, day, date, a, b: a, erase: isStudy(day, date, a) };
  col.setPointerCapture(ev.pointerId);
  const prev = h("div", { class: `ev preview${S.drag.erase ? " erase" : ""}` });
  col.append(prev);
  S.drag.prev = prev;
  const show = () => {
    const [lo, hi] = [Math.min(S.drag.a, S.drag.b), Math.max(S.drag.a, S.drag.b) + 30];
    prev.style.top = `${((lo - S.range[0]) / 30) * ROW}px`;
    prev.style.height = `${((hi - lo) / 30) * ROW - 2}px`;
    prev.textContent = `${S.drag.erase ? "Remove" : "Study"} ${niceTime(lo)}–${niceTime(hi)}`;
  };
  show();
  const move = (e) => { S.drag.b = slotAt(col, e.clientY); show(); };
  const up = async () => {
    col.removeEventListener("pointermove", move);
    col.removeEventListener("pointerup", up);
    col.removeEventListener("pointercancel", up);
    const { day: d, date: dt, erase } = S.drag;
    const lo = Math.min(S.drag.a, S.drag.b), hi = Math.max(S.drag.a, S.drag.b) + 30;
    S.drag = null;
    if (S.mode === "week") await save({ blocks: paintWeekly(S.week.blocks || [], d, lo, hi, erase) });
    else await save({ changes: paintOnce(S.week, dt, d, lo, hi, erase) });
    toast(`${erase ? "Removed" : "Added"} study time ${niceTime(lo)}–${niceTime(hi)} ${S.mode === "week" ? `every ${DAYS[d]}` : "this week only"}.`);
  };
  col.addEventListener("pointermove", move);
  col.addEventListener("pointerup", up);
  col.addEventListener("pointercancel", up);
}

// ---------- class details ----------
function openPop(anchor, e) {
  const pop = $("#pop"), m = e.meeting, cid = e.courseId;
  const r = anchor.getBoundingClientRect();
  const kids = [h("h3", {}, `${nameOf(cid)} ${m.label}`),
    h("div", {}, `${m.date ? new Date(`${m.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : m.days.map((d) => DAYS[d]).join(", ")} · ${niceTime(m.start)}–${niceTime(m.end)}`),
    m.location ? h("div", { class: "muted" }, m.location) : null,
    m.who ? h("div", { class: "muted" }, m.who) : null,
    h("div", { class: "hint", style: { marginTop: "6px" } }, m.source === "manual" ? "Added by you." : "Found in your syllabus or course pages by your AI. Check it against Canvas if anything looks off.")];
  const acts = h("div", { class: "acts" });
  if (e.type === "choose") {
    acts.append(h("button", { class: "btn primary small", onclick: () => pickSection(cid, groupKey(m), m.section || m.label) }, `This is my ${KIND_LABEL[m.kind].toLowerCase()}`));
    kids.push(h("div", { class: "hint", style: { marginTop: "6px" } }, `${e.options?.length || "Several"} ${KIND_LABEL[m.kind].toLowerCase()} options are listed. Pick yours and the others disappear.`));
  } else if (CHOOSABLE.has(m.kind) && (e.options?.length || 0) > 1) {
    acts.append(h("button", { class: "btn soft small", onclick: () => pickSection(cid, groupKey(m), null) }, "Change my section"));
  }
  acts.append(h("button", { class: "btn soft small", onclick: () => removeMeeting(cid, m.id) }, "Remove"), h("button", { class: "btn ghost small", onclick: closePop }, "Close"));
  kids.push(acts);
  pop.replaceChildren(...kids.filter(Boolean));
  pop.hidden = false;
  const w = 280, left = Math.min(window.innerWidth - w - 12, Math.max(12, r.right + 8 + w > window.innerWidth ? r.left - w - 8 : r.right + 8));
  pop.style.left = `${left}px`;
  pop.style.top = `${Math.min(window.innerHeight - pop.offsetHeight - 12, Math.max(12, r.top))}px`;
  pop.querySelector("button")?.focus();
}
function closePop() { $("#pop").hidden = true; }
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePop(); });
document.addEventListener("pointerdown", (e) => { if (!$("#pop").hidden && !$("#pop").contains(e.target)) closePop(); });

async function pickSection(cid, group, label) {
  const picks = { ...(S.week.picks || {}) };
  const mine = { ...(picks[cid] || {}) };
  if (label == null) delete mine[group]; else mine[group] = label;
  picks[cid] = mine;
  closePop();
  await save({ picks });
  if (label && label !== "none") toast(`${nameOf(cid)}: ${label} is yours.`);
}
async function removeMeeting(cid, id) {
  const classes = { ...(S.week.classes || {}) };
  const rec = classes[cid];
  if (!rec) return;
  classes[cid] = { ...rec, meetings: rec.meetings.filter((m) => m.id !== id) };
  closePop();
  await save({ classes });
  toast("Removed.");
}

// ---------- side: courses, sections, adding class times ----------
function drawSide() {
  const side = $("#side");
  const cs = courses();
  const any = cs.some((c) => S.week.classes?.[c.id]?.meetings?.length);
  const find = h("div", { class: "card" },
    h("h2", {}, "Class times"),
    h("p", { class: "hint", style: { margin: "0 0 8px" } }, any
      ? "Found in your syllabi and course pages. Pick your own section where a course has several, and add anything that's missing."
      : "Your AI can read your syllabi and course pages and find your lectures, sections, labs and office hours (one request for all your courses). You can also add them yourself."),
    h("div", { class: "acts" },
      h("button", { class: `btn ${any ? "soft" : "primary"}`, onclick: () => findWithAI() }, any ? "Find class times again" : "Find class times with my AI"),
      h("button", { class: "btn soft", title: "A calendar file (.ics) of your class schedule, from your school's registration site", onclick: importIcs }, "Import class schedule")),
    h("p", { class: "hint", style: { margin: "8px 0 0" } }, "Import class schedule: many registration sites let you download your schedule as a calendar file (.ics). It adds every lecture, section and lab at once."));
  const list = h("div", { class: "card" }, h("h2", {}, "Your courses"),
    cs.length ? cs.map(courseCard) : h("div", { class: "hint" }, "Open CampusPilot and connect Canvas to see your courses here."));
  const lf = S.week.lastFind;
  const missing = (lf?.missing || []).filter((m) => courseOf(m.id) && !S.week.classes?.[m.id]?.meetings?.length);
  if (missing.length) find.append(h("div", { class: "note warn", style: { marginTop: "8px" } },
    h("b", {}, `No times yet for ${missing.map((m) => nameOf(m.id)).join(", ")}. `),
    missing.some((m) => m.noText) ? `CampusPilot found nothing about meeting times in ${missing.filter((m) => m.noText).map((m) => nameOf(m.id)).join(", ")}'s syllabus or pages. ` : "",
    missing.some((m) => m.skipped && !m.noText) ? "Your AI's reply left some out. " : "",
    "Ask again for just these, or add the times yourself below. ",
    h("button", { class: "linkish", onclick: () => findWithAI(missing.map((m) => m.id)) }, "Ask again for these")));
  side.replaceChildren(...[sectionWizard(), suggestCard(), find, studyCard(), list].filter(Boolean));
}

// ---------- confirming sections, one at a time ----------
// Every course with several section (or lab, or lecture) options gets one step: the options side by side with all their
// meetings, what Canvas says about the student, and anything that clashes with classes already theirs. Nothing is
// picked without the student confirming it.
const overlaps = (a, b) => toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end) && (a.date && b.date ? a.date === b.date : a.days.some((d) => b.days.includes(d)));
function clashesFor(cid, meetings) {
  const out = new Set();
  for (const c of courses()) {
    const rec = S.week.classes?.[c.id];
    if (!rec) continue;
    const groups = sectionGroups(rec.meetings);
    for (const o of rec.meetings) {
      if (o.kind === "office" || meetings.includes(o)) continue;
      if (isMine(o, S.week.picks?.[c.id], groups) !== true) continue;
      if (String(c.id) === String(cid) && CHOOSABLE.has(o.kind) && o.kind === meetings[0]?.kind) continue;
      if (meetings.some((m) => overlaps(m, o))) out.add(`${nameOf(c.id)} ${o.label}`);
    }
  }
  return [...out];
}
function sectionWizard() {
  const all = sectionSteps(S.week, courses().map((c) => c.id));
  const steps = all.filter((st) => !S.skipSteps.has(`${st.courseId}:${st.group}`));
  if (!all.length) return null;
  if (!steps.length) return h("div", { class: "card wiz" }, h("h2", {}, "Confirm your sections"),
    h("div", { class: "hint" }, `${all.length} left that you weren't sure about. `, h("button", { class: "linkish", onclick: () => { S.skipSteps.clear(); draw(); } }, "Go through them again")));
  const st = steps[0];
  const rec = S.week.classes[st.courseId];
  const kind = KIND_LABEL[st.group].toLowerCase();
  const sug = suggestPicks(rec.meetings, rec.canvas || {})[st.group];
  const key = `${st.courseId}:${st.group}`;
  if (S.stepChoice?.key !== key) S.stepChoice = { key, label: sug?.label || null };
  const confirm = h("button", { class: "btn primary small", disabled: !S.stepChoice.label, onclick: () => { const l = S.stepChoice.label; S.stepChoice = null; pickSection(st.courseId, st.group, l); } }, `This is my ${kind}`);
  const opts = st.options.map((o) => {
    const ms = rec.meetings.filter((m) => m.kind === st.group && (m.section || m.label) === o);
    const clash = clashesFor(st.courseId, ms);
    const id = `opt-${key}-${o}`.replace(/[^\w-]/g, "_");
    return h("label", { class: "wiz-opt" + (S.stepChoice.label === o ? " on" : ""), for: id },
      h("input", { type: "radio", name: "wiz", id, checked: S.stepChoice.label === o, onchange: () => { S.stepChoice.label = o; draw(); } }),
      h("span", { class: "grow" },
        h("b", {}, ms[0]?.label && ms[0].label !== o && !ms[0].label.includes(o) ? `${ms[0].label} (${o})` : ms[0]?.label || o), sug?.label === o ? h("span", { class: "tag" }, "Canvas") : null,
        ms.map((m) => h("small", { class: "muted", style: { display: "block" } },
          `${m.date ? new Date(`${m.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : m.days.map((d) => DAYS[d]).join("/")} ${niceTime(m.start)}–${niceTime(m.end)}${m.location ? ` · ${m.location}` : ""}${m.who ? ` · ${m.who}` : ""}`)),
        clash.length ? h("small", { class: "clash" }, `Clashes with ${clash.join(", ")}`) : null));
  });
  return h("div", { class: "card wiz" },
    h("h2", {}, "Confirm your sections", h("span", { class: "muted", style: { fontWeight: 600, marginLeft: "6px" } }, steps.length > 1 ? `${steps.length} left` : "last one")),
    h("div", {}, h("b", {}, nameOf(st.courseId)), ` lists ${st.options.length} ${kind} options. Which one is yours?`),
    sug ? h("div", { class: "hint" }, `${sug.why}, so it's selected. Check it before confirming.`) : h("div", { class: "hint" }, "Canvas doesn't say which one is yours. Check your class schedule (registrar) if you're not sure."),
    h("div", { class: "wiz-opts", role: "radiogroup", "aria-label": `Your ${kind} for ${nameOf(st.courseId)}` }, opts),
    h("div", { class: "acts" }, confirm,
      h("button", { class: "btn soft small", onclick: () => { S.stepChoice = null; pickSection(st.courseId, st.group, "none"); } }, "None of these"),
      h("button", { class: "btn ghost small", onclick: () => { S.skipSteps.add(key); S.stepChoice = null; draw(); } }, "Not sure yet")));
}

// Study time as a list too (and a form), so it works with a keyboard or screen reader as well as by dragging.
function studyCard() {
  const blocks = [...(S.week.blocks || [])].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  const study = blocks.reduce((a, b) => a + toMin(b.end) - toMin(b.start), 0);
  const day = h("select", { name: "day", "aria-label": "Day" }, DAYS.map((d, i) => h("option", { value: i }, d)));
  const from = h("input", { type: "time", value: "18:00", "aria-label": "From", required: true });
  const to = h("input", { type: "time", value: "20:00", "aria-label": "To", required: true });
  const once = h("input", { type: "checkbox", "aria-label": "Only this week" });
  const form = h("form", { class: "add", onsubmit: async (e) => {
    e.preventDefault();
    const a = toMin(from.value), b = toMin(to.value), d = Number(day.value);
    if (a == null || b == null || b <= a) return toast("Pick a start time before the end time.");
    if (once.checked) await save({ changes: paintOnce(S.week, ymd(addDays(S.monday, d)), d, a, b) });
    else await save({ blocks: paintWeekly(S.week.blocks || [], d, a, b) });
    toast(`Added study time ${niceTime(a)}–${niceTime(b)} ${once.checked ? `this ${DAYS[d]} only` : `every ${DAYS[d]}`}.`);
  } },
    h("div", { class: "row" }, h("label", {}, "Day", day), h("label", {}, "From", from), h("label", {}, "To", to)),
    h("label", { style: { display: "flex", gap: "6px", alignItems: "center" } }, once, "Only the week shown"),
    h("button", { class: "btn small", type: "submit" }, "Add study time"));
  return h("div", { class: "card" }, h("h2", {}, "Study time"),
    h("div", {}, study ? `${Math.round((study / 60) * 10) / 10} hours a week` : "None yet."),
    h("div", { class: "hint" }, "Drag on the calendar where you're free to study, or add it here. Your study plan fills these times."),
    blocks.map((b) => h("div", { class: "mtg" }, h("span", { class: "grow" }, h("b", {}, DAYS[b.day]), " ", h("small", {}, `${niceTime(b.start)}–${niceTime(b.end)} every week`)),
      h("button", { class: "x", title: "Remove", "aria-label": `Remove study time ${DAYS[b.day]} ${niceTime(b.start)}`, onclick: () => save({ blocks: (S.week.blocks || []).filter((x) => x.id !== b.id) }) }, "×"))),
    form);
}


function courseCard(c) {
  const rec = S.week.classes?.[c.id] || { meetings: [], noClass: [] };
  const groups = sectionGroups(rec.meetings);
  const picks = S.week.picks?.[c.id] || {};
  const box = h("div", { class: "course", style: { "--c": color(c.id) } }, h("h3", {}, h("span", { class: "dot" }), c.code || c.name));
  // Announcements that may move a class: a flag to check, never a silent change.
  for (const a of timeChangeNotices((S.snapshot?.announcements || []).filter((x) => x.course_id === c.id), S.week)) {
    box.append(h("div", { class: "note warn" }, h("b", {}, "Possible change: "), h("a", { href: a.url, target: "_blank", rel: "noopener" }, a.title),
      ` (${new Date(a.posted_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}). Check it and update the times below if needed. `,
      h("button", { class: "linkish", onclick: () => save({ dismissed: [...new Set([...(S.week.dismissed || []), a.id])].slice(-200) }) }, "Got it")));
  }
  // section pickers
  for (const [g, opts] of Object.entries(groups)) {
    if (opts.length < 2) continue;
    const sel = h("select", { "aria-label": `Your ${KIND_LABEL[g].toLowerCase()} for ${c.code || c.name}`, onchange: (e) => pickSection(c.id, g, e.target.value || null) },
      h("option", { value: "" }, `Pick your ${KIND_LABEL[g].toLowerCase()}…`),
      opts.map((o) => { const m = rec.meetings.find((x) => (x.section || x.label) === o && x.kind === g); return h("option", { value: o, selected: picks[g] === o }, `${o}${m ? ` (${m.days.map((d) => DAYS[d]).join("/")} ${niceTime(m.start)})` : ""}`); }),
      h("option", { value: "none", selected: picks[g] === "none" }, "None of these"));
    box.append(h("div", { class: "pick" }, h("span", {}, `Your ${KIND_LABEL[g].toLowerCase()}:`), sel));
    const sg = picks[g] == null ? suggestPicks(rec.meetings, rec.canvas || {})[g] : null;
    if (sg) box.append(h("div", { class: "hint" }, `Canvas suggests ${sg.label}. Confirm it above.`));
  }
  // meetings, everyone's first; other sections hidden once picked
  const shown = rec.meetings.filter((m) => !CHOOSABLE.has(m.kind) || (groups[groupKey(m)]?.length || 0) < 2 || !picks[groupKey(m)] || picks[groupKey(m)] === (m.section || m.label));
  const order = (m) => KINDS.indexOf(m.kind);
  for (const m of shown.sort((a, b) => order(a) - order(b) || a.start.localeCompare(b.start))) {
    if (m.kind === "office" && !S.week.showOffice) continue;
    box.append(h("div", { class: "mtg" },
      h("span", { class: "grow" }, h("b", {}, m.label), " ", h("small", {}, `${m.date ? new Date(`${m.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : m.days.map((d) => DAYS[d]).join("/")} ${niceTime(m.start)}–${niceTime(m.end)}${m.location ? ` · ${m.location}` : ""}`)),
      h("button", { class: "x", title: "Remove", "aria-label": `Remove ${m.label}`, onclick: () => removeMeeting(c.id, m.id) }, "×")));
  }
  const offices = rec.meetings.filter((m) => m.kind === "office").length;
  if (offices && !S.week.showOffice) box.append(h("div", { class: "hint" }, `${offices} office hour${offices > 1 ? "s" : ""} (hidden; “Show office hours” at the top)`));
  if (rec.noClass?.length) box.append(h("div", { class: "hint" }, `No class on ${rec.noClass.slice(0, 4).map((d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })).join(", ")}${rec.noClass.length > 4 ? "…" : ""}`));
  if (!rec.meetings.length) box.append(h("div", { class: "hint" }, "No class times yet."));
  box.append(S.adding === c.id ? addForm(c) : h("button", { class: "linkish", style: { fontSize: ".9em" }, onclick: () => { S.adding = c.id; drawSide(); } }, "+ Add a class time"));
  return box;
}

function addForm(c) {
  const f = h("form", { class: "add", onsubmit: async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const days = fd.getAll("day").map(Number);
    const m = normalizeMeeting({ kind: fd.get("kind"), label: fd.get("label") || KIND_LABEL[fd.get("kind")], days, start: fd.get("start"), end: fd.get("end"), location: fd.get("location"), section: fd.get("label") }, { source: "manual" });
    if (!m) return toast("Pick at least one day and a start time before the end time.");
    const classes = { ...(S.week.classes || {}) };
    const rec = classes[c.id] || { meetings: [], noClass: [] };
    classes[c.id] = { ...rec, meetings: [...rec.meetings, m] };
    // A section the student adds themselves is theirs.
    const picks = { ...(S.week.picks || {}) };
    if (CHOOSABLE.has(m.kind)) picks[c.id] = { ...(picks[c.id] || {}), [groupKey(m)]: m.section || m.label };
    S.adding = null;
    await save({ classes, picks });
    toast(`Added ${m.label}.`);
  } },
    h("label", {}, "What", h("select", { name: "kind" }, KINDS.filter((k) => k !== "exam").map((k) => h("option", { value: k }, KIND_LABEL[k])))),
    h("label", {}, "Name (optional)", h("input", { name: "label", placeholder: "e.g. Section 0103" })),
    h("div", { class: "days", role: "group", "aria-label": "Days" }, DAYS.map((d, i) => h("label", {}, h("input", { type: "checkbox", name: "day", value: i }), d))),
    h("div", { class: "row" }, h("label", {}, "Starts", h("input", { type: "time", name: "start", required: true, value: "10:00" })), h("label", {}, "Ends", h("input", { type: "time", name: "end", required: true, value: "10:50" }))),
    h("label", {}, "Where (optional)", h("input", { name: "location" })),
    h("div", { class: "row" }, h("button", { class: "btn primary small", type: "submit" }, "Add"), h("button", { class: "btn ghost small", type: "button", onclick: () => { S.adding = null; drawSide(); } }, "Cancel")));
  return f;
}

// Opens the CampusPilot panel and asks it to send the request to the student's AI (the panel does the hand-off).
function findWithAI(ids = null) {
  chrome.runtime.sendMessage({ type: "OPEN_PANEL", payload: { action: "classTimes", courseIds: Array.isArray(ids) ? ids : courses().map((c) => c.id) } });
  toast("CampusPilot is gathering your syllabi for your AI. Watch the CampusPilot panel; class times appear here when your AI answers.", 9000);
}

// ---------- calendar file ----------
async function downloadIcs() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const deadlines = courses().flatMap((c) => (c.assignments || []).filter((a) => a.due_at && !a.blocked && !a.submitted).map((a) => ({ name: a.name, due_at: a.due_at, url: a.url, courseId: c.id })));
  const exams = S.exams.map((x) => { const d = new Date(x.date); return { title: x.title, courseId: x.courseId, date: ymd(d), time: x.hasTime ? hhmm(d.getHours() * 60 + d.getMinutes()) : null }; });
  const ends = courses().map((c) => terms()[c.id]?.end).filter(Boolean).sort();
  const ics = buildIcs(S.week, { courses: courses(), terms: terms(), deadlines, exams, from: S.monday, until: ends[ends.length - 1], tz });
  const zip = new ZipWriter();
  await zip.add("CampusPilot calendar.ics", ics);
  await zip.add("How to import.txt", "Open Google Calendar, Apple Calendar or Outlook and import \"CampusPilot calendar.ics\" (Google Calendar: Settings > Import & export).\nIt's a copy: if your week changes, download and import it again.\n");
  const url = URL.createObjectURL(zip.finish());
  try { await chrome.downloads.download({ url, filename: "CampusPilot/CampusPilot calendar.zip", saveAs: false }); toast("Saved to Downloads › CampusPilot. Unzip it and import the .ics file into your calendar."); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 60e3); }
}

// ---------- wiring ----------
$("#prev").onclick = () => { S.monday = addDays(S.monday, -7); draw(); };
$("#next").onclick = () => { S.monday = addDays(S.monday, 7); draw(); };
$("#today").onclick = () => { S.monday = mondayOf(new Date()); draw(); };
$("#office").onchange = (e) => save({ showOffice: e.target.checked });
$("#mode-week").onclick = () => { S.mode = "week"; draw(); };
$("#mode-once").onclick = () => { S.mode = "once"; draw(); };
$("#ics").onclick = () => downloadIcs().catch((e) => toast(e.message));
// Google Calendar: class times and planned study for the next two weeks, kept up to date (CampusPilot's own events only).
if (!chrome.runtime.getManifest().oauth2?.client_id?.startsWith("YOUR_")) {
  $("#gcal-wrap").hidden = false;
  chrome.storage.local.get("settings").then(({ settings }) => { $("#gcal").checked = !!settings?.gcalWeekSync; });
  $("#gcal").onchange = async (e) => {
    const on = e.target.checked;
    e.target.disabled = true;
    try {
      if (on && !(await send("GCAL_STATUS")).connected) await send("GCAL_CONNECT");
      await send("SAVE_SETTINGS", { gcalWeekSync: on });
      const r = await send(on ? "GCAL_PUSH_WEEK" : "GCAL_REMOVE_WEEK");
      toast(on ? `Added ${r.count} events to Google Calendar. They update when your week or plan changes.` : `Removed ${r.count} CampusPilot events from Google Calendar.`, 7000);
    } catch (err) { e.target.checked = !on; toast(err.message, 8000); }
    e.target.disabled = false;
  };
}
chrome.storage.local.onChanged.addListener((ch) => {
  if (ch.week && !S.drag) { S.week = { ...emptyWeek(), ...(ch.week.newValue || {}) }; draw(); }
  if (ch.snapshot) { S.snapshot = ch.snapshot.newValue; draw(); }
  if (ch.plan || ch.planDone || ch.planDay || ch.itemStats || ch.checklists) {
    for (const k of ["plan", "planDone", "planDay", "itemStats", "checklists"]) if (ch[k]) S.planData = { ...S.planData, [k]: ch[k].newValue };
    if (!S.drag) drawGrid();
  }
});
// Another "open My week" from the panel: focus this tab instead of opening another.
const channel = new BroadcastChannel("studypilot-week");
channel.onmessage = async (e) => { if (e.data?.type === "where") { const t = await chrome.tabs.getCurrent().catch(() => null); channel.postMessage({ type: "here", tabId: t?.id ?? null }); } };
setInterval(() => { if (!S.drag && $("#pop").hidden) drawGrid(); }, 5 * 60e3); // keep the "now" line current

enableCollapse(document.querySelector("#side"), { scope: "week" });
load().then(draw).then(canvasSections).catch((e) => { $("#grid").textContent = `Couldn't load your week: ${e.message}`; });
// Sections Canvas names in a group ("48210 [Jordan Lee] R 10:00AM ILP 4207") go on the calendar as yours, once a day.
async function canvasSections({ force = false } = {}) {
  if (!force && Date.now() - (S.week.placementsAt || 0) < 864e5) return;
  const ids = courses().map((c) => c.id);
  if (!ids.length) return;
  const places = await send("PLACEMENTS", { courseIds: ids }).catch(() => null);
  if (!places) return;
  let week = S.week;
  const before = JSON.stringify(week.classes || {});
  for (const [id, p] of Object.entries(places)) week = applyCanvasGroups(week, id, p);
  const added = JSON.stringify(week.classes || {}) !== before;
  // Weekly class meetings on the Canvas calendar: suggested, never added without a click.
  const evs = await send("CALENDAR_CLASS_TIMES", { courseIds: ids }).catch(() => []);
  const sug = meetingsFromCalendar(evs);
  const suggest = {};
  for (const [cid, ms] of Object.entries(sug)) {
    const have = week.classes?.[cid]?.meetings || [];
    const keep = ms.filter((m) => !(week.suggestNo || []).includes(sugKey(cid, m)) && !have.some((x) => x.kind === m.kind && x.start === m.start && x.days.some((d) => m.days.includes(d))));
    if (keep.length) suggest[cid] = keep;
  }
  await save({ ...week, suggest, placementsAt: Date.now() });
  if (added) toast("Added your section from your Canvas course groups.");
}
const sugKey = (cid, m) => `${cid}|${m.kind}|${m.days.join("")}|${m.start}`;

// ---------- suggestions from the Canvas calendar ----------
function suggestCard() {
  const all = Object.entries(S.week.suggest || {}).filter(([cid, ms]) => courseOf(cid) && ms.length);
  if (!all.length) return null;
  const drop = async (cid, m, add) => {
    let week = S.week;
    if (add) week = addOwnMeetings(week, cid, [m]);
    const rest = { ...(week.suggest || {}) };
    rest[cid] = (rest[cid] || []).filter((x) => x !== m && sugKey(cid, x) !== sugKey(cid, m));
    await save({ ...week, suggest: rest, suggestNo: add ? week.suggestNo || [] : [...(week.suggestNo || []), sugKey(cid, m)] });
    toast(add ? `Added to ${nameOf(cid)}.` : "Okay, it won't be suggested again.");
  };
  return h("div", { class: "card wiz" }, h("h2", {}, "On your Canvas calendar"),
    h("div", { class: "hint" }, "These repeat every week on your Canvas calendar. Add the ones that are yours."),
    all.flatMap(([cid, ms]) => ms.map((m) => h("div", { class: "wiz-opt" },
      h("span", { class: "grow" }, h("b", {}, `${nameOf(cid)} · ${m.label}`),
        h("small", { class: "muted", style: { display: "block" } }, `${m.days.map((d) => DAYS[d]).join("/")} ${niceTime(m.start)}–${niceTime(m.end)}${m.location ? ` · ${m.location}` : ""}`)),
      h("button", { class: "btn primary small", onclick: () => drop(cid, m, true) }, "Add"),
      h("button", { class: "btn ghost small", onclick: () => drop(cid, m, false) }, "Not mine")))));
}

// ---------- importing a class schedule (.ics from the school's registration site) ----------
function importIcs() {
  const input = Object.assign(document.createElement("input"), { type: "file", accept: ".ics,text/calendar" });
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const { byCourse, other } = parseScheduleIcs(await f.text(), courses());
    const n = Object.values(byCourse).reduce((x, ms) => x + ms.length, 0);
    if (!n) { toast(other.length ? `None of the classes in that file match your Canvas courses (it has ${other.slice(0, 3).join(", ")}${other.length > 3 ? "…" : ""}).` : "No classes found in that file. Download the calendar (.ics) of your class schedule from your registration site.", 9000); return; }
    let week = S.week;
    for (const [cid, ms] of Object.entries(byCourse)) week = addOwnMeetings(week, cid, ms);
    await save(week);
    toast(`Added ${n} class time${n === 1 ? "" : "s"} for ${Object.keys(byCourse).map(nameOf).join(", ")}.${other.length ? ` Not in your Canvas courses: ${other.slice(0, 3).join(", ")}${other.length > 3 ? "…" : ""}.` : ""}`, 9000);
  };
  input.click();
}
