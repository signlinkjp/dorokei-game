#!/usr/bin/env python3
"""DOROKEI のアプリアイコンを iOS のアセットカタログへ入れる（Build 3）。

決まった絵（assets/dorokei-appicon-1024.png）を、App Store の要件どおり
1024x1024・RGB（透過なし）の PNG に整えて
ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png を置き換える。

  python3 tools/set-app-icon.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "dorokei-appicon-1024.png"
OUT = ROOT / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"

def main() -> None:
    im = Image.open(SRC)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    if im.size != (1024, 1024):
        im = im.resize((1024, 1024), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT, "PNG", optimize=True)
    check = Image.open(OUT)
    assert check.size == (1024, 1024), check.size
    assert check.mode == "RGB", check.mode
    print(f"wrote {OUT.relative_to(ROOT)} ({check.size[0]}x{check.size[1]} {check.mode})")

if __name__ == "__main__":
    main()
