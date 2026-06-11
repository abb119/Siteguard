"""
Build the custom DMS dataset from a PUBLIC HuggingFace dataset — no account,
no webcam recording, labels already human/synthetically annotated (YOLO format).

Source: anywaylabs/synthetic-driver-monitoring-detection (1.357 in-cabin images)
  their classes: 0 drinking · 1 yawning · 2 calling · 3 texting
  remapped to ours: calling+texting -> 0 phone · drinking -> 1 drinking
  yawning boxes are DROPPED (drowsiness/yawn is handled by MediaPipe, not the
  detector); images left with no boxes become background negatives (capped).

Strategy: download all label files first (tiny .txt), remap, then fetch only
the sampled images (~2 MB each). Splits 70/20/10 into datasets/dms_cabin/ and
writes data.yaml with names {0: phone, 1: drinking}.

Run:   python ml/import_hf_dataset.py            # ~600 object images + 80 negatives
       python ml/import_hf_dataset.py --max 300  # smaller/faster
Then:  python ml/train_dms.py
"""
from __future__ import annotations

import argparse
import json
import random
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "datasets" / "dms_cabin"
DS = "anywaylabs/synthetic-driver-monitoring-detection"
RESOLVE = f"https://huggingface.co/datasets/{DS}/resolve/main/"

REMAP = {2: 0, 3: 0, 0: 1}  # calling/texting -> phone(0); drinking -> drinking(1); yawning dropped
NAMES = ["phone", "drinking"]
SPLITS = {"train": 0.7, "valid": 0.2, "test": 0.1}
SEED = 42


def _get(url: str, retries: int = 4) -> bytes:
    """GET with exponential backoff — HF rate-limits anonymous bursts (429)."""
    import time
    delay = 4.0
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "siteguard"})
            return urllib.request.urlopen(req, timeout=90).read()
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < retries - 1:
                time.sleep(delay)
                delay *= 2
                continue
            raise
    raise RuntimeError("unreachable")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=600, help="images with objects to download")
    ap.add_argument("--negatives", type=int, default=80, help="background images to include")
    ap.add_argument("--workers", type=int, default=5)
    args = ap.parse_args()

    info = json.loads(_get(f"https://huggingface.co/api/datasets/{DS}"))
    files = [s["rfilename"] for s in info["siblings"]]
    stems = sorted(
        Path(f).stem for f in files
        if f.startswith("images/train/") and f.endswith(".png")
        and f"labels/train/{Path(f).stem}.txt" in set(files)
    )
    print(f"{len(stems)} image/label pairs available")

    # 1) Fetch + remap ALL labels (cheap), classify into object/background pools
    def fetch_label(stem: str):
        try:
            raw = _get(RESOLVE + urllib.parse.quote(f"labels/train/{stem}.txt")).decode()
        except Exception:
            return stem, None
        lines = []
        for ln in raw.splitlines():
            parts = ln.split()
            if not parts:
                continue
            cls = int(float(parts[0]))
            if cls in REMAP:
                lines.append(" ".join([str(REMAP[cls])] + parts[1:]))
        return stem, lines

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        results = dict(ex.map(fetch_label, stems))

    objects = [s for s, l in results.items() if l]
    backgrounds = [s for s, l in results.items() if l == []]
    print(f"after remap: {len(objects)} with phone/drinking boxes · {len(backgrounds)} backgrounds")

    random.seed(SEED)
    random.shuffle(objects)
    random.shuffle(backgrounds)
    picked = [(s, results[s]) for s in objects[: args.max]]
    picked += [(s, []) for s in backgrounds[: args.negatives]]
    random.shuffle(picked)

    # 2) Split and download only the picked images
    for split in SPLITS:
        (BASE / split / "images").mkdir(parents=True, exist_ok=True)
        (BASE / split / "labels").mkdir(parents=True, exist_ok=True)

    n = len(picked)
    cut1 = int(n * SPLITS["train"])
    cut2 = cut1 + int(n * SPLITS["valid"])
    assignments = [(s, l, "train" if i < cut1 else "valid" if i < cut2 else "test")
                   for i, (s, l) in enumerate(picked)]

    def dl(item) -> int:
        stem, lines, split = item
        img_dest = BASE / split / "images" / f"{stem}.png"
        if not img_dest.exists():
            try:
                img_dest.write_bytes(_get(RESOLVE + urllib.parse.quote(f"images/train/{stem}.png")))
            except Exception as exc:
                print("  ERR", stem, str(exc)[:50])
                return 0
        (BASE / split / "labels" / f"{stem}.txt").write_text("\n".join(lines))
        return 1

    print(f"Downloading {n} images (~{n * 2 // 1024} GB roughly {n*2} MB)…")
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        ok = sum(ex.map(dl, assignments))

    yaml_text = (
        f"path: {BASE.as_posix()}\n"
        "train: train/images\nval: valid/images\ntest: test/images\n"
        "names:\n" + "".join(f"  {i}: {nm}\n" for i, nm in enumerate(NAMES))
    )
    (BASE / "data.yaml").write_text(yaml_text)

    counts = {s: len(list((BASE / s / "images").glob("*.png"))) for s in SPLITS}
    print(f"\nDataset ready: {counts} ({ok}/{n} downloaded) -> {BASE / 'data.yaml'}")
    print("Next: python ml/train_dms.py")


if __name__ == "__main__":
    main()
