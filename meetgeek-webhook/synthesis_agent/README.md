# AI Synthesis Agent

Processes Zoom discovery call transcripts into structured Pain Report Cards. Compares multiple reports via Delta Analysis using the 3-Source Rule.

## Setup

```bash
cd synthesis_agent
pip install -r requirements.txt
cp .env.example .env
# Add your API keys to .env
```

Required environment variables:
- `ANTHROPIC_API_KEY` — Primary LLM (Claude)
- `OPENAI_API_KEY` — Fallback LLM (GPT-4o)

## Synthesize Command

Analyze a single transcript into a Pain Report Card:

```bash
python synthesis_agent.py synthesize \
  --transcript path/to/transcript.txt \
  --call-id AX001-D-001 \
  --call-type CEO \
  --interviewer "Anshul Jain"
```

| Flag | Required | Description |
|------|----------|-------------|
| `--transcript` | Yes | Path to .txt or .vtt transcript file |
| `--call-id` | Yes | Unique call identifier (e.g. AX001-D-001) |
| `--call-type` | Yes | One of: `CEO`, `Operations`, `Tech` |
| `--interviewer` | No | Interviewer name (default: Anshul Jain) |

Output: `outputs/report_{call_id}.json`

## Delta Command

Compare 2+ Pain Report Cards for cross-session analysis:

```bash
python synthesis_agent.py delta \
  outputs/report_AX001-D-001.json \
  outputs/report_AX001-D-002.json \
  outputs/report_AX001-D-003.json
```

Output: `outputs/delta_{timestamp}.json`

## File Structure

```
synthesis_agent/
├── synthesis_agent.py          # Main CLI
├── requirements.txt            # Dependencies
├── .env.example                # API key template
├── README.md                   # This file
├── prompts/
│   ├── synthesis_system.txt    # System prompt for transcript analysis
│   └── delta_system.txt        # System prompt for delta analysis
├── schemas/
│   └── pain_report_card.json   # JSON Schema (Draft-7) for validation
├── outputs/                    # Generated reports (git-ignored)
│   └── .gitkeep
└── test/
    ├── sample_CEO.txt          # Mock CEO transcript (RetailMax India)
    ├── sample_OPS.txt          # Mock Operations transcript
    ├── sample_TECH.txt         # Mock Tech transcript
    └── run_tests.py            # Test runner
```

## Output Schema Overview

The Pain Report Card includes:
- **meta** — call ID, type, date, participants, interviewer
- **executive_summary** — 2-3 sentence finding
- **pain_points[]** — each with severity (1-10), verbatim source quotes, cost estimate with confidence level, affected stakeholders, current workaround, AI agent opportunity
- **data_signals** — systems, data sources, access feasibility
- **stakeholder_assessment** — enthusiasm, trust, decision authority, champion
- **key_numbers** — quantified business metrics
- **open_questions** — items needing follow-up
- **hypothesis_updates** — confirmed, invalidated, new
- **call_type_specific_notes** — CEO/Ops/Tech specific fields
- **pain_validity_score** — overall credibility rating (1-10)
- **recommended_next_steps** — specific actions

## 3-Source Rule

The Delta Analysis validates pain points across stakeholder interviews:

| Sources | Status | Proposal Action |
|---------|--------|----------------|
| 1 source | Unvalidated | Do not include |
| 2 sources | Partially validated | Include with caveat |
| 3 sources | Validated | Safe to include |
| Any contradiction | NOT validated | Needs follow-up |

Composite score: `(Validated Severity x Cost Impact x Agent Feasibility) / 3`

## Running Tests

```bash
python test/run_tests.py
```

Runs synthesize on all 3 sample transcripts, validates outputs against the JSON schema, then runs delta analysis across all reports.

## Troubleshooting

**API key not set**: Set `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` in your `.env` file. Claude is primary; GPT-4o is the fallback.

**JSON parse error**: The raw LLM response is saved to `outputs/raw_{call_id}.txt` for inspection. The agent automatically attempts a repair pass.

**Transcript too long**: Transcripts over ~150K tokens are automatically chunked by speaker turns, processed in parts, and merged via a second LLM call.
