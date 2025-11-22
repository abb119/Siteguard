import random
import json
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np

def train_model():
    # Simulate training metrics
    print("Training model...")
    accuracy = 0.85 + random.random() * 0.10
    precision = 0.82 + random.random() * 0.10
    recall = 0.88 + random.random() * 0.05
    
    metrics = {
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall
    }
    
    # Save metrics to file
    with open("metrics.json", "w") as f:
        json.dump(metrics, f, indent=4)
        
    # Create a markdown table for CML
    with open("metrics.txt", "w") as f:
        f.write("## Model Metrics\n")
        f.write("| Metric | Value |\n")
        f.write("| --- | --- |\n")
        f.write(f"| Accuracy | {accuracy:.4f} |\n")
        f.write(f"| Precision | {precision:.4f} |\n")
        f.write(f"| Recall | {recall:.4f} |\n")
        
    print("Metrics saved to metrics.json and metrics.txt")

def generate_confusion_matrix():
    # Simulate confusion matrix data
    print("Generating confusion matrix...")
    classes = ["Helmet", "No Helmet", "Vest", "No Vest"]
    cm = np.random.randint(50, 100, size=(4, 4))
    
    # Make diagonal dominant for realistic look
    for i in range(4):
        cm[i, i] += 200
        
    plt.figure(figsize=(10, 8))
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", xticklabels=classes, yticklabels=classes)
    plt.title("Confusion Matrix")
    plt.ylabel("Actual")
    plt.xlabel("Predicted")
    plt.tight_layout()
    plt.savefig("confusion_matrix.png")
    print("Confusion matrix saved to confusion_matrix.png")

if __name__ == "__main__":
    train_model()
    generate_confusion_matrix()
