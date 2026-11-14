// "Download my CampusPilot data": everything CampusPilot keeps about your studying, as one Markdown file an AI can read
// (and a person can too). Leaves out secrets (Canvas token) and anything not about your studying.
import { send, visibleSnapshot, plural } from "./core.js";
import { lectureMastery, itemLevel } from "../lib/checklist.js";
import { allQuestions, allQuizzes, isMistake, accuracy, bestPct } from "../lib/quiz.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const when = (t) => (t ? new Date(t).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const day = (t) => (t ? new Date(t).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "");
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const cell = (s) => clean(s).replace(/\|/g, "/");
const table = (head, rows) => rows.length ? [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n") : "_None._";
const hhmm = (t) => { const [h, m] = String(t || "").split(":").map(Number); if (Number.isNaN(h)) return t || ""; return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`; };

export async function studyDataMarkdown() {
  const st = await chrome.storage.local.get(["settings", "checklists", "itemStats", "week", "plan", "planDone", "planDay", "planSizes", "studyLog", "ledger", "examEdits"]);
  const s = st.settings || {};
  const snap = visibleSnapshot();
  const courses = snap?.courses || [];
  const name = (id) => { const c = courses.find((x) => String(x.id) === String(id)); return c ? c.code || c.name : `Course ${id}`; };
  const exams = await send("ALL_EXAMS").catch(() => []);
  const qs = await allQuestions().catch(() => []);
  const quizzes = await allQuizzes().catch(() => []);
  const rule = (id) => (s.masteryLevel || {})[id] || "solid";
  const out = [];

  out.push(`# My CampusPilot data
_Downloaded ${when(Date.now())}. CampusPilot is a study helper for Canvas courses. This file is everything it keeps about my studying, so an AI can help me with it._

**How to read this file:** "Courses" has grades and what's due. "Lecture mastery" lists each lecture's checklist (what to learn) and how well I know each item: new (not practiced), learning, review (missed last time) or mastered. "Practice" has my question history and the questions I keep missing. "My week" is my class schedule and the times I set aside to study. "Study plan" is the plan CampusPilot is following. Times are in my local time zone (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`);

  // Courses
  out.push("## Courses");
  for (const c of courses) {
    const open = (c.assignments || []).filter((a) => !a.submitted && a.due_at && Date.parse(a.due_at) > Date.now() - 7 * 864e5).sort((a, b) => a.due_at.localeCompare(b.due_at));
    const grade = c.current_score != null ? `${c.current_score}%${c.current_grade ? ` (${c.current_grade})` : ""}` : "not shown";
    const cats = st.ledger?.[c.id]?.state?.mode === "percent" ? (st.ledger[c.id].state.rows || []).filter((r) => Number(r.w) > 0).map((r) => `${r.name} ${r.w}%`) : [];
    out.push(`### ${c.name}${c.code && c.code !== c.name ? ` (${c.code})` : ""}
- Current grade in Canvas: ${grade}${cats.length ? `\n- Grade weights: ${cats.join(", ")}` : ""}
- Not turned in yet:
${open.length ? open.slice(0, 25).map((a) => `  - ${clean(a.name)}: due ${when(a.due_at)}${a.points ? `, ${a.points} pts` : ""}${Date.parse(a.due_at) < Date.now() ? " (overdue)" : ""}`).join("\n") : "  - nothing"}`);
  }
  out.push(`### Exams\n${table(["Course", "Exam", "Date"], exams.map((e) => [e.course, e.title, e.hasTime === false ? day(e.date) : when(e.date)]))}`);

  // Lecture mastery
  out.push("## Lecture mastery");
  const recs = Object.entries(st.checklists || {}).filter(([, r]) => courses.some((c) => String(c.id) === String(r.courseId)));
  if (!recs.length) out.push("_No lecture checklists yet._");
  for (const c of courses) {
    const mine = recs.filter(([, r]) => String(r.courseId) === String(c.id));
    if (!mine.length) continue;
    out.push(`### ${c.code || c.name} (mastery level: ${rule(c.id)})`);
    for (const [key, r] of mine) {
      const stats = st.itemStats?.[key] || {};
      const m = lectureMastery(r.cl, stats, rule(c.id));
      const unit = r.unit === "cell" ? "cell" : "slide";
      out.push(`#### ${clean(r.lecture?.title || key)}\n${m.mastered} of ${m.total} items mastered, ${m.learning} learning, ${m.review} to review, ${m.fresh} not practiced yet.`);
      const rows = [];
      for (const sec of r.cl.sections || []) for (const it of sec.items || []) {
        const hist = stats[it.id] || [];
        const right = hist.filter((x) => x.ok).length;
        rows.push([sec.title, it.text, (it.slides || []).length ? `${unit} ${(it.slides || []).join(", ")}` : "", itemLevel(hist, rule(c.id)), hist.length ? `${right}/${hist.length} right` : ""]);
      }
      out.push(table(["Section", "What to learn", "Where", "Status", "Answers"], rows));
      if (r.cl.terms?.length) out.push(`Key terms: ${r.cl.terms.map((t) => `**${clean(t.term)}**: ${clean(t.def)}`).join("; ")}`);
    }
  }

  // Practice
  out.push("## Practice");
  const seen = qs.filter((q) => q.seen);
  const acc = accuracy(seen);
  out.push(`${plural(qs.length, "question")} saved, ${seen.length} answered at least once${seen.length ? `, about ${Math.round((acc || 0) * 100)}% right` : ""}.`);
  const missed = qs.filter(isMistake).sort((a, b) => (b.wrong || 0) - (a.wrong || 0)).slice(0, 40);
  if (missed.length) out.push(`### Questions I keep missing\n${missed.map((q) => `- (${name(q.courseId)}) ${clean(q.prompt || q.q || q.front).slice(0, 300)}${["string", "number"].includes(typeof q.answer) ? `\n  - Answer: ${clean(q.answer).slice(0, 200)}` : ""}\n  - Wrong ${q.wrong || 0} time${(q.wrong || 0) === 1 ? "" : "s"}`).join("\n")}`);
  if (quizzes.length) out.push(`### Quizzes\n${table(["Course", "Quiz", "Questions", "Best score", "Last taken"], quizzes.slice(-40).map((z) => [name(z.courseId), `${z.scopeTitle || ""} ${z.name || ""}`, z.questionIds?.length || 0, bestPct(z) != null ? `${Math.round(bestPct(z) * 100)}%` : "not taken", z.attempts?.length ? day(z.attempts[z.attempts.length - 1].at) : ""]))}`);

  // Focus time
  const log = (st.studyLog || []).filter((r) => r.at > Date.now() - 28 * 864e5);
  if (log.length) {
    const byDay = {};
    for (const r of log) { const k = new Date(r.at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); byDay[k] = (byDay[k] || 0) + r.minutes; }
    out.push(`## Focus timer (last 4 weeks)\n${table(["Day", "Minutes"], Object.entries(byDay))}`);
  }

  // My week
  const wk = st.week || {};
  out.push("## My week");
  const classRows = [];
  for (const c of courses) {
    const rec = wk.classes?.[c.id];
    if (!rec) continue;
    const picks = wk.picks?.[c.id] || {};
    for (const m of rec.meetings || []) {
      const choosable = ["section", "lab"].includes(m.kind) || (m.kind === "lecture" && m.section);
      if (choosable && picks[m.kind] && picks[m.kind] !== (m.section || m.label)) continue; // another section, not mine
      if (m.kind === "office" && !wk.showOffice) continue;
      classRows.push([c.code || c.name, m.label, m.date ? day(m.date) : (m.days || []).map((d) => DAYS[d]).join("/"), `${hhmm(m.start)}–${hhmm(m.end)}`, m.location || "",
        choosable && !picks[m.kind] ? "one of several options (not picked yet)" : ""]);
    }
  }
  out.push(`### Classes\n${table(["Course", "What", "Days", "Time", "Where", "Note"], classRows)}`);
  out.push(`### Study time I set aside\n${table(["Day", "Time"], (wk.blocks || []).map((b) => [DAYS[b.day], `${hhmm(b.start)}–${hhmm(b.end)}`]))}`);

  // Study plan
  if (st.plan?.tasks?.length) {
    const done = st.planDone || {};
    out.push(`## Study plan\nMade ${day(st.plan.at)}${st.plan.advice ? `. Advice from my AI: ${clean(st.plan.advice)}` : ""}`);
    out.push(table(["Task", "Planned minutes", "Minutes done", "Start after", "Finish by"], st.plan.tasks.map((t) => [t.title, t.minutes, done[t.ref] || 0, t.earliest || "", t.latest || ""])));
    if (st.planDay?.chunks?.length) out.push(`### Today (${st.planDay.date})\n${st.planDay.chunks.map((c) => `- [${c.done ? "x" : " "}] ${hhmm(c.start)}–${hhmm(c.end)} ${clean(c.title)}`).join("\n")}`);
    const sizes = Object.entries(st.planSizes || {});
    if (sizes.length) out.push(`### How long assignments take (my AI's estimates)\n${sizes.map(([, v]) => `- ${v.hours} h${v.hard ? `; hardest part: ${clean(v.hard)}` : ""}${(v.parts || []).length ? `\n  - ${v.parts.map(clean).join("\n  - ")}` : ""}`).join("\n")}`);
  }
  return out.join("\n\n") + "\n";
}

export async function downloadStudyData() {
  const md = await studyDataMarkdown();
  const d = new Date(), pad = (x) => String(x).padStart(2, "0");
  const fname = `campuspilot-data-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.md`;
  const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
  try { await chrome.downloads.download({ url, filename: fname, saveAs: true }); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 60e3); }
  return { name: fname, size: md.length };
}
