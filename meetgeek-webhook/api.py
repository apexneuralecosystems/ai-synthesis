"""
REST API: meetings list, detail, transcripts, AI analysis (user-triggered), dashboard.
All dates returned in IST (Indian Standard Time, UTC+5:30).
"""
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, field_serializer

from database import (
    get_db,
    get_meeting,
    get_all_meetings,
    count_meetings,
    search_meetings,
    delete_meeting,
    get_meeting_stats,
    get_transcript_sentences_for_meeting,
    get_last_meeting_id,
    update_meeting,
)
from webhook import sync_meeting_to_mongodb

logger = logging.getLogger(__name__)

router = APIRouter(tags=["api"])

IST = timezone(timedelta(hours=5, minutes=30))


def _to_ist(dt: datetime | str | None) -> str | None:
    """Convert a datetime (or ISO string) to IST formatted string."""
    if dt is None:
        return None
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return dt
    if not isinstance(dt, datetime):
        return str(dt)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    ist_dt = dt.astimezone(IST)
    return ist_dt.strftime("%d %b %Y, %I:%M %p IST")


def _to_ist_iso(dt: datetime | str | None) -> str | None:
    """Convert to IST ISO format for machine consumption."""
    if dt is None:
        return None
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return dt
    if not isinstance(dt, datetime):
        return str(dt)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST).isoformat()


# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------

class MeetingItem(BaseModel):
    """Summary view of a meeting (used in list endpoints)."""
    model_config = ConfigDict(from_attributes=True)

    meeting_id: str
    title: str | None = None
    date_ist: str | None = None
    date_iso: str | None = None
    duration_seconds: int | None = None
    duration_display: str | None = None
    participants: list | dict | None = None
    host_email: str | None = None
    source: str | None = None
    has_transcript: bool = False
    transcript_preview: str | None = None
    ai_processed: bool = False
    created_at_ist: str | None = None


class MeetingDetail(BaseModel):
    """Full meeting view with transcript, AI insights, etc."""
    model_config = ConfigDict(from_attributes=True)

    meeting_id: str
    title: str | None = None
    date_ist: str | None = None
    date_iso: str | None = None
    date_end_ist: str | None = None
    duration_seconds: int | None = None
    duration_display: str | None = None
    participants: list | dict | None = None
    host_email: str | None = None
    source: str | None = None
    event_id: str | None = None
    join_link: str | None = None
    language: str | None = None
    transcript: str | None = None
    transcript_sentences: list | None = None
    summary: str | None = None
    highlights: dict | None = None
    action_items: dict | list | None = None
    ai_processed: bool = False
    ai_analysis: str | None = None
    ai_insights: dict | None = None
    created_at_ist: str | None = None
    updated_at_ist: str | None = None


class MeetingListResponse(BaseModel):
    meetings: list[MeetingItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class DashboardResponse(BaseModel):
    total_meetings: int
    total_with_transcript: int
    total_ai_processed: int
    latest_meetings: list[MeetingItem]


class SyncMeetingsRequest(BaseModel):
    meeting_ids: list[str]


class AIAnalyzeResponse(BaseModel):
    meeting_id: str
    status: str
    ai_analysis: str | None = None
    ai_insights: dict | None = None


class MeetingUpdateRequest(BaseModel):
    """Fields a user can manually update on a meeting."""
    title: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _format_duration(seconds: int | None) -> str | None:
    if seconds is None:
        return None
    mins, secs = divmod(seconds, 60)
    hours, mins = divmod(mins, 60)
    if hours > 0:
        return f"{hours}h {mins}m"
    return f"{mins}m {secs}s"


def _meeting_to_item(m: dict) -> MeetingItem:
    transcript = m.get("transcript") or ""
    preview = transcript[:200].strip() + ("..." if len(transcript) > 200 else "") if transcript else None
    return MeetingItem(
        meeting_id=m["meeting_id"],
        title=m.get("title") or "Untitled Meeting",
        date_ist=_to_ist(m.get("date")),
        date_iso=_to_ist_iso(m.get("date")),
        duration_seconds=m.get("duration"),
        duration_display=_format_duration(m.get("duration")),
        participants=m.get("participants"),
        host_email=m.get("host_email"),
        source=m.get("source"),
        has_transcript=bool(transcript),
        transcript_preview=preview,
        ai_processed=m.get("processed", False),
        created_at_ist=_to_ist(m.get("created_at")),
    )


def _meeting_to_detail(m: dict) -> MeetingDetail:
    return MeetingDetail(
        meeting_id=m["meeting_id"],
        title=m.get("title") or "Untitled Meeting",
        date_ist=_to_ist(m.get("date")),
        date_iso=_to_ist_iso(m.get("date")),
        date_end_ist=_to_ist(m.get("date_end")),
        duration_seconds=m.get("duration"),
        duration_display=_format_duration(m.get("duration")),
        participants=m.get("participants"),
        host_email=m.get("host_email"),
        source=m.get("source"),
        event_id=m.get("event_id"),
        join_link=m.get("join_link"),
        language=m.get("language"),
        transcript=m.get("transcript"),
        transcript_sentences=m.get("transcript_sentences"),
        summary=m.get("summary"),
        highlights=m.get("highlights"),
        action_items=m.get("action_items"),
        ai_processed=m.get("processed", False),
        ai_analysis=m.get("ai_analysis"),
        ai_insights=m.get("ai_insights"),
        created_at_ist=_to_ist(m.get("created_at")),
        updated_at_ist=_to_ist(m.get("updated_at")),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/meetings", response_model=MeetingListResponse)
async def list_meetings(
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=100, description="Results per page"),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List all meetings with name, date (IST), duration, transcript preview, AI status."""
    skip = (page - 1) * page_size
    total = await count_meetings(db)
    meetings = await get_all_meetings(db, skip=skip, limit=page_size)
    total_pages = max(1, (total + page_size - 1) // page_size)
    return MeetingListResponse(
        meetings=[_meeting_to_item(m) for m in meetings],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/meetings/all", response_model=MeetingListResponse)
async def list_all_meetings(
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get all meetings (no pagination, max 5000)."""
    total = await count_meetings(db)
    meetings = await get_all_meetings(db, skip=0, limit=5000)
    return MeetingListResponse(
        meetings=[_meeting_to_item(m) for m in meetings],
        total=total,
        page=1,
        page_size=total,
        total_pages=1,
    )


@router.get("/meetings/search", response_model=MeetingListResponse)
async def search_meetings_api(
    q: str = Query(..., min_length=1, description="Search in title or transcript"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Search meetings by title or transcript content."""
    skip = (page - 1) * page_size
    total = await count_meetings(db, query=q)
    meetings = await search_meetings(db, query=q, skip=skip, limit=page_size)
    total_pages = max(1, (total + page_size - 1) // page_size)
    return MeetingListResponse(
        meetings=[_meeting_to_item(m) for m in meetings],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/meetings/last-id")
async def get_last_meeting_id_api(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Return the last meeting_id stored (most recent webhook or sync)."""
    last_id = await get_last_meeting_id(db)
    return {"last_meeting_id": last_id}


@router.get("/meetings/{meeting_id}", response_model=MeetingDetail)
async def get_meeting_detail(
    meeting_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get full meeting details: title, date (IST), transcript, sentences, AI insights."""
    meeting = await get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return _meeting_to_detail(meeting)


@router.get("/meetings/{meeting_id}/transcript")
async def get_meeting_transcript(
    meeting_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get plain-text transcript for a meeting."""
    meeting = await get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {
        "meeting_id": meeting_id,
        "title": meeting.get("title"),
        "transcript": meeting.get("transcript") or "",
    }


@router.get("/meetings/{meeting_id}/transcript/speakers")
async def get_meeting_transcript_by_speakers(
    meeting_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get transcript with speaker attribution: list of {speaker, text, timestamp}."""
    meeting = await get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    sentences = await get_transcript_sentences_for_meeting(db, meeting_id)
    return {
        "meeting_id": meeting_id,
        "title": meeting.get("title"),
        "total_sentences": len(sentences),
        "sentences": sentences,
    }


# ---------------------------------------------------------------------------
# AI Engine: user-triggered analysis
# ---------------------------------------------------------------------------

@router.post("/meetings/{meeting_id}/analyze", response_model=AIAnalyzeResponse)
async def analyze_meeting(
    meeting_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Run AI analysis on a specific meeting (user-triggered).
    The user selects which meeting to analyze; AI is never auto-triggered.
    Uses OpenAI GPT-4o to extract summary, key decisions, action items, risks, sentiment.
    """
    meeting = await get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    transcript = meeting.get("transcript") or ""
    if not transcript.strip():
        raise HTTPException(
            status_code=400,
            detail="Meeting has no transcript to analyze",
        )

    if meeting.get("processed") and meeting.get("ai_insights"):
        return AIAnalyzeResponse(
            meeting_id=meeting_id,
            status="already_processed",
            ai_analysis=meeting.get("ai_analysis"),
            ai_insights=meeting.get("ai_insights"),
        )

    from ai_engine import analyze_transcript

    logger.info("Starting AI analysis for meeting %s (%s)", meeting_id, meeting.get("title"))

    try:
        insights = await analyze_transcript(
            transcript=transcript,
            title=meeting.get("title"),
            participants=meeting.get("participants"),
        )
    except Exception as e:
        logger.exception("AI analysis failed for meeting %s: %s", meeting_id, e)
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {e}")

    if insights.get("error"):
        raise HTTPException(status_code=500, detail=insights["error"])

    executive = insights.get("executive_summary") or ""
    await update_meeting(
        db,
        meeting_id,
        {
            "ai_analysis": executive,
            "ai_insights": insights,
            "processed": True,
        },
    )

    logger.info("AI analysis completed for meeting %s", meeting_id)
    return AIAnalyzeResponse(
        meeting_id=meeting_id,
        status="completed",
        ai_analysis=executive,
        ai_insights=insights,
    )


@router.get("/meetings/{meeting_id}/ai-insights")
async def get_meeting_ai_insights(
    meeting_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get AI analysis results for a meeting (run POST /meetings/{id}/analyze first)."""
    meeting = await get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {
        "meeting_id": meeting_id,
        "title": meeting.get("title"),
        "ai_processed": meeting.get("processed", False),
        "ai_analysis": meeting.get("ai_analysis"),
        "ai_insights": meeting.get("ai_insights"),
    }


# ---------------------------------------------------------------------------
# Sync & Admin
# ---------------------------------------------------------------------------

@router.post("/sync/meetings")
async def sync_meetings_to_mongodb(
    body: SyncMeetingsRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Manually sync meetings from MeetGeek API to MongoDB.
    Provide meeting_ids to fetch and store.
    """
    results = []
    for meeting_id in body.meeting_ids:
        if not meeting_id or not meeting_id.strip():
            continue
        out = await sync_meeting_to_mongodb(db, meeting_id.strip())
        results.append(out)
    synced = sum(1 for r in results if r.get("ok"))
    return {
        "synced": synced,
        "total": len(results),
        "results": results,
    }


@router.patch("/meetings/{meeting_id}", response_model=MeetingDetail)
async def update_meeting_api(
    meeting_id: str,
    body: MeetingUpdateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Update meeting fields (e.g. rename title). Only non-null fields are applied."""
    meeting = await get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updated = await update_meeting(db, meeting_id, updates)
    return _meeting_to_detail(updated)


@router.delete("/meetings/{meeting_id}", status_code=204)
async def delete_meeting_api(
    meeting_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Delete a meeting."""
    deleted = await delete_meeting(db, meeting_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return None


@router.get("/dashboard", response_model=DashboardResponse)
async def dashboard(
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Dashboard: total meetings, transcript count, AI-processed count, latest 5 meetings."""
    stats = await get_meeting_stats(db)
    return DashboardResponse(
        total_meetings=stats["total_meetings"],
        total_with_transcript=stats["total_transcripts_processed"],
        total_ai_processed=stats["meetings_processed_by_ai"],
        latest_meetings=[_meeting_to_item(m) for m in stats["latest_meetings"]],
    )
