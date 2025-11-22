"""
Download PPE detection dataset from Roboflow.
Uses a public dataset that doesn't require authentication.
"""
import os
import sys
import numpy as np
from PIL import Image

def download_dataset():
    """
    Download a public PPE detection dataset.
    For this demo, we'll create a minimal synthetic dataset.
    """
    
    dataset_dir = "../datasets/ppe"
    
    # Create directory structure
    os.makedirs(f"{dataset_dir}/train/images", exist_ok=True)
    os.makedirs(f"{dataset_dir}/train/labels", exist_ok=True)
    os.makedirs(f"{dataset_dir}/valid/images", exist_ok=True)
    os.makedirs(f"{dataset_dir}/valid/labels", exist_ok=True)
    
    print("Dataset directory structure created.")
    
    # Create synthetic images and labels for demo
    print("Generating synthetic dataset for CI/CD demo...")
    
    # Create a few dummy image/label pairs
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
            # Simulate detections: helmet, no-helmet, vest, no-vest
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
    print("Note: This is a minimal dataset for pipeline demonstration.")
    print("For real training, use a proper dataset from Roboflow or custom annotations.")
    
    return dataset_dir

if __name__ == "__main__":
    try:
        dataset_path = download_dataset()
        print(f"\nDataset ready at: {dataset_path}")
    except Exception as e:
        print(f"Error downloading dataset: {e}")
        sys.exit(1)
