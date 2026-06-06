"""
Quantitative evaluation of the PPE detector.

Runs Ultralytics validation on a labelled test split and reports
precision / recall / mAP@50 / mAP@50-95 (overall and per class). Ultralytics
also writes a confusion matrix and PR curve PNGs into the run directory.

Requires a labelled dataset matching the model's classes. The deployed
`best.pt` is the 11-class "Construction Site Safety" model, so use
`ml/data_ppe.yaml` (download the dataset first — see that file's header).

Run:
    python ml/evaluate.py                                  # defaults below
    python ml/evaluate.py --model yolov8n_ppe_6classes.pt --data ml/data_6cls.yaml
"""
from __future__ import annotations

import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="siteguard_model/yolov8n_ppe/weights/best.pt")
    ap.add_argument("--data", default="ml/data_ppe.yaml")
    ap.add_argument("--split", default="test", choices=["test", "val"])
    ap.add_argument("--imgsz", type=int, default=640)
    args = ap.parse_args()

    model_path = ROOT / args.model
    data_path = ROOT / args.data
    if not model_path.exists():
        raise SystemExit(f"Model not found: {model_path}")
    if not data_path.exists():
        raise SystemExit(f"Data config not found: {data_path}")

    from ultralytics import YOLO

    model = YOLO(str(model_path))
    print(f"Evaluating {args.model} on split='{args.split}' ...\n")
    try:
        metrics = model.val(data=str(data_path), split=args.split, imgsz=args.imgsz, verbose=True)
    except Exception as exc:
        raise SystemExit(
            f"\nValidation failed: {exc}\n"
            "Likely the dataset isn't downloaded. Set ROBOFLOW_API_KEY and run "
            "`python ml/download_dataset.py`, or point --data to a local dataset "
            "whose classes match the model."
        )

    b = metrics.box
    print("\n================ RESULTS (overall) ================")
    print(f"Precision (mP):   {b.mp:.4f}")
    print(f"Recall (mR):      {b.mr:.4f}")
    print(f"mAP@50:           {b.map50:.4f}")
    print(f"mAP@50-95:        {b.map:.4f}")

    print("\n================ Per-class mAP@50-95 ===============")
    names = model.names
    for i, ap in zip(b.ap_class_index, b.maps[b.ap_class_index] if hasattr(b, "maps") else []):
        print(f"  {names.get(int(i), i):20s} {ap:.4f}")

    print(f"\nConfusion matrix + PR curve saved in: {metrics.save_dir}")
    print("  -> confusion_matrix.png, PR_curve.png, results.png")


if __name__ == "__main__":
    main()
