from app.db.models import JobType
from app.jobs.processors import register_processor
from app.driver.dms.pipeline import DmsVideoProcessor
from app.driver.adas.pipeline import AdasVideoProcessor

register_processor(JobType.DMS_CABIN_VIDEO, DmsVideoProcessor())
register_processor(JobType.ADAS_ROAD_VIDEO, AdasVideoProcessor())
