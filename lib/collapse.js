// Every card with a title can be folded: click (or press Enter/Space on) its title to collapse it to just the title,
// and again to open it. What's folded is remembered per screen in this browser.
const KEY = "collapsedCards";
const norm = (t) => String(t || "").replace(/\d+/g, "#").replace(/\s+/g, " ").trim().slice(0, 60);

function headOf(card) {
  const first = card.firstElementChild;
  if (!first) return null;
  if (/^H[23]$/.test(first.tagName)) return { el: first, title: first };
  const t = first.querySelector(":scope > h2, :scope > h3, :scope > .grow > h3, :scope > div > h3:first-child");
  return t && first.children.length <= 4 ? { el: first, title: t } : null;
}

export function enableCollapse(root, { scope = "panel", selector = ".card", onOpen = null } = {}) {
  let folded = new Set();
  const keyOf = (card, head) => `${scope}:${card.dataset.fold || norm(head.title.textContent)}`;
  const apply = () => {
    for (const card of root.querySelectorAll(selector)) {
      if (card.closest("dialog")) continue;
      const head = headOf(card);
      if (!head || card.children.length < 2) continue;
      const key = keyOf(card, head);
      if (!head.el.classList.contains("fold-head")) {
        head.el.classList.add("fold-head");
        head.title.classList.add("fold-title");
        head.el.tabIndex = 0;
        head.el.setAttribute("role", "button");
      }
      const shut = folded.has(key);
      card.classList.toggle("folded", shut);
      head.el.setAttribute("aria-expanded", String(!shut));
      head.el.title = shut ? "Show" : "Collapse";
    }
  };
  const toggle = (headEl) => {
    const card = headEl.parentElement;
    const head = headOf(card);
    if (!head) return;
    const key = keyOf(card, head);
    const opening = folded.has(key);
    opening ? folded.delete(key) : folded.add(key);
    try { chrome.storage.local.set({ [KEY]: [...folded].slice(-200) }); } catch { /* not saved; still works now */ }
    apply();
    if (opening) onOpen?.(card);
  };
  root.addEventListener("click", (e) => {
    const h = e.target.closest(".fold-head");
    if (!h || !root.contains(h) || e.target.closest("button, a, input, select, textarea, label, summary")) return;
    if (getSelection()?.toString()) return; // selecting text, not folding
    toggle(h);
  });
  root.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("fold-head")) { e.preventDefault(); toggle(e.target); }
  });
  let queued = false;
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; apply(); }); } }).observe(root, { childList: true, subtree: true });
  chrome.storage.local.get(KEY).then((r) => { folded = new Set(r[KEY] || []); apply(); }).catch(() => apply());
}
