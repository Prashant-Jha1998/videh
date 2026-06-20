#!/usr/bin/env python3
"""Regenerate WebP icons for videh.co.in from the app PNG source."""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Install Pillow: pip install Pillow", file=sys.stderr)
    raise SystemExit(1)

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
SRC = REPO / "artifacts" / "videh" / "assets" / "images" / "videh_icon_foreground.png"

if not SRC.is_file():
    print(f"Missing source icon: {SRC}", file=sys.stderr)
    raise SystemExit(1)

img = Image.open(SRC).convert("RGBA")
for size in (32, 64, 128):
    out = ROOT / f"videh_icon_{size}.webp"
    img.resize((size, size), Image.LANCZOS).save(out, "WEBP", quality=82, method=6)
    print(f"Wrote {out.name} ({out.stat().st_size} bytes)")

full = ROOT / "videh_icon_foreground.webp"
img.save(full, "WEBP", quality=85, method=6)
print(f"Wrote {full.name} ({full.stat().st_size} bytes)")
