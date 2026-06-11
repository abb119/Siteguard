"""
Add the REAL State Farm distracted-driver images (22.4k, 640x480) to the
custom DMS dataset, reading straight from the downloaded ZIP (no extraction).

Source zip: datasets/statefarm.zip (HF mirror gymprathap/Driver-Distracted-Dataset).
Class mapping (State Farm -> ours):
    c1 texting R · c2 phone R · c3 texting L · c4 phone L  -> phone
    c6 drinking                                            -> drinking
    c0 safe driving (+ a slice of c5/c7/c9 for diversity)  -> background negatives

Boxes for phone/drinking are auto-labeled with COCO yolov8m at low conf on the
full-resolution images; images where the object isn't found are skipped (with
22k available we only keep confident labels). Output is APPENDED to
datasets/dms_cabin/{train,valid,test} next to the synthetic set (sf_ prefix),
keeping the same 2-class data.yaml.

Run:  python ml/import_statefarm_real.py
      python ml/import_statefarm_real.py --max-phone 2000 --max-drink 1200
"""
from __future__ import annotations

import argparse
import io
import random
import re
import zipfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
ZIP = ROOT / "datasets" / "statefarm.zip"
BASE = ROOT / "datasets" / "dms_cabin"

SPLITS = {"train": 0.7, "valid": 0.2, "test": 0.1}
SEED = 1234

PHONE_DIRS = {"c1", "c2", "c3", "c4"}
DRINK_DIRS = {"c6"}
NEG_DIRS = {"c0", "c5", "c7", "c9"}


def main():
    import cv2
    from ultralytics import YOLO

    ap = argparse.ArgumentParser()
    ap.add_argument("--max-phone", type=int, default=5000)
    ap.add_argument("--max-drink", type=int, default=2300)
    ap.add_argument("--max-neg", type=int, default=1200)
    ap.add_argument("--conf", type=float, default=0.15)
    args = ap.parse_args()

    if not ZIP.exists():
        raise SystemExit(f"{ZIP} not found — download it first.")

    zf = zipfile.ZipFile(ZIP)
    pat = re.compile(r"(?:^|/)train/(c\d)/([^/]+\.(?:jpg|jpeg|png))$", re.IGNORECASE)
    by_cls: dict[str, list[str]] = {}
    for name in zf.namelist():
        m = pat.search(name)
        if m:
            by_cls.setdefault(m.group(1).lower(), []).append(name)
    print("zip contents:", {k: len(v) for k, v in sorted(by_cls.items())})
    if not by_cls:
        raise SystemExit("No train/cX images found in the zip — inspect its structure.")

    random.seed(SEED)
    phone_pool = [p for d in PHONE_DIRS for p in by_cls.get(d, [])]
    drink_pool = [p for d in DRINK_DIRS for p in by_cls.get(d, [])]
    neg_pool = [p for d in NEG_DIRS for p in by_cls.get(d, [])]
    for pool in (phone_pool, drink_pool, neg_pool):
        random.shuffle(pool)

    model = YOLO(str(ROOT / "yolov8m.pt"))
    print("Auto-labeling with yolov8m (COCO), low conf — GPU recommended…")

    def read_img(name: str):
        data = zf.read(name)
        return cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)

    def best_box(img, coco_ids: set[int]):
        res = model(img, imgsz=960, conf=args.conf, verbose=False)
        best = None
        for r in res:
            for b in r.boxes:
                if int(b.cls[0]) in coco_ids:
                    x1, y1, x2, y2 = b.xyxy[0].tolist()
                    area = (x2 - x1) * (y2 - y1)
                    if best is None or area > best[0]:
                        best = (area, (x1, y1, x2, y2))
        return best[1] if best else None

    for split in SPLITS:
        (BASE / split / "images").mkdir(parents=True, exist_ok=True)
        (BASE / split / "labels").mkdir(parents=True, exist_ok=True)

    def assign_split(i: int, n: int) -> str:
        f = i / max(n, 1)
        return "train" if f < SPLITS["train"] else "valid" if f < SPLITS["train"] + SPLITS["valid"] else "test"

    def save(img, lines, name_stem: str, split: str):
        import cv2 as _cv2
        _cv2.imwrite(str(BASE / split / "images" / f"{name_stem}.jpg"), img)
        (BASE / split / "labels" / f"{name_stem}.txt").write_text("\n".join(lines))

    stats = {"phone": 0, "drinking": 0, "neg": 0, "skipped": 0}

    # phone (cls 0) — COCO cell phone
    kept = 0
    for name in phone_pool:
        if kept >= args.max_phone:
            break
        img = read_img(name)
        if img is None:
            continue
        box = best_box(img, {67})
        if box is None:
            stats["skipped"] += 1
            continue
        h, w = img.shape[:2]
        x1, y1, x2, y2 = box
        line = f"0 {(x1+x2)/2/w:.6f} {(y1+y2)/2/h:.6f} {(x2-x1)/w:.6f} {(y2-y1)/h:.6f}"
        stem = "sf_" + Path(name).parent.name + "_" + Path(name).stem
        save(img, [line], stem, assign_split(kept, min(args.max_phone, len(phone_pool))))
        kept += 1
        if kept % 500 == 0:
            print(f"  phone: {kept}", flush=True)
    stats["phone"] = kept

    # drinking (cls 1) — COCO cup/bottle
    kept = 0
    for name in drink_pool:
        if kept >= args.max_drink:
            break
        img = read_img(name)
        if img is None:
            continue
        box = best_box(img, {41, 39})
        if box is None:
            stats["skipped"] += 1
            continue
        h, w = img.shape[:2]
        x1, y1, x2, y2 = box
        line = f"1 {(x1+x2)/2/w:.6f} {(y1+y2)/2/h:.6f} {(x2-x1)/w:.6f} {(y2-y1)/h:.6f}"
        stem = "sf_" + Path(name).parent.name + "_" + Path(name).stem
        save(img, [line], stem, assign_split(kept, min(args.max_drink, len(drink_pool))))
        kept += 1
        if kept % 500 == 0:
            print(f"  drinking: {kept}", flush=True)
    stats["drinking"] = kept

    # negatives — no labels
    kept = 0
    for name in neg_pool[: args.max_neg]:
        img = read_img(name)
        if img is None:
            continue
        stem = "sf_" + Path(name).parent.name + "_" + Path(name).stem
        save(img, [], stem, assign_split(kept, min(args.max_neg, len(neg_pool))))
        kept += 1
    stats["neg"] = kept

    counts = {s: len(list((BASE / s / "images").glob("*"))) for s in SPLITS}
    print(f"\nAdded from State Farm: {stats}")
    print(f"Combined dataset now: {counts}")
    print("Next: python ml/train_dms.py --epochs 80")


if __name__ == "__main__":
    main()
