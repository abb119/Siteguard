"""
Download PPE detection dataset from Roboflow.
Uses a public dataset that doesn't require authentication.
"""
import os
import sys
import numpy as np
from PIL import Image

# Try to import Roboflow, fall back to synthetic if unavailable
try:
    from roboflow import Roboflow
    HAS_ROBOFLOW = True
except ImportError:
    HAS_ROBOFLOW = False
    print("Warning: Roboflow not installed. Using synthetic dataset.")


def download_real_dataset():
    """
    Download real PPE dataset from Roboflow.
    Requires ROBOFLOW_API_KEY environment variable.
    """
    api_key = os.getenv("ROBOFLOW_API_KEY")
    if not api_key:
        raise ValueError("ROBOFLOW_API_KEY environment variable not set")
    
    rf = Roboflow(api_key=api_key)
    project = rf.workspace().project("hard-hat-detection")
    dataset = project.version(1).download("yolov8")
    
    print(f"✓ Real dataset downloaded from Roboflow")
    return dataset.location


def create_synthetic_dataset():
    """
    Create a minimal synthetic dataset for demo/testing purposes.
    """
    dataset_dir = "../datasets/ppe"
    
    # Create directory structure
    os.makedirs(f"{dataset_dir}/train/images", exist_ok=True)
    os.makedirs(f"{dataset_dir}/train/labels", exist_ok=True)
    os.makedirs(f"{dataset_dir}/valid/images", exist_ok=True)
    os.makedirs(f"{dataset_dir}/valid/labels", exist_ok=True)
    
    print("Generating synthetic dataset for CI/CD demo...")
    
    # Create synthetic images and labels
    for split in ['train', 'valid']:
        num_samples = 10 if split == 'train' else 5
        
        for i in range(num_samples):
            # Create a simple synthetic image (640x640 blank with random noise)
            img_array = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)
            img = Image.fromarray(img_array)
            
            # Save image
            img_path = f"{dataset_dir}/{split}/images/sample_{i}.jpg"
            img.save(img_path)
            
            # Create label file (YOLO format: class_id center_x center_y width height)
            label_path = f"{dataset_dir}/{split}/labels/sample_{i}.txt"
            with open(label_path, "w") as f:
                # Add 1-2 random bounding boxes
                for j in range(np.random.randint(1, 3)):
                    class_id = np.random.randint(0, 4)  # 0-3 for our 4 classes
                    cx = np.random.uniform(0.2, 0.8)
                    cy = np.random.uniform(0.2, 0.8)
                    w = np.random.uniform(0.1, 0.3)
                    h = np.random.uniform(0.1, 0.3)
                    f.write(f"{class_id} {cx} {cy} {w} {h}\n")
    
    print(f"✓ Synthetic dataset created at {dataset_dir}")
    print("✓ Training set: 10 images with labels")
    print("✓ Validation set: 5 images with labels")
    return dataset_dir


def download_dataset():
    """
    Main dataset download function.
    Tries Roboflow first, falls back to synthetic data.
    """
    # Try real dataset from Roboflow
    if HAS_ROBOFLOW and os.getenv("ROBOFLOW_API_KEY"):
        try:
            return download_real_dataset()
        except Exception as e:
            print(f"Warning: Could not download from Roboflow: {e}")
            print("Falling back to synthetic dataset...")
    
    # Fallback to synthetic dataset
    return create_synthetic_dataset()


if __name__ == "__main__":
    try:
        dataset_path = download_dataset()
        print(f"\nDataset ready at: {dataset_path}")
        print("\nNote: For production training, set ROBOFLOW_API_KEY environment variable")
        print("to download real PPE detection datasets from Roboflow.")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
