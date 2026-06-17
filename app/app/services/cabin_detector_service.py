"""
Custom in-cabin detectors (your own trained models).

Two separate YOLO models replace the third-party pieces of the v2 driver
monitor, each trained from public datasets via dms_data/scripts/:

  cabin    model  classes phone / bottle / cup   -> distraction objects
  seatbelt model  classes belt_on / belt_off     -> seatbelt state True/False

Resolution order (first existing file wins):
  cabin    : $DMS_CABIN_MODEL_PATH, dms_data/weights/cabin.pt, dms_cabin.pt
  seatbelt : $DMS_SEATBELT_MODEL_PATH, dms_data/weights/seatbelt.pt, dms_seatbelt.pt

Backward compatible: an older combined dms_cabin.pt (phone/drinking, optionally
with seatbelt_on/off classes) still works — its drinking maps to cup and, if it
carries belt classes and no dedicated seatbelt model is present, it also drives
the seatbelt state.

The dedicated seatbelt weights are deliberately NOT named `seatbelt.pt`, so the
old third-party windshield model at the project root keeps serving as the
fallback used by routes.py / seatbelt_service. If a model file is missing, that
part stays disabled and the monitor falls back exactly as before.
"""
from __future__ import annotations

import os
from typing import Dict, List, Optional, Tuple

import torch
from ultralytics import YOLO

_CABIN_CANDIDATES = ["dms_data/weights/cabin.pt", "dms_cabin.pt", "ml/dms_cabin.pt"]
_SEATBELT_CANDIDATES = ["dms_data/weights/seatbelt.pt", "dms_seatbelt.pt"]

# our class name -> object type DmsSession already understands
_OBJECT_MAP = {
    "phone": "cell_phone",
    "cell_phone": "cell_phone",
    "bottle": "bottle",
    "cup": "cup",
    "drinking": "cup",          # legacy combined model
}
_BELT_ON = {"belt_on", "seatbelt_on", "seatbelt"}
_BELT_OFF = {"belt_off", "seatbelt_off", "no-seatbelt", "noseatbelt", "without_seat_belt"}


def _load_first(env_var: str, candidates: list[str]) -> Optional[YOLO]:
    env = os.getenv(env_var)
    for path in ([env] if env else []) + candidates:
        if path and os.path.exists(path):
            try:
                model = YOLO(path)
                print(f"✅ Loaded {env_var.split('_')[1].lower()} model: {path} "
                      f"| classes: {model.names}", flush=True)
                return model
            except Exception as exc:  # noqa: BLE001
                print(f"⚠️ Failed to load {path}: {exc}", flush=True)
    return None


class CabinDetector:
    def __init__(self) -> None:
        self.device = "cuda:0" if torch.cuda.is_available() else "cpu"
        self.cabin_model = _load_first("DMS_CABIN_MODEL_PATH", _CABIN_CANDIDATES)
        self.seatbelt_model = _load_first("DMS_SEATBELT_MODEL_PATH", _SEATBELT_CANDIDATES)
        if self.cabin_model is None:
            print("ℹ️ No custom cabin model — using COCO + seatbelt.pt fallback.", flush=True)

    @property
    def available(self) -> bool:
        return self.cabin_model is not None

    def _cabin_has_belt_classes(self) -> bool:
        if self.cabin_model is None:
            return False
        names = {str(n).lower() for n in self.cabin_model.names.values()}
        return bool(names & (_BELT_ON | _BELT_OFF))

    @property
    def has_seatbelt(self) -> bool:
        """True if a dedicated seatbelt model OR a legacy combined model can
        provide the belt state (so routes.py can drop the old seatbelt.pt)."""
        return self.seatbelt_model is not None or self._cabin_has_belt_classes()

    def detect(self, frame_bgr, conf: float = 0.4) -> Tuple[List[Dict], Optional[bool]]:
        """Returns (objects for DmsSession, seatbelt True/False/None)."""
        objects: List[Dict] = []
        belt_on = belt_off = False
        if self.cabin_model is None:
            return objects, None

        try:
            for r in self.cabin_model(frame_bgr, imgsz=416, conf=conf,
                                      verbose=False, device=self.device):
                for b in r.boxes:
                    name = str(r.names[int(b.cls[0].item())]).lower().strip()
                    if name in _OBJECT_MAP:
                        x1, y1, x2, y2 = b.xyxy[0].tolist()
                        objects.append({
                            "type": _OBJECT_MAP[name],
                            "box": [x1, y1, x2, y2],
                            "confidence": float(b.conf[0].item()),
                        })
                    elif name in _BELT_ON:           # legacy combined model
                        belt_on = True
                    elif name in _BELT_OFF:
                        belt_off = True
        except Exception:  # noqa: BLE001
            return objects, None

        # Dedicated seatbelt model wins: take the single most confident belt box.
        if self.seatbelt_model is not None:
            try:
                best_name, best_conf = None, 0.0
                for r in self.seatbelt_model(frame_bgr, imgsz=416, conf=conf,
                                             verbose=False, device=self.device):
                    for b in r.boxes:
                        name = str(r.names[int(b.cls[0].item())]).lower().strip()
                        c = float(b.conf[0].item())
                        if (name in _BELT_ON or name in _BELT_OFF) and c > best_conf:
                            best_name, best_conf = name, c
                if best_name is not None:
                    belt_on = best_name in _BELT_ON
                    belt_off = best_name in _BELT_OFF
            except Exception:  # noqa: BLE001
                pass

        seatbelt = False if belt_off else (True if belt_on else None)
        return objects, seatbelt


_inst: Optional[CabinDetector] = None


def get_cabin_detector() -> CabinDetector:
    global _inst
    if _inst is None:
        _inst = CabinDetector()
    return _inst
