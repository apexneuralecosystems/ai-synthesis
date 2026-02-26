"""
Async MongoDB connection and CRUD via Motor.
All operations use migrations for schema (indexes); no create_all.
Uses certifi CA bundle for Atlas SSL. Set MONGODB_TLS_INSECURE=1 to relax (dev only).
"""
import logging
import os
from datetime import datetime, timezone
from typing import Any, AsyncGenerator
from uuid import UUID, uuid4

import certifi
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from config import get_settings

logger = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None


def _mongo_client_options(uri: str = "") -> dict:
    """Options for MongoDB client. Only use TLS/CA for mongodb+srv (Atlas); plain mongodb:// uses no TLS."""
    opts: dict[str, Any] = {"serverSelectionTimeoutMS": 20000}
    if "mongodb+srv" in (uri or ""):
        opts["tlsCAFile"] = certifi.where()
        if os.environ.get("MONGODB_TLS_INSECURE", "").lower() in ("1", "true", "yes"):
            opts["tlsAllowInvalidCertificates"] = True
    return opts


def _normalize_mongodb_uri(uri: str) -> str:
    """Append Atlas-recommended params if missing (retryWrites, w=majority)."""
    uri = uri.rstrip("/")
    if "?" in uri:
        base, qs = uri.split("?", 1)
        params = [p for p in qs.split("&") if p.strip()]
    else:
        base, params = uri, []
    seen = {p.split("=")[0].lower() for p in params}
    if "retrywrites" not in seen:
        params.append("retryWrites=true")
    if "w" not in seen:
        params.append("w=majority")
    return f"{base}?{'&'.join(params)}" if params else base


def get_effective_mongodb_uri() -> str:
    """Return the MongoDB URI to use (MONGODB_STANDARD_URI if set, else MONGODB_URI), normalized."""
    settings = get_settings()
    uri = (settings.mongodb_standard_uri or settings.mongodb_uri or "").strip()
    if not uri:
        raise ValueError("MONGODB_URI is not set")
    return _normalize_mongodb_uri(uri)


def get_client() -> AsyncIOMotorClient:
    """Get or create Motor client (cached)."""
    global _client
    if _client is None:
        uri = get_effective_mongodb_uri()
        _client = AsyncIOMotorClient(uri, **_mongo_client_options(uri))
    return _client


def get_database() -> AsyncIOMotorDatabase:
    """Return the application database (call after config is loaded)."""
    db_name = (get_settings().mongodb_db_name or "meetgeek").strip()
    return get_client()[db_name]


async def get_db() -> AsyncGenerator[AsyncIOMotorDatabase, None]:
    """Provide the MongoDB database for the request lifecycle (no session/commit)."""
    yield get_database()


def _doc_to_meeting(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    """Convert MongoDB meeting doc to API-shaped dict (id, dates, etc.)."""
    if not doc:
        return None
    out = dict(doc)
    out["id"] = out.get("id") or str(out.get("_id", ""))
    if "_id" in out:
        del out["_id"]
    return out


def _doc_to_raw(doc: dict[str, Any]) -> dict[str, Any]:
    """Convert raw webhook/api doc to dict with id."""
    if not doc:
        return None
    out = dict(doc)
    out["id"] = out.get("id") or str(out.get("_id", ""))
    if "_id" in out:
        del out["_id"]
    return out


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def init_db() -> None:
    """Run MongoDB migrations (create indexes / collections)."""
    try:
        from migrations.runner import run_migrations
        await run_migrations()
        logger.info("MongoDB migrations completed.")
    except Exception as e:
        logger.warning("MongoDB migrations failed: %s", e)
        raise


# --- Meeting CRUD ---


async def save_meeting(db: AsyncIOMotorDatabase, meeting_data: dict[str, Any]) -> dict[str, Any]:
    """
    Insert or update meeting by meeting_id (upsert).
    Returns meeting dict with id.
    """
    coll = db["meetings"]
    mid = meeting_data["meeting_id"]
    existing = await coll.find_one({"meeting_id": mid})
    now = _now()
    meeting_fields = {
        "title", "date", "date_end", "duration", "participants",
        "transcript", "transcript_sentences", "summary", "highlights",
        "action_items", "ai_analysis", "ai_insights",
        "source", "event_id", "host_email", "join_link", "language",
    }
    if existing:
        update = {k: meeting_data[k] for k in meeting_fields if k in meeting_data}
        update["processed"] = meeting_data.get("processed", False)
        update["updated_at"] = now
        await coll.update_one({"meeting_id": mid}, {"$set": update})
    else:
        doc = {"id": str(uuid4()), "meeting_id": mid}
        doc.update({k: meeting_data.get(k) for k in meeting_fields})
        doc["processed"] = meeting_data.get("processed", False)
        doc["created_at"] = now
        doc["updated_at"] = now
        await coll.insert_one(doc)
    out = await coll.find_one({"meeting_id": mid})
    return _doc_to_meeting(out)


async def update_meeting(
    db: AsyncIOMotorDatabase, meeting_id: str, data: dict[str, Any]
) -> dict[str, Any] | None:
    """Update an existing meeting by meeting_id. Returns updated meeting dict or None."""
    coll = db["meetings"]
    allowed = {
        "title", "date", "date_end", "duration", "participants",
        "transcript", "transcript_sentences", "summary", "highlights",
        "action_items", "ai_analysis", "ai_insights", "processed",
        "source", "event_id", "host_email", "join_link", "language",
    }
    update = {k: v for k, v in data.items() if k in allowed and v is not None}
    if not update:
        return await get_meeting(db, meeting_id)
    update["updated_at"] = _now()
    result = await coll.find_one_and_update(
        {"meeting_id": meeting_id},
        {"$set": update},
        return_document=True,
    )
    return _doc_to_meeting(result) if result else None


async def get_meeting(db: AsyncIOMotorDatabase, meeting_id: str) -> dict[str, Any] | None:
    """Get a single meeting by meeting_id."""
    doc = await db["meetings"].find_one({"meeting_id": meeting_id})
    return _doc_to_meeting(doc) if doc else None


async def get_meeting_by_uuid(
    db: AsyncIOMotorDatabase, id: UUID | str
) -> dict[str, Any] | None:
    """Get a single meeting by primary key id (string or UUID)."""
    id_str = str(id) if isinstance(id, UUID) else id
    doc = await db["meetings"].find_one({"id": id_str})
    return _doc_to_meeting(doc) if doc else None


async def get_all_meetings(
    db: AsyncIOMotorDatabase,
    skip: int = 0,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """List meetings with pagination, ordered by created_at desc."""
    cursor = (
        db["meetings"]
        .find({})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    out = []
    async for doc in cursor:
        out.append(_doc_to_meeting(doc))
    return out


async def count_meetings(db: AsyncIOMotorDatabase, query: str | None = None) -> int:
    """Count total meetings, optionally filtered by search query."""
    if query:
        pattern = {"$regex": query, "$options": "i"}
        return await db["meetings"].count_documents(
            {"$or": [{"transcript": pattern}, {"title": pattern}]}
        )
    return await db["meetings"].count_documents({})


async def search_meetings(
    db: AsyncIOMotorDatabase,
    query: str,
    skip: int = 0,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Search meetings by transcript or title (case-insensitive regex)."""
    pattern = {"$regex": query, "$options": "i"}
    cursor = (
        db["meetings"]
        .find({"$or": [{"transcript": pattern}, {"title": pattern}]})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    out = []
    async for doc in cursor:
        out.append(_doc_to_meeting(doc))
    return out


async def delete_meeting(db: AsyncIOMotorDatabase, meeting_id: str) -> bool:
    """Delete a meeting by meeting_id. Returns True if deleted."""
    result = await db["meetings"].delete_one({"meeting_id": meeting_id})
    return result.deleted_count > 0


# --- Raw webhook ---


async def save_raw_webhook(
    db: AsyncIOMotorDatabase,
    event_type: str | None,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Store raw webhook payload for audit."""
    coll = db["raw_webhooks"]
    doc = {
        "id": str(uuid4()),
        "event_type": event_type,
        "payload": payload,
        "received_at": _now(),
    }
    await coll.insert_one(doc)
    return _doc_to_raw(doc)


# --- Raw MeetGeek API responses ---


async def save_raw_meetgeek_api(
    db: AsyncIOMotorDatabase,
    meeting_id: str,
    response_type: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Store raw MeetGeek API response (meeting or transcript) for audit."""
    coll = db["raw_meetgeek_api"]
    doc = {
        "id": str(uuid4()),
        "meeting_id": meeting_id,
        "response_type": response_type,
        "payload": payload,
        "fetched_at": _now(),
    }
    await coll.insert_one(doc)
    return _doc_to_raw(doc)


async def get_transcript_sentences_for_meeting(
    db: AsyncIOMotorDatabase, meeting_id: str
) -> list[dict[str, Any]]:
    """
    Return list of {speaker, text, timestamp} for a meeting.
    Uses meeting.transcript_sentences if set; else builds from raw_meetgeek_api transcript payloads.
    """
    meeting = await get_meeting(db, meeting_id)
    if meeting and meeting.get("transcript_sentences"):
        return meeting["transcript_sentences"]
    cursor = (
        db["raw_meetgeek_api"]
        .find({"meeting_id": meeting_id, "response_type": "transcript"})
        .sort("fetched_at", 1)
    )
    sentences: list[dict[str, Any]] = []
    async for row in cursor:
        for s in (row.get("payload") or {}).get("sentences") or (row.get("payload") or {}).get("data") or []:
            if isinstance(s, dict):
                sentences.append({
                    "speaker": s.get("speaker") or "Unknown",
                    "text": s.get("transcript") or s.get("text") or s.get("content") or "",
                    "timestamp": s.get("timestamp"),
                })
    return sentences


# --- Last meeting ID (stored in MongoDB) ---

APP_STATE_KEY_LAST_MEETING_ID = "last_meeting_id"


async def set_last_meeting_id(db: AsyncIOMotorDatabase, meeting_id: str) -> None:
    """Store the last processed meeting_id in MongoDB (app_state collection)."""
    await db["app_state"].update_one(
        {"key": APP_STATE_KEY_LAST_MEETING_ID},
        {"$set": {"value": meeting_id, "updated_at": _now()}},
        upsert=True,
    )


async def get_last_meeting_id(db: AsyncIOMotorDatabase) -> str | None:
    """Return the last stored meeting_id from MongoDB, or None if never set."""
    doc = await db["app_state"].find_one({"key": APP_STATE_KEY_LAST_MEETING_ID})
    return doc.get("value") if doc else None


# --- Dashboard stats ---


async def get_meeting_stats(db: AsyncIOMotorDatabase) -> dict[str, Any]:
    """Return counts and latest meetings for dashboard."""
    coll = db["meetings"]
    total_meetings = await coll.count_documents({})
    total_transcripts = await coll.count_documents({"transcript": {"$ne": None, "$exists": True}})
    meetings_processed_by_ai = await coll.count_documents({"processed": True})
    cursor = coll.find({}).sort("created_at", -1).limit(5)
    latest_meetings = [_doc_to_meeting(d) async for d in cursor]
    return {
        "total_meetings": total_meetings,
        "total_transcripts_processed": total_transcripts,
        "meetings_processed_by_ai": meetings_processed_by_ai,
        "latest_meetings": latest_meetings,
    }
