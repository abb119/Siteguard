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
import os

class YOLOModel:
    def __init__(self, model_path: str = "yolov8n.pt"):
        if HAS_YOLO:
            # Get project root directory (go up from app/services/ to project root)
            project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            
            # Try to load trained model first, then fallback to pretrained
            model_paths_to_try = [
                os.path.join(project_root, "siteguard_model/yolov8n_ppe/weights/best.pt"),  # Trained model
                model_path,  # Default pretrained model
            ]
            
            print(f"DEBUG: Project root = {project_root}")
            print(f"DEBUG: Looking for model at {model_paths_to_try[0]}")
            
            self.model = None
            for path in model_paths_to_try:
                try:
                    if os.path.exists(path):
                        print(f"Loading model from {path}")
                        self.model = YOLO(path)
                        
                        # Move to GPU if available
                        import torch
                        if torch.cuda.is_available():
                            print(f"Moving model to GPU: {torch.cuda.get_device_name(0)}")
                            self.model.to('cuda')
                        else:
                            print("Running on CPU")
                        break
                except Exception as e:
                    print(f"Failed to load model from {path}: {e}")
                    continue
            
            if self.model is None:
                print("Warning: Could not load any model, using mock")
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
            # Classes: 0: helmet, 1: no-helmet, 2: vest, 3: no-vest
            return [
                {
                    "box": [100.0, 100.0, 150.0, 150.0],
                    "confidence": 0.95,
                    "class_id": 1,
                    "class_name": "no-helmet"
                },
                {
                    "box": [100.0, 150.0, 200.0, 250.0],
                    "confidence": 0.90,
                    "class_id": 3,
                    "class_name": "no-vest"
                }
            ]
