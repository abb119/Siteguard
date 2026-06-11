"""
Road Safety Model Service
Handles front and rear camera analysis for safe driving features:
- Front: pedestrians, vehicles, traffic lights, cyclists
- Rear: approaching vehicles, distance estimation
Uses YOLOv8n pretrained on COCO (no additional training needed)
"""
from typing import List, Dict, Any, Tuple
from ultralytics import YOLO
from PIL import Image
import io
import torch
import numpy as np
import cv2


class RoadSafetyModel:
    # COCO classes relevant to road safety
    COCO_CLASSES = {
        0: "person",
        1: "bicycle",
        2: "car",
        3: "motorcycle",
        5: "bus",
        7: "truck",
        9: "traffic_light",
        11: "stop_sign",
    }
    
    # High priority classes (trigger immediate alerts)
    HIGH_PRIORITY = {"person", "bicycle", "motorcycle", "stop_sign"}
    
    def __init__(self):
        try:
            self.model = YOLO("yolov8n.pt")
            print("✅ Road Safety model loaded: yolov8n.pt (COCO)")
        except Exception as e:
            print(f"⚠️ Road Safety model not found: {e}")
            self.model = None
        
        # GPU Check
        if torch.cuda.is_available():
            self.device = 'cuda:0'
            print(f"🚀 Road Safety using GPU: {torch.cuda.get_device_name(0)}")
        else:
            self.device = 'cpu'
            print("⚠️ Road Safety using CPU (slower)")
        
        # For distance estimation (calibration values)
        # Approximate real widths in meters
        self.REAL_WIDTHS = {
            "car": 1.8,
            "truck": 2.5,
            "bus": 2.5,
            "motorcycle": 0.8,
            "bicycle": 0.5,
            "person": 0.5,
        }
        self.FOCAL_LENGTH = 800  # Approximate focal length in pixels (calibrated for 640px width)
        
        # For relative speed calculation (track previous distances)
        self.prev_rear_distance = None
        self.prev_front_distance = None
        self.frame_interval = 0.1  # Approximate time between frames (100ms at 10fps)
    
    def estimate_distance(self, class_name: str, bbox_width: float, frame_width: int = 640) -> float:
        """
        Estimate distance to object using apparent size.
        Formula: distance = (real_width * focal_length) / bbox_width
        Returns distance in meters.
        """
        real_width = self.REAL_WIDTHS.get(class_name, 1.5)  # Default 1.5m
        focal = self.FOCAL_LENGTH * (frame_width / 640)  # Scale focal length
        if bbox_width < 10:
            return 999  # Too small to measure
        distance = (real_width * focal) / bbox_width
        return round(distance, 1)
    
    def _traffic_light_color(self, img_rgb, box) -> str:
        """Classify a traffic light's state by color (HSV) — no extra model."""
        try:
            x1, y1, x2, y2 = [int(v) for v in box]
            crop = img_rgb[max(0, y1):y2, max(0, x1):x2]
            if crop.size == 0:
                return "detected"
            hsv = cv2.cvtColor(crop, cv2.COLOR_RGB2HSV)
            h, s, v = cv2.split(hsv)
            bright = (v > 120) & (s > 80)
            if int(bright.sum()) < 8:
                return "detected"
            hb = h[bright]
            red = int((((hb < 10) | (hb > 160))).sum())
            amber = int(((hb >= 15) & (hb < 35)).sum())
            green = int(((hb >= 40) & (hb < 90)).sum())
            m = max(red, amber, green)
            if m == 0:
                return "detected"
            return "red" if m == red else "amber" if m == amber else "green"
        except Exception:
            return "detected"

    def _lane_departure(self, img_rgb) -> Dict[str, Any]:
        """Estimate lane departure from road line slopes (Hough) in the lower ROI."""
        try:
            h, w = img_rgb.shape[:2]
            roi = img_rgb[int(h * 0.60):, :]
            gray = cv2.cvtColor(roi, cv2.COLOR_RGB2GRAY)
            edges = cv2.Canny(gray, 60, 150)
            lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=50,
                                    minLineLength=int(w * 0.15), maxLineGap=50)
            if lines is None:
                return {"departure": False, "side": None}
            left_x, right_x = [], []
            for ln in lines:
                x1, y1, x2, y2 = ln[0]
                if x2 == x1:
                    continue
                slope = (y2 - y1) / (x2 - x1)
                if abs(slope) < 0.4:
                    continue
                xb = x1 if y1 > y2 else x2  # x at the bottom of the segment
                if slope < 0 and xb < w * 0.55:
                    left_x.append(xb)
                elif slope > 0 and xb > w * 0.45:
                    right_x.append(xb)
            if not left_x or not right_x:
                return {"departure": False, "side": None}
            lane_center = (float(np.mean(left_x)) + float(np.mean(right_x))) / 2.0
            offset = (lane_center - w / 2.0) / w
            if offset > 0.12:
                return {"departure": True, "side": "left"}
            if offset < -0.12:
                return {"departure": True, "side": "right"}
            return {"departure": False, "side": None}
        except Exception:
            return {"departure": False, "side": None}

    def analyze_front_camera(self, image_bytes: bytes, frame_width: int = 640) -> Dict[str, Any]:
        """Analyze front camera: pedestrians, lead-vehicle FCW (TTC), traffic-light state."""
        image = Image.open(io.BytesIO(image_bytes))
        img_rgb = np.array(image.convert("RGB"))
        h_img, w_img = img_rgb.shape[:2]

        results: Dict[str, Any] = {
            "detections": [],
            "alerts": [],
            "risk_level": "low",
            "traffic_light": None,
            "pedestrians_count": 0,
            "vehicles_ahead": [],
            "lead_vehicle": None,
            "ttc": None,
            "lane": None,
        }

        if not self.model:
            return results

        lane = self._lane_departure(img_rgb)
        results["lane"] = lane
        if lane["departure"]:
            results["alerts"].append({
                "type": "LANE_DEPARTURE", "level": "warning",
                "message": f"Salida de carril ({'izq' if lane['side'] == 'left' else 'der'})",
            })
            if results["risk_level"] == "low":
                results["risk_level"] = "medium"

        try:
            yolo_results = self.model(image, device=self.device, verbose=False, conf=0.4)
            boxes = yolo_results[0].boxes if yolo_results else []
            lead: Tuple[float, str] | None = None  # (distance, type)

            for box in boxes:
                cls_id = int(box.cls[0])
                if cls_id not in self.COCO_CLASSES:
                    continue
                class_name = self.COCO_CLASSES[cls_id]
                conf = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                bbox_width = x2 - x1
                distance = self.estimate_distance(class_name, bbox_width, frame_width)
                cx = (x1 + x2) / 2.0

                detection = {"box": [x1, y1, x2, y2], "class_name": class_name,
                             "confidence": conf, "distance_m": distance}

                if class_name == "person":
                    results["pedestrians_count"] += 1
                    if distance < 15:
                        results["alerts"].append({
                            "type": "PEDESTRIAN",
                            "level": "danger" if distance < 8 else "warning",
                            "message": f"¡Peatón a {distance}m!", "distance": distance,
                        })
                        results["risk_level"] = "high"

                elif class_name == "traffic_light":
                    state = self._traffic_light_color(img_rgb, (x1, y1, x2, y2))
                    results["traffic_light"] = state
                    detection["state"] = state
                    if state == "red":
                        results["alerts"].append({"type": "TRAFFIC_LIGHT", "level": "danger",
                                                  "message": "🚦 Semáforo en ROJO"})
                        if results["risk_level"] == "low":
                            results["risk_level"] = "medium"

                elif class_name == "stop_sign":
                    results["alerts"].append({"type": "SIGN", "level": "warning",
                                              "message": "Señal de STOP", "distance": distance})

                elif class_name in ("car", "truck", "bus", "motorcycle"):
                    results["vehicles_ahead"].append({"type": class_name, "distance": distance})
                    # Lead vehicle = ahead, in the central lane, lower half of frame
                    in_lane = (0.3 * w_img < cx < 0.7 * w_img) and (y2 > 0.4 * h_img)
                    if in_lane and (lead is None or distance < lead[0]):
                        lead = (distance, class_name)

                elif class_name == "bicycle":
                    results["alerts"].append({"type": "CYCLIST", "level": "warning",
                                              "message": f"Ciclista a {distance}m", "distance": distance})

                results["detections"].append(detection)

            # ── Forward Collision Warning (lead vehicle, with TTC) ──
            if lead is not None:
                dist = lead[0]
                closing = None
                ttc = None
                if self.prev_front_distance is not None:
                    closing = (self.prev_front_distance - dist) / self.frame_interval  # m/s (+approaching)
                    if closing > 0.5:
                        ttc = round(dist / closing, 1)
                self.prev_front_distance = dist
                results["lead_vehicle"] = {
                    "type": lead[1], "distance": dist,
                    "closing_kmh": round((closing or 0) * 3.6, 0),
                    "ttc": ttc,
                }
                results["ttc"] = ttc

                if (ttc is not None and ttc < 2.0) or dist < 5:
                    results["alerts"].append({
                        "type": "FORWARD_COLLISION", "level": "danger",
                        "message": f"¡FRENA! Colisión en {ttc}s" if ttc else f"¡Vehículo a {dist}m!",
                        "distance": dist,
                    })
                    results["risk_level"] = "high"
                elif (ttc is not None and ttc < 4.0) or dist < 12:
                    results["alerts"].append({
                        "type": "TAILGATING", "level": "warning",
                        "message": f"Mantén distancia ({dist}m)", "distance": dist,
                    })
                    if results["risk_level"] == "low":
                        results["risk_level"] = "medium"
            else:
                self.prev_front_distance = None

        except Exception as e:
            print(f"Front camera analysis error: {e}")

        return results
    
    def analyze_rear_camera(self, image_bytes: bytes, frame_width: int = 640) -> Dict[str, Any]:
        """
        Analyze rear camera for approaching vehicles.
        Detects if overtaking is safe or dangerous.
        """
        image = Image.open(io.BytesIO(image_bytes))
        
        results = {
            "detections": [],
            "alerts": [],
            "risk_level": "low",
            "approaching_vehicles": [],
            "safe_to_maneuver": True,
            "closest_vehicle_distance": None,
        }
        
        if not self.model:
            return results
        
        try:
            yolo_results = self.model(image, device=self.device, verbose=False, conf=0.35)
            
            if yolo_results and len(yolo_results) > 0:
                boxes = yolo_results[0].boxes
                closest_distance = 999
                
                for box in boxes:
                    cls_id = int(box.cls[0])
                    if cls_id not in self.COCO_CLASSES:
                        continue
                    
                    class_name = self.COCO_CLASSES[cls_id]
                    
                    # Only care about vehicles in rear camera
                    if class_name not in ["car", "truck", "bus", "motorcycle"]:
                        continue
                    
                    conf = float(box.conf[0])
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    bbox_width = x2 - x1
                    
                    distance = self.estimate_distance(class_name, bbox_width, frame_width)
                    
                    detection = {
                        "box": [x1, y1, x2, y2],
                        "class_name": class_name,
                        "confidence": conf,
                        "distance_m": distance,
                    }
                    results["detections"].append(detection)
                    
                    results["approaching_vehicles"].append({
                        "type": class_name,
                        "distance": distance,
                    })
                    
                    if distance < closest_distance:
                        closest_distance = distance
                
                results["closest_vehicle_distance"] = closest_distance if closest_distance < 999 else None
                
                # Calculate approach speed (m/s) based on distance change
                approach_speed_ms = 0.0
                approach_status = "stable"
                if self.prev_rear_distance is not None and closest_distance < 999:
                    distance_change = self.prev_rear_distance - closest_distance  # Positive = approaching
                    approach_speed_ms = distance_change / self.frame_interval
                    
                    if approach_speed_ms > 5:  # > 18 km/h approach
                        approach_status = "approaching_fast"
                    elif approach_speed_ms > 1:  # > 3.6 km/h approach
                        approach_status = "approaching_slow"
                    elif approach_speed_ms < -1:  # Moving away
                        approach_status = "moving_away"
                    else:
                        approach_status = "stable"
                
                self.prev_rear_distance = closest_distance if closest_distance < 999 else None
                
                results["approach_speed_ms"] = round(approach_speed_ms, 1)
                results["approach_speed_kmh"] = round(approach_speed_ms * 3.6, 0)
                results["approach_status"] = approach_status
                
                # Determine if maneuver is safe
                if closest_distance < 10 or approach_status == "approaching_fast":
                    results["safe_to_maneuver"] = False
                    results["risk_level"] = "high"
                    speed_text = f" ({int(results['approach_speed_kmh'])} km/h)" if approach_speed_ms > 1 else ""
                    results["alerts"].append({
                        "type": "APPROACHING_VEHICLE",
                        "level": "danger",
                        "message": f"¡Vehículo a {closest_distance}m{speed_text}! No adelantar",
                        "distance": closest_distance,
                    })
                elif closest_distance < 20:
                    results["safe_to_maneuver"] = False
                    results["risk_level"] = "medium"
                    results["alerts"].append({
                        "type": "APPROACHING_VEHICLE",
                        "level": "warning",
                        "message": f"Vehículo aproximándose ({closest_distance}m)",
                        "distance": closest_distance,
                    })
                else:
                    results["safe_to_maneuver"] = True
                    if len(results["approaching_vehicles"]) > 0:
                        results["alerts"].append({
                            "type": "INFO",
                            "level": "info",
                            "message": "Maniobra segura",
                        })
        
        except Exception as e:
            print(f"Rear camera analysis error: {e}")
        
        return results


# Singleton instance
_road_safety_model = None

def get_road_safety_model() -> RoadSafetyModel:
    global _road_safety_model
    if _road_safety_model is None:
        _road_safety_model = RoadSafetyModel()
    return _road_safety_model
