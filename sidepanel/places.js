// Places: every feature and group of settings by the words a student might type for it ("pomodoro", "dark mode",
// "final grade"). Search (the magnifier) and Settings search both use it, so anything can be found from either.
import { state, go, toast } from "./core.js";

const settings = (find) => () => { state.settingsFind = ""; state.settingsJump = find; go("settings"); };
export const PLACES = [
  { t: "My week", s: "Your class times and study time", k: "schedule calendar classes sections timetable study time week ics", run: () => import("./weekai.js").then((m) => m.openWeek()) },
  { t: "Study plan", s: "Home › Study plan", k: "plan planner homework replan what to study when", run: () => import("./plan.js").then((m) => m.openPlanSheet()) },
  { t: "Focus timer", s: "The timer button at the top", k: "pomodoro timer focus break session stopwatch", run: () => import("./focus.js").then((m) => m.focusClick()) },
  { t: "What-If calculator", s: "Courses › a course › Grades", k: "grade calculator final exam need what if score weights percent gpa", run: () => { go("courses", { course: null }); toast("Pick a course, then Grades."); } },
  { t: "Learn, Flashcards and Test", s: "Courses › a course › a lecture", k: "quiz me practice questions flashcards test learn mastery checklist study set lecture", run: () => { go("courses", { course: null }); toast("Pick a course, then a lecture."); } },
  { t: "Review", s: "Study › Review", k: "review due mistakes missed spaced repetition", run: () => go("practice") },
  { t: "Mixed test", s: "Study › Mixed test", k: "course quiz midterm exam test several lectures", run: () => { state.cqOpen = true; go("practice"); } },
  { t: "Export courses", s: "Courses › Export courses", k: "download files zip backup submissions export course", run: () => go("courses", { course: null }) },
  { t: "Hide or reorder courses", s: "Courses › Edit", k: "hide course remove order rename old courses", run: () => { state.coursesEditing = true; go("courses", { course: null }); } },
  { t: "Choose what a course's list shows", s: "Courses › a course › the chips above the list", k: "filter lectures practice exams homework other hide items kinds", run: () => { go("courses", { course: null }); toast("Pick a course. The chips above its list turn each kind on or off."); } },
  { t: "Video speed", s: "Settings › Connections › Lecture videos", k: "playback speed faster slower 2x video recordings panopto audio", run: settings("Playback speed") },
  { t: "Theme and colors", s: "Settings › Appearance", k: "dark mode light theme color appearance glass midnight dim paper accent", run: settings("Theme for Canvas") },
  { t: "Text size and accessibility", s: "Settings › Appearance", k: "font bigger larger smaller dyslexia contrast motion accessibility", run: settings("Text size") },
  { t: "Which AI I use", s: "Settings › Your AI", k: "chatgpt claude gemini copilot ai provider fill in replies api key free google sign in built-in offline", run: settings("Your AI") },
  { t: "Gradescope", s: "Settings › Connections", k: "gradescope turned in submitted graded", run: settings("Gradescope") },
  { t: "Jupyter notebooks", s: "Settings › Connections", k: "jupyterhub datahub notebook hub", run: settings("Jupyter notebooks") },
  { t: "Google Calendar", s: "Settings › Connections", k: "gcal google calendar events deadlines", run: settings("Google Calendar") },
  { t: "Canvas address and access token", s: "Settings › Connections", k: "canvas url school connect token login", run: settings("Canvas address") },
  { t: "Notifications", s: "Settings › Advanced › Alerts", k: "alerts notifications notify changes grade posted", run: settings("Notify me") },
  { t: "Sync between computers", s: "Settings › Account & sync", k: "google sign in sync drive account another computer", run: settings("Account & sync") },
  { t: "What CampusPilot adds to Canvas pages", s: "Settings › Advanced", k: "dashboard due soon announcements to do recent grades practice buttons canvas page", run: settings("On Canvas pages") },
  { t: "Export my study data for an AI", s: "Settings › Advanced", k: "export study data file ai", run: settings("Export my study data") },
  { t: "Back up or delete my data", s: "Settings › Advanced › Data & privacy", k: "delete erase reset privacy backup import restore", run: settings("Data & privacy") },
  { t: "Your plan on the Canvas calendar", s: "On Canvas: Calendar › the Your plan button", k: "canvas calendar plan overlay month week", run: () => toast("Open the Calendar in Canvas. Your plan is drawn on it, and the Your plan button in the corner lists the next 7 days.", { ms: 9000 }) },
  { t: "Report a problem or send an idea", s: "Settings › Help & feedback", k: "report bug problem broken issue feedback idea suggestion contact support help", run: () => import("./report.js").then((m) => m.openReport()) },
  { t: "Priority and Additional lectures", s: "Courses › a course › Lectures", k: "priority additional extra optional core supplementary sort lectures", run: () => { go("courses", { course: null }); toast("Pick a course: its Lectures list has Priority and Additional buttons at the top."); } },
  { t: "Make study sets by themselves", s: "Settings › Your AI", k: "automatic background make study sets ahead auto gemini", run: settings("Make study sets by themselves") },
  { t: "Show the tour", s: "A quick walk through CampusPilot", k: "tour tutorial help guide intro how to", run: () => import("./tour.js").then((m) => m.startTour()) },
];

/** Places whose name or keywords have every word typed (matching from the start of a word). */
export function matchPlaces(q) {
  const words = String(q || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.length) return [];
  return PLACES.map((p) => {
    const name = p.t.toLowerCase().split(/[^a-z0-9]+/), all = `${p.t} ${p.k} ${p.s}`.toLowerCase().split(/[^a-z0-9]+/);
    if (!words.every((w) => all.some((x) => x.startsWith(w)))) return null;
    return { p, score: words.filter((w) => name.some((x) => x.startsWith(w))).length };
  }).filter(Boolean).sort((a, b) => b.score - a.score).map((x) => x.p);
}
