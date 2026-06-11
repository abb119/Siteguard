import asyncio
import base64
import json
import time
from datetime import timedelta
from typing import Any, Dict, List, Optional

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

from app.app.auth.jwt import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    Token,
    authenticate_user,
    create_access_token,
    get_current_active_user,
    require_roles,
)
from app.app.db.database import get_db
from app.app.db.models import Detection, DriverEvent, Incident, Violation
from app.app.schemas import DriverEventOut, DriverEventReview, ViolationOut, ViolationReview
from sqlalchemy import select, desc
from app.app.services.alert_service import AlertService
from app.app.services.compliance_service import ComplianceService
from app.app.services.model_registry import get_yolo_model

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
        data={"sub": user.username, "role": user.role, "company_id": user.company_id},
        expires_delta=access_token_expires,
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
async def websocket_ppe_stream(websocket: WebSocket, db: AsyncSession = Depends(get_db)):
    await websocket.accept()
    session_id = websocket.query_params.get("session_id")
    await websocket.send_json({"type": "ready"})
    model = get_yolo_model()
    compliance = ComplianceService()
    loop = asyncio.get_running_loop()
    frame_counter = 0

    try:
        while True:
            message = await websocket.receive_text()
            print(f"DEBUG_WS: Frame {frame_counter} - Received message length: {len(message)}", flush=True)

            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                print("DEBUG_WS: JSON Decode Error", flush=True)
                await websocket.send_json({"type": "error", "message": "Invalid JSON payload"})
                continue

            image_b64 = payload.get("image")
            if not image_b64:
                print("DEBUG_WS: No 'image' field in payload", flush=True)
                await websocket.send_json({"type": "error", "message": "Missing 'image' field"})
                continue

            # print(f"DEBUG_WS: Image b64 length: {len(image_b64)}", flush=True)

            frame_id = payload.get("frame_id")
            if frame_id is None:
                frame_counter += 1
                frame_id = frame_counter
            timestamp = payload.get("timestamp")
            
            frame = _decode_base64_frame(image_b64)
            if frame is None:
                print(f"DEBUG_WS: Failed to decode base64 for frame {frame_id}", flush=True)
                await websocket.send_json({"type": "error", "message": "Could not decode frame", "frame_id": frame_id})
                continue
            
            # print(f"DEBUG_WS: Frame decoded successfully. Shape: {frame.shape}", flush=True)

            ok, buffer = cv2.imencode(".jpg", frame)
            if not ok:
                print(f"DEBUG_WS: Failed to encode frame to buffer for model", flush=True)
                await websocket.send_json({"type": "error", "message": "Encoding failed", "frame_id": frame_id})
                continue

            start = time.perf_counter()
            print(f"DEBUG_WS: Sending to model.predict...", flush=True)
            detections = await loop.run_in_executor(None, lambda: model.predict(buffer.tobytes()))
            latency_ms = (time.perf_counter() - start) * 1000.0
            print(f"DEBUG_WS: Inference complete. Detections: {len(detections)}. Latency: {latency_ms:.2f}ms", flush=True)

            capture_w = int(payload.get("capture_width") or 0) or 320
            capture_h = int(payload.get("capture_height") or 0) or 240
            display_w = int(payload.get("display_width") or capture_w)
            display_h = int(payload.get("display_height") or capture_h)

            scaled_detections = _scale_detections(detections, capture_w, capture_h, display_w, display_h)
            violations = compliance.check_compliance(detections)
            if violations:
                await compliance.save_violations(violations, frame, db, session_id=session_id)

            response = {
                    "type": "frame_result",
                    "frame_id": frame_id,
                    "timestamp": timestamp,
                    "detections": scaled_detections,
                    "violations": violations,
                    "latency_ms": round(latency_ms, 2),
                }
            # print(f"DEBUG_WS: Sending response: {json.dumps(response)[:100]}...", flush=True)
            await websocket.send_json(response)
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


# ============================================
# Driver Safety WebSocket Endpoint
# ============================================
@router.websocket("/ws/driver-stream")
async def websocket_driver_stream(websocket: WebSocket):
    """
    WebSocket endpoint for real-time driver safety monitoring.
    Combines drowsiness detection + phone/distraction detection.
    """
    await websocket.accept()
    await websocket.send_json({"type": "ready"})
    
    # Lazy import to avoid circular imports
    from app.app.services.driver_model_service import get_driver_model
    
    driver_model = get_driver_model()
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
            
            frame = _decode_base64_frame(image_b64)
            if frame is None:
                await websocket.send_json({"type": "error", "message": "Could not decode frame", "frame_id": frame_id})
                continue
            
            # Encode frame as JPEG bytes for model
            ok, buffer = cv2.imencode(".jpg", frame)
            if not ok:
                await websocket.send_json({"type": "error", "message": "Failed to encode frame"})
                continue
            
            image_bytes = buffer.tobytes()
            
            # Run driver analysis in threadpool
            start_time = time.time()
            driver_results = await loop.run_in_executor(None, driver_model.predict, image_bytes)
            latency_ms = (time.time() - start_time) * 1000
            
            # Scale detections for display
            capture_w = payload.get("capture_width", 640)
            capture_h = payload.get("capture_height", 480)
            display_w = payload.get("display_width", capture_w)
            display_h = payload.get("display_height", capture_h)
            
            scaled_detections = _scale_detections(
                driver_results.get("detections", []),
                capture_w, capture_h, display_w, display_h
            )
            
            # Build response
            response = {
                "type": "result",
                "frame_id": frame_id,
                "timestamp": timestamp,
                "latency_ms": round(latency_ms, 2),
                "drowsiness": driver_results.get("drowsiness"),
                "drowsiness_confidence": driver_results.get("drowsiness_confidence", 0),
                "distractions": driver_results.get("distractions", []),
                "is_alert": driver_results.get("is_alert", True),
                "risk_level": driver_results.get("risk_level", "low"),
                "detections": scaled_detections,
            }
            
            await websocket.send_json(response)

    except WebSocketDisconnect:
        print("Driver WebSocket disconnected", flush=True)
    except Exception as e:
        print(f"Driver WebSocket error: {e}", flush=True)
        import traceback
        traceback.print_exc()
        try:
            await websocket.close()
        except:
            pass

# ============================================
# Driver Safety v2 — MediaPipe + temporal DMS
# ============================================
# COCO class ids → DMS distraction object types
_DMS_OBJECT_CLASSES = {67: "cell_phone", 41: "cup", 39: "bottle"}


def _detect_distraction_objects(model, frame):
    """Detect phone / cup / bottle (COCO) for the v2 DMS stream."""
    objs = []
    try:
        results = model(frame, imgsz=320, conf=0.35, verbose=False)
        for r in results:
            for box in r.boxes:
                obj_type = _DMS_OBJECT_CLASSES.get(int(box.cls[0].item()))
                if obj_type:
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    objs.append({
                        "type": obj_type,
                        "box": [x1, y1, x2, y2],
                        "confidence": float(box.conf[0].item()),
                    })
    except Exception:
        return []
    return objs


@router.websocket("/ws/driver-stream-v2")
async def websocket_driver_stream_v2(websocket: WebSocket, db: AsyncSession = Depends(get_db)):
    """
    Phase 1 DMS: stateful, MediaPipe-based driver monitoring.
    Computes PERCLOS, microsleep, head-off-road and a session fatigue score,
    with hysteresis so alerts don't flicker. Output is a superset of v1.
    Persists incidents (with snapshots) to the driver_events table.
    """
    await websocket.accept()
    await websocket.send_json({"type": "ready", "version": 2})

    from app.app.services.dms_realtime import DmsSession, DmsConfig
    from app.app.services.driver_event_service import DriverEventRecorder

    session = DmsSession()
    session_id = websocket.query_params.get("session_id")
    recorder = DriverEventRecorder(session_id=session_id)
    loop = asyncio.get_running_loop()
    frame_counter = 0
    last_objects: list = []

    # Custom-trained cabin model (dms_cabin.pt) takes priority: one inference
    # covers phone/drinking objects AND seatbelt state.
    last_seatbelt = None
    try:
        from app.app.services.cabin_detector_service import get_cabin_detector
        cabin_detector = get_cabin_detector()
        if not cabin_detector.available:
            cabin_detector = None
    except Exception as exc:  # pragma: no cover - optional
        print(f"DMS v2: cabin detector unavailable ({exc})", flush=True)
        cabin_detector = None

    # Fallbacks (only loaded when there is no custom model)
    phone_model = None
    seatbelt_detector = None
    if cabin_detector is None:
        try:
            from app.app.services.driver_model_service import get_driver_model
            phone_model = get_driver_model().object_model
        except Exception as exc:  # pragma: no cover - optional
            print(f"DMS v2: phone model unavailable ({exc})", flush=True)
        try:
            from app.app.services.seatbelt_service import get_seatbelt_detector
            seatbelt_detector = get_seatbelt_detector()
        except Exception as exc:  # pragma: no cover - optional
            print(f"DMS v2: seatbelt detector unavailable ({exc})", flush=True)

    try:
        while True:
            message = await websocket.receive_text()

            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON payload"})
                continue

            # Live config override (sent by the client on connect / on change)
            if payload.get("type") == "config":
                session.close()
                session = DmsSession(DmsConfig.from_overrides(payload.get("config") or {}))
                recorder._prev_active = set()
                await websocket.send_json({"type": "config_ack"})
                continue

            image_b64 = payload.get("image")
            if not image_b64:
                await websocket.send_json({"type": "error", "message": "Missing 'image' field"})
                continue

            frame_counter += 1
            frame_id = payload.get("frame_id", frame_counter)
            timestamp = payload.get("timestamp")

            frame = _decode_base64_frame(image_b64)
            if frame is None:
                await websocket.send_json({"type": "error", "message": "Could not decode frame", "frame_id": frame_id})
                continue

            t = time.perf_counter()

            if cabin_detector is not None:
                # Custom model: objects + seatbelt in one pass, every 3rd frame
                if frame_counter % 3 == 0:
                    last_objects, last_seatbelt = await loop.run_in_executor(
                        None, cabin_detector.detect, frame
                    )
            else:
                # Object detection (phone/cup/bottle) every 3rd frame to keep latency low
                if phone_model is not None and frame_counter % 3 == 0:
                    last_objects = await loop.run_in_executor(None, _detect_distraction_objects, phone_model, frame)

                # Seatbelt detection every 5th frame (separate, optional model)
                if seatbelt_detector is not None and frame_counter % 5 == 0:
                    last_seatbelt = await loop.run_in_executor(None, seatbelt_detector.detect, frame)

            start = time.time()
            result = await loop.run_in_executor(None, session.process, frame, t, last_objects, last_seatbelt)
            latency_ms = (time.time() - start) * 1000.0

            # Persist incidents (rising-edge + cooldown) with a snapshot.
            # Done before scaling so snapshot boxes match the capture frame.
            try:
                await recorder.record(result, frame, t, db)
            except Exception as rec_exc:
                print(f"DMS v2: event record failed ({rec_exc})", flush=True)

            capture_w = int(payload.get("capture_width") or 0) or frame.shape[1]
            capture_h = int(payload.get("capture_height") or 0) or frame.shape[0]
            display_w = int(payload.get("display_width") or capture_w)
            display_h = int(payload.get("display_height") or capture_h)

            result["detections"] = _scale_detections(
                result.get("detections", []), capture_w, capture_h, display_w, display_h
            )
            result["type"] = "result"
            result["frame_id"] = frame_id
            result["timestamp"] = timestamp
            result["latency_ms"] = round(latency_ms, 2)

            await websocket.send_json(result)

    except WebSocketDisconnect:
        print("Driver v2 WebSocket disconnected", flush=True)
    except Exception as e:
        print(f"Driver v2 WebSocket error: {e}", flush=True)
        import traceback
        traceback.print_exc()
    finally:
        session.close()


@router.get("/violations", response_model=List[ViolationOut])
async def get_violations(
    skip: int = 0,
    limit: int = 50,
    session_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(require_roles("admin", "company")),
):
    query = select(Violation)
    if session_id:
        query = query.filter(Violation.session_id == session_id)
    
    query = query.order_by(desc(Violation.timestamp)).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/violations/{violation_id}/review", response_model=ViolationOut)
async def review_violation(
    violation_id: int,
    review: ViolationReview,
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(require_roles("admin", "company")),
):
    query = select(Violation).where(Violation.id == violation_id)
    result = await db.execute(query)
    violation = result.scalar_one_or_none()
    
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    
    violation.is_reviewed = True
    violation.is_false_positive = review.is_false_positive
    violation.reviewer_notes = review.notes

    await db.commit()
    await db.refresh(violation)
    return violation


# ============================================
# Driver Events — history, sessions, trip report
# ============================================
_SAFETY_WEIGHTS = {
    "MICROSLEEP": 18, "DROWSY": 10, "PHONE": 8, "DISTRACTION": 6,
    "LOOK_DOWN": 6, "DRINKING": 4, "NO_FACE": 3, "YAWN": 2, "NO_SEATBELT": 8,
}


async def _assert_session_access(user, session_id: Optional[str], db: AsyncSession) -> None:
    """
    Multi-tenant scoping for driver data keyed by session_id:
      - admin: everything
      - worker: only their own username
      - company: their workers' sessions + unclaimed/demo sessions; never
        sessions belonging to another company's worker
    """
    if user.role == "admin" or session_id is None:
        if user.role == "worker" and session_id is None:
            raise HTTPException(status_code=403, detail="Workers must query their own session")
        return
    if user.role == "worker":
        if session_id != user.username:
            raise HTTPException(status_code=403, detail="Not your session")
        return
    # company: deny only if the session belongs to a different company's user
    from app.app.db.models import User as UserModel
    owner = (await db.execute(
        select(UserModel).where(UserModel.username == session_id)
    )).scalars().first()
    if owner and owner.company_id != user.company_id:
        raise HTTPException(status_code=403, detail="Session belongs to another company")


async def _foreign_worker_usernames(user, db: AsyncSession) -> set:
    """Usernames of workers from OTHER companies (to exclude for company role)."""
    from app.app.db.models import User as UserModel
    rows = (await db.execute(
        select(UserModel.username).where(
            UserModel.role == "worker", UserModel.company_id != user.company_id
        )
    )).scalars().all()
    return set(rows)


@router.get("/driver/events", response_model=List[DriverEventOut])
async def list_driver_events(
    session_id: Optional[str] = None,
    event_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(get_current_active_user),
):
    if current_user.role == "worker":
        session_id = current_user.username  # workers only see their own events
    elif session_id:
        await _assert_session_access(current_user, session_id, db)

    query = select(DriverEvent)
    if session_id:
        query = query.where(DriverEvent.session_id == session_id)
    elif current_user.role == "company":
        foreign = await _foreign_worker_usernames(current_user, db)
        if foreign:
            query = query.where(DriverEvent.session_id.notin_(foreign))
    if event_type:
        query = query.where(DriverEvent.event_type == event_type)
    query = query.order_by(desc(DriverEvent.timestamp)).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/driver/sessions")
async def list_driver_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(require_roles("admin", "company")),
):
    """Distinct monitoring sessions with a quick summary, newest first."""
    from sqlalchemy import func as safunc

    query = (
        select(
            DriverEvent.session_id,
            safunc.count(DriverEvent.id).label("events"),
            safunc.max(DriverEvent.timestamp).label("last"),
            safunc.min(DriverEvent.timestamp).label("first"),
        )
        .group_by(DriverEvent.session_id)
        .order_by(desc(safunc.max(DriverEvent.timestamp)))
    )
    if current_user.role == "company":
        foreign = await _foreign_worker_usernames(current_user, db)
        if foreign:
            query = query.where(DriverEvent.session_id.notin_(foreign))
    result = await db.execute(query)
    return [
        {"session_id": r.session_id, "events": r.events, "first": r.first, "last": r.last}
        for r in result.all()
    ]


@router.get("/driver/sessions/{session_id}/report")
async def driver_session_report(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(get_current_active_user),
):
    await _assert_session_access(current_user, session_id, db)
    query = (
        select(DriverEvent)
        .where(DriverEvent.session_id == session_id)
        .order_by(DriverEvent.timestamp)
    )
    result = await db.execute(query)
    events = result.scalars().all()

    counts: Dict[str, int] = {}
    penalty = 0.0
    max_fatigue = 0.0
    timeline = []
    for e in events:
        counts[e.event_type] = counts.get(e.event_type, 0) + 1
        penalty += _SAFETY_WEIGHTS.get(e.event_type, 3)
        if e.fatigue_score:
            max_fatigue = max(max_fatigue, e.fatigue_score)
        timeline.append({
            "id": e.id,
            "timestamp": e.timestamp,
            "event_type": e.event_type,
            "severity": e.severity,
            "fatigue_score": e.fatigue_score,
            "image_path": e.image_path,
        })

    return {
        "session_id": session_id,
        "total_events": len(events),
        "counts": counts,
        "safety_score": max(0, round(100 - penalty)),
        "max_fatigue": round(max_fatigue, 1),
        "first": events[0].timestamp if events else None,
        "last": events[-1].timestamp if events else None,
        "timeline": timeline,
    }


@router.post("/driver/events/{event_id}/review", response_model=DriverEventOut)
async def review_driver_event(
    event_id: int,
    review: DriverEventReview,
    db: AsyncSession = Depends(get_db),
    current_user: Any = Depends(require_roles("admin", "company")),
):
    result = await db.execute(select(DriverEvent).where(DriverEvent.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    await _assert_session_access(current_user, event.session_id, db)
    event.is_reviewed = True
    event.is_false_positive = review.is_false_positive
    await db.commit()
    await db.refresh(event)
    return event


# ============================================
# Safe Driving - Front Camera WebSocket
# ============================================
@router.websocket("/ws/front-cam-stream")
async def websocket_front_cam_stream(websocket: WebSocket):
    """
    WebSocket endpoint for front camera road safety analysis.
    Detects: pedestrians, vehicles, traffic lights, signs, cyclists.
    """
    await websocket.accept()
    await websocket.send_json({"type": "ready", "camera": "front"})
    
    from app.app.services.road_safety_model_service import get_road_safety_model
    
    road_model = get_road_safety_model()
    loop = asyncio.get_running_loop()
    frame_counter = 0

    try:
        while True:
            message = await websocket.receive_text()
            
            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            image_b64 = payload.get("image")
            if not image_b64:
                continue

            frame_id = payload.get("frame_id", frame_counter)
            frame_counter += 1
            timestamp = payload.get("timestamp")
            
            frame = _decode_base64_frame(image_b64)
            if frame is None:
                continue
            
            ok, buffer = cv2.imencode(".jpg", frame)
            if not ok:
                continue
            
            image_bytes = buffer.tobytes()
            capture_w = payload.get("capture_width", 640)
            
            start_time = time.time()
            results = await loop.run_in_executor(
                None, road_model.analyze_front_camera, image_bytes, capture_w
            )
            latency_ms = (time.time() - start_time) * 1000
            
            # Scale detections
            capture_h = payload.get("capture_height", 480)
            display_w = payload.get("display_width", capture_w)
            display_h = payload.get("display_height", capture_h)
            
            scaled_detections = _scale_detections(
                results.get("detections", []),
                capture_w, capture_h, display_w, display_h
            )
            
            response = {
                "type": "result",
                "camera": "front",
                "frame_id": frame_id,
                "timestamp": timestamp,
                "latency_ms": round(latency_ms, 2),
                "detections": scaled_detections,
                "alerts": results.get("alerts", []),
                "risk_level": results.get("risk_level", "low"),
                "pedestrians_count": results.get("pedestrians_count", 0),
                "vehicles_ahead": results.get("vehicles_ahead", []),
                "traffic_light": results.get("traffic_light"),
                "lead_vehicle": results.get("lead_vehicle"),
                "ttc": results.get("ttc"),
            }
            
            await websocket.send_json(response)

    except WebSocketDisconnect:
        print("Front camera WebSocket disconnected", flush=True)
    except Exception as e:
        print(f"Front camera WebSocket error: {e}", flush=True)
        import traceback
        traceback.print_exc()


# ============================================
# Safe Driving - Rear Camera WebSocket
# ============================================
@router.websocket("/ws/rear-cam-stream")
async def websocket_rear_cam_stream(websocket: WebSocket):
    """
    WebSocket endpoint for rear camera analysis.
    Detects approaching vehicles and determines if maneuvers are safe.
    """
    await websocket.accept()
    await websocket.send_json({"type": "ready", "camera": "rear"})
    
    from app.app.services.road_safety_model_service import get_road_safety_model
    
    road_model = get_road_safety_model()
    loop = asyncio.get_running_loop()
    frame_counter = 0

    try:
        while True:
            message = await websocket.receive_text()
            
            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            image_b64 = payload.get("image")
            if not image_b64:
                continue

            frame_id = payload.get("frame_id", frame_counter)
            frame_counter += 1
            timestamp = payload.get("timestamp")
            
            frame = _decode_base64_frame(image_b64)
            if frame is None:
                continue
            
            ok, buffer = cv2.imencode(".jpg", frame)
            if not ok:
                continue
            
            image_bytes = buffer.tobytes()
            capture_w = payload.get("capture_width", 640)
            
            start_time = time.time()
            results = await loop.run_in_executor(
                None, road_model.analyze_rear_camera, image_bytes, capture_w
            )
            latency_ms = (time.time() - start_time) * 1000
            
            # Scale detections
            capture_h = payload.get("capture_height", 480)
            display_w = payload.get("display_width", capture_w)
            display_h = payload.get("display_height", capture_h)
            
            scaled_detections = _scale_detections(
                results.get("detections", []),
                capture_w, capture_h, display_w, display_h
            )
            
            response = {
                "type": "result",
                "camera": "rear",
                "frame_id": frame_id,
                "timestamp": timestamp,
                "latency_ms": round(latency_ms, 2),
                "detections": scaled_detections,
                "alerts": results.get("alerts", []),
                "risk_level": results.get("risk_level", "low"),
                "safe_to_maneuver": results.get("safe_to_maneuver", True),
                "closest_vehicle_distance": results.get("closest_vehicle_distance"),
                "approaching_vehicles": results.get("approaching_vehicles", []),
                "approach_speed_kmh": results.get("approach_speed_kmh", 0),
                "approach_status": results.get("approach_status", "stable"),
            }
            
            await websocket.send_json(response)

    except WebSocketDisconnect:
        print("Rear camera WebSocket disconnected", flush=True)
    except Exception as e:
        print(f"Rear camera WebSocket error: {e}", flush=True)
        import traceback
        traceback.print_exc()


# ============================================
# ERGONOMICS WEBSOCKET ENDPOINT
# ============================================
from app.app.services.ergonomics_model_service import get_ergonomics_model


def _scale_ergonomics_detections(detections, src_w: int, src_h: int, dst_w: int, dst_h: int):
    """Scale ergonomics detections including keypoints."""
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
        
        # Scale keypoints as well
        keypoints = det.get("keypoints", [])
        scaled_keypoints = []
        for kp in keypoints:
            if len(kp) >= 2:
                scaled_kp = [
                    float(kp[0]) * scale_x,
                    float(kp[1]) * scale_y,
                    float(kp[2]) if len(kp) > 2 else 1.0  # confidence
                ]
                scaled_keypoints.append(scaled_kp)
            else:
                scaled_keypoints.append(kp)
        
        scaled.append({
            "box": scaled_box,
            "keypoints": scaled_keypoints,
            "posture_score": det.get("posture_score", 100),
            "issues": det.get("issues", []),
        })
    return scaled

@router.websocket("/ws/ergonomics-stream")
async def websocket_ergonomics_stream(websocket: WebSocket):
    """WebSocket endpoint for ergonomics (posture) analysis."""
    await websocket.accept()
    ergo_model = get_ergonomics_model()
    loop = asyncio.get_event_loop()
    
    try:
        await websocket.send_json({"type": "ready", "message": "Ergonomics stream ready"})
        
        while True:
            message = await websocket.receive_text()
            payload = json.loads(message)
            
            image_b64 = payload.get("image")
            frame_id = payload.get("frame_id", 0)
            timestamp = payload.get("timestamp", 0)
            
            if not image_b64:
                continue
            
            frame = _decode_base64_frame(image_b64)
            if frame is None:
                continue
            
            ok, buffer = cv2.imencode(".jpg", frame)
            if not ok:
                continue
            
            image_bytes = buffer.tobytes()
            capture_w = payload.get("capture_width", 640)
            
            # print("DEBUG_ERGO: Analyzing frame...", flush=True)
            start_time = time.time()
            results = await loop.run_in_executor(
                None, ergo_model.analyze_frame, image_bytes, capture_w
            )
            # print(f"DEBUG_ERGO: Result keys: {results.keys()}", flush=True)
            latency_ms = (time.time() - start_time) * 1000
            
            # Scale detections
            capture_h = payload.get("capture_height", 480)
            display_w = payload.get("display_width", capture_w)
            display_h = payload.get("display_height", capture_h)
            
            scaled_detections = _scale_ergonomics_detections(
                results.get("detections", []),
                capture_w, capture_h, display_w, display_h
            )
            
            response = {
                "type": "result",
                "frame_id": frame_id,
                "timestamp": timestamp,
                "latency_ms": round(latency_ms, 2),
                "detections": scaled_detections,
                "people_count": results.get("people_count", 0),
                "posture_issues": results.get("posture_issues", []),
                "avg_posture_score": results.get("avg_posture_score", 100),
                "risk_level": results.get("risk_level", "low"),
            }
            
            await websocket.send_json(response)

    except WebSocketDisconnect:
        print("Ergonomics WebSocket disconnected", flush=True)
    except Exception as e:
        print(f"Ergonomics WebSocket error: {e}", flush=True)
        import traceback
        traceback.print_exc()


# ============================================
# VEHICLE CONTROL WEBSOCKET ENDPOINT
# ============================================
from app.app.services.vehicle_control_model_service import get_vehicle_control_model

@router.websocket("/ws/vehicle-control-stream")
async def websocket_vehicle_control_stream(websocket: WebSocket):
    """WebSocket endpoint for vehicle-person proximity detection."""
    await websocket.accept()
    vehicle_model = get_vehicle_control_model()
    loop = asyncio.get_event_loop()
    
    try:
        await websocket.send_json({"type": "ready", "message": "Vehicle control stream ready"})
        
        while True:
            message = await websocket.receive_text()
            payload = json.loads(message)
            
            image_b64 = payload.get("image")
            frame_id = payload.get("frame_id", 0)
            timestamp = payload.get("timestamp", 0)
            
            if not image_b64:
                continue
            
            frame = _decode_base64_frame(image_b64)
            if frame is None:
                continue
            
            ok, buffer = cv2.imencode(".jpg", frame)
            if not ok:
                continue
            
            image_bytes = buffer.tobytes()
            capture_w = payload.get("capture_width", 640)
            
            start_time = time.time()
            results = await loop.run_in_executor(
                None, vehicle_model.analyze_frame, image_bytes, capture_w
            )
            latency_ms = (time.time() - start_time) * 1000
            
            # Scale detections
            capture_h = payload.get("capture_height", 480)
            display_w = payload.get("display_width", capture_w)
            display_h = payload.get("display_height", capture_h)
            
            scaled_detections = _scale_detections(
                results.get("detections", []),
                capture_w, capture_h, display_w, display_h
            )
            
            response = {
                "type": "result",
                "frame_id": frame_id,
                "timestamp": timestamp,
                "latency_ms": round(latency_ms, 2),
                "detections": scaled_detections,
                "people_count": results.get("people_count", 0),
                "vehicles_count": results.get("vehicles_count", 0),
                "proximity_alerts": results.get("proximity_alerts", []),
                "closest_distance": results.get("closest_distance"),
                "risk_level": results.get("risk_level", "low"),
            }
            
            await websocket.send_json(response)

    except WebSocketDisconnect:
        print("Vehicle Control WebSocket disconnected", flush=True)
    except Exception as e:
        print(f"Vehicle Control WebSocket error: {e}", flush=True)
        import traceback
        traceback.print_exc()



