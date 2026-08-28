#!/usr/bin/env python3
"""ReMark Store Assets — final quality gate.

Checks every exported PNG for:
  - exact final dimensions (1280x800, 440x280, 1400x560)
  - RGB mode, 8-bit, no alpha channel
  - the required headline/supporting copy inside each editable layout
  - no external CDN / remote image references in layout sources
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = json.loads((ROOT / "exports" / "export-manifest.json").read_text())

REQUIRED_COPY = {
    "01-hero.html": ["Leave a mark.", "Find your way back.", "Save the things worth coming back to."],
    "02-text-mark.html": ["Mark what catches your attention.", "Highlight a passage and keep the exact moment"],
    "03-video-mark.html": ["Mark a moment.", "Save a timestamp and come back to the exact moment"],
    "04-note.html": ["Leave a thought.", "Add a note to remember why you marked it."],
    "05-find-way-back.html": ["Find your way back.", "Click a Mark and jump straight back"],
    "small-promo.html": ["Leave a mark.", "Find your way back."],
    "marquee.html": ["Leave a mark.", "Find your way back.", "Save what catches your attention."],
}

REMOTE_PATTERN = re.compile(
    r"(src|href)\s*=\s*[\"']https?://|url\(\s*[\"']?https?://|@import\s+[\"']?https?://",
    re.IGNORECASE,
)

failures = []

try:
    from PIL import Image
except ImportError:
    print("Pillow is required: python3 -m pip install pillow")
    sys.exit(1)

for entry in MANIFEST:
    out = ROOT / entry["output"]
    src = ROOT / entry["source"]
    if not out.exists():
        failures.append(f"missing export: {entry['output']}")
        continue
    if not src.exists():
        failures.append(f"missing source: {entry['source']}")
        continue

    with Image.open(out) as im:
        if (im.width, im.height) != (entry["width"], entry["height"]):
            failures.append(f"{entry['output']}: size {im.width}x{im.height}, expected {entry['width']}x{entry['height']}")
        if im.mode != "RGB":
            failures.append(f"{entry['output']}: mode {im.mode}, expected RGB")
        if "A" in im.getbands():
            failures.append(f"{entry['output']}: has alpha channel")

    html = src.read_text()
    for phrase in REQUIRED_COPY.get(src.name, []):
        if phrase not in html:
            failures.append(f"{entry['source']}: missing copy {phrase!r}")
    if REMOTE_PATTERN.search(html):
        failures.append(f"{entry['source']}: remote resource reference found")

for css in (ROOT / "shared").glob("*.css"):
    if REMOTE_PATTERN.search(css.read_text()):
        failures.append(f"{css.name}: remote resource reference found")

if failures:
    print("FAIL")
    for failure in failures:
        print(" -", failure)
    sys.exit(1)

print("PASS — all exports match dimensions, RGB/no-alpha, copy, and local-only sources.")
