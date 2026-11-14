// The last few problems CampusPilot ran into, on this computer only. They go nowhere unless the student sends a
// report (Settings › Report a problem) and leaves "Include technical details" on. Text is trimmed and scrubbed
// of email addresses, long numbers and links' query strings before it's kept.
const KEY = "errLog", MAX = 40;
export const scrub = (s) => String(s || "")
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
  .replace(/(https?:\/\/[^\s?#"']+)[?#][^\s"']*/g, "$1")
  .replace(/\b(AIza[0-9A-Za-z_-]{20,}|ya29\.[\w.-]+|\d{4,}~[\w]{20,})\b/g, "[secret]")
  .replace(/\b\d{7,}\b/g, "[n]")
  .slice(0, 400);
let queue = Promise.resolve();
export function logError(where, err) {
  const entry = { at: Date.now(), where, msg: scrub(err?.message || err), stack: scrub(String(err?.stack || "").split("\n").slice(1, 4).join(" | ")) };
  queue = queue.then(async () => {
    const { [KEY]: list = [] } = await chrome.storage.local.get(KEY);
    const last = list[list.length - 1];
    if (last && last.msg === entry.msg && entry.at - last.at < 5000) return; // the same thing twice in a row
    await chrome.storage.local.set({ [KEY]: [...list, entry].slice(-MAX) });
  }).catch(() => {});
  return queue;
}
export const recentErrors = async () => (await chrome.storage.local.get(KEY))[KEY] || [];
export const clearErrors = () => chrome.storage.local.remove(KEY);
