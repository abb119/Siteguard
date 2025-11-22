import sys
import os
sys.path.append(os.getcwd())

from app.services.model_service import YOLOModel
from PIL import Image
import io

def test_model_loading():
    print("Testing model loading...")
    try:
        model = YOLOModel()
        print("Model loaded successfully.")
    except Exception as e:
        print(f"Failed to load model: {e}")
        return

    print("Testing inference with dummy image...")
    try:
        # Create a simple dummy image
        img = Image.new('RGB', (640, 640), color = 'red')
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='JPEG')
        img_bytes = img_byte_arr.getvalue()

        detections = model.predict(img_bytes)
        print(f"Inference successful. Detections: {detections}")
    except Exception as e:
        print(f"Inference failed: {e}")

if __name__ == "__main__":
    test_model_loading()
