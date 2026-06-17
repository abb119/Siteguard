"""
Train one of the two DMS detectors with Ultralytics.

    python dms_data/scripts/train.py cabin
    python dms_data/scripts/train.py seatbelt
    python dms_data/scripts/train.py cabin --base yolo11s.pt --epochs 80

Defaults follow the project spec: YOLO26s @ 640, 120 epochs, patience 25,
AutoBatch, AMP, disk cache, GPU 0.  The seatbelt run disables horizontal flip
(fliplr=0) because the belt's diagonal direction is class-relevant.

After training it strips the optimizer from best.pt and copies a lightweight
deployable to dms_data/weights/<model>.pt.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # dms_data/
RUNS = ROOT / "runs"
WEIGHTS = ROOT / "weights"


def resolve_base(requested: str) -> str:
    """Use the requested base, falling back to YOLO11s if YOLO26 is unavailable."""
    from ultralytics import YOLO
    for cand in (requested, "yolo11s.pt", "yolov8s.pt"):
        try:
            YOLO(cand)
            if cand != requested:
                print(f"[warn] '{requested}' unavailable, using '{cand}'")
            return cand
        except Exception as e:  # noqa: BLE001
            print(f"[warn] base '{cand}' failed to load: {str(e)[:80]}")
    raise SystemExit("no usable base weights")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("model", choices=["cabin", "seatbelt"])
    ap.add_argument("--base", default="yolo26s.pt")
    ap.add_argument("--epochs", type=int, default=120)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--patience", type=int, default=25)
    ap.add_argument("--device", default="0")
    ap.add_argument("--batch", type=int, default=-1)      # AutoBatch
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    from ultralytics import YOLO
    from ultralytics.utils.torch_utils import strip_optimizer

    data = ROOT / args.model / "data.yaml"
    if not data.exists():
        raise SystemExit(f"missing {data} — run merge_split.py {args.model} first")

    base = resolve_base(args.base)
    model = YOLO(base)
    print(f"[{args.model}] training {base} on {data}")

    model.train(
        data=str(data),
        epochs=args.epochs,
        imgsz=args.imgsz,
        patience=args.patience,
        device=args.device,
        batch=args.batch,
        amp=True,
        cache="disk",
        workers=args.workers,
        project=str(RUNS),
        name=args.model,
        exist_ok=True,
        # seatbelt: the diagonal belt direction is class-relevant -> no h-flip
        fliplr=0.0 if args.model == "seatbelt" else 0.5,
    )

    best = RUNS / args.model / "weights" / "best.pt"
    if best.exists():
        WEIGHTS.mkdir(parents=True, exist_ok=True)
        out = WEIGHTS / f"{args.model}.pt"
        shutil.copy(best, out)
        strip_optimizer(str(out))
        print(f"[{args.model}] deployable weights -> {out}")


if __name__ == "__main__":
    main()
