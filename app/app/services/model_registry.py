from threading import Lock
from typing import Optional

from app.services.model_service import YOLOModel

_model_lock = Lock()
_model_instance: Optional[YOLOModel] = None


def get_yolo_model() -> YOLOModel:
    global _model_instance
    if _model_instance is None:
        with _model_lock:
            if _model_instance is None:
                _model_instance = YOLOModel()
    return _model_instance
