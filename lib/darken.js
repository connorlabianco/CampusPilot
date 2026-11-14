// Dark themes on Canvas, without flipping the page. Canvas's light backgrounds become dark and its dark text becomes
// light, each keeping its own hue: a pale yellow box from the instructor turns into a dark yellow box, red text stays
// red. Pictures, videos, avatars and course colors are never touched. Medium and dark colors (buttons, course colors,
// the navigation bar) stay exactly as they are.
// The theme's base surfaces come from the stylesheet (lib/look.js); this handles everything Canvas draws without
// class names we know (its newer components and course content), as pages load and change.

export const BASES = {
  dark: { h: 220, s: 0.06, l: 0.105 },
  midnight: { h: 220, s: 0.04, l: 0.035 },
  dim: { h: 220, s: 0.05, l: 0.18 },
  "liquid-dark": { h: 226, s: 0.3, l: 0.09, glass: true },
};

// ---------- colors ----------
export function parseColor(str) {
  const m = String(str || "").match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
  if (!m) return null;
  let a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { r: +m[1], g: +m[2], b: +m[3], a };
}
export function toHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}
export function hsl(h, s, l, a = 1) {
  const k = (n) => (n + h / 30) % 12, A = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - A * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return a < 1 ? `rgba(${f(0)}, ${f(8)}, ${f(4)}, ${+a.toFixed(3)})` : `rgb(${f(0)}, ${f(8)}, ${f(4)})`;
}
const lum = ({ r, g, b }) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
  .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/** A light background, made dark with the same hue. null = keep it (it's already medium or dark). */
export function mapBg(c, base) {
  if (!c || c.a < 0.05) return null;
  const { h, s, l } = toHsl(c);
  if (l <= 0.56) return null;
  const neutral = s < 0.14 || l > 0.965;
  if (base.glass) {
    if (neutral) return l > 0.985 ? `rgba(18, 23, 38, ${+(0.62 * c.a).toFixed(3)})` : `rgba(255, 255, 255, ${+((0.03 + (1 - l) * 0.45) * c.a).toFixed(3)})`;
    return hsl(h, Math.min(s, 0.55) * 0.75, 0.13 + (1 - l) * 0.45, 0.8 * c.a);
  }
  if (neutral) return hsl(base.h, base.s, Math.min(0.42, base.l + (1 - l) * 0.95), c.a);
  return hsl(h, Math.min(s, 0.6) * 0.8, Math.min(0.42, Math.max(base.l + 0.07, 0.1) + (1 - l) * 0.5), c.a);
}
/** Text that would be hard to read on its (new) background, made light with the same hue. */
export function mapText(c, bg) {
  if (!c || c.a < 0.05) return null;
  if (contrast(c, bg) >= 4.5) return null;
  const { h, s, l } = toHsl(c);
  const bgDark = lum(bg) < 0.18;
  if (!bgDark) return null; // medium or light backgrounds keep the text they were designed with
  for (let L = Math.max(l, s > 0.3 ? 0.62 : 0.72); L <= 0.97; L += 0.04) {
    const out = hsl(h, s > 0.3 ? Math.min(s, 0.85) : s, L);
    if (contrast(parseColor(out), bg) >= 4.5) return out;
  }
  return hsl(h, s, 0.95);
}
export function mapBorder(c, base) {
  if (!c || c.a < 0.05) return null;
  const { h, s, l } = toHsl(c);
  if (l <= 0.6) return null;
  if (base.glass) return `rgba(255, 255, 255, ${+(0.1 * c.a + 0.04).toFixed(3)})`;
  return s < 0.14 ? hsl(base.h, base.s, Math.min(0.5, base.l + 0.1 + (1 - l) * 0.5)) : hsl(h, Math.min(s, 0.5), 0.3);
}

// ---------- the page ----------
const SKIP = new Set(["IMG", "VIDEO", "IFRAME", "CANVAS", "PICTURE", "EMBED", "OBJECT", "SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "TEMPLATE", "svg", "SVG", "BR", "HEAD", "TITLE"]);
const OURS = /(^|\s)sp-/;
const PROPS = ["background-color", "color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color"];
let run = null;

export function startDark(theme) {
  const base = BASES[theme];
  if (!base) return stopDark();
  if (run?.theme === theme) return;
  stopDark();
  const pageBg = parseColor(hsl(base.h, base.s, base.l));
  const touched = new Set();
  const eff = new WeakMap(); // element → its visible background after our changes
  let writing = false;

  const restore = (el) => {
    const saved = el.__spDark;
    if (!saved) return;
    writing = true;
    for (const p of PROPS) {
      if (!(p in saved)) continue;
      if (saved[p]) el.style.setProperty(p, saved[p].v, saved[p].pr); else el.style.removeProperty(p);
    }
    writing = false;
    delete el.__spDark;
    touched.delete(el);
  };
  const set = (el, prop, value) => {
    el.__spDark ||= {};
    if (!(prop in el.__spDark)) { const v = el.style.getPropertyValue(prop); el.__spDark[prop] = v ? { v, pr: el.style.getPropertyPriority(prop) } : null; }
    writing = true; el.style.setProperty(prop, value, "important"); writing = false;
    touched.add(el);
  };
  // Left alone, with everything inside: pictures and media, Canvas's own (already dark) navigation bar, icons,
  // text being edited, and CampusPilot's own widgets (they have their own dark colors).
  const own = (el) => SKIP.has(el.tagName) || el.id === "header" || (typeof el.className === "string" && (OURS.test(el.className) || /(^|\s)ic-app-header(\s|$)/.test(el.className))) || el.isContentEditable;
  const skip = (el) => own(el) || !!el.parentElement?.closest?.("#header, .ic-app-header, svg, [contenteditable=true], [class^='sp-'], [class*=' sp-']");

  function paint(el) {
    if (el.nodeType !== 1) return;
    const parentBg = (el.parentElement && eff.get(el.parentElement)) || pageBg;
    const cs = getComputedStyle(el);
    // background
    let bgNow = parentBg;
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg.a >= 0.05) {
      const out = mapBg(bg, base);
      if (out) {
        // In Glass, a surface the same color as the one around it adds nothing: let the glass show through.
        const pOrig = el.parentElement?.__spOrigBg;
        if (base.glass && pOrig && pOrig === cs.backgroundColor) set(el, "background-color", "transparent");
        else set(el, "background-color", out);
        el.__spOrigBg = cs.backgroundColor;
        const o = parseColor(out);
        bgNow = o.a >= 0.5 ? o : parentBg;
      } else {
        el.__spOrigBg = cs.backgroundColor;
        bgNow = bg.a >= 0.5 ? bg : parentBg;
      }
    } else if (el.parentElement?.__spOrigBg) el.__spOrigBg = el.parentElement.__spOrigBg;
    eff.set(el, bgNow);
    // text
    const fg = parseColor(cs.color);
    const t = mapText(fg, bgNow);
    if (t) set(el, "color", t);
    // borders (only ones that are drawn)
    for (const side of ["top", "right", "bottom", "left"]) {
      if (parseFloat(cs[`border${side[0].toUpperCase()}${side.slice(1)}Width`]) > 0) {
        const b = mapBorder(parseColor(cs[`border${side[0].toUpperCase()}${side.slice(1)}Color`]), base);
        if (b) set(el, `border-${side}-color`, b);
      }
    }
  }
  function paintTree(root) {
    if (root.nodeType !== 1 || skip(root)) return;
    paint(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (own(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    let n; while ((n = walker.nextNode())) paint(n);
  }

  // Pages keep changing (menus open, lists load): repaint what's new, in batches.
  const queue = new Set();
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    const list = [...queue]; queue.clear();
    for (const el of list) if (el.isConnected && !list.some((o) => o !== el && o.contains(el))) paintTree(el);
  };
  const enqueue = (el) => { queue.add(el); if (!scheduled) { scheduled = true; requestAnimationFrame(flush); } };
  const mo = new MutationObserver((muts) => {
    if (writing) return;
    for (const m of muts) {
      if (m.type === "childList") m.addedNodes.forEach((n) => n.nodeType === 1 && enqueue(n));
      else if (m.type === "attributes" && m.target.nodeType === 1) { restore(m.target); enqueue(m.target); }
    }
  });

  // Hover colors come from the stylesheet only while hovering: recolor them then, and put them back after.
  const hovered = [];
  const onOver = (e) => {
    const chain = [];
    for (let el = e.target; el && el.nodeType === 1 && chain.length < 4; el = el.parentElement) chain.push(el);
    requestAnimationFrame(() => {
      for (const el of chain) {
        if (el.__spDark?.["background-color"] !== undefined || skip(el)) continue;
        const out = mapBg(parseColor(getComputedStyle(el).backgroundColor), base);
        if (out) { set(el, "background-color", out); hovered.push(el); }
      }
    });
  };
  const onOut = () => { while (hovered.length) restore(hovered.pop()); };

  const begin = () => {
    document.documentElement.style.colorScheme = "dark";
    paintTree(document.body || document.documentElement);
    // Watching from the top means parts of the page are recolored as they arrive, not after it has loaded.
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);
  };
  run = { theme, stop: () => {
    mo.disconnect();
    document.removeEventListener("mouseover", onOver, true);
    document.removeEventListener("mouseout", onOut, true);
    for (const el of [...touched]) restore(el);
    document.documentElement.style.colorScheme = "";
  } };
  begin();
}

export function stopDark() {
  if (!run) return;
  run.stop();
  run = null;
}
