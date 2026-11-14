// Applies the student's "Canvas look" (theme, colors, card style, font) as early as possible.
// Runs at document_start so pages don't flash the default theme first. Never on quiz/exam/tool pages.
(() => {
  if (/\/quizzes(\/|$)|\/assessments?\/|quiz-lti|\/external_tools\/|lockdown|respondus|proctor/i.test(location.href)) return;
  let build = null, dark = null;
  const ready = Promise.all([import(chrome.runtime.getURL("lib/look.js")), import(chrome.runtime.getURL("lib/darken.js"))])
    .then(([m, d]) => { build = m; dark = d; });

  function apply(settings) {
    if (!build) return;
    const look = { ...build.DEFAULT_LOOK, ...(settings?.look || {}) };
    // Older versions had a single dark-mode switch
    if (!settings?.look && settings?.darkMode) look.theme = "dark";
    let style = document.getElementById("sp-look");
    if (!style) { style = document.createElement("style"); style.id = "sp-look"; (document.head || document.documentElement).append(style); }
    style.textContent = build.buildLookCss(look);
    document.documentElement.dataset.spTheme = look.theme;
    // Dark themes: recolor whatever Canvas draws (keeping each color's hue); other themes put everything back.
    if (build.isDarkTheme(look.theme)) dark.startDark(look.theme); else dark.stopDark();
    const href = build.fontLink(look);
    let link = document.getElementById("sp-look-font");
    if (href) {
      if (!link) { link = document.createElement("link"); link.id = "sp-look-font"; link.rel = "stylesheet"; (document.head || document.documentElement).append(link); }
      if (link.href !== href) link.href = href;
    } else link?.remove();
  }

  ready.then(() => chrome.storage.local.get("settings")).then(({ settings }) => apply(settings));
  chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.settings) ready.then(() => apply(ch.settings.newValue)); });
  // <head> may not exist yet at document_start; keep our style last so it wins
  document.addEventListener("DOMContentLoaded", () => {
    const s = document.getElementById("sp-look"); if (s && document.head) document.head.append(s);
    const l = document.getElementById("sp-look-font"); if (l && document.head) document.head.append(l);
  });
})();
