#!/usr/bin/env python3
"""Builds docs/changelog.html from CHANGELOG.md. Run from the repo root: python3 tools/build-changelog.py"""
import html, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
md = (root / "CHANGELOG.md").read_text(encoding="utf-8").splitlines()

def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2">\1</a>', t)
    return t

out, in_list, versions = [], False, []
def close():
    global in_list
    if in_list: out.append("</ul>"); in_list = False
for line in md:
    if line.startswith("# "): continue  # the page has its own title
    m = re.match(r"^(#{2,4}) (.*)", line)
    if m:
        close()
        lvl, text = len(m.group(1)), m.group(2)
        vid = re.search(r"(\d+\.\d+(?:\.\d+)?)", text)
        anchor = f' id="v{vid.group(1)}"' if (vid and lvl == 2) else ""
        if anchor: versions.append((vid.group(1), text))
        out.append(f"<h{lvl}{anchor}>{inline(text)}</h{lvl}>")
    elif re.match(r"^\s*[-*] ", line):
        if not in_list: out.append("<ul>"); in_list = True
        out.append(f"<li>{inline(re.sub(r'^\s*[-*] ', '', line))}</li>")
    elif line.strip():
        close(); out.append(f"<p>{inline(line.strip())}</p>")
    else:
        close()
close()

import json
latest = json.loads((root / "manifest.json").read_text())["version"]
page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CampusPilot Changelog</title>
<meta name="description" content="What's new in each version of CampusPilot.">
<link rel="icon" href="assets/icon.png">
<style>
  :root {{ --bg: #ffffff; --ink: #1f2328; --muted: #59636e; --line: #d8dee4; --accent: #2f6fed; --soft: #f3f6fd; }}
  @media (prefers-color-scheme: dark) {{ :root {{ --bg: #111418; --ink: #e8eaed; --muted: #a2a9b3; --line: #2c3138; --accent: #7aa7ff; --soft: #1a2130; }} }}
  body {{ margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.65 system-ui, -apple-system, "Segoe UI", sans-serif; }}
  main {{ max-width: 760px; margin: 0 auto; padding: 40px 16px 64px; }}
  a {{ color: var(--accent); }}
  h1 {{ font-size: 1.9em; margin: 0 0 4px; }}
  h2 {{ font-size: 1.25em; margin: 36px 0 8px; padding-top: 18px; border-top: 1px solid var(--line); scroll-margin-top: 16px; }}
  h3 {{ font-size: 1.05em; margin: 22px 0 6px; }}
  ul {{ padding-left: 20px; }}
  li {{ margin: 5px 0; }}
  code {{ background: var(--soft); padding: 1px 5px; border-radius: 5px; font-size: .9em; overflow-wrap: anywhere; }}
  .lead {{ color: var(--muted); margin: 0 0 18px; }}
  .latest {{ display: inline-block; background: var(--soft); color: var(--accent); font-weight: 700; border-radius: 999px; padding: 2px 12px; font-size: .9em; }}
  footer {{ margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: .9em; }}
  footer a {{ margin-right: 16px; }}
</style>
</head>
<body>
<main>
<p><a href="./">&larr; CampusPilot home</a></p>
<h1>What's new in CampusPilot</h1>
<p class="lead">Every update, newest first. CampusPilot updates itself through the Chrome Web Store.</p>
<p><span class="latest">Latest: {latest}</span></p>
{chr(10).join(out)}
<footer><a href="./">Home</a><a href="privacy.html">Privacy</a><a href="support.html">Support</a><a href="https://github.com/connorlabianco/CampusPilot">Source on GitHub</a></footer>
</main>
</body>
</html>
"""
(root / "docs" / "changelog.html").write_text(page, encoding="utf-8")
print(f"docs/changelog.html: {len(versions)} versions, latest {latest}")
