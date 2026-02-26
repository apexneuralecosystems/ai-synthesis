"""
AI engine: analyze meeting transcripts with OpenAI GPT-4 and store structured insights.
Retries up to 3 times on failure; transcript is always saved even if AI fails.
"""
import json
import logging
from typing import Any

from openai import AsyncOpenAI

from config import get_settings
from database import get_database, get_meeting, update_meeting

logger = logging.getLogger(__name__)

MAX_RETRIES = 3

SYSTEM_PROMPT = """You are an expert meeting analyst. Analyze the meeting transcript and return a JSON object with exactly these keys (use null where not applicable):
- executive_summary: string (2-4 sentences)
- key_decisions: list of strings
- action_items: list of objects with "item" (string), "owner" (string or null), "due" (string or null)
- risks_or_blockers: list of strings
- sentiment: string (e.g. "positive", "neutral", "mixed", "concerned")
- topics: list of main topics discussed
Return only valid JSON, no markdown or extra text."""


async def analyze_transcript(
    transcript: str,
    title: str | None = None,
    participants: list | dict | None = None,
) -> dict[str, Any]:
    """
    Use OpenAI GPT-4 to extract key decisions, action items, risks, summary, sentiment.
    Returns structured JSON with all insights.
    """
    settings = get_settings()
    if not settings.openai_api_key:
        logger.warning("OPENAI_API_KEY not set; skipping AI analysis")
        return {
            "executive_summary": None,
            "key_decisions": [],
            "action_items": [],
            "risks_or_blockers": [],
            "sentiment": None,
            "topics": [],
            "error": "OPENAI_API_KEY not set",
        }

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    title_str = title or "Meeting"
    participants_str = ""
    if participants:
        if isinstance(participants, list):
            participants_str = ", ".join(str(p) for p in participants)
        elif isinstance(participants, dict):
            participants_str = json.dumps(participants)
        else:
            participants_str = str(participants)

    user_content = f"Meeting title: {title_str}\n"
    if participants_str:
        user_content += f"Participants: {participants_str}\n\n"
    user_content += "Transcript:\n" + (transcript or "")

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content[:120000]},
        ],
        temperature=0.2,
    )
    text = response.choices[0].message.content or "{}"
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {
            "executive_summary": text[:2000],
            "key_decisions": [],
            "action_items": [],
            "risks_or_blockers": [],
            "sentiment": None,
            "topics": [],
            "raw_response": text,
        }


async def process_meeting_async(meeting_id: str) -> None:
    """
    Load meeting from DB, run AI analysis, update meeting with ai_analysis and ai_insights.
    Retries up to 3 times. Does not raise; logs errors.
    """
    db = get_database()
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            meeting = await get_meeting(db, meeting_id)
            if not meeting:
                logger.warning("Meeting not found for AI processing: %s", meeting_id)
                return
            transcript = meeting.get("transcript") or ""
            if not transcript.strip():
                logger.info("No transcript for meeting %s; skipping AI", meeting_id)
                return
            insights = await analyze_transcript(
                transcript=transcript,
                title=meeting.get("title"),
                participants=meeting.get("participants"),
            )
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
            logger.info("AI processing completed for meeting %s", meeting_id)
            return
        except Exception as e:
            last_error = e
            logger.warning("AI processing attempt %s/%s failed for %s: %s", attempt, MAX_RETRIES, meeting_id, e)
    logger.error("AI processing failed after %s retries for %s: %s", MAX_RETRIES, meeting_id, last_error)
