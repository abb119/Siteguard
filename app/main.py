from fastapi import FastAPI

from app.api import routes

from contextlib import asynccontextmanager
from app.db.database import engine, Base
from prometheus_fastapi_instrumentator import Instrumentator

app = FastAPI(title="SiteGuard API", version="0.1.0")

# Instrumentator
Instrumentator().instrument(app).expose(app)

app.include_router(routes.router)

@app.get("/")
async def root():
    return {"message": "SiteGuard API is running"}
