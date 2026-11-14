// "Sign in with Google": makes the student's free Gemini key for them, in their own Google account, after they've
// read exactly what will happen (sidepanel/aisetup.js). Uses Google's own APIs, with access the student grants once
// and CampusPilot forgets right after:
//   1. find the "CampusPilot" Google Cloud project made earlier, or create one (free; no billing, no card)
//   2. turn on the Gemini API in it
//   3. find or create an API key named "campuspilot", limited to the Gemini API
//   4. save that key on this computer only, and check that it works
import { checkKey, setKey, ORIGINS as GEMINI_ORIGINS } from "./gemini.js";

export const CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const CRM = "https://cloudresourcemanager.googleapis.com";
const SU = "https://serviceusage.googleapis.com";
const AK = "https://apikeys.googleapis.com";
/** Sites this needs (asked for in the click that starts it). */
export const ORIGINS = [`${CRM}/*`, `${SU}/*`, `${AK}/*`, ...GEMINI_ORIGINS];
export const KEY_ID = "campuspilot";
export const PROJECT_NAME = "CampusPilot";
export const STEPS = ["Signing in with Google", "Making your CampusPilot project", "Turning on Gemini", "Making your key", "Checking that it works"];

export class SetupError extends Error {
  /** kind: cancelled | school | terms | projects | region | offline | other */
  constructor(kind, message, detail = "") { super(message); this.kind = kind; this.detail = detail; }
}
// The account's administrator (a school or employer) doesn't allow this.
export const SCHOOL_MSG = "Your school (or work) blocks this on its Google accounts. Use a Google account not associated with your institution, like a personal Gmail.";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function explain(status, e = {}) {
  const msg = e.message || `HTTP ${status}`, all = JSON.stringify(e);
  // CampusPilot's own Google Cloud setup isn't finished (an API not turned on, the permission not on the consent
  // screen): not the student's account at all.
  if (/SERVICE_DISABLED|has not been used in project|it is disabled|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes|API_KEY_SERVICE_BLOCKED|unregistered callers/i.test(all))
    return new SetupError("setup", "CampusPilot's connection to Google Cloud isn't fully set up yet. This is on CampusPilot's side, not your account.", msg);
  if (/terms of service|\bToS\b|tos_not_accepted|accept the terms/i.test(all)) return new SetupError("terms", "Google Cloud needs you to accept its terms once before CampusPilot can make the project.", msg);
  if (/admin_policy_enforced|org_internal|organization policy|constraints\/|not allowed to create projects/i.test(all) || (status === 403 && /resourcemanager\.projects\.create/i.test(all)))
    return new SetupError("school", SCHOOL_MSG, msg);
  if (/quota|limit/i.test(all) && /project/i.test(all)) return new SetupError("projects", "Your Google account has reached its limit of Google Cloud projects.", msg);
  if (/location is not supported|country/i.test(all)) return new SetupError("region", "Google doesn't offer the Gemini API where you are.", msg);
  return new SetupError("other", `Google said: ${msg}`, msg);
}
async function gcall(token, url, { method = "GET", body = null, ok404 = false } = {}) {
  let res;
  try { res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : null }); }
  catch { throw new SetupError("offline", "Couldn't reach Google. Check your internet connection."); }
  if (ok404 && res.status === 404) return null;
  let j = null; try { j = await res.json(); } catch { /* empty */ }
  if (!res.ok) { const err = explain(res.status, j?.error); err.status = res.status; throw err; }
  return j || {};
}
// Long-running operations (making a project, turning on an API, making a key): wait until done.
async function done(token, base, op, ms = 90e3) {
  const until = Date.now() + ms;
  let cur = op;
  while (!cur?.done) {
    if (Date.now() > until) throw new SetupError("other", "Google is taking too long. Try again in a minute.");
    await wait(1500);
    cur = await gcall(token, `${base}/${versionFor(base)}${cur.name}`);
  }
  if (cur.error) throw explain(400, cur.error);
  return cur.response || {};
}
const versionFor = (base) => (base === CRM ? "v3/" : base === SU ? "v1/" : "v2/");
// A new project takes a little while to be usable everywhere: retry "not found" and "permission" answers for a minute.
async function settle(fn, ms = 60e3) {
  const until = Date.now() + ms;
  for (;;) {
    try { return await fn(); }
    catch (e) { if (!(e.status === 403 || e.status === 404 || e.status === 400) || Date.now() > until || e.kind === "school" || e.kind === "terms") throw e; await wait(4000); }
  }
}

// Google's own sign-in window, with its account picker, so a student whose Chrome is signed in to a school account can
// pick a personal one. Needs CampusPilot's web sign-in client (lib/oauthcfg.js); without one, falls back to Chrome's
// sign-in (which always uses the account Chrome is signed in to).
async function token() {
  const { WEB_CLIENT_ID } = await import("./oauthcfg.js");
  if (!WEB_CLIENT_ID || WEB_CLIENT_ID.startsWith("YOUR_")) return chromeToken();
  const redirect = chrome.identity.getRedirectURL("google");
  const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id: WEB_CLIENT_ID, response_type: "token", redirect_uri: redirect, scope: CLOUD_SCOPE, prompt: "select_account consent", include_granted_scopes: "false" });
  let back;
  try { back = await chrome.identity.launchWebAuthFlow({ url, interactive: true }); }
  catch (e) {
    if (/admin_policy_enforced|org_internal/i.test(e.message || "")) throw new SetupError("school", SCHOOL_MSG, e.message);
    throw new SetupError("cancelled", "Google sign-in was closed, so nothing was made.", e.message || "");
  }
  const h = new URLSearchParams(String(back || "").split("#")[1] || String(back || "").split("?")[1] || "");
  const err = h.get("error");
  if (err) {
    if (/admin_policy_enforced|org_internal/i.test(err + " " + (h.get("error_description") || ""))) throw new SetupError("school", SCHOOL_MSG, err);
    if (!/access_denied/i.test(err)) throw new SetupError("setup", "Google's sign-in isn't fully set up for CampusPilot yet. This is on CampusPilot's side, not your account.", `${err}: ${h.get("error_description") || ""}`);
    throw new SetupError("cancelled", "Google sign-in was closed, so nothing was made.", err);
  }
  const t = h.get("access_token");
  if (!t) throw new SetupError("cancelled", "Google sign-in was closed, so nothing was made.");
  return { token: t, web: true };
}
async function chromeToken() {
  let r;
  try { r = await chrome.identity.getAuthToken({ interactive: true, scopes: [CLOUD_SCOPE] }); }
  catch (e) {
    if (/admin_policy_enforced|org_internal/i.test(e.message || "")) throw new SetupError("school", SCHOOL_MSG, e.message);
    if (/bad client id|invalid_client|OAuth2 not granted|client.*not.*(found|valid)/i.test(e.message || "")) throw new SetupError("setup", "Google's sign-in isn't set up for this copy of CampusPilot. This is on CampusPilot's side, not your account.", e.message);
    if (/did not approve|canceled|cancelled|closed|not signed in|user/i.test(e.message || "")) throw new SetupError("cancelled", "Google sign-in was closed, so nothing was made.");
    throw new SetupError("other", e.message || "Google sign-in didn't work.");
  }
  const t = typeof r === "string" ? r : r?.token;
  if (!t) throw new SetupError("cancelled", "Google sign-in was closed, so nothing was made.");
  return { token: t, web: false };
}
// The Google Cloud access was only for making the key: give it back.
async function forget({ token: t, web }) {
  if (web) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: "POST" }).catch(() => {});
  else await chrome.identity.removeCachedAuthToken({ token: t }).catch(() => {});
}

/**
 * Runs the whole thing. onStep(index, label). Resolves { key, project, model }.
 * Must be started from a click (the Google sign-in window needs one); ORIGINS must already be granted.
 */
export async function makeKeyWithGoogle({ onStep = () => {} } = {}) {
  onStep(0, STEPS[0]);
  const auth = await token();
  const t = auth.token;
  try {
    // 1. the project: one we made before (labelled app=campuspilot), or a new one
    onStep(1, STEPS[1]);
    const found = await gcall(t, `${CRM}/v3/projects:search?query=${encodeURIComponent("labels.app:campuspilot state:ACTIVE")}`);
    let project = (found.projects || [])[0]?.projectId || null;
    if (!project) {
      for (let i = 0; i < 3 && !project; i++) {
        const id = `campuspilot-${Math.random().toString(36).slice(2, 8)}`;
        try {
          const op = await gcall(t, `${CRM}/v3/projects`, { method: "POST", body: { projectId: id, displayName: PROJECT_NAME, labels: { app: "campuspilot" } } });
          const p = await done(t, CRM, op);
          project = p.projectId || id;
        } catch (e) { if (e.status === 409 || /already exists/i.test(e.detail || "")) continue; throw e; }
      }
      if (!project) throw new SetupError("other", "Google couldn't make the project. Try again in a minute.");
    }
    // 2. Gemini (and the key service) on, in that project
    onStep(2, STEPS[2]);
    await settle(async () => {
      const op = await gcall(t, `${SU}/v1/projects/${project}/services:batchEnable`, { method: "POST", body: { serviceIds: ["generativelanguage.googleapis.com", "apikeys.googleapis.com"] } });
      if (op.name && !op.done) await done(t, SU, op, 120e3);
    });
    // 3. the key: "campuspilot", allowed to call only the Gemini API
    onStep(3, STEPS[3]);
    const keyPath = `${AK}/v2/projects/${project}/locations/global/keys/${KEY_ID}`;
    const have = await settle(() => gcall(t, keyPath, { ok404: true }));
    if (!have || have.deleteTime) {
      await settle(async () => {
        const op = await gcall(t, `${AK}/v2/projects/${project}/locations/global/keys?keyId=${KEY_ID}`, { method: "POST",
          body: { displayName: "CampusPilot", restrictions: { apiTargets: [{ service: "generativelanguage.googleapis.com" }] } } });
        if (op.name && !op.done) await done(t, AK, op);
      });
    }
    const { keyString } = await settle(() => gcall(t, `${keyPath}/keyString`));
    if (!keyString) throw new SetupError("other", "Google didn't hand over the key. Try again in a minute.");
    // 4. a brand-new key can take a minute to start working
    onStep(4, STEPS[4]);
    let pick = null, lastErr = null;
    for (let i = 0; i < 16 && !pick; i++) {
      try { pick = await checkKey(keyString); }
      catch (e) { lastErr = e; if (e.kind === "region") throw new SetupError("region", e.message); if (e.kind === "offline") throw new SetupError("offline", e.message); await wait(5000); }
    }
    if (!pick) throw new SetupError("other", `The key was made but isn't working yet (${lastErr?.message || "no answer"}). Try again in a few minutes.`);
    await setKey({ key: keyString, source: "google", project, ...pick, modelsAt: Date.now() });
    return { key: keyString, project, model: pick.model };
  } finally {
    await forget(auth);
  }
}
/** Where the student can see (or delete) what was made. */
export const consoleUrl = (project) => project ? `https://console.cloud.google.com/apis/credentials?project=${encodeURIComponent(project)}` : "https://console.cloud.google.com/";
export const TERMS_URL = "https://console.cloud.google.com/";
export const STUDIO_URL = "https://aistudio.google.com/apikey";
