// Lecture files saved on this computer (the extension's own storage): every PDF, slide deck, document or picture
// CampusPilot reads is kept, so the slide viewer, Gemini and exports don't depend on Canvas handing the file over
// again (signed download links expire, file servers need extra permission, and Canvas can be down). Videos and
// audio are never kept. Oldest-used files go first if it ever grows past the limit.
const DB = "campuspilot-files", STORE = "files";
export const MAX_FILE = 150e6, MAX_TOTAL = 4e9;
let dbp = null;
function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "key" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
const run = async (mode, fn) => {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    let out;
    const r = fn(t.objectStore(STORE));
    if (r && "onsuccess" in r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
  });
};
/** The key a Canvas file is kept under. */
export const fileKey = (f) => (f?.id ? `file:${f.id}` : f?.url ? `url:${String(f.url).replace(/[?&](verifier|download_frd|wrap)=[^&]*/g, "")}` : null);
export const keepable = (name = "", type = "") => !/^(video|audio)\//i.test(type) && !/\.(mp4|mov|m4v|webm|mkv|avi|mp3|m4a|wav|aac|ogg)$/i.test(name);

/** A saved file as a Blob (or null). Marks it as used. */
export async function getFile(f) {
  const key = typeof f === "string" ? f : fileKey(f);
  if (!key) return null;
  const rec = await run("readonly", (s) => s.get(key)).catch(() => null);
  if (!rec?.blob) return null;
  run("readwrite", (s) => s.put({ ...rec, used: Date.now() })).catch(() => {});
  return rec.blob;
}
export async function hasFile(f) {
  const key = typeof f === "string" ? f : fileKey(f);
  if (!key) return false;
  const k = await run("readonly", (s) => s.getKey(key)).catch(() => null);
  return !!k;
}
/** Saves a file (a Blob or ArrayBuffer). Skips videos, audio and very large files. */
export async function putFile(f, data, { name = "", type = "" } = {}) {
  const key = fileKey(f);
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || "application/octet-stream" });
  if (!key || !keepable(name || f?.name, type || blob.type) || blob.size > MAX_FILE || !blob.size) return false;
  await run("readwrite", (s) => s.put({ key, blob, name: name || f?.name || "", type: type || blob.type, size: blob.size, at: Date.now(), used: Date.now() }));
  trim().catch(() => {});
  return true;
}
/** { count, bytes } */
export async function fileStats() {
  const all = await run("readonly", (s) => s.getAll()).catch(() => []) || [];
  return { count: all.length, bytes: all.reduce((a, r) => a + (r.size || 0), 0) };
}
/** What's saved (no file contents): [{ key, name, type, size, used }] */
export async function fileList() {
  const d = await db();
  return new Promise((resolve, reject) => {
    const out = [], req = d.transaction(STORE, "readonly").objectStore(STORE).openCursor();
    req.onsuccess = () => { const c = req.result; if (!c) return resolve(out); const { key, name, type, size, used } = c.value; out.push({ key, name, type, size, used }); c.continue(); };
    req.onerror = () => reject(req.error);
  });
}
export const clearFiles = () => run("readwrite", (s) => s.clear());
async function trim() {
  const all = (await run("readonly", (s) => s.getAll()) || []).map(({ key, size, used }) => ({ key, size, used }));
  let total = all.reduce((a, r) => a + (r.size || 0), 0);
  if (total <= MAX_TOTAL) return;
  for (const r of all.sort((a, b) => a.used - b.used)) {
    if (total <= MAX_TOTAL * 0.9) break;
    await run("readwrite", (s) => s.delete(r.key));
    total -= r.size || 0;
  }
}
/**
 * The file: the saved copy, or a fresh download (saved for next time). Throws if neither works.
 * fetchFn lets the caller download another way (the background, which has the file servers' permissions).
 */
export async function loadFile(f, { fetchFn = null } = {}) {
  const saved = await getFile(f).catch(() => null);
  if (saved) return saved;
  let blob = null;
  if (fetchFn) blob = await fetchFn(f);
  else {
    const res = await fetch(f.url, { credentials: "include" });
    if (!res.ok) throw new Error(`Canvas said ${res.status}`);
    const type = res.headers.get("content-type") || "";
    if (/text\/html/.test(type) && !/\.html?$/i.test(f.name || "")) throw new Error("Canvas sent a web page instead of the file (are you logged in?)");
    blob = await res.blob();
  }
  await putFile(f, blob, { name: f.name, type: f.type || blob.type }).catch(() => {});
  return blob;
}
