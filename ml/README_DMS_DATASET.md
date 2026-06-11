# Dataset propio para el Monitor de Conductor (DMS)

Pipeline completo para crear tu dataset de cabina, entrenar tu propio modelo
YOLOv8 y que el monitor lo use **en lugar de** los modelos de terceros
(`yolov8n.pt` COCO para móvil/bebida y `seatbelt.pt` de vista parabrisas).

> La somnolencia/PERCLOS/microsueños NO necesitan modelo entrenado: las calcula
> MediaPipe + geometría (el antiguo `yolo_drowsiness.pt` ya no se usa en v2).

**Clases del modelo:** `phone` · `drinking` · `seatbelt_on` · `seatbelt_off`
(+ escena `neutral` como negativos).

---

## 1. Capturar imágenes (webcam)

Graba cada escena por separado — el nombre de la escena es la etiqueta:

```bash
python ml/capture_dataset.py --scene phone          # usando el móvil
python ml/capture_dataset.py --scene drinking       # vaso/botella cerca de la cara
python ml/capture_dataset.py --scene seatbelt_on    # cinturón puesto y VISIBLE
python ml/capture_dataset.py --scene seatbelt_off   # sin cinturón
python ml/capture_dataset.py --scene neutral        # conduciendo normal (negativos)
```

- ESPACIO pausa · Q sale. Guarda 1 frame cada 0,5 s en `datasets/dms_cabin/raw/<escena>/`.
- **Objetivo: 200–500 imágenes por escena.** Varía luz (día/noche/lámpara),
  gafas sí/no, ropa, distancia, ángulos y, si puedes, varias personas.
  Mejor muchas sesiones cortas que una larga estática.
- ⚠️ No reutilices los snapshots de `app/app/static/driver_events/` como
  dataset: llevan cajas/texto dibujados encima y contaminarían el entrenamiento.

## 2. Construir el dataset (auto-etiquetado)

```bash
python ml/build_dms_dataset.py
```

- Pone las **cajas** automáticamente con COCO (móvil/vaso/persona→torso); la
  **clase** sale de la escena que grabaste (etiquetado asistido por modelo).
- Las imágenes donde no encuentra el objeto van a `raw/_unlabeled/` → etiquétalas
  a mano (Roboflow/Label Studio) o recaptura.
- Genera splits 70/20/10 y `datasets/dms_cabin/data.yaml`.
- **Revisa una muestra de labels antes de entrenar** (abre unas imágenes con sus
  .txt; en Roboflow puedes importar y corregir).

## 3. Entrenar (RTX 2070: ~30–60 min)

```bash
python ml/train_dms.py                 # 100 épocas, imgsz 640, instala al acabar
python ml/train_dms.py --epochs 50     # más rápido
```

Al terminar evalúa en el split de test (precision/recall/mAP) y copia el mejor
modelo a **`dms_cabin.pt`** en la raíz del proyecto.

## 4. Usarlo en la app

Reinicia el backend. Verás:

```
✅ Custom cabin model loaded: dms_cabin.pt | classes: {...}
```

El WS del monitor v2 pasa a usar **tu modelo** (una sola inferencia para
móvil/bebida/cinturón). Si borras `dms_cabin.pt`, vuelve automáticamente al
fallback COCO + seatbelt.pt — cero riesgo.

## 5. Medir y documentar (para el informe)

```bash
python ml/evaluate.py --model dms_cabin.pt --data datasets/dms_cabin/data.yaml --split test
python ml/benchmark.py     # añade tu modelo a la tabla de latencia si quieres
```

Compara tu mAP/recall contra el baseline (COCO + seatbelt.pt sobre el mismo
test set) y añade la matriz de confusión al informe técnico — esa comparación
es la evidencia de que tu dataset mejora el sistema.
