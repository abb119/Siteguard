import torch
print(f"CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"Current device: {torch.cuda.current_device()}")
else:
    print("GPU: None - Running on CPU!")

# Test model device
from ultralytics import YOLO
model = YOLO("yolov8n_ppe_6classes.pt")
print(f"Model device: {model.device}")
