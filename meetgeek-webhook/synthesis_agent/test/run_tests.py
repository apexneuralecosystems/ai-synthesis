#!/usr/bin/env python3
"""
Test runner: synthesize all 3 sample transcripts, validate outputs, run delta analysis.
Exit 0 if all pass, exit 1 if any fail.
"""
import json
import subprocess
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUTS_DIR = BASE_DIR / "outputs"
TEST_DIR = BASE_DIR / "test"
AGENT = BASE_DIR / "synthesis_agent.py"
SCHEMA_PATH = BASE_DIR / "schemas" / "pain_report_card.json"

SYNTH_CASES = [
    {"transcript": TEST_DIR / "sample_CEO.txt", "call_id": "TEST-D-001", "call_type": "CEO"},
    {"transcript": TEST_DIR / "sample_OPS.txt", "call_id": "TEST-D-002", "call_type": "Operations"},
    {"transcript": TEST_DIR / "sample_TECH.txt", "call_id": "TEST-D-003", "call_type": "Tech"},
]

passed = 0
failed = 0
failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    """Record a test result."""
    global passed, failed
    if condition:
        passed += 1
        print(f"  [PASS] {name}")
    else:
        failed += 1
        msg = f"{name}: {detail}" if detail else name
        failures.append(msg)
        print(f"  [FAIL] {msg}")


def run_synthesize(transcript: Path, call_id: str, call_type: str) -> Path | None:
    """Run the synthesize command and return the output path."""
    cmd = [
        sys.executable, str(AGENT), "synthesize",
        "--transcript", str(transcript),
        "--call-id", call_id,
        "--call-type", call_type,
        "--interviewer", "Anshul Jain",
    ]
    print(f"\n{'='*50}")
    print(f"Running: synthesize {call_id} ({call_type})")
    print(f"{'='*50}")
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(BASE_DIR))
    if result.returncode != 0:
        print(f"  STDERR: {result.stderr[:500]}")
        return None
    output_path = OUTPUTS_DIR / f"report_{call_id}.json"
    return output_path if output_path.exists() else None


def validate_report(path: Path, call_id: str) -> dict | None:
    """Run assertions on a report card file."""
    check(f"{call_id}: output file exists", path is not None and path.exists())
    if not path or not path.exists():
        return None

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        check(f"{call_id}: valid JSON", False, str(e))
        return None
    check(f"{call_id}: valid JSON", True)

    rc = data.get("report_card", {})
    check(f"{call_id}: has report_card key", "report_card" in data)

    pps = rc.get("pain_points", [])
    check(f"{call_id}: pain_points >= 2", len(pps) >= 2, f"got {len(pps)}")

    all_have_quotes = all(
        len(pp.get("source_quotes", [])) >= 1 for pp in pps
    )
    check(f"{call_id}: every pain has source_quote", all_have_quotes)

    all_quotes_nonempty = all(
        all(isinstance(q, str) and len(q) > 0 for q in pp.get("source_quotes", []))
        for pp in pps
    )
    check(f"{call_id}: source_quotes are non-empty", all_quotes_nonempty)

    score = rc.get("pain_validity_score")
    check(f"{call_id}: validity score 1-10",
          isinstance(score, (int, float)) and 1 <= score <= 10,
          f"got {score}")

    all_sev_ok = all(
        isinstance(pp.get("severity"), (int, float)) and 1 <= pp["severity"] <= 10
        for pp in pps
    )
    check(f"{call_id}: severity scores 1-10", all_sev_ok)

    summary = rc.get("executive_summary", "")
    check(f"{call_id}: executive_summary non-empty",
          isinstance(summary, str) and len(summary) > 10)

    steps = rc.get("recommended_next_steps", [])
    check(f"{call_id}: has next_steps", len(steps) >= 1, f"got {len(steps)}")

    try:
        import jsonschema
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        errors = list(jsonschema.Draft7Validator(schema).iter_errors(data))
        check(f"{call_id}: passes schema", len(errors) == 0,
              f"{len(errors)} errors")
    except ImportError:
        check(f"{call_id}: schema validation (jsonschema not installed)", False)

    return data


def run_delta(report_paths: list[Path]) -> Path | None:
    """Run the delta command."""
    cmd = [sys.executable, str(AGENT), "delta"] + [str(p) for p in report_paths]
    print(f"\n{'='*50}")
    print("Running: delta analysis")
    print(f"{'='*50}")
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(BASE_DIR))
    if result.returncode != 0:
        print(f"  STDERR: {result.stderr[:500]}")
        return None
    delta_files = sorted(OUTPUTS_DIR.glob("delta_*.json"), key=lambda p: p.stat().st_mtime)
    return delta_files[-1] if delta_files else None


def validate_delta(path: Path | None) -> None:
    """Run assertions on the delta report."""
    check("delta: output file exists", path is not None and path.exists())
    if not path or not path.exists():
        return

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        check("delta: valid JSON", False, str(e))
        return
    check("delta: valid JSON", True)

    dr = data.get("delta_report", {})
    check("delta: has delta_report key", "delta_report" in data)

    agreements = dr.get("agreements", [])
    check("delta: agreements not empty", len(agreements) > 0)

    focus = dr.get("recommended_focus", [])
    check("delta: recommended_focus has 3 items",
          len(focus) == 3, f"got {len(focus)}")

    all_have_calc = all(
        "composite_calculation" in f for f in focus
    )
    check("delta: focus items have composite_calculation", all_have_calc)

    oa = dr.get("overall_assessment", {})
    readiness = oa.get("readiness_for_proposal", "")
    valid_values = ("ready", "needs_one_more_call", "not_ready")
    check("delta: readiness is valid value",
          readiness in valid_values, f"got '{readiness}'")


def main() -> int:
    """Run all tests."""
    OUTPUTS_DIR.mkdir(exist_ok=True)

    report_paths: list[Path] = []
    for case in SYNTH_CASES:
        path = run_synthesize(case["transcript"], case["call_id"], case["call_type"])
        if path:
            validate_report(path, case["call_id"])
            report_paths.append(path)
        else:
            check(f"{case['call_id']}: synthesize succeeded", False, "command failed")

    if len(report_paths) >= 2:
        delta_path = run_delta(report_paths)
        validate_delta(delta_path)
    else:
        print("\nSkipping delta: need at least 2 successful reports")
        check("delta: enough reports to run", False, f"only {len(report_paths)}")

    print(f"\n{'='*50}")
    print(f"  RESULTS: {passed} PASSED / {passed + failed} TOTAL")
    if failures:
        print(f"  FAILED ({failed}):")
        for f in failures:
            print(f"    - {f}")
    else:
        print("  ALL TESTS PASSED")
    print(f"{'='*50}\n")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
