"""
Latency benchmark for all SiteGuard models (CPU vs GPU).

Measures per-model inference latency (mean / p95) and throughput (FPS) at the
image sizes actually used by the app, on CPU and — if available — GPU.

Run:  python ml/benchmark.py
Output: prints a table and writes ml/benchmark_results.json
"""
from __future__ import annotations

import json
import os
import statistics
import time
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = ROOT / "bus.jpg"
N_WARMUP = 3
N_RUNS = 20

# (label, weights path relative to root, imgsz used in production)
YOLO_MODELS = [
    ("PPE (best.pt)", "siteguard_model/yolov8n_ppe/weights/best.pt", 640),
    ("PPE fallback (6cls)", "yolov8n_ppe_6classes.pt", 640),
    ("Objects yolov8n (phone)", "yolov8n.pt", 320),
    ("Drowsiness (classify)", "yolo_drowsiness.pt", 640),
    ("Pose (ergonomics)", "yolov8n-pose.pt", 640),
    ("Seatbelt", "seatbelt.pt", 320),
]


def _timeit(fn) -> dict:
    for _ in range(N_WARMUP):
        fn()
    samples = []
    for _ in range(N_RUNS):
        t0 = time.perf_counter()
        fn()
        samples.append((time.perf_counter() - t0) * 1000.0)
    samples.sort()
    mean = statistics.mean(samples)
    p95 = samples[int(0.95 * (len(samples) - 1))]
    return {"mean_ms": round(mean, 2), "p95_ms": round(p95, 2), "fps": round(1000.0 / mean, 1)}


def bench_yolo(devices, img) -> dict:
    from ultralytics import YOLO

    results = {}
    for label, rel, imgsz in YOLO_MODELS:
        path = ROOT / rel
        if not path.exists():
            print(f"  - skip {label}: not found ({rel})")
            continue
        results[label] = {"imgsz": imgsz}
        for dev in devices:
            try:
                model = YOLO(str(path))
                results[label][dev] = _timeit(
                    lambda: model(img, imgsz=imgsz, device=dev, verbose=False)
                )
            except Exception as exc:
                results[label][dev] = {"error": str(exc)[:80]}
    return results


def bench_mediapipe(img) -> dict:
    """DMS v2 core — FaceMesh runs CPU-only."""
    try:
        from mediapipe import solutions as mp
        mesh = mp.face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1, refine_landmarks=True)
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        res = {"cpu": _timeit(lambda: mesh.process(rgb))}
        mesh.close()
        return res
    except Exception as exc:
        return {"error": str(exc)[:80]}


def main():
    import torch

    has_gpu = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if has_gpu else None
    devices = ["cpu"] + (["cuda:0"] if has_gpu else [])

    img = cv2.imread(str(SAMPLE)) if SAMPLE.exists() else np.random.randint(0, 255, (480, 640, 3), np.uint8)

    print(f"Devices: {devices} | GPU: {gpu_name or 'none'} | runs={N_RUNS}\n")

    out = {
        "gpu": gpu_name,
        "torch": torch.__version__,
        "yolo": bench_yolo(devices, img),
        "mediapipe_facemesh": bench_mediapipe(img),
    }

    # Pretty table
    print(f"{'Model':28s} {'imgsz':>6s} {'CPU ms':>9s} {'CPU fps':>8s} {'GPU ms':>9s} {'GPU fps':>8s}")
    print("-" * 74)
    for label, data in out["yolo"].items():
        cpu = data.get("cpu", {})
        gpu = data.get("cuda:0", {})
        print(f"{label:28s} {data.get('imgsz',''):>6} "
              f"{cpu.get('mean_ms','-'):>9} {cpu.get('fps','-'):>8} "
              f"{gpu.get('mean_ms','-'):>9} {gpu.get('fps','-'):>8}")
    mp_cpu = out["mediapipe_facemesh"].get("cpu", {})
    print(f"{'MediaPipe FaceMesh (DMS)':28s} {'-':>6} {mp_cpu.get('mean_ms','-'):>9} {mp_cpu.get('fps','-'):>8} {'n/a':>9} {'n/a':>8}")

    (ROOT / "ml" / "benchmark_results.json").write_text(json.dumps(out, indent=2))
    print(f"\nSaved -> ml/benchmark_results.json")


if __name__ == "__main__":
    main()
