# Backend: Synthesis API (FastAPI + MongoDB + GPT-4o)
# Build: docker build -t ai-synthesis-backend -f meetgeek-webhook/Dockerfile meetgeek-webhook
# Run:  docker run -p 8003:8003 -e OPENAI_API_KEY=... -e MONGODB_URI=... ai-synthesis-backend

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install backend + synthesis_agent dependencies
COPY requirements.txt .
COPY synthesis_agent/requirements.txt synthesis_agent/
RUN pip install --no-cache-dir -r requirements.txt -r synthesis_agent/requirements.txt

# Copy application
COPY synthesis_agent/ synthesis_agent/

WORKDIR /app/synthesis_agent

# No .env in image; pass OPENAI_API_KEY, MONGODB_URI, MONGODB_DB_NAME at runtime
EXPOSE 8003

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8003"]
