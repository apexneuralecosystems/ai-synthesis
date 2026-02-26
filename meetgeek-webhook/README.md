# MeetGeek Webhook System

Production-ready webhook receiver that accepts meeting transcripts from MeetGeek, verifies webhooks with HMAC SHA256, stores data in PostgreSQL, runs AI analysis (OpenAI GPT-4), and exposes a REST API to query meetings and insights.

## Tech Stack

- **Backend:** Python 3.11+, FastAPI
- **Database:** PostgreSQL with asyncpg (async)
- **ORM:** SQLAlchemy 2 (async)
- **AI:** OpenAI API (GPT-4)
- **Config:** python-dotenv, pydantic-settings
- **Server:** Uvicorn

## Project Structure

```
meetgeek-webhook/
├── main.py          # FastAPI app, CORS, logging, health, startup
├── webhook.py       # POST /webhook/meetgeek — verify & store
├── database.py      # Async DB connection, pool, CRUD
├── models.py        # SQLAlchemy models (Meeting, RawWebhook)
├── ai_engine.py     # OpenAI transcript analysis
├── api.py           # REST API & dashboard
├── config.py        # Centralized env config
├── .env.example     # Example environment variables
├── requirements.txt
└── README.md
```

## Setup

### 1. Virtual environment (outside `meet`)

The project uses a shared venv at **`ml/ai-synthesis-venv`** (one level above `meet`), so the repo stays venv-free.

```bash
cd meetgeek-webhook
# Activate venv (from ai-synthesis/meetgeek-webhook: ../../../ai-synthesis-venv)
source ../../../ai-synthesis-venv/bin/activate   # Linux/macOS
# Windows: ..\..\..\ai-synthesis-venv\Scripts\activate
pip install -r requirements.txt
pip install -r synthesis_agent/requirements.txt
```

To create the venv in that location if it doesn’t exist:

```bash
python3 -m venv ../../../ai-synthesis-venv
source ../../../ai-synthesis-venv/bin/activate
pip install -r requirements.txt
pip install -r synthesis_agent/requirements.txt
```

### 2. Environment variables

Copy the example env and set real values (never commit `.env`):

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Description |
|----------|-------------|
| `MEETGEEK_SECRET` | Secret key from MeetGeek (for webhook HMAC verification) |
| `DATABASE_URL` | PostgreSQL URL, e.g. `postgresql://user:password@localhost:5432/meetgeek_db` (sync URL is OK; app uses `postgresql+asyncpg` internally) |
| `OPENAI_API_KEY` | OpenAI API key for transcript analysis |
| `PORT` | Server port (default 8000) |
| `LOG_LEVEL` | Optional: DEBUG, INFO, WARNING, ERROR |
| `PUBLIC_API_KEY` | Optional: if set, all public API endpoints require this key (see [Public API](#public-api-auth)) |

### 3. Database

**Option A – SQLite (default)**  
Leave `DATABASE_URL` as `sqlite+aiosqlite:///./meetgeek.db`. Tables are created on first run.

**Option B – PostgreSQL (migrations)**  
1. Create user and database once: see [docs/postgres-setup.md](docs/postgres-setup.md).  
2. Set `DATABASE_URL=postgresql://user:password@localhost:5432/meetgeek_db` in `.env`.  
3. Run migrations: `alembic upgrade head`.  
4. Start the app: `uvicorn main:app --reload --port 8000`.

## Configure MeetGeek Webhook

1. **Webhook URL:** `https://<your-host>/webhook/meetgeek`
2. **Secret key:** Set the same value as `MEETGEEK_SECRET` in MeetGeek and in your `.env`.

Supported events:

- `meeting.completed`
- `transcript.ready`
- `summary.ready`

Raw payloads are stored in `raw_webhooks`; meeting data is upserted into `meetings` and AI processing is triggered after each webhook.

## Run locally

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

- API: http://localhost:8000  
- Docs: http://localhost:8000/docs  
- Health: http://localhost:8000/health  

## Test with ngrok

To receive real webhooks from MeetGeek on your machine:

```bash
# Terminal 1: run app
uvicorn main:app --reload --port 8000

# Terminal 2: expose with ngrok
ngrok http 8000
```

Use the HTTPS URL ngrok gives you, e.g.:

- **Webhook URL in MeetGeek:** `https://abc123.ngrok.io/webhook/meetgeek`
- **Secret key:** same as `MEETGEEK_SECRET` in `.env`

## Public API (auth)

All query endpoints (e.g. `GET /meetings`, `GET /dashboard`, `GET /meetings/{id}`, search, transcript, ai-insights, delete) are the **public API**.  

- **If `PUBLIC_API_KEY` is not set:** no authentication; anyone can call these endpoints.
- **If `PUBLIC_API_KEY` is set:** every request must include either:
  - Header: `X-API-Key: <your-public-api-key>`, or
  - Header: `Authorization: Bearer <your-public-api-key>`

Example with API key:

```bash
curl -H "X-API-Key: your-public-api-key" https://your-host/meetings
curl -H "Authorization: Bearer your-public-api-key" https://your-host/dashboard
```

The webhook endpoint `POST /webhook/meetgeek` is **not** protected by the public API key; it uses MeetGeek signature verification only.

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/webhook/meetgeek` | MeetGeek webhook (HMAC verified) |
| GET | `/meetings` | List meetings (paginated) |
| GET | `/meetings/search?q=keyword` | Search transcripts/titles |
| GET | `/meetings/{meeting_id}` | Get one meeting (full transcript) |
| GET | `/meetings/{meeting_id}/transcript` | Transcript only |
| GET | `/meetings/{meeting_id}/ai-insights` | AI analysis and insights |
| DELETE | `/meetings/{meeting_id}` | Delete a meeting |
| GET | `/dashboard` | Stats + latest 5 meetings |

### Example responses

**GET /meetings?skip=0&limit=10**

```json
{
  "meetings": [
    {
      "id": "uuid",
      "meeting_id": "meetgeek-id",
      "title": "Weekly sync",
      "date": "2025-02-26T10:00:00Z",
      "duration": 3600,
      "processed": true,
      "created_at": "2025-02-26T11:00:00Z"
    }
  ],
  "total": 1,
  "skip": 0,
  "limit": 10
}
```

**GET /meetings/{meeting_id}/ai-insights**

```json
{
  "meeting_id": "meetgeek-id",
  "processed": true,
  "ai_analysis": "Executive summary text...",
  "ai_insights": {
    "executive_summary": "...",
    "key_decisions": ["Decision 1", "Decision 2"],
    "action_items": [{"item": "Task", "owner": "Name", "due": null}],
    "risks_or_blockers": [],
    "sentiment": "positive",
    "topics": ["Topic 1", "Topic 2"]
  }
}
```

**GET /dashboard**

```json
{
  "total_meetings": 42,
  "total_transcripts_processed": 40,
  "meetings_processed_by_ai": 38,
  "latest_meetings": [...]
}
```

## Deploy to production

- **Railway / Render / Fly.io:** Set env vars in the dashboard (`MEETGEEK_SECRET`, `DATABASE_URL`, `OPENAI_API_KEY`, `PORT`). Use a managed PostgreSQL and point `DATABASE_URL` to it. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`.
- **Docker:** Use a Dockerfile that installs dependencies and runs `uvicorn main:app --host 0.0.0.0 --port 8000`; pass env via `-e` or env file.
- **Security:** Use HTTPS; keep `MEETGEEK_SECRET` and `OPENAI_API_KEY` in env only; restrict CORS in production if needed.

## Error handling

- Webhook signature failures return `401`.
- Invalid JSON in webhook returns `400`.
- If AI processing fails, the transcript is still saved; processing is retried up to 3 times and errors are logged.
- All errors are logged with timestamps.

## Database schema (reference)

- **meetings:** id (UUID), meeting_id (unique), title, date, duration, participants (JSONB), transcript, summary, highlights, action_items, ai_analysis, ai_insights, processed, created_at, updated_at.
- **raw_webhooks:** id (UUID), event_type, payload (JSONB), received_at.
