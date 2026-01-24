from __future__ import annotations

from typing import Tuple
from app.services.object_detector import GeneralObjectDetector

PHONE_CLASS_NAMES = {"cell phone", "cellphone", "mobile phone"}

class PhoneUsageDetector:
    def __init__(self) -> None:
        self._detector = GeneralObjectDetector(model_path="yolov8n.pt")

    def detect(self, frame, face_box: Tuple[int, int, int, int] | None) -> bool:
        detections = self._detector.predict(frame, conf=0.35)
        if not detections:
            return False

        if face_box is None:
            return any(det["class_name"] in PHONE_CLASS_NAMES for det in detections)

        fx1, fy1, fx2, fy2 = face_box
        face_area = max(1.0, (fx2 - fx1) * (fy2 - fy1))

        for det in detections:
            if det["class_name"] not in PHONE_CLASS_NAMES:
                continue
            x1, y1, x2, y2 = det["box"]
            overlap = _intersection_area((x1, y1, x2, y2), (fx1, fy1, fx2, fy2))
            if overlap / face_area > 0.05:
                return True
        return False


def _intersection_area(a, b) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    x_left = max(ax1, bx1)
    y_top = max(ay1, by1)
    x_right = min(ax2, bx2)
    y_bottom = min(ay2, by2)
    if x_right < x_left or y_bottom < y_top:
        return 0.0
    return max(0.0, (x_right - x_left)) * max(0.0, (y_bottom - y_top))
