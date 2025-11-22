from fastapi import FastAPI
from app.api import routes

from contextlib import asynccontextmanager
from app.db.database import engine, Base
from prometheus_fastapi_instrumentator import Instrumentator

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(title="SiteGuard API", version="0.1.0", lifespan=lifespan)

# Instrumentator
Instrumentator().instrument(app).expose(app)

app.include_router(routes.router)

@app.get("/")
async def root():
    return {"message": "SiteGuard API is running"}
