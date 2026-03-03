"""
Pydantic models for LLM response validation.
Used to validate and normalize report_card (synthesis/survey) and delta_report (delta) outputs
for better reliability and clearer error messages.
"""
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError


# ─── Pain Report Card (synthesis + survey) ─────────────────────────────────────

class CostEstimate(BaseModel):
    model_config = ConfigDict(extra="allow")
    amount: str = Field(..., min_length=1)
    confidence: Literal["high", "medium", "low"]
    method: Literal["direct", "derived", "guesstimate"]
    basis: str = Field(..., min_length=1)


class PainPoint(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(..., pattern=r"^P\d+$")
    title: str = Field(..., min_length=3)
    description: str = Field(..., min_length=10)
    severity: int = Field(..., ge=1, le=10)
    severity_rationale: str = Field(..., min_length=10)
    source_quotes: list[str] = Field(..., min_length=1)
    cost_estimate: CostEstimate
    affected_stakeholders: list[str] = Field(..., min_length=1)
    current_workaround: str = Field(..., min_length=1)
    agent_opportunity: str = Field(..., min_length=1)


class ReportCardMeta(BaseModel):
    model_config = ConfigDict(extra="allow")
    call_id: str = Field(..., min_length=1)
    call_type: Literal["CEO", "Operations", "Tech", "Survey"]
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    duration_minutes: int = Field(..., ge=0)
    participants: list[str] = Field(..., min_length=1)
    interviewer: str = Field(..., min_length=1)
    recording_file: str | None = None
    transcript_file: str = Field(..., min_length=1)


class DataSignals(BaseModel):
    model_config = ConfigDict(extra="allow")
    systems_mentioned: list[str] = Field(default_factory=list)
    data_sources_identified: list[str] = Field(default_factory=list)
    access_feasibility: Literal["easy", "moderate", "complex"]
    access_notes: str = Field(..., min_length=1)


class StakeholderAssessment(BaseModel):
    model_config = ConfigDict(extra="allow")
    enthusiasm_level: int = Field(..., ge=1, le=10)
    enthusiasm_rationale: str = Field(..., min_length=1)
    trust_level: int = Field(..., ge=1, le=10)
    trust_rationale: str = Field(..., min_length=1)
    decision_authority: Literal["sole", "committee", "influencer only"]
    decision_authority_notes: str = Field(..., min_length=1)
    champion_identified: str = Field(..., min_length=1)
    resistance_risks: str = Field(..., min_length=1)


class HypothesisUpdates(BaseModel):
    model_config = ConfigDict(extra="allow")
    confirmed: list[str] = Field(default_factory=list)
    invalidated: list[str] = Field(default_factory=list)
    new: list[str] = Field(default_factory=list)


class ReportCard(BaseModel):
    """Inner report_card object from synthesis/survey LLM output."""
    model_config = ConfigDict(extra="allow")
    meta: ReportCardMeta
    executive_summary: str = Field(..., min_length=10)
    pain_points: list[PainPoint] = Field(..., min_length=1)
    data_signals: DataSignals
    stakeholder_assessment: StakeholderAssessment
    key_numbers: dict[str, Any] = Field(default_factory=dict)
    open_questions: list[str] = Field(..., min_length=1)
    hypothesis_updates: HypothesisUpdates
    call_type_specific_notes: dict[str, Any] = Field(default_factory=dict)
    pain_validity_score: int = Field(..., ge=1, le=10)
    pain_validity_rationale: str = Field(..., min_length=10)
    recommended_next_steps: list[str] = Field(..., min_length=1)


class PainReportCardResponse(BaseModel):
    """Top-level synthesis/survey LLM response: { report_card: { ... } }."""
    model_config = ConfigDict(extra="allow")
    report_card: ReportCard


# ─── Delta Report (delta analysis) ─────────────────────────────────────────────

class DeltaReportMeta(BaseModel):
    model_config = ConfigDict(extra="allow")
    generated_at: str = ""
    source_calls: list[str] = Field(default_factory=list)
    source_call_types: list[str] = Field(default_factory=list)
    source_participants: list[str] = Field(default_factory=list)
    analyst_note: str = ""


class DeltaReportOverallAssessment(BaseModel):
    model_config = ConfigDict(extra="allow")
    signal_strength: str = ""
    signal_strength_rationale: str = ""
    readiness_for_proposal: str = ""
    readiness_rationale: str = ""
    critical_gaps: list[str] = Field(default_factory=list)
    recommended_next_call_focus: list[str] = Field(default_factory=list)


class DeltaReport(BaseModel):
    """Inner delta_report object from delta LLM output."""
    model_config = ConfigDict(extra="allow")
    meta: DeltaReportMeta = Field(default_factory=DeltaReportMeta)
    agreements: list[dict[str, Any]] = Field(default_factory=list)
    contradictions: list[dict[str, Any]] = Field(default_factory=list)
    unique_insights: list[dict[str, Any]] = Field(default_factory=list)
    cost_reconciliation: list[dict[str, Any]] = Field(default_factory=list)
    updated_pain_validity_scores: list[dict[str, Any]] = Field(default_factory=list)
    recommended_focus: list[dict[str, Any]] = Field(default_factory=list)
    overall_assessment: DeltaReportOverallAssessment = Field(
        default_factory=DeltaReportOverallAssessment
    )


class DeltaReportResponse(BaseModel):
    """Top-level delta LLM response: { delta_report: { ... } }."""
    model_config = ConfigDict(extra="allow")
    delta_report: DeltaReport


def validate_pain_report_response(data: dict) -> tuple[dict, list[str]]:
    """
    Validate and normalize synthesis/survey LLM output. Returns (data_as_dict, list of error messages).
    If validation passes, returns (normalized_data, []). If it fails, returns (data, [error_msg, ...]).
    """
    try:
        parsed = PainReportCardResponse.model_validate(data)
        return parsed.model_dump(mode="json"), []
    except ValidationError as e:
        errors = []
        for err in e.errors():
            loc = ".".join(str(x) for x in err.get("loc", []))
            msg = err.get("msg", str(err))
            errors.append(f"{loc}: {msg}")
        return data, errors
    except Exception as e:
        return data, [str(e)]


def validate_delta_report_response(data: dict) -> tuple[dict, list[str]]:
    """
    Validate and normalize delta LLM output. Returns (data_as_dict, list of error messages).
    """
    try:
        parsed = DeltaReportResponse.model_validate(data)
        return parsed.model_dump(mode="json"), []
    except ValidationError as e:
        errors = []
        for err in e.errors():
            loc = ".".join(str(x) for x in err.get("loc", []))
            msg = err.get("msg", str(err))
            errors.append(f"{loc}: {msg}")
        return data, errors
    except Exception as e:
        return data, [str(e)]
