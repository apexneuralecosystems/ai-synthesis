#!/usr/bin/env python3
"""
Fetch meeting transcript from MeetGeek API, cache locally as JSON,
then push to MongoDB Atlas.

Usage:
  # Fetch from API + cache locally + push to MongoDB:
  python scripts/fetch_and_cache_meeting.py <meeting_id>

  # Push previously cached JSON to MongoDB (skip API fetch):
  python scripts/fetch_and_cache_meeting.py <meeting_id> --push-only

  # Fetch from API + cache locally only (skip MongoDB):
  python scripts/fetch_and_cache_meeting.py <meeting_id> --fetch-only
"""
import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

from config import get_settings

CACHE_DIR = Path(__file__).resolve().parent.parent / "cache"


def _json_serial(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


async def fetch_from_api(meeting_id: str) -> dict | None:
    settings = get_settings()
    if not settings.meetgeek_api_key:
        print("ERROR: MEETGEEK_API_KEY not set in .env", file=sys.stderr)
        return None

    base = settings.meetgeek_api_base.rstrip("/")
    headers = {"Authorization": f"Bearer {settings.meetgeek_api_key}"}
    out = {
        "meeting_id": meeting_id,
        "title": None,
        "transcript": None,
        "transcript_sentences": None,
        "summary": None,
        "participants": None,
        "duration": None,
        "highlights": None,
        "action_items": None,
        "date": None,
    }
    raw_records = []
    all_sentences = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(f"{base}/v1/meetings/{meeting_id}", headers=headers)
        if r.status_code == 200:
            data = r.json()
            raw_records.append({"type": "meeting", "payload": data})
            out["title"] = data.get("title") or data.get("name")
            out["duration"] = data.get("duration")
            out["participants"] = data.get("participants") or data.get("participant_emails")
            out["summary"] = data.get("summary")
            out["highlights"] = data.get("highlights")
            out["action_items"] = data.get("action_items")
            for ts_field in ("date", "timestamp_start_utc", "start_time"):
                if data.get(ts_field) and not out["date"]:
                    out["date"] = data[ts_field]
            if not out["duration"] and data.get("timestamp_start_utc") and data.get("timestamp_end_utc"):
                try:
                    start = datetime.fromisoformat(str(data["timestamp_start_utc"]).replace("Z", "+00:00"))
                    end = datetime.fromisoformat(str(data["timestamp_end_utc"]).replace("Z", "+00:00"))
                    out["duration"] = int((end - start).total_seconds())
                except Exception:
                    pass
            print(f"  Meeting details: OK (title={out['title']!r})")
        else:
            print(f"  Meeting details: HTTP {r.status_code}", file=sys.stderr)

        transcript_parts = []
        cursor = None
        page_num = 0
        while True:
            url = f"{base}/v1/meetings/{meeting_id}/transcript"
            params = {"limit": 500}
            if cursor:
                params["cursor"] = cursor
            r = await client.get(url, headers=headers, params=params)
            if r.status_code != 200:
                print(f"  Transcript page {page_num}: HTTP {r.status_code}", file=sys.stderr)
                break
            page = r.json()
            raw_records.append({"type": "transcript", "payload": page})
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
            page_num += 1
            print(f"  Transcript page {page_num}: {len(sentences)} sentences")
            cursor = (page.get("pagination") or {}).get("next_cursor") or page.get("next_cursor")
            if not cursor:
                break

        if transcript_parts:
            out["transcript"] = "\n".join(t for t in transcript_parts if t)
        if all_sentences:
            out["transcript_sentences"] = all_sentences

    return {"meeting": out, "raw_records": raw_records}


def save_cache(meeting_id: str, data: dict) -> Path:
    CACHE_DIR.mkdir(exist_ok=True)
    path = CACHE_DIR / f"{meeting_id}.json"
    path.write_text(json.dumps(data, indent=2, default=_json_serial), encoding="utf-8")
    return path


def load_cache(meeting_id: str) -> dict | None:
    path = CACHE_DIR / f"{meeting_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


async def push_to_mongodb(meeting_id: str, data: dict) -> bool:
    from database import get_database, save_meeting, get_meeting, update_meeting, save_raw_meetgeek_api, set_last_meeting_id

    db = get_database()

    for rec in data.get("raw_records", []):
        await save_raw_meetgeek_api(db, meeting_id, rec["type"], rec["payload"])
    print(f"  Saved {len(data.get('raw_records', []))} raw API records")

    meeting = data["meeting"]
    meeting_data = {
        "meeting_id": meeting_id,
        "title": meeting.get("title"),
        "date": meeting.get("date"),
        "duration": meeting.get("duration"),
        "participants": meeting.get("participants"),
        "transcript": meeting.get("transcript"),
        "transcript_sentences": meeting.get("transcript_sentences"),
        "summary": meeting.get("summary"),
        "highlights": meeting.get("highlights"),
        "action_items": meeting.get("action_items"),
        "processed": False,
    }

    existing = await get_meeting(db, meeting_id)
    if existing:
        update_dict = {k: v for k, v in meeting_data.items() if k != "meeting_id" and v is not None}
        await update_meeting(db, meeting_id, update_dict)
        print(f"  Updated existing meeting in MongoDB")
    else:
        await save_meeting(db, meeting_data)
        print(f"  Inserted new meeting in MongoDB")

    await set_last_meeting_id(db, meeting_id)
    return True


async def main():
    parser = argparse.ArgumentParser(description="Fetch meeting from MeetGeek API, cache, push to MongoDB")
    parser.add_argument("meeting_id", help="MeetGeek meeting ID")
    parser.add_argument("--fetch-only", action="store_true", help="Only fetch from API and cache locally")
    parser.add_argument("--push-only", action="store_true", help="Only push cached JSON to MongoDB")
    args = parser.parse_args()

    mid = args.meeting_id

    if not args.push_only:
        print(f"\n[1/2] Fetching meeting {mid} from MeetGeek API...")
        result = await fetch_from_api(mid)
        if not result:
            print("FAILED: Could not fetch from MeetGeek API", file=sys.stderr)
            sys.exit(1)
        cache_path = save_cache(mid, result)
        print(f"  Cached to {cache_path}")
        sentences = len(result["meeting"].get("transcript_sentences") or [])
        print(f"  Total: {sentences} transcript sentences")
    else:
        print(f"\n[1/2] Loading cached data for {mid}...")

    if args.fetch_only:
        print("\n[2/2] Skipping MongoDB push (--fetch-only)")
        print("\nDone! Run with --push-only later to push to MongoDB.")
        sys.exit(0)

    cached = load_cache(mid)
    if not cached:
        print(f"ERROR: No cached data for {mid}. Run without --push-only first.", file=sys.stderr)
        sys.exit(1)

    print(f"\n[2/2] Pushing to MongoDB Atlas...")
    try:
        ok = await push_to_mongodb(mid, cached)
        if ok:
            print("\nSUCCESS: Meeting stored in MongoDB Atlas!")
    except Exception as e:
        print(f"\nFAILED to push to MongoDB: {e}", file=sys.stderr)
        print("\nThe data is safely cached locally. To retry MongoDB push later:")
        print(f"  python scripts/fetch_and_cache_meeting.py {mid} --push-only")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
