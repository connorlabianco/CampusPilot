// Chrome's built-in AI (Gemini Nano, through the Prompt API). It runs on the student's own computer, free and offline
// once Chrome has downloaded it. It's small, so CampusPilot only gives it short, text-only jobs (sidepanel/direct.js
// decides), and only when the student uses their own AI for everything else.
const OPTS = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };
const api = () => globalThis.LanguageModel || null;

/** "unavailable" | "downloadable" | "downloading" | "available" (Chrome's own check of this computer). */
export async function nanoStatus() {
  const LM = api();
  if (!LM?.availability) return "unavailable";
  try { return await LM.availability(OPTS); } catch { return "unavailable"; }
}
/** Starts (or finishes) Chrome's download. Must be called from a click. onProgress(0..1). */
export async function nanoPrepare({ onProgress } = {}) {
  const LM = api();
  if (!LM) throw new Error("This version of Chrome doesn't have the built-in AI.");
  const s = await LM.create({ ...OPTS, monitor(m) { m.addEventListener("downloadprogress", (e) => onProgress?.(e.loaded)); } });
  s.destroy?.();
  return true;
}
const room = (s) => s.contextWindow ?? s.inputQuota ?? 0;
const used = async (s, text) => (s.measureContextUsage ? s.measureContextUsage(text) : s.measureInputUsage ? s.measureInputUsage(text) : Math.ceil(text.length / 3.5));
/** Answers `text` if it fits in what the model can read at once (leaving half for the answer). Returns null if not. */
export async function nanoAsk(text, { onText, signal } = {}) {
  const LM = api();
  if (!LM || (await nanoStatus()) !== "available") return null;
  const s = await LM.create({ ...OPTS, signal });
  try {
    const n = await used(s, text);
    if (!room(s) || n > room(s) * 0.5) return null;
    let out = "";
    const stream = s.promptStreaming(text, { signal });
    for await (const chunk of stream) {
      // Chrome used to send the whole answer so far each time; now it sends just the new part.
      out = chunk.startsWith(out) && out ? chunk : out + chunk;
      onText?.(out);
    }
    return out;
  } finally { s.destroy?.(); }
}
