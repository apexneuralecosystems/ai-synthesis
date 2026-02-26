#!/usr/bin/env python3
"""
Copy meetings (and transcripts) from meetgeek.db (SQLite) into MongoDB.
Use when MongoDB is reachable; no MeetGeek API needed.

Usage:
  python scripts/migrate_sqlite_to_mongodb.py [--db-path meetgeek.db]
"""
import argparse
import asyncio
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient

from config import get_settings
from database import get_effective_mongodb_uri, _mongo_client_options


def _parse_ts(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except Exception:
            return None
    return None


def _parse_json(val):
    if val is None:
        return None
    if isinstance(val, dict):
        return val
    if isinstance(val, str) and val.strip():
        try:
            return json.loads(val)
        except Exception:
            return None
    return None


def read_meetings_from_sqlite(db_path: str) -> list[dict]:
    """Read all meetings from SQLite; return list of doc-like dicts for MongoDB."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.execute(
        "SELECT id, meeting_id, title, date, duration, participants, transcript, "
        "summary, highlights, action_items, ai_analysis, ai_insights, processed, "
        "created_at, updated_at, transcript_sentences FROM meetings"
    )
    rows = cur.fetchall()
    conn.close()
    out = []
    for row in rows:
        doc = {
            "id": row["id"],
            "meeting_id": row["meeting_id"],
            "title": row["title"],
            "date": _parse_ts(row["date"]),
            "duration": row["duration"],
            "participants": _parse_json(row["participants"]),
            "transcript": row["transcript"],
            "summary": row["summary"],
            "highlights": _parse_json(row["highlights"]),
            "action_items": _parse_json(row["action_items"]),
            "ai_analysis": row["ai_analysis"],
            "ai_insights": _parse_json(row["ai_insights"]),
            "processed": bool(row["processed"]),
            "created_at": _parse_ts(row["created_at"]) or datetime.now(timezone.utc),
            "updated_at": _parse_ts(row["updated_at"]) or datetime.now(timezone.utc),
        }
        ts_sent = row["transcript_sentences"]
        if ts_sent is not None:
            doc["transcript_sentences"] = _parse_json(ts_sent)
        else:
            doc["transcript_sentences"] = None
        out.append(doc)
    return out


async def main():
    parser = argparse.ArgumentParser(description="Migrate meetings from SQLite to MongoDB")
    parser.add_argument("--db-path", default="meetgeek.db", help="Path to meetgeek.db")
    args = parser.parse_args()
    db_path = Path(args.db_path)
    if not db_path.exists():
        print(f"SQLite DB not found: {db_path}", file=sys.stderr)
        sys.exit(1)

    settings = get_settings()
    try:
        uri = get_effective_mongodb_uri()
    except ValueError:
        print("MONGODB_URI not set in .env", file=sys.stderr)
        sys.exit(1)

    meetings = read_meetings_from_sqlite(str(db_path))
    if not meetings:
        print("No meetings in SQLite DB.", file=sys.stderr)
        sys.exit(0)

    client = AsyncIOMotorClient(uri, **_mongo_client_options())
    db_name = (settings.mongodb_db_name or "meetgeek").strip()
    db = client[db_name]
    coll = db["meetings"]

    synced = 0
    for doc in meetings:
        mid = doc["meeting_id"]
        existing = await coll.find_one({"meeting_id": mid})
        if existing:
            await coll.update_one(
                {"meeting_id": mid},
                {"$set": {k: v for k, v in doc.items() if k != "id" and k != "created_at"} | {"updated_at": datetime.now(timezone.utc)}},
            )
        else:
            await coll.insert_one(doc)
        synced += 1
        print(f"  {mid}: ok")

    client.close()
    print(f"\nMigrated {synced} meetings from {db_path} to MongoDB.", file=sys.stderr)
    sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
