"""
Export a trained detector for deployment.

    python dms_data/scripts/export.py cabin --format onnx
    python dms_data/scripts/export.py seatbelt --format engine --half   # TensorRT GPU
    python dms_data/scripts/export.py cabin --format openvino           # CPU

The runtime (cabin_detector_service) loads the PyTorch .pt directly, so export
is optional speed tuning: ONNX/OpenVINO for CPU deploys, TensorRT (engine) +
--half for the RTX GPU.
"""
from __future__ import annotations

import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("model", choices=["cabin", "seatbelt"])
    ap.add_argument("--weights", default=None)
    ap.add_argument("--format", default="onnx",
                    choices=["onnx", "openvino", "engine", "torchscript"])
    ap.add_argument("--half", action="store_true")
    ap.add_argument("--imgsz", type=int, default=640)
    args = ap.parse_args()

    from ultralytics import YOLO

    weights = Path(args.weights) if args.weights else ROOT / "weights" / f"{args.model}.pt"
    if not weights.exists():
        raise SystemExit(f"missing weights {weights}")

    model = YOLO(str(weights))
    out = model.export(
        format=args.format,
        half=args.half,
        imgsz=args.imgsz,
        device="0" if args.format == "engine" else "cpu",
    )
    print(f"[{args.model}] exported {args.format} -> {out}")


if __name__ == "__main__":
    main()
