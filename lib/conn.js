// Optional connections (Gradescope, Jupyter notebooks), per course. CampusPilot looks at each course (its Canvas
// menu, modules and assignments) and turns a connection on for the courses where it finds it; everywhere else it's
// off. The student's own ticks in Settings › Connections always win.
//   settings.connFound = { gradescope: [courseIds], jupyter: [courseIds] }   (what CampusPilot found)
//   settings.conn = { gradescope: { picks: { [courseId]: true | false } }, ... }   (the student's own choices)
// Before the first look (connFound not there yet), the older all-courses switch { on, courses } still applies.
export const CONNECTIONS = ["gradescope", "jupyter"];
export function connOn(settings, kind, courseId = null) {
  const c = settings?.conn?.[kind] || {};
  const picks = c.picks || {};
  const found = settings?.connFound?.[kind];
  const has = (id) => Object.prototype.hasOwnProperty.call(picks, String(id));
  const legacy = (id) => !!c.on && (!Array.isArray(c.courses) || c.courses.map(String).includes(String(id)));
  const one = (id) => (has(id) ? !!picks[String(id)] : Array.isArray(found) ? found.map(String).includes(String(id)) : legacy(id));
  if (courseId != null) return one(courseId);
  // "Is it on for any course?"
  if (Object.values(picks).some(Boolean)) return true;
  return Array.isArray(found) ? found.some((id) => !has(id)) : !!c.on;
}
/** Is this connection on because CampusPilot found it (not because the student ticked it)? */
export const connFoundFor = (settings, kind, courseId) => (settings?.connFound?.[kind] || []).map(String).includes(String(courseId));
/** The student's own tick for one course. */
export function connPick(settings, kind, courseId, on) {
  const conn = { ...(settings?.conn || {}) };
  const cur = { ...(conn[kind] || {}) };
  cur.picks = { ...(cur.picks || {}), [String(courseId)]: !!on };
  conn[kind] = cur;
  return conn;
}
/** Students who already used a connection before it became optional keep it on (for all their courses). */
export function migrateConn(settings, { gsPermission = false } = {}) {
  if (settings.conn) return null;
  const used = {
    gradescope: gsPermission || Object.values(settings.gradescopeMap || {}).some((v) => v && v !== "none"),
    jupyter: Object.values(settings.jupyterCourseFolders || {}).some((f) => f?.length) || Object.keys(settings.jupyterHubs || {}).length > 0 || !!settings.jupyterUrl,
  };
  return Object.fromEntries(CONNECTIONS.map((k) => [k, { on: !!used[k], courses: null }]));
}
