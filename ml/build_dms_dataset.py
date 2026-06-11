"""
Build a YOLOv8 dataset from the raw captures (model-assisted labeling).

Reads datasets/dms_cabin/raw/<scene>/*.jpg (from ml/capture_dataset.py) and:
  1. Auto-labels boxes using pretrained COCO yolov8n:
       phone        -> 'cell phone' box            -> class 0 phone
       drinking     -> 'cup'/'bottle' box          -> class 1 drinking
       seatbelt_on  -> torso slice of 'person' box -> class 2 seatbelt_on
       seatbelt_off -> torso slice of 'person' box -> class 3 seatbelt_off
       neutral      -> no labels (negative/background image)
     The CLASS comes from the scene you recorded; COCO only provides the BOX.
  2. Images where the expected object isn't found go to raw/_unlabeled/ for
     manual labeling (Roboflow/Label Studio) or re-capture.
  3. Splits 70/20/10 into datasets/dms_cabin/{train,valid,test}/{images,labels}
     and writes datasets/dms_cabin/data.yaml.

Run:  python ml/build_dms_dataset.py
Then: python ml/train_dms.py
"""
from __future__ import annotations

import random
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "datasets" / "dms_cabin"
RAW = BASE / "raw"

NAMES = ["phone", "drinking", "seatbelt_on", "seatbelt_off"]
SPLITS = {"train": 0.7, "valid": 0.2, "test": 0.1}
SEED = 42

# scene -> (class id or None for background, COCO ids that provide the box)
SCENE_CFG = {
    "phone": (0, [67]),                # cell phone
    "drinking": (1, [41, 39]),         # cup, bottle
    "seatbelt_on": (2, [0]),           # person -> torso slice
    "seatbelt_off": (3, [0]),
    "neutral": (None, []),
}


def torso_box(px1, py1, px2, py2):
    """Chest/torso slice of a person box — where the belt actually shows."""
    h = py2 - py1
    return px1, py1 + 0.22 * h, px2, py1 + 0.72 * h


def to_yolo_line(cls, x1, y1, x2, y2, w, h):
    cx, cy = (x1 + x2) / 2 / w, (y1 + y2) / 2 / h
    bw, bh = (x2 - x1) / w, (y2 - y1) / h
    return f"{cls} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}"


def main():
    import cv2
    from ultralytics import YOLO

    if not RAW.exists():
        raise SystemExit(f"No raw captures found at {RAW}. Run ml/capture_dataset.py first.")

    model = YOLO(str(ROOT / "yolov8n.pt"))
    unlabeled = RAW / "_unlabeled"
    unlabeled.mkdir(exist_ok=True)

    labeled = []  # (img_path, label_lines, scene)
    skipped = 0

    for scene, (cls, coco_ids) in SCENE_CFG.items():
        scene_dir = RAW / scene
        if not scene_dir.exists():
            continue
        imgs = sorted(scene_dir.glob("*.jpg"))
        print(f"Scene '{scene}': {len(imgs)} images")
        for img_path in imgs:
            if cls is None:  # background negative
                labeled.append((img_path, [], scene))
                continue
            frame = cv2.imread(str(img_path))
            if frame is None:
                continue
            h, w = frame.shape[:2]
            res = model(frame, imgsz=640, conf=0.35, verbose=False)
            lines = []
            best = None  # largest matching box
            for r in res:
                for b in r.boxes:
                    if int(b.cls[0].item()) in coco_ids:
                        x1, y1, x2, y2 = b.xyxy[0].tolist()
                        area = (x2 - x1) * (y2 - y1)
                        if best is None or area > best[0]:
                            best = (area, (x1, y1, x2, y2))
            if best:
                x1, y1, x2, y2 = best[1]
                if scene.startswith("seatbelt"):
                    x1, y1, x2, y2 = torso_box(x1, y1, x2, y2)
                lines.append(to_yolo_line(cls, x1, y1, x2, y2, w, h))
                labeled.append((img_path, lines, scene))
            else:
                shutil.copy2(img_path, unlabeled / img_path.name)
                skipped += 1

    if not labeled:
        raise SystemExit("Nothing labeled — record some scenes first.")

    # Stratified split per scene
    random.seed(SEED)
    by_scene: dict[str, list] = {}
    for item in labeled:
        by_scene.setdefault(item[2], []).append(item)

    for split in SPLITS:
        (BASE / split / "images").mkdir(parents=True, exist_ok=True)
        (BASE / split / "labels").mkdir(parents=True, exist_ok=True)

    counts = {s: 0 for s in SPLITS}
    for scene, items in by_scene.items():
        random.shuffle(items)
        n = len(items)
        cut1 = int(n * SPLITS["train"])
        cut2 = cut1 + int(n * SPLITS["valid"])
        for i, (img_path, lines, _) in enumerate(items):
            split = "train" if i < cut1 else "valid" if i < cut2 else "test"
            shutil.copy2(img_path, BASE / split / "images" / img_path.name)
            (BASE / split / "labels" / f"{img_path.stem}.txt").write_text("\n".join(lines))
            counts[split] += 1

    yaml_text = (
        f"path: {BASE.as_posix()}\n"
        "train: train/images\nval: valid/images\ntest: test/images\n"
        "names:\n" + "".join(f"  {i}: {n}\n" for i, n in enumerate(NAMES))
    )
    (BASE / "data.yaml").write_text(yaml_text)

    print(f"\nDataset ready: {counts} (auto-label skipped {skipped} -> raw/_unlabeled)")
    print(f"Config: {BASE / 'data.yaml'}")
    print("Review a few labels before training! Next: python ml/train_dms.py")


if __name__ == "__main__":
    main()
