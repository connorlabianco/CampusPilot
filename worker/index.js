// CampusPilot's website and its one small server, on Cloudflare Workers.
//   • Serves the website (the docs/ folder) at campuspilot.clabianco.fyi; the old studypilot.clabianco.fyi
//     address forwards to it.
//   • POST /api/report   "Report a problem" from the extension (only when a student presses Send).
//   • POST /api/suggest  "Your courses also use…": tool names only, counted, nothing about the student.
//   • /admin             your inbox for reports (needs ADMIN_TOKEN, a secret you set in Cloudflare).
// Storage: one D1 database (binding DB). Reports are deleted after 180 days. IP addresses are never stored: a
// one-way hash of the address and the day is used only to stop floods (and is thrown away the next day).

const NEW_HOST = "campuspilot.clabianco.fyi";
const OLD_HOSTS = ["studypilot.clabianco.fyi", "www.campuspilot.clabianco.fyi"];
const KEEP_DAYS = 180;
const LIMITS = { report: 8, suggest: 10 }; // per address per day
const KINDS = new Set(["bug", "idea", "other"]);

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (OLD_HOSTS.includes(url.hostname)) return Response.redirect(`https://${NEW_HOST}${url.pathname}${url.search}`, 301);
    try {
      if (url.pathname.startsWith("/api/")) return await api(req, env, url, ctx);
      if (url.pathname === "/admin" || url.pathname === "/admin/") return new Response(ADMIN_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", ...SECURITY } });
    } catch (e) {
      return json({ error: "Something went wrong on the report server. Try again later." }, 500, req, env);
    }
    return env.ASSETS.fetch(req);
  },
  // Daily clean-up (Cloudflare "Cron trigger"): old reports and yesterday's flood counters.
  async scheduled(event, env) { await ready(env); await cleanup(env); },
};

const SECURITY = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" };

// ---------- CORS: only CampusPilot itself (the Chrome extension) may send ----------
function allowed(req, env) {
  const origin = req.headers.get("Origin") || "";
  const ids = String(env.EXTENSION_IDS || "fimfldjklciihkiipnncdgkbegkkcdim").split(",").map((s) => s.trim()).filter(Boolean);
  return ids.some((id) => origin === `chrome-extension://${id}`) ? origin : null;
}
function cors(req, env) {
  const o = allowed(req, env);
  return o ? { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" } : {};
}
function json(body, status = 200, req = null, env = null, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...SECURITY, ...(req ? cors(req, env) : {}), ...extra } });
}

// ---------- database ----------
let isReady = false;
async function ready(env) {
  if (isReady) return;
  if (!env.DB) throw new Error("No database: add the D1 binding named DB (see the Cloudflare setup guide).");
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, at INTEGER NOT NULL, kind TEXT, text TEXT, email TEXT, version TEXT, details TEXT, picture TEXT, status TEXT DEFAULT 'new', note TEXT)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS reports_at ON reports(at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS tools (name TEXT PRIMARY KEY, asks INTEGER DEFAULT 0, courses INTEGER DEFAULT 0, first INTEGER, last INTEGER)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS hits (k TEXT PRIMARY KEY, day TEXT, n INTEGER)`),
  ]);
  isReady = true;
}
async function cleanup(env) {
  const cut = Date.now() - KEEP_DAYS * 864e5;
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM reports WHERE at < ?`).bind(cut),
    env.DB.prepare(`DELETE FROM hits WHERE day <> ?`).bind(today()),
  ]);
}
const today = () => new Date().toISOString().slice(0, 10);
async function sha(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** True when this address has sent too many today. Only a hash of (address, day, secret) is kept, for one day. */
async function flooded(req, env, what) {
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const k = (await sha(`${what}|${ip}|${today()}|${env.HASH_SALT || "campuspilot"}`)).slice(0, 32);
  const row = await env.DB.prepare(`INSERT INTO hits (k, day, n) VALUES (?, ?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n`).bind(k, today()).first();
  return (row?.n || 1) > LIMITS[what];
}
const newId = () => { const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; const r = crypto.getRandomValues(new Uint8Array(6)); return [...r].map((x) => a[x % a.length]).join(""); };
const clip = (s, n) => (s == null ? null : String(s).slice(0, n));

// ---------- the API ----------
async function api(req, env, url, ctx) {
  const path = url.pathname.replace(/\/+$/, "");
  if (req.method === "OPTIONS") return new Response(null, { status: allowed(req, env) ? 204 : 403, headers: cors(req, env) });
  if (path === "/api/health") return json({ ok: true });
  if (path.startsWith("/api/admin/")) return admin(req, env, path, url);
  if (req.method !== "POST") return json({ error: "Not found" }, 404);
  if (!allowed(req, env)) return json({ error: "Reports can only be sent from CampusPilot." }, 403);
  const len = Number(req.headers.get("Content-Length") || 0);
  if (len > 2_000_000) return json({ error: "That report is too big. Try a smaller screenshot." }, 413, req, env);
  let body;
  try { body = JSON.parse(await req.text()); } catch { return json({ error: "That report couldn't be read." }, 400, req, env); }
  await ready(env);
  if (Math.random() < 0.02) ctx.waitUntil(cleanup(env).catch(() => {}));

  if (path === "/api/report") {
    if (await flooded(req, env, "report")) return json({ error: "You've sent a lot of reports today. Thanks! Please try again tomorrow." }, 429, req, env);
    const text = clip(body.text, 5000)?.trim();
    if (!text || text.length < 3) return json({ error: "The report was empty." }, 400, req, env);
    const kind = KINDS.has(body.kind) ? body.kind : "other";
    const email = body.email && /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(String(body.email)) ? clip(body.email, 200) : null;
    let details = null;
    if (body.details && typeof body.details === "object") { details = JSON.stringify(body.details); if (details.length > 80_000) details = details.slice(0, 80_000); }
    let picture = null;
    if (typeof body.picture === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.picture) && body.picture.length < 1_400_000) picture = body.picture;
    const id = newId();
    await env.DB.prepare(`INSERT INTO reports (id, at, kind, text, email, version, details, picture) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, Date.now(), kind, text, email, clip(body.version, 20), details, picture).run();
    ctx.waitUntil(notify(env, { id, kind, text, email, version: body.version, hasPicture: !!picture }).catch(() => {}));
    return json({ ok: true, id }, 200, req, env);
  }

  if (path === "/api/suggest") {
    if (await flooded(req, env, "suggest")) return json({ ok: true }, 200, req, env); // quietly ignored
    const tools = (Array.isArray(body.tools) ? body.tools : []).slice(0, 30)
      .map((t) => ({ name: String(t?.name || "").trim(), courses: Math.max(1, Math.min(9, Number(t?.courses) || 1)) }))
      .filter((t) => /^[\w .&/'()+-]{2,40}$/.test(t.name));
    if (!tools.length) return json({ error: "Nothing to note." }, 400, req, env);
    const now = Date.now();
    await env.DB.batch(tools.map((t) => env.DB.prepare(`INSERT INTO tools (name, asks, courses, first, last) VALUES (?, 1, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET asks = asks + 1, courses = courses + excluded.courses, last = excluded.last`).bind(t.name, t.courses, now, now)));
    return json({ ok: true }, 200, req, env);
  }
  return json({ error: "Not found" }, 404, req, env);
}

// ---------- email when a report comes in (optional: see the Cloudflare setup guide) ----------
async function notify(env, r) {
  if (!env.MAIL || !env.NOTIFY_TO || !env.NOTIFY_FROM) return;
  const { EmailMessage } = await import("cloudflare:email");
  const subject = `CampusPilot ${r.kind === "bug" ? "problem" : r.kind} report ${r.id}${r.version ? ` (v${r.version})` : ""}`;
  const lines = [r.text.slice(0, 1500), "", r.email ? `Reply to: ${r.email}` : "No reply address.", r.hasPicture ? "Has a screenshot." : "", `Open: https://${NEW_HOST}/admin#${r.id}`];
  const raw = [`From: CampusPilot reports <${env.NOTIFY_FROM}>`, `To: <${env.NOTIFY_TO}>`, `Subject: ${subject}`, `Message-ID: <${r.id}.${Date.now()}@${NEW_HOST}>`, `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", lines.join("\r\n")].join("\r\n");
  await env.MAIL.send(new EmailMessage(env.NOTIFY_FROM, env.NOTIFY_TO, raw));
}

// ---------- admin ----------
async function admin(req, env, path, url) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 16) return json({ error: "Set the ADMIN_TOKEN secret first (at least 16 characters; see the Cloudflare setup guide, step 6)." }, 503);
  if (!(await same(token, env.ADMIN_TOKEN))) { await new Promise((r) => setTimeout(r, 400)); return json({ error: "Wrong admin token." }, 401); }
  await ready(env);
  if (path === "/api/admin/reports" && req.method === "GET") {
    await cleanup(env);
    const status = url.searchParams.get("status") || "open";
    const where = status === "all" ? "" : status === "open" ? "WHERE status <> 'done'" : "WHERE status = ?";
    const stmt = env.DB.prepare(`SELECT id, at, kind, substr(text, 1, 300) AS text, email, version, status, picture IS NOT NULL AS pic FROM reports ${where} ORDER BY at DESC LIMIT 200`);
    const rows = (await (where.includes("?") ? stmt.bind(status) : stmt).all()).results;
    const counts = (await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM reports GROUP BY status`).all()).results;
    return json({ reports: rows, counts });
  }
  const one = path.match(/^\/api\/admin\/reports\/([A-Z0-9]{4,12})$/);
  if (one && req.method === "GET") {
    const r = await env.DB.prepare(`SELECT * FROM reports WHERE id = ?`).bind(one[1]).first();
    return r ? json(r) : json({ error: "Not found" }, 404);
  }
  if (one && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    if (b.delete) await env.DB.prepare(`DELETE FROM reports WHERE id = ?`).bind(one[1]).run();
    else await env.DB.prepare(`UPDATE reports SET status = COALESCE(?, status), note = COALESCE(?, note) WHERE id = ?`).bind(["new", "seen", "done"].includes(b.status) ? b.status : null, b.note != null ? clip(b.note, 2000) : null, one[1]).run();
    return json({ ok: true });
  }
  if (path === "/api/admin/tools") return json({ tools: (await env.DB.prepare(`SELECT * FROM tools ORDER BY asks DESC, last DESC LIMIT 200`).all()).results });
  return json({ error: "Not found" }, 404);
}
async function same(a, b) { const [x, y] = await Promise.all([sha(String(a)), sha(String(b))]); let d = 0; for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i); return d === 0; }

const ADMIN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>CampusPilot reports</title><style>
:root{--bg:#fbf8f3;--card:#fff;--ink:#24211d;--muted:#6e675d;--line:#ece5da;--accent:#2f6fed;--bad:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#171614;--card:#211f1c;--ink:#f1ece4;--muted:#a9a196;--line:#353129;--accent:#7aa2ff;--bad:#ff8a80}}
*{box-sizing:border-box}body{margin:0;font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--ink)}
main{max-width:960px;margin:0 auto;padding:20px 16px 60px}h1{font-size:22px;margin:0 0 4px}.muted{color:var(--muted)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:12px 0}
button,select,input,textarea{font:inherit;color:inherit}button{background:var(--accent);color:#fff;border:0;border-radius:9px;padding:7px 12px;cursor:pointer}
button.soft{background:transparent;color:var(--ink);border:1px solid var(--line)}button.bad{background:var(--bad)}
input,select,textarea{background:var(--card);border:1px solid var(--line);border-radius:9px;padding:7px 10px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.grow{flex:1;min-width:0}
.item{display:flex;gap:12px;padding:10px 0;border-top:1px solid var(--line);cursor:pointer}.item:first-child{border-top:0}
.pill{display:inline-block;font-size:12px;padding:1px 8px;border-radius:99px;border:1px solid var(--line)}.pill.new{background:var(--accent);color:#fff;border-color:transparent}
pre{white-space:pre-wrap;word-break:break-word;font-size:12px;background:var(--bg);padding:10px;border-radius:9px;max-height:420px;overflow:auto}
img{max-width:100%;border-radius:10px;border:1px solid var(--line)}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:6px 4px;border-top:1px solid var(--line)}
</style></head><body><main>
<h1>CampusPilot reports</h1><p class="muted">Problem reports and ideas sent from the extension, and the tools students ask for. Reports are deleted after ${KEEP_DAYS} days.</p>
<div id="login" class="card" hidden><b>Admin token</b><p class="muted">The ADMIN_TOKEN secret you set in Cloudflare. It's kept in this browser only.</p>
<div class="row"><input id="tok" type="password" class="grow" autocomplete="current-password" aria-label="Admin token"><button id="go">Open</button></div><p id="err" style="color:var(--bad)"></p></div>
<div id="app" hidden>
<div class="row"><select id="st" aria-label="Show"><option value="open">Open (new and seen)</option><option value="new">New</option><option value="done">Done</option><option value="all">All</option></select>
<span id="counts" class="muted grow"></span><button class="soft" id="out">Sign out</button></div>
<div id="detail"></div><div class="card" id="list"></div>
<div class="card"><b>Tools students asked for</b><table id="tools"></table></div></div>
</main><script>
const $=(s)=>document.querySelector(s);let T=localStorage.getItem("cpAdmin")||"";
const esc=(s)=>String(s??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function call(p,o={}){const r=await fetch("/api/admin/"+p,{...o,headers:{Authorization:"Bearer "+T,"Content-Type":"application/json"}});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||r.status);return j}
const when=(t)=>new Date(t).toLocaleString();
async function load(){try{const j=await call("reports?status="+$("#st").value);$("#login").hidden=true;$("#app").hidden=false;
$("#counts").textContent=j.counts.map((c)=>c.n+" "+c.status).join(" · ")||"No reports yet";
$("#list").innerHTML=j.reports.length?j.reports.map((r)=>'<div class="item" data-id="'+r.id+'"><div class="grow"><div class="row"><b>'+esc(r.id)+'</b><span class="pill '+(r.status==="new"?"new":"")+'">'+esc(r.status)+'</span><span class="pill">'+esc(r.kind)+'</span>'+(r.pic?'<span class="pill">screenshot</span>':"")+'<span class="muted">v'+esc(r.version||"?")+" · "+when(r.at)+'</span></div><div>'+esc(r.text)+'</div></div></div>').join(""):'<p class="muted">Nothing here.</p>';
document.querySelectorAll(".item").forEach((el)=>el.onclick=()=>open_(el.dataset.id));
const t=await call("tools");$("#tools").innerHTML="<tr><th>Tool</th><th>Asked</th><th>Courses</th><th>Last</th></tr>"+t.tools.map((x)=>"<tr><td>"+esc(x.name)+"</td><td>"+x.asks+"</td><td>"+x.courses+"</td><td>"+new Date(x.last).toLocaleDateString()+"</td></tr>").join("");
if(location.hash.length>1)open_(location.hash.slice(1))}catch(e){$("#app").hidden=true;$("#login").hidden=false;$("#err").textContent=T?e.message:""}}
async function open_(id){const r=await call("reports/"+id).catch(()=>null);if(!r)return;location.hash=id;let d=null;try{d=JSON.parse(r.details)}catch{}
$("#detail").innerHTML='<div class="card"><div class="row"><b class="grow">'+esc(r.id)+" · "+esc(r.kind)+" · v"+esc(r.version||"?")+" · "+when(r.at)+'</b><button class="soft" data-s="seen">Seen</button><button data-s="done">Done</button><button class="bad" data-del>Delete</button><button class="soft" data-x>Close</button></div>'+
'<p style="white-space:pre-wrap">'+esc(r.text)+"</p>"+(r.email?'<p>Reply to: <a href="mailto:'+esc(r.email)+"?subject="+encodeURIComponent("Your CampusPilot report "+r.id)+'">'+esc(r.email)+"</a></p>":'<p class="muted">No reply address.</p>')+
(r.picture?'<img alt="Screenshot from the student" src="'+esc(r.picture)+'">':"")+(d?"<details open><summary>Technical details</summary><pre>"+esc(JSON.stringify(d,null,2))+"</pre></details>":'<p class="muted">No technical details (the student turned them off).</p>')+
'<p><textarea id="note" rows="2" style="width:100%" placeholder="Your notes">'+esc(r.note||"")+'</textarea></p><button class="soft" id="saveNote">Save note</button></div>';
if(r.status==="new")call("reports/"+id,{method:"POST",body:JSON.stringify({status:"seen"})}).catch(()=>{});
$("#detail").querySelectorAll("[data-s]").forEach((b)=>b.onclick=async()=>{await call("reports/"+id,{method:"POST",body:JSON.stringify({status:b.dataset.s})});load()});
$("#detail [data-del]").onclick=async()=>{if(!confirm("Delete report "+id+"?"))return;await call("reports/"+id,{method:"POST",body:JSON.stringify({delete:true})});$("#detail").innerHTML="";location.hash="";load()};
$("#detail [data-x]").onclick=()=>{$("#detail").innerHTML="";history.replaceState(null,"",location.pathname)};
$("#saveNote").onclick=async()=>{await call("reports/"+id,{method:"POST",body:JSON.stringify({note:$("#note").value})})};window.scrollTo(0,0)}
$("#go").onclick=()=>{T=$("#tok").value.trim();localStorage.setItem("cpAdmin",T);load()};$("#tok").onkeydown=(e)=>{if(e.key==="Enter")$("#go").click()};
$("#out").onclick=()=>{localStorage.removeItem("cpAdmin");T="";location.reload()};$("#st").onchange=load;
if(T)load();else $("#login").hidden=false;
</script></body></html>`;
