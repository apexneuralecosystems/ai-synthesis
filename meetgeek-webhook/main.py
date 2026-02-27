"""
Entry point for the unified ApexNeural / MeetGeek backend.

This file simply re-exports the single FastAPI application defined in
`synthesis_agent.server`, so running `uvicorn main:app` or importing
`main.app` will always use the combined app (webhooks, meetings API,
chat, synthesis, reports, deltas, and static frontend) on one port.
"""

from synthesis_agent.server import app  # noqa: F401


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
