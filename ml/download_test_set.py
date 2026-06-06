"""
Download a labelled PPE test split WITHOUT any API key.

Mirrors the public "Construction Site Safety" test split (82 images) from the
VoxDroid GitHub repo, remaps the 'vehicle' class index (9 -> 10) so it aligns
with the deployed 11-class model (which inserts 'utility pole' at index 9), and
writes a ready-to-use data.yaml.

Run:
    python ml/download_test_set.py
    python ml/evaluate.py --data datasets/construction-site-safety/data.yaml --split test
"""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = "VoxDroid/Construction-Site-Safety-PPE-Detection"
BRANCH = "main"
PREFIX = "Model-Training/Dataset/test/"
RAW = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/"
DEST = ROOT / "datasets" / "construction-site-safety"

NAMES = ["Hardhat", "Mask", "NO-Hardhat", "NO-Mask", "NO-Safety Vest", "Person",
         "Safety Cone", "Safety Vest", "machinery", "utility pole", "vehicle"]


def _get(url: str) -> bytes:
    return urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": "siteguard"}), timeout=40
    ).read()


def main():
    tree = json.loads(_get(f"https://api.github.com/repos/{REPO}/git/trees/{BRANCH}?recursive=1"))
    paths = [i["path"] for i in tree["tree"]
             if i["path"].startswith(PREFIX) and i["path"].endswith((".jpg", ".txt"))]
    print(f"Found {len(paths)} test files")

    (DEST / "test" / "images").mkdir(parents=True, exist_ok=True)
    (DEST / "test" / "labels").mkdir(parents=True, exist_ok=True)

    def dl(p: str) -> int:
        sub = "images" if p.endswith(".jpg") else "labels"
        out = DEST / "test" / sub / os.path.basename(p)
        try:
            out.write_bytes(_get(RAW + urllib.parse.quote(p)))
            return 1
        except Exception as exc:
            print("ERR", p, str(exc)[:60])
            return 0

    with ThreadPoolExecutor(max_workers=12) as ex:
        ok = sum(ex.map(dl, paths))
    print(f"Downloaded {ok}/{len(paths)}")

    # Remap dataset 'vehicle' (idx 9) -> 10 to match the 11-class model
    remapped = 0
    for f in (DEST / "test" / "labels").glob("*.txt"):
        out_lines = []
        for ln in f.read_text().splitlines():
            parts = ln.split()
            if parts and parts[0] == "9":
                parts[0] = "10"
                remapped += 1
            out_lines.append(" ".join(parts))
        f.write_text("\n".join(out_lines) + ("\n" if out_lines else ""))
    print(f"Remapped {remapped} 'vehicle' label lines (9 -> 10)")

    yaml = (
        f"path: {DEST.as_posix()}\n"
        "train: test/images\nval: test/images\ntest: test/images\n"
        "names:\n" + "".join(f"  {i}: {n}\n" for i, n in enumerate(NAMES))
    )
    (DEST / "data.yaml").write_text(yaml)
    print(f"Wrote {DEST / 'data.yaml'}")


if __name__ == "__main__":
    main()
