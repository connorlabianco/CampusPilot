// "Set up your free AI": shown the first time an AI feature is used (and from Settings › Your AI).
// The easy way: Sign in with Google, and CampusPilot makes a free Gemini key in the student's own Google account,
// after showing exactly what it will do (lib/gkey.js). The backups: Google's key page (paste-free: the copied key is
// picked up from the clipboard), or the student's own AI website, as before.
import { h, state, toast, saveSettings, rerender } from "./core.js";
import { icon } from "../lib/icons.js";
import { PROVIDERS } from "../lib/ai.js";
import { canFill, requestFillPermission } from "../lib/autofill.js";
import { checkKey, setKey, getKey, clearKey, findKeyIn, looksLikeKey, ORIGINS as GEMINI_ORIGINS } from "../lib/gemini.js";
import { makeKeyWithGoogle, ORIGINS as SETUP_ORIGINS, STEPS, consoleUrl, TERMS_URL, STUDIO_URL } from "../lib/gkey.js";
import { nanoStatus, nanoPrepare } from "../lib/nano.js";

let open = null;
/** Opens the setup sheet. Resolves true once an AI is set up, false if closed. */
export function openAiSetup({ again = false, start = "home" } = {}) {
  if (open) return open.promise;
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  const dlg = h("dialog", { class: "sheet ai-pick ai-setup", "aria-label": "Set up your AI" });
  const body = h("div", { class: "sheet-in" });
  dlg.append(body);
  let stopPickup = null;
  const finish = (ok) => { stopPickup?.(); dlg.close(); dlg.remove(); open = null; resolve(ok); rerender(); };
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish(false); });
  open = { promise };
  const head = (title, sub, back = null) => h("div", { class: "sheet-head" },
    back ? h("button", { class: "ghost", "aria-label": "Back", onclick: back }, icon("back", 18)) : null,
    h("div", { class: "grow" }, h("b", {}, title), sub ? h("div", { class: "meta" }, sub) : null),
    h("button", { class: "x-btn", "aria-label": "Close", onclick: () => finish(false) }, icon("close", 16)));
  const show = (...kids) => { stopPickup?.(); stopPickup = null; body.replaceChildren(...kids.flat().filter(Boolean)); body.scrollTop = 0; };

  // ---- 1. the choice ----
  const home = () => show(
    head(again ? "Set up Gemini again" : "Set up your free AI", "CampusPilot uses AI to write your practice questions, lecture checklists and study plans."),
    h("div", { class: "setup-main" },
      h("div", { class: "row", style: "gap:8px;align-items:center" }, h("b", { class: "grow" }, "Free Gemini, right inside CampusPilot"), h("span", { class: "pill" }, "Recommended")),
      h("ul", { class: "setup-points" },
        h("li", {}, "Answers come straight back here: no tabs to switch, nothing to copy or paste."),
        h("li", {}, "Free, and works on any computer."),
        h("li", {}, "One minute to set up, once.")),
      h("div", { class: "note setup-personal" }, h("b", {}, "Needs a personal Google account (like Gmail). "), "School Google accounts don't work: schools block this."),
      h("button", { class: "btn block google-btn", onclick: details }, h("span", { class: "g-mark", "aria-hidden": "true" }, "G"), "Sign in with a personal Google account"),
      h("p", { class: "hint", style: "margin:6px 0 0" }, "Next you'll see exactly what CampusPilot does in it, before anything happens.")),
    h("button", { class: "linkish setup-alt", onclick: ownAi }, "Use my own AI instead (ChatGPT, Claude, Gemini, Copilot)"));

  // ---- 2. exactly what will happen ----
  const details = () => show(
    head("Before you sign in", "Here's exactly what happens.", home),
    h("div", { class: "setup-sec" },
      h("b", {}, "In your Google account, CampusPilot will:"),
      h("ol", { class: "setup-steps" },
        h("li", {}, h("b", {}, "Make a free Google Cloud project named “CampusPilot”. "), "No billing and no card: nothing can be charged. (If you set this up before, it uses that project.)"),
        h("li", {}, h("b", {}, "Turn on the Gemini API "), "in that project."),
        h("li", {}, h("b", {}, "Make an API key named “campuspilot” "), "that only works for Gemini, and save it on this computer only. It isn't synced, exported or sent anywhere else."))),
    h("div", { class: "setup-sec" },
      h("b", {}, "What Google will ask"),
      h("p", {}, "Google shows a permission screen asking to let CampusPilot “see, edit, configure and delete your Google Cloud data”. CampusPilot needs that only for the three steps above. It doesn't keep this access: it's dropped as soon as your key is made."),
      h("p", { class: "hint" }, "Google may also say it hasn't verified CampusPilot yet. You can still continue (Advanced › Go to CampusPilot), or use one of the other ways below.")),
    h("div", { class: "setup-sec" },
      h("b", {}, "What this means for your data"),
      h("ul", { class: "setup-points" },
        h("li", {}, "Your lecture material and questions go from this browser straight to Google's Gemini, not through CampusPilot."),
        h("li", {}, "On Gemini's free tier, Google may use what you send to improve its products, and people at Google may review it. Don't send anything private."),
        h("li", {}, "Free use has daily limits. If you reach one, CampusPilot offers Gemini's website for that request instead."),
        h("li", {}, h("b", {}, "Use a personal Google account (like Gmail). "), "School Google accounts don't work: schools block this on theirs. Google also requires you to be 18 or older."),
        h("li", {}, "You can remove the key, or delete the whole project, any time from Settings › Your AI."))),
    h("button", { class: "btn block google-btn", onclick: (e) => run(e) }, h("span", { class: "g-mark", "aria-hidden": "true" }, "G"), "Continue with Google"),
    h("div", { class: "setup-or" },
      h("button", { class: "linkish", onclick: manual }, "Get a key on Google's page myself"), " · ",
      h("button", { class: "linkish", onclick: ownAi }, "Use my own AI")));

  // ---- 3. doing it ----
  const run = (e) => {
    // Chrome only asks for new site access during a click, so this comes first.
    const perm = chrome.permissions.request({ origins: SETUP_ORIGINS }).catch(() => false);
    const rows = STEPS.map((s) => h("li", {}, h("span", { class: "st-dot" }), h("span", {}, s)));
    show(head("Setting up Gemini", "Keep this open. It takes about a minute."), h("ol", { class: "setup-progress" }, rows));
    (async () => {
      if (!(await perm)) throw Object.assign(new Error("CampusPilot needs to be allowed to reach Google's setup pages."), { kind: "cancelled" });
      const r = await makeKeyWithGoogle({ onStep: (i) => rows.forEach((li, k) => { li.className = k < i ? "done" : k === i ? "now" : ""; }) });
      rows.forEach((li) => { li.className = "done"; });
      await saveSettings({ aiProvider: "gemini-key", onboarded: true });
      done(r);
    })().catch((err) => trouble(err));
  };
  const done = (r) => show(
    head("Gemini is ready", null),
    h("p", {}, "From now on, CampusPilot asks Gemini right here: questions, checklists and plans come back by themselves."),
    h("p", { class: "hint" }, "Your key “campuspilot” is in the Google Cloud project ", h("a", { href: consoleUrl(r.project), target: "_blank", rel: "noopener" }, r.project), ". You can manage it in Settings › Your AI."),
    h("button", { class: "btn block", onclick: () => finish(true) }, "Done"));
  const trouble = (err) => {
    const k = err.kind || "other";
    const msg = { cancelled: "Nothing was made. If Google said access is blocked by your administrator, press Try again and pick a Google account not associated with your institution.", terms: "Open Google Cloud, accept its terms (one click, free), then come back and press Try again.",
      school: "Press Try again and pick a personal Google account in Google's window. Or use your own AI instead.",
      setup: "For now, get a key on Google's page instead (about a minute), or use your own AI.", projects: "Delete a project you don't use in Google Cloud, or get a key on Google's page instead." }[k] || "You can try again, get a key on Google's page, or use your own AI.";
    show(head(k === "cancelled" ? "Sign-in closed" : k === "school" ? "Use a Google account not associated with your institution" : "That didn't work", null, details),
      h("div", { class: "note warn" }, err.message),
      h("p", {}, msg),
      err.detail && err.detail !== err.message ? h("details", { class: "setup-detail" }, h("summary", {}, "What Google said"),
        h("code", {}, err.detail), h("button", { class: "linkish", onclick: async () => { const { copyText } = await import("./core.js"); await copyText(err.detail); toast("Copied"); } }, "Copy")) : null,
      k === "setup" ? h("button", { class: "btn block", onclick: manual }, "Get a key on Google's page") : null,
      k === "terms" ? h("a", { class: "btn block secondary", href: TERMS_URL, target: "_blank", rel: "noopener" }, "Open Google Cloud") : null,
      h("button", { class: `btn block${k === "setup" ? " secondary" : ""}`, style: "margin-top:6px", onclick: (e) => run(e) }, "Try again"),
      h("div", { class: "setup-or" },
        k === "setup" ? null : [h("button", { class: "linkish", onclick: manual }, "Get a key on Google's page"), " · "],
        h("button", { class: "linkish", onclick: ownAi }, "Use my own AI")));
  };

  // ---- the backup: Google's key page (the copied key is picked up by itself) ----
  const manual = () => {
    const input = h("input", { type: "password", placeholder: "AIza…", "aria-label": "Your Gemini API key", autocomplete: "off", spellcheck: "false" });
    const status = h("div", { class: "hint", role: "status" });
    const tryKey = async (k) => {
      k = (k || "").trim();
      if (!looksLikeKey(k)) { status.textContent = "That doesn't look like a Gemini key. It starts with “AIza”."; return; }
      status.textContent = "Checking the key…";
      try {
        const pick = await checkKey(k);
        await setKey({ key: k, source: "pasted", ...pick, modelsAt: Date.now() });
        await saveSettings({ aiProvider: "gemini-key", onboarded: true });
        done({ project: null });
      } catch (e) { status.textContent = e.message; }
    };
    show(head("Get a key on Google's page", "About a minute. Free.", details),
      h("ol", { class: "setup-steps" },
        h("li", {}, h("button", { class: "btn small", onclick: async () => {
          await chrome.permissions.request({ origins: GEMINI_ORIGINS }).catch(() => false);
          chrome.tabs.create({ url: STUDIO_URL });
        } }, "Open Google's key page")),
        h("li", {}, "Press ", h("b", {}, "Create API key"), ", then ", h("b", {}, "Copy"), "."),
        h("li", {}, "Come back here. CampusPilot picks the key up by itself.")),
      h("div", { class: "row", style: "gap:6px;margin-top:8px" }, input, h("button", { class: "btn small secondary", onclick: () => tryKey(input.value) }, "Use this key")),
      status,
      h("p", { class: "hint" }, "The same applies as with Google sign-in: the key stays on this computer, and on the free tier Google may use what you send to improve its products."));
    // Picks the key up from the clipboard when the student comes back from Google's page.
    let last = "";
    const look = async () => {
      if (!document.hasFocus()) return;
      let t = ""; try { t = await navigator.clipboard.readText(); } catch { return; }
      const k = findKeyIn(t);
      if (k && k !== last) { last = k; input.value = k; tryKey(k); }
    };
    const onFocus = () => setTimeout(look, 200);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    stopPickup = () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  };

  // ---- or: the student's own AI website (as before) ----
  const ownAi = async () => {
    const nano = await nanoStatus();
    const box = nano !== "unavailable" ? h("input", { type: "checkbox", checked: state.settings.localAi !== false }) : null;
    const pick = async (id) => {
      const perm = canFill(id) ? requestFillPermission(id) : null; // the permission prompt needs this click
      let prep = null;
      if (box?.checked && nano !== "available") prep = nanoPrepare().catch(() => null); // Chrome downloads it in the background
      await saveSettings({ aiProvider: id, onboarded: true, localAi: box ? box.checked : state.settings.localAi });
      await perm; void prep;
      finish(true);
    };
    show(head("Which AI do you use?", "CampusPilot opens it with your request filled in. You press Send, and the answer comes back here.", home),
      h("div", { class: "ai-grid", style: "margin-top:10px" }, ["chatgpt", "claude", "gemini", "copilot"].map((id) => h("button", { class: "btn secondary", onclick: () => pick(id) }, PROVIDERS[id].name))),
      box ? h("label", { class: "switch", style: "margin-top:10px" }, h("span", {}, h("b", {}, "Quick tasks on this computer"),
        h("small", {}, "Chrome's built-in AI does small jobs (like reading class times) right here, even offline. Chrome downloads it once.")), box) : null,
      h("button", { class: "btn soft block", style: "margin-top:8px", onclick: () => { finish(false); import("./core.js").then((m) => m.go("settings", { settingsOpen: "ai" })); } }, "Another AI (set it up in Settings)"),
      h("p", { class: "hint" }, "You can change this any time in Settings › Your AI."));
  };

  document.body.append(dlg);
  dlg.showModal();
  ({ home, details, manual, own: ownAi }[start] || home)();
  return promise;
}

/** Settings › Your AI: the Gemini part (status, set up, remove) and the built-in AI switch. */
export async function geminiSettings() {
  const rec = await getKey();
  const using = state.settings.aiProvider === "gemini-key";
  const nano = await nanoStatus();
  const box = h("div", { class: "gem-set" });
  if (rec?.key) {
    const model = (rec.model || "").replace(/^models\//, "");
    const { usageToday, poolSizes } = await import("../lib/gemini.js");
    const u = await usageToday(), pools = poolSizes(rec);
    box.append(h("div", { class: "row" },
      h("div", { class: "grow" }, h("b", {}, "Gemini, inside CampusPilot"),
        h("div", { class: "meta" }, `${using ? "In use" : "Set up, not in use"} · key ${rec.source === "google" ? "made with Google sign-in" : "from Google's key page"}`)),
      using ? null : h("button", { class: "btn small", onclick: async () => { await saveSettings({ aiProvider: "gemini-key" }); rerender(); } }, "Use it")),
      h("div", { class: "gem-usage" },
        h("div", {}, h("b", {}, "Used today"),
          h("div", { class: "gem-pools" },
            h("span", {}, h("b", {}, `${u.careful}`), ` of about ${pools.careful} careful`),
            h("span", {}, h("b", {}, `${u.quick}`), ` of about ${pools.quick} quick`),
            (rec.small || []).length ? h("span", {}, h("b", {}, `${u.small}`), " checks") : null),
          h("small", {}, "Careful requests (Gemini Flash) make lecture checklists, study plans, and questions while plenty are left. Quick ones (Flash-Lite) do the rest; answer checks use Gemma when they fit. Free requests come back at midnight Pacific time."))),
      h("div", { class: "row", style: "gap:14px;margin-top:6px;flex-wrap:wrap" },
        rec.project ? h("a", { class: "linkish", href: consoleUrl(rec.project), target: "_blank", rel: "noopener" }, "See it in Google Cloud") : null,
        h("button", { class: "linkish", onclick: async () => {
          await clearKey();
          if (using) await saveSettings({ aiProvider: "gemini" });
          toast(rec.project ? "Key removed from this computer. To delete it everywhere, delete the CampusPilot project in Google Cloud." : "Key removed from this computer.", { ms: 9000 });
          rerender();
        } }, "Remove the key")));
  } else {
    box.append(h("div", { class: "row" },
      h("div", { class: "grow" }, h("b", {}, "Free Gemini, inside CampusPilot"), h("div", { class: "meta" }, "Answers come straight back here. One minute to set up with a personal Google account (school accounts don't work).")),
      h("button", { class: "btn small", onclick: () => openAiSetup() }, "Set up")));
  }
  if (nano !== "unavailable") box.append(h("label", { class: "switch", style: "margin-top:8px" },
    h("span", {}, h("b", {}, "Quick tasks on this computer"), h("small", {}, `Chrome's built-in AI does small jobs right here when you use your own AI. ${nano === "available" ? "Ready." : nano === "downloading" ? "Chrome is downloading it." : "Chrome downloads it once when you turn this on."}`)),
    h("input", { type: "checkbox", role: "switch", checked: state.settings.localAi !== false, onchange: async (e) => {
      const on = e.target.checked;
      if (on && nano !== "available") nanoPrepare().then(() => rerender()).catch((err) => toast(err.message, { error: true }));
      await saveSettings({ localAi: on });
    } })));
  return box;
}
