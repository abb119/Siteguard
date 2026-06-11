"""
Custom in-cabin detector (your own trained model).

Loads `dms_cabin.pt` (project root, or DMS_CABIN_MODEL_PATH) — the model
trained with ml/train_dms.py on your own dataset. One inference replaces BOTH
third-party pieces of the v2 driver monitor:

  classes phone / drinking      -> distraction objects (mapped to the same
                                   cell_phone / cup types DmsSession expects)
  classes seatbelt_on / _off    -> seatbelt state (True / False / None)

If the weights file is missing the detector stays disabled and the monitor
falls back to the generic COCO model + seatbelt.pt, exactly as before.
"""
from __future__ import annotations

import os
from typing import Dict, List, Optional, Tuple

import torch
from ultralytics import YOLO

_CANDIDATES = ["dms_cabin.pt", "ml/dms_cabin.pt"]

# our class name -> object type DmsSession already understands
_OBJECT_MAP = {"phone": "cell_phone", "drinking": "cup"}


class CabinDetector:
    def __init__(self) -> None:
        self.model = None
        self.device = "cpu"
        env = os.getenv("DMS_CABIN_MODEL_PATH")
        for path in ([env] if env else []) + _CANDIDATES:
            if path and os.path.exists(path):
                try:
                    self.model = YOLO(path)
                    self.device = "cuda:0" if torch.cuda.is_available() else "cpu"
                    print(f"✅ Custom cabin model loaded: {path} | classes: {self.model.names}", flush=True)
                    break
                except Exception as exc:
                    print(f"⚠️ Failed to load cabin model {path}: {exc}", flush=True)
        if self.model is None:
            print("ℹ️ No custom cabin model (dms_cabin.pt) — using COCO + seatbelt.pt fallback.", flush=True)

    @property
    def available(self) -> bool:
        return self.model is not None

    def detect(self, frame_bgr, conf: float = 0.4) -> Tuple[List[Dict], Optional[bool]]:
        """Returns (objects for DmsSession, seatbelt True/False/None)."""
        objects: List[Dict] = []
        belt_on = False
        belt_off = False
        if self.model is None:
            return objects, None
        try:
            results = self.model(frame_bgr, imgsz=416, conf=conf, verbose=False, device=self.device)
            for r in results:
                names = r.names
                for b in r.boxes:
                    name = str(names[int(b.cls[0].item())]).lower().strip()
                    x1, y1, x2, y2 = b.xyxy[0].tolist()
                    if name in _OBJECT_MAP:
                        objects.append({
                            "type": _OBJECT_MAP[name],
                            "box": [x1, y1, x2, y2],
                            "confidence": float(b.conf[0].item()),
                        })
                    elif name == "seatbelt_on":
                        belt_on = True
                    elif name == "seatbelt_off":
                        belt_off = True
        except Exception:
            return objects, None
        seatbelt = False if belt_off else True if belt_on else None
        return objects, seatbelt


_inst: Optional[CabinDetector] = None


def get_cabin_detector() -> CabinDetector:
    global _inst
    if _inst is None:
        _inst = CabinDetector()
    return _inst
