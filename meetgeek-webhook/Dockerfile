# Backend: Unified FastAPI app (webhooks + meetings API + synthesis + reports + deltas)
# Build: docker build -t ai-synthesis-backend -f meetgeek-webhook/Dockerfile meetgeek-webhook
# Run:  docker run -p 8021:8021 -e OPENAI_API_KEY=... -e MONGODB_URI=... -e MONGODB_DB_NAME=... ai-synthesis-backend

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install backend + synthesis_agent dependencies
COPY requirements.txt .
COPY synthesis_agent/requirements.txt synthesis_agent/
RUN pip install --no-cache-dir -r requirements.txt -r synthesis_agent/requirements.txt

# Copy application (synthesis engine + webhook + REST API + migrations)
COPY synthesis_agent/ synthesis_agent/
COPY webhook.py config.py database.py api.py ./
COPY migrations/ migrations/

WORKDIR /app

# No .env in image; pass OPENAI_API_KEY, OPENROUTER_API_KEY, MONGODB_URI, MONGODB_DB_NAME at runtime
EXPOSE 8021

# Run unified app (main.app re-exports synthesis_agent.server.app)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8021"]
