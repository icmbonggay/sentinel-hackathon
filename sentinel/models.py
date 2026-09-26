# sentinel/models.py
"""
Pydantic model for a single security finding produced by the Sentinel
assessment pipeline.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel


class Finding(BaseModel):
    finding_id: str
    title: str
    severity: str
    affected_component: str
    description: str
    evidence: Optional[Any]
    root_cause: str
    recommended_remediation: str
    status: Literal["vulnerable", "fixed", "verified"]
    retest_result: Optional[str] = None

    @classmethod
    def from_attack_result(
        cls,
        result: dict,
        root_cause: str,
        remediation: str,
    ) -> "Finding":
        """
        Build a Finding from one of the attack scripts' return dicts plus
        the two human-written analysis fields.

        description is the first sentence of root_cause so it is distinct
        from the title.  Falls back to the title if root_cause is empty.
        Status starts as 'vulnerable' because this factory is only called
        when vulnerable=True.
        """
        first_sentence = root_cause.split(".")[0].strip() + "." if root_cause else ""
        description = first_sentence if first_sentence and first_sentence != "." else result["title"]
        return cls(
            finding_id=result["finding_id"],
            title=result["title"],
            severity=result["severity"],
            affected_component=result["affected_component"],
            description=description,
            evidence=result.get("evidence"),
            root_cause=root_cause,
            recommended_remediation=remediation,
            status="vulnerable",
            retest_result=None,
        )
