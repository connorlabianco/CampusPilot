// Canvas calendar page: puts CampusPilot's study plan, study time and class times on Canvas's calendar. Week and
// day views get blocks lined up with Canvas's own hours; month view gets a line per day; and a "Your plan" list
// in the corner works in every view (agenda too). Only drawn on screen: nothing is added to Canvas, and Canvas's
// own events stay clickable. Two switches in the list turn the drawing and the cleaner look off.
(() => {
  if (window.__spCal) return;
  window.__spCal = true;
  const send = (type, payload = {}) => new Promise((res) => { try { chrome.runtime.sendMessage({ type, payload }, (r) => res(r?.ok ? r.data : null)); } catch { res(null); } });
  let on = true, clean = true, data = null, soonData = null, timer = null, lastKey = "", open = false, pop = null;
  try { open = sessionStorage.getItem("spCalOpen") === "1"; } catch { /* private window */ }

  const toMin = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };
  const nice = (min) => { const h = Math.floor(min / 60) % 24, m = min % 60; return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`; };
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const dur = (min) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ""}` : `${min}m`);
  const el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
  const mine = (n) => n.nodeType === 1 && (n.closest?.(".sp-cal-layer, .sp-cal-dock, .sp-cal-pop") || n.classList?.contains("sp-cal-layer"));

  // The time grid of Canvas's week/day view (older and newer calendar versions).
  function findGrid() {
    const grid = document.querySelector(".fc-time-grid, .fc-timegrid-body, .fc-timegrid");
    if (!grid || !grid.offsetParent) return null;
    const rows = [...grid.querySelectorAll("[data-time]")].map((el) => ({ el, min: toMin(el.getAttribute("data-time")) }))
      .filter((r) => Number.isFinite(r.min) && r.el.getBoundingClientRect().height > 0);
    const seen = new Map();
    for (const el of grid.querySelectorAll("[data-date]")) {
      const r = el.getBoundingClientRect(), d = el.getAttribute("data-date").slice(0, 10);
      if (r.width < 10 || r.height < 50) continue;
      if (!seen.has(d) || r.height > seen.get(d).getBoundingClientRect().height) seen.set(d, el);
    }
    if (!rows.length || !seen.size) return null;
    return { grid, rows: rows.sort((a, b) => a.min - b.min), cols: [...seen].map(([date, el]) => ({ date, el })).sort((a, b) => a.date.localeCompare(b.date)) };
  }
  // The day boxes of Canvas's month view.
  function findMonth() {
    const view = document.querySelector(".fc-month-view, .fc-dayGridMonth-view, .fc-daygrid");
    if (!view || !view.offsetParent) return null;
    const seen = new Map();
    for (const el of view.querySelectorAll("td.fc-day[data-date], td.fc-daygrid-day[data-date]")) {
      const r = el.getBoundingClientRect();
      if (r.width < 30 || r.height < 40) continue;
      seen.set(el.getAttribute("data-date").slice(0, 10), el);
    }
    if (seen.size < 14) return null;
    return { view, cells: [...seen].map(([date, el]) => ({ date, el })).sort((a, b) => a.date.localeCompare(b.date)) };
  }
  // Pixel offset (inside the grid) for a time of day, from Canvas's own hour rows.
  function yFor(rows, gridTop, min) {
    let i = rows.findIndex((r, k) => r.min <= min && (k === rows.length - 1 || rows[k + 1].min > min));
    if (i < 0) i = min < rows[0].min ? 0 : rows.length - 1;
    const r = rows[i], rect = r.el.getBoundingClientRect();
    const step = rows[i + 1] ? rows[i + 1].min - r.min : 30;
    const pxPer = (rows[i + 1] ? rows[i + 1].el.getBoundingClientRect().top - rect.top : rect.height) / step;
    return rect.top - gridTop + (min - r.min) * pxPer;
  }

  function clear() { document.querySelectorAll(".sp-cal-layer").forEach((x) => x.remove()); }
  const line = (e) => `${nice(toMin(e.start))}–${nice(toMin(e.end))}  ${e.kind === "study" ? "Study time" : e.title}`;

  function drawWeek(G) {
    if (getComputedStyle(G.grid).position === "static") G.grid.style.position = "relative";
    const layer = el("div", "sp-cal-layer");
    layer.setAttribute("aria-hidden", "true");
    const gRect = G.grid.getBoundingClientRect();
    for (const e of data.events) {
      const col = G.cols.find((c) => c.date === e.date);
      if (!col) continue;
      const cRect = col.el.getBoundingClientRect();
      const top = yFor(G.rows, gRect.top, toMin(e.start)), bottom = yFor(G.rows, gRect.top, toMin(e.end));
      const div = el("div", `sp-cal-ev sp-${e.kind}${e.done ? " sp-done" : ""}`);
      const inset = e.kind === "plan" ? 10 : e.kind === "study" ? 0 : 2;
      Object.assign(div.style, { top: `${top}px`, height: `${Math.max(14, bottom - top - 1)}px`, left: `${cRect.left - gRect.left + inset}px`, width: `${Math.max(10, cRect.width - inset - 2)}px` });
      if (e.color) div.style.setProperty("--sp-c", e.color);
      if (e.kind !== "study") {
        div.append(el("b", "", e.title), el("span", "", `${nice(toMin(e.start))}–${nice(toMin(e.end))}${e.sub ? ` · ${e.sub}` : ""}`));
      } else div.append(el("span", "", "Study time"));
      div.title = `${e.kind === "study" ? "Study time" : e.title} (CampusPilot) ${nice(toMin(e.start))}–${nice(toMin(e.end))}`;
      layer.append(div);
    }
    G.grid.append(layer);
  }

  // Month view: each planned sitting is a line in its day, with its start time (up to three; then "+2 more").
  // Without a plan, the day's study time is one line. Click a line for that day's list.
  const short = (min) => { const h = Math.floor(min / 60) % 24, m = min % 60; return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`; };
  function drawMonth(M) {
    if (getComputedStyle(M.view).position === "static") M.view.style.position = "relative";
    const layer = el("div", "sp-cal-layer sp-cal-month");
    const vRect = M.view.getBoundingClientRect();
    for (const c of M.cells) {
      const day = data.events.filter((e) => e.date === c.date);
      const plan = day.filter((e) => e.kind === "plan").sort((a, b) => toMin(a.start) - toMin(b.start)), study = day.filter((e) => e.kind === "study");
      if (!plan.length && !study.length) continue;
      const r = c.el.getBoundingClientRect();
      const room = Math.max(1, Math.min(3, Math.floor((r.height - 44) / 21)));
      const lines = [];
      if (!plan.length) lines.push({ cls: " sp-free", a: "Study time", b: dur(study.reduce((x, e) => x + toMin(e.end) - toMin(e.start), 0)) });
      else {
        const show = plan.length > room ? plan.slice(0, room - 1) : plan;
        for (const e of show) lines.push({ cls: e.done ? " sp-done" : "", a: e.title, b: short(toMin(e.start)), color: e.color, timeFirst: true });
        if (plan.length > show.length) lines.push({ cls: " sp-more", a: `+${plan.length - show.length} more to study`, b: "" });
      }
      lines.forEach((ln, i) => {
        const chip = el("button", `sp-cal-chip${ln.cls}`);
        chip.type = "button";
        if (ln.timeFirst) chip.append(el("span", "", ln.b), el("b", "", ln.a)); else chip.append(el("b", "", ln.a), el("span", "", ln.b));
        if (ln.color) chip.style.setProperty("--sp-c", ln.color);
        Object.assign(chip.style, { left: `${r.left - vRect.left + 3}px`, top: `${r.bottom - vRect.top - 22 - (lines.length - 1 - i) * 21}px`, width: `${Math.max(20, r.width - 6)}px` });
        chip.title = day.filter((e) => e.kind !== "study" || !plan.length).map(line).join("\n");
        chip.addEventListener("click", (ev) => { ev.stopPropagation(); showDay(c.date, day, chip); });
        layer.append(chip);
      });
    }
    M.view.append(layer);
  }

  // A day's list (from a month-view line).
  function closePop() { pop?.remove(); pop = null; }
  function dayRows(day, box) {
    const plan = day.filter((e) => e.kind === "plan");
    const rows = day.filter((e) => e.kind !== "study" || !plan.length).sort((a, b) => toMin(a.start) - toMin(b.start));
    for (const e of rows) {
      const row = el("div", `sp-cal-row sp-${e.kind}${e.done ? " sp-done" : ""}`);
      if (e.color) row.style.setProperty("--sp-c", e.color);
      row.append(el("span", "sp-cal-time", `${nice(toMin(e.start))}–${nice(toMin(e.end))}`), el("b", "", e.kind === "study" ? "Study time" : e.title));
      if (e.kind === "class" || e.kind === "office") row.append(el("small", "", e.kind === "office" ? "office hours" : "class"));
      box.append(row);
    }
    return rows.length;
  }
  const dayName = (date) => { const d = new Date(`${date}T12:00:00`); return date === plusDays(0) ? "Today" : date === plusDays(1) ? "Tomorrow" : d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }); };
  function showDay(date, day, anchor) {
    closePop();
    pop = el("div", "sp-cal-pop");
    pop.setAttribute("role", "dialog");
    pop.append(el("h4", "", dayName(date)));
    dayRows(day, pop);
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left))}px`;
    pop.style.top = `${r.top - pop.offsetHeight - 6 > 8 ? r.top - pop.offsetHeight - 6 : r.bottom + 6}px`;
  }
  document.addEventListener("click", (e) => { if (pop && !pop.contains(e.target)) closePop(); }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closePop(); if (open) { open = false; dock(); } } });

  // "Your plan": the next seven days as a list, in every view.
  function dock() {
    let box = document.querySelector(".sp-cal-dock");
    if (!box) { box = el("div", "sp-cal-dock"); document.body.append(box); }
    const up = (soonData?.events || []).filter((e) => e.kind === "plan" && !e.done);
    const todayN = up.filter((e) => e.date === plusDays(0)).length;
    box.replaceChildren();
    const pill = el("button", "sp-cal-toggle", open ? "Hide your plan" : soonData?.hasPlan ? `Your plan${todayN ? ` · ${todayN} today` : ""}` : "CampusPilot plan");
    pill.type = "button";
    pill.setAttribute("aria-expanded", String(open));
    pill.addEventListener("click", () => { open = !open; try { sessionStorage.setItem("spCalOpen", open ? "1" : "0"); } catch { /* fine */ } dock(); });
    if (open) {
      const panel = el("div", "sp-cal-panel");
      panel.setAttribute("role", "region");
      panel.setAttribute("aria-label", "Your CampusPilot plan");
      panel.append(el("h3", "", "Your plan, next 7 days"));
      const list = el("div", "sp-cal-list");
      let any = 0;
      for (let i = 0; i < 7; i++) {
        const date = plusDays(i), day = (soonData?.events || []).filter((e) => e.date === date);
        if (!day.length) continue;
        list.append(el("h4", "", dayName(date)));
        any += dayRows(day, list);
      }
      if (!any) list.append(el("p", "sp-cal-empty", "Nothing here yet. Mark study time on My week, then make a study plan from CampusPilot's Home tab."));
      else if (!soonData?.hasPlan) list.append(el("p", "sp-cal-empty", "This is your study time and classes. Make a study plan from CampusPilot's Home tab to fill the study time with what to work on."));
      panel.append(list);
      if (on && !shownOn) panel.append(el("p", "sp-cal-empty", agenda() ? "Agenda view lists Canvas's own events only. Your plan is drawn on the Month, Week and Day views." : "CampusPilot couldn't line up with this calendar view, so nothing is drawn on it. The list above is still your plan."));
      const sw = (label, val, key) => {
        const l = el("label", "sp-cal-sw"), i = el("input");
        i.type = "checkbox"; i.checked = val;
        i.addEventListener("change", async () => { if (key === "on") on = i.checked; else clean = i.checked; await send("CAL_OVERLAY_SET", { [key]: i.checked }); look(); draw(); });
        l.append(i, el("span", "", label));
        return l;
      };
      panel.append(sw("Show it on the calendar", on, "on"), sw("Cleaner calendar look", clean, "clean"));
      const foot = el("div", "sp-cal-foot");
      const week = el("button", "sp-cal-link", "Open My week"); week.type = "button"; week.addEventListener("click", () => send("OPEN_WEEK"));
      const panelBtn = el("button", "sp-cal-link", "Open CampusPilot"); panelBtn.type = "button"; panelBtn.addEventListener("click", () => { try { chrome.runtime.sendMessage({ type: "OPEN_PANEL" }); } catch { /* reloaded */ } });
      foot.append(week, panelBtn);
      panel.append(foot);
      box.append(panel);
    }
    box.append(pill);
  }
  const look = () => document.documentElement.classList.toggle("sp-cal-clean", !!clean);

  let shownOn = true;
  const agenda = () => !!document.querySelector(".agenda-wrapper, .agenda-container, #calendar-app .agenda");
  async function draw() {
    const G = findGrid(), M = G ? null : findMonth();
    const cols = G ? G.cols : M ? M.cells : null;
    shownOn = !!cols;
    const key = cols ? `${cols[0].date}|${cols[cols.length - 1].date}` : "none";
    if (!soonData) { soonData = await send("CAL_OVERLAY", { from: plusDays(0), to: plusDays(6) }); if (soonData) { on = soonData.on; clean = soonData.clean !== false; } }
    if (cols && (!data || key !== lastKey)) { data = await send("CAL_OVERLAY", { from: cols[0].date, to: cols[cols.length - 1].date }); lastKey = key; }
    look();
    dock();
    clear();
    if (!on || !data || !cols) return;
    if (G) drawWeek(G); else drawMonth(M);
  }

  const soon = () => { clearTimeout(timer); timer = setTimeout(() => draw().catch(() => {}), 250); };
  new MutationObserver((muts) => { if (muts.some((m) => ![...m.addedNodes, ...m.removedNodes].every(mine) && !mine(m.target))) soon(); })
    .observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", soon);
  chrome.storage.onChanged?.addListener?.((ch, area) => { if (area === "local" && (ch.week || ch.plan || ch.planDay || ch.planDone)) { data = null; soonData = null; soon(); } });
  soon();
})();
