from __future__ import annotations

from typing import List

from app.services.object_detector import GeneralObjectDetector

VEHICLE_CLASSES = {"car", "truck", "bus", "motorbike", "bicycle"}
SIGN_CLASSES = {"stop sign", "traffic light"}


class RoadObjectDetector:
    def __init__(self) -> None:
        self._detector = GeneralObjectDetector(model_path="yolov8n.pt")

    def detect(self, frame) -> List[dict]:
        detections = self._detector.predict(frame, conf=0.35)
        return detections
