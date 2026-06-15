"""
Proof: does the custom model match/beat the old YOLO baseline?

Evaluates, on the SAME held-out test split:
  1. Custom model (dms_cabin.pt) via Ultralytics .val()  -> P / R / mAP per class
  2. Old baseline = generic COCO yolov8n mapped to our classes
       cell phone(67) -> phone   |  cup(41)/bottle(39) -> drinking
     scored against the same ground-truth boxes (greedy IoU>=0.5 matching)
       -> precision / recall per class

Run:  python ml/compare_baseline.py
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "datasets" / "dms_cabin" / "data.yaml"
TEST_IMG = ROOT / "datasets" / "dms_cabin" / "test" / "images"
TEST_LBL = ROOT / "datasets" / "dms_cabin" / "test" / "labels"
NAMES = ["phone", "drinking"]
COCO_MAP = {67: 0, 41: 1, 39: 1}  # cell phone->phone, cup/bottle->drinking


def iou(a, b):
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    inter = iw * ih
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0


def load_gt(stem, w, h):
    f = TEST_LBL / f"{stem}.txt"
    boxes = []
    if f.exists():
        for ln in f.read_text().splitlines():
            p = ln.split()
            if len(p) == 5:
                c, cx, cy, bw, bh = int(p[0]), *map(float, p[1:])
                boxes.append((c, [(cx - bw / 2) * w, (cy - bh / 2) * h,
                                  (cx + bw / 2) * w, (cy + bh / 2) * h]))
    return boxes


def main():
    import cv2
    from ultralytics import YOLO

    # ── 1. Custom model — official val ──
    print("== Custom model (dms_cabin.pt) on test split ==")
    cm = YOLO(str(ROOT / "dms_cabin.pt"))
    mt = cm.val(data=str(DATA), split="test", imgsz=640, verbose=False).box
    print(f"   Precision {mt.mp:.3f} | Recall {mt.mr:.3f} | mAP@50 {mt.map50:.3f} | mAP@50-95 {mt.map:.3f}\n")

    # ── 2. COCO baseline — IoU matching against the same GT ──
    print("== Old baseline (generic COCO yolov8n) on the SAME test split ==")
    base = YOLO(str(ROOT / "yolov8n.pt"))
    tp = {0: 0, 1: 0}
    fp = {0: 0, 1: 0}
    n_gt = {0: 0, 1: 0}
    imgs = sorted(TEST_IMG.glob("*"))
    for i, img_path in enumerate(imgs):
        img = cv2.imread(str(img_path))
        if img is None:
            continue
        h, w = img.shape[:2]
        gts = load_gt(img_path.stem, w, h)
        for c, _ in gts:
            n_gt[c] += 1

        res = base(img, imgsz=640, conf=0.25, verbose=False)
        preds = []
        for r in res:
            for b in r.boxes:
                cid = int(b.cls[0])
                if cid in COCO_MAP:
                    preds.append((COCO_MAP[cid], float(b.conf[0]), b.xyxy[0].tolist()))
        preds.sort(key=lambda x: -x[1])
        used = [False] * len(gts)
        for cls, _, box in preds:
            best_j, best_iou = -1, 0.5
            for j, (gc, gbox) in enumerate(gts):
                if used[j] or gc != cls:
                    continue
                v = iou(box, gbox)
                if v >= best_iou:
                    best_iou, best_j = v, j
            if best_j >= 0:
                used[best_j] = True
                tp[cls] += 1
            else:
                fp[cls] += 1
        if (i + 1) % 200 == 0:
            print(f"   ...{i + 1}/{len(imgs)}", flush=True)

    print()
    print(f"   {'class':10s} {'precision':>10s} {'recall':>8s}   (baseline)")
    for c in (0, 1):
        prec = tp[c] / (tp[c] + fp[c]) if (tp[c] + fp[c]) else 0.0
        rec = tp[c] / n_gt[c] if n_gt[c] else 0.0
        print(f"   {NAMES[c]:10s} {prec:10.3f} {rec:8.3f}   (gt={n_gt[c]})")

    print("\n== Per-class custom model (for the same classes) ==")
    names = cm.names
    for i, ap in zip(mt.ap_class_index, mt.maps[mt.ap_class_index]):
        print(f"   {names[int(i)]:10s} mAP@50-95 {ap:.3f}")


if __name__ == "__main__":
    main()
