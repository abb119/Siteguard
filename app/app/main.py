import asyncio
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from prometheus_fastapi_instrumentator import Instrumentator

from app.app.api import jobs_routes, routes
from app.app.db import models  # noqa: F401
from app.app.db.database import Base, engine
from app.app.db.seed_db import seed_users
from app.app.jobs.cleanup import cleanup_loop
from app.app.jobs.worker import job_worker_loop

try:  # Optional video processors (ADAS/DMS)
    import app.app.driver  # noqa: F401
except Exception as exc:  # pragma: no cover - optional dependency
    print(f"WARNING: Skipping driver processors ({exc})")

# FIX: Force correct event loop policy for Windows + Asyncpg
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

@asynccontextmanager
async def lifespan(app: FastAPI):
    import torch

    print(f"DEBUG: CUDA Available: {torch.cuda.is_available()}", flush=True)
    if torch.cuda.is_available():
        print(f"DEBUG: GPU Name: {torch.cuda.get_device_name(0)}", flush=True)
    else:
        print("DEBUG: Running on CPU", flush=True)

    MAX_RETRIES = 15
    RETRY_DELAY = 2

    for attempt in range(MAX_RETRIES):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            print("INFO: Database Connected Successfully!", flush=True)
            break
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                print(f"WARNING: DB Connection failed ({e}). Retrying in {RETRY_DELAY}s... ({attempt+1}/{MAX_RETRIES})", flush=True)
                await asyncio.sleep(RETRY_DELAY)
            else:
                print("CRITICAL: Could not connect to DB after multiple retries.", flush=True)
                raise e
    
    await seed_users()

    worker_task = (
        asyncio.create_task(job_worker_loop())
        if os.getenv("DISABLE_JOB_WORKER") != "1"
        else None
    )
    cleanup_task = (
        asyncio.create_task(cleanup_loop())
        if os.getenv("DISABLE_JOB_CLEANUP") != "1"
        else None
    )

    try:
        yield
    finally:
        tasks = [t for t in (worker_task, cleanup_task) if t]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

app = FastAPI(title="SiteGuard API", version="0.1.0", lifespan=lifespan)

frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
allowed_origins = {
    frontend_origin.rstrip("/"),
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}
allowed_origins = [origin for origin in allowed_origins if origin]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instrumentator
Instrumentator().instrument(app).expose(app)

# Include API routers
app.include_router(routes.router)
app.include_router(jobs_routes.router)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    import time
    start_time = time.time()
    print(f"DEBUG: Request STARTED: {request.method} {request.url}", flush=True)
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        print(f"DEBUG: Request COMPLETED: {request.method} {request.url} Status: {response.status_code} Time: {process_time:.2f}s", flush=True)
        return response
    except Exception as e:
        print(f"DEBUG: Request FAILED: {request.method} {request.url} Error: {e}", flush=True)
        raise e

app.mount("/static", StaticFiles(directory="app/app/static"), name="static")

@app.get("/")
async def root():
    return {"message": "SiteGuard API is running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/video-stream")
async def video_stream_page():
    return FileResponse("app/static/video_stream.html")
