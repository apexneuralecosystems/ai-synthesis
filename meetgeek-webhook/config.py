"""
Centralized configuration from environment variables.
No hardcoded secrets; all values loaded from .env or environment.
"""
import os
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    meetgeek_secret: str = ""
    meetgeek_api_key: str = ""
    meetgeek_api_base: str = "https://api.meetgeek.ai"
    mongodb_uri: str = ""
    mongodb_standard_uri: str = ""  # Optional: use Atlas "Standard" connection string if SRV has SSL issues (e.g. WSL2)
    mongodb_db_name: str = "meetgeek"
    database_url: str = "sqlite+aiosqlite:///./meetgeek.db"
    openai_api_key: str = ""
    enable_ai_engine: bool = False
    port: int = 8000
    log_level: str = "INFO"
    # Optional: if set, public API (GET /meetings, /dashboard, etc.) requires this key via X-API-Key or Authorization: Bearer <key>
    public_api_key: str = ""

    @field_validator("meetgeek_secret", mode="before")
    @classmethod
    def strip_meetgeek_secret(cls, v: str | None) -> str:
        """Strip whitespace/newlines so env copy-paste does not break webhook verification."""
        return (v or "").strip()

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()
