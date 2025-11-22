from ultralytics import YOLO
import os
import argparse
import json

def train_model(epochs=10, imgsz=640, batch=16):
    """
    Train YOLOv8 model for PPE detection.
    
    Args:
        epochs: Number of training epochs
        imgsz: Image size for training
        batch: Batch size
    """
    print(f"Starting YOLOv8 training with {epochs} epochs...")
    
    # Load a pretrained model
    model = YOLO("yolov8n.pt")
    
    # Train the model
    results = model.train(
        data="ml/data.yaml", 
        epochs=epochs, 
        imgsz=imgsz,
        batch=batch,
        patience=5,  # Early stopping patience
        project="siteguard_model",
        name="yolov8n_ppe",
        verbose=True,
        save=True,
        plots=True  # Generate training plots
    )
    
    # Extract and save metrics
    best_model_path = "siteguard_model/yolov8n_ppe/weights/best.pt"
    
    if os.path.exists(best_model_path):
        print(f"✓ Training complete! Best model saved at {best_model_path}")
        
        # Save metrics for CML
        metrics = {
            "epochs_trained": epochs,
            "model_path": best_model_path,
        }
        
        # Try to extract metrics from results if available
        try:
            if hasattr(results, 'results_dict'):
                metrics.update(results.results_dict)
        except:
            pass
        
        with open("metrics.json", "w") as f:
            json.dump(metrics, f, indent=2)
        
        print("✓ Metrics saved to metrics.json")
    else:
        print("⚠ Warning: Best model not found at expected path")
        raise FileNotFoundError(f"Model not found at {best_model_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Train YOLOv8 for PPE detection')
    parser.add_argument('--epochs', type=int, default=10, help='Number of epochs')
    parser.add_argument('--imgsz', type=int, default=640, help='Image size')
    parser.add_argument('--batch', type=int, default=16, help='Batch size')
    
    args = parser.parse_args()
    
    # Ensure we are in the root directory
    if not os.path.exists("ml/data.yaml"):
        print("Error: Please run this script from the project root.")
        print(f"Current directory: {os.getcwd()}")
        exit(1)
    
    train_model(epochs=args.epochs, imgsz=args.imgsz, batch=args.batch)
