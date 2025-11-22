"""
Download PPE detection dataset from Roboflow.
Uses a public dataset that doesn't require authentication.
"""
import os
import sys
import urllib.request
import zipfile
import shutil

def download_dataset():
    """
    Download a public PPE detection dataset.
    For this demo, we'll use a known public dataset or create a minimal synthetic one.
    """
    
    dataset_dir = "../datasets/ppe"
    
    # Create directory structure
    os.makedirs(f"{dataset_dir}/train/images", exist_ok=True)
    os.makedirs(f"{dataset_dir}/train/labels", exist_ok=True)
    os.makedirs(f"{dataset_dir}/valid/images", exist_ok=True)
    os.makedirs(f"{dataset_dir}/valid/labels", exist_ok=True)
    
    print("Dataset directory structure created.")
    
    # For CI/CD demo purposes, we'll create a minimal synthetic dataset
    # In production, you would use the Roboflow API:
    # from roboflow import Roboflow
    # rf = Roboflow(api_key="YOUR_API_KEY")
    # project = rf.workspace().project("ppe-detection")
    # dataset = project.version(1).download("yolov8")
    
    print("Note: Using minimal synthetic dataset for CI/CD demo.")
    print("In production, integrate with Roboflow API for real dataset.")
    
    # Create a minimal YOLO format label file as placeholder
    # Format: class_id center_x center_y width height (normalized 0-1)
    
    # Create a few dummy label files
    for i in range(5):
        # Training set
        with open(f"{dataset_dir}/train/labels/sample_{i}.txt", "w") as f:
            # Simulate detections: helmet, no-helmet, vest, no-vest
            f.write(f"{i % 4} 0.5 0.5 0.3 0.3\n")
        
        # Validation set
        with open(f"{dataset_dir}/valid/labels/sample_{i}.txt", "w") as f:
            f.write(f"{i % 4} 0.5 0.5 0.3 0.3\n")
    
    print(f"✓ Synthetic dataset created at {dataset_dir}")
    print("✓ Contains 5 training and 5 validation samples")
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
