"""
Driver Safety Model Service
Combines multiple models for comprehensive driver monitoring:
1. Drowsiness classification (yolo_drowsiness.pt) - Drowsy/Non-Drowsy
2. Object detection (yolov8n.pt) - Cell phone detection (COCO class 67)
"""
from typing import List, Dict, Any
from ultralytics import YOLO
from PIL import Image
import io
import torch

class DriverModel:
    def __init__(self):
        # Load drowsiness classification model
        try:
            self.drowsiness_model = YOLO("yolo_drowsiness.pt")
            print("✅ Drowsiness model loaded: yolo_drowsiness.pt")
        except Exception as e:
            print(f"⚠️ Drowsiness model not found: {e}")
            self.drowsiness_model = None
        
        # Load object detection model for phone/distractions
        try:
            self.object_model = YOLO("yolov8n.pt")
            print("✅ Object detection model loaded: yolov8n.pt")
        except Exception as e:
            print(f"⚠️ Object detection model not found: {e}")
            self.object_model = None
        
        # GPU Check
        if torch.cuda.is_available():
            self.device = 'cuda:0'
            print(f"🚀 Driver models using GPU: {torch.cuda.get_device_name(0)}")
        else:
            self.device = 'cpu'
            print("⚠️ Driver models using CPU (slower)")
        
        # COCO classes we care about for driver distraction
        # 67 = cell phone, 41 = cup (drinking)
        self.distraction_classes = {67: "cell_phone", 41: "cup"}
    
    def predict(self, image_bytes: bytes) -> Dict[str, Any]:
        """
        Analyze driver image for drowsiness and distractions.
        Returns combined analysis results.
        """
        image = Image.open(io.BytesIO(image_bytes))
        
        results = {
            "drowsiness": None,
            "drowsiness_confidence": 0.0,
            "distractions": [],
            "is_alert": True,
            "risk_level": "low",  # low, medium, high
            "detections": []
        }
        
        # 1. Drowsiness Classification
        if self.drowsiness_model:
            try:
                drows_results = self.drowsiness_model(image, device=self.device, verbose=False)
                if drows_results and len(drows_results) > 0:
                    probs = drows_results[0].probs
                    if probs is not None:
                        top_class = probs.top1
                        confidence = float(probs.top1conf)
                        class_name = self.drowsiness_model.names[top_class]
                        results["drowsiness"] = class_name
                        results["drowsiness_confidence"] = confidence
                        
                        if class_name.lower() == "drowsy" and confidence > 0.5:
                            results["is_alert"] = False
                            results["risk_level"] = "high" if confidence > 0.7 else "medium"
            except Exception as e:
                print(f"Drowsiness detection error: {e}")
        
        # 2. Object Detection (person, phone, cup)
        if self.object_model:
            try:
                obj_results = self.object_model(image, device=self.device, conf=0.3, verbose=False)
                for r in obj_results:
                    for box in r.boxes:
                        cls_id = int(box.cls[0].item())
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        conf = float(box.conf[0].item())
                        
                        # Person detection (class 0) - show drowsiness state
                        if cls_id == 0:  # person
                            # Label with drowsiness state
                            drowsy_label = results["drowsiness"] or "Analyzing..."
                            drowsy_conf = results["drowsiness_confidence"]
                            label = f"{drowsy_label} ({drowsy_conf*100:.0f}%)"
                            
                            # Color based on drowsiness
                            if results["drowsiness"] and results["drowsiness"].lower() == "drowsy":
                                label = f"⚠️ DROWSY ({drowsy_conf*100:.0f}%)"
                            
                            results["detections"].append({
                                "box": [x1, y1, x2, y2],
                                "confidence": conf,
                                "class_name": label,
                                "class_id": cls_id
                            })
                        
                        # Distraction detection (phone, cup)
                        elif cls_id in self.distraction_classes:
                            distraction_type = self.distraction_classes[cls_id]
                            
                            results["distractions"].append({
                                "type": distraction_type,
                                "confidence": conf
                            })
                            
                            results["detections"].append({
                                "box": [x1, y1, x2, y2],
                                "confidence": conf,
                                "class_name": f"📱 {distraction_type}",
                                "class_id": cls_id
                            })
                            
                            if distraction_type == "cell_phone":
                                results["risk_level"] = "high"
                                results["is_alert"] = False
            except Exception as e:
                print(f"Object detection error: {e}")
        
        # Calculate overall risk
        if results["risk_level"] == "low" and len(results["distractions"]) > 0:
            results["risk_level"] = "medium"
        
        print(f"DEBUG_DRIVER: Drowsy={results['drowsiness']} ({results['drowsiness_confidence']:.2f}), "
              f"Distractions={len(results['distractions'])}, Risk={results['risk_level']}", flush=True)
        
        return results


# Singleton instance
_driver_model_instance = None

def get_driver_model() -> DriverModel:
    global _driver_model_instance
    if _driver_model_instance is None:
        _driver_model_instance = DriverModel()
    return _driver_model_instance
