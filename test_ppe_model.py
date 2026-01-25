"""Quick test script to verify new PPE model classes"""
from ultralytics import YOLO

model = YOLO("yolov8n_ppe_6classes.pt")
print(f"Class names: {model.names}")
