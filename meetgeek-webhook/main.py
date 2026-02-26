"""
MeetGeek Webhook System: FastAPI app, routers, health check, startup DB init.
"""
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from database import init_db
from webhook import router as webhook_router
from api import router as api_router

# Configure logging
settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create DB tables if DB is available. Shutdown: nothing."""
    try:
        await init_db()
    except Exception as e:
        logger.warning("Database init skipped (set MONGODB_URI and ensure MongoDB is reachable): %s", e)
    yield
    # Shutdown cleanup if needed
    pass


app = FastAPI(
    title="MeetGeek Webhook System",
    description="Receive MeetGeek webhooks, store transcripts, run AI analysis, query via REST API.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s %s %.2fms",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


# Routers
app.include_router(webhook_router)
app.include_router(api_router)


@app.get("/health")
async def health():
    """Health check for load balancers and monitoring."""
    return {"status": "ok", "service": "meetgeek-webhook"}


if __name__ == "__main__":
    import uvicorn
    port = get_settings().port
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
