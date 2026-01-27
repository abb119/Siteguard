"""
Vehicle Control Model Service
Detects proximity between workers and industrial vehicles (forklifts, etc.)
Uses YOLOv8 to detect people and vehicles, then calculates distances.
"""
from typing import Dict, Any, List, Tuple
from ultralytics import YOLO
from PIL import Image
import io
import torch
import math


class VehicleControlModel:
    # Industrial vehicle classes we care about
    # COCO classes that are relevant
    VEHICLE_CLASSES = {
        2: "car",      # Can be small utility vehicle
        3: "motorcycle",
        5: "bus",      # Large vehicle
        7: "truck",    # Forklift-like
    }
    
    # Custom mapping for industrial context
    INDUSTRIAL_NAMES = {
        "car": "Vehículo",
        "motorcycle": "Moto",
        "bus": "Transporte",
        "truck": "Carretilla/Camión",
    }
    
    # Safe distance thresholds (in pixels, calibrated for 640px width)
    DANGER_DISTANCE = 80   # Very close - immediate danger
    WARNING_DISTANCE = 150  # Getting close - caution
    
    def __init__(self):
        try:
            self.model = YOLO("yolov8n.pt")
            print("✅ Vehicle Control model loaded: yolov8n.pt")
        except Exception as e:
            print(f"⚠️ Vehicle Control model not found: {e}")
            self.model = None
        
        if torch.cuda.is_available():
            self.device = 'cuda:0'
            print(f"🚀 Vehicle Control using GPU: {torch.cuda.get_device_name(0)}")
        else:
            self.device = 'cpu'
            print("⚠️ Vehicle Control using CPU")
    
    def _get_box_center(self, box: List[float]) -> Tuple[float, float]:
        """Get center point of bounding box."""
        x1, y1, x2, y2 = box
        return ((x1 + x2) / 2, (y1 + y2) / 2)
    
    def _calculate_distance(self, p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
        """Calculate Euclidean distance between two points."""
        return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)
    
    def _boxes_overlap(self, box1: List[float], box2: List[float]) -> bool:
        """Check if two bounding boxes overlap."""
        x1_1, y1_1, x2_1, y2_1 = box1
        x1_2, y1_2, x2_2, y2_2 = box2
        
        return not (x2_1 < x1_2 or x2_2 < x1_1 or y2_1 < y1_2 or y2_2 < y1_1)
    
    def analyze_frame(self, image_bytes: bytes, frame_width: int = 640) -> Dict[str, Any]:
        """Analyze frame for person-vehicle proximity."""
        image = Image.open(io.BytesIO(image_bytes))
        
        results = {
            "detections": [],
            "people": [],
            "vehicles": [],
            "proximity_alerts": [],
            "people_count": 0,
            "vehicles_count": 0,
            "closest_distance": None,
            "risk_level": "low",
        }
        
        if not self.model:
            return results
        
        try:
            yolo_results = self.model(image, device=self.device, verbose=False, conf=0.4)
            
            if yolo_results and len(yolo_results) > 0:
                boxes = yolo_results[0].boxes
                
                people = []
                vehicles = []
                
                for box in boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    coords = box.xyxy[0].tolist()
                    
                    # Person detection
                    if cls_id == 0:  # person
                        people.append({
                            "box": coords,
                            "confidence": conf,
                            "type": "person",
                        })
                        results["detections"].append({
                            "box": coords,
                            "class_name": "person",
                            "confidence": conf,
                        })
                    
                    # Vehicle detection
                    elif cls_id in self.VEHICLE_CLASSES:
                        vehicle_type = self.VEHICLE_CLASSES[cls_id]
                        vehicles.append({
                            "box": coords,
                            "confidence": conf,
                            "type": vehicle_type,
                            "display_name": self.INDUSTRIAL_NAMES.get(vehicle_type, vehicle_type),
                        })
                        results["detections"].append({
                            "box": coords,
                            "class_name": vehicle_type,
                            "confidence": conf,
                        })
                
                results["people"] = people
                results["vehicles"] = vehicles
                results["people_count"] = len(people)
                results["vehicles_count"] = len(vehicles)
                
                # Check proximity between each person and vehicle
                min_distance = float('inf')
                
                for person in people:
                    person_center = self._get_box_center(person["box"])
                    
                    for vehicle in vehicles:
                        vehicle_center = self._get_box_center(vehicle["box"])
                        
                        # Check for overlap first
                        if self._boxes_overlap(person["box"], vehicle["box"]):
                            results["proximity_alerts"].append({
                                "type": "COLLISION",
                                "level": "danger",
                                "message": f"⚠️ ¡Trabajador en zona de {vehicle['display_name']}!",
                                "vehicle_type": vehicle["type"],
                                "distance_px": 0,
                            })
                            results["risk_level"] = "high"
                            min_distance = 0
                            continue
                        
                        distance = self._calculate_distance(person_center, vehicle_center)
                        
                        if distance < min_distance:
                            min_distance = distance
                        
                        # Scale distance threshold based on frame width
                        scale = frame_width / 640
                        danger_dist = self.DANGER_DISTANCE * scale
                        warning_dist = self.WARNING_DISTANCE * scale
                        
                        if distance < danger_dist:
                            results["proximity_alerts"].append({
                                "type": "PROXIMITY_DANGER",
                                "level": "danger",
                                "message": f"🚨 ¡Muy cerca de {vehicle['display_name']}!",
                                "vehicle_type": vehicle["type"],
                                "distance_px": round(distance),
                            })
                            results["risk_level"] = "high"
                        elif distance < warning_dist:
                            # Only add warning if no danger already
                            if results["risk_level"] != "high":
                                results["proximity_alerts"].append({
                                    "type": "PROXIMITY_WARNING",
                                    "level": "warning",
                                    "message": f"⚡ Cerca de {vehicle['display_name']} - Mantener distancia",
                                    "vehicle_type": vehicle["type"],
                                    "distance_px": round(distance),
                                })
                                results["risk_level"] = "medium"
                
                if min_distance < float('inf'):
                    results["closest_distance"] = round(min_distance)
        
        except Exception as e:
            print(f"Vehicle control analysis error: {e}")
        
        return results


# Singleton
_vehicle_control_model = None

def get_vehicle_control_model() -> VehicleControlModel:
    global _vehicle_control_model
    if _vehicle_control_model is None:
        _vehicle_control_model = VehicleControlModel()
    return _vehicle_control_model
