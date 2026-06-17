"""
Evaluate a trained detector on its held-out TEST split.

    python dms_data/scripts/evaluate.py cabin
    python dms_data/scripts/evaluate.py seatbelt --weights dms_data/weights/seatbelt.pt

Reports global + per-class Precision / Recall / mAP50 / mAP50-95, writes the
confusion matrix and PR curve under dms_data/runs/<model>_eval/, and checks the
acceptance bar (mAP50 >= --min-map per class).
"""
from __future__ import annotations

import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / "runs"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("model", choices=["cabin", "seatbelt"])
    ap.add_argument("--weights", default=None)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--min-map", type=float, default=0.60)
    args = ap.parse_args()

    from ultralytics import YOLO

    weights = Path(args.weights) if args.weights else ROOT / "weights" / f"{args.model}.pt"
    data = ROOT / args.model / "data.yaml"
    if not weights.exists():
        raise SystemExit(f"missing weights {weights}")

    model = YOLO(str(weights))
    m = model.val(data=str(data), split="test", imgsz=args.imgsz,
                  project=str(RUNS), name=f"{args.model}_eval", exist_ok=True, plots=True)
    box = m.box
    names = model.names

    print(f"\n== {args.model} test metrics ==")
    print(f"  Precision {box.mp:.3f} | Recall {box.mr:.3f} | "
          f"mAP50 {box.map50:.3f} | mAP50-95 {box.map:.3f}\n")
    print(f"  {'class':10s} {'P':>6s} {'R':>6s} {'mAP50':>7s} {'mAP50-95':>9s}")
    ok = True
    for i, ci in enumerate(box.ap_class_index):
        p, r, ap50, ap = box.p[i], box.r[i], box.ap50[i], box.ap[i]
        flag = "" if ap50 >= args.min_map else "  <-- below bar"
        if ap50 < args.min_map:
            ok = False
        print(f"  {names[int(ci)]:10s} {p:6.3f} {r:6.3f} {ap50:7.3f} {ap:9.3f}{flag}")

    print(f"\n  acceptance (mAP50>={args.min_map} per class): {'PASS' if ok else 'REVIEW'}")
    print(f"  plots -> {RUNS / (args.model + '_eval')}")


if __name__ == "__main__":
    main()
