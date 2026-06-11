"""
Traffic-sign detector for the front road camera.

Loads the project's traffic_signs.pt (classes: Speed Limit 10..120, Red/Green
Light, Stop) and returns the current speed limit, traffic-light colour and stop
sign. Optional: if the weights file is missing, detection is disabled.
"""
from __future__ import annotations

import os
import re
from typing import Dict, Optional

import torch
from ultralytics import YOLO

_CANDIDATES = ["app/traffic_signs.pt", "traffic_signs.pt", "app/app/traffic_signs.pt"]


class TrafficSignDetector:
    def __init__(self) -> None:
        self.model = None
        self.device = "cpu"
        path = os.getenv("TRAFFIC_SIGN_MODEL_PATH")
        for p in ([path] if path else []) + _CANDIDATES:
            if p and os.path.exists(p):
                try:
                    self.model = YOLO(p)
                    self.device = "cuda:0" if torch.cuda.is_available() else "cpu"
                    print(f"✅ Traffic sign model loaded: {p}", flush=True)
                    break
                except Exception as exc:
                    print(f"⚠️ Failed to load traffic sign model {p}: {exc}", flush=True)
        if self.model is None:
            print("ℹ️ No traffic sign model — speed-limit/sign detection disabled.", flush=True)

    def detect(self, frame_bgr, conf: float = 0.45) -> Dict[str, Optional[object]]:
        out: Dict[str, Optional[object]] = {"speed_limit": None, "traffic_light": None, "stop": False}
        if self.model is None:
            return out
        try:
            results = self.model(frame_bgr, imgsz=416, conf=conf, verbose=False, device=self.device)
            best_area = 0.0
            for r in results:
                names = r.names
                for b in r.boxes:
                    name = str(names[int(b.cls[0].item())])
                    x1, y1, x2, y2 = b.xyxy[0].tolist()
                    area = (x2 - x1) * (y2 - y1)
                    low = name.lower()
                    if low.startswith("speed limit"):
                        m = re.search(r"(\d+)", name)
                        if m and area > best_area:  # keep the largest (nearest) limit sign
                            out["speed_limit"] = int(m.group(1))
                            best_area = area
                    elif name == "Red Light":
                        out["traffic_light"] = "red"
                    elif name == "Green Light":
                        if out["traffic_light"] != "red":
                            out["traffic_light"] = "green"
                    elif name == "Stop":
                        out["stop"] = True
        except Exception:
            return out
        return out


_inst: Optional[TrafficSignDetector] = None


def get_traffic_sign_detector() -> TrafficSignDetector:
    global _inst
    if _inst is None:
        _inst = TrafficSignDetector()
    return _inst
