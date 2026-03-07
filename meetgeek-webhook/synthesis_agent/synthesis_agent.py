#!/usr/bin/env python3
"""
AI Synthesis Agent: Process Zoom discovery call transcripts into
structured Pain Report Cards and Cross-Session Delta Reports.

Usage:
  python synthesis_agent.py synthesize --transcript path.txt --call-id AX001-D-001 --call-type CEO --interviewer "Anshul Jain"
  python synthesis_agent.py delta outputs/report_A.json outputs/report_B.json
"""
import argparse
import json
import logging
import os
import random
import re
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
PROMPTS_DIR = BASE_DIR / "prompts"
SCHEMAS_DIR = BASE_DIR / "schemas"
OUTPUTS_DIR = BASE_DIR / "outputs"
LOG_FILE = BASE_DIR / "synthesis_agent.log"

MAX_TOKENS_BEFORE_CHUNKING = 150_000
TOKENS_PER_CHAR = 4
QUOTE_SPOT_CHECK_COUNT = 5
VALID_CALL_TYPES = ("CEO", "Operations", "Tech")

logger = logging.getLogger("synthesis_agent")


def setup_logging() -> None:
    """Configure logging to stdout and file with timestamps."""
    fmt = "%(asctime)s [%(levelname)s] %(message)s"
    logging.basicConfig(level=logging.INFO, format=fmt, handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
    ])


def load_transcript(path: Path) -> str:
    """Load transcript from .txt or .vtt file."""
    if not path.exists():
        raise FileNotFoundError(f"Transcript file not found: {path}")
    text = path.read_text(encoding="utf-8")
    logger.info("Loaded transcript: %s (%d bytes)", path, len(text))
    if path.suffix.lower() == ".vtt":
        text = clean_vtt(text)
        logger.info("Cleaned VTT format: %d chars plain text", len(text))
    return text


def clean_vtt(text: str) -> str:
    """Strip VTT timestamps, WEBVTT header, and cue tags to plain text."""
    cleaned: list[str] = []
    for line in text.split("\n"):
        line = line.strip()
        if not line or line == "WEBVTT" or line.startswith("NOTE"):
            continue
        if re.match(r"^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->", line):
            continue
        if re.match(r"^\d+$", line):
            continue
        cleaned.append(re.sub(r"<[^>]+>", "", line))
    return "\n".join(cleaned)


def estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token."""
    return len(text) // TOKENS_PER_CHAR


def chunk_transcript(text: str, max_tokens: int = MAX_TOKENS_BEFORE_CHUNKING) -> list[str]:
    """Split transcript by speaker turns into chunks under max_tokens."""
    max_chars = max_tokens * TOKENS_PER_CHAR
    turns = re.split(r"(?=\n[A-Z][a-zA-Z\s]+:)", text)
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for turn in turns:
        if current_len + len(turn) > max_chars and current:
            chunks.append("".join(current))
            current = [turn]
            current_len = len(turn)
        else:
            current.append(turn)
            current_len += len(turn)
    if current:
        chunks.append("".join(current))
    return chunks


def load_prompt(name: str) -> str:
    """Load a prompt file from the prompts/ directory."""
    path = PROMPTS_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Prompt file not found: {path}")
    return path.read_text(encoding="utf-8")


def build_synthesis_user_message(
    call_id: str, call_type: str, interviewer: str,
    transcript: str, transcript_file: str,
) -> str:
    """Build the user message for the synthesis LLM call."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return (
        f"CALL TYPE: {call_type}\nCALL ID: {call_id}\nDATE: {today}\n"
        f"INTERVIEWER: {interviewer}\nTRANSCRIPT FILE: {transcript_file}\n\n"
        f"--- TRANSCRIPT START ---\n{transcript}\n--- TRANSCRIPT END ---"
    )


def build_delta_user_message(report_cards: list[dict]) -> str:
    """Build the user message for the delta analysis LLM call."""
    parts = ["Below are the Pain Report Cards to compare:\n"]
    for i, rc in enumerate(report_cards, 1):
        meta = rc.get("report_card", {}).get("meta", {})
        parts.append(f"--- REPORT CARD {i}: {meta.get('call_id', 'unknown')} ({meta.get('call_type', 'unknown')}) ---")
        parts.append(json.dumps(rc, indent=2))
        parts.append("")
    return "\n".join(parts)


OPENROUTER_API_KEY = (os.environ.get("openrouter_api_key") or os.environ.get("OPENROUTER_API_KEY") or "").strip()
OPENROUTER_OPUS_MODEL = "anthropic/claude-opus-4.6"
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_OPUS_MODEL = "claude-opus-4-6"


def _call_opus_openrouter(system_prompt: str, user_message: str) -> tuple[str, dict]:
    """Call OpenRouter with Anthropic Opus 4.6. Returns (response_text, usage_info)."""
    import openai
    client = openai.OpenAI(api_key=OPENROUTER_API_KEY, base_url="https://openrouter.ai/api/v1")
    start = time.time()
    response = client.chat.completions.create(
        model=OPENROUTER_OPUS_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        temperature=0.2,
    )
    elapsed = time.time() - start
    text = response.choices[0].message.content or ""
    usage = {
        "model": OPENROUTER_OPUS_MODEL,
        "input_tokens": response.usage.prompt_tokens,
        "output_tokens": response.usage.completion_tokens,
        "elapsed_seconds": round(elapsed, 2),
    }
    logger.info("OpenRouter %s: %d in / %d out, %.2fs",
                OPENROUTER_OPUS_MODEL, usage["input_tokens"], usage["output_tokens"], elapsed)
    return text, usage


def _call_opus_anthropic(system_prompt: str, user_message: str) -> tuple[str, dict]:
    """Call Anthropic API with Opus 4.6. Returns (response_text, usage_info)."""
    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    start = time.time()
    response = client.messages.create(
        model=ANTHROPIC_OPUS_MODEL,
        max_tokens=8192,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
        temperature=0.2,
    )
    elapsed = time.time() - start
    text = (response.content[0].text if response.content else "") or ""
    usage = {
        "model": ANTHROPIC_OPUS_MODEL,
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "elapsed_seconds": round(elapsed, 2),
    }
    logger.info("Anthropic %s: %d in / %d out, %.2fs",
                ANTHROPIC_OPUS_MODEL, usage["input_tokens"], usage["output_tokens"], elapsed)
    return text, usage


def call_claude(system_prompt: str, user_message: str) -> tuple[str, dict]:
    """Call Anthropic Opus 4.6 (direct API). Returns (response_text, usage_info)."""
    if not ANTHROPIC_API_KEY:
        raise EnvironmentError("ANTHROPIC_API_KEY not set. Add it to .env file.")
    return _call_opus_anthropic(system_prompt, user_message)


def call_llm(system_prompt: str, user_message: str) -> tuple[str, dict]:
    """Use Anthropic Opus 4.6 only: OpenRouter first, then direct Anthropic. No GPT-4o."""
    if OPENROUTER_API_KEY:
        try:
            return _call_opus_openrouter(system_prompt, user_message)
        except Exception as e:
            logger.warning("OpenRouter failed (%s), trying Anthropic", e)
    if ANTHROPIC_API_KEY:
        return _call_opus_anthropic(system_prompt, user_message)
    raise EnvironmentError(
        "OPENROUTER_API_KEY (or openrouter_api_key) or ANTHROPIC_API_KEY must be set for Opus 4.6."
    )


def parse_json_response(text: str) -> dict:
    """Parse JSON from LLM response, stripping markdown fences if present."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        end = len(lines)
        for i in range(len(lines) - 1, 0, -1):
            if lines[i].strip().startswith("```"):
                end = i
                break
        text = "\n".join(lines[1:end])
    return json.loads(text)


def validate_report_card(data: dict) -> list[str]:
    """Validate Pain Report Card against JSON schema. Returns list of errors."""
    import jsonschema
    schema = json.loads((SCHEMAS_DIR / "pain_report_card.json").read_text(encoding="utf-8"))
    validator = jsonschema.Draft7Validator(schema)
    errors = []
    for err in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path)):
        path = ".".join(str(p) for p in err.absolute_path)
        errors.append(f"{path}: {err.message}")
    return errors


def attempt_repair(broken_json: dict, errors: list[str], system_prompt: str) -> dict | None:
    """Ask the LLM to fix schema validation errors."""
    repair_msg = (
        "The following JSON Pain Report Card has schema validation errors. "
        "Fix ALL errors and return ONLY the corrected JSON.\n\n"
        "ERRORS:\n" + "\n".join(f"- {e}" for e in errors) + "\n\n"
        f"BROKEN JSON:\n{json.dumps(broken_json, indent=2)}"
    )
    try:
        text, _ = call_llm(system_prompt, repair_msg)
        return parse_json_response(text)
    except Exception as e:
        logger.error("Repair pass failed: %s", e)
        return None


def attempt_repair_from_raw(raw_text: str, system_prompt: str, call_id: str) -> dict | None:
    """Try to extract valid JSON from raw LLM text that failed parsing."""
    repair_msg = (
        "The following text was supposed to be a valid JSON Pain Report Card "
        "but failed to parse. Fix it and return ONLY valid JSON.\n\n"
        f"RAW TEXT:\n{raw_text[:10000]}"
    )
    try:
        text, _ = call_llm(system_prompt, repair_msg)
        return parse_json_response(text)
    except Exception as e:
        logger.error("Repair from raw failed: %s", e)
        return None


def spot_check_quotes(
    report_card: dict, transcript: str, n: int = QUOTE_SPOT_CHECK_COUNT,
) -> list[dict]:
    """Sample n source_quotes and verify each appears verbatim in the transcript."""
    all_quotes: list[str] = []
    for pp in report_card.get("report_card", {}).get("pain_points", []):
        all_quotes.extend(pp.get("source_quotes", []))
    if not all_quotes:
        logger.warning("No source quotes found for spot check")
        return []
    sample = random.sample(all_quotes, min(n, len(all_quotes)))
    transcript_lower = transcript.lower()
    results: list[dict] = []
    for quote in sample:
        found = quote.lower() in transcript_lower
        status = "PASS" if found else "FAIL"
        results.append({"quote": quote[:80], "found": found, "status": status})
        logger.info("Quote check [%s]: %.60s...", status, quote)
    return results


def save_output(data: dict, filename: str) -> Path:
    """Save JSON to outputs/ directory."""
    OUTPUTS_DIR.mkdir(exist_ok=True)
    path = OUTPUTS_DIR / filename
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("Saved: %s (%d bytes)", path, path.stat().st_size)
    return path


def save_raw_response(text: str, call_id: str) -> Path:
    """Save raw LLM response for debugging."""
    OUTPUTS_DIR.mkdir(exist_ok=True)
    path = OUTPUTS_DIR / f"raw_{call_id}.txt"
    path.write_text(text, encoding="utf-8")
    logger.info("Saved raw response: %s", path)
    return path


def print_synthesis_summary(rc: dict) -> None:
    """Print a clean summary of the Pain Report Card to stdout."""
    card = rc.get("report_card", {})
    meta = card.get("meta", {})
    pps = card.get("pain_points", [])
    print("\n" + "=" * 60)
    print(f"  PAIN REPORT CARD: {meta.get('call_id', '?')}")
    print(f"  Type: {meta.get('call_type', '?')}  |  Date: {meta.get('date', '?')}")
    print(f"  Participants: {', '.join(meta.get('participants', []))}")
    print("=" * 60)
    print(f"\n  Summary: {card.get('executive_summary', 'N/A')}\n")
    print(f"  Pain Points ({len(pps)}):")
    for pp in pps:
        cost = pp.get("cost_estimate", {}).get("amount", "?")
        print(f"    [{pp.get('id')}] {pp.get('title')} "
              f"- severity: {pp.get('severity', '?')}/10, cost: {cost}")
    print(f"\n  Validity Score: {card.get('pain_validity_score', '?')}/10")
    print(f"  Next Steps: {len(card.get('recommended_next_steps', []))} items")
    print("=" * 60 + "\n")


def print_delta_summary(delta: dict) -> None:
    """Print a clean summary of the Delta Report to stdout."""
    dr = delta.get("delta_report", {})
    meta = dr.get("meta", {})
    print("\n" + "=" * 60)
    print("  CROSS-SESSION DELTA REPORT")
    print(f"  Sources: {', '.join(meta.get('source_calls', []))}")
    print("=" * 60)
    for a in dr.get("agreements", []):
        print(f"  [AGREED] {a.get('pain_theme')} ({a.get('validation_status')})")
    for c in dr.get("contradictions", []):
        print(f"  [CONFLICT] {c.get('pain_theme')} ({c.get('contradiction_type')})")
    print("\n  Top Focus:")
    for f in dr.get("recommended_focus", []):
        print(f"    #{f.get('rank')}: {f.get('pain_theme')} "
              f"- composite: {f.get('composite_score')}")
    oa = dr.get("overall_assessment", {})
    print(f"\n  Readiness: {oa.get('readiness_for_proposal', '?')}")
    print(f"  Signal: {oa.get('signal_strength', '?')}")
    print("=" * 60 + "\n")


def process_chunked_transcript(
    chunks: list[str], system_prompt: str,
    call_id: str, call_type: str, interviewer: str, transcript_file: str,
) -> dict:
    """Process long transcript in chunks, then merge via a second LLM call."""
    partials: list[dict] = []
    for i, chunk in enumerate(chunks, 1):
        logger.info("Processing chunk %d/%d (%d chars)", i, len(chunks), len(chunk))
        user_msg = build_synthesis_user_message(
            call_id, call_type, interviewer, chunk, transcript_file,
        )
        user_msg = f"[CHUNK {i} of {len(chunks)}]\n\n" + user_msg
        text, _ = call_llm(system_prompt, user_msg)
        partials.append(parse_json_response(text))

    merge_msg = (
        f"Merge these {len(partials)} partial Pain Report Cards from chunks "
        f"of the same transcript into ONE complete report. Deduplicate pain points. "
        f"Combine source quotes. Keep highest severity for duplicates.\n"
        f"Call ID: {call_id}, Call Type: {call_type}, Interviewer: {interviewer}\n\n"
    )
    for i, pr in enumerate(partials, 1):
        merge_msg += f"--- PARTIAL {i} ---\n{json.dumps(pr, indent=2)}\n\n"

    text, _ = call_llm(system_prompt, merge_msg)
    return parse_json_response(text)


def cmd_synthesize(args: argparse.Namespace) -> int:
    """Execute the synthesize command."""
    transcript_path = Path(args.transcript)
    try:
        transcript = load_transcript(transcript_path)
    except FileNotFoundError as e:
        logger.error(str(e))
        return 1

    system_prompt = load_prompt("synthesis_system.txt")
    tokens = estimate_tokens(transcript)
    logger.info("Estimated tokens: %d (threshold: %d)", tokens, MAX_TOKENS_BEFORE_CHUNKING)

    try:
        data = _run_synthesis(
            transcript, system_prompt, args.call_id, args.call_type,
            args.interviewer, transcript_path.name, tokens,
        )
    except EnvironmentError as e:
        logger.error(str(e))
        return 1
    except Exception as e:
        logger.error("Synthesis failed: %s\n%s", e, traceback.format_exc())
        return 1

    if data is None:
        return 1
    return _finalize_report(data, args.call_id, system_prompt, transcript)


def _run_synthesis(
    transcript: str, system_prompt: str, call_id: str,
    call_type: str, interviewer: str, filename: str, tokens: int,
) -> dict | None:
    """Run the LLM synthesis (chunked or single). Returns parsed dict or None."""
    if tokens > MAX_TOKENS_BEFORE_CHUNKING:
        logger.info("Transcript exceeds token limit, chunking...")
        chunks = chunk_transcript(transcript)
        logger.info("Split into %d chunks", len(chunks))
        return process_chunked_transcript(
            chunks, system_prompt, call_id, call_type, interviewer, filename,
        )

    user_msg = build_synthesis_user_message(
        call_id, call_type, interviewer, transcript, filename,
    )
    text, _ = call_llm(system_prompt, user_msg)
    try:
        return parse_json_response(text)
    except json.JSONDecodeError:
        logger.error("JSON parse failed, saving raw response")
        save_raw_response(text, call_id)
        return attempt_repair_from_raw(text, system_prompt, call_id)


def _finalize_report(data: dict, call_id: str, system_prompt: str, transcript: str) -> int:
    """Validate, repair if needed, spot-check quotes, and save."""
    errors = validate_report_card(data)
    if errors:
        logger.warning("Schema validation errors (%d):", len(errors))
        for err in errors:
            logger.warning("  - %s", err)
        repaired = attempt_repair(data, errors, system_prompt)
        if repaired:
            data = repaired
            re_errors = validate_report_card(data)
            if re_errors:
                logger.warning("Repair still has %d errors, using best effort", len(re_errors))
            else:
                logger.info("Repair pass fixed all errors")

    results = spot_check_quotes(data, transcript)
    passed = sum(1 for r in results if r["found"])
    logger.info("Quote spot check: %d/%d passed", passed, len(results))

    save_output(data, f"report_{call_id}.json")
    print_synthesis_summary(data)
    return 0


def cmd_delta(args: argparse.Namespace) -> int:
    """Execute the delta analysis command."""
    report_cards: list[dict] = []
    for fp in args.reports:
        path = Path(fp)
        if not path.exists():
            logger.error("Report card not found: %s", path)
            return 1
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            logger.error("Invalid JSON in %s: %s", path, e)
            return 1
        report_cards.append(data)
        cid = data.get("report_card", {}).get("meta", {}).get("call_id", "?")
        logger.info("Loaded: %s", cid)

    if len(report_cards) < 2:
        logger.error("Delta requires at least 2 report cards")
        return 1

    system_prompt = load_prompt("delta_system.txt")
    user_msg = build_delta_user_message(report_cards)

    try:
        text, _ = call_llm(system_prompt, user_msg)
        delta = parse_json_response(text)
    except json.JSONDecodeError:
        logger.error("Delta JSON parse failed")
        save_raw_response(text, "delta")
        return 1
    except EnvironmentError as e:
        logger.error(str(e))
        return 1
    except Exception as e:
        logger.error("Delta failed: %s\n%s", e, traceback.format_exc())
        return 1

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    save_output(delta, f"delta_{ts}.json")
    print_delta_summary(delta)
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Build the CLI parser."""
    parser = argparse.ArgumentParser(
        prog="synthesis_agent",
        description="AI Synthesis Agent: Pain Report Card generator",
    )
    subs = parser.add_subparsers(dest="command", required=True)

    syn = subs.add_parser("synthesize", help="Transcript to Pain Report Card")
    syn.add_argument("--transcript", required=True, help="Path to .txt/.vtt file")
    syn.add_argument("--call-id", required=True, help="Call ID (e.g. AX001-D-001)")
    syn.add_argument("--call-type", required=True, choices=VALID_CALL_TYPES)
    syn.add_argument("--interviewer", default="Anshul Jain")

    dlt = subs.add_parser("delta", help="Compare multiple Pain Report Cards")
    dlt.add_argument("reports", nargs="+", help="Report card JSON files")

    return parser


def main() -> int:
    """Entry point."""
    setup_logging()
    args = build_parser().parse_args()
    if args.command == "synthesize":
        return cmd_synthesize(args)
    elif args.command == "delta":
        return cmd_delta(args)
    return 1


if __name__ == "__main__":
    sys.exit(main())
