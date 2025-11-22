try:
    from ultralytics import YOLO
    from PIL import Image
    import io
    HAS_YOLO = True
except (ImportError, OSError):
    HAS_YOLO = False
    print("Warning: ultralytics/torch not found or failed to load. Using MockYOLOModel.")

from typing import List, Dict, Any
import random

class YOLOModel:
    def __init__(self, model_path: str = "yolov8n.pt"):
        if HAS_YOLO:
            self.model = YOLO(model_path)
        else:
            self.model = None

    def predict(self, image_bytes: bytes) -> List[Dict[str, Any]]:
        if HAS_YOLO and self.model:
            image = Image.open(io.BytesIO(image_bytes))
            results = self.model(image)
            
            detections = []
            for result in results:
                boxes = result.boxes
                for box in boxes:
                    # Get box coordinates
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    confidence = box.conf[0].item()
                    class_id = int(box.cls[0].item())
                    class_name = result.names[class_id]
                    
                    detections.append({
                        "box": [x1, y1, x2, y2],
                        "confidence": confidence,
                        "class_id": class_id,
                        "class_name": class_name
                    })
            return detections
        else:
            # Mock response for testing/verification when YOLO is not available
            return [
                {
                    "box": [100.0, 100.0, 200.0, 200.0],
                    "confidence": 0.95,
                    "class_id": 0,
                    "class_name": "person"
                },
                {
                    "box": [50.0, 50.0, 100.0, 100.0],
                    "confidence": 0.88,
                    "class_id": 1,
                    "class_name": "helmet"
                }
            ]
