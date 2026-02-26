"""
Run MongoDB migrations in order. Tracks applied migrations in migration_history collection.
Usage: python -m migrations.runner
Or call run_migrations() from app startup.
"""
import asyncio
import importlib.util
import logging
import os
import sys
from pathlib import Path

# Project root for config
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient

from config import get_settings
from database import get_effective_mongodb_uri, _mongo_client_options

logger = logging.getLogger(__name__)

COLLECTION_HISTORY = "migration_history"
MIGRATIONS_DIR = Path(__file__).resolve().parent / "versions"


async def _get_applied(db) -> set[str]:
    """Return set of applied migration names."""
    cursor = db[COLLECTION_HISTORY].find({}, {"_id": 0, "name": 1})
    names = set()
    async for doc in cursor:
        names.add(doc["name"])
    return names


def _list_migration_files() -> list[tuple[str, Path]]:
    """List (name, path) of migration files sorted by name (e.g. 001_initial.py)."""
    if not MIGRATIONS_DIR.exists():
        return []
    out = []
    for p in sorted(MIGRATIONS_DIR.iterdir()):
        if p.suffix == ".py" and p.name != "__init__.py" and not p.name.startswith("_"):
            name = p.stem
            out.append((name, p))
    return out


async def run_migrations() -> None:
    """Connect to MongoDB, run any pending migrations, record in migration_history."""
    settings = get_settings()
    db_name = (settings.mongodb_db_name or "meetgeek").strip()
    uri = get_effective_mongodb_uri()
    client = AsyncIOMotorClient(uri, **_mongo_client_options())
    db = client[db_name]
    try:
        applied = await _get_applied(db)
        for name, path in _list_migration_files():
            if name in applied:
                continue
            logger.info("Running migration: %s", name)
            spec = importlib.util.spec_from_file_location(name, path)
            if not spec or not spec.loader:
                logger.error("Failed to load migration %s", path)
                continue
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            if not hasattr(mod, "upgrade"):
                logger.error("Migration %s has no upgrade(db) function", name)
                continue
            await mod.upgrade(db)
            await db[COLLECTION_HISTORY].insert_one({"name": name})
            applied.add(name)
        logger.info("Migrations complete.")
    finally:
        client.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    asyncio.run(run_migrations())


if __name__ == "__main__":
    main()
