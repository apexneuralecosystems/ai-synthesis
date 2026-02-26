#!/usr/bin/env python3
"""
Push transcripts to MongoDB: fetch meetings from MeetGeek API and save to MongoDB.
Requires MEETGEEK_API_KEY and MONGODB_URI in .env.

Usage:
  python scripts/push_transcripts_to_mongodb.py <meeting_id> [meeting_id ...]
  echo "id1\nid2" | python scripts/push_transcripts_to_mongodb.py --stdin
"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import get_database
from webhook import sync_meeting_to_mongodb


async def main():
    parser = argparse.ArgumentParser(description="Push MeetGeek transcripts to MongoDB")
    parser.add_argument("meeting_ids", nargs="*", help="Meeting ID(s) to sync")
    parser.add_argument("--stdin", action="store_true", help="Read meeting IDs from stdin (one per line)")
    args = parser.parse_args()

    ids = list(args.meeting_ids)
    if args.stdin:
        for line in sys.stdin:
            mid = line.strip()
            if mid:
                ids.append(mid)

    if not ids:
        print("No meeting_ids provided. Pass them as arguments or use --stdin.", file=sys.stderr)
        sys.exit(1)

    db = get_database()
    results = []
    for meeting_id in ids:
        out = await sync_meeting_to_mongodb(db, meeting_id)
        results.append(out)
        status = "ok" if out.get("ok") else f"error: {out.get('error', 'unknown')}"
        print(f"  {meeting_id}: {status}")

    synced = sum(1 for r in results if r.get("ok"))
    print(f"\nSynced {synced}/{len(results)} meetings to MongoDB.", file=sys.stderr)
    sys.exit(0 if synced == len(results) else 1)


if __name__ == "__main__":
    asyncio.run(main())
