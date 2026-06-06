"""
Optional seatbelt detector.

Loads a dedicated YOLO seatbelt model **if a weights file is present**. If none
is found, detect() returns None (unknown) so the DMS simply omits seatbelt
alerts instead of failing — nothing else changes until you drop in a model.

To enable: place a trained model in the project root named `seatbelt.pt`
(or set SEATBELT_MODEL_PATH). Works with the common 2-class datasets
(seatbelt / no_seatbelt) — class names are matched case-insensitively.
"""
from __future__ import annotations

import os
from typing import Optional

import torch
from ultralytics import YOLO

_CANDIDATES = ["seatbelt.pt", "yolov8_seatbelt.pt", "seatbelt_yolov8.pt", "best_seatbelt.pt"]
_WORN = {"seatbelt", "belt", "seat_belt", "seatbelt_on", "with_seatbelt", "buckled", "wearing_seatbelt"}
_ABSENT = {
    "no_seatbelt", "no-seatbelt", "no_belt", "without_seatbelt", "unbuckled",
    "noseatbelt", "no seatbelt", "without seatbelt", "nobelt",
}


class SeatbeltDetector:
    def __init__(self) -> None:
        self.model = None
        self.device = "cpu"
        candidates = []
        env_path = os.getenv("SEATBELT_MODEL_PATH")
        if env_path:
            candidates.append(env_path)
        candidates += _CANDIDATES

        for path in candidates:
            if path and os.path.exists(path):
                try:
                    self.model = YOLO(path)
                    self.device = "cuda:0" if torch.cuda.is_available() else "cpu"
                    print(f"✅ Seatbelt model loaded: {path}", flush=True)
                    break
                except Exception as exc:
                    print(f"⚠️ Failed to load seatbelt model {path}: {exc}", flush=True)

        if self.model is None:
            print(
                "ℹ️ No seatbelt model found — seatbelt detection disabled. "
                "Place 'seatbelt.pt' in the project root to enable.",
                flush=True,
            )

    def detect(self, frame_bgr, conf: float = 0.4) -> Optional[bool]:
        """True = belt worn, False = belt absent, None = unknown/disabled."""
        if self.model is None:
            return None
        try:
            results = self.model(frame_bgr, imgsz=320, conf=conf, verbose=False, device=self.device)
            worn = False
            absent = False
            for r in results:
                names = r.names
                for box in r.boxes:
                    name = str(names[int(box.cls[0].item())]).lower().strip()
                    # Robust matching across datasets (e.g. "Without_Seat_Belt",
                    # "no_seatbelt", "Seat_Belt", "belt"). Check absence first.
                    if "without" in name or name.startswith("no") or "unbuckl" in name or name in _ABSENT:
                        absent = True
                    elif "belt" in name or "buckl" in name or "seat" in name or name in _WORN:
                        worn = True
            if absent:
                return False
            if worn:
                return True
            return None
        except Exception:
            return None


_instance: Optional[SeatbeltDetector] = None


def get_seatbelt_detector() -> SeatbeltDetector:
    global _instance
    if _instance is None:
        _instance = SeatbeltDetector()
    return _instance
