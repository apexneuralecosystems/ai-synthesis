#!/usr/bin/env python3
"""
Export all meetings from the database to a JSON file (full data: transcript, ai_insights, etc.).
Run from project root: python scripts/export_all_meetings.py [--output meetings_export.json]
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

# Project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import get_database, get_all_meetings


def meeting_to_dict(m: dict) -> dict:
    """Convert meeting document to a JSON-serializable dict."""
    def _dt(v):
        if v is None:
            return None
        return v.isoformat() if hasattr(v, "isoformat") else v
    return {
        "id": m.get("id"),
        "meeting_id": m.get("meeting_id"),
        "title": m.get("title"),
        "date": _dt(m.get("date")),
        "duration": m.get("duration"),
        "participants": m.get("participants"),
        "transcript": m.get("transcript"),
        "summary": m.get("summary"),
        "highlights": m.get("highlights"),
        "action_items": m.get("action_items"),
        "ai_analysis": m.get("ai_analysis"),
        "ai_insights": m.get("ai_insights"),
        "processed": m.get("processed", False),
        "created_at": _dt(m.get("created_at")),
        "updated_at": _dt(m.get("updated_at")),
    }


async def main():
    parser = argparse.ArgumentParser(description="Export all meetings to JSON")
    parser.add_argument(
        "--output", "-o",
        default="meetings_export.json",
        help="Output JSON file path (default: meetings_export.json)",
    )
    args = parser.parse_args()
    out_path = Path(args.output)
    db = get_database()
    meetings = await get_all_meetings(db, skip=0, limit=50000)
    data = {
        "total": len(meetings),
        "meetings": [meeting_to_dict(m) for m in meetings],
    }
    out_path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    print(f"Exported {len(meetings)} meetings to {out_path}", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
