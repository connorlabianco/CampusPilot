// Gradescope: read the student's own courses, assignments and submitted work through their normal
// Gradescope login (a background tab on gradescope.com, same-origin requests). No password or token is
// stored. Read-only: only GET requests, and only submissions that already exist are opened. Assignments
// with no submission are never opened, because opening a timed assignment can start its timer.
import { waitFor, run, pageChunk, pageFree } from "./jupyterhub.js";

export const GS = "https://www.gradescope.com";
export const GS_ORIGINS = [`${GS}/*`];
export const hasGsPermission = () => chrome.permissions.contains({ origins: GS_ORIGINS }).catch(() => false);

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function withGs(fn) {
  if (!(await hasGsPermission())) throw Object.assign(new Error("Connect Gradescope first (Courses › Files or Settings › Connections)."), { code: "permission" });
  const existing = (await chrome.tabs.query({ url: `${GS}/*` }))[0];
  let tabId, created = false;
  if (existing) tabId = existing.id;
  else {
    const t = await chrome.tabs.create({ url: `${GS}/robots.txt`, active: false });
    tabId = t.id; created = true;
    await waitFor(tabId, () => true, 45e3).catch(() => {});
  }
  try { return await fn(tabId); }
  finally { if (created) chrome.tabs.remove(tabId).catch(() => {}); }
}

// ---------- injected into gradescope.com (self-contained) ----------
// `base` is empty when this runs inside a gradescope.com tab, and "https://www.gradescope.com" when it runs in
// CampusPilot's own hidden page (no tab needed; the browser still sends the Gradescope login).
export async function pageCourses(base = "") {
  const read = async (path) => { const r = await fetch(base + path, { credentials: base ? "include" : "same-origin" }); return { url: r.url, html: await r.text() }; };
  const parse = (html) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const out = [];
    for (const a of doc.querySelectorAll("a[href*='/courses/']")) {
      // the course's own link (relative or full), not links to its assignments
      const m = (a.getAttribute("href") || "").match(/^(?:https:\/\/www\.gradescope\.com)?\/courses\/(\d+)\/?(?:[?#].*)?$/);
      if (!m || out.some((c) => c.id === m[1])) continue;
      const short = (a.querySelector(".courseBox--shortname, [class*='shortname']")?.textContent || a.querySelector("h3,h4")?.textContent || a.getAttribute("title") || a.textContent || "").trim().replace(/\s+/g, " ");
      const name = (a.querySelector(".courseBox--name, [class*='courseBox--name']")?.textContent || "").trim().replace(/\s+/g, " ");
      const termEl = a.closest(".courseList--coursesForTerm, [class*='coursesForTerm']")?.previousElementSibling;
      if (short) out.push({ id: m[1], short: short.slice(0, 80), name, term: (termEl?.textContent || "").trim() });
    }
    return out;
  };
  const loginPage = (p) => /name="session\[email\]"|id="login-form"|\/login\b/i.test(p.html) && !/courseBox|courseList/.test(p.html);
  // The course list is on /account (older layout) or the home page (newer layout).
  const first = await read("/account");
  let courses = parse(first.html);
  if (!courses.length) { const home = await read("/"); courses = parse(home.html); if (!courses.length && loginPage(home) && loginPage(first)) return { login: true }; }
  return { courses };
}

export async function pageAssignments(courseId, base = "") {
  const r = await fetch(`${base}/courses/${courseId}`, { credentials: base ? "include" : "same-origin" });
  if (!r.ok) return { error: r.status };
  if (/\/login\b/.test(new URL(r.url).pathname)) return { login: true };
  const doc = new DOMParser().parseFromString(await r.text(), "text/html");
  const title = (doc.querySelector(".courseHeader--title, h1")?.textContent || "").trim();
  const rows = doc.querySelectorAll("#assignments-student-table tbody tr, table.table tbody tr");
  const list = [];
  for (const row of rows) {
    const head = row.querySelector("th") || row.cells[0];
    if (!head) continue;
    const name = head.textContent.trim().replace(/\s+/g, " ");
    // Only links to an existing submission count; buttons (upload dialogs) and links to unsubmitted assignments are ignored.
    const link = head.querySelector("a[href*='/submissions/']")?.getAttribute("href") || null;
    const cells = [...row.querySelectorAll("td")].map((td) => td.textContent.trim().replace(/\s+/g, " "));
    const statusText = (row.querySelector(".submissionStatus--text")?.textContent || cells[0] || "").trim();
    const score = (row.querySelector(".submissionStatus--score")?.textContent || (cells[0]?.match(/\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?/) || [""])[0]).trim();
    // Due date: the row's "due" time (Gradescope shows release and due dates as <time datetime=…>).
    const times = [...row.querySelectorAll("time[datetime]")];
    const dueEl = row.querySelector(".submissionTimeChart--dueDate[datetime], .submissionTimeChart--dueDate time[datetime]") || times.find((x) => /due/i.test(x.getAttribute("aria-label") || x.className || "")) || times[1] || null;
    // Gradescope writes "2026-11-07 23:59:00 -0800": made into "2026-11-07T23:59:00-08:00" so every browser reads it.
    const raw = dueEl?.getAttribute("datetime") || "";
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*([+-]\d{2}):?(\d{2})$/);
    const due = m ? `${m[1]}T${m[2]}${m[3]}:${m[4]}` : raw || null;
    if (name) list.push({ name, submissionPath: link, status: score ? "Graded" : statusText || (link ? "Submitted" : "No Submission"), score, due });
  }
  return { title, assignments: list };
}

// Finds the download links on a submission page: "Download Graded Copy" (PDF with marks and comments)
// and "Download Submission" (what was turned in). Falls back to links embedded in the page's data.
async function pageSubmissionFiles(path) {
  const r = await fetch(path, { credentials: "same-origin" });
  if (!r.ok) return { error: r.status };
  const html = await r.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const found = [];
  const add = (href, label) => {
    if (!href) return;
    const url = new URL(href.replace(/&amp;/g, "&"), location.origin).href;
    if (!found.some((f) => f.url === url)) found.push({ url, label: (label || "").trim().replace(/\s+/g, " ") });
  };
  for (const a of doc.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href"), text = a.textContent || "";
    if (/download/i.test(text) || /\.pdf(\?|$)|zip_download|\/download(\?|$)/.test(href)) add(href, text);
  }
  for (const m of html.matchAll(/"((?:\\\/|\/)courses\/\d+\/assignments\/\d+\/submissions\/\d+[^"]*?(?:\.pdf|zip_download|download)[^"]*)"/g)) add(m[1].replace(/\\\//g, "/"), "");
  const base = path.replace(/[?#].*$/, "").replace(/\/$/, "");
  // "Download Graded Copy" is the submission's address + ".pdf" (e.g. /courses/1/assignments/2/submissions/3.pdf)
  const graded = found.find((f) => /graded/i.test(f.label)) || found.find((f) => f.url.split("?")[0].endsWith(`${base}.pdf`))
    || (/\/submissions\/\d+$/.test(base) && !/online|programming|autograder/i.test(doc.body?.className || "") ? { url: new URL(`${base}.pdf`, location.origin).href, label: "graded copy (direct)" } : null);
  const original = found.find((f) => f !== graded && /submission|original/i.test(f.label)) || found.find((f) => f !== graded && /zip_download|\/download/.test(f.url));
  return { graded: graded || null, original: original || null, all: found };
}

async function pageLoad(url) {
  let r;
  // A cross-site redirect (files kept on cloud storage) can't be followed from the page; the caller then fetches it directly.
  try { r = await fetch(url, { credentials: "same-origin" }); } catch { return { error: "redirect" }; }
  if (!r.ok) return { error: r.status };
  const type = r.headers.get("content-type") || "";
  if (/text\/html/.test(type)) return { error: "not a file" };
  // Before grading, ".pdf" answers with the submission's details (JSON) instead of a file;
  // the PDF that was turned in is linked inside it (pdf_attachment.url, on Gradescope's file storage).
  if (/json/.test(type)) {
    const j = await r.json().catch(() => null);
    const att = j?.pdf_attachment;
    if (att?.url) return { follow: att.url, fname: att.filename || "", ready: j.pdf_ready !== false };
    return { error: j?.pdf_ready === false ? "Gradescope is still preparing this PDF; try again later" : "no file in Gradescope's answer" };
  }
  const disp = r.headers.get("content-disposition") || "";
  const fname = decodeURIComponent((disp.match(/filename\*=UTF-8''([^;]+)/i) || disp.match(/filename="?([^";]+)"?/i) || [])[1] || "");
  globalThis.__spBlob = await r.blob();
  return { size: globalThis.__spBlob.size, type, fname };
}

// ---------- operations ----------
// Reading without a tab: background.js hands in a function that runs pageCourses/pageAssignments in the hidden page.
let quiet = null;
export const setQuiet = (fn) => { quiet = fn; };
const openTabCourses = async (courses) => {
  for (const t of await chrome.tabs.query({ url: `${GS}/courses/*` }).catch(() => [])) {
    const m = (t.url || "").match(/\/courses\/(\d+)/);
    if (!m || courses.some((c) => c.id === m[1])) continue;
    const short = (t.title || "").replace(/\s*[|·-]\s*Gradescope.*$/i, "").trim();
    if (short && !/^gradescope$/i.test(short)) courses.push({ id: m[1], short, name: "", term: "", fromTab: true });
  }
  return courses;
};
export async function status() {
  if (quiet && (await hasGsPermission())) {
    const r = await quiet("courses").catch(() => null);
    if (r?.courses?.length) return { state: "ok", courses: await openTabCourses([...r.courses]), quiet: true };
  }
  return withGs(async (tabId) => {
    const r = await run(tabId, pageCourses);
    if (r.login) return { state: "login" };
    // Also any Gradescope course open in a tab (its title is the course name), in case the list page changed.
    const courses = [...r.courses];
    for (const t of await chrome.tabs.query({ url: `${GS}/courses/*` }).catch(() => [])) {
      const m = (t.url || "").match(/\/courses\/(\d+)/);
      if (!m || courses.some((c) => c.id === m[1])) continue;
      const short = (t.title || "").replace(/\s*[|·-]\s*Gradescope.*$/i, "").trim();
      if (short && !/^gradescope$/i.test(short)) courses.push({ id: m[1], short, name: "", term: "", fromTab: true });
    }
    return { state: "ok", courses };
  });
}

export const openLogin = () => chrome.tabs.create({ url: `${GS}/login`, active: true });

export async function assignments(gsCourseId) {
  if (quiet && (await hasGsPermission())) {
    const r = await quiet("assignments", gsCourseId).catch(() => null);
    if (r && !r.error && !r.login && Array.isArray(r.assignments)) return r;
  }
  return withGs(async (tabId) => {
    const r = await run(tabId, pageAssignments, [gsCourseId]);
    if (r.error) throw new Error(r.error === 401 || r.error === 403 ? "Gradescope wants you to log in again." : `Gradescope answered ${r.error}.`);
    return r;
  });
}

// ---------- "turned in on Gradescope" (Canvas often shows nothing until it's graded) ----------
// "Homework 3" / "HW3" / "hw 3 - due Friday" all become "hw 3".
export const workKey = (s) => norm(s).replace(/\bhomework\b/g, "hw").replace(/\bproblem set\b|\bpset\b/g, "ps")
  .replace(/\bassignment\b/g, "a").replace(/\blab(oratory)?\b/g, "lab").replace(/([a-z])(\d)/g, "$1 $2").replace(/\s+/g, " ").trim();
// Read the assignment list from a Gradescope tab that's already open (no new tab).
export const assignmentsInTab = async (tabId, gsCourseId) => { const r = await run(tabId, pageAssignments, [gsCourseId]); if (r?.error) throw new Error(`Gradescope answered ${r.error}.`); return r; };
// Listed on Gradescope but nothing turned in yet.
export const notTurnedIn = (list) => (list || []).filter((a) => !a.submissionPath && !/^(submitted|graded)/i.test(a.status || "")).map((a) => workKey(a.name));
export const turnedIn = (list) => (list || []).filter((a) => a.submissionPath || /^(submitted|graded)/i.test(a.status || "")).map((a) => workKey(a.name));
const isIn = (a) => !!a.submissionPath || /^(submitted|graded|late)/i.test(a.status || "") || !!a.score;
// Everything listed on Gradescope, with whether it's turned in and when it's due (for matching by date too).
export const gsItems = (list) => (list || []).map((a) => ({ k: workKey(a.name), due: a.due ? Date.parse(a.due) || null : null, done: isIn(a) }));
const STOP = new Set(["hw", "ps", "a", "the", "of", "and", "on", "to", "in", "for", "part", "due", "submit", "submission", "gradescope", "assignment", "week", "s"]);
const words = (k) => k.split(" ").filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
const numsOf = (k) => (k.match(/\d+/g) || []).map(Number);
/** The Gradescope item a Canvas assignment is, or null. Same name ("HW3" = "Homework 3: Sets"), or the same due time
 *  with the same number or a shared word ("Week 7 problems" = "Problem Set 7", both due Fri 11:59pm). Never "HW 3" = "HW 30". */
export function matchItem(a, items) {
  const k = workKey(a.name);
  if (!k || !items?.length) return null;
  const byName = items.find((g) => matchesTurnedIn(a.name, [g.k]));
  if (byName) return byName;
  const due = a.due_at ? Date.parse(a.due_at) : null;
  if (!due) return null;
  const n = numsOf(k), w = words(k);
  const same = items.filter((g) => g.due && Math.abs(g.due - due) <= 2 * 3600e3);
  const fit = same.filter((g) => { const gn = numsOf(g.k); const numOk = !n.length || !gn.length ? true : n.some((x) => gn.includes(x)); return numOk && (n.some((x) => gn.includes(x)) || words(g.k).some((x) => w.includes(x))); });
  if (fit.length === 1) return fit[0];
  return same.length === 1 && n.length && numsOf(same[0].k).some((x) => n.includes(x)) ? same[0] : null;
}
export function matchesTurnedIn(name, keys) {
  const k = workKey(name);
  if (!k || !keys?.length) return false;
  const nums = (s) => (s.match(/\d+/g) || []).join(",");
  return keys.some((g) => g === k || ((g.startsWith(k + " ") || k.startsWith(g + " ")) && nums(g.split(" ").slice(0, 3).join(" ")) === nums(k.split(" ").slice(0, 3).join(" "))));
}
// Mark Canvas assignments turned in on Gradescope as submitted (Canvas usually has no submission until grades are posted).
export function applyTurnedIn(snapshot, gsSubmitted = {}) {
  for (const c of snapshot?.courses || []) {
    const rec = gsSubmitted[c.id];
    if (!rec) continue;
    const keys = rec.keys || [], open = rec.open || [];
    for (const a of c.assignments) {
      delete a.gs;
      if (a.submitted) continue;
      if (rec.items) {
        // a pairing Gemma made for names the rules couldn't match (background.js › pairWithGemma)
        const paired = rec.pairs?.[a.id];
        const g = (paired && rec.items.find((x) => x.k === paired)) || matchItem(a, rec.items);
        if (g?.done) { a.submitted = true; a.submitted_via = "Gradescope"; a.missing = false; }
        else if (g) { a.gs = "open"; a.gsAt = rec.at; }
        continue;
      }
      // Older saved checks (names only). "HW3" = "Homework 3" = "hw 3 (due Fri)", but never "HW 30"
      if (matchesTurnedIn(a.name, keys)) { a.submitted = true; a.submitted_via = "Gradescope"; a.missing = false; }
      else if (matchesTurnedIn(a.name, open)) { a.gs = "open"; a.gsAt = rec.at; }
    }
  }
  return snapshot;
}

// Items you marked done yourself ("Mark done" in the to-do lists): settings.doneItems { "courseId:assignmentId": at }.
export function applyMarked(snapshot, doneItems = {}) {
  for (const c of snapshot?.courses || []) for (const a of c.assignments) {
    const marked = !!doneItems[`${c.id}:${a.id}`];
    if (marked && !a.submitted) { a.submitted = true; a.submitted_via = "marked"; a.missing = false; }
    else if (!marked && a.submitted_via === "marked") { a.submitted = false; delete a.submitted_via; }
  }
  return snapshot;
}

// Match Canvas courses to Gradescope courses by course code or name ("BIO 101 F26").
export function matchCourse(canvasCourse, gsCourses) {
  const code = norm(canvasCourse.code), name = norm(canvasCourse.name);
  return gsCourses.find((g) => norm(g.short) === code || norm(g.name) === name)
    || gsCourses.find((g) => code && norm(g.short) && (norm(g.short).startsWith(code + " ") || code.startsWith(norm(g.short) + " ")))
    || gsCourses.find((g) => name && norm(g.name) && (name.includes(norm(g.name)) || norm(g.name).includes(name)))
    || null;
}

const safe = (s) => String(s || "file").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 90) || "file";
const extFor = (type, url, fname) => (fname.match(/\.[a-z0-9]{1,6}$/i)?.[0])
  || (/pdf/.test(type) ? ".pdf" : /zip/.test(type) ? ".zip" : (url.split("?")[0].match(/\.[a-z0-9]{1,6}$/i)?.[0]) || "");

/**
 * Streams the student's Gradescope work for one course into a zip being built (addChunk/commit from the caller).
 * prefix: folder inside the zip ("" or "<course>/My submissions/Gradescope"). Graded copies when available,
 * otherwise what was turned in. Returns { added, failed: [{path,error}], skipped: [names without a submission] }.
 */
export async function streamCourse(gsCourseId, { prefix = "", addChunk, commit, addUrl = null, onProgress = () => {} }) {
  const CHUNK = 8 * 1024 * 1024;
  return withGs(async (tabId) => {
    const r = await run(tabId, pageAssignments, [gsCourseId]);
    if (r.error) throw new Error(`Gradescope answered ${r.error}.`);
    const submitted = r.assignments.filter((a) => a.submissionPath);
    const failed = [], skipped = r.assignments.filter((a) => !a.submissionPath).map((a) => a.name);
    let added = 0;
    for (let i = 0; i < submitted.length; i++) {
      const a = submitted[i];
      await onProgress(i, submitted.length, a.name);
      const dir = [prefix, safe(a.name)].filter(Boolean).join("/");
      try {
        const links = await run(tabId, pageSubmissionFiles, [a.submissionPath]);
        if (links.error) throw new Error(`Gradescope answered ${links.error}`);
        const picks = [];
        const isGraded = a.status === "Graded" || !!a.score;
        if (links.graded) picks.push({ ...links.graded, as: isGraded ? "graded" : "submission", direct: /direct/.test(links.graded.label) });
        // The graded copy already contains the pages you turned in; add the original only for code/zip submissions.
        if (links.original && (!links.graded || /zip|code|program/i.test(`${links.original.url} ${links.original.label}`))) picks.push({ ...links.original, as: "submission" });
        if (!picks.length) {
          // No download buttons (online assignments): save a link to the graded page instead.
          const p = `${dir}/Open on Gradescope.url`;
          await addChunk(p, btoa(`[InternetShortcut]\r\nURL=${GS}${a.submissionPath}\r\n`));
          await commit(p);
          added++;
          continue;
        }
        for (const pick of picks) {
          let info = await run(tabId, pageLoad, [pick.url]);
          // Follow the file link from a JSON answer (ungraded submissions); if the page can't fetch it, fetch it directly.
          if (info?.follow) {
            const fname = info.fname;
            const next = await run(tabId, pageLoad, [info.follow]);
            if (next?.error === "redirect" || next?.error) {
              if (!addUrl) throw new Error("couldn't download the submitted file");
              await addUrl(`${dir}/${safe(a.name)} (${pick.as})${extFor("", info.follow, fname) || ".pdf"}`, info.follow);
              added++;
              continue;
            }
            info = { ...next, fname: next.fname || fname };
          }
          // The direct graded-copy address doesn't exist for every assignment type: fall back to the original.
          if (info?.error && pick.direct && links.original && !picks.some((x) => x.url === links.original.url)) { picks.push({ ...links.original, as: "submission" }); continue; }
          if (info?.error === "redirect" && addUrl) {
            await addUrl(`${dir}/${safe(a.name)} (${pick.as})${extFor("", pick.url, "") || ".pdf"}`, pick.url);
            added++;
            continue;
          }
          if (info?.error) throw new Error(info.error === "not a file" ? "download link didn't return a file" : `Gradescope answered ${info.error}`);
          const p = `${dir}/${safe(a.name)} (${pick.as})${extFor(info.type, pick.url, info.fname)}`;
          for (let off = 0; off < info.size || off === 0; off += CHUNK) {
            await addChunk(p, await run(tabId, pageChunk, [off, Math.min(info.size, off + CHUNK)]));
            if (info.size === 0) break;
          }
          await commit(p);
          await run(tabId, pageFree).catch(() => {});
          added++;
        }
      } catch (e) {
        failed.push({ path: `${dir}`, error: e.message });
      }
    }
    return { added, failed, skipped, title: r.title };
  });
}

// For tests
export const _page = { pageCourses, pageAssignments, pageSubmissionFiles, pageLoad };
