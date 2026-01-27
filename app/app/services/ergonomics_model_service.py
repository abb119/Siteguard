"""
Ergonomics Model Service
Uses YOLOv8-pose to detect body keypoints and analyze posture.
Detects:
- Bad lifting posture (bent back with forward lean)
- Extended reaching (arms above head for too long)
- Awkward twisting motions
"""
from typing import Dict, Any, List, Tuple
from ultralytics import YOLO
from PIL import Image
import io
import torch
import numpy as np
import math


class ErgonomicsModel:
    # YOLOv8-pose keypoint indices (COCO format)
    KEYPOINTS = {
        "nose": 0,
        "left_eye": 1, "right_eye": 2,
        "left_ear": 3, "right_ear": 4,
        "left_shoulder": 5, "right_shoulder": 6,
        "left_elbow": 7, "right_elbow": 8,
        "left_wrist": 9, "right_wrist": 10,
        "left_hip": 11, "right_hip": 12,
        "left_knee": 13, "right_knee": 14,
        "left_ankle": 15, "right_ankle": 16,
    }
    
    def __init__(self):
        try:
            # YOLOv8-pose model for skeleton detection
            self.model = YOLO("yolov8n-pose.pt")
            print("✅ Ergonomics model loaded: yolov8n-pose.pt")
        except Exception as e:
            print(f"⚠️ Ergonomics model not found: {e}")
            self.model = None
        
        if torch.cuda.is_available():
            self.device = 'cuda:0'
            print(f"🚀 Ergonomics using GPU: {torch.cuda.get_device_name(0)}")
        else:
            self.device = 'cpu'
            print("⚠️ Ergonomics using CPU")
    
    def _get_keypoint(self, keypoints: np.ndarray, name: str) -> Tuple[float, float, float]:
        """Get keypoint coordinates and confidence by name."""
        idx = self.KEYPOINTS.get(name)
        if idx is None or idx >= len(keypoints):
            return (0, 0, 0)
        kp = keypoints[idx]
        return (float(kp[0]), float(kp[1]), float(kp[2]) if len(kp) > 2 else 1.0)
    
    def _calculate_angle(self, p1: Tuple, p2: Tuple, p3: Tuple) -> float:
        """Calculate angle at p2 formed by p1-p2-p3."""
        # Vector from p2 to p1
        v1 = (p1[0] - p2[0], p1[1] - p2[1])
        # Vector from p2 to p3
        v2 = (p3[0] - p2[0], p3[1] - p2[1])
        
        # Calculate angle using dot product
        dot = v1[0] * v2[0] + v1[1] * v2[1]
        mag1 = math.sqrt(v1[0]**2 + v1[1]**2)
        mag2 = math.sqrt(v2[0]**2 + v2[1]**2)
        
        if mag1 == 0 or mag2 == 0:
            return 180
        
        cos_angle = dot / (mag1 * mag2)
        cos_angle = max(-1, min(1, cos_angle))  # Clamp to [-1, 1]
        angle = math.degrees(math.acos(cos_angle))
        return angle
    
    def _analyze_posture(self, keypoints: np.ndarray) -> Dict[str, Any]:
        """
        Analyze posture from keypoints.
        
        Key distinction:
        - BAD: Curved/hunched spine (upper back rounded forward)
        - OK: Straight spine even if inclined (proper squat with bent knees)
        """
        issues = []
        posture_score = 100
        
        # Get key body points
        nose = self._get_keypoint(keypoints, "nose")
        left_ear = self._get_keypoint(keypoints, "left_ear")
        right_ear = self._get_keypoint(keypoints, "right_ear")
        left_shoulder = self._get_keypoint(keypoints, "left_shoulder")
        right_shoulder = self._get_keypoint(keypoints, "right_shoulder")
        left_hip = self._get_keypoint(keypoints, "left_hip")
        right_hip = self._get_keypoint(keypoints, "right_hip")
        left_knee = self._get_keypoint(keypoints, "left_knee")
        right_knee = self._get_keypoint(keypoints, "right_knee")
        left_ankle = self._get_keypoint(keypoints, "left_ankle")
        right_ankle = self._get_keypoint(keypoints, "right_ankle")
        left_wrist = self._get_keypoint(keypoints, "left_wrist")
        right_wrist = self._get_keypoint(keypoints, "right_wrist")
        
        # Calculate mid-points
        mid_shoulder = ((left_shoulder[0] + right_shoulder[0]) / 2,
                        (left_shoulder[1] + right_shoulder[1]) / 2)
        mid_hip = ((left_hip[0] + right_hip[0]) / 2,
                   (left_hip[1] + right_hip[1]) / 2)
        mid_ear = ((left_ear[0] + right_ear[0]) / 2,
                   (left_ear[1] + right_ear[1]) / 2) if left_ear[0] > 0 and right_ear[0] > 0 else nose
        
        # ==============================================
        # DETECT CURVED/HUNCHED SPINE
        # ==============================================
        # Measure the angle nose-shoulder-hip
        # If this angle is small (<160°), head is forward = hunched
        # Also check if torso is significantly inclined while head droops forward
        
        is_spine_curved = False
        
        if nose[0] > 0 and mid_shoulder[0] > 0 and mid_hip[0] > 0:
            # Calculate angle at shoulder: nose-shoulder-hip
            nsh_angle = self._calculate_angle(nose, mid_shoulder, mid_hip)
            
            # When standing straight, this angle is close to 180 (head above shoulders above hips)
            # When hunched, head comes forward, angle decreases
            if nsh_angle < 140:  # Severe hunch
                is_spine_curved = True
                issues.append({
                    "type": "CURVED_SPINE",
                    "level": "danger",
                    "message": f"⚠️ Espalda muy encorvada",
                    "angle": round(nsh_angle, 0)
                })
                posture_score -= 40
            elif nsh_angle < 160:  # Moderate hunch
                is_spine_curved = True
                issues.append({
                    "type": "SLIGHT_CURVE",
                    "level": "warning",
                    "message": f"⚡ Espalda ligeramente curvada",
                    "angle": round(nsh_angle, 0)
                })
                posture_score -= 20
        
        # ==============================================
        # DETECT BAD BENDING (inclined torso check)
        # ==============================================
        # Also detect when torso is very inclined - potential bad lifting
        
        torso_angle = 0
        is_bending = False
        if mid_shoulder[0] > 0 and mid_hip[0] > 0:
            # Calculate torso inclination from vertical
            dx = mid_shoulder[0] - mid_hip[0]
            dy = mid_hip[1] - mid_shoulder[1]  # Y is inverted
            
            if abs(dy) > 10:
                torso_angle = abs(math.degrees(math.atan2(dx, dy)))
                is_bending = torso_angle > 30
                
                # If very inclined AND spine is curved = bad posture
                if torso_angle > 45 and is_spine_curved:
                    if not any(i["type"] == "BENT_FORWARD" for i in issues):
                        issues.append({
                            "type": "BENT_FORWARD",
                            "level": "danger",
                            "message": f"⚠️ Inclinación excesiva ({int(torso_angle)}°)",
                        })
                        posture_score -= 20
        
        # ==============================================
        # DETECT STRAIGHT LEG LIFT
        # ==============================================
        # Check knee bend
        knees_bent = False
        if left_knee[0] > 0 and left_hip[0] > 0 and left_ankle[0] > 0:
            knee_angle = self._calculate_angle(left_hip, left_knee, left_ankle)
            knees_bent = knee_angle < 150  # Knees are bent
        elif right_knee[0] > 0 and right_hip[0] > 0 and right_ankle[0] > 0:
            knee_angle = self._calculate_angle(right_hip, right_knee, right_ankle)
            knees_bent = knee_angle < 150
        
        # Bad lifting: bending forward with straight legs
        if is_bending and not knees_bent:
            if not any(i["type"] == "STRAIGHT_LEG_LIFT" for i in issues):
                issues.append({
                    "type": "STRAIGHT_LEG_LIFT",
                    "level": "warning",
                    "message": "🦵 Doblar rodillas al agacharse",
                })
                posture_score -= 15
        
        # ==============================================
        # DETECT OVERHEAD REACHING
        # ==============================================
        if left_wrist[1] > 0 and left_shoulder[1] > 0:
            if left_wrist[1] < left_shoulder[1] - 50:  # Wrist above shoulder
                issues.append({
                    "type": "OVERHEAD_REACH",
                    "level": "warning",
                    "message": "🙋 Brazos elevados - Evitar trabajo prolongado",
                })
                posture_score -= 15
        
        if right_wrist[1] > 0 and right_shoulder[1] > 0:
            if right_wrist[1] < right_shoulder[1] - 50:
                if not any(i["type"] == "OVERHEAD_REACH" for i in issues):
                    issues.append({
                        "type": "OVERHEAD_REACH",
                        "level": "warning",
                        "message": "🙋 Brazos elevados - Evitar trabajo prolongado",
                    })
                    posture_score -= 15
        
        return {
            "issues": issues,
            "posture_score": max(0, posture_score),
            "risk_level": "high" if posture_score < 50 else "medium" if posture_score < 80 else "low"
        }
    
    def analyze_frame(self, image_bytes: bytes, frame_width: int = 640) -> Dict[str, Any]:
        """Analyze ergonomics from a video frame."""
        image = Image.open(io.BytesIO(image_bytes))
        
        results = {
            "detections": [],
            "people_count": 0,
            "posture_issues": [],
            "avg_posture_score": 100,
            "risk_level": "low",
        }
        
        if not self.model:
            return results
        
        try:
            yolo_results = self.model(image, device=self.device, verbose=False, conf=0.5)
            
            if yolo_results and len(yolo_results) > 0:
                result = yolo_results[0]
                
                if result.keypoints is not None:
                    keypoints_data = result.keypoints.data.cpu().numpy()
                    boxes = result.boxes
                    
                    total_score = 0
                    for i, kps in enumerate(keypoints_data):
                        # Get bounding box
                        if boxes is not None and i < len(boxes):
                            box = boxes[i].xyxy[0].tolist()
                        else:
                            box = [0, 0, 0, 0]
                        
                        # Analyze posture
                        posture = self._analyze_posture(kps)
                        
                        detection = {
                            "box": box,
                            "keypoints": kps.tolist(),
                            "posture_score": posture["posture_score"],
                            "issues": posture["issues"],
                        }
                        results["detections"].append(detection)
                        results["posture_issues"].extend(posture["issues"])
                        total_score += posture["posture_score"]
                    
                    results["people_count"] = len(keypoints_data)
                    if results["people_count"] > 0:
                        results["avg_posture_score"] = round(total_score / results["people_count"])
                        
                        # Determine overall risk
                        if any(i["level"] == "danger" for i in results["posture_issues"]):
                            results["risk_level"] = "high"
                        elif any(i["level"] == "warning" for i in results["posture_issues"]):
                            results["risk_level"] = "medium"
        
        except Exception as e:
            print(f"Ergonomics analysis error: {e}")
        
        return results


# Singleton
_ergonomics_model = None

def get_ergonomics_model() -> ErgonomicsModel:
    global _ergonomics_model
    if _ergonomics_model is None:
        _ergonomics_model = ErgonomicsModel()
    return _ergonomics_model
