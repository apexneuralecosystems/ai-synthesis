"""
ApexNeural Agent Factory - AI Synthesis Backend.
GPT-4o engine. MongoDB for meetings, reports, and delta analyses.
"""
import json
import logging
import os
import random
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import certifi
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pymongo import MongoClient, DESCENDING

load_dotenv()
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Allow importing webhook router from parent (meetgeek-webhook) when running from synthesis_agent
_base = Path(__file__).resolve().parent.parent
if str(_base) not in sys.path:
    sys.path.insert(0, str(_base))

from webhook import router as webhook_router

BASE_DIR = Path(__file__).resolve().parent
PROMPTS_DIR = BASE_DIR / "prompts"
SCHEMAS_DIR = BASE_DIR / "schemas"

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
MONGODB_URI = os.environ.get("MONGODB_URI", "")
MONGODB_DB = os.environ.get("MONGODB_DB_NAME", "meetgeek")
# Use TLS CA only for mongodb+srv (Atlas). Plain mongodb:// (e.g. internal) uses no TLS by default.
MONGODB_TLS_INSECURE = os.environ.get("MONGODB_TLS_INSECURE", "").lower() in ("1", "true", "yes")
VALID_CALL_TYPES = ("CEO", "Operations", "Tech")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("synthesis")

app = FastAPI(title="ApexNeural Agent Factory", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(webhook_router)


@app.get("/")
def root():
    """Root route for health checks and load balancers."""
    return {"service": "ApexNeural Agent Factory", "docs": "/docs"}


# ═══════════════ MongoDB ═══════════════

_client: MongoClient | None = None

def get_db():
    global _client
    if _client is None:
        if not MONGODB_URI:
            raise HTTPException(500, "MONGODB_URI not configured")
        opts: dict[str, Any] = {"serverSelectionTimeoutMS": 20000}
        uri = MONGODB_URI.strip()
        # Only use TLS/CA for mongodb+srv (Atlas). Plain mongodb:// often has no TLS.
        if "mongodb+srv" in uri:
            opts["tlsCAFile"] = certifi.where()
            if MONGODB_TLS_INSECURE:
                opts["tlsAllowInvalidCertificates"] = True
        _client = MongoClient(MONGODB_URI, **opts)
    return _client[MONGODB_DB]


def ensure_collections():
    """Create indexes for pain_reports and delta_reports on startup."""
    db = get_db()
    db["pain_reports"].create_index("call_id", unique=True, sparse=True)
    db["pain_reports"].create_index("meeting_id")
    db["pain_reports"].create_index("created_at")
    db["delta_reports"].create_index("created_at")
    logger.info("MongoDB indexes ensured")


def serialize(doc: dict) -> dict:
    """Convert MongoDB doc to JSON-safe dict."""
    if doc is None:
        return {}
    out = {}
    for k, v in doc.items():
        if k == "_id":
            out["_id"] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, ObjectId):
            out[k] = str(v)
        else:
            out[k] = v
    return out


# ═══════════════ LLM ═══════════════

def call_gpt4o(system_prompt: str, user_message: str) -> tuple[str, dict]:
    """Call GPT-4o. Returns (text, usage)."""
    import openai
    if not OPENAI_API_KEY:
        raise HTTPException(500, "OPENAI_API_KEY not set")
    client = openai.OpenAI(api_key=OPENAI_API_KEY)
    start = time.time()
    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_message}],
        temperature=0.2,
    )
    elapsed = time.time() - start
    text = resp.choices[0].message.content or ""
    usage = {
        "model": "gpt-4o",
        "input_tokens": resp.usage.prompt_tokens,
        "output_tokens": resp.usage.completion_tokens,
        "elapsed_seconds": round(elapsed, 2),
    }
    logger.info("GPT-4o: %d in / %d out, %.1fs", usage["input_tokens"], usage["output_tokens"], elapsed)
    return text, usage


# ═══════════════ Helpers ═══════════════

def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8")


def parse_json_response(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        end = len(lines)
        for i in range(len(lines) - 1, 0, -1):
            if lines[i].strip().startswith("```"):
                end = i
                break
        text = "\n".join(lines[1:end])
    return json.loads(text)


def extract_transcript_text(meeting: dict) -> str:
    """Build plain text from transcript_sentences or raw transcript."""
    sentences = meeting.get("transcript_sentences") or []
    if sentences:
        parts = []
        for s in sentences:
            speaker = s.get("speaker", "Unknown")
            txt = s.get("text", "")
            if txt:
                parts.append(f"{speaker}: {txt}")
        if parts:
            return "\n\n".join(parts)
    raw = meeting.get("transcript", "")
    return raw if isinstance(raw, str) else ""


def spot_check_quotes(report: dict, transcript: str) -> list[dict]:
    all_quotes: list[str] = []
    for pp in report.get("report_card", {}).get("pain_points", []):
        all_quotes.extend(pp.get("source_quotes", []))
    if not all_quotes:
        return []
    sample = random.sample(all_quotes, min(5, len(all_quotes)))
    t_lower = transcript.lower()
    return [{"quote": q[:100], "found": q.lower() in t_lower} for q in sample]


# ═══════════════ Pydantic Models ═══════════════

class SynthesizeReq(BaseModel):
    meeting_id: str
    call_type: str
    interviewer: str = "Anshul Jain"

class DeltaReq(BaseModel):
    report_ids: list[str]


# ═══════════════ Startup ═══════════════

@app.on_event("startup")
async def startup():
    ensure_collections()


# ═══════════════ Meeting Endpoints ═══════════════

@app.get("/api/health")
async def health():
    return {"status": "ok", "llm": "gpt-4o", "api_key_set": bool(OPENAI_API_KEY)}


@app.get("/api/meetings")
async def list_meetings():
    """List all meetings with essential fields."""
    db = get_db()
    cursor = db["meetings"].find({}, {
        "meeting_id": 1, "title": 1, "date": 1, "date_end": 1,
        "duration": 1, "participants": 1, "source": 1,
        "host_email": 1, "language": 1, "_id": 0,
    }).sort("date", DESCENDING)
    meetings = []
    for m in cursor:
        if isinstance(m.get("date"), datetime):
            m["date"] = m["date"].isoformat()
        if isinstance(m.get("date_end"), datetime):
            m["date_end"] = m["date_end"].isoformat()
        has_transcript = False
        full = db["meetings"].find_one({"meeting_id": m["meeting_id"]}, {"transcript_sentences": 1, "transcript": 1, "_id": 0})
        if full:
            sents = full.get("transcript_sentences") or []
            has_transcript = len(sents) > 0 or bool(full.get("transcript", "").strip())
        m["has_transcript"] = has_transcript
        meetings.append(m)
    return meetings


@app.get("/api/meetings/{meeting_id}")
async def get_meeting(meeting_id: str):
    """Full meeting with transcript sentences."""
    db = get_db()
    doc = db["meetings"].find_one({"meeting_id": meeting_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Meeting not found")
    if isinstance(doc.get("date"), datetime):
        doc["date"] = doc["date"].isoformat()
    if isinstance(doc.get("date_end"), datetime):
        doc["date_end"] = doc["date_end"].isoformat()
    doc["transcript_text"] = extract_transcript_text(doc)
    return doc


# ═══════════════ Pain Report Endpoints ═══════════════

@app.get("/api/reports")
async def list_reports():
    """List all pain reports from DB."""
    db = get_db()
    cursor = db["pain_reports"].find({}, {
        "call_id": 1, "meeting_id": 1, "meeting_title": 1,
        "call_type": 1, "created_at": 1, "usage": 1, "_id": 1,
        "report_card.pain_validity_score": 1,
        "report_card.executive_summary": 1,
        "report_card.pain_points": 1,
    }).sort("created_at", DESCENDING)
    results = []
    for doc in cursor:
        card = doc.get("report_card", {})
        results.append({
            "_id": str(doc["_id"]),
            "call_id": doc.get("call_id", ""),
            "meeting_id": doc.get("meeting_id", ""),
            "meeting_title": doc.get("meeting_title", ""),
            "call_type": doc.get("call_type", ""),
            "created_at": doc.get("created_at", ""),
            "pain_count": len(card.get("pain_points", [])),
            "validity_score": card.get("pain_validity_score"),
            "summary": (card.get("executive_summary") or "")[:200],
        })
    return results


@app.get("/api/reports/{report_id}")
async def get_report(report_id: str):
    """Get a single pain report."""
    db = get_db()
    try:
        doc = db["pain_reports"].find_one({"_id": ObjectId(report_id)})
    except Exception:
        doc = db["pain_reports"].find_one({"call_id": report_id})
    if not doc:
        raise HTTPException(404, "Report not found")
    return serialize(doc)


@app.delete("/api/reports/{report_id}")
async def delete_report(report_id: str):
    db = get_db()
    try:
        result = db["pain_reports"].delete_one({"_id": ObjectId(report_id)})
    except Exception:
        result = db["pain_reports"].delete_one({"call_id": report_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Report not found")
    return {"status": "deleted"}


# ═══════════════ Synthesis ═══════════════

@app.post("/api/synthesize")
async def synthesize(req: SynthesizeReq):
    """Synthesize a meeting transcript into a Pain Report Card. Stored in MongoDB."""
    if req.call_type not in VALID_CALL_TYPES:
        raise HTTPException(400, f"call_type must be one of {VALID_CALL_TYPES}")

    db = get_db()
    meeting = db["meetings"].find_one({"meeting_id": req.meeting_id}, {"_id": 0})
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    transcript = extract_transcript_text(meeting)
    if not transcript.strip():
        raise HTTPException(400, "Meeting has no transcript text")

    title = meeting.get("title", req.meeting_id)
    call_id = f"{req.meeting_id[:8]}-{req.call_type[:3].upper()}"

    system_prompt = load_prompt("synthesis_system.txt")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    user_msg = (
        f"CALL TYPE: {req.call_type}\nCALL ID: {call_id}\nDATE: {today}\n"
        f"INTERVIEWER: {req.interviewer}\nTRANSCRIPT FILE: {title}\n\n"
        f"--- TRANSCRIPT START ---\n{transcript}\n--- TRANSCRIPT END ---"
    )

    try:
        text, usage = call_gpt4o(system_prompt, user_msg)
        data = parse_json_response(text)
    except json.JSONDecodeError:
        raise HTTPException(500, "LLM returned invalid JSON")
    except Exception as e:
        raise HTTPException(500, str(e))

    # Auto-repair schema errors
    try:
        import jsonschema
        schema = json.loads((SCHEMAS_DIR / "pain_report_card.json").read_text(encoding="utf-8"))
        errors = list(jsonschema.Draft7Validator(schema).iter_errors(data))
        if errors:
            repair_msg = (
                "Fix ALL schema errors, return ONLY corrected JSON.\n\nERRORS:\n"
                + "\n".join(f"- {e.message}" for e in errors[:10]) + "\n\n"
                f"JSON:\n{json.dumps(data, indent=2)}"
            )
            text2, usage2 = call_gpt4o(system_prompt, repair_msg)
            data = parse_json_response(text2)
            usage["input_tokens"] += usage2["input_tokens"]
            usage["output_tokens"] += usage2["output_tokens"]
            usage["elapsed_seconds"] += usage2["elapsed_seconds"]
    except Exception:
        pass

    quotes = spot_check_quotes(data, transcript)

    report_doc = {
        "call_id": call_id,
        "meeting_id": req.meeting_id,
        "meeting_title": title,
        "call_type": req.call_type,
        "interviewer": req.interviewer,
        "report_card": data.get("report_card", data),
        "quote_check": quotes,
        "usage": usage,
        "created_at": datetime.now(timezone.utc),
    }

    existing = db["pain_reports"].find_one({"call_id": call_id})
    if existing:
        db["pain_reports"].replace_one({"call_id": call_id}, report_doc)
        report_doc["_id"] = existing["_id"]
    else:
        result = db["pain_reports"].insert_one(report_doc)
        report_doc["_id"] = result.inserted_id

    return {
        "status": "ok",
        "report_id": str(report_doc["_id"]),
        "call_id": call_id,
        "report": serialize(report_doc),
        "quote_check": quotes,
        "usage": usage,
    }


# ═══════════════ Delta Endpoints ═══════════════

@app.get("/api/deltas")
async def list_deltas():
    """List all delta reports."""
    db = get_db()
    cursor = db["delta_reports"].find({}).sort("created_at", DESCENDING)
    results = []
    for doc in cursor:
        dr = doc.get("delta_report", {})
        meta = dr.get("meta", {})
        oa = dr.get("overall_assessment", {})
        results.append({
            "_id": str(doc["_id"]),
            "source_calls": meta.get("source_calls", []),
            "source_call_types": meta.get("source_call_types", []),
            "readiness": oa.get("readiness_for_proposal", ""),
            "signal_strength": oa.get("signal_strength", ""),
            "agreements_count": len(dr.get("agreements", [])),
            "contradictions_count": len(dr.get("contradictions", [])),
            "focus_count": len(dr.get("recommended_focus", [])),
            "created_at": doc.get("created_at", ""),
        })
    return results


@app.get("/api/deltas/{delta_id}")
async def get_delta(delta_id: str):
    db = get_db()
    doc = db["delta_reports"].find_one({"_id": ObjectId(delta_id)})
    if not doc:
        raise HTTPException(404, "Delta report not found")
    return serialize(doc)


@app.delete("/api/deltas/{delta_id}")
async def delete_delta(delta_id: str):
    db = get_db()
    result = db["delta_reports"].delete_one({"_id": ObjectId(delta_id)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"status": "deleted"}


@app.post("/api/delta")
async def run_delta(req: DeltaReq):
    """Run cross-session delta analysis. Input: list of pain report _id strings."""
    if len(req.report_ids) < 2:
        raise HTTPException(400, "Select at least 2 reports")

    db = get_db()
    cards: list[dict] = []
    for rid in req.report_ids:
        try:
            doc = db["pain_reports"].find_one({"_id": ObjectId(rid)})
        except Exception:
            doc = db["pain_reports"].find_one({"call_id": rid})
        if not doc:
            raise HTTPException(404, f"Report not found: {rid}")
        rc = doc.get("report_card", {})
        cards.append({"report_card": rc})

    system_prompt = load_prompt("delta_system.txt")
    parts = ["Below are the Pain Report Cards to compare:\n"]
    for i, rc in enumerate(cards, 1):
        meta = rc.get("report_card", {}).get("meta", {})
        parts.append(f"--- REPORT {i}: {meta.get('call_id', '?')} ({meta.get('call_type', '?')}) ---")
        parts.append(json.dumps(rc, indent=2))
    user_msg = "\n".join(parts)

    try:
        text, usage = call_gpt4o(system_prompt, user_msg)
        delta = parse_json_response(text)
    except json.JSONDecodeError:
        raise HTTPException(500, "LLM returned invalid JSON for delta")
    except Exception as e:
        raise HTTPException(500, str(e))

    delta_doc = {
        "source_report_ids": req.report_ids,
        "delta_report": delta.get("delta_report", delta),
        "usage": usage,
        "created_at": datetime.now(timezone.utc),
    }
    result = db["delta_reports"].insert_one(delta_doc)

    return {
        "status": "ok",
        "delta_id": str(result.inserted_id),
        "report": serialize(delta_doc),
        "usage": usage,
    }


# ═══════════════ Cleanup endpoint ═══════════════

@app.post("/api/admin/cleanup-collections")
async def cleanup_collections():
    """Drop unused collections."""
    db = get_db()
    dropped = []
    for name in ["raw_webhooks", "raw_meetgeek_api", "app_state", "migration_history"]:
        if name in db.list_collection_names():
            db.drop_collection(name)
            dropped.append(name)
    return {"dropped": dropped, "remaining": db.list_collection_names()}


# ═══════════════ Serve Frontend ═══════════════

FRONTEND_DIST = BASE_DIR.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
