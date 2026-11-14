// Courses: one page per course with Overview · Lectures · Grades · Files.
import { h, $, state, views, send, toast, act, ai, plural, relDue, shortDate, visibleSnapshot, openCourse, go, saveSettings, empty, tz, courseById, courseColor,
  lecturesFor, askFileHostAccess, toggle, seg, fmtBytes, panelIsDark, rerender, downloadText, today, safeFile, DAY, speedControl, confirmSize, doneButton, sync, copyText, revealSoon } from "../core.js";
import { handToAI } from "../aiflow.js";
import { bank, openSheet, lectureScope, moduleScope, courseScope, scopeStats, attachOfferCard, inScope, quizRow } from "../sheet.js";
import { openWork, exportPack, projectModuleMd, PROJECT_HOWTO, PROJECT_INSTRUCTIONS } from "../../lib/packs.js";
import { ledgerFromCanvas } from "../../lib/grades.js";
import { weightsPrompt, mistakesPrompt } from "../../lib/ai.js";
import { groupByTopFolder, filesInGroups, NOTEBOOKISH, normalizeHubUrl, hubForCourse, knownHubs, notebookDirs } from "../../lib/jupyter.js";
import { isDue, allQuizzes, quizzesFor } from "../../lib/quiz.js";
import { icon } from "../../lib/icons.js";
import { lectureMastery } from "../../lib/checklist.js";
import { connOn, connPick } from "../../lib/conn.js";
import { KINDS, VIEW_KINDS, shownSet, lectureKind, lectureTier, moduleKey, unsureKind } from "../../lib/lecturekind.js";

// Three tabs. (The old Overview repeated Today: what's due, announcements, recent grades. Exams now sit under the lectures.)
const SUBS = [["lectures", "Lectures"], ["grades", "Grades"], ["files", "Files"]];
const gradeText = (c) => {
  const graded = (c.assignments || []).some((a) => a.graded) || (c.current_score ?? 0) > 0;
  return c.current_score != null && graded ? `${Math.round(c.current_score * 10) / 10}%${c.current_grade ? " " + c.current_grade : ""}` : null;
};
const chip = (pct) => h("span", { class: "mchip", title: "Learned" }, h("i", { style: `width:${Math.round(pct * 100)}%` }));

views.courses = async (root) => {
  root.replaceChildren();
  const s = visibleSnapshot();
  if (!s) return root.append(empty("refresh", "Sync Canvas first (the refresh button)."));
  const c = state.course && courseById(state.course);
  if (c) return coursePage(root, c);
  state.course = null;

  const all = await bank();
  root.append(h("div", { class: "page-head" }, h("h2", { class: "page-title" }, "Your courses"),
    h("div", { class: "page-acts" },
      h("button", { class: "linkish", onclick: () => openExport() }, "Export courses"),
      h("button", { class: "linkish", "aria-pressed": !!state.coursesEditing, onclick: () => { state.coursesEditing = !state.coursesEditing; rerender(); if (state.coursesEditing) revealSoon(".course-edit"); } }, state.coursesEditing ? "Done" : "Edit"))));
  if (state.coursesEditing) root.append(courseEditor());
  if (!s.courses.length) root.append(empty("school", "No courses shown. Press Edit to pick your courses, or turn off “Only my favorite courses”."));
  const list = h("div", { class: "course-list" });
  for (const course of s.courses) {
    const qs = all.filter((q) => q.courseId === course.id);
    const due = qs.filter((q) => q.seen && isDue(q)).length;
    const week = (course.assignments || []).filter((a) => a.due_at && !a.submitted && Date.parse(a.due_at) > Date.now() && Date.parse(a.due_at) < Date.now() + 7 * DAY).length;
    const g = gradeText(course);
    list.append(h("button", { class: "course-tile", onclick: () => openCourse(course.id) },
      h("span", { class: "bar", style: `background:${courseColor(course.id)}` }),
      h("span", { class: "grow" }, h("b", {}, course.name), h("small", {}, [course.code !== course.name ? course.code : null, course.term].filter(Boolean).join(" · ")),
        h("span", { class: "chips" },
          g ? h("span", { class: "pill" }, g) : null,
          week ? h("span", { class: "pill week" }, `${week} due this week`) : null,
          due ? h("span", { class: "pill quiz" }, `${due} to review`) : null)),
      icon("chevron", 18)));
  }
  root.append(list);
};

// Courses › Export courses: one zip with everything from the chosen courses, laid out like Canvas, plus what
// CampusPilot can reach through the course's connections (Gradescope work, JupyterHub files, lecture transcripts).
async function openExport() {
  const dlg = $("#sheet");
  const snap = visibleSnapshot();
  const E = state.exportPick ||= { ids: new Set(snap.courses.map((c) => c.id)), transcripts: true, videoFiles: false };
  const st = state.settings;
  const close = () => dlg.close();
  const gsOn = await chrome.permissions.contains({ origins: ["https://www.gradescope.com/*"] }).catch(() => false);
  const linked = (c) => [
    gsOn && connOn(st, "gradescope", c.id) && st.gradescopeMap?.[c.id] && st.gradescopeMap[c.id] !== "none" ? "Gradescope" : null,
    connOn(st, "jupyter", c.id) && (st.jupyterCourseFolders || {})[c.id]?.length ? "JupyterHub" : null,
    st.videoHost ? "lecture videos" : null,
  ].filter(Boolean);
  const count = h("span");
  const goBtn = act("Export", async () => {
    if (!E.ids.size) throw new Error("Pick at least one course.");
    await askFileHostAccess();
    const opts = { courseIds: [...E.ids], transcripts: E.transcripts, videoFiles: E.videoFiles };
    const est = await send("FULL_BACKUP", { ...opts, estimate: true });
    const total = est.bytes + (opts.videoFiles ? est.videoBytes : 0);
    if (total > 200e6 && !confirm(`This export is about ${fmtBytes(total)} (${plural(est.items, "item")}${opts.videoFiles && est.videoCount ? ` and ${plural(est.videoCount, "recording")}` : ""}). Continue?`)) return;
    close();
    toast("Exporting. Chrome asks where to save the zip when it's ready.", { ms: 6000 });
    const r = await send("FULL_BACKUP", opts);
    const failed = r.zips.reduce((n, z) => n + z.failed, 0);
    const v = r.videos ? ` Videos: ${r.videos.done} saved${r.videos.notAllowed ? `, ${r.videos.notAllowed} not downloadable` : ""}.` : "";
    toast(`Saved ${r.zips.map((z) => z.name).join(", ")} (${plural(r.items, "item")})${failed ? `. ${plural(failed, "item")} couldn't be added; see “_Not included.txt” inside.` : "."}${v}`, { ms: 12000 });
  }, { cls: "btn block", ico: "download", busyLabel: "Gathering…" });
  const label = () => { goBtn.lastChild.textContent = ` Export ${plural(E.ids.size, "course")}`; };
  dlg.replaceChildren(h("div", { class: "sheet-in" },
    h("div", { class: "sheet-head" }, h("div", { class: "grow" }, h("b", {}, "Export courses"), h("div", { class: "meta" }, "One zip with everything from the courses you pick")),
      h("button", { class: "ghost", "aria-label": "Close", onclick: close }, icon("close", 18))),
    h("div", { class: "sheet-sec" }, h("div", { class: "sheet-label" }, "Courses"),
      h("div", { class: "checks" }, snap.courses.map((c) => h("label", {},
        h("input", { type: "checkbox", checked: E.ids.has(c.id), onchange: (e) => { e.target.checked ? E.ids.add(c.id) : E.ids.delete(c.id); label(); } }),
        h("span", { class: "grow" }, h("b", {}, c.name), linked(c).length ? h("small", { class: "meta" }, ` · with ${linked(c).join(", ")}`) : null))))),
    h("div", { class: `sheet-sec${st.videoHost ? "" : " desc"}` }, h("div", { class: "sheet-label" }, "What's in it"),
      h("ul", { class: "export-list desc" },
        h("li", {}, "A folder per course, laid out like Canvas: modules and their sections, files, pages, assignments, announcements and the syllabus."),
        h("li", {}, "Your own submissions and grades."),
        h("li", {}, "Connected courses also get their Gradescope work (graded copies with marks), their JupyterHub notebooks and data, and lecture video transcripts.")),
      st.videoHost ? h("div", { class: "checks" },
        h("label", {}, h("input", { type: "checkbox", checked: E.transcripts, onchange: (e) => { E.transcripts = e.target.checked; } }),
          h("span", { class: "grow" }, h("b", {}, "Lecture video transcripts"), h("br"), h("small", {}, "The captions of each recording, as text (small)"))),
        h("label", {}, h("input", { type: "checkbox", checked: E.videoFiles, onchange: (e) => { E.videoFiles = e.target.checked; } }),
          h("span", { class: "grow" }, h("b", {}, "Lecture video files"), h("br"), h("small", {}, "Very large. Saved next to the zip, only for recordings your instructor allows to be downloaded")))) : null,
      h("p", { class: "hint" }, "Quizzes, tests and outside tools are never opened, and locked items are skipped; both are listed in “_Not included.txt” inside.")),
    h("div", { class: "sheet-sec" }, h("div", { class: "sheet-label" }, "Saving"),
      h("p", { class: "hint", style: "margin-top:0" }, `Chrome asks where to save it. It's one zip named like course-backup-${new Date().toISOString().slice(0, 10)}_1430.zip.`),
      h("div", { class: "note desc" }, h("b", {}, "Tip: "), "unzip it and add the course folders to a Claude Project, ChatGPT Project or Gemini Gem. Your AI then has your whole course as context for every chat. ",
        h("button", { class: "linkish", onclick: async () => { await copyText(PROJECT_INSTRUCTIONS); toast("Project instructions copied. Paste them into the project's instructions."); } }, "Copy project instructions"))),
    goBtn));
  label();
  if (!dlg.open) dlg.showModal();
}

// Courses › Edit: which courses CampusPilot includes, and which get their lectures read ahead.
function courseEditor() {
  const st = state.settings;
  const hidden = new Set(st.hiddenCourses || []);
  const ahead = new Set(st.libraryCourses || []);
  const every = state.snapshot?.courses || [];
  return h("div", { class: "card course-edit" },
    h("h3", {}, "Pick your courses"),
    toggle("Only my favorite courses", "The courses you starred in Canvas. If you haven't starred any, your dashboard courses are used.", st.onlyFavorites !== false,
      async (v) => { await saveSettings({ onlyFavorites: v }); await sync(); }),
    h("p", { class: "hint" }, "Uncheck anything that isn't a class (trainings, advising pages, clubs). You can check it again any time. “Prepare” reads new slides every couple of hours so practice is instant; reading a file can mark it “viewed” in Canvas."),
    h("div", { class: "ce-head" }, h("span", { class: "grow" }, "Course"), h("span", {}, "Show"), h("span", { title: "Prepare new lectures in the background so practice is instant" }, "Prepare")),
    every.map((c) => h("div", { class: "ce-row" },
      h("span", { class: "grow" }, h("b", {}, c.name), h("small", { class: "meta" }, ` · ${plural(c.assignments.length, "assignment")}`)),
      h("input", { type: "checkbox", checked: !hidden.has(c.id), "aria-label": `Show ${c.name}`, onchange: async (e) => {
        const set = new Set(state.settings.hiddenCourses || []); e.target.checked ? set.delete(c.id) : set.add(c.id);
        await saveSettings({ hiddenCourses: [...set] }); rerender();
      } }),
      h("input", { type: "checkbox", checked: ahead.has(c.id), disabled: hidden.has(c.id), "aria-label": `Prepare ${c.name}'s lectures in the background`, onchange: async (e) => {
        if (e.target.checked) await askFileHostAccess();
        const set = new Set(state.settings.libraryCourses || []); e.target.checked ? set.add(c.id) : set.delete(c.id);
        await saveSettings({ libraryCourses: [...set] });
        if (e.target.checked) send("LIBRARY_SYNC", { courseIds: [c.id] }).catch((err) => toast(err.message, { error: true }));
      } }))),
    h("button", { class: "btn small block", style: "margin-top:10px", onclick: () => { state.coursesEditing = false; rerender(); } }, "Done"));
}

async function coursePage(root, c) {
  const sub = SUBS.some(([v]) => v === state.courseSub) ? state.courseSub : "lectures";
  root.append(h("div", { class: "course-head", style: `--cc:${courseColor(c.id)}` },
    h("button", { class: "ghost", "aria-label": "All courses", onclick: () => go("courses", { course: null }) }, icon("back", 20)),
    h("div", { class: "grow" }, h("b", {}, c.name), h("div", { class: "meta" }, [c.code !== c.name ? c.code : null, gradeText(c)].filter(Boolean).join(" · "))),
    h("a", { class: "ghost", href: `${state.settings.canvasUrl}/courses/${c.id}`, target: "_blank", "aria-label": "Open in Canvas", title: "Open in Canvas" }, icon("link", 18))));
  root.append(h("div", { class: "subtabs", role: "tablist", "aria-label": "Course sections" }, SUBS.map(([v, l]) =>
    h("button", { role: "tab", "aria-selected": sub === v, onclick: () => { state.courseSub = v; rerender(); } }, l))));
  const body = h("div", {});
  root.append(body);
  await ({ lectures, grades, files }[sub] || lectures)(body, c);
}

// ---------- Lectures ----------
async function lectures(root, c) {
  const s = state.settings;
  const on = (s.libraryCourses || []).includes(c.id);
  // One row: which kinds of things to list (remembered per course), and a "⋯" menu.
  const menuBox = h("span", { class: "lec-menu-box" });
  const kindBox = h("div", { class: "kind-chips", role: "group", "aria-label": "Show in this list" });
  root.append(h("div", { class: "card tight lec-top" }, kindBox, menuBox));
  lectureMenu(menuBox, c, null);
  // Lecture settings: folded away behind the "Settings" button in the bar above the lectures.
  if (state.lectureSettings === c.id) root.append(h("div", { class: "card lec-settings" }, h("h3", {}, "Lecture settings"),
    toggle("Prepare lectures in the background", on ? "New slides are read as they're posted, so practice is instant." : "Off: lectures are read when you use them.", on, async (want, e) => {
      if (want) {
        await askFileHostAccess();
        if (!confirm("Reading a file through Canvas can mark it as “viewed”, the same as opening it yourself. Prepare this course's lectures in the background?")) { e.target.checked = false; return; }
      }
      const set = new Set(s.libraryCourses || []); want ? set.add(c.id) : set.delete(c.id);
      await saveSettings({ libraryCourses: [...set] });
      if (want) { toast("Reading lectures… you can keep using CampusPilot."); send("LIBRARY_SYNC", { courseIds: [c.id] }).then(() => { delete state.lectureCache[c.id]; rerender(); }).catch((err) => toast(err.message, { error: true })); }
    }),
    masteryLevelPicker(c),
    autoListToggle(c),
    h("button", { class: "btn small soft block", style: "margin-top:10px", onclick: () => { state.lectureSettings = null; rerender(); } }, "Done")));
  const offer = attachOfferCard();
  if (offer) root.append(offer);

  const box = h("div", {}, empty("clock", "Loading lectures…"));
  root.append(box);
  // Recordings come after the lectures (video speed is in Settings › Connections › Lecture videos).
  const vidBox = h("div", {});
  root.append(vidBox);
  videosSection(c).then((el) => el ? vidBox.replaceWith(el) : vidBox.remove()).catch((e) => vidBox.replaceWith(h("div", { class: "note" }, `Lecture videos: ${e.message}`)));
  // Exams (dates, "Quiz me", add or remove one) sit under the lectures they cover.
  const examBox = h("div", {});
  root.append(examBox);
  examsCard(c).then((el) => examBox.replaceWith(el)).catch(() => examBox.remove());

  let list;
  try { list = await lecturesFor(c.id); } catch (e) { box.replaceChildren(empty("alert", e.message)); return; }
  if (state.course !== c.id) return;
  const qs = (await bank()).filter((q) => q.courseId === c.id);
  const quizzes = await allQuizzes(c.id).catch(() => []);
  // What to list: lectures and practice exams unless the student picked otherwise for this course.
  const over = s.lectureKindOverride || {};
  const { aiKinds = {} } = await chrome.storage.local.get("aiKinds");
  state.aiKinds = aiKinds;
  const kindOf = (l) => lectureKind(l, over, s.moduleKindOverride || {}, aiKinds);
  const viewOf = (l) => (kindOf(l) === "lecture" ? lectureTier(l, s.lectureTierOverride || {}, aiKinds) : kindOf(l));
  // Items the title rules can't place: Gemma sorts them from their titles, then reads the first page of the ones that
  // still aren't clear (Gemini only; then this list redraws).
  import("../triage.js").then((T) => T.triageCourse(c, list)).catch(() => {});
  const want = shownSet((s.lectureShow || {})[c.id]);
  const counts = Object.fromEntries(VIEW_KINDS.map(([k]) => [k, list.filter((l) => viewOf(l) === k).length]));
  kindBox.replaceChildren(...VIEW_KINDS.filter(([k]) => counts[k]).map(([k, label]) => h("button", { class: "kind-chip" + (want.has(k) ? " on" : ""), "aria-pressed": String(want.has(k)),
    title: want.has(k) ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`,
    onclick: async () => { want.has(k) ? want.delete(k) : want.add(k); await saveSettings({ lectureShow: { ...(state.settings.lectureShow || {}), [c.id]: [...want] } }); rerender(); } },
    label, h("small", {}, String(counts[k])))));
  const shown = state.arranging === c.id ? list : list.filter((l) => want.has(viewOf(l))); // arranging shows every module
  box.replaceChildren();
  const fresh = shown.filter((l) => l.is_new);
  const markSeen = fresh.length
    ? { label: `Mark ${fresh.length} new as seen`, run: async () => { await send("MARK_SEEN", { keys: fresh.map((l) => l.key) }); list.forEach((l) => (l.is_new = false)); rerender(); } } : null;
  // With Gemini running here: one click sets up every lecture in the list (checklists, then all their questions).
  // "Set up lectures…": pick some, a whole section, or all (only lectures that aren't set up yet).
  const { checklists: setUp = {} } = await chrome.storage.local.get("checklists");
  const isLecture = (l) => kindOf(l) === "lecture" && ["File", "Page", "Notebook"].includes(l.type);
  setupCtx = { courseId: c.id, isLecture, setUp, tierOf: viewOf };
  const anyTodo = list.some((l) => isLecture(l) && !setUp[l.key]);
  const setupAll = anyTodo ? { label: "Set up lectures…", run: () => openSetupSheet(c) } : null;
  lectureMenu(menuBox, c, markSeen, setupAll);
  if (!shown.length) {
    box.append(empty("inbox", list.length ? "Nothing of the kinds you picked. Tap a kind above to show it." : "No lectures found in this course's modules yet."));
    return;
  }
  drawModules(box, c, list, shown, qs, quizzes, markSeen);
}
// The "⋯" menu next to the lecture filter: mark new ones seen, arrange modules, lecture settings.
// Every lecture's checklist, one after another; each one's rounds of questions follow it (mastery.js), so each lecture
// is ready to study as soon as its turn is done. Runs in the "For your AI" list with the progress bar.
async function setupLectures(c, todo) {
  const Q = await import("../queue.js");
  // Most recent lectures first: they're what the next homework and exam need, so if the day's free requests run out,
  // those are already done.
  todo = [...todo].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  let n = 0;
  for (const l of todo) if (await Q.addJob({ kind: "checklist", courseId: c.id, course: c.code || c.name, lecture: l }, { quiet: true })) n++;
  toast(ai().direct ? `Setting up ${n} lecture${n === 1 ? "" : "s"}. Progress is in the bar at the bottom.` : `${n} lecture${n === 1 ? "" : "s"} added to your list for ${ai().name}. Press Send for each.`, { ms: 7000 });
  if (!state.queueRun && !state.pending) await Q.startQueue();
}

// The lectures tab's sections (modules) as last shown, so the sheet lists them in the same order.
let setupCtx = null, shownGroups = null;
/** "Set up lectures": the course's lectures by section, with checkboxes. only: a section's name to start with. */
function openSetupSheet(c, { only = null } = {}) {
  const ctx = setupCtx?.courseId === c.id ? setupCtx : null;
  if (!ctx) return;
  const groups = (shownGroups?.courseId === c.id ? shownGroups.groups : [])
    .map((g) => ({ name: g.name, items: g.items.filter(ctx.isLecture) })).filter((g) => g.items.length);
  const pick = new Set();
  const extra = (l) => ctx.tierOf?.(l) === "additional";
  // Priority lectures are ticked to start with; Additional ones only when the student picks them (or a section).
  for (const g of groups) if (!only || g.name === only) for (const l of g.items) if (!ctx.setUp[l.key] && (only || !extra(l))) pick.add(l.key);
  const dlg = $("#sheet");
  const body = h("div", { class: "su-list" });
  const go_ = h("button", { class: "btn block" });
  const note = h("div", { class: "hint", style: "margin-top:6px" });
  const todo = () => groups.flatMap((g) => g.items).filter((l) => pick.has(l.key));
  const box = (on, part, label, onchange, disabled = false) => {
    const cb = h("input", { type: "checkbox", checked: on, disabled, "aria-label": label, onchange });
    cb.indeterminate = !!part;
    return cb;
  };
  const draw = () => {
    const open = groups.flatMap((g) => g.items).filter((l) => !ctx.setUp[l.key]);
    const allOn = open.length && open.every((l) => pick.has(l.key));
    body.replaceChildren(
      h("label", { class: "su-all" }, box(allOn, !allOn && pick.size > 0, "All lectures", (e) => { open.forEach((l) => (e.target.checked ? pick.add(l.key) : pick.delete(l.key))); draw(); }),
        h("b", { class: "grow" }, "All lectures"), h("small", { class: "muted" }, `${open.length} to set up`)),
      ...groups.map((g) => {
        const gOpen = g.items.filter((l) => !ctx.setUp[l.key]);
        const n = gOpen.filter((l) => pick.has(l.key)).length;
        return h("div", { class: "su-group" },
          h("label", { class: "su-head" }, box(gOpen.length > 0 && n === gOpen.length, n > 0 && n < gOpen.length, g.name, (e) => { gOpen.forEach((l) => (e.target.checked ? pick.add(l.key) : pick.delete(l.key))); draw(); }, !gOpen.length),
            h("span", { class: "grow" }, g.name), h("small", { class: "muted" }, gOpen.length ? `${n} of ${gOpen.length}` : "All set up")),
          g.items.map((l) => ctx.setUp[l.key]
            ? h("div", { class: "su-row done" }, h("span", { class: "su-tick", "aria-hidden": "true" }, icon("check", 14)), h("span", { class: "grow" }, l.title), h("small", {}, "Set up"))
            : h("label", { class: "su-row" }, box(pick.has(l.key), false, l.title, (e) => { e.target.checked ? pick.add(l.key) : pick.delete(l.key); draw(); }), h("span", { class: "grow" }, l.title),
              extra(l) ? h("span", { class: "pill extra" }, "Extra") : null)));
      }));
    const pri = open.filter((l) => !extra(l)), add = open.filter(extra);
    if (pri.length && add.length) body.prepend(h("div", { class: "su-quick" },
      h("button", { class: "btn small soft", onclick: () => { pick.clear(); pri.forEach((l) => pick.add(l.key)); draw(); } }, `Priority only (${pri.length})`),
      h("button", { class: "btn small soft", onclick: () => { pick.clear(); add.forEach((l) => pick.add(l.key)); draw(); } }, `Additional only (${add.length})`)));
    const n = pick.size;
    go_.disabled = !n;
    go_.textContent = n ? `Set up ${n} lecture${n === 1 ? "" : "s"}` : "Pick lectures to set up";
    note.textContent = !n ? "" : ai().direct
      ? `Gemini does them one lecture at a time (checklist, then every round of questions): about ${n * 5} requests, a few minutes per lecture. You can study each one as soon as it's done.`
      : `Each one goes in your list for ${ai().name}; you press Send for each.`;
  };
  go_.onclick = async () => { const list = todo(); dlg.close(); await setupLectures(c, list); };
  dlg.replaceChildren(h("div", { class: "sheet-in" },
    h("div", { class: "sheet-head" }, h("div", { class: "grow" }, h("b", {}, "Set up lectures"), h("div", { class: "meta" }, only ? `Starting with ${only}. Tick more if you like.` : "Pick some, a whole section, or all of them.")),
      h("button", { class: "ghost", "aria-label": "Close", onclick: () => dlg.close() }, icon("close", 18))),
    body, h("div", { class: "su-foot" }, go_, note)));
  draw();
  if (!dlg.open) dlg.showModal();
}

function lectureMenu(boxEl, c, markSeen, setupAll = null) {
  const items = [
    setupAll ? [setupAll.label, setupAll.run] : null,
    markSeen ? [markSeen.label, markSeen.run] : null,
    [state.arranging === c.id ? "Done arranging" : "Arrange modules", () => { state.arranging = state.arranging === c.id ? null : c.id; rerender(); }],
    [state.lectureSettings === c.id ? "Close lecture settings" : "Lecture settings", () => { const open = state.lectureSettings === c.id; state.lectureSettings = open ? null : c.id; rerender(); if (!open) revealSoon(".lec-settings"); }],
  ].filter(Boolean);
  const menu = h("details", { class: "menu" },
    h("summary", { class: "btn small soft icon-only", title: "More", "aria-label": "More lecture options" }, icon("more", 16)),
    h("div", { class: "menu-list", role: "menu" }, items.map(([label, run]) => h("button", { role: "menuitem", onclick: (e) => { e.currentTarget.closest("details").open = false; run(); } }, label))));
  const away = (e) => { if (!menu.isConnected) return document.removeEventListener("click", away, true); if (menu.open && !menu.contains(e.target)) menu.open = false; };
  document.addEventListener("click", away, true);
  boxEl.replaceChildren(menu);
}

// What "mastered" means for this course's lecture checklists.
const LEVELS = {
  quick: "Right once, without a hint or looking at the lecture. For lighter courses or a quick pass.",
  solid: "Right without help on 2 different days, with 2 different questions. Good for most courses.",
  deep: "Right without help on 3 different days, with 3 different questions, including one where you apply it. For your hardest courses.",
};
function masteryLevelPicker(c) {
  const cur = (state.settings.masteryLevel || {})[c.id] || "solid";
  return h("div", { class: "mastery-level" },
    h("div", { class: "field", style: "margin:10px 0 4px" }, "In this course, “learned” means"),
    seg([["quick", "Quick"], ["solid", "Solid"], ["deep", "Deep"]], cur, async (v) => {
      await saveSettings({ masteryLevel: { ...(state.settings.masteryLevel || {}), [c.id]: v } }); rerender();
    }, "Learned means"),
    h("div", { class: "hint" }, LEVELS[cur]));
}

// New lectures in this course join the "For your AI" list (on once a checklist is made here).
function autoListToggle(c) {
  const box = h("div", {});
  chrome.storage.local.get("checklists").then(async ({ checklists = {} }) => {
    const Q = await import("../queue.js");
    const on = !!Q.autoFor(c.id, checklists);
    box.replaceChildren(toggle("Add new lectures to my AI list", on ? "Each new lecture's checklist joins Home › For your AI, ready when you are." : "Off: build checklists yourself from each lecture's menu.", on,
      async (want) => { await Q.setAuto(c.id, want); if (want) Q.checkNewLectures({ force: true }); rerender(); }));
  });
  return box;
}

// ---------- Module groups: pin, reorder, collapse and hide (per course, synced). Nothing changes in Canvas. ----------
// Until the student arranges a course, CampusPilot opens the current module and modules with new lectures,
// and collapses the rest. Anything the student sets themselves always wins.
const modId = (l) => (l.module_id != null ? `m${l.module_id}` : `n:${l.module}`);
function currentModule(list) {
  const now = Date.now() + 864e5;
  let best = null, bestAt = -1;
  for (const l of list) { const t = l.date ? Date.parse(l.date) : NaN; if (l.is_lecture && t <= now && t > bestAt) { bestAt = t; best = modId(l); } }
  if (best) return best;
  const lec = list.filter((l) => l.is_lecture).sort((a, b) => b.module_index - a.module_index)[0];
  return lec ? modId(lec) : null;
}
async function saveLayout(courseId, change) {
  const all = { ...(state.settings.moduleLayout || {}) };
  const cur = { order: [], pinned: [], hidden: [], collapsed: {}, ...(all[courseId] || {}) };
  all[courseId] = { ...cur, ...change(cur) };
  await saveSettings({ moduleLayout: all });
}
function drawModules(box, c, list, shown, qs, quizzes, markSeen = null) {
  const L = { order: [], pinned: [], hidden: [], collapsed: {}, ...((state.settings.moduleLayout || {})[c.id] || {}) };
  const arranging = state.arranging === c.id;
  const groups = new Map();
  shown.forEach((l) => { const id = modId(l); if (!groups.has(id)) groups.set(id, { id, name: l.module, index: l.module_index, items: [] }); groups.get(id).items.push(l); });
  // Canvas order is oldest first; CampusPilot shows newest first unless the student reordered.
  const byDefault = [...groups.values()].sort((a, b) => b.index - a.index);
  const pos = (g) => { const i = L.order.indexOf(g.id); return i < 0 ? -1 : i; };
  let ordered = byDefault;
  if (L.order.length) {
    const known = byDefault.filter((g) => pos(g) >= 0).sort((a, b) => pos(a) - pos(b));
    const fresh = byDefault.filter((g) => pos(g) < 0); // modules added since: on top
    ordered = [...fresh, ...known];
  }
  const pinned = L.pinned.map((id) => groups.get(id)).filter(Boolean);
  const visible = [...pinned, ...ordered.filter((g) => !L.pinned.includes(g.id) && !L.hidden.includes(g.id))];
  const hidden = ordered.filter((g) => L.hidden.includes(g.id) && !L.pinned.includes(g.id));
  const current = currentModule(list);
  const isOpen = (g) => {
    if (g.id in L.collapsed) return !L.collapsed[g.id];
    return g.id === current || g.items.some((l) => l.is_new) || (visible.length <= 3 && g.items.some((l) => l.is_lecture));
  };
  // The full order as shown (pinned first), for moving things up and down.
  const fullOrder = () => [...ordered.map((g) => g.id)];
  const move = (g, dir) => saveLayout(c.id, (cur) => {
    if (L.pinned.includes(g.id)) { const p = [...L.pinned]; const i = p.indexOf(g.id), j = i + dir; if (j < 0 || j >= p.length) return {}; [p[i], p[j]] = [p[j], p[i]]; return { pinned: p }; }
    const o = fullOrder().filter((id) => !L.pinned.includes(id) && !L.hidden.includes(id));
    const i = o.indexOf(g.id), j = i + dir; if (j < 0 || j >= o.length) return {};
    [o[i], o[j]] = [o[j], o[i]];
    // keep hidden ones where they were (at the end of the saved order)
    return { order: [...o, ...fullOrder().filter((id) => L.hidden.includes(id) || L.pinned.includes(id))] };
  }).then(rerender);

  const arrangeBtn = h("button", { class: `btn small ${arranging ? "" : "soft"}`, onclick: () => { state.arranging = arranging ? null : c.id; rerender(); } }, arranging ? "Done" : [icon("arrange", 14), " Arrange"]);
  if (arranging) box.append(h("div", { class: "mod-bar" },
    h("span", { class: "grow meta" }, "Pin, move, collapse or hide modules. Only changes CampusPilot's view."),
    (L.order.length || L.pinned.length || L.hidden.length || Object.keys(L.collapsed).length)
      ? h("button", { class: "linkish", onclick: async () => { if (!confirm("Go back to Canvas's order and CampusPilot's automatic open/closed modules?")) return; await saveLayout(c.id, () => ({ order: [], pinned: [], hidden: [], collapsed: {} })); rerender(); } }, "Reset") : null,
    arrangeBtn));


  const header = (g, i, n) => {
    const open = isOpen(g) && !arranging;
    const mq = qs.filter((q) => g.items.some((l) => l.key === q.lectureKey));
    const isPinned = L.pinned.includes(g.id);
    const count = plural(g.items.length, g.items.every((l) => l.is_lecture) ? "lecture" : "item");
    const toggle = () => saveLayout(c.id, (cur) => ({ collapsed: { ...cur.collapsed, [g.id]: open } })).then(rerender);
    return h("div", { class: `group-title mod-head${open ? " open" : ""}${isPinned ? " pinned" : ""}` },
      h(arranging ? "span" : "button", arranging ? { class: "mod-toggle" } : { class: "mod-toggle", "aria-expanded": String(open), onclick: toggle, title: open ? "Collapse" : "Expand" },
        arranging ? null : h("span", { class: "chev", "aria-hidden": "true" }, icon("chevron", 12)),
        isPinned ? h("span", { class: "pin-mark", title: "Pinned to the top" }, icon("pin", 12)) : null,
        h("span", { class: "mod-name" }, g.name),
        !open ? h("small", {}, ` · ${count}${g.items.some((l) => l.is_new) ? " · new" : ""}`) : null),
      arranging ? h("span", { class: "mod-tools" },
        h("button", { class: `ghost small${isPinned ? " on" : ""}`, title: isPinned ? "Unpin" : "Pin to the top", "aria-label": `${isPinned ? "Unpin" : "Pin"} ${g.name}`, "aria-pressed": String(isPinned),
          onclick: () => saveLayout(c.id, (cur) => ({ pinned: isPinned ? cur.pinned.filter((x) => x !== g.id) : [...cur.pinned, g.id], hidden: cur.hidden.filter((x) => x !== g.id) })).then(rerender) }, icon("pin", 16)),
        h("button", { class: "ghost small", title: "Move up", "aria-label": `Move ${g.name} up`, disabled: i === 0 || (isPinned ? i === 0 : i === pinned.length), onclick: () => move(g, -1) }, icon("up", 16)),
        h("button", { class: "ghost small", title: "Move down", "aria-label": `Move ${g.name} down`, disabled: isPinned ? i === pinned.length - 1 : i === n - 1, onclick: () => move(g, 1) }, icon("down", 16)),
        h("button", { class: "ghost small", title: "Hide (it goes to “Hidden modules” at the bottom)", "aria-label": `Hide ${g.name}`,
          onclick: () => saveLayout(c.id, (cur) => ({ hidden: [...new Set([...cur.hidden, g.id])], pinned: cur.pinned.filter((x) => x !== g.id) })).then(rerender) }, icon("hide", 16)))
        : [g.items.length > 1 ? (mq.length
          ? h("button", { class: "btn small soft", title: "Practice the whole module", onclick: () => openSheet(moduleScope(c.id, g.name, g.items)) }, `Module · ${Math.round(scopeStats(mq).mastery * 100)}%`)
          : h("button", { class: "ghost small mod-all", title: "Practice the whole module", "aria-label": `Practice all of ${g.name}`, onclick: () => openSheet(moduleScope(c.id, g.name, g.items)) }, icon("layers", 16))) : null,
          moduleMenu(c.id, g)]);
  };
  shownGroups = { courseId: c.id, groups: visible };
  visible.forEach((g, i) => {
    box.append(header(g, i, visible.length));
    if (isOpen(g) && !arranging) g.items.forEach((l) => box.append(lectureRow(c.id, l, qs.filter((q) => q.lectureKey === l.key), quizzesFor(quizzes, { courseId: c.id, lectureKeys: [l.key] }).length)));
  });
  if (hidden.length) {
    box.append(h("details", { class: "mod-hidden", open: arranging },
      h("summary", {}, `Hidden modules (${hidden.length})`),
      hidden.map((g) => h("div", { class: "row mod-hidden-row" }, h("span", { class: "grow" }, g.name, h("small", { class: "meta" }, ` · ${plural(g.items.length, "item")}`)),
        h("button", { class: "btn small soft", onclick: () => saveLayout(c.id, (cur) => ({ hidden: cur.hidden.filter((x) => x !== g.id) })).then(rerender) }, "Show")))));
  }
}

// A module's "⋯": say what everything in it is (moves the whole module to that list), or hide it.
function moduleMenu(courseId, g) {
  const first = g.items[0];
  if (!first) return null;
  const mk = moduleKey(first);
  const current = (state.settings.moduleKindOverride || {})[mk] || null;
  const setAll = async (k) => {
    const items = new Set(g.items.map((l) => l.key));
    const over = Object.fromEntries(Object.entries(state.settings.lectureKindOverride || {}).filter(([key]) => !items.has(key))); // the module's choice applies to all of it
    await saveSettings({ moduleKindOverride: { ...(state.settings.moduleKindOverride || {}), [mk]: k }, lectureKindOverride: over });
    const label = KINDS.find(([x]) => x === k)?.[1] || k;
    toast(`Everything in “${g.name}” is now under ${label}.`, { ms: 5000 });
    rerender();
  };
  const menu = h("details", { class: "menu row-menu" },
    h("summary", { class: "ghost small", title: "More", "aria-label": `More for the module ${g.name}` }, icon("more", 16)),
    h("div", { class: "menu-list", role: "menu" },
      h("div", { class: "menu-label" }, "Everything in this module is"),
      KINDS.map(([k, label]) => h("button", { role: "menuitemradio", "aria-checked": String(k === current), class: k === current ? "on" : "", onclick: () => setAll(k) },
        label === "Lectures" ? "Lectures" : label === "Practice exams" ? "Practice exams" : label === "Homework" ? "Homework" : "Other (not for studying)")),
      g.items.some((l) => lectureKind(l, state.settings.lectureKindOverride || {}, state.settings.moduleKindOverride || {}, state.aiKinds || {}) === "lecture")
        ? [h("div", { class: "menu-label" }, "Its lectures are"),
          ...[["priority", "Priority (core material)"], ["additional", "Additional (extra, optional)"]].map(([t, label]) => h("button", { role: "menuitem", onclick: async () => {
            const tiers = { ...(state.settings.lectureTierOverride || {}) };
            for (const l of g.items) tiers[l.key] = t;
            await saveSettings({ lectureTierOverride: tiers }); toast(`Lectures in “${g.name}” are now ${t === "priority" ? "Priority" : "Additional"}.`); rerender();
          } }, label))] : null,
      current ? h("button", { role: "menuitem", onclick: async () => { const m = { ...(state.settings.moduleKindOverride || {}) }; delete m[mk]; await saveSettings({ moduleKindOverride: m }); rerender(); } }, "Let CampusPilot decide again") : null,
      setupCtx?.courseId === courseId && g.items.some((l) => setupCtx.isLecture(l) && !setupCtx.setUp[l.key])
        ? [h("div", { class: "menu-label" }, "Lectures"), h("button", { role: "menuitem", onclick: () => { menu.open = false; const c = courseById(courseId); if (c) openSetupSheet(c, { only: g.name }); } }, "Set up this section's lectures…")] : null));
  const away = (e) => { if (!menu.isConnected) return document.removeEventListener("click", away, true); if (menu.open && !menu.contains(e.target)) menu.open = false; };
  document.addEventListener("click", away, true);
  return menu;
}

function lectureRow(courseId, l, qs) {
  const isSlides = l.type === "File";
  const st = scopeStats(qs);
  const kind = lectureKind(l, state.settings.lectureKindOverride || {}, state.settings.moduleKindOverride || {}, state.aiKinds || {});
  const tier = kind === "lecture" ? lectureTier(l, state.settings.lectureTierOverride || {}, state.aiKinds || {}) : null;
  const setKind = async (k) => {
    const t = k === "priority" || k === "additional" ? k : null;
    const patch = { lectureKindOverride: { ...(state.settings.lectureKindOverride || {}), [l.key]: t ? "lecture" : k } };
    if (t) patch.lectureTierOverride = { ...(state.settings.lectureTierOverride || {}), [l.key]: t };
    await saveSettings(patch); rerender();
  };
  const viewNow = tier || kind;
  const ai = (state.aiKinds || {})[l.key];
  const menu = h("details", { class: "menu row-menu" },
    h("summary", { class: "ghost small", title: "More", "aria-label": `More for ${l.title}` }, icon("more", 16)),
    h("div", { class: "menu-list", role: "menu" },
      h("a", { role: "menuitem", href: l.url, target: "_blank" }, l.type === "Notebook" ? "Open in JupyterHub" : "Open in Canvas"),
      h("div", { class: "menu-label" }, "This is"),
      VIEW_KINDS.map(([k, label]) => h("button", { role: "menuitemradio", "aria-checked": String(k === viewNow), class: k === viewNow ? "on" : "", onclick: () => setKind(k) },
        k === "priority" ? "A priority lecture (core)" : k === "additional" ? "Additional material (optional)" : label === "Practice exams" ? "A practice exam" : label)),
      ai?.by === "content" && !(state.settings.lectureKindOverride || {})[l.key] ? h("div", { class: "menu-note" }, ai.study === false ? "Sorted after reading it: nothing to study in it." : "Sorted after reading its first page.") : null));
  const away = (e) => { if (!menu.isConnected) return document.removeEventListener("click", away, true); if (menu.open && !menu.contains(e.target)) menu.open = false; };
  document.addEventListener("click", away, true);
  return h("div", { class: "lec" + (l.is_new ? " new" : "") },
    h("button", { class: "lec-main", onclick: () => openSheet(lectureScope(courseId, l)), "aria-label": `${l.title}: learn, flashcards, test` },
      h("span", { class: "icon", "aria-hidden": "true" }, icon(isSlides ? "slides" : "file", 20)),
      h("span", { class: "grow" }, h("b", {}, l.title),
        h("small", {}, [l.type === "Notebook" ? (l.pages ? `Notebook · ${l.pages} cells` : "Notebook") : isSlides ? (l.pages ? `${l.pages} ${String(l.unit || "page").toLowerCase()}s` : "Slides") : "Page", l.date ? shortDate(l.date) : null].filter(Boolean).join(" · "))),
      st.total ? h("span", { class: "lec-prog" }, chip(st.mastery), h("small", { title: `${Math.round(st.mastery * 100)}% learned` }, st.due ? `${st.due} due` : `${Math.round(st.mastery * 100)}%`)) : null,
      tier === "additional" ? h("span", { class: "pill extra", title: "Additional: optional or supplementary material" }, "Extra") : null,
      l.is_new ? h("span", { class: "pill new" }, "New") : null),
    menu);
}

// ---------- Grades (Grade Ledger) ----------
let glListener = null;
async function grades(root, c) {
  const { ledger = {} } = await chrome.storage.local.get("ledger");
  let rec = ledger[c.id];
  const note = h("div", { class: "hint" });
  async function reload() {
    const data = await send("GRADE_DATA", { courseId: c.id });
    const built = ledgerFromCanvas(data, { target: rec?.state?.target || 90 });
    rec = { ...built, v: 3, at: Date.now(), canvasScore: data.current_score, checked: data.checked || [], needsFileAccess: !!data.needsFileAccess && built.source !== "syllabus" && built.source !== "canvas-weights" };
    const { ledger: l2 = {} } = await chrome.storage.local.get("ledger");
    l2[c.id] = rec;
    await chrome.storage.local.set({ ledger: l2 });
  }
  // Rebuild ledgers made before syllabus files were read (unless the student has edited them).
  if (!rec?.state || (!rec.edited && rec.v !== 3)) {
    root.append(empty("grades", "Reading your grades and looking for the weights in your syllabus…"));
    try { await reload(); } catch (e) { root.replaceChildren(empty("alert", e.message)); return; }
    root.replaceChildren();
  }
  note.textContent = rec.note || "";
  const frame = h("iframe", { class: "ledger-frame", title: "What-If calculator",
    src: chrome.runtime.getURL(`grades/ledger.html?course=${c.id}&theme=${panelIsDark() ? "dark" : "light"}&compact=1&name=${encodeURIComponent(c.code || c.name)}${c.current_score != null ? `&cur=${c.current_score}` : ""}`
      + `&src=${encodeURIComponent(rec.source || "")}&srcnote=${encodeURIComponent(rec.note || "")}${rec.edited ? "&edited=1" : ""}`) });
  // Where the weights came from, Canvas's own number and Reload all live inside the calculator; this card only
  // appears when something needs doing (no weights found, or the syllabus file needs access).
  const doReload = async () => {
    if (rec.edited && !confirm("Replace your edits with fresh numbers from Canvas?")) return;
    try { await reload(); frame.contentWindow?.postMessage({ type: "gl-reload" }, "*"); rerender(); }
    catch (e) { toast(e.message, { error: true }); }
  };
  const prevListener = glListener;
  glListener = (e) => {
    if (String(e.data?.courseId) !== String(c.id)) return;
    if (e.data?.type === "gl-height") frame.style.height = `${e.data.height + 4}px`;
    if (e.data?.type === "gl-reload-request") doReload();
  };
  if (prevListener) window.removeEventListener("message", prevListener);
  window.addEventListener("message", glListener);
  if (rec.source === "points" || rec.needsFileAccess) root.append(h("div", { class: "card tight" },
    rec.source === "points" ? [h("b", {}, "No weights found"), note, noWeightsHelp(c, rec)] : null,
    rec.needsFileAccess ? h("div", { class: "note" }, "Your syllabus file couldn't be read yet. ",
      act("Allow and try again", async () => { if (!(await askFileHostAccess())) throw new Error("CampusPilot needs access to Canvas's file storage to read the syllabus."); await reload(); rerender(); }, { cls: "btn small", busyLabel: "Reading…" })) : null));
  root.append(frame);
}

// When no weights were found: say what was checked, and offer the AI or the syllabus itself.
function noWeightsHelp(c, rec) {
  const why = (x) => x.error ? (x.error === "locked" ? "locked" : x.file ? "couldn't open it" : x.error) : x.readable === false ? "no typed text (scanned?)" : "no percentages found";
  return h("div", { class: "card tight", style: "margin:8px 0 0" },
    rec.checked?.length ? h("div", { class: "hint" }, "Checked: ", rec.checked.map((x) => `${x.name} (${why(x)})`).join(" · ")) : null,
    h("div", { class: "actions" },
      act("Read the weights with my AI", async () => {
        const r = await send("SYLLABUS_FOR_AI", { courseId: c.id });
        if (!r.texts.length && !r.files.length) throw new Error("No syllabus found in this course. Type the weights into the calculator instead.");
        await handToAI(weightsPrompt({ course: c.name, texts: r.texts, attached: r.files.map((f) => f.name) }), { expect: "weights", meta: { courseId: c.id }, title: c.code || c.name, files: r.files });
      }, { cls: "btn small", ico: "spark", busyLabel: "Gathering…" }),
      h("a", { class: "btn small secondary", href: `${state.settings.canvasUrl}/courses/${c.id}/assignments/syllabus`, target: "_blank" }, "Open syllabus")));
}
views.openGrades = (courseId) => openCourse(courseId, "grades");

// ---------- Files ----------
async function files(root, c) {
  const s = state.settings;
  const name = c.code || c.name;
  const zipMsg = (r) => r.empty ? "Nothing found to download." : r.zips.length ? `Saved ${plural(r.done, "file")} as ${plural(r.zips.length, "zip")} in Downloads › CampusPilot${r.skipped ? ` (${r.skipped} unchanged skipped)` : ""}` : "Everything is already downloaded.";
  root.append(h("div", { class: "card" }, h("h3", {}, "Course files"),
    h("p", { class: "muted desc", style: "margin-top:0" }, "Slides, PDFs and readings as one zip, keeping the course's folders. Next time only new or changed files are included."),
    h("div", { class: "actions" },
      act("Download", async () => {
        await askFileHostAccess();
        const est = await send("COURSE_FILES_ZIP", { courseId: c.id, onlyNew: true, estimate: true });
        if (!confirmSize(est.bytes, `${plural(est.count || 0, "new file")}`)) return;
        toast(zipMsg(await send("COURSE_FILES_ZIP", { courseId: c.id, onlyNew: true })), { ms: 8000 });
      }, { ico: "download", busyLabel: "Zipping…" }),
      act("Everything again", async () => {
        const est = await send("COURSE_FILES_ZIP", { courseId: c.id, onlyNew: false, estimate: true });
        if (!confirmSize(est.bytes, `All ${plural(est.count || 0, "file")}`)) return;
        toast(zipMsg(await send("COURSE_FILES_ZIP", { courseId: c.id, onlyNew: false })), { ms: 8000 });
      }, { cls: "btn secondary", busyLabel: "Zipping…" })),
    toggle("Keep lecture slides in Downloads", "Copies of this course's lecture files in Downloads › CampusPilot › " + name + " › Lectures, updated when they change", (s.libraryMirror || []).includes(c.id), async (v) => {
      const set = new Set(s.libraryMirror || []); v ? set.add(c.id) : set.delete(c.id);
      const lib = new Set(s.libraryCourses || []); if (v) lib.add(c.id);
      await saveSettings({ libraryMirror: [...set], libraryCourses: [...lib] });
      if (v) send("LIBRARY_SYNC", { courseIds: [c.id] }).catch((e) => toast(e.message, { error: true }));
    })));

  root.append(h("div", { class: "card" }, h("h3", {}, "My submissions"),
    h("p", { class: "muted desc", style: "margin-top:0" }, "Everything you've turned in for this course, one folder per assignment."),
    act("Download my submissions", async () => toast(zipMsg(await send("COURSE_FILES_ZIP", { courseId: c.id, courseFiles: false, mine: true, onlyNew: false })), { ms: 8000 }), { cls: "btn block secondary", ico: "download", busyLabel: "Zipping…" })));

  // Optional connections: only for courses where the student turned them on (Settings › Connections).
  if (connOn(state.settings, "gradescope", c.id)) {
    const gsBox = h("div", {});
    root.append(gsBox);
    gradescopeCard(c).then((el) => el && gsBox.replaceWith(el)).catch((e) => gsBox.replaceWith(h("div", { class: "card" }, h("h3", {}, "Gradescope"), h("div", { class: "note" }, e.message))));
  }
  if (connOn(state.settings, "jupyter", c.id)) root.append(await notebooksCard(c));

  root.append(h("p", { class: "hint", style: "text-align:center" }, "Want this whole course in one zip, or as context for an AI project? Use Courses › Export courses. Gradescope and Jupyter notebooks can be turned on in Settings › Connections."));
}

// Jupyter notebooks for this course. Each course can use its own hub (found from the course's
// "Open in Jupyter" links, or typed in once); folders are picked once per course.
const hubHost = (u) => { try { return new URL(u).host; } catch { return u; } };
async function connectHub(c, url) {
  let base;
  try { base = normalizeHubUrl(/^https?:/.test(url) ? url : "https://" + url); } catch { throw new Error("That doesn't look like a web address."); }
  if (!/^https:/.test(base)) throw new Error("Use the hub's https:// address.");
  if (!(await chrome.permissions.request({ origins: [new URL(base).origin + "/*"] }))) throw new Error("CampusPilot needs permission for that site to read your notebooks.");
  await saveSettings({ jupyterHubs: { ...(state.settings.jupyterHubs || {}), [c.id]: base } });
  toast(`${c.code || c.name} uses ${hubHost(base)}.`, { ms: 5000 });
  rerender();
}
const hubState = (hub) => ((state.jup ||= {})[hub] ||= { status: null, scan: null, links: null });

async function notebooksCard(c) {
  const s = state.settings;
  let hub = hubForCourse(s, c.id);
  if (hub === "none") hub = null; // older "doesn't use Jupyter" choice: the course ticks in Settings › Connections decide now
  const box = h("div", { class: "card" }, h("h3", {}, "Jupyter notebooks"));
  if (!hub) return setupHub(c, box);
  const J = hubState(hub);
  const host = hubHost(hub);
  const change = h("button", { class: "linkish", onclick: async () => { const m = { ...(s.jupyterHubs || {}) }; m[c.id] = ""; delete m[c.id];
    // forget the older shared hub for this course too
    const f = { ...(s.jupyterCourseFolders || {}) }; if (s.jupyterUrl === hub) delete f[c.id];
    await saveSettings({ jupyterHubs: m, jupyterCourseFolders: f }); rerender(); } }, "Change hub");
  box.append(h("div", { class: "meta", style: "margin:-4px 0 8px" }, host, " · ", change));

  if (!J.status) { try { J.status = await send("JUPYTER_STATUS", { hub }); } catch (e) { J.status = { state: "error", error: e.message }; } }
  const st = J.status;
  const recheck = act("Check again", async () => { J.status = null; J.scan = null; rerender(); }, { cls: "btn small soft" });
  if (st.state === "login") { box.append(h("div", { class: "note" }, `Log in to ${host} first.`), h("div", { class: "actions" }, h("button", { class: "btn small", onclick: () => send("JUPYTER_LOGIN", { hub }) }, "Log in"), recheck)); return box; }
  if (st.state === "stopped") { box.append(h("div", { class: "muted" }, "Your server is off."), h("div", { class: "actions" }, act("Start my server", async () => { const r = await send("JUPYTER_START", { hub }); if (r.needsUser) toast("Pick your environment and press Start in the Jupyter tab, then press Check again.", { ms: 10000 }); J.status = null; rerender(); }, { cls: "btn small", busyLabel: "Starting…" }), recheck)); return box; }
  if (st.state !== "running" && st.state !== "ok") { box.append(h("div", { class: "note" }, st.error || `Couldn't reach ${host}.`), h("div", { class: "actions" }, recheck)); return box; }

  // Course links that copy the latest class files into your server ("Open in Jupyter"), run first when that setting is on.
  const pullLatest = async ({ quiet = false } = {}) => {
    if (!J.links) J.links = await send("JUPYTER_FIND_LINKS", { hub, courseId: c.id });
    if (!J.links.length) { if (!quiet) toast("No “Open in Jupyter” links found in this course.", { ms: 6000 }); return false; }
    const res = await send("JUPYTER_PULL", { hub, links: J.links.map((l) => l.url) });
    const bad = res.filter((r) => !r.ok);
    if (!quiet || bad.length) toast(bad.length ? `Updated ${res.length - bad.length}/${res.length}. ${bad[0].error}` : "Course files are up to date", { error: !!bad.length, ms: 6000 });
    J.scan = await send("JUPYTER_SCAN", { hub });
    return true;
  };
  const pullFirst = async () => { if (state.settings.jupyterPullFirst !== false) await pullLatest({ quiet: true }).catch(() => {}); };

  const map = s.jupyterCourseFolders || {};
  const mine = map[c.id] || [];
  if (!J.scan) {
    box.append(h("p", { class: "muted", style: "margin-top:0" }, mine.length ? `Folders: ${mine.join(", ")}` : "Pick which of your Jupyter folders belong to this course."),
      act(mine.length ? "Load notebooks" : "Choose folders", async () => { J.scan = await send("JUPYTER_SCAN", { hub }); delete state.lectureCache[c.id]; rerender(); }, { cls: "btn small", busyLabel: "Scanning…" }));
    return box;
  }
  const groups = groupByTopFolder(J.scan.files);
  if (!mine.length || state.jupPicking === c.id) {
    const picked = new Set(mine);
    box.append(h("div", { class: "checks" }, groups.map((g) => h("label", {},
      h("input", { type: "checkbox", checked: picked.has(g.name), onchange: (e) => { e.target.checked ? picked.add(g.name) : picked.delete(g.name); } }),
      h("span", { class: "grow" }, h("b", {}, g.name), h("br"), h("small", {}, `${plural(g.notebooks, "notebook")} · ${g.files} files${g.latest ? ` · changed ${shortDate(g.latest)}` : ""}`)),
      h("small", {}, g.bytes ? fmtBytes(g.bytes) : "")))),
      act("Save folders", async () => {
        // Saving folders also pins this hub to the course (so it no longer depends on the older shared setting).
        await saveSettings({ jupyterCourseFolders: { ...map, [c.id]: [...picked] }, jupyterHubs: { ...(s.jupyterHubs || {}), [c.id]: hub } });
        state.jupPicking = null; rerender();
      }, { cls: "btn small block", attrs: { style: "margin-top:8px" } }));
    return box;
  }
  // What each notebook folder holds: lecture material becomes lectures (checklists, questions); assignments only
  // help the study plan (their questions, never your answers); skipped folders are left alone.
  const dirs = notebookDirs(J.scan.files, mine, (s.jupyterKinds || {})[c.id] || {});
  const setKind = async (dir, kind) => {
    const all = { ...(s.jupyterKinds || {}) };
    all[c.id] = { ...(all[c.id] || {}), [dir]: kind };
    await saveSettings({ jupyterKinds: all });
    delete state.lectureCache[c.id];
    rerender();
  };
  const lectureCount = Object.values(dirs).filter((g) => g.kind === "lecture").reduce((a, g) => a + g.notebooks.length, 0);
  const kindsBox = h("details", { class: "nb-kinds", open: !((s.jupyterKinds || {})[c.id]) },
    h("summary", {}, `${plural(lectureCount, "lecture notebook")} · what's in each folder`),
    h("p", { class: "hint", style: "margin:4px 0 6px" }, "Lecture material shows up in Lectures (From JupyterHub) to learn and be quizzed on. Assignments are never quizzed; their questions only help size your study plan. CampusPilot guessed from the names; fix anything that's wrong."),
    Object.entries(dirs).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([dir, g]) => h("div", { class: "nb-kind-row" },
      h("div", { class: "nb-kind-name" }, h("b", {}, mine.reduce((d, t) => d.startsWith(t + "/") ? d.slice(t.length + 1) : d, dir)),
        h("small", { class: "meta" }, `${plural(g.notebooks.length, "notebook")}: ${g.notebooks.slice(0, 3).map((f) => f.path.split("/").pop()).join(", ")}${g.notebooks.length > 3 ? "…" : ""}`)),
      h("select", { "aria-label": `What's in ${dir}`, onchange: (e) => setKind(dir, e.target.value) },
        [["lecture", "Lecture material"], ["assignment", "Assignments"], ["skip", "Skip"]].map(([v, l]) => h("option", { value: v, selected: g.kind === v }, l))))));
  const filesNow = () => filesInGroups(J.scan.files, mine);
  const notebooksNow = () => filesNow().filter((f) => NOTEBOOKISH.test(f.path)).sort((a, b) => (b.last_modified || "").localeCompare(a.last_modified || ""));
  const nbs = notebooksNow();
  const ipynb = nbs.filter((f) => /\.ipynb$/i.test(f.path) && !/\.ipynb_checkpoints\//.test(f.path)).length;
  box.append(h("div", { class: "row" }, h("div", { class: "grow meta" }, `${mine.join(", ")} · ${plural(ipynb, "notebook")}${nbs.length > ipynb ? ` · ${plural(nbs.length - ipynb, "other file")}` : ""}`),
      h("button", { class: "btn small soft", onclick: () => { state.jupPicking = c.id; rerender(); } }, "Change")),
    kindsBox,
    h("div", { class: "actions" },
      act("Study the lectures", async () => {
        await pullFirst();
        delete state.lectureCache[c.id];
        openCourse(c.id, "lectures");
      }, { ico: "play", busyLabel: "Getting files…", attrs: { disabled: !lectureCount, title: lectureCount ? "Lecture notebooks are in Lectures › From JupyterHub" : "Mark a folder as lecture material first" } }),
      act("Download", async () => {
        await pullFirst();
        const chosen = filesNow();
        if (!confirmSize(chosen.reduce((n, f) => n + (f.size || 0), 0), "These notebooks and files", "(Only new or changed files are zipped, so it may be smaller.)")) return;
        const r = await send("JUPYTER_DOWNLOAD", { hub, files: chosen.map(({ path, size, last_modified }) => ({ path, size, last_modified })), onlyNew: true });
        toast(r.zips.length ? `Saved ${plural(r.zips.length, "zip")} (${r.done} files) to Downloads › CampusPilot` : "Everything is already up to date", { ms: 8000 });
      }, { cls: "btn secondary", ico: "download", busyLabel: "Zipping…" })),
    h("div", { class: "row", style: "margin-top:8px" },
      act("Get the latest course files", async () => { await pullLatest(); rerender(); }, { cls: "btn small soft block", ico: "refresh", busyLabel: "Updating…" })),
    toggle("Get the latest course files first", "Runs your classes' “Open in Jupyter” links before downloading or studying. Your own edits are kept.", state.settings.jupyterPullFirst !== false, (v) => saveSettings({ jupyterPullFirst: v })),
    J.links?.length ? h("div", { class: "hint" }, `${plural(J.links.length, "course link")} found. Your own edits are kept.`) : h("div", { class: "hint" }, "Save open notebooks first (Ctrl/⌘ + S); CampusPilot gets the last saved version."));
  return box;
}

// No hub for this course yet: suggest the one its Canvas links point to, other hubs already connected, or type one.
async function setupHub(c, box) {
  const s = state.settings;
  state.jupDetect ||= {};
  if (!(c.id in state.jupDetect)) { try { state.jupDetect[c.id] = await send("JUPYTER_DETECT", { courseId: c.id }); } catch { state.jupDetect[c.id] = { hubs: [] }; } }
  const det = state.jupDetect[c.id] || {};
  const found = Array.isArray(det) ? det : det.hubs || [];
  const others = knownHubs(s).filter((x) => !found.some((f) => f.hub === x));
  const input = h("input", { type: "url", placeholder: "https://jupyter.yourschool.edu", "aria-label": "This course's JupyterHub address" });
  const off = h("button", { class: "linkish", onclick: async () => {
    // Untick this course for Jupyter notebooks (Settings › Connections)
    await saveSettings({ conn: connPick(s, "jupyter", c.id, false) }); rerender();
  } }, "This course doesn't use Jupyter");
  if (found.length) {
    box.append(h("p", { class: "muted", style: "margin-top:0" }, `This course links to ${found.length === 1 ? "a JupyterHub" : "these JupyterHubs"}. Connect once to download its notebooks and practice from them (no password or token; CampusPilot uses your normal login).`),
      h("div", { class: "actions" }, found.map((f) => act(`Use ${hubHost(f.hub)}`, () => connectHub(c, f.hub), { cls: "btn small", busyLabel: "Connecting…" }))));
  } else if (det.canvasLink) {
    // Canvas has a JupyterHub link (a menu tab or module item) but not its address: open it once to find out.
    box.append(h("p", { class: "muted", style: "margin-top:0" }, "This course has a JupyterHub link in Canvas. Connect once to download its notebooks and practice from them (no password or token; CampusPilot uses your normal login)."),
      h("div", { class: "actions" }, act("Connect through Canvas", async () => {
        const r = await send("JUPYTER_FROM_CANVAS", { link: det.canvasLink });
        if (r?.hub) return connectHub(c, r.hub);
        toast("Finish signing in on the tab that opened, then press Connect through Canvas again.");
      }, { cls: "btn small", busyLabel: "Opening it from Canvas…" })));
  } else {
    box.append(h("p", { class: "muted desc", style: "margin-top:0" }, "If this class uses JupyterHub (DataHub and similar), add its address once to download notebooks and practice from them. No password or token; CampusPilot uses your normal login."));
  }
  if (others.length) box.append(h("div", { class: "actions" }, others.map((x) => act(`Same as another course: ${hubHost(x)}`, () => connectHub(c, x), { cls: "btn small secondary", busyLabel: "Connecting…" }))));
  box.append(h("div", { class: "row", style: "margin-top:8px" }, h("div", { class: "grow" }, input),
      act(found.length ? "Use this one" : "Connect", () => connectHub(c, input.value.trim()), { cls: "btn small secondary", busyLabel: "Connecting…" })),
    h("div", { class: "hint" }, off));
  // Prefill from an open hub tab, if the student has one.
  chrome.tabs.query({}).then((tabs) => { const t = tabs.find((x) => /^https:/.test(x.url || "") && /\/(hub|user)\/[^/]*\/?/.test(x.url || "")); if (t && !input.value) input.value = normalizeHubUrl(t.url); }).catch(() => {});
  return box;
}

// Recorded lectures (Panopto): transcripts make them work like slides.
async function videosSection(c, { refresh = false } = {}) {
  state.videoCache ??= {};
  if (!state.settings.videoHost) return h("div", { class: "hint", style: "margin:0 4px 8px" }, "Recorded lectures? ",
    h("button", { class: "linkish", onclick: () => go("settings", { settingsOpen: "connections" }) }, "Connect your lecture video site"), " to practice from them too.");
  let info = !refresh && state.videoCache[c.id];
  if (!info) info = state.videoCache[c.id] = await send("VIDEOS", { courseId: c.id, refresh });
  const again = () => { delete state.videoCache[c.id]; rerender(); };
  const box = h("details", { class: "card videos", open: state.videosOpen !== false, ontoggle: (e) => { state.videosOpen = e.target.open; } },
    h("summary", {}, h("b", {}, "Lecture videos"), info.videos?.length ? h("small", {}, ` ${info.videos.length}`) : null));
  if (info.state === "permission") {
    box.append(h("p", { class: "muted" }, `Allow CampusPilot to read your recordings on ${info.host}.`),
      h("button", { class: "btn small", onclick: async () => { if (await chrome.permissions.request({ origins: [`https://${info.host}/*`] }).catch(() => false)) again(); } }, "Allow"));
    return box;
  }
  if (info.state === "login") {
    box.append(h("p", { class: "muted" }, `Log in to ${info.host} once in the tab that opens (pick your school or Canvas), then check again.`),
      h("div", { class: "actions" }, h("button", { class: "btn small", onclick: () => send("VIDEO_LOGIN") }, "Log in"),
        act("Check again", async () => { state.videoCache[c.id] = await send("VIDEOS", { courseId: c.id, refresh: true }); rerender(); }, { cls: "btn small secondary", busyLabel: "Checking…" })));
    return box;
  }
  const map = state.settings.videoFolderMap || {};
  const picker = h("select", { "aria-label": "Video folder", onchange: async (e) => { state.pickVideoFolder = null; await saveSettings({ videoFolderMap: { ...map, [c.id]: e.target.value } }); again(); } },
    h("option", { value: "" }, "Choose this course's recordings folder…"),
    (info.folders || []).map((f) => h("option", { value: f.id, selected: f.id === info.folderId }, `${f.name} (${f.count})`)),
    h("option", { value: "none" }, "No recordings for this course"));
  if (!info.folderId) { box.append(h("p", { class: "muted" }, "Which folder has this course's recordings?"), picker); return box; }
  const vids = info.videos || [];
  state.videoShow ??= 8;
  // Playback speed, right where the videos are (it applies to lecture videos on Canvas and your video site).
  box.append(h("div", { class: "vid-speed" }, speedControl({ compact: true })));
  box.append(h("div", { class: "row" }, h("small", { class: "grow muted" }, info.folderName),
      h("button", { class: "btn small soft", onclick: () => { state.pickVideoFolder = c.id; rerender(); } }, "Change")),
    state.pickVideoFolder === c.id ? picker : "",
    vids.length ? "" : h("p", { class: "muted" }, "No recordings in this folder yet."),
    ...vids.slice(0, state.videoShow).map((v) => h("div", { class: "lec" },
      h("button", { class: "lec-main", onclick: () => openSheet(lectureScope(c.id, v)), "aria-label": `${v.title}: practice, flashcards or study guide` },
        h("span", { class: "icon", "aria-hidden": "true" }, icon("play", 18)),
        h("span", { class: "grow" }, h("b", {}, v.title), h("small", {}, [v.date ? shortDate(v.date) : null, v.minutes ? `${v.minutes} min` : null].filter(Boolean).join(" · ")))),
      h("a", { class: "ghost small", href: v.url, target: "_blank", "aria-label": "Watch", title: "Watch" }, icon("link", 16)))),
    vids.length > state.videoShow ? h("button", { class: "btn small soft block", onclick: () => { state.videoShow += 20; rerender(); } }, `Show more (${vids.length - state.videoShow})`) : "",
    vids.length ? h("div", { class: "actions" },
      act("Transcripts (zip)", async () => {
        const r = await send("VIDEO_TRANSCRIPTS_ZIP", { courseId: c.id });
        toast(`Saved ${r.zip}: ${plural(r.added, "transcript")}${r.noCaptions ? ` (${r.noCaptions} without captions)` : ""}`, { ms: 8000 });
      }, { cls: "btn small secondary", ico: "file", busyLabel: "Reading captions…" }),
      act("Video files…", async () => {
        const est = await send("VIDEO_FILES", { courseId: c.id, estimate: true });
        if (!confirm(`Download ${plural(est.count, "recording")} (about ${fmtBytes(est.bytes)}, ${Math.round(est.minutes / 60)} hours)? They're saved as video files in Downloads › CampusPilot › ${c.code || c.name} › Lecture videos. Recordings your instructor hasn't allowed to be downloaded are skipped.`)) return;
        const r = await send("VIDEO_FILES", { courseId: c.id });
        toast(`Saved ${plural(r.done, "video")}${r.notAllowed ? `. ${r.notAllowed} can't be downloaded (the instructor turned downloads off)` : ""}${r.failed ? `. ${r.failed} failed` : ""}.`, { ms: 10000 });
      }, { cls: "btn small soft", ico: "download", busyLabel: "Downloading…" })) : "",
    h("p", { class: "hint" }, "CampusPilot reads the captions. Recordings without captions can't be used yet."));
  return box;
}

// Exam dates found in Canvas, announcements and the syllabus; the student can fix them.
const examKey = (e) => `${e.title}|${e.date.slice(0, 10)}`;
export const daysUntil = (iso) => { const d = new Date(iso); const t = new Date(); t.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0); return Math.round((d - t) / 864e5); };
export const whenText = (n) => n < 0 ? "past" : n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
async function examsCard(c, { refresh = false } = {}) {
  const data = await send("EXAMS", { courseId: c.id, refresh });
  const { examEdits = {} } = await chrome.storage.local.get("examEdits");
  const ed = examEdits[c.id] || { removed: [], added: [] };
  const save = async () => { examEdits[c.id] = { ...ed, at: Date.now() }; await chrome.storage.local.set({ examEdits }); rerender(); };
  const removed = new Set(ed.removed || []);
  const list = [...data.list.filter((e) => !removed.has(examKey(e))), ...(ed.added || []).map((e) => ({ ...e, source: "added by you", mine: true }))]
    .sort((a, b) => a.date.localeCompare(b.date));
  const fmt = (e) => new Date(e.date).toLocaleString([], { weekday: "short", month: "short", day: "numeric", ...(e.hasTime ? { hour: "numeric", minute: "2-digit" } : {}) });
  const title = h("input", { placeholder: "e.g. Midterm 2", "aria-label": "Exam name" });
  const date = h("input", { type: "datetime-local", "aria-label": "Exam date and time" });
  const box = h("div", { class: "card" }, h("h3", {}, "Exams"),
    list.length ? list.map((e) => { const n = daysUntil(e.date); return h("div", { class: "item" + (n < 0 ? " done" : "") },
      h("div", { class: "main" }, h("div", { class: "name" }, e.title), h("div", { class: "meta" }, fmt(e), h("span", { class: "desc" }, ` · from ${e.source}${e.also?.length ? " (changed since the syllabus)" : ""}`))),
      h("span", { class: `pill ${n <= 3 && n >= 0 ? "now" : n <= 10 && n >= 0 ? "soon" : ""}` }, whenText(n)),
      h("button", { class: "ghost small", title: "Not right? Remove it", "aria-label": `Remove ${e.title}`, onclick: async () => {
        if (e.mine) ed.added = (ed.added || []).filter((x) => examKey(x) !== examKey(e)); else ed.removed = [...new Set([...(ed.removed || []), examKey(e)])];
        await save();
      } }, icon("close", 14))); })
      : h("p", { class: "muted", style: "margin:0" }, `No exam dates found${data.checked?.length ? ` (checked ${data.checked.join(", ")}, assignments, calendar and announcements)` : ""}.`),
    h("details", { class: "adv" }, h("summary", {}, "Add an exam"),
      h("div", { class: "row" }, h("div", { class: "grow" }, title), h("div", { class: "grow" }, date)),
      h("button", { class: "btn small block", style: "margin-top:6px", onclick: async () => {
        if (!title.value.trim() || !date.value) return toast("Add a name and a date.", { error: true });
        ed.added = [...(ed.added || []), { title: title.value.trim(), date: new Date(date.value).toISOString(), hasTime: true }];
        await save();
      } }, "Add")),
    h("div", { class: "row", style: "margin-top:6px" }, h("small", { class: "hint grow" }, "Used by your study plan and exam prep."),
      act("Check again", async () => { box.replaceWith(await examsCard(c, { refresh: true })); }, { cls: "btn small soft", busyLabel: "Checking…" })));
  return box;
}

// Gradescope: the student's submitted work for this course, graded copies when available.
const GS_ORIGINS = ["https://www.gradescope.com/*"];
// "8.5 / 10.0" → lost points? (only graded work with a copy to read)
export function lostPoints(a) {
  const m = String(a.score || "").match(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  return !!(a.submissionPath && m && Number(m[1]) < Number(m[2]));
}
const run = (fn) => async (e) => { const b = e.currentTarget; b.disabled = true; try { await fn(); } catch (err) { toast(err.message, { error: true, ms: 8000 }); } finally { b.disabled = false; } };
async function learnFromGraded(c, items) {
  const files = items.map((a) => ({ name: `${safeFile(a.name).slice(0, 60)} (graded).pdf`, url: `https://www.gradescope.com${a.submissionPath.replace(/\.pdf$/, "")}.pdf` }));
  const text = mistakesPrompt({ course: c.code || c.name, items: items.map((a, i) => ({ name: a.name, score: a.score, attachName: files[i].name })), count: state.settings.quizCount || 10 });
  await handToAI(text, { expect: "quiz", title: `${c.code || c.name}: where I lost points`, files,
    meta: { courseId: c.id, title: items.length === 1 ? `${items[0].name}: mistakes` : "Where I lost points", lectures: [] } });
}

async function gradescopeCard(c, { refresh = false } = {}) {
  state.gsCache ??= {};
  const allowed = await chrome.permissions.contains({ origins: GS_ORIGINS }).catch(() => false);
  let info = !refresh && state.gsCache[c.id];
  if (!info) {
    if (!allowed) info = { state: "permission", uses: (c.assignments || []).some((a) => /gradescope/i.test(a.kind_label || "")) };
    else info = await send("GS_COURSE", { courseId: c.id, refresh });
    state.gsCache[c.id] = info;
  }
  if (!info.uses && info.state === "permission") return null;
  if (!info.uses && info.state === "ok" && !info.gsId) return null;
  const again = () => { delete state.gsCache[c.id]; rerender(); };
  const box = h("div", { class: "card" }, h("h3", {}, "Gradescope"));
  // The course's Canvas menu has a Gradescope link: following it signs in and names the exact Gradescope course.
  const viaCanvas = info.canvasLink && !info.gsId;
  if (viaCanvas) {
    box.append(h("p", { class: "muted", style: "margin-top:0" }, h("b", {}, "Gradescope found"), " in this course's Canvas menu. CampusPilot opens it once in the background to link the course; after that your submitted work and graded copies show here."),
      act("Open to sync", async () => {
        if (!(await chrome.permissions.request({ origins: GS_ORIGINS }).catch(() => false))) // no prompt if already allowed
          return toast("CampusPilot needs access to gradescope.com to read your work.", { error: true });
        const r = await send("GS_FROM_CANVAS", { courseId: c.id });
        if (r.needsYou) toast("Gradescope needs you for a moment in the tab that opened (sign in or link your account). Then press Open to sync again.", { ms: 10000 });
        else toast("Gradescope linked.");
        again();
      }, { cls: "btn small", ico: "refresh", busyLabel: "Opening Gradescope…" }),
      h("p", { class: "hint" }, "Uses your own login through Canvas. CampusPilot only reads; it never submits, and never opens assignments you haven't turned in."));
    return box;
  }
  if (info.state === "permission") {
    box.append(h("p", { class: "muted desc", style: "margin-top:0" }, "This course uses Gradescope. Connect it once to download your submitted work, with the graded copies (marks and comments) when they're ready."),
      h("button", { class: "btn small", onclick: async () => {
        if (!(await chrome.permissions.request({ origins: GS_ORIGINS }).catch(() => false))) return toast("CampusPilot needs access to gradescope.com to read your work.", { error: true });
        again();
      } }, "Connect Gradescope"),
      h("p", { class: "hint" }, "Uses your own Gradescope login in this browser. CampusPilot only reads; it never submits, and never opens assignments you haven't turned in."));
    return box;
  }
  if (info.state === "login") {
    box.append(h("p", { class: "muted", style: "margin-top:0" }, "Log in to Gradescope once in the tab that opens (choose School Credentials, then your school), then come back."),
      h("div", { class: "actions" },
        h("button", { class: "btn small", onclick: () => send("GS_LOGIN") }, "Log in to Gradescope"),
        act("Check again", async () => { delete state.gsCache[c.id]; state.gsCache[c.id] = await send("GS_COURSE", { courseId: c.id, refresh: true }); rerender(); }, { cls: "btn small secondary", busyLabel: "Checking…" })));
    return box;
  }
  const map = state.settings.gradescopeMap || {};
  const picker = () => h("select", { "aria-label": "Gradescope course", onchange: async (e) => {
    state.gsPicking = null;
    await saveSettings({ gradescopeMap: { ...map, [c.id]: e.target.value } }); again();
  } }, h("option", { value: "" }, "Choose the Gradescope course…"),
    (info.courses || []).map((g) => h("option", { value: g.id, selected: g.id === info.gsId }, `${g.short}${g.term ? ` (${g.term})` : ""}`)),
    h("option", { value: "none" }, "This course doesn't use Gradescope"));
  const useLink = async () => {
    const v = prompt("Paste the Gradescope course's address (it looks like gradescope.com/courses/123456):") || "";
    const m = v.match(/gradescope\.com\/courses\/(\d+)/);
    if (!m) return v && toast("That isn't a Gradescope course address.", { error: true });
    state.gsPicking = null;
    await saveSettings({ gradescopeMap: { ...map, [c.id]: m[1] } }); again();
  };
  if (!info.gsId) {
    const none = !(info.courses || []).length;
    box.append(h("p", { class: "muted", style: "margin-top:0" }, none
      ? "CampusPilot couldn't read your Gradescope course list. Open this course on Gradescope and press Check again, or paste its address."
      : "Which Gradescope course is this?"),
      none ? null : picker(),
      h("div", { class: "actions" },
        act("Check again", async () => { delete state.gsCache[c.id]; state.gsCache[c.id] = await send("GS_COURSE", { courseId: c.id, refresh: true }); rerender(); }, { cls: "btn small soft", busyLabel: "Checking…" }),
        h("button", { class: "btn small soft", onclick: useLink }, "Paste the course address"),
        none ? h("button", { class: "linkish", onclick: async () => { await saveSettings({ gradescopeMap: { ...map, [c.id]: "none" } }); again(); } }, "This course doesn't use Gradescope") : null));
    return box;
  }
  const list = info.assignments || [];
  const done = list.filter((a) => a.submissionPath);
  const lost = list.filter(lostPoints);
  box.append(
    h("div", { class: "row" }, h("div", { class: "grow" }, h("b", {}, info.gsCourse?.short || "Gradescope course"), h("div", { class: "meta" }, `${plural(done.length, "submission")} of ${plural(list.length, "assignment")}`)),
      h("button", { class: "btn small soft", onclick: () => { state.gsPicking = c.id; rerender(); } }, "Change")),
    state.gsPicking === c.id ? picker() : "",
    h("div", { class: "gs-list" }, list.slice(0, 12).map((a) => h("div", { class: "gs-row" },
      h("span", { class: "grow" }, a.name), h("small", { class: a.submissionPath ? "" : "muted" }, a.score || a.status),
      lostPoints(a) ? h("button", { class: "btn tiny soft", title: "Your AI reads the graded copy and quizzes you on what lost points",
        onclick: run(() => learnFromGraded(c, [a])) }, "Learn from it") : null))),
    lost.length > 1 ? h("button", { class: "sheet-tile", style: "margin-top:8px", onclick: run(() => learnFromGraded(c, lost.slice(0, 4))) },
      h("span", { class: "ico-wrap" }, icon("target", 18)), h("span", { class: "grow" }, h("b", {}, "Practice where I lost points"),
        h("small", {}, `Your AI reads ${lost.length > 4 ? "your 4 most recent" : `all ${lost.length}`} graded copies with deductions and quizzes you on those ideas`)), icon("chevron", 16)) : "",
    list.length > 12 ? h("div", { class: "hint" }, `+${list.length - 12} more`) : "",
    h("div", { class: "actions" },
      act("Download graded work", async () => {
        await askFileHostAccess();
        const r = await send("GS_DOWNLOAD", { courseId: c.id });
        toast(`Saved ${r.zip} (${plural(r.added, "file")})${r.failed ? `. ${plural(r.failed, "item")} couldn't be added; see “_Not included.txt”.` : "."}`, { ms: 9000 });
      }, { ico: "download", busyLabel: "Zipping…" }),
      act("Refresh", async () => { state.gsCache[c.id] = await send("GS_COURSE", { courseId: c.id, refresh: true }); rerender(); }, { cls: "btn small soft", busyLabel: "Checking…" })),
    h("p", { class: "hint" }, "Graded copies (with marks and comments) when they're ready, otherwise what you turned in. Assignments you haven't submitted are never opened."));
  return box;
}

// One zip per course for an AI project: overview, a file per module, originals alongside.
export async function makeProjectPack(courseIds, { onlyNew = true } = {}) {
  if (!courseIds.length) throw new Error("Pick at least one course.");
  if (!(await askFileHostAccess())) toast("Without access to Canvas's file storage, slides can't be read or zipped; they'll be listed instead.", { ms: 7000 });
  const data = await send("PROJECT_DATA", { courseIds });
  const courses = data.map((course) => {
    const files = [{ path: "00 Course overview.md", text: exportPack([course.overview], { goal: "context", tz, prefs: state.settings }) }];
    const mods = new Map();
    for (const x of course.docs) { const m = x.lecture.module; if (!mods.has(m)) mods.set(m, { index: x.lecture.module_index, items: [] }); mods.get(m).items.push(x); }
    for (const [module, g] of [...mods.entries()].sort((a, b) => a[1].index - b[1].index)) {
      const mdir = `${String(g.index + 1).padStart(2, "0")} ${safeFile(module).slice(0, 60)}`;
      const entries = g.items.map((x) => {
        if (x.error) return { title: x.lecture.title, error: x.error };
        const d = x.doc;
        if (d.kind === "file") { files.push({ path: `${mdir}/${safeFile(d.file.name)}`, url: d.file.url, key: `pf:${course.id}:${d.file.id}`, version: d.version }); return { doc: d, attachName: safeFile(d.file.name) }; }
        const imageNames = (d.images || []).map((im) => { files.push({ path: `${mdir}/${safeFile(im.name)}`, url: im.url, key: `pi:${course.id}:${im.id}`, version: String(im.size) }); return safeFile(im.name); });
        return { doc: d, imageNames };
      });
      files.push({ path: `${mdir}/${mdir}.md`, text: projectModuleMd({ course: course.name, module, entries }) });
    }
    return { name: course.name, howto: PROJECT_HOWTO([course.name]), files };
  });
  const results = await send("PROJECT_ZIP", { courses, onlyNew });
  const made = results.filter((r) => r.zip);
  const failed = made.reduce((a, r) => a + r.failed, 0);
  if (made[0]?.downloadId) chrome.downloads.show(made[0].downloadId);
  toast(made.length ? `${plural(made.length, "zip")} saved to Downloads › CampusPilot${failed ? ". Some files couldn't be added; see “_Not included.txt” inside." : "."}` : "Nothing changed since your last pack.", { ms: 9000 });
}


