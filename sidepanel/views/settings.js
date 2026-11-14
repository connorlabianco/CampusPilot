import { matchPlaces } from "../places.js";
import { icon } from "../../lib/icons.js";
// Settings, grouped: Your AI · Appearance · Canvas pages · Study & quizzes · Connections · Courses · Data & privacy.
import { h, $, state, views, send, toast, act, ai, plural, visibleSnapshot, courseName, saveSettings, sync, toggle, seg, currentLook, rerender, revealSoon, relDue,
  shortDate, fmtBytes, downloadText, today, tz, askFileHostAccess, copyText, DAY, speedControl } from "../core.js";
import { handToAI } from "../aiflow.js";
import { connOn, connPick, connFoundFor } from "../../lib/conn.js";
import { PROVIDERS } from "../../lib/ai.js";
import { DEFAULT_LOOK, SWATCHES, THEMES, FONTS, isDarkTheme } from "../../lib/look.js";
import { openWork, exportPack, exportIsEmpty, PROJECT_INSTRUCTIONS } from "../../lib/packs.js";
import { deadlinesIcs } from "../../lib/ics.js";
import { knownHubs } from "../../lib/jupyter.js";
import { allQuestions, exportBank, importBank, putQuestions, clearPractice, allQuizzes, importQuizzes, putQuizzes } from "../../lib/quiz.js";
import { canFill, requestFillPermission, hasFillPermission } from "../../lib/autofill.js";

function group(id, title, sub, ...kids) {
  const open = state.settingsOpen === id;
  return h("details", { class: "card group", open, ontoggle: (e) => { if (e.target.open) state.settingsOpen = id; } },
    h("summary", {}, h("b", {}, title), h("small", {}, sub)), h("div", { class: "group-body" }, ...kids));
}
const sw = (key, title, sub) => toggle(title, sub, !!state.settings[key], (v) => saveSettings({ [key]: v }));
function field(key, label, type = "text", attrs = {}) {
  const id = `set-${key}`;
  return [h("label", { class: "field", for: id }, label),
    h("input", { id, type, value: state.settings[key] ?? "", ...attrs, onchange: (e) => saveSettings({ [key]: type === "number" ? Number(e.target.value) : e.target.value.trim() }, false) })];
}

// ---- Settings search ----
// Looks through what's on the Settings page itself (so it can't go out of date): group names, headings, switches,
// buttons and their descriptions.
function findSettings(root, q) {
  const words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out = [], seen = new Set();
  for (const g of root.querySelectorAll("details.group")) {
    const gTitle = g.querySelector(":scope > summary b")?.textContent || "";
    let sub = "";
    const cands = [g.querySelector(":scope > summary"), ...g.querySelectorAll(".group-body .subhead, .group-body label.switch, .group-body label.field, .group-body div.field, .group-body button, .group-body summary, .group-body select, .group-body .seg, .group-body b, .group-body p, .group-body .hint, .group-body .note")].filter(Boolean);
    for (const el of cands) {
      if (el.classList.contains("subhead")) sub = el.textContent.trim();
      const text = (el.matches("select") ? el.getAttribute("aria-label") || "" : el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || !words.every((w) => text.toLowerCase().includes(w))) continue;
      if (out.some((o) => o.el.contains(el) && o.el !== g.querySelector(":scope > summary"))) continue;
      const head = (el.classList.contains("seg") ? el.getAttribute("aria-label") || sub || text : el.querySelector?.("b")?.textContent || text).trim();
      const title = head.length > 70 ? `${head.slice(0, 68)}…` : head;
      const where = [gTitle, sub && sub !== title ? sub : ""].filter(Boolean).join(" › ");
      const key = `${where}|${title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const inTitle = words.every((w) => head.toLowerCase().includes(w));
      out.push({ el, group: g, title, where: el.parentElement === g ? "" : where, rank: (el.parentElement === g ? 0 : inTitle ? 1 : 2) });
    }
  }
  return out.sort((a, b) => a.rank - b.rank).slice(0, 12);
}
function jumpTo(hit) {
  hit.group.open = true;
  for (let d = hit.el.closest("details"); d; d = d.parentElement?.closest("details")) d.open = true;
  const el = hit.el.parentElement === hit.group ? hit.group : hit.el;
  setTimeout(() => { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.classList.add("set-found"); setTimeout(() => el.classList.remove("set-found"), 2600); }, 60);
}
function showFound(root, box) {
  const q = (state.settingsFind || "").trim();
  if (!q) { box.replaceChildren(); return; }
  const hits = findSettings(root, q);
  // by other names ("dark mode", "pomodoro"), and features that live outside Settings
  const places = matchPlaces(q).filter((p) => !/^Settings ›/.test(p.s) || !hits.some((x) => x.rank <= 1)).slice(0, 4);
  const row = (title, where, fn) => h("button", { class: "set-hit", role: "listitem", onclick: fn }, h("b", {}, title), where ? h("small", {}, where) : null);
  box.replaceChildren(...[...hits.map((x) => row(x.title, x.where, () => jumpTo(x))), ...places.map((p) => row(p.t, p.s, () => p.run())),
    !hits.length && !places.length ? h("div", { class: "muted", style: "padding:10px 12px" }, `Nothing in Settings matches “${q}”. The magnifier at the top searches your courses.`) : null].filter(Boolean));
}

views.settings = async (root) => {
  root.replaceChildren();
  const s = state.settings;
  root.append(h("h2", { class: "page-title" }, "Settings"));
  // Search: every switch, button and heading in Settings, plus features that live elsewhere (by name).
  const found = h("div", { class: "set-results", role: "list", "aria-live": "polite" });
  const findBox = h("input", { type: "search", id: "setSearch", placeholder: "Search settings", "aria-label": "Search settings", autocomplete: "off", value: state.settingsFind || "",
    oninput: (e) => { state.settingsFind = e.target.value; showFound(root, found); } });
  root.append(h("div", { class: "set-search" }, icon("search", 16), findBox), found);
  setTimeout(() => { if (!root.isConnected) return; showFound(root, found); if (state.settingsJump) { const j = state.settingsJump; state.settingsJump = null; const hits = findSettings(root, j), hit = hits.find((x) => x.rank === 1) || hits[0]; if (hit) jumpTo(hit); } }, 350);

  // ---- Account & sync ----
  if (state.sync?.ready !== false) root.append(syncGroup()); // hidden in copies without Google sign-in set up

  // ---- Your AI ----
  const p = ai();
  const gem = h("div", {});
  import("../aisetup.js").then((m) => m.geminiSettings()).then((el) => gem.replaceChildren(el)).catch(() => {});
  const direct = p.id === "gemini-key";
  root.append(group("ai", "Your AI", p.unpicked ? "Not picked yet" : direct ? "Gemini, inside CampusPilot" : p.id === "none" ? "Copy only" : p.name,
    gem,
    direct ? toggle("Make study sets by themselves", "Gemini makes the study set for each core (Priority) lecture in the background, most urgent first, using only its careful models; when today's run out, the rest wait for tomorrow. Extra material is up to you.",
      s.autoSets === true, async (v) => { await saveSettings({ autoSets: v }); if (v) (await import("../autosets.js")).queuePriority(); }) : null,
    h("div", { class: "subhead" }, "Or use your own AI's website"),
    h("p", { class: "muted desc", style: "margin-top:0" }, "CampusPilot opens your AI in a new tab with the request ready. You press Send; quizzes and plans come back here by themselves."),
    h("div", { class: "ai-grid" }, Object.entries(PROVIDERS).filter(([id]) => id !== "gemini-key").map(([id, x]) =>
      h("button", { class: "btn secondary" + (p.id === id ? " on" : ""), "aria-pressed": p.id === id, onclick: async () => {
        const perm = state.settings.aiAutofill !== false && canFill(id) ? requestFillPermission(id) : null; // must start inside the click
        await saveSettings({ aiProvider: id }); await perm; rerender();
      } }, id === "other" ? "Other" : id === "none" ? "Just copy" : x.name))),
    p.id === "other" ? h("div", {}, ...field("aiName", "Name"), ...field("aiUrl", "Address to open", "url", { placeholder: "https://…" })) : null,
    canFill(p.id) ? fillToggle(p) : null,
    direct ? null : toggle("Pick up replies automatically", "When you come back after copying a reply, CampusPilot reads it from the clipboard. Only while it's waiting for one.", s.aiClipboard !== false, (v) => saveSettings({ aiClipboard: v })),
    h("div", { class: "row" },
      h("div", { class: "grow" }, h("label", { class: "field", for: "set-qc" }, "Questions per request"),
        h("select", { id: "set-qc", onchange: (e) => saveSettings({ quizCount: Number(e.target.value) }) }, [5, 10, 15, 20, 30].map((n) => h("option", { value: n, selected: (s.quizCount || 10) === n }, String(n))))),
      h("div", { class: "grow" }, h("label", { class: "field", for: "set-qd" }, "Difficulty"),
        h("select", { id: "set-qd", onchange: (e) => saveSettings({ quizDifficulty: e.target.value }) },
          [["introductory", "Easier"], ["mixed", "Mixed"], ["exam-level", "Exam-level"]].map(([v, l]) => h("option", { value: v, selected: (s.quizDifficulty || "mixed") === v }, l))))),
    h("p", { class: "hint" }, "For quizzes your AI writes outside lecture mastery (like practicing where you lost points). Lecture parts size themselves.")));

  // ---- Appearance ----
  root.append(group("look", "Appearance", "Theme, colors, text size",
    lookCard(),
    h("div", { class: "subhead" }, "Text and accessibility"),
    h("div", { class: "field", style: "margin-top:0" }, "Text size"),
    seg([["normal", "Normal"], ["large", "Large"], ["xl", "Extra large"]], s.textSize || "normal", async (v) => { await saveSettings({ textSize: v }); rerender(); }, "Text size"),
    h("div", { style: "height:6px" }),
    sw("readableFont", "Easy-to-read font", "Atkinson Hyperlegible with extra spacing, helpful for dyslexia"),
    sw("highContrast", "High contrast", "Stronger colors and borders"),
    sw("reduceMotion", "Reduce motion", "Turn off animations")));

  // ---- Connections ----
  root.append(group("connections", "Connections", "Canvas, Gradescope, Jupyter notebooks, videos, Google Calendar",
    h("div", { class: "subhead" }, "Canvas"),
    ...field("canvasUrl", "Canvas address", "url", { placeholder: "https://yourschool.instructure.com" }),
    h("details", { class: "adv" }, h("summary", {}, "Advanced: access token"),
      h("p", { class: "hint" }, "Only needed if syncing fails while you're logged in. Canvas › Account › Settings › + New Access Token. Stored only in this browser. Never share it."),
      ...field("canvasToken", "Access token", "password")),
    h("button", { class: "btn small soft block", style: "margin-top:8px", onclick: (e) => sync(e.currentTarget) }, "Sync now"),
    h("p", { class: "hint" }, "Which courses show up: Courses › Edit."),
    h("div", { class: "subhead" }, "Course tools"),
    h("p", { class: "hint", style: "margin-top:0" }, "CampusPilot looks at each course in Canvas and turns these on where the course uses them. Courses without them stay uncluttered. Change any course under Courses."),
    connRow("gradescope", "Gradescope", "Your submitted and graded work, and practice where you lost points", gradescopeSection),
    connRow("jupyter", "Jupyter notebooks", "Lecture notebooks from your course's JupyterHub to study, plus downloads", jupyterSection),
    videoSection(),
    calendarSection()));

  // ---- Advanced: everything most students never need to touch ----
  const { pasteCard } = await import("./practice.js");
  root.append(group("advanced", "Advanced", "Canvas pages, alerts, your data, privacy",
    h("div", { class: "subhead" }, "On Canvas pages"),
    sw("dashTodo", "Due-soon list on the dashboard", "What's due today and this week"),
    sw("replaceTodo", "Announcements instead of Canvas's To Do", "Recent announcements, unread first"),
    sw("replaceFeedback", "Recent grades instead of Recent Feedback", "New grades with scores; click to see your submission"),
    sw("hideDone", "Hide items I check off", "Only affects CampusPilot, not Canvas"),
    sw("lectureButtons", "Practice buttons on lectures", "On lecture pages, slides and each module"),
    h("p", { class: "hint" }, "Grades and due counts on course cards are under Appearance › Course cards. Video speed is under Connections › Lecture videos."),
    h("div", { class: "subhead" }, "Alerts"),
    ...(await alertsSection()),
    h("div", { class: "subhead" }, "Your study data"),
    h("button", { class: "btn small soft block", title: "One file with your lectures, what you miss, your week and your plan, written for an AI to read", onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { const r = await (await import("../mydata.js")).downloadStudyData(); toast(`Saved ${r.name}. Attach it to a chat with your AI when you want help planning or reviewing.`, { ms: 8000 }); }
      catch (err) { toast(err.message, { error: true }); } finally { b.disabled = false; }
    } }, "Export my study data for an AI"),
    pasteCard(visibleSnapshot()),
    savedFilesRow(),
    h("div", { class: "subhead" }, "Data & privacy"),
    ...dataSection()));
  // ---- Help & feedback (always visible, not folded) ----
  root.append(h("div", { class: "card help-card" }, h("div", { class: "row" },
    h("div", { class: "grow" }, h("b", {}, "Help & feedback"), h("div", { class: "meta desc" }, "Something not working, or an idea? It goes straight to CampusPilot's developer.")),
    h("button", { class: "btn small", onclick: () => import("../report.js").then((m) => m.openReport()) }, "Report a problem"))));

  // ---- Version and updates ----
  const upd = h("small", { class: "hint" });
  root.append(h("div", { class: "version-row" }, h("button", { class: "linkish", onclick: () => import("../tour.js").then((m) => m.startTour()) }, "Show the tour")));
  root.append(h("div", { class: "version-row" }, h("span", {}, `CampusPilot ${chrome.runtime.getManifest().version} · `,
      h("a", { href: "https://campuspilot.clabianco.fyi/changelog.html", target: "_blank", rel: "noopener" }, "What's new")),
    h("button", { class: "linkish", onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true; upd.textContent = "Checking…";
      const r = await send("UPDATE_CHECK").catch((err) => ({ status: "error", error: err.message }));
      upd.textContent = r.status === "update_available" ? `Version ${r.version || "new"} found. It installs by itself in a moment (CampusPilot restarts when nothing is in progress).`
        : r.status === "no_update" ? "You have the latest version."
        : r.status === "throttled" ? "Chrome already checked recently. It checks on its own every few hours and installs updates automatically."
        : "Chrome installs updates automatically every few hours. (Copies loaded from a folder don't update.)";
      b.disabled = false;
    } }, "Check for updates")), upd);
};

async function alertsSection() {
  const s = state.settings;
  const can = await chrome.permissions.contains({ permissions: ["notifications"] }).catch(() => false);
  return [
    h("p", { class: "muted desc", style: "margin-top:0" }, "Home shows what changed since you last looked: due dates that moved, new work, new grades and exam dates."),
    toggle("Notify me about important changes", "A due date moved earlier, new work due within a week, or an exam date changed", can && s.alertsNotify !== false, async (v, e) => {
      if (v && !(await chrome.permissions.request({ permissions: ["notifications"] }).catch(() => false))) { e.target.checked = false; return; }
      await saveSettings({ alertsNotify: v, alertsAsked: true }); rerender();
    }),
    can && s.alertsNotify !== false ? toggle("Also when a grade is posted", "", !!s.alertsGrades, (v) => saveSettings({ alertsGrades: v })) : null,
    h("p", { class: "hint" }, "The focus timer's chime and notification are in the timer itself."),
  ].filter(Boolean);
}
// Typing the request into the AI's chat box (needs permission for that one site).
function fillToggle(p) {
  const status = h("small", { class: "hint" });
  const t = toggle("Fill it in for me", `Puts the request and any slides straight into ${p.name}'s chat box. You still check it and press Send.`, state.settings.aiAutofill !== false, async (v, e) => {
    if (v) {
      const ok = await requestFillPermission(p.id);
      if (!ok) { e.target.checked = false; toast(`Without access to ${p.name}, CampusPilot will copy instead.`); return; }
    }
    await saveSettings({ aiAutofill: v }); rerender();
  });
  if (state.settings.aiAutofill !== false) hasFillPermission(p.id).then((ok) => { status.textContent = ok ? "" : `Turn this off and on again to allow access to ${p.name}.`; });
  return h("div", {}, t, status);
}

// ---------- Optional connections: a tick to turn each on, then which courses ----------
// One connection: the courses it's on for. CampusPilot ticks the courses where it found the connection; the student
// can tick or untick any course, and that choice stays.
function connRow(kind, title, sub, details) {
  const st = state.settings;
  const courses = visibleSnapshot()?.courses || [];
  const onIds = courses.filter((c) => connOn(st, kind, c.id)).map((c) => c.id);
  const scanned = Array.isArray(st.connFound?.[kind]);
  const status = !scanned ? "Looking at your courses…" : onIds.length ? `On for ${onIds.map((id) => courseName(id)).join(", ")}` : "Not found in your courses";
  const box = h("div", { class: "conn" + (onIds.length ? " on" : ""), "data-kind": kind },
    h("div", { class: "conn-head" },
      h("span", { class: "grow" }, h("b", {}, title), h("small", {}, status), h("small", { class: "desc" }, sub))));
  const list = h("details", { class: "conn-courses" }, h("summary", {}, "Courses"),
    h("p", { class: "muted desc", style: "margin:4px 0" }, `Ticked automatically for courses where CampusPilot finds ${title} in Canvas. Tick or untick any course; your choice stays.`),
    h("div", { class: "checks" }, courses.map((c) => h("label", {},
      h("input", { type: "checkbox", checked: connOn(st, kind, c.id), onchange: async (e) => {
        const on = e.target.checked;
        if (on && kind === "gradescope" && !(await chrome.permissions.request({ origins: ["https://www.gradescope.com/*"] }).catch(() => false))) { e.target.checked = false; return; }
        await saveSettings({ conn: connPick(state.settings, kind, c.id, on) });
        state.gsCache = {}; state.lectureCache = {}; rerender();
        if (on) import("../core.js").then((m) => m.refreshAfterConnect(kind)); // refresh and check right away
      } }),
      h("span", { class: "grow" }, c.name, connFoundFor(st, kind, c.id) ? h("small", { class: "muted" }, " · found") : null)))),
    h("button", { class: "linkish", style: "margin-top:6px", onclick: async (e) => { e.currentTarget.disabled = true; e.currentTarget.textContent = "Looking…"; await send("CONN_SCAN", { force: true }).catch(() => {}); await sync().catch(() => {}); rerender(); } }, "Look again"));
  list.addEventListener("toggle", () => { if (list.open) revealSoon(`.conn[data-kind="${kind}"] .conn-courses`); });
  box.append(list);
  if (onIds.length) box.append(h("div", { class: "conn-body" }, details()));
  return box;
}

// ---------- Calendar ----------
function calendarSection() {
  const oauthReady = !chrome.runtime.getManifest().oauth2?.client_id?.startsWith("YOUR_");
  return h("div", {},
    h("div", { class: "subhead" }, "Google Calendar"),
    !oauthReady ? h("p", { class: "hint", style: "margin-top:0" }, "Not set up in this copy of CampusPilot. You don't need it: deadlines and My week can give you a calendar file for any app.")
      : state.gcal.connected
        ? h("div", {}, h("div", { class: "row" }, h("div", { class: "grow" }, "Connected", state.gcal.email ? h("div", { class: "meta" }, state.gcal.email) : null),
            act("Disconnect", async () => { await send("GCAL_DISCONNECT"); state.gcal = { connected: false }; rerender(); }, { cls: "btn small secondary" })),
          h("div", { class: "actions" },
            act("Add deadlines", async () => { const r = await send("GCAL_PUSH_DEADLINES"); toast(`Added ${r.count} deadlines`); }, { cls: "btn small soft", busyLabel: "Adding…" }),
            act("Remove deadlines", async () => { const r = await send("GCAL_REMOVE", { kind: "deadline" }); toast(`Removed ${r.count} deadline events`); }, { cls: "btn small soft" })),
          h("p", { class: "hint" }, "To keep your class times and study plan in Google Calendar, turn it on in My week."))
        : h("div", {}, h("p", { class: "muted desc", style: "margin-top:0" }, "Adds your deadlines, class times and planned study to your own calendar. CampusPilot only changes the events it adds."),
          act("Connect Google Calendar", async () => { await send("GCAL_CONNECT"); state.gcal = await send("GCAL_STATUS"); toast("Google Calendar connected"); rerender(); }, { cls: "btn small block", busyLabel: "Opening Google…" })),
    h("button", { class: "btn small soft block", style: "margin-top:8px", onclick: () => {
      if (!state.snapshot) return toast("Sync Canvas first.", { error: true });
      downloadText(`canvas-deadlines-${today()}.ics`, deadlinesIcs(state.snapshot), "text/calendar"); toast("Open the file to import into any calendar app.");
    } }, "Download deadlines as a calendar file"));
}

// ---------- JupyterHub ----------
// Each course has its own hub, set on the course's Files page. Here: which hubs are in use, and by which courses.
function jupyterSection() {
  const s = state.settings;
  const box = h("div", { style: "margin-top:10px" }, h("div", { class: "field" }, "Hubs"));
  const hubs = knownHubs(s);
  const host = (u) => { try { return new URL(u).host; } catch { return u; } };
  if (!hubs.length) {
    box.append(h("p", { class: "muted desc", style: "margin-top:0" }, "For classes with notebooks. Each course can use its own hub: open the course's Files page and CampusPilot finds it from the course's “Open in Jupyter” links, or you type it in once. No password or token needed."));
    return box;
  }
  const map = s.jupyterHubs || {}, folders = s.jupyterCourseFolders || {};
  const coursesOn = (hub) => Object.entries(map).filter(([, x]) => x === hub).map(([id]) => courseName(Number(id) || id))
    .concat(hub === s.jupyterUrl ? Object.keys(folders).filter((id) => !map[id] && folders[id]?.length).map((id) => courseName(Number(id) || id)) : []);
  for (const hub of hubs) {
    const used = coursesOn(hub);
    box.append(h("div", { class: "row", style: "margin-bottom:6px" },
      h("div", { class: "grow" }, host(hub), h("div", { class: "meta" }, used.length ? used.join(", ") : "No course picked yet")),
      h("button", { class: "btn small secondary", onclick: async () => {
        const m = { ...map }, f = { ...folders };
        for (const [id, x] of Object.entries(m)) if (x === hub) { delete m[id]; delete f[id]; }
        if (s.jupyterUrl === hub) for (const id of Object.keys(f)) if (!map[id]) delete f[id];
        await saveSettings({ jupyterHubs: m, jupyterCourseFolders: f, jupyterUrl: s.jupyterUrl === hub ? "" : s.jupyterUrl });
        delete state.jup[hub]; rerender();
      } }, "Disconnect")));
  }
  const extra = h("input", { type: "url", placeholder: "Paste a course “git-pull” link", "aria-label": "Add a course link" });
  box.append(
    h("div", { class: "row" }, h("div", { class: "grow" }, extra), h("button", { class: "btn small secondary", onclick: async () => {
      const url = extra.value.trim();
      let ok = false; try { ok = /git-pull/.test(url) && hubs.some((x) => new URL(url).host === new URL(x).host); } catch { /* not a URL */ }
      if (!ok) return toast("That isn't a git-pull link for one of your hubs.", { error: true });
      await saveSettings({ jupyterPullLinks: [...new Set([...(s.jupyterPullLinks || []), url])] }); for (const k in state.jup) state.jup[k].links = null; extra.value = ""; toast("Link added");
    } }, "Add")),
    ...((s.jupyterPullLinks || []).length ? [h("div", { class: "hint" }, `${plural(s.jupyterPullLinks.length, "link")} you added`)] : []));
  return box;
}

// ---------- Account & sync ----------
function syncGroup() {
  const st = state.sync || {};
  const ago = (t) => { const m = Math.round((Date.now() - t) / 6e4); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
  const body = [];
  if (st.ready === false) body.push(h("p", { class: "muted", style: "margin-top:0" }, "Google sign-in isn't set up in this copy of CampusPilot yet. Whoever installed it needs to add a Google sign-in ID (see SETUP-GOOGLE.md)."));
  else if (!st.account) body.push(
    h("p", { class: "muted desc", style: "margin-top:0" }, "Sign in to keep everything the same on every computer where you use Chrome: lecture checklists and how well you know them, practice questions and quizzes, My week, your study plan and AI list, What-If calculators, exam dates, settings, and the lecture files CampusPilot has read (not videos)."),
    act("Sign in with Google", async () => { const r = await send("SYNC_SIGN_IN"); state.sync = await send("SYNC_STATUS"); state.bank = null; toast(`Signed in. Synced ${plural(r.state?.questions || 0, "question")}.`); rerender(); }, { cls: "btn block", busyLabel: "Signing in…" }),
    h("p", { class: "hint" }, "Your data goes to a private CampusPilot folder in your own Google Drive. It doesn't appear in your files, and only CampusPilot can open it. Nothing goes to any other server."));
  else body.push(
    h("div", { class: "row" }, h("div", { class: "grow" }, h("b", {}, st.account.email || "Signed in"),
      h("div", { class: "meta" }, st.state?.at ? `Synced ${ago(st.state.at)} · ${plural(st.state.questions || 0, "question")}, ${plural(st.state.quizzes || 0, "quiz", "quizzes")}` : "Not synced yet"))),
    h("div", { class: "actions" },
      act("Sync now", async () => { await send("SYNC_NOW"); state.sync = await send("SYNC_STATUS"); state.bank = null; toast("Synced"); rerender(); }, { cls: "btn small", ico: "refresh", busyLabel: "Syncing…" }),
      act("Sign out", async () => { if (!confirm("Sign out? Your data stays on this computer and in your Drive.")) return; await send("SYNC_SIGN_OUT"); state.sync = await send("SYNC_STATUS"); rerender(); }, { cls: "btn small secondary" })),
    h("p", { class: "hint" }, "Syncs every 30 minutes, after practice, and when anything changes. Lecture files CampusPilot has read (PDFs, slides, documents; never videos) are backed up there too, so your other computers can open them even when Canvas won't. Your Canvas access token (if you added one) and your Gemini key stay on this computer."));
  return group("sync", "Account & sync", st.account ? st.account.email : "Sign in to sync between computers", ...body);
}

// ---------- Lecture videos (Panopto) ----------
function videoSection() {
  const s = state.settings;
  const box = h("div", {}, h("div", { class: "subhead" }, "Lecture videos"));
  const input = h("input", { type: "text", placeholder: "e.g. yourschool.hosted.panopto.com", value: s.videoHost || "", "aria-label": "Panopto address" });
  box.append(h("p", { class: "muted desc", style: "margin-top:0" }, "If your classes are recorded in Panopto (sometimes under a school name), CampusPilot can read the captions so recorded lectures work like slides."),
    h("div", { class: "row" }, h("div", { class: "grow" }, input),
      act("Find it", async () => { const r = await send("VIDEO_DETECT"); if (r.host) { input.value = r.host; toast(`Found ${r.host}`); } else toast("No Panopto links found in your courses. Type the address from a recording's link.", { ms: 7000 }); }, { cls: "btn small soft", busyLabel: "Looking…" })),
    h("div", { class: "actions" },
      h("button", { class: "btn small", onclick: async () => {
        let host;
        try { host = new URL(/^https?:/.test(input.value.trim()) ? input.value.trim() : `https://${input.value.trim()}`).host.toLowerCase(); } catch { return toast("That doesn't look like an address.", { error: true }); }
        if (!/panopto/.test(host) && !confirm(`${host} doesn't look like a Panopto site. Use it anyway?`)) return;
        if (!(await chrome.permissions.request({ origins: [`https://${host}/*`] }).catch(() => false))) return toast("CampusPilot needs access to that site to read captions.", { error: true });
        await saveSettings({ videoHost: host }); state.videoCache = {}; toast("Connected. Recordings show on each course's Lectures page."); rerender();
      } }, s.videoHost ? "Update" : "Connect"),
      s.videoHost ? h("button", { class: "btn small secondary", onclick: async () => { await chrome.permissions.remove({ origins: [`https://${s.videoHost}/*`] }).catch(() => {}); await saveSettings({ videoHost: "" }); state.videoCache = {}; rerender(); } }, "Disconnect") : null),
    h("div", { class: "field" }, "Playback speed"),
    toggle("Speed control on videos and audio", "A small control on each lecture video or audio player, 0.25x to 16x. Keys: S slower, D faster, R reset. Changes playback speed only; nothing is skipped.", s.videoSpeedOn !== false, (v) => saveSettings({ videoSpeedOn: v })),
    speedControl(),
    toggle("Also on YouTube and Kaltura videos", "For lecture videos hosted there (asks for access to those sites)", !!s.videoSpeedMore, async (v, e) => {
      if (v && !(await chrome.permissions.request({ origins: ["https://www.youtube.com/*", "https://www.youtube-nocookie.com/*", "https://*.kaltura.com/*"] }).catch(() => false))) { e.target.checked = false; return; }
      await saveSettings({ videoSpeedMore: v });
    }),
    toggle("On every website", "Any video or audio anywhere, including mp3 files opened in a tab (asks for access to all sites; CampusPilot only adds the speed control there)", !!s.videoSpeedEverywhere, async (v, e) => {
      if (v && !(await chrome.permissions.request({ origins: ["https://*/*", "http://*/*"] }).catch(() => false))) { e.target.checked = false; return; }
      await saveSettings({ videoSpeedEverywhere: v });
    }),
    h("p", { class: "hint" }, s.videoSpeedEverywhere ? "Works on every website. For audio or video files on your computer, also turn on “Allow access to file URLs” for CampusPilot in chrome://extensions." : s.videoHost ? `Works on Canvas and ${s.videoHost}.` : "Works on Canvas, and on your lecture video site once it's connected above."),
    h("p", { class: "hint" }, "Above about 4x, Chrome mutes the sound; 16x is the most Chrome allows."));
  return box;
}

// ---------- Gradescope ----------
// "Turned in on Gradescope" checking: when it last ran, what it found, and anything it couldn't match, with Check now.
function turnedInStatus() {
  const box = h("div", { class: "gs-check" });
  const draw = (c) => {
    const when = c?.at ? new Date(c.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
    const lines = [];
    if (!c) lines.push(h("div", { class: "meta" }, "Not checked yet."));
    else if (c.state === "login") lines.push(h("div", { class: "note" }, "Gradescope wants you to log in, so CampusPilot can't see what you've turned in. ", h("button", { class: "linkish", onclick: () => send("GS_LOGIN") }, "Open Gradescope"), ", log in, then Check now."));
    else if (c.state === "permission") lines.push(h("div", { class: "note" }, "CampusPilot doesn't have access to gradescope.com. Turn Gradescope off and on again above."));
    else if (c.state === "off") lines.push(h("div", { class: "meta" }, "Turn Gradescope on for a course above."));
    else if (c.state === "error") lines.push(h("div", { class: "note" }, `Couldn't check Gradescope: ${c.error}`));
    else if (!c.courses?.length) lines.push(h("div", { class: "meta" }, `Checked ${when}: nothing open to check.`));
    else for (const r of c.courses) {
      lines.push(h("div", { class: "gs-line" }, h("b", {}, r.course || "Course"), " ",
        !r.linked ? h("span", { class: "bad-text" }, "· couldn't find this course on Gradescope. Open it on Gradescope once (from its Canvas menu), then Check now.")
          : r.error ? h("span", { class: "bad-text" }, `· ${r.error}`)
          : h("span", { class: "muted" }, `· ${plural(r.turnedIn, "item")} turned in of ${r.found} on Gradescope`)));
      if (r.unmatched?.length) lines.push(h("div", { class: "meta", style: "margin:0 0 4px 0" }, `Not found on Gradescope: ${r.unmatched.join(", ")}. If you turned these in elsewhere, tick them done on Home.`));
    }
    box.replaceChildren(h("div", { class: "row" }, h("div", { class: "grow" }, h("b", {}, "Turned-in check"), when ? h("div", { class: "meta" }, `Last checked ${when} · every 15 minutes`) : null),
      act("Check now", async () => { const snap = await send("GS_RECHECK", { force: true, linkFromCanvas: true }); if (snap?.courses) state.snapshot = snap; draw(snap?.gsLastCheck); }, { cls: "btn small soft", busyLabel: "Checking…" })), ...lines);
  };
  chrome.storage.local.get("gsLastCheck").then(({ gsLastCheck }) => draw(gsLastCheck));
  return box;
}

function gradescopeSection() {
  const GS_ORIGINS = ["https://www.gradescope.com/*"];
  const box = h("div", { style: "margin-top:10px" });
  chrome.permissions.contains({ origins: GS_ORIGINS }).then((ok) => {
    if (!ok) {
      box.append(h("p", { class: "muted desc", style: "margin-top:0" }, "Download your submitted work with graded copies. CampusPilot only reads, using your own Gradescope login."),
        h("button", { class: "btn small block", onclick: async () => { if (await chrome.permissions.request({ origins: GS_ORIGINS }).catch(() => false)) { state.gsCache = {}; rerender(); } } }, "Connect Gradescope"));
      return;
    }
    const all = state.gsAll;
    box.append(turnedInStatus());
    box.append(h("div", { class: "row" }, h("div", { class: "grow" }, "Connected", h("div", { class: "meta desc" }, "Each course's Files page has its Gradescope work.")),
      h("button", { class: "btn small secondary", onclick: async () => {
        await chrome.permissions.remove({ origins: GS_ORIGINS });
        const ids = (visibleSnapshot()?.courses || []).map((c) => c.id);
        let conn = state.settings; for (const id of ids) conn = { ...conn, conn: connPick(conn, "gradescope", id, false) };
        await saveSettings({ conn: conn.conn });
        state.gsCache = {}; state.gsAll = null; rerender();
      } }, "Disconnect")));
    if (!all) {
      box.append(act("Download everything from Gradescope…", async () => { state.gsAll = await send("GS_ALL_COURSES"); state.gsPick = new Set((state.gsAll.courses || []).map((g) => g.id)); rerender(); },
        { cls: "btn small soft block", ico: "download", busyLabel: "Loading your courses…", attrs: { style: "margin-top:8px" } }));
      return;
    }
    if (all.state === "login") {
      box.append(h("div", { class: "note" }, "Log in to Gradescope first. ", h("button", { class: "linkish", onclick: () => send("GS_LOGIN") }, "Open Gradescope"), " then try again."),
        h("button", { class: "btn small soft", onclick: () => { state.gsAll = null; rerender(); } }, "Try again"));
      return;
    }
    const terms = new Map();
    for (const g of all.courses || []) { const t = g.term || "Other"; if (!terms.has(t)) terms.set(t, []); terms.get(t).push(g); }
    const P = state.gsPick;
    box.append(h("p", { class: "muted desc" }, "Every course you pick goes into one zip, by term, course and assignment: graded copies when ready, otherwise what you turned in. Chrome asks where to save it."),
      ...[...terms].map(([term, list]) => h("div", {}, h("div", { class: "field" }, term),
        h("div", { class: "checks" }, list.map((g) => h("label", {},
          h("input", { type: "checkbox", checked: P.has(g.id), onchange: (e) => { e.target.checked ? P.add(g.id) : P.delete(g.id); } }),
          h("span", { class: "grow" }, h("b", {}, g.short), h("br"), h("small", {}, g.name))))))),
      h("div", { class: "actions" },
        act("Download selected…", async () => {
          await askFileHostAccess();
          const r = await send("GS_EXPORT_ALL", { gsIds: [...P] });
          toast(`Saved ${r.zip}: ${plural(r.added, "file")} from ${plural(r.courses, "course")}${r.failed ? `. ${plural(r.failed, "item")} couldn't be added; see “_Not included.txt”.` : "."}`, { ms: 10000 });
        }, { ico: "download", busyLabel: "Zipping…" }),
        h("button", { class: "btn small soft", onclick: () => { state.gsAll = null; rerender(); } }, "Cancel")));
  });
  return box;
}

// ---------- Data ----------

function dataSection() {
  const s = state.settings;
  const snap = visibleSnapshot();
  const out = [];

  // Question bank
  const file = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { const text = await f.text(); const list = importBank(text); await putQuestions(list); await putQuizzes(importQuizzes(text)); state.bank = null; toast(`Imported ${plural(list.length, "question")} with their progress`); }
    catch (err) { toast(err.message || "Couldn't read that file.", { error: true }); }
  } });
  out.push(h("div", { class: "subhead" }, "Practice questions"),
    h("p", { class: "hint", style: "margin-top:0" }, "To hand your study data to an AI (checklists, what you miss, your week and plan), use Study › Export for AI. To export your Canvas courses, use Courses › Export courses."),
    h("p", { class: "muted desc", style: "margin-top:0" }, state.sync?.account
      ? `Your questions, quizzes and progress are kept in this browser and synced to your private CampusPilot folder in Google Drive (${state.sync.account.email || "your account"}), so they're the same on every computer you sign in on. A backup file is a copy you keep yourself.`
      : "Your questions, quizzes and progress are kept in this browser. Sign in (Account & sync) to keep them in your Google Drive too, or save a backup file to move them yourself."),
    h("div", { class: "actions" },
      act("Save backup", async () => { const list = await allQuestions(); await downloadText(`campuspilot-questions-${today()}.json`, exportBank(list, await allQuizzes()), "application/json"); toast(`Saved ${plural(list.length, "question")}`); }, { cls: "btn small secondary" }),
      h("button", { class: "btn small secondary", onclick: () => file.click() }, "Restore backup"), file),
    act("Clear all practice progress", async () => { if (!confirm("Delete every practice question and your progress? This can't be undone.")) return; await clearPractice(); state.bank = null; toast("Practice data cleared"); }, { cls: "btn small soft block", attrs: { style: "margin-top:8px" } }));

  // Privacy
  out.push(h("div", { class: "subhead" }, "Privacy"),
    h("p", { class: "muted desc", style: "margin-top:0" }, "Your data is kept in this browser and, if you sign in, in a private CampusPilot folder in your own Google Drive. Nothing else leaves it until you send something to your AI, add events to your own calendar, or send a problem report. No analytics, no tracking."),
    act("Forget backup and download history", async () => { await send("RESET_HISTORY"); toast("History cleared. The next backup includes everything."); }, { cls: "btn small soft block" }),
    act("Clear lecture library", async () => {
      if (!confirm("Forget everything CampusPilot has read from your lectures? It re-reads them when needed.")) return;
      await send("LIBRARY_CLEAR"); state.libraryStats = null; state.lectureCache = {}; toast("Library cleared.");
    }, { cls: "btn small soft block", attrs: { style: "margin-top:6px" } }),
    h("button", { class: "btn small secondary block", style: "margin-top:6px", onclick: async () => {
      if (!confirm(`Remove all CampusPilot data from this browser, including practice progress? Canvas and your calendar aren't affected.${state.sync?.account ? " You're signed in, so your Google Drive copy stays and comes back on the next sync; sign out first if you want a fresh start here." : ""}`)) return;
      await send("LIBRARY_CLEAR").catch(() => {}); await clearPractice().catch(() => {}); await chrome.storage.local.clear(); location.reload();
    } }, "Clear all CampusPilot data"));
  return out;
}

// ---------- Canvas look ----------
async function setLook(patch) {
  await saveSettings({ look: { ...currentLook(), ...patch } });
  document.getElementById("look-card")?.replaceWith(lookCard());
}

function lookPreview(look) {
  const dark = isDarkTheme(look.theme);
  const r = { square: 4, rounded: 12, extra: 20 }[look.radius] ?? 12;
  const snap = visibleSnapshot();
  const course = snap?.courses[0] || { id: 0, name: "Your course", code: "Sync Canvas to see your courses", assignments: [] };
  const work = snap ? openWork(snap, { daysAhead: 14 }) : [];
  const dueThisWeek = (course.assignments || []).filter((a) => a.due_at && !a.submitted && Date.parse(a.due_at) > Date.now() && Date.parse(a.due_at) < Date.now() + 7 * DAY).length;
  const graded = (course.assignments || []).some((a) => a.graded) || (course.current_score ?? 0) > 0;
  const accent = look.accent || (dark ? "#7ab8ff" : "#0770a3");
  const own = look.courseColors?.[course.id];
  const none = look.cardColor === "none" || own === "none";
  const color = (own && own !== "none" ? own : null) || state.snapshot?.colors?.[course.id] || "#2d7d6e";
  const liquidDark = look.theme === "liquid-dark", liquid = look.theme === "liquid" || liquidDark;
  const minimal = look.cardMinimal || look.cardStyle === "minimal";
  const scale = Math.min(140, Math.max(70, look.cardSize || 100)) / 100;
  const heroH = minimal ? 6 : Math.round(54 * scale);
  const overlay = { gradient: "linear-gradient(135deg, rgba(255,255,255,.28), rgba(255,255,255,0) 45%, rgba(0,0,0,.28))",
    glass: "radial-gradient(120% 90% at 0% 0%, rgba(255,255,255,.45), rgba(255,255,255,0) 55%), radial-gradient(90% 80% at 100% 100%, rgba(0,0,0,.25), rgba(0,0,0,0) 60%)" }[look.cardStyle] || "none";
  const bg = liquidDark ? "radial-gradient(160px 110px at 10% 0%, #14244a, transparent 70%), radial-gradient(160px 120px at 100% 0%, #3a1840, transparent 65%), radial-gradient(200px 120px at 55% 120%, #0e3a34, transparent 70%), #0b0f1a"
    : liquid ? "radial-gradient(160px 110px at 10% 0%, #bfe0ff, transparent 70%), radial-gradient(160px 120px at 100% 0%, #ffd6ea, transparent 65%), radial-gradient(200px 120px at 55% 120%, #d3fbe6, transparent 70%), #eef3fa"
    : { dark: "#1b1c1e", midnight: "#08090a", dim: "#2e2f31", paper: "#f7f1e6" }[look.theme] || "#f5f6f8";
  const cardBg = liquidDark ? "rgba(20,24,38,.6)" : liquid ? "rgba(255,255,255,.45)" : dark ? "#232427" : look.theme === "paper" ? "#fffaf0" : "#fff";
  const ink = dark ? "#e8eaed" : "#2d3b45";
  const font = FONTS[look.font]?.css || "Lato, system-ui, sans-serif";
  const dotColor = (id) => { const c = state.settings.look?.courseColors?.[id]; return c && c !== "none" ? c : snap?.colors?.[id] || "#8a8a8a"; };
  return h("div", { class: "look-preview", style: `background:${bg};font-family:${font}`, "aria-label": "Preview" },
    h("div", { class: "lp-nav", style: `background:${liquidDark ? "rgba(12,16,28,.78)" : liquid ? "rgba(28,36,58,.62)" : look.nav || (dark ? "#2a2b2e" : "#394b58")}` }, h("span"), h("span"), h("span")),
    h("div", { class: "lp-main" },
      h("div", { class: "lp-card" + (liquid ? " liquid" : "") + (liquidDark ? " dark" : ""), style: `border-radius:${r}px;background:${cardBg};${liquid ? "" : look.cardStyle === "glass" ? "box-shadow:0 10px 24px -10px rgba(0,0,0,.45)" : minimal ? "box-shadow:none;border:1px solid rgba(127,127,127,.3)" : ""};width:${Math.round(100 * Math.min(1.15, scale))}%;flex:none` },
        h("div", { class: "lp-hero", style: none
          ? `background:${liquid ? "transparent" : "linear-gradient(135deg, rgba(127,127,127,.12), rgba(127,127,127,.03))"};height:${heroH}px;border-radius:${r}px ${r}px 0 0`
          : `background-color:${color};background-image:${minimal ? "none" : liquid ? "linear-gradient(165deg, rgba(255,255,255,.6), rgba(255,255,255,.08) 42%, transparent 60%)" : overlay};opacity:${liquid && !minimal ? .62 : 1};height:${heroH}px;border-radius:${r}px ${r}px 0 0` }),
        h("div", { class: "lp-body" },
          h("div", { class: "lp-title", style: `color:${none ? ink : color}` }, (course.name || "Course").toUpperCase().slice(0, 22)),
          h("div", { class: "lp-sub", style: `color:${ink}` }, course.code || ""),
          h("div", { class: "lp-chips" },
            look.showGrade && course.current_score != null && graded ? h("span", { class: "lp-chip", style: dark ? "background:#2c2f35;color:#e8eaed" : "" }, h("i", { style: `background:${color}` }),
              `${Math.round(course.current_score * 10) / 10}%${course.current_grade ? " " + course.current_grade : ""}`) : null,
            look.showDue && dueThisWeek ? h("span", { class: "lp-chip due", style: dark ? "background:#3e2e14;color:#ffc46b" : "" }, `${dueThisWeek} due this week`) : null))),
      h("div", { class: "lp-due" + (liquid ? " liquid" : "") + (liquidDark ? " dark" : ""), style: `border-radius:${Math.min(r, 14)}px;background:${cardBg};color:${ink}` },
        h("div", { class: "lp-due-head", style: `background:${dark || liquidDark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.035)"}` }, "Due soon"),
        h("div", { class: "lp-due-tabs" }, h("span", { class: "on", style: `color:${ink}` }, "This week"), h("span", {}, "All")),
        work.length ? work.slice(0, 2).map((a) => h("div", { class: "lp-due-row" }, h("i", { style: `background:${dotColor(a.course_id)}` }),
          h("span", { class: "lp-due-name" }, a.name), h("span", { class: "lp-due-when" }, relDue(a.due_at).text)))
          : h("div", { class: "lp-due-row muted" }, snap ? "Nothing due" : "Sync Canvas first"),
        h("div", { class: "lp-due-foot", style: `color:${accent}` }, "See all →"))));
}

function swatchRow(current, onPick, label) {
  const custom = h("input", { type: "color", value: current || "#e0603d", "aria-label": `Custom ${label} color`, onchange: (e) => onPick(e.target.value) });
  return h("div", { class: "swatches", role: "group", "aria-label": label },
    h("button", { class: "sw-btn none" + (!current ? " on" : ""), title: "Canvas default", "aria-pressed": !current, onclick: () => onPick("") }, "↺"),
    SWATCHES.map(([name, hex]) => h("button", { class: "sw-btn" + (current?.toLowerCase() === hex ? " on" : ""), title: name, "aria-label": name, "aria-pressed": current?.toLowerCase() === hex, style: `background:${hex}`, onclick: () => onPick(hex) })),
    h("label", { class: "sw-btn custom", title: "Custom color" }, "＋", custom));
}

function lookCard() {
  const look = currentLook();
  if (look.cardStyle === "minimal") { look.cardStyle = "classic"; look.cardMinimal = true; }
  const segL = (key, options) => seg(options, look[key], (v) => setLook({ [key]: v }));
  const tog = (key, title, sub) => toggle(title, sub, !!look[key], (v) => setLook({ [key]: v }));
  const courses = (state.snapshot?.courses || []).filter((c) => !(state.settings.hiddenCourses || []).includes(c.id));
  const courseRows = courses.map((c) => {
    const own = look.courseColors?.[c.id];
    const cur = (own && own !== "none" ? own : null) || state.snapshot?.colors?.[c.id] || "#8a8a8a";
    return h("label", { class: "course-color" + (own === "none" ? " is-none" : "") },
      h("input", { type: "color", value: cur, "aria-label": `${c.name} color`, onchange: (e) => setLook({ courseColors: { ...(look.courseColors || {}), [c.id]: e.target.value } }) }),
      h("span", { class: "grow" }, c.name, own === "none" ? h("small", { class: "muted" }, " · no color") : null),
      own !== "none" ? h("button", { class: "btn small secondary", title: "No color for this course", onclick: (e) => { e.preventDefault(); setLook({ courseColors: { ...(look.courseColors || {}), [c.id]: "none" } }); } }, "No color") : null,
      look.courseColors?.[c.id] ? h("button", { class: "btn small soft", onclick: (e) => { e.preventDefault(); const cc = { ...look.courseColors }; delete cc[c.id]; setLook({ courseColors: cc }); } }, "Reset") : null);
  });
  return h("div", { id: "look-card" },
    h("div", { class: "subhead" }, "Theme for Canvas and CampusPilot"),
    h("p", { class: "muted desc", style: "margin-top:0" }, "Changes show on your open Canvas tabs right away. Pictures keep their real colors."),
    isDarkTheme(look.theme) ? h("div", { class: "note" }, "The title bar and light border around this panel belong to Chrome, so CampusPilot can't color them. To make them dark too, set Chrome to Dark mode. ",
      h("button", { class: "linkish", onclick: () => chrome.tabs.create({ url: "chrome://settings/appearance" }) }, "Open Chrome's appearance settings")) : null,
    lookPreview(look),
    h("div", { class: "seg wrap", role: "group", "aria-label": "Theme" }, THEMES.map(([v, l]) => h("button", { "aria-pressed": look.theme === v, onclick: () => setLook({ theme: v }) }, l))),
    h("div", { class: "field" }, "Accent color (links, buttons)"),
    swatchRow(look.accent, (c) => setLook({ accent: c }), "Accent"),
    h("div", { class: "field" }, "Navigation bar"),
    swatchRow(look.nav, (c) => setLook({ nav: c }), "Navigation bar"),
    h("div", { class: "field" }, "Course cards"),
    segL("cardStyle", [["classic", "Classic"], ["gradient", "Gradient"], ["glass", "Glass"]]),
    h("div", { class: "slider-row" },
      h("label", { for: "cardSize" }, "Size"),
      h("input", { type: "range", id: "cardSize", min: 70, max: 140, step: 5, value: look.cardSize || 100, "aria-valuetext": `${look.cardSize || 100}%`,
        oninput: (e) => { e.target.nextSibling.textContent = `${e.target.value}%`; },
        onchange: (e) => setLook({ cardSize: Number(e.target.value) }) }),
      h("output", { for: "cardSize" }, `${look.cardSize || 100}%`)),
    tog("cardMinimal", "Minimal cards", "No picture area: a thin color strip, the course name and its buttons"),
    h("div", { style: "height:6px" }),
    segL("radius", [["square", "Square"], ["rounded", "Rounded"], ["extra", "Extra round"]]),
    h("div", { style: "height:6px" }),
    segL("cardColor", [["course", "Course colors"], ["none", "No color"]]),
    tog("hideCardImages", "Hide course images", "Show just the course color"),
    tog("showGrade", "Show my grade on cards"),
    tog("showDue", "Show what's due this week on cards"),
    tog("scrollbars", "Styled scrollbars", "Slim, rounded scrollbars that match your theme"),
    h("div", { class: "field" }, "Font"),
    h("select", { "aria-label": "Font", onchange: (e) => setLook({ font: e.target.value }) }, Object.entries(FONTS).map(([k, f]) => h("option", { value: k, selected: look.font === k }, f.label))),
    courseRows.length ? h("details", { class: "adv", style: "margin-top:10px" }, h("summary", {}, "Course colors"), h("div", { class: "checks" }, courseRows),
      h("p", { class: "hint" }, "Only changes how cards look in your browser; your Canvas colors aren't changed.")) : null,
    h("button", { class: "btn small soft block", style: "margin-top:12px", onclick: () => setLook({ ...DEFAULT_LOOK, courseColors: {} }) }, "Reset to Canvas defaults"));
}

// Lecture files kept on this computer (lib/filecache.js): how much, and a way to clear them.
function savedFilesRow() {
  const box = h("div", { class: "row", style: "margin-top:10px" });
  const draw = async () => {
    const { fileStats, clearFiles } = await import("../../lib/filecache.js");
    const s = await fileStats().catch(() => ({ count: 0, bytes: 0 }));
    box.replaceChildren(h("div", { class: "grow" }, h("b", {}, "Lecture files saved on this computer"),
      h("div", { class: "meta" }, s.count ? `${s.count} file${s.count === 1 ? "" : "s"}, ${fmtBytes(s.bytes)}. Every lecture file CampusPilot reads is kept (never videos), so slides open even when Canvas won't hand them over again.` : "None yet. Each lecture file CampusPilot reads is kept here (never videos).")),
      s.count ? h("button", { class: "btn small soft", onclick: async () => { if (!confirm("Delete the saved lecture files on this computer? They're downloaded again when needed.")) return; await clearFiles(); draw(); } }, "Clear") : null);
    // The copies in Google Drive (sync on): shared by every computer signed in to sync.
    const { syncAccount } = await chrome.storage.local.get("syncAccount");
    const drive = h("div", { class: "row", style: "margin-top:8px;width:100%" });
    box.after(drive);
    box._drive?.remove(); box._drive = drive;
    if (!syncAccount) { drive.append(h("div", { class: "meta grow" }, "Sign in under Settings › Account & sync and these files are also backed up to your Google Drive, so your other computers have them too.")); return; }
    const d = await send("DRIVE_FILES_INFO").catch(() => null);
    drive.append(h("div", { class: "grow" }, h("b", {}, "Backed up to your Google Drive"),
      h("div", { class: "meta" }, d ? `${d.count} file${d.count === 1 ? "" : "s"}, ${fmtBytes(d.bytes)}, in CampusPilot's private app folder (it doesn't show in your Drive, but counts toward your storage; up to 2 GB). Your other computers get them from here.` : "Couldn't check right now.")),
      d?.count ? h("button", { class: "btn small soft", onclick: async () => { if (!confirm("Delete the lecture files backed up to Google Drive? Your study data stays.")) return; await send("DRIVE_FILES_CLEAR").catch(() => {}); draw(); } }, "Clear") : null);
  };
  draw();
  return box;
}
