from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.model_service import YOLOModel
from app.db.database import get_db
from app.db.models import Detection
from typing import List, Dict, Any

router = APIRouter()
model = YOLOModel()

@router.post("/detect", response_model=List[Dict[str, Any]])
async def detect_objects(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    contents = await file.read()
    try:
        detections = model.predict(contents)
        
        # Save to DB
        db_detection = Detection(result=detections)
        db.add(db_detection)
        await db.commit()
        await db.refresh(db_detection)
        
        return detections
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
