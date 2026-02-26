"""
MeetGeek webhook receiver: verify signature (x-mg-signature, plain hex), store payload,
fetch full meeting/transcript via MeetGeek API when needed, store in DB, trigger AI.
"""
import hashlib
import hmac
import json
import logging
from datetime import datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from config import get_settings
from database import get_db, save_meeting, save_raw_webhook, save_raw_meetgeek_api, update_meeting, get_meeting, set_last_meeting_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhook", tags=["webhook"])

# MeetGeek events we handle
EVENT_MEETING_COMPLETED = "meeting.completed"
EVENT_TRANSCRIPT_READY = "transcript.ready"
EVENT_SUMMARY_READY = "summary.ready"


def verify_meetgeek_signature(payload_body: bytes, signature: str | None, secret: str) -> bool:
    """
    Verify MeetGeek webhook: HMAC SHA256 in plain hex, header x-mg-signature.
    """
    if not secret:
        return True
    if not signature:
        return False
    # MeetGeek sends plain hex (no sha256= prefix)
    sig = signature.strip()
    if sig.lower().startswith("sha256="):
        sig = sig[7:].strip()
    expected = hmac.new(
        secret.encode("utf-8"),
        payload_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, sig)


async def _fetch_meeting_from_meetgeek_api(meeting_id: str) -> tuple[dict[str, Any] | None, list[tuple[str, dict[str, Any]]]]:
    """
    Fetch full meeting details and transcript from MeetGeek REST API.
    Returns (merged_meeting_data or None, list of (response_type, raw_payload) for DB storage).
    """
    settings = get_settings()
    if not settings.meetgeek_api_key:
        logger.warning("MEETGEEK_API_KEY not set; cannot fetch meeting from API")
        return None, []
    base = settings.meetgeek_api_base.rstrip("/")
    headers = {"Authorization": f"Bearer {settings.meetgeek_api_key}"}
    out: dict[str, Any] = {
        "meeting_id": meeting_id, "title": None, "transcript": None,
        "transcript_sentences": None, "summary": None, "participants": None,
        "duration": None, "highlights": None, "action_items": None, "date": None,
        "source": None, "event_id": None, "host_email": None,
        "join_link": None, "language": None, "date_end": None,
    }
    raw_records: list[tuple[str, dict[str, Any]]] = []
    all_sentences: list[dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(f"{base}/v1/meetings/{meeting_id}", headers=headers)
            if r.status_code == 200:
                data = r.json()
                raw_records.append(("meeting", data))
                out["title"] = data.get("title") or data.get("name")
                out["duration"] = data.get("duration")
                out["participants"] = data.get("participants") or data.get("participant_emails")
                out["summary"] = data.get("summary")
                out["highlights"] = data.get("highlights")
                out["action_items"] = data.get("action_items")
                out["source"] = data.get("source")
                out["event_id"] = data.get("event_id")
                out["host_email"] = data.get("host_email")
                out["join_link"] = data.get("join_link")
                out["language"] = data.get("language")
                if data.get("date"):
                    out["date"] = _parse_ts(data["date"])
                if data.get("timestamp_start_utc"):
                    out["date"] = out["date"] or _parse_ts(data["timestamp_start_utc"])
                if data.get("start_time"):
                    out["date"] = out["date"] or _parse_ts(data["start_time"])
                if data.get("timestamp_end_utc"):
                    out["date_end"] = _parse_ts(data["timestamp_end_utc"])
                if not out["duration"] and data.get("timestamp_start_utc") and data.get("timestamp_end_utc"):
                    try:
                        start = _parse_ts(data["timestamp_start_utc"])
                        end = _parse_ts(data["timestamp_end_utc"])
                        if start and end:
                            out["duration"] = int((end - start).total_seconds())
                    except Exception:
                        pass
            # Transcript (paginated: sentences)
            transcript_parts = []
            cursor = None
            while True:
                url = f"{base}/v1/meetings/{meeting_id}/transcript"
                params = {"limit": 500}
                if cursor:
                    params["cursor"] = cursor
                r = await client.get(url, headers=headers, params=params)
                if r.status_code != 200:
                    break
                page = r.json()
                raw_records.append(("transcript", page))
                sentences = page.get("sentences") or page.get("data") or []
                for s in sentences:
                    if isinstance(s, dict):
                        text = s.get("transcript") or s.get("text") or s.get("content") or ""
                        transcript_parts.append(text)
                        all_sentences.append({
                            "speaker": s.get("speaker") or "Unknown",
                            "text": text,
                            "timestamp": s.get("timestamp"),
                        })
                    else:
                        transcript_parts.append(str(s))
                        all_sentences.append({"speaker": "Unknown", "text": str(s), "timestamp": None})
                cursor = (page.get("pagination") or {}).get("next_cursor") or page.get("next_cursor")
                if not cursor:
                    break
            if transcript_parts:
                out["transcript"] = "\n".join(t for t in transcript_parts if t)
            if all_sentences:
                out["transcript_sentences"] = all_sentences
    except Exception as e:
        logger.exception("MeetGeek API fetch failed for meeting %s: %s", meeting_id, e)
        return None, raw_records
    return out, raw_records


def _parse_ts(ts: Any) -> datetime | None:
    """Parse timestamp from payload (ISO string or number)."""
    if ts is None:
        return None
    if isinstance(ts, (int, float)):
        return datetime.utcfromtimestamp(ts)
    if isinstance(ts, str):
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            return None
    return None


def _extract_meeting_id(payload: dict[str, Any]) -> str | None:
    """Extract meeting identifier from various payload shapes."""
    for key in ("meeting_id", "id", "meetingId", "meeting", "event", "data"):
        if key in payload and isinstance(payload[key], dict):
            mid = payload[key].get("id") or payload[key].get("meeting_id") or payload[key].get("meetingId")
            if mid:
                return str(mid)
    return payload.get("meeting_id") or payload.get("id") or (str(payload.get("meetingId")) if payload.get("meetingId") is not None else None)


def _build_meeting_data(
    meeting_id: str,
    event_type: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Build meeting row from webhook payload (flexible for MeetGeek schema)."""
    data = payload.get("data") or payload
    meeting_info = data.get("meeting") or data.get("meeting_info") or data

    title = (
        meeting_info.get("title")
        or data.get("title")
        or payload.get("title")
    )
    date = _parse_ts(
        meeting_info.get("date") or meeting_info.get("start_time") or data.get("date") or data.get("start_time")
    )
    duration = meeting_info.get("duration") or data.get("duration")
    participants = meeting_info.get("participants") or data.get("participants")
    transcript = data.get("transcript") or meeting_info.get("transcript") or payload.get("transcript")
    summary = data.get("summary") or meeting_info.get("summary") or payload.get("summary")
    highlights = data.get("highlights") or meeting_info.get("highlights") or payload.get("highlights")
    action_items = data.get("action_items") or meeting_info.get("action_items") or payload.get("action_items")

    return {
        "meeting_id": meeting_id,
        "title": title,
        "date": date,
        "duration": duration,
        "participants": participants,
        "transcript": transcript if isinstance(transcript, str) else (json.dumps(transcript) if transcript else None),
        "summary": summary if isinstance(summary, str) else (json.dumps(summary) if summary else None),
        "highlights": highlights if isinstance(highlights, dict) else None,
        "action_items": action_items if isinstance(action_items, dict) else None,
        "processed": False,
    }


def _merge_api_into_meeting_data(meeting_data: dict[str, Any], api_data: dict[str, Any]) -> None:
    """Overlay API-fetched fields onto meeting_data where missing."""
    if api_data.get("title") and not meeting_data.get("title"):
        meeting_data["title"] = api_data["title"]
    if api_data.get("transcript") and not meeting_data.get("transcript"):
        meeting_data["transcript"] = api_data["transcript"]
    if api_data.get("transcript_sentences") and not meeting_data.get("transcript_sentences"):
        meeting_data["transcript_sentences"] = api_data["transcript_sentences"]
    if api_data.get("summary") and not meeting_data.get("summary"):
        meeting_data["summary"] = api_data["summary"]
    if api_data.get("participants") is not None and meeting_data.get("participants") is None:
        meeting_data["participants"] = api_data["participants"]
    if api_data.get("duration") is not None and meeting_data.get("duration") is None:
        meeting_data["duration"] = api_data["duration"]
    if api_data.get("date") is not None and meeting_data.get("date") is None:
        meeting_data["date"] = api_data["date"]
    if api_data.get("highlights") and not meeting_data.get("highlights"):
        meeting_data["highlights"] = api_data["highlights"]
    if api_data.get("action_items") and not meeting_data.get("action_items"):
        meeting_data["action_items"] = api_data["action_items"]
    for field in ("source", "event_id", "host_email", "join_link", "language", "date_end"):
        if api_data.get(field) and not meeting_data.get(field):
            meeting_data[field] = api_data[field]


@router.api_route("/meetgeek", methods=["GET", "HEAD"])
async def meetgeek_webhook_get():
    """
    Accept GET/HEAD for URL verification (e.g. MeetGeek or browser).
    Real webhook payloads must be sent via POST.
    """
    return {"status": "ok", "message": "Webhook endpoint; send POST with event payload."}


@router.post("/meetgeek")
async def meetgeek_webhook(request: Request, db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    Receive MeetGeek webhooks. Verify x-mg-signature (HMAC SHA256 plain hex),
    store raw payload, fetch full meeting/transcript via API if needed, store in DB, trigger AI.
    """
    body = await request.body()
    settings = get_settings()
    signature = request.headers.get("x-mg-signature") or request.headers.get("X-MG-Signature") or ""
    if not verify_meetgeek_signature(body, signature or None, settings.meetgeek_secret):
        logger.warning("Webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as e:
        logger.exception("Invalid JSON in webhook body")
        raise HTTPException(status_code=400, detail="Invalid JSON") from e

    event_type = (
        payload.get("event")
        or payload.get("event_type")
        or payload.get("type")
        or "unknown"
    )

    await save_raw_webhook(db, event_type, payload)

    meeting_id = _extract_meeting_id(payload) or payload.get("meeting_id")
    if not meeting_id:
        logger.info("No meeting_id in payload; raw webhook stored only. event=%s", event_type)
        return {"status": "ok", "message": "Webhook received", "event": event_type}

    meeting_data = _build_meeting_data(meeting_id, event_type, payload)
    # MeetGeek webhook often sends only meeting_id + message; fetch full transcript via API
    if (not meeting_data.get("transcript") or not meeting_data.get("title")) and settings.meetgeek_api_key:
        api_data, raw_api_records = await _fetch_meeting_from_meetgeek_api(meeting_id)
        for response_type, raw_payload in raw_api_records:
            await save_raw_meetgeek_api(db, meeting_id, response_type, raw_payload)
        if api_data:
            _merge_api_into_meeting_data(meeting_data, api_data)

    existing = await get_meeting(db, meeting_id)
    if existing:
        # Update only provided fields
        update_dict = {k: v for k, v in meeting_data.items() if k != "meeting_id" and v is not None}
        await update_meeting(db, meeting_id, update_dict)
    else:
        await save_meeting(db, meeting_data)

    await set_last_meeting_id(db, meeting_id)

    logger.info("Meeting %s stored in MongoDB (AI analysis available on-demand via API)", meeting_id)
    return {"status": "ok", "event": event_type, "meeting_id": meeting_id}


async def sync_meeting_to_mongodb(
    db: AsyncIOMotorDatabase, meeting_id: str
) -> dict[str, Any]:
    """
    Fetch meeting + transcript from MeetGeek API and save/update in MongoDB.
    Returns {"ok": bool, "meeting_id": str, "error": str | None}.
    """
    if not get_settings().meetgeek_api_key:
        return {"ok": False, "meeting_id": meeting_id, "error": "MEETGEEK_API_KEY not set"}
    api_data, raw_records = await _fetch_meeting_from_meetgeek_api(meeting_id)
    if not api_data:
        return {"ok": False, "meeting_id": meeting_id, "error": "Failed to fetch from MeetGeek API"}
    for response_type, raw_payload in raw_records:
        await save_raw_meetgeek_api(db, meeting_id, response_type, raw_payload)
    meeting_data = {
        "meeting_id": meeting_id,
        "title": api_data.get("title"),
        "date": api_data.get("date"),
        "date_end": api_data.get("date_end"),
        "duration": api_data.get("duration"),
        "participants": api_data.get("participants"),
        "transcript": api_data.get("transcript"),
        "transcript_sentences": api_data.get("transcript_sentences"),
        "summary": api_data.get("summary"),
        "highlights": api_data.get("highlights"),
        "action_items": api_data.get("action_items"),
        "source": api_data.get("source"),
        "event_id": api_data.get("event_id"),
        "host_email": api_data.get("host_email"),
        "join_link": api_data.get("join_link"),
        "language": api_data.get("language"),
        "processed": False,
    }
    existing = await get_meeting(db, meeting_id)
    if existing:
        update_dict = {k: v for k, v in meeting_data.items() if k != "meeting_id" and v is not None}
        await update_meeting(db, meeting_id, update_dict)
    else:
        await save_meeting(db, meeting_data)
    await set_last_meeting_id(db, meeting_id)
    return {"ok": True, "meeting_id": meeting_id, "error": None}
