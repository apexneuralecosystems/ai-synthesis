"""
MongoDB document schemas (reference only).
Actual documents are stored as dicts via Motor; this file documents the expected shape.
"""

MEETING_SCHEMA = {
    "id": "str (UUID)",
    "meeting_id": "str (MeetGeek meeting ID, unique)",
    "title": "str | None",
    "date": "datetime | None",
    "duration": "int | None (seconds)",
    "participants": "list | dict | None",
    "transcript": "str | None (full plain text)",
    "transcript_sentences": "list[{speaker, text, timestamp}] | None",
    "summary": "str | None",
    "highlights": "dict | None",
    "action_items": "dict | list | None",
    "ai_analysis": "str | None (executive summary from GPT-4o)",
    "ai_insights": "dict | None (full structured AI output)",
    "processed": "bool (True if AI analysis has been run)",
    "created_at": "datetime (UTC)",
    "updated_at": "datetime (UTC)",
}

RAW_WEBHOOK_SCHEMA = {
    "id": "str (UUID)",
    "event_type": "str | None",
    "payload": "dict (raw webhook JSON)",
    "received_at": "datetime (UTC)",
}

RAW_MEETGEEK_API_SCHEMA = {
    "id": "str (UUID)",
    "meeting_id": "str",
    "response_type": "str ('meeting' | 'transcript')",
    "payload": "dict (raw API response JSON)",
    "fetched_at": "datetime (UTC)",
}
