# Dataset propio para el Monitor de Conductor (DMS)

Pipeline para crear tu dataset de cabina, entrenar tu propio modelo YOLOv8 y
que el monitor lo use **en lugar de** los modelos de terceros (`yolov8n.pt`
COCO para móvil/bebida y, si entrenas cinturón, `seatbelt.pt`).

> La somnolencia/PERCLOS/microsueños NO necesitan modelo entrenado: las calcula
> MediaPipe + geometría (el antiguo `yolo_drowsiness.pt` ya no se usa en v2).

Hay **dos caminos** para conseguir las imágenes — son combinables:

---

## Camino A — Sin grabar nada (dataset público, recomendado para empezar)

Usa un dataset público de cabina **ya etiquetado con cajas** (HuggingFace,
descarga anónima): `anywaylabs/synthetic-driver-monitoring-detection`.
Sus clases `calling`/`texting`/`drinking` se remapean a `phone`/`drinking`
(las cajas de `yawning` se descartan: el bostezo lo detecta MediaPipe).

```bash
python ml/import_hf_dataset.py            # ~600 imágenes con objetos + 80 negativos
python ml/import_hf_dataset.py --max 300  # versión rápida
python ml/train_dms.py                    # entrena e instala dms_cabin.pt
```

- Modelo resultante: 2 clases (`phone`, `drinking`).
- **Cinturón**: este dataset no lo trae → la app entra en **modo híbrido**
  automáticamente (tu modelo para móvil/bebida + `seatbelt.pt` para cinturón).
- Al ser imágenes sintéticas hay *domain gap* con tu webcam real — documentarlo
  (y mitigarlo mezclando capturas propias, camino B) es un buen punto del informe.

## Camino B — Con tu propia cámara (mejor adaptación a TU vista)

Graba escenas con la webcam; la escena es la etiqueta y las cajas las pone el
auto-etiquetador (COCO para móvil/vaso, torso de persona para cinturón):

```bash
python ml/capture_dataset.py --scene phone          # usando el móvil
python ml/capture_dataset.py --scene drinking
python ml/capture_dataset.py --scene seatbelt_on    # cinturón visible
python ml/capture_dataset.py --scene seatbelt_off
python ml/capture_dataset.py --scene neutral        # negativos
python ml/build_dms_dataset.py                      # auto-etiqueta + splits
python ml/train_dms.py
```

- Objetivo: 200–500 imágenes por escena, variando luz/gafas/ropa/ángulos.
- Lo no detectado va a `raw/_unlabeled/` → etiquetar a mano o recapturar.
- Modelo resultante: 4 clases (incluye `seatbelt_on/off` → sustituye también
  a `seatbelt.pt`).
- ⚠️ No uses los snapshots de `app/app/static/driver_events/` como dataset:
  llevan cajas/texto dibujados encima.

## Entrenar y usar (ambos caminos)

```bash
python ml/train_dms.py            # 100 épocas, evalúa en test, instala dms_cabin.pt
python ml/train_dms.py --epochs 50
```

Reinicia el backend y verás `✅ Custom cabin model loaded: dms_cabin.pt`.
El monitor v2 pasa a usar **tu modelo**; si el modelo no tiene clases de
cinturón, mantiene `seatbelt.pt` en paralelo (híbrido). Borra `dms_cabin.pt`
para volver al comportamiento anterior — cero riesgo.

## Medir y documentar (para el informe)

```bash
python ml/evaluate.py --model dms_cabin.pt --data datasets/dms_cabin/data.yaml --split test
python ml/benchmark.py
```

Compara mAP/recall de tu modelo vs el baseline (COCO + seatbelt.pt) sobre el
mismo test set y añade la matriz de confusión a `docs/INFORME_TECNICO.md`.
