# SiteGuard — Informe técnico

Sistema de seguridad industrial y vial basado en visión por computador.
Detección de EPP, ergonomía, proximidad de vehículos y monitorización del
conductor (DMS/ADAS) en tiempo real, con backend FastAPI y frontend React.

---

## 1. Arquitectura y modelos

| Subsistema | Modelo / técnica | Clases / salida |
|---|---|---|
| Detección de EPP | YOLOv8n (`best.pt`, 11 clases) | Hardhat, NO-Hardhat, Safety Vest, NO-Safety Vest, Mask, NO-Mask, Person, machinery, vehicle, Safety Cone, utility pole |
| Ergonomía | YOLOv8n-pose | 17 keypoints → ángulos de postura |
| Control de vehículos | YOLOv8n (COCO) | persona / vehículo + proximidad |
| **Monitor de conductor (DMS v2)** | **MediaPipe FaceMesh + heurísticas temporales** | EAR/PERCLOS, microsueño, pose (solvePnP), bostezo |
| Distracción por objetos | YOLOv8n (COCO) | móvil, vaso/botella |
| Cinturón | YOLOv8 (2 clases) | Seat_Belt / Without_Seat_Belt |

El DMS v2 es el núcleo del proyecto: en lugar de un clasificador de somnolencia
de caja negra, calcula métricas **explicables** (apertura ocular, PERCLOS, pose
de cabeza) con una máquina de estados con histéresis, calibración por conductor
e índice de fatiga de sesión.

---

## 2. Benchmark de latencia (CPU vs GPU)

Medido sobre `bus.jpg`, 20 inferencias tras 3 de calentamiento, a la resolución
usada en producción. Hardware: **NVIDIA RTX 2070**. Reproducible con
`python ml/benchmark.py` (escribe `ml/benchmark_results.json`).

| Modelo | imgsz | CPU (ms) | CPU (fps) | GPU (ms) | GPU (fps) |
|---|---:|---:|---:|---:|---:|
| PPE (`best.pt`) | 640 | 428.7 | 2.3 | **21.6** | **46.4** |
| PPE fallback (6 cls) | 640 | 85.4 | 11.7 | 13.2 | 75.6 |
| Objetos yolov8n (móvil) | 320 | 46.3 | 21.6 | 12.9 | 77.5 |
| Somnolencia (clasificador antiguo) | 640 | 787.9 | 1.3 | 50.2 | 19.9 |
| Pose (ergonomía) | 640 | 97.9 | 10.2 | 18.2 | 55.0 |
| Cinturón | 320 | 41.0 | 24.4 | 12.2 | 82.1 |
| **MediaPipe FaceMesh (DMS v2)** | — | **5.7** | **175.2** | n/a (CPU) | — |

**Conclusiones:**
- La **GPU es esencial** para EPP a 640 px: de 2.3 fps (CPU) a **46 fps** (GPU), un
  ×19 de aceleración. Todos los modelos son tiempo-real en GPU.
- El **núcleo del DMS v2 (MediaPipe) corre a 175 fps en CPU**, sin GPU. Comparado
  con el clasificador de somnolencia antiguo (788 ms en CPU), el rediseño es
  **~137× más rápido** y, además, explicable — justificación cuantitativa del
  cambio de enfoque.
- El detector de cinturón y el de objetos a 320 px son ligeros (>20 fps en CPU),
  apropiados para muestreo intercalado (cada N frames) en el pipeline DMS.

---

## 3. Evaluación de precisión (metodología)

Métricas estándar de detección con la validación integrada de Ultralytics
(`ml/evaluate.py`), sobre el split de **test** etiquetado:

- **Precision, Recall, mAP@50 y mAP@50-95** (global y por clase).
- **Matriz de confusión** y **curva Precision-Recall** (PNG generados en `runs/`).

Reproducir:
```bash
# 1) Descargar el dataset etiquetado (Construction Site Safety, Roboflow)
ROBOFLOW_API_KEY=xxxx python ml/download_dataset.py   # o ver ml/data_ppe.yaml
# 2) Evaluar
python ml/evaluate.py --model siteguard_model/yolov8n_ppe/weights/best.pt --data ml/data_ppe.yaml
```

> Resultados (rellenar tras ejecutar con el dataset):
>
> | Métrica | Valor |
> |---|---|
> | Precision | _por completar_ |
> | Recall | _por completar_ |
> | mAP@50 | _por completar_ |
> | mAP@50-95 | _por completar_ |
>
> Adjuntar `confusion_matrix.png` y `PR_curve.png`.

---

## 4. Comparativa con la competencia

Frente a las plataformas líderes de seguridad de flotas (Samsara, Motive,
Netradyne, Lytx, Nauto):

| Capacidad | Competencia | SiteGuard |
|---|---|---|
| Somnolencia / PERCLOS / microsueño | ✅ | ✅ (explicable) |
| Distracción / mirar abajo / móvil | ✅ | ✅ |
| Cinturón | ✅ (parte) | ✅ |
| Beber / fumar / comer | parcial | beber ✅ |
| Colisión frontal / peatón (ADAS) | ✅ | ✅ |
| EPP + ergonomía + proximidad de vehículos | ❌ (no lo cubren) | ✅ **diferencial** |
| Robustez (gafas de sol, oclusión, poca luz) | parcial | ✅ **diferencial** |
| Score + coaching + flota | ✅ | ⏳ en desarrollo |
| Telemetría GPS/IMU, visión IR | ✅ (hardware) | ❌ (web/cámara) |
| Modelo **on-premise / sin nube, abierto** | ❌ (SaaS) | ✅ **diferencial** |

**Diferenciadores de SiteGuard:** métricas explicables (no caja negra),
robustez ante condiciones reales, cobertura de seguridad de **obra** (EPP +
ergonomía + vehículos) que las plataformas de flota no abordan, y despliegue
on-premise sin dependencia de nube.

**Limitaciones frente a la competencia:** no hay telemetría de vehículo
(GPS/IMU → exceso de velocidad, frenazos) ni hardware con visión nocturna IR;
SiteGuard lo compensa parcialmente por software (realce CLAHE en poca luz).

---

## 5. Conclusiones y trabajo futuro

El sistema alcanza rendimiento de tiempo real en GPU en todos los módulos, y el
rediseño del DMS hacia métricas explicables aporta una mejora de latencia de dos
órdenes de magnitud frente al clasificador previo, además de interpretabilidad.

Trabajo futuro priorizado: score acumulado por conductor + gamificación,
flujo de coaching y bandeja de seguridad, vista de flota multi-conductor, clips
de evento para exoneración, y completar la evaluación cuantitativa por clase.
