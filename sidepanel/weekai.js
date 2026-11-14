// My week: find class times with the student's AI (from the syllabus and course pages), and save them.
import { send, state, toast, plural, visibleSnapshot } from "./core.js";
import { handToAI } from "./aiflow.js";
import { classTimesPrompt, parseSchedule, mergeClasses, emptyWeek, sectionSteps, applyCanvasGroups } from "../lib/schedule.js";

export const getWeek = async () => ({ ...emptyWeek(), ...((await chrome.storage.local.get("week")).week || {}) });
export const saveWeek = async (week) => { await chrome.storage.local.set({ week: { ...week, at: Date.now() } }); };

/** courseIds: which courses (default: every visible course). One request covers them all. */
export async function findClassTimes(courseIds = null) {
  const courses = (visibleSnapshot()?.courses || state.snapshot?.courses || []).filter((c) => !courseIds || courseIds.includes(c.id));
  if (!courses.length) throw new Error("CampusPilot doesn't see any courses yet. Connect Canvas first.");
  const found = await send("CLASS_TIME_SOURCES", { courseIds: courses.map((c) => c.id) });
  // Sections Canvas already names (a group like "48210 [TA] R 10:00AM ILP 4207") go on My week right away.
  {
    let week = await getWeek();
    for (const c of found) if (c.canvas) week = applyCanvasGroups(week, c.id, c.canvas);
    await saveWeek(week);
  }
  const withText = found.filter((c) => c.text);
  if (!withText.length) throw new Error("No class times found in your syllabi or course pages. Add them yourself on My week (“Add a class time”).");
  const text = classTimesPrompt(found.map((c) => ({ id: c.id, name: c.name, text: c.text, canvas: c.canvas })));
  await handToAI(text, { expect: "schedule", title: "Class times", meta: { courses: found.map((c) => ({ id: c.id, name: c.name, code: c.code, canvas: c.canvas || null, noText: !c.text })) } });
}

export async function importSchedule(text, meta) {
  const found = parseSchedule(text, meta.courses);
  for (const c of meta.courses) if (found[c.id] && c.canvas) found[c.id].canvas = c.canvas;
  let week = mergeClasses(await getWeek(), found);
  for (const c of meta.courses) if (c.canvas) week = applyCanvasGroups(week, c.id, c.canvas);
  // Courses that came back without times: say which, and why if CampusPilot knows, so they can be asked about again.
  const short = (c) => c.code || c.name;
  const missing = meta.courses.filter((c) => !found[c.id]?.meetings.length && !week.classes?.[c.id]?.meetings?.length);
  week.lastFind = { at: Date.now(), missing: missing.map((c) => ({ id: c.id, noText: !!c.noText, skipped: !found[c.id] })) };
  await saveWeek(week);
  const got = meta.courses.length - missing.length;
  const steps = sectionSteps(week, meta.courses.map((c) => c.id));
  toast(`Class times added for ${plural(got, "course")}.${missing.length ? ` None for ${missing.map(short).join(", ")} (see My week).` : ""}${steps.length ? ` Confirm your section${steps.length > 1 ? "s" : ""} on My week, one at a time.` : ""}`, { ms: 10000 });
  openWeek();
}

/** Opens My week, or brings it to the front if it's already open. */
export async function openWeek() {
  const tabId = await new Promise((resolve) => {
    const ch = new BroadcastChannel("studypilot-week");
    const t = setTimeout(() => { ch.close(); resolve(null); }, 300);
    ch.onmessage = (e) => { if (e.data?.type === "here") { clearTimeout(t); ch.close(); resolve(e.data.tabId); } };
    ch.postMessage({ type: "where" });
  });
  if (tabId != null) { const tab = await chrome.tabs.update(tabId, { active: true }).catch(() => null); if (tab) { chrome.windows?.update(tab.windowId, { focused: true }).catch(() => {}); return; } }
  // Open it in the window the panel belongs to (the panel can outlive the window that was focused).
  const win = await chrome.windows?.getCurrent?.().catch(() => null);
  try { await chrome.tabs.create({ url: chrome.runtime.getURL("week/week.html"), active: true, ...(win?.id != null ? { windowId: win.id } : {}) }); }
  catch (e) { try { await chrome.tabs.create({ url: chrome.runtime.getURL("week/week.html") }); } catch { toast(`Couldn't open My week: ${e.message}`, { error: true }); } }
}

/** Sections named by Canvas groups, put on My week without asking the AI (runs when My week opens, once a day). */
export async function syncCanvasSections(courseIds, { force = false } = {}) {
  let week = await getWeek();
  if (!force && Date.now() - (week.placementsAt || 0) < 864e5) return false;
  const places = await send("PLACEMENTS", { courseIds }).catch(() => null);
  if (!places) return false;
  for (const [id, p] of Object.entries(places)) week = applyCanvasGroups(week, Number(id) || id, p);
  week.placementsAt = Date.now();
  await saveWeek(week);
  return true;
}
