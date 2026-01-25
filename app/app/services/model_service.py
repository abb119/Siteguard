from ultralytics import YOLO
from PIL import Image
import io
import cv2
import numpy as np
from typing import List, Dict, Any
import os
import tempfile
import torch

class YOLOModel:
    def __init__(self, model_path: str = "yolov8n_ppe_6classes.pt"):
        # Initialize YOLO model
        try:
            self.model = YOLO(model_path)
            print(f"✅ Model loaded successfully: {model_path}")
        except Exception as e:
            print(f"CRITICAL ERROR: Failed to load YOLO model: {e}")
            raise RuntimeError(f"Could not load YOLO model: {e}")

        # GPU Check
        if torch.cuda.is_available():
            self.device = 'cuda:0'
            print("\n" + "="*50)
            print(f"🚀  GPU DETECTED: {torch.cuda.get_device_name(0)}")
            print("🚀  Accelerating inference with NVIDIA CUDA")
            print("="*50 + "\n", flush=True)
            self.model.to(self.device)
        else:
            self.device = 'cpu'
            print("\n" + "="*50)
            print("⚠️  NO GPU DETECTED - Running in CPU Mode (Slower)")
            print("⚠️  To enable GPU, ensure NVIDIA Drivers + Docker GPU support are installed.")
            print("="*50 + "\n", flush=True)
    def predict(self, image_bytes: bytes) -> List[Dict[str, Any]]:
        print(f"DEBUG_MODEL: predict() called with {len(image_bytes)} bytes", flush=True)
        if not self.model:
            raise RuntimeError("Model not loaded")
            
        image = Image.open(io.BytesIO(image_bytes))
        print(f"DEBUG_MODEL: Image size: {image.size}, Device: {self.device}", flush=True)
        
        # DEBUG: Confirm device usage
        # Note: self.model.device works in Ultralytics YOLOv8
        # print(f"DEBUGGING: Running prediction on device: {self.model.device}", flush=True)
        
        # Lower confidence threshold and FORCE GPU usage
        results = self.model(image, conf=0.15, device=self.device, verbose=False)
        
        detections = []
        for result in results:
            boxes = result.boxes
            for box in boxes:
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
        
        print(f"DEBUG_MODEL: Found {len(detections)} detections", flush=True)
        return detections

    def predict_video_from_file(self, input_path: str, frame_skip: int = 5) -> Dict[str, Any]:
        """Process video and return detections metadata ONLY (no video generation for speed)"""
        if not self.model:
            raise RuntimeError("Model not loaded")
        
        print(f"DEBUG: Processing video metadata only. Input: {input_path}", flush=True)
        
        try:
            cap = cv2.VideoCapture(input_path)
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            print(f"DEBUG: Video FPS: {fps}, Total Frames: {total_frames}", flush=True)
            
            frame_count = 0
            all_detections = []
            
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                
                # Only process every Nth frame to save CPU
                if frame_count % frame_skip == 0:
                    # Resize for faster inference (internal only, coords will be normalized later if needed, 
                    # but here we keep typical size or simple resize. Let's keep inference on resized but we need
                    # to be careful about coordinate mapping if we resize. 
                    # To be safe and simple for this 'Pro' refactor: Run on original frame or resized frame 
                    # but map coordinates back? 
                    # Actually, for speed, let's resize to 640xH, run inference, and return NORMALIZED (0-1) coordinates.
                    # This allows the frontend to scale them to ANY display size.
                    
                    original_h, original_w = frame.shape[:2]
                    
                    # Inference
                    # Optimization: imgsz=320 is MUCH faster on CPU and usually sufficient for PPE
                    results = self.model(frame, verbose=False, imgsz=320)
                    
                    frame_detections = []
                    for result in results:
                        for box in result.boxes:
                            # Get absolute coordinates relative to the processed frame
                            x1, y1, x2, y2 = box.xyxy[0].tolist()
                            conf = float(box.conf[0].item())
                            cls_id = int(box.cls[0].item())
                            cls_name = result.names[cls_id]
                            
                            # Normalize coordinates (0 to 1) so frontend can render regardless of video size
                            norm_box = [
                                x1 / original_w,
                                y1 / original_h,
                                x2 / original_w,
                                y2 / original_h
                            ]
                            
                            frame_detections.append({
                                "box": norm_box,
                                "confidence": conf,
                                "class_id": cls_id,
                                "class_name": cls_name,
                                "is_compliant": not (cls_name.upper().startswith("NO-") or cls_name.upper().startswith("NO_"))
                            })
                    
                    all_detections.append({
                        "frame": frame_count,
                        "timestamp": frame_count / fps if fps > 0 else 0,
                        "detections": frame_detections
                    })
                
                if frame_count % 10 == 0:
                     print(f"DEBUG: Processed {frame_count}/{total_frames}", flush=True)

                frame_count += 1
            
            cap.release()
            print("DEBUG: Metadata processing finished.", flush=True)
            
            return {
                "fps": fps,
                "total_frames": total_frames,
                "frame_data": all_detections
            }
        finally:
            # We don't delete input_path here immediately just in case, 
            # but usually the caller handles cleanup. 
            pass
