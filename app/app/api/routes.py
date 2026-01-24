import asyncio
import base64
import json
import time
from datetime import timedelta
from typing import Any, Dict, List

import cv2
import numpy as np
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.auth.jwt import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    Token,
    authenticate_user,
    create_access_token,
    get_current_active_user,
)
from app.db.database import get_db
from app.db.models import Detection, Incident
from app.services.alert_service import AlertService
from app.services.compliance_service import ComplianceService
from app.services.model_registry import get_yolo_model

router = APIRouter()
compliance_service = ComplianceService()
alert_service = AlertService()

@router.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/detect", response_model=Dict[str, Any])
async def detect_objects(
    file: UploadFile = File(...), 
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(get_current_active_user)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    contents = await file.read()
    try:
        model = get_yolo_model()
        detections = await run_in_threadpool(model.predict, contents)
        
        # Save Detection to DB
        db_detection = Detection(result=detections)
        db.add(db_detection)
        await db.commit()
        await db.refresh(db_detection)
        
        # Check Compliance
        violations = compliance_service.check_compliance(detections)
        
        # Save Incidents
        for violation in violations:
            incident = Incident(
                detection_id=db_detection.id,
                violation_type=violation['violation_type'],
                severity=violation['severity'],
                details=violation['details']
            )
            db.add(incident)
            
            # Send real-time alert via Slack
            alert_service.send_alert(
                violation_type=violation['violation_type'],
                details=violation['details']
            )
            
        if violations:
            await db.commit()
        
        return {
            "detections": detections,
            "violations": violations,
            "compliant": len(violations) == 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/detect-video")
async def detect_video(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    import shutil
    import tempfile
    import os
    from fastapi.responses import FileResponse
    
    print(f"DEBUG: /detect-video called via HTTP. Filename: {file.filename}", flush=True)
    
    # Create a temp file to stream the upload to (avoid RAM spike)
    with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp_file:
        print(f"DEBUG: Streaming upload to temp file: {tmp_file.name}", flush=True)
        await run_in_threadpool(shutil.copyfileobj, file.file, tmp_file)
        tmp_path = tmp_file.name
    
    print(f"DEBUG: File saved to disk. Size: {os.path.getsize(tmp_path)} bytes", flush=True)
    
    try:
        print("DEBUG: Calling model.predict_video_from_file (metadata only)...", flush=True)
        model = get_yolo_model()
        video_results = await run_in_threadpool(model.predict_video_from_file, tmp_path, frame_skip=5)
        print(f"DEBUG: predict_video returned metadata. Keys: {video_results.keys()}", flush=True)
        
        # Save detection metadata to DB (full result)
        # Note: If the JSON is huge, we might want to store a summary, but for now full JSON is fine
        db_detection = Detection(result=video_results)
        db.add(db_detection)
        await db.commit()
        
        return video_results

    except Exception as e:
        print(f"ERROR in detect_video: {e}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup input temp file
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except:
                pass

@router.websocket("/ws/detect")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("DEBUG: WS Connection Accepted", flush=True)
    try:
        model = get_yolo_model()
        while True:
            # print("DEBUG: Waiting for bytes...", flush=True)
            data = await websocket.receive_bytes()
            # print(f"DEBUG: Received bytes: {len(data)}", flush=True)
            
            nparr = np.frombuffer(data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is None:
                print("ERROR: Failed to decode image from bytes", flush=True)
                continue

            # print(f"DEBUG: Image decoded. Shape: {img.shape}", flush=True)

            # Run inference (Optimized for CPU)
            # conf=0.25 is standard, imgsz=320 speeds up CPU inference significantly
            results = model.model(img, imgsz=320, conf=0.25, iou=0.45, verbose=False)
            
            # Draw detections on the image directly (Server-Side Rendering)
            for result in results:
                boxes = result.boxes
                for box in boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                    class_id = int(box.cls[0].item())
                    class_name = result.names[class_id]
                    # conf_val = float(box.conf[0].item())
                    
                    # Color based on compliance
                    normalized_name = class_name.upper()
                    if normalized_name.startswith('NO-') or normalized_name.startswith('NO_'):
                        color = (0, 0, 255) # Red (BGR)
                    else:
                        color = (0, 255, 0) # Green (BGR)

                    # Dynamic thickness based on image size (small 320px image needs thin lines)
                    cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
                    
                    # Minimal label to save drawing time
                    # label = f"{class_name}"
                    # cv2.putText(img, label, (x1, y1 - 2), 0, 0.4, color, thickness=1, lineType=cv2.LINE_AA)

            # Encode back to JPEG with Reduced Quality for Speed (40%)
            # This significantly reduces payload size -> faster transfer
            encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 50]
            _, buffer = cv2.imencode('.jpg', img, encode_param)
            
            # Send bytes back
            await websocket.send_bytes(buffer.tobytes())
    except Exception as e:
        print(f"CRITICAL WS ERROR: {e}", flush=True)
        import traceback
        traceback.print_exc()
        try:
            await websocket.close()
        except Exception:
            pass



@router.websocket("/ws/ppe-stream")
async def websocket_ppe_stream(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_json({"type": "ready"})
    model = get_yolo_model()
    compliance = ComplianceService()
    loop = asyncio.get_running_loop()
    frame_counter = 0

    try:
        while True:
            message = await websocket.receive_text()
            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON payload"})
                continue

            image_b64 = payload.get("image")
            if not image_b64:
                await websocket.send_json({"type": "error", "message": "Missing 'image' field"})
                continue

            frame_id = payload.get("frame_id")
            if frame_id is None:
                frame_counter += 1
                frame_id = frame_counter
            timestamp = payload.get("timestamp")
            capture_w = int(payload.get("capture_width") or 0) or 320
            capture_h = int(payload.get("capture_height") or 0) or 240
            display_w = int(payload.get("display_width") or capture_w)
            display_h = int(payload.get("display_height") or capture_h)

            frame = _decode_base64_frame(image_b64)
            if frame is None:
                await websocket.send_json({"type": "error", "message": "Could not decode frame", "frame_id": frame_id})
                continue

            ok, buffer = cv2.imencode(".jpg", frame)
            if not ok:
                await websocket.send_json({"type": "error", "message": "Encoding failed", "frame_id": frame_id})
                continue

            start = time.perf_counter()
            detections = await loop.run_in_executor(None, lambda: model.predict(buffer.tobytes()))
            latency_ms = (time.perf_counter() - start) * 1000.0

            scaled_detections = _scale_detections(detections, capture_w, capture_h, display_w, display_h)
            violations = compliance.check_compliance(detections)

            await websocket.send_json(
                {
                    "type": "frame_result",
                    "frame_id": frame_id,
                    "timestamp": timestamp,
                    "detections": scaled_detections,
                    "violations": violations,
                    "latency_ms": round(latency_ms, 2),
                }
            )
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"CRITICAL WS PPE STREAM ERROR: {exc}", flush=True)
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
        raise


def _decode_base64_frame(image_b64: str):
    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]
    try:
        data = base64.b64decode(image_b64, validate=True)
    except Exception:
        return None
    np_arr = np.frombuffer(data, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    return frame


def _scale_detections(detections: List[Dict[str, Any]], src_w: int, src_h: int, dst_w: int, dst_h: int):
    if src_w <= 0 or src_h <= 0:
        src_w, src_h = dst_w, dst_h
    scale_x = dst_w / max(src_w, 1)
    scale_y = dst_h / max(src_h, 1)
    scaled = []
    for det in detections or []:
        box = det.get("box", [0, 0, 0, 0])
        scaled_box = [
            float(box[0]) * scale_x,
            float(box[1]) * scale_y,
            float(box[2]) * scale_x,
            float(box[3]) * scale_y,
        ]
        scaled.append(
            {
                "box": scaled_box,
                "confidence": float(det.get("confidence", 0.0)),
                "class_id": det.get("class_id"),
                "class_name": det.get("class_name"),
            }
        )
    return scaled
