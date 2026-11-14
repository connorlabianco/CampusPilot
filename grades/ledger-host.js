// Connects the (unchanged) Grade Ledger to a CampusPilot course page.
// ledger.html?course=<id>&theme=dark|light&cur=<current score>
(() => {
  const q = new URLSearchParams(location.search);
  const courseId = q.get("course");
  const theme = q.get("theme");
  if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
  if (q.get("compact")) document.documentElement.classList.add("compact");

  const GL = window.GradeLedger;
  const $ = (id) => document.getElementById(id);

  // ---------- CampusPilot layout (the ledger's own logic is untouched; its parts are rearranged) ----------
  // Your grade first (current, what you need, worst/best, if I score), then the rows, then saved results and the final-exam helper.
  // How it's worked out (formulas, tips) only shows with the panel's "?" on.
  function arrange() {
    const calc = $("gl-calc-h")?.closest("section"); if (!calc) return;
    const wrap = calc.parentElement;
    const res = calc.querySelector(".results"), remain = $("gl-remain"), range = remain?.querySelector(".range");
    const [cur, need, work] = res ? [...res.children] : [];
    const sum = document.createElement("section"); sum.className = "sheet sp-sum"; sum.setAttribute("aria-label", "Your grade");
    const top = document.createElement("div"); top.className = "sp-top";
    if (cur) { cur.querySelector(".label").textContent = "Current grade"; top.append(cur); }
    if (need) { need.classList.add("sp-need"); top.append(need); }
    sum.append(top);
    // Canvas's own number, and where the weights came from (the "why they differ" only with "?" on).
    const canvas = q.get("cur"), src = q.get("src") || "";
    const from = { "canvas-weights": "Weights from Canvas.", syllabus: "Weights read from your syllabus, since Canvas doesn't list them.", points: "No weights found, so every point counts the same." }[src] || "";
    const cv = document.createElement("div"); cv.className = "sp-canvas";
    const reload = Object.assign(document.createElement("button"), { type: "button", className: "sp-link", textContent: "Reload from Canvas" });
    reload.onclick = () => parent.postMessage({ type: "gl-reload-request", courseId: q.get("course") }, "*");
    const line = document.createElement("span");
    line.textContent = canvas != null && canvas !== "" ? `Canvas says ${Math.round(Number(canvas) * 100) / 100}%` : "Canvas doesn't show a grade yet";
    cv.append(line, " · ", reload);
    const why = document.createElement("div"); why.className = "note sp-help";
    why.textContent = [from, q.get("srcnote") || "", canvas ? "Canvas's number can differ: it may weight things differently or leave out work that isn't graded yet." : "", q.get("edited") ? "Includes your edits and what-ifs." : ""].filter(Boolean).join(" ");
    sum.append(cv, why);
    if (remain) { remain.classList.add("sp-remain"); sum.append(remain); }
    if (range) {
      range.classList.add("sp-range"); sum.append(range);
      const notes = range.querySelectorAll(":scope > div > .note");
      if (notes[0]) notes[0].textContent = "0% on the rest";
      if (notes[1]) notes[1].textContent = "100% on the rest";
    }
    if (work) { work.classList.add("sp-help", "sp-work"); work.querySelector(".label").textContent = "How it's worked out"; sum.append(work); }
    res?.remove();
    wrap.insertBefore(sum, calc);
    // The calculator: title + grade type, rows, then Add row / Target / Reset on one line.
    $("gl-calc-h").textContent = "Assignments and weights";
    const rows = [...calc.querySelectorAll(":scope > .row")];
    const addRow = rows.find((r) => r.querySelector("#gl-add-row"));
    const tgtRow = rows.find((r) => r.querySelector("#gl-target"));
    const decRow = rows.find((r) => r.querySelector("#gl-decimals"));
    const saveRow = rows.find((r) => r.querySelector("#gl-save"));
    $("gl-mode-note")?.classList.add("sp-help");
    tgtRow?.querySelector(".note")?.classList.add("sp-help");
    if (addRow && tgtRow && decRow) {
      const tools = document.createElement("div"); tools.className = "row sp-tools";
      addRow.after(tools);
      const tl = tgtRow.querySelector("label"); tl.childNodes[0].textContent = "Target ";
      const add = $("gl-add-row"), reset = $("gl-reset");
      const dl = decRow.querySelector("label"); dl.childNodes[0].textContent = "Decimals ";
      tools.append(add, tl, dl, reset);
      add.textContent = "+ Row";
      const help = document.createElement("div"); help.className = "sp-help note";
      help.append($("gl-mode-note"), document.createTextNode(" "), tgtRow.querySelector(".note") || "");
      tools.after(help);
      addRow.remove(); tgtRow.remove(); decRow.remove();
    }
    // Saving lives with the saved results.
    const savedSec = $("gl-saved-h")?.closest("section");
    if (saveRow && savedSec) {
      saveRow.removeAttribute("style"); saveRow.classList.add("sp-save");
      saveRow.querySelector("label")?.remove();
      $("gl-save").textContent = "Save";
      $("gl-saved-h").textContent = "Saved results";
      savedSec.querySelector(".hdr").after(saveRow);
      saveRow.after($("gl-toast"));
      $("gl-store-note")?.classList.add("sp-help");
      for (const b of [$("gl-export"), $("gl-import")]) b?.classList.add("sp-small");
    }
    // Final exam: three numbers side by side, the answer, and the working only with "?".
    const fin = $("gl-final-h")?.closest("section");
    if (fin) {
      $("gl-final-h").textContent = "What do I need on the final?";
      const inRow = fin.querySelector(":scope > .row"); inRow?.classList.add("sp-fin");
      for (const [id, txt] of [["gl-f-cur", "Now"], ["gl-f-tgt", "Goal"], ["gl-f-w", "Final weight"]]) {
        const l = $(id)?.closest("label"); if (!l) continue;
        const inp = $(id); l.replaceChildren(Object.assign(document.createElement("span"), { className: "label", textContent: txt }), Object.assign(document.createElement("span"), { className: "sp-pct" }));
        l.lastChild.append(inp, "%");
      }
      $("gl-f-reset")?.closest(".row")?.remove();
      const out = $("gl-f-out")?.closest(".res"); out?.classList.add("sp-fout"); out.querySelector(".label").textContent = "You need";
      $("gl-f-work")?.classList.add("sp-help");
    }
    // "Needed on what's left" already answers this (give the final a weight and no score), and two answers that
    // disagree are confusing, so the separate final-exam helper isn't shown in the panel.
    if (fin) fin.style.display = "none";
    $("gl-how-h")?.closest("section")?.classList.add("sp-help");
  }

  // ---------- the panel's look and "?" setting, read from the panel itself (same extension, so it's allowed) ----------
  function follow() {
    let pdoc = null; try { pdoc = parent !== window ? parent.document : null; } catch { pdoc = null; }
    if (!pdoc) return;
    const apply = () => {
      const cs = getComputedStyle(pdoc.documentElement), r = document.documentElement.style;
      for (const v of ["card", "line", "ink", "muted", "accent", "accent-2", "accent-ink", "soft", "font", "bad", "good", "bg"]) {
        const val = cs.getPropertyValue(`--${v}`).trim(); if (val) r.setProperty(`--p-${v}`, val);
      }
      document.documentElement.classList.toggle("no-help", pdoc.documentElement.classList.contains("no-help"));
      document.documentElement.classList.add("sp-panel");
    };
    apply();
    new MutationObserver(apply).observe(pdoc.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-look"] });
  }
  if (q.get("compact")) { try { arrange(); } catch (e) { console.warn("ledger layout", e); } follow(); }
  let ready = false, timer = null;

  async function load() {
    const { ledger = {} } = await chrome.storage.local.get("ledger");
    const rec = ledger[courseId];
    if (rec?.state) GL.restore(rec.state);
    const name = document.getElementById("gl-save-name");
    if (name && q.get("name")) name.value = q.get("name");
    // Final-exam helper starts from this course's numbers.
    const cur = q.get("cur");
    if (cur) document.getElementById("gl-f-cur").value = cur;
    if (rec?.state?.target) document.getElementById("gl-f-tgt").value = rec.state.target;
    ready = true;
    // Show results right away (nothing to press)
    try { document.getElementById("gl-calc")?.click(); document.getElementById("gl-f-calc")?.click(); } catch { /* nothing to show yet */ }
  }

  // Every edit is kept for this course (what-ifs included) until "Reload from Canvas".
  function autosave() {
    if (!ready) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const { ledger = {} } = await chrome.storage.local.get("ledger");
      ledger[courseId] = { ...(ledger[courseId] || {}), state: GL.snapshot(), edited: Date.now() };
      await chrome.storage.local.set({ ledger });
      parent.postMessage({ type: "gl-edited", courseId }, "*");
    }, 400);
  }
  const root = document.getElementById("grade-ledger");
  ["input", "change"].forEach((ev) => root.addEventListener(ev, autosave));
  // Results update as you type (the Calculate buttons are hidden here).
  let calcT = null;
  const recalc = (e) => {
    clearTimeout(calcT);
    calcT = setTimeout(() => {
      if (e?.target?.id === "gl-save-name") return;
      const btn = e?.target?.closest?.("section")?.querySelector("#gl-calc, #gl-f-calc");
      try { btn?.click(); } catch { /* incomplete input: wait for more */ }
    }, 250);
  };
  ["input", "change"].forEach((ev) => root.addEventListener(ev, recalc));
  // CampusPilot's accent color and font
  chrome.storage.local.get("settings").then(({ settings = {} }) => {
    const accent = settings.look?.accent;
    if (accent) document.documentElement.style.setProperty("--sp-accent", accent);
  });
  root.addEventListener("click", (e) => { if (e.target.closest("button")) setTimeout(autosave, 0); });

  // Keep the panel's frame as tall as the content.
  const post = () => parent.postMessage({ type: "gl-height", courseId, height: Math.ceil(document.getElementById("grade-ledger").getBoundingClientRect().height) }, "*");
  new ResizeObserver(post).observe(document.body);
  window.addEventListener("message", (e) => { if (e.data?.type === "gl-reload") load(); });
  load().then(post);
})();
