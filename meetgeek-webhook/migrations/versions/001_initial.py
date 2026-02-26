"""
Initial MongoDB collections and indexes for MeetGeek webhook.
Creates: meetings, raw_webhooks, raw_meetgeek_api, migration_history (used by runner).
"""
from pymongo import ASCENDING, DESCENDING
from pymongo.database import Database


async def upgrade(db: Database) -> None:
    # Create collections implicitly by creating indexes. migration_history is created by runner.
    meetings = db["meetings"]
    await meetings.create_index([("meeting_id", ASCENDING)], unique=True)
    await meetings.create_index([("created_at", DESCENDING)])

    raw_webhooks = db["raw_webhooks"]
    await raw_webhooks.create_index([("event_type", ASCENDING)])
    await raw_webhooks.create_index([("received_at", DESCENDING)])

    raw_meetgeek_api = db["raw_meetgeek_api"]
    await raw_meetgeek_api.create_index([("meeting_id", ASCENDING)])
    await raw_meetgeek_api.create_index([("response_type", ASCENDING)])
    await raw_meetgeek_api.create_index([("meeting_id", ASCENDING), ("response_type", ASCENDING)])
    await raw_meetgeek_api.create_index([("fetched_at", ASCENDING)])
