from __future__ import annotations

import threading
from typing import List, Optional
from ultralytics import YOLO


class GeneralObjectDetector:
    def __init__(self, model_path: str = "yolov8n.pt") -> None:
        self.model_path = model_path
        self._model = None
        self._lock = threading.Lock()

    def _ensure_model(self):
        if self._model is None:
            with self._lock:
                if self._model is None:
                    self._model = YOLO(self.model_path)

    def predict(self, frame, conf: float = 0.3, classes: Optional[List[int]] = None) -> List[dict]:
        self._ensure_model()
        results = self._model(frame, conf=conf, imgsz=640, verbose=False, classes=classes)
        detections = []
        for result in results:
            names = result.names
            for box in result.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                confidence = float(box.conf[0].item())
                class_id = int(box.cls[0].item())
                detections.append(
                    {
                        "class_id": class_id,
                        "class_name": names[class_id],
                        "confidence": confidence,
                        "box": [x1, y1, x2, y2],
                    }
                )
        return detections
