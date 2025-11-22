from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.model_service import YOLOModel
from app.services.compliance_service import ComplianceService
from app.db.database import get_db
from app.db.models import Detection, Incident
from typing import List, Dict, Any

router = APIRouter()
model = YOLOModel()
compliance_service = ComplianceService()

@router.post("/detect", response_model=Dict[str, Any])
async def detect_objects(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    contents = await file.read()
    try:
        detections = model.predict(contents)
        
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
            # Log alert (console for now)
            print(f"ALERT: {violation['violation_type']} detected! Severity: {violation['severity']}")
            
        if violations:
            await db.commit()
        
        return {
            "detections": detections,
            "violations": violations,
            "compliant": len(violations) == 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
