"""
Harmonize every raw source to the two canonical schemas and drop into
    dms_data/staging/<model>/<source_slug>/{images,labels}/

  cabin    : 0 phone | 1 bottle | 2 cup
  seatbelt : 0 belt_on | 1 belt_off   (box = occupant torso/shoulder region)

Per-source class maps were VERIFIED against each data.yaml at download time
(the index order is what lives in the .txt label files, NOT the display name):

  coco            already canonical (download_coco wrote 0/1/2)        -> identity
  statefarm_phone old dms_cabin: 0 phone, 1 drinking                   -> keep 0; skip any
                  image containing a drinking box (we can't tell bottle vs cup,
                  so an unlabelled cup would poison the cabin model)
  fyp_seatbelt    data.yaml ['non-seatbelt','seatbelt'] = 0,1          -> {0:1, 1:0}
  sbt_seatbelt    data.yaml ['no-seatbelt','seatbelt']  = 0,1          -> {0:1, 1:0}

Seatbelt cleaning (the DMS sees ONE frontal driver): drop boxes smaller than
MIN_AREA (far-away / through-windshield occupants), then drop the whole frame
if it ends up empty or with more than MAX_BOXES occupants (crowd / road scenes).

    python dms_data/scripts/harmonize.py            # all sources
    python dms_data/scripts/harmonize.py cabin      # one model's sources
"""
from __future__ import annotations

import random
import shutil
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent              # dms_data/
RAW = ROOT / "raw"
STAGING = ROOT / "staging"
DATASETS = ROOT.parent / "datasets"                        # repo-level datasets/
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

SOURCES: dict[str, dict] = {
    # ---- cabin (Model A) ----
    "coco": dict(
        model="cabin", root=RAW / "coco", layout="split", splits=["train", "val"],
        cmap={0: 0, 1: 1, 2: 2},
    ),
    "statefarm_phone": dict(
        model="cabin", root=DATASETS / "dms_cabin", layout="rf",
        splits=["train", "valid", "test"],
        cmap={0: 0}, drop_if_orig={1}, require_canon={0}, cap=2000,
    ),
    # ---- seatbelt (Model B) ----
    "fyp_seatbelt": dict(
        model="seatbelt", root=RAW / "roboflow" / "fyp_seatbelt", layout="rf",
        splits=["train", "valid", "test"],
        cmap={0: 1, 1: 0}, min_area=0.03, max_boxes=2, drop_empty=True,
    ),
    "sbt_seatbelt": dict(
        model="seatbelt", root=RAW / "roboflow" / "sbt_seatbelt", layout="rf",
        splits=["train", "valid", "test"],
        cmap={0: 1, 1: 0}, min_area=0.03, max_boxes=2, drop_empty=True,
    ),
}


def _pairs(cfg: dict):
    """Yield (image_path, label_path) for a source across its splits."""
    root, layout = cfg["root"], cfg["layout"]
    for sp in cfg["splits"]:
        img_dir = (root / "images" / sp) if layout == "split" else (root / sp / "images")
        lbl_dir = (root / "labels" / sp) if layout == "split" else (root / sp / "labels")
        if not img_dir.exists():
            continue
        for img in img_dir.iterdir():
            if img.suffix.lower() in IMG_EXT:
                yield img, lbl_dir / f"{img.stem}.txt"


def harmonize_source(slug: str, cfg: dict) -> Counter:
    cmap = cfg["cmap"]
    min_area = cfg.get("min_area", 0.0)
    max_boxes = cfg.get("max_boxes")
    drop_if_orig = cfg.get("drop_if_orig", set())
    require_canon = cfg.get("require_canon")
    drop_empty = cfg.get("drop_empty", False)

    out = STAGING / cfg["model"] / slug
    (out / "images").mkdir(parents=True, exist_ok=True)
    (out / "labels").mkdir(parents=True, exist_ok=True)

    pairs = list(_pairs(cfg))
    random.Random(42).shuffle(pairs)
    counts: Counter = Counter()
    kept_imgs = 0
    cap = cfg.get("cap")

    for img, lbl in pairs:
        if cap and kept_imgs >= cap:
            break
        orig_classes, kept = set(), []
        if lbl.exists():
            for ln in lbl.read_text().splitlines():
                p = ln.split()
                if len(p) != 5:
                    continue
                oc = int(float(p[0]))
                orig_classes.add(oc)
                if oc not in cmap or cmap[oc] is None:
                    continue
                cx, cy, bw, bh = map(float, p[1:])
                if bw * bh < min_area:
                    continue
                kept.append((cmap[oc], cx, cy, bw, bh))
        if drop_if_orig & orig_classes:
            continue
        if max_boxes and len(kept) > max_boxes:
            continue
        if drop_empty and not kept:
            continue
        if require_canon and not ({c for c, *_ in kept} & require_canon):
            continue

        stem = f"{slug}__{img.stem}"
        shutil.copy(img, out / "images" / f"{stem}{img.suffix.lower()}")
        (out / "labels" / f"{stem}.txt").write_text(
            "\n".join(f"{c} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}" for c, cx, cy, bw, bh in kept)
        )
        for c, *_ in kept:
            counts[c] += 1
        kept_imgs += 1

    names = {"cabin": {0: "phone", 1: "bottle", 2: "cup"},
             "seatbelt": {0: "belt_on", 1: "belt_off"}}[cfg["model"]]
    pretty = {names[c]: n for c, n in sorted(counts.items())}
    print(f"  {slug:16s} -> {kept_imgs:5d} imgs | instances {pretty}")
    return counts


def main() -> None:
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    models = {"cabin", "seatbelt"} if which == "all" else {which}
    for model in ("cabin", "seatbelt"):
        if model not in models:
            continue
        print(f"[{model}]")
        total: Counter = Counter()
        for slug, cfg in SOURCES.items():
            if cfg["model"] == model:
                total += harmonize_source(slug, cfg)
        names = {"cabin": {0: "phone", 1: "bottle", 2: "cup"},
                 "seatbelt": {0: "belt_on", 1: "belt_off"}}[model]
        print(f"  TOTAL {model}: { {names[c]: n for c, n in sorted(total.items())} }\n")


if __name__ == "__main__":
    main()
