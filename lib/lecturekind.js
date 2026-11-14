// What each item in a course's modules is, so the Lectures list can show only what a student studies from:
// lectures, practice exams and reviews, homework, or everything else (syllabus, schedules, forms…).
// A student's own choice for an item (settings.lectureKindOverride[key]) always wins.
export const KINDS = [["lecture", "Lectures"], ["exam", "Practice exams"], ["homework", "Homework"], ["other", "Other"]];
export const DEFAULT_SHOWN = ["priority", "exam"];
// What the Lectures tab's buttons filter by: lectures split into Priority and Additional, then the other kinds.
export const VIEW_KINDS = [["priority", "Priority"], ["additional", "Additional"], ["exam", "Practice exams"], ["homework", "Homework"], ["other", "Other"]];
/** A saved list of shown kinds, from before lectures were split ("lecture" = both). */
export const shownSet = (saved) => new Set((saved || DEFAULT_SHOWN).flatMap((k) => (k === "lecture" ? ["priority", "additional"] : [k])));
const EXAM = /\b(practice|sample|past|old|previous|mock)\b.*\b(exams?|midterms?|finals?|quiz(zes)?|tests?)\b|\b(exams?|midterms?|finals?|tests?)\b.*\b(review|practice|solutions?|answers?|key|prep)\b|\bstudy guide\b|\breview (sheet|session|problems|questions|guide)\b|\b(midterm|final|exam) review\b/i;
const HOMEWORK = /\b(hw|homework|problem sets?|psets?|assignments?|worksheets?|labs?|projects?|solutions?|exercises?)\b/i;
const OTHER = /\b(syllabus|schedule|calendar|polic(y|ies)|welcome|office hours|resources?|rubrics?|forms?|surveys?|sign.?up|logistics|grading|contact|faq|accommodations?)\b/i;
// A whole module can be set too (settings.moduleKindOverride["<course id>:<module name>"]); a single item's choice wins.
export const moduleKey = (l) => `${String(l.key || "").split(":")[0]}:${String(l.module || "").trim()}`;
// aiKinds: what Gemma decided for items the rules below couldn't place (see unsureKind; the student's own choices win).
// An aiKinds entry is a kind ("lecture"…), decided from the title alone (used only when the rules are unsure), or
// { kind, tier, by: "content" }: decided after reading the item's first page, which outranks the title rules.
export const aiKindOf = (v) => (typeof v === "string" ? v : v?.kind || null);
export function lectureKind(l, overrides = {}, modules = {}, aiKinds = {}) {
  if (overrides[l.key]) return overrides[l.key];
  if (modules[moduleKey(l)]) return modules[moduleKey(l)];
  const ai = aiKinds[l.key];
  if (ai?.by === "content" && ai.kind) return ai.kind;
  if (aiKindOf(ai) && unsureKind(l)) return aiKindOf(ai);
  const t = String(l.title || ""), mod = String(l.module || "");
  if (EXAM.test(t)) return "exam";
  if (l.type === "Notebook") return "lecture";
  if (HOMEWORK.test(t)) return "homework";
  if (OTHER.test(t)) return "other";
  if (l.is_lecture) return "lecture";
  if (EXAM.test(mod)) return "exam";
  if (HOMEWORK.test(mod)) return "homework";
  return "other";
}

/** True when only weak hints decide the kind (no clear word in the item's own title): worth asking Gemma. */
export function unsureKind(l) {
  const t = String(l.title || "");
  if (l.type === "Notebook" || EXAM.test(t) || HOMEWORK.test(t) || OTHER.test(t) || /\b(lecture|lec|slides?|lecture notes)\b/i.test(t)) return false;
  return true;
}

// ---------- Priority or Additional (within lectures) ----------
// Priority: the course's core lectures, what exams test. Additional: optional or supplementary material (extra
// readings, bonus slides, enrichment). Titles decide most; Gemma reads the first page of the rest.
export const TIERS = [["priority", "Priority"], ["additional", "Additional"]];
const ADDITIONAL = /\b(optional|supplement(al|ary|s)?|extra|bonus|further|recommended|additional|appendix|errata|enrichment|for fun|going deeper|beyond the|if you('re| are) curious|not (on|for) the exam)\b/i;
const CORE = /\b(lecture|lec|slides?|lecture notes|notes|chapter|ch\.? ?\d+|week ?\d+|wk ?\d+|unit ?\d+|day ?\d+|class ?\d+|session ?\d+|topic ?\d+|part ?\d+|l\d{1,2})\b/i;
/** tierOverride: the student's own choice per item (settings.lectureTierOverride). */
export function lectureTier(l, overrides = {}, aiKinds = {}) {
  if (overrides[l.key]) return overrides[l.key];
  const ai = aiKinds[l.key];
  if (ai?.tier && (ai.by === "content" || unsureTier(l))) return ai.tier;
  const t = String(l.title || ""), mod = String(l.module || "");
  if (ADDITIONAL.test(t)) return "additional";
  if (CORE.test(t) || l.type === "Notebook" || l.type === "Video") return "priority";
  if (ADDITIONAL.test(mod)) return "additional";
  return l.is_lecture ? "priority" : "additional";
}
/** True when the title alone can't say whether a lecture item is core. */
export function unsureTier(l) {
  const t = String(l.title || "");
  return !(ADDITIONAL.test(t) || CORE.test(t) || l.type === "Notebook" || l.type === "Video");
}
/** Worth reading the first page: Canvas pages (often just a list of links), and items neither rule can place. */
export const needsContentCheck = (l) => l.type !== "Video" && l.type !== "Notebook" && (l.type === "Page" || (unsureKind(l) && unsureTier(l)));
