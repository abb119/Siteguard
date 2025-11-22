# 👷 SiteGuard: AI-Powered PPE Detection System

![Build Status](https://github.com/abb119/Siteguard/actions/workflows/ci.yml/badge.svg)
![Python](https://img.shields.io/badge/python-3.10-blue.svg)
![Docker](https://img.shields.io/badge/docker-available-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**SiteGuard** is an automated computer vision system designed to enhance safety in industrial environments. It detects workers and verifies compliance with Personal Protective Equipment (PPE) regulations (Helmets and High-Visibility Vests) in real-time.

![Dashboard Preview](docs/dashboard.png)

---

## 🚀 Why SiteGuard?

- **Safety First**: Automatically identifies workers at risk, preventing accidents before they happen.
- **Real-Time Alerts**: Generates instant notifications for non-compliance.
- **Scalable Architecture**: Built with microservices (FastAPI, Docker) and MLOps best practices.

---

## 🛠️ Architecture

The system follows a modern microservices architecture:

```mermaid
graph TD
    User[User / Camera] -->|Upload Image| Frontend[Streamlit Dashboard]
    Frontend -->|POST /detect| API[FastAPI Backend]
    API -->|Inference| Model[YOLOv8 Service]
    API -->|Log Incident| DB[(PostgreSQL/SQLite)]
    API -->|Metrics| Prometheus[Prometheus]
    Prometheus -->|Visualize| Grafana[Grafana]
```

## 🤖 MLOps Pipeline

We don't just ship code; we ship quality. Our CI/CD pipeline ensures that every change is tested and validated.

1.  **Code Quality**: `ruff` and `pre-commit` hooks ensure PEP8 compliance.
2.  **Automated Testing**: `pytest` verifies API functionality.
3.  **Continuous Machine Learning (CML)**:
    *   On every Pull Request, the model is evaluated against a test set.
    *   Metrics (Precision, Recall) and Confusion Matrices are reported automatically by a bot.
4.  **Continuous Deployment (CD)**:
    *   If tests pass, a Docker image is built and pushed to the container registry.

## ⚡ Quick Start

### Prerequisites
- Docker & Docker Compose

### Run Locally

1.  **Clone the repository**
    ```bash
    git clone https://github.com/abb119/Siteguard.git
    cd Siteguard
    ```

2.  **Start the services**
    ```bash
    docker-compose up --build
    ```

3.  **Access the Dashboard**
    *   Frontend: [http://localhost:8501](http://localhost:8501)
    *   API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
    *   Grafana: [http://localhost:3000](http://localhost:3000)

## 📂 Project Structure

```
.
├── app/                # FastAPI Backend
├── frontend/           # Streamlit Dashboard
├── ml/                 # Model Training & Evaluation
├── docker/             # Dockerfiles
├── tests/              # Automated Tests
├── .github/workflows/  # CI/CD & CML Pipelines
└── docker-compose.yml  # Infrastructure Orchestration
```

---
*Built with ❤️ by [Your Name]*
