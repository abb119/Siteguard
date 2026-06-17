"""
Merge every staged source for a model, drop near-duplicate frames (perceptual
hash -> prevents the same clip leaking across splits), optionally balance the
classes, then write a stratified 70/20/10 train/val/test split into
    dms_data/<model>/images/{train,val,test} + labels/{train,val,test}

    python dms_data/scripts/merge_split.py cabin
    python dms_data/scripts/merge_split.py seatbelt --balance 1.5
    python dms_data/scripts/merge_split.py all

Notes
- These public sets carry no clip IDs, so leakage is controlled by perceptual-hash
  de-duplication (Hamming <= --hash-thresh) rather than clip grouping.
- --balance R caps the majority class to R x the minority (image-level; each
  seatbelt frame is a single occupant state, so this is clean).
"""
from __future__ import annotations

import argparse
import random
import shutil
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
STAGING = ROOT / "staging"
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
NAMES = {"cabin": {0: "phone", 1: "bottle", 2: "cup"},
         "seatbelt": {0: "belt_on", 1: "belt_off"}}


def primary_class(label_path: Path) -> int | None:
    counts: Counter = Counter()
    if label_path.exists():
        for ln in label_path.read_text().splitlines():
            p = ln.split()
            if len(p) == 5:
                counts[int(float(p[0]))] += 1
    return counts.most_common(1)[0][0] if counts else None


def phash_int(img_path: Path) -> int | None:
    from PIL import Image
    import imagehash
    try:
        with Image.open(img_path) as im:
            return int(str(imagehash.phash(im)), 16)
    except Exception:
        return None


def dedup(pairs, thresh: int):
    """Greedy near-duplicate removal by Hamming distance on 64-bit pHash."""
    kept, kept_hashes = [], []
    hashes = np.array([phash_int(p[0]) or 0 for p in pairs], dtype=np.uint64)
    keep_mask = np.ones(len(pairs), dtype=bool)
    kept_arr = np.empty(0, dtype=np.uint64)
    for i, pair in enumerate(pairs):
        h = hashes[i]
        if kept_arr.size:
            dist = np.array([bin(int(h ^ k)).count("1") for k in kept_arr])
            if (dist <= thresh).any():
                keep_mask[i] = False
                continue
        kept.append(pair)
        kept_arr = np.append(kept_arr, h)
    return kept


def collect(model: str):
    pairs = []
    base = STAGING / model
    if not base.exists():
        return pairs
    for src in base.iterdir():
        if not src.is_dir():
            continue
        for img in (src / "images").iterdir():
            if img.suffix.lower() in IMG_EXT:
                pairs.append((img, src / "labels" / f"{img.stem}.txt"))
    return pairs


def balance(pairs, ratio: float):
    by_cls = defaultdict(list)
    for pr in pairs:
        by_cls[primary_class(pr[1])].append(pr)
    if len(by_cls) < 2:
        return pairs
    minority = min(len(v) for v in by_cls.values())
    cap = int(minority * ratio)
    rng = random.Random(7)
    out = []
    for cls, items in by_cls.items():
        if len(items) > cap:
            rng.shuffle(items)
            items = items[:cap]
        out += items
    return out


def split_and_write(model: str, pairs, val: float, test: float):
    out = ROOT / model
    for sub in ("images", "labels"):
        for sp in ("train", "val", "test"):
            d = out / sub / sp
            if d.exists():
                shutil.rmtree(d)
            d.mkdir(parents=True, exist_ok=True)

    by_cls = defaultdict(list)
    for pr in pairs:
        by_cls[primary_class(pr[1])].append(pr)

    rng = random.Random(123)
    split_counts = {sp: Counter() for sp in ("train", "val", "test")}
    n_split = Counter()
    for cls, items in by_cls.items():
        rng.shuffle(items)
        n = len(items)
        n_test = int(n * test)
        n_val = int(n * val)
        buckets = {"test": items[:n_test], "val": items[n_test:n_test + n_val],
                   "train": items[n_test + n_val:]}
        for sp, group in buckets.items():
            for img, lbl in group:
                shutil.copy(img, out / "images" / sp / img.name)
                dst_lbl = out / "labels" / sp / f"{img.stem}.txt"
                if lbl.exists():
                    shutil.copy(lbl, dst_lbl)
                else:
                    dst_lbl.write_text("")
                n_split[sp] += 1
                for ln in (lbl.read_text().splitlines() if lbl.exists() else []):
                    pp = ln.split()
                    if len(pp) == 5:
                        split_counts[sp][int(float(pp[0]))] += 1

    print(f"[{model}] {sum(n_split.values())} images after dedup/balance")
    for sp in ("train", "val", "test"):
        pretty = {NAMES[model][c]: n for c, n in sorted(split_counts[sp].items())}
        print(f"   {sp:5s}: {n_split[sp]:5d} imgs | instances {pretty}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("model", choices=["cabin", "seatbelt", "all"])
    ap.add_argument("--val", type=float, default=0.2)
    ap.add_argument("--test", type=float, default=0.1)
    ap.add_argument("--hash-thresh", type=int, default=4)
    ap.add_argument("--balance", type=float, default=None,
                    help="cap majority class to R x minority (e.g. 1.5)")
    args = ap.parse_args()

    models = ["cabin", "seatbelt"] if args.model == "all" else [args.model]
    for model in models:
        pairs = collect(model)
        if not pairs:
            print(f"[{model}] no staged data, skipping")
            continue
        print(f"[{model}] {len(pairs)} staged -> deduping (hamming<={args.hash_thresh})...")
        pairs = dedup(pairs, args.hash_thresh)
        if args.balance and model == "seatbelt":
            pairs = balance(pairs, args.balance)
        split_and_write(model, pairs, args.val, args.test)


if __name__ == "__main__":
    main()
