"""
REST API: meetings list, detail, transcripts, AI analysis (user-triggered), dashboard.
All dates returned in IST (Indian Standard Time, UTC+5:30).
"""
import logging
import re
from datetime import datetime, timezone, timedelta
from uuid import uuid4

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
    soft_delete_meeting,
    restore_meeting,
    list_trashed_meetings,
    get_meeting_stats,
    get_transcript_sentences_for_meeting,
    get_last_meeting_id,
    update_meeting,
    save_meeting,
    create_folder,
    list_folders,
    get_folder,
    delete_folder,
    soft_delete_folder,
    restore_folder,
    list_trashed_folders,
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
    folder_id: str | None = None


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
    folder_id: str | None = None


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
    folder_id: str | None = None


class FolderItem(BaseModel):
    """A folder for grouping meetings."""
    id: str
    name: str
    created_at_ist: str | None = None


class FolderListResponse(BaseModel):
    folders: list[FolderItem]


class FolderCreateRequest(BaseModel):
    name: str


class MeetingImportRequest(BaseModel):
    """
    Import a meeting + transcript from JSON (manual upload).
    This does NOT call MeetGeek; it just writes into Mongo so the UI and synthesis can use it.
    meeting_id is optional: if omitted, one is generated (title+date or import-<uuid>) so you can
    import the same document multiple times as separate meetings (e.g. daily same-name meetings).
    """

    meeting_id: str | None = None
    title: str | None = None
    transcript: str
    transcript_sentences: list[dict] | None = None
    participants: list[str] | None = None
    source: str | None = "manual-upload"
    host_email: str | None = None
    language: str | None = None
    date: str | None = None
    duration_seconds: int | None = None


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
        folder_id=m.get("folder_id"),
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
        folder_id=m.get("folder_id"),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/meetings", response_model=MeetingListResponse)
async def list_meetings(
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=100, description="Results per page"),
    folder_id: str | None = Query(None, description="Filter by folder id; empty string = no folder"),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List all meetings with name, date (IST), duration, transcript preview, AI status."""
    skip = (page - 1) * page_size
    total = await count_meetings(db, folder_id=folder_id)
    meetings = await get_all_meetings(db, skip=skip, limit=page_size, folder_id=folder_id)
    total_pages = max(1, (total + page_size - 1) // page_size)
    return MeetingListResponse(
        meetings=[_meeting_to_item(m) for m in meetings],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


def _generate_meeting_id_for_import(body: MeetingImportRequest) -> str:
    """Generate a unique meeting_id when not provided (e.g. same-name daily imports)."""
    if body.title and body.date:
        safe_title = re.sub(r"[^\w\s-]", "", (body.title or "")[:40]).strip().replace(" ", "-") or "meeting"
        safe_date = re.sub(r"[^\w-]", "", (body.date or "")[:20]) or ""
        if safe_date:
            return f"{safe_title}-{safe_date}-{uuid4().hex[:8]}"
    return f"import-{uuid4().hex}"


@router.post("/meetings/import", response_model=MeetingDetail)
async def import_meeting(
    body: MeetingImportRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Import a meeting and transcript from JSON.

    This is intended for manual uploads or non-MeetGeek sources.
    - If meeting_id is omitted, one is generated so you can import the same document multiple times (e.g. daily same-name meetings).
    - If a meeting with the same meeting_id already exists, it will be updated and restored from bin if it was trashed.
    """
    mid = body.meeting_id or _generate_meeting_id_for_import(body)
    meeting_data: dict = {
        "meeting_id": mid,
        "title": body.title,
        "transcript": body.transcript,
        "transcript_sentences": body.transcript_sentences,
        "participants": body.participants,
        "source": body.source or "manual-upload",
        "host_email": body.host_email,
        "language": body.language,
        "date": body.date,
        "duration": body.duration_seconds,
        "processed": False,
    }

    await save_meeting(db, meeting_data)
    await restore_meeting(db, mid)
    stored = await get_meeting(db, mid)
    if not stored:
        raise HTTPException(status_code=500, detail="Failed to import meeting")
    return _meeting_to_detail(stored)


@router.get("/meetings/all", response_model=MeetingListResponse)
async def list_all_meetings(
    folder_id: str | None = Query(None, description="Filter by folder id; empty string = no folder"),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get all meetings (no pagination, max 5000)."""
    total = await count_meetings(db, folder_id=folder_id)
    meetings = await get_all_meetings(db, skip=0, limit=5000, folder_id=folder_id)
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


@router.get("/meetings/trash", response_model=MeetingListResponse)
async def list_trash(
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List meetings in bin (soft-deleted)."""
    meetings = await list_trashed_meetings(db, skip=0, limit=500)
    return MeetingListResponse(
        meetings=[_meeting_to_item(m) for m in meetings],
        total=len(meetings),
        page=1,
        page_size=len(meetings),
        total_pages=1,
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
        # Auto-sync from MeetGeek API if meeting is not yet in DB
        sync_result = await sync_meeting_to_mongodb(db, meeting_id)
        if not sync_result.get("ok"):
            raise HTTPException(
                status_code=404,
                detail=f"Meeting not found (and sync failed: {sync_result.get('error')})",
            )
        meeting = await get_meeting(db, meeting_id)
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found after sync")
    return _meeting_to_detail(meeting)


@router.get("/meetings/{meeting_id}/transcript")
async def get_meeting_transcript(
    meeting_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get plain-text transcript for a meeting."""
    meeting = await get_meeting(db, meeting_id)
    if not meeting:
        # Auto-sync from MeetGeek API if meeting is not yet in DB
        sync_result = await sync_meetings_to_mongodb(
            db=db,
            body=SyncMeetingsRequest(meeting_ids=[meeting_id]),
        )
        if not any(r.get("ok") for r in sync_result.get("results", [])):
            raise HTTPException(
                status_code=404,
                detail="Meeting not found and sync from MeetGeek API failed",
            )
        meeting = await get_meeting(db, meeting_id)
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found after sync")
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
        # Auto-sync from MeetGeek API if meeting is not yet in DB
        sync_result = await sync_meetings_to_mongodb(
            db=db,
            body=SyncMeetingsRequest(meeting_ids=[meeting_id]),
        )
        if not any(r.get("ok") for r in sync_result.get("results", [])):
            raise HTTPException(
                status_code=404,
                detail="Meeting not found and sync from MeetGeek API failed",
            )
        meeting = await get_meeting(db, meeting_id)
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found after sync")
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
    """Move a meeting to bin (soft delete). Use DELETE /meetings/{id}/permanent to remove permanently."""
    updated = await soft_delete_meeting(db, meeting_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return None


@router.post("/meetings/{meeting_id}/restore", status_code=200)
async def restore_meeting_api(
    meeting_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Restore a meeting from bin."""
    updated = await restore_meeting(db, meeting_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Meeting not found or not in bin")
    return {"status": "restored", "meeting_id": meeting_id}


@router.delete("/meetings/{meeting_id}/permanent", status_code=204)
async def permanent_delete_meeting_api(
    meeting_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Permanently delete a meeting (cannot be undone)."""
    deleted = await delete_meeting(db, meeting_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return None


@router.delete("/meetings/{meeting_id}/transcript", response_model=MeetingDetail)
async def clear_meeting_transcript(
    meeting_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Delete/clear transcript content for a meeting while keeping the meeting record.

    This resets transcript fields and AI-derived fields so the meeting remains in history
    but no longer carries transcript text.
    """
    meeting = await get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    updated = await update_meeting(
        db,
        meeting_id,
        {
            "transcript": "",
            "transcript_sentences": [],
            "ai_analysis": None,
            "ai_insights": None,
            "processed": False,
        },
    )
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to clear transcript")
    return _meeting_to_detail(updated)


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


# ---------------------------------------------------------------------------
# Folders
# ---------------------------------------------------------------------------

def _folder_to_item(f: dict) -> FolderItem:
    return FolderItem(
        id=f["id"],
        name=f["name"],
        created_at_ist=_to_ist(f.get("created_at")),
    )


@router.get("/folders", response_model=FolderListResponse)
async def list_folders_api(db: AsyncIOMotorDatabase = Depends(get_db)):
    """List all non-trashed folders."""
    folders = await list_folders(db)
    return FolderListResponse(folders=[_folder_to_item(f) for f in folders])


@router.get("/folders/trash", response_model=FolderListResponse)
async def list_folders_trash(db: AsyncIOMotorDatabase = Depends(get_db)):
    """List folders in bin (soft-deleted)."""
    folders = await list_trashed_folders(db, skip=0, limit=500)
    return FolderListResponse(folders=[_folder_to_item(f) for f in folders])


@router.post("/folders", response_model=FolderItem)
async def create_folder_api(
    body: FolderCreateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Create a new folder."""
    folder = await create_folder(db, body.name)
    return _folder_to_item(folder)


@router.delete("/folders/{folder_id}", status_code=204)
async def delete_folder_api(
    folder_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Move folder to bin (soft delete). Meetings keep their folder_id. Use DELETE /folders/{id}/permanent to remove permanently."""
    updated = await soft_delete_folder(db, folder_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Folder not found")
    return None


@router.post("/folders/{folder_id}/restore", status_code=200)
async def restore_folder_api(
    folder_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Restore a folder from bin."""
    updated = await restore_folder(db, folder_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Folder not found or not in bin")
    return {"status": "restored", "folder_id": folder_id}


@router.delete("/folders/{folder_id}/permanent", status_code=204)
async def permanent_delete_folder_api(
    folder_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Permanently delete a folder and move its meetings to no folder."""
    deleted = await delete_folder(db, folder_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Folder not found")
    return None
