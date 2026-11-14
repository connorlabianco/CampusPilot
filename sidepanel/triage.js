// Sorting a course's items into Lectures (Priority or Additional), Practice exams, Homework and Other, with the
// cheapest model (Gemma, on the student's own Gemini key). Two passes, cheapest first:
//   1. Titles: the title rules (lib/lecturekind.js) place most items for free. Items they can't place go to Gemma
//      with their titles, section names and kinds only, in one request per course.
//   2. First page: Canvas pages (often only a list of links) and items still unclear are read: the first ~1,200
//      characters of their text go to Gemma, which says whether there's real material to study, and whether it's core.
// The student's own choices always win. Results: chrome.storage.local.aiKinds[key] = { kind, tier, by, study }.
import { state, send, ai, rerender } from "./core.js";
import { KINDS, unsureKind, unsureTier, lectureKind, needsContentCheck, aiKindOf } from "../lib/lecturekind.js";

const KIND_OK = new Set(KINDS.map(([k]) => k));
const TIER_OK = new Set(["priority", "additional"]);
const running = new Set();
export const isTriaging = (courseId) => running.has(courseId);

const KIND_HELP = `- "lecture": lecture slides, notes, recordings or written course material a student studies from
- "exam": practice exams, past exams, review sheets, exam solutions
- "homework": assignments, problem sets, labs, projects, discussion-section worksheets
- "other": syllabus, schedules, policies, forms, lists of links, announcements, anything with nothing to study`;
const TIER_HELP = `For "lecture" items also give "tier": "priority" for the course's core material (what the lectures teach and exams test), "additional" for optional or supplementary material (extra readings, bonus slides, enrichment, background).`;

async function ask(text) {
  const { generate } = await import("../lib/gemini.js");
  const reply = (await generate([{ role: "user", parts: [{ text }] }], { kind: "small", json: true })).text;
  return JSON.parse((String(reply).match(/\{[\s\S]*\}/) || ["{}"])[0]);
}
const store = async () => chrome.storage.local.get(["aiKinds", "aiKindsAsked", "aiReadAsked"]);

/**
 * Sorts what's still unclear in one course. Gemini only (it runs by itself); a no-op otherwise.
 * { content: false } skips pass 2 (reading first pages). Returns how many items changed.
 */
export async function triageCourse(c, list, { content = true, maxRead = 12 } = {}) {
  if (!ai().direct || running.has(c.id) || !list?.length) return 0;
  running.add(c.id);
  let changed = 0;
  try {
    const { aiKinds = {}, aiKindsAsked = {}, aiReadAsked = {} } = await store();
    const s = state.settings;
    const mine = (l) => (s.lectureKindOverride || {})[l.key] || (s.moduleKindOverride || {})[`${c.id}:${String(l.module || "").trim()}`];
    // 1. titles
    const asked = new Set(aiKindsAsked[c.id] || []);
    const kindNow = (l) => lectureKind(l, {}, {}, aiKinds);
    const todo = list.filter((l) => !mine(l) && !asked.has(l.key) && !aiKinds[l.key] && (unsureKind(l) || (kindNow(l) === "lecture" && unsureTier(l)))).slice(0, 120);
    if (todo.length) {
      try {
        const o = await ask(`Sort each item from a university course's Canvas modules into one kind:\n${KIND_HELP}\n${TIER_HELP}\nSet "sure" to false when the title and section don't really say what it is.\n\nCourse: ${c.code || c.name}\n${todo.map((l, i) => JSON.stringify({ i, title: l.title, section: l.module, type: l.type })).join("\n")}\n\nReply with ONLY this JSON: {"kinds":[{"i":0,"kind":"lecture","tier":"priority","sure":true}]}`);
        for (const k of o.kinds || []) {
          const l = todo[Number(k.i)];
          if (!l || !KIND_OK.has(k.kind)) continue;
          aiKinds[l.key] = { kind: k.kind, tier: TIER_OK.has(k.tier) ? k.tier : null, by: "title", sure: k.sure !== false };
          changed++;
        }
        aiKindsAsked[c.id] = [...asked, ...todo.map((l) => l.key)].slice(-2000);
        await chrome.storage.local.set({ aiKinds, aiKindsAsked });
      } catch { /* the title rules stay in charge */ }
    }
    // 2. first pages
    if (content) {
      const read = new Set(aiReadAsked[c.id] || []);
      const want = list.filter((l) => !mine(l) && !read.has(l.key) && aiKinds[l.key]?.by !== "content"
        && ["lecture", "other"].includes(kindNow(l)) && (needsContentCheck(l) || aiKinds[l.key]?.sure === false)).slice(0, maxRead);
      if (want.length) {
        const snips = await send("LECTURE_SNIPPETS", { courseId: c.id, lectures: want }).catch(() => []);
        const have = want.map((l, i) => ({ l, s: snips[i] })).filter((x) => x.s?.text != null);
        for (let i = 0; i < have.length; i += 6) {
          const batch = have.slice(i, i + 6);
          try {
            const o = await ask(`Here is the start of some items from a university course's Canvas modules. For each, decide what it is, and whether it has real material a student would study (explanations, worked examples, definitions, lecture content), not just links, dates, logistics or instructions.\n${KIND_HELP}\n${TIER_HELP}\n\nCourse: ${c.code || c.name}\n\n${batch.map(({ l, s: sn }, j) => `### Item ${j}\nTitle: ${l.title}\nSection: ${l.module || "(none)"}\nType: ${l.type}${sn.pages ? ` (${sn.pages} ${sn.unit || "page"}s)` : ""}\nStart of its text:\n"""${String(sn.text).slice(0, 1200) || "(no text: images only, or empty)"}"""`).join("\n\n")}\n\nReply with ONLY this JSON: {"items":[{"i":0,"kind":"lecture","tier":"priority","study":true}]}`);
            for (const k of o.items || []) {
              const x = batch[Number(k.i)];
              if (!x || !KIND_OK.has(k.kind)) continue;
              const study = k.study !== false;
              // a page with nothing to study is "other", whatever its title says
              aiKinds[x.l.key] = { kind: !study && k.kind === "lecture" ? "other" : k.kind, tier: TIER_OK.has(k.tier) ? k.tier : null, by: "content", study };
              changed++;
            }
          } catch { /* next time */ }
        }
        const latest = (await store()).aiReadAsked || {};
        latest[c.id] = [...new Set([...(latest[c.id] || []), ...want.map((l) => l.key)])].slice(-3000);
        await chrome.storage.local.set({ aiKinds: { ...(await store()).aiKinds, ...aiKinds }, aiReadAsked: latest });
      }
    }
    if (changed) { state.aiKinds = aiKinds; if (state.course === c.id || state.tab === "today") rerender(); }
  } finally { running.delete(c.id); }
  return changed;
}

/** Every visible course, a little at a time (called when Home opens). */
let lastSweep = 0;
export async function triageAll(courses, lecturesFor) {
  if (!ai().direct || Date.now() - lastSweep < 10 * 60e3) return;
  lastSweep = Date.now();
  for (const c of courses) {
    const list = await lecturesFor(c.id).catch(() => null);
    if (list) await triageCourse(c, list).catch(() => {});
  }
}
export { aiKindOf };
