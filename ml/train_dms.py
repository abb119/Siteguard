"""
Train the custom in-cabin DMS detector (phone / drinking / seatbelt_on /
seatbelt_off) via transfer learning from yolov8n, then install it for the app.

Run:   python ml/train_dms.py            (defaults: 100 epochs, imgsz 640)
       python ml/train_dms.py --epochs 50 --no-install

After installing, the backend picks up dms_cabin.pt automatically on restart
(see app/app/services/cabin_detector_service.py) and replaces the generic
COCO + seatbelt.pt detectors in the v2 driver monitor.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "datasets" / "dms_cabin" / "data.yaml"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=100)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--model", default="yolov8n.pt", help="base weights for transfer learning")
    ap.add_argument("--no-install", action="store_true", help="don't copy best.pt to project root")
    args = ap.parse_args()

    if not DATA.exists():
        raise SystemExit(f"{DATA} not found — run ml/build_dms_dataset.py first.")

    import torch
    from ultralytics import YOLO

    device = 0 if torch.cuda.is_available() else "cpu"
    print(f"Training on device={device} | data={DATA}")

    model = YOLO(str(ROOT / args.model) if (ROOT / args.model).exists() else args.model)
    results = model.train(
        data=str(DATA),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=device,
        name="dms_cabin",
        exist_ok=True,
        patience=25,
    )

    best = Path(results.save_dir) / "weights" / "best.pt"
    print(f"\nBest weights: {best}")

    # Evaluate on the held-out test split
    print("\n== Test-split evaluation ==")
    metrics = YOLO(str(best)).val(data=str(DATA), split="test", imgsz=args.imgsz)
    b = metrics.box
    print(f"Precision {b.mp:.3f} | Recall {b.mr:.3f} | mAP@50 {b.map50:.3f} | mAP@50-95 {b.map:.3f}")

    if not args.no_install:
        dest = ROOT / "dms_cabin.pt"
        shutil.copy2(best, dest)
        print(f"\nInstalled -> {dest}")
        print("Restart the backend: the v2 monitor will now use YOUR model.")


if __name__ == "__main__":
    main()
