"""Data Validation Guardrail for pipeline auto-publish (mirrors lib/data-guardrail.js)."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from country_registry import load_registry, normalize_country_code

ALLOWED_COUNTRIES = frozenset(load_registry().get("canonical_codes", []))
ALLOWED_DIRECTIONS = frozenset({"export", "import"})
ALLOWED_RISK_LEVELS = frozenset({"High", "Medium", "Low"})
INVALID_HS = frozenset({"", "ALL", "00000000", "N/A", "NA", "NONE", "UNKNOWN"})

COUNTRY_ALIASES = {
    "USA": "US",
    "UNITED STATES": "US",
    "EUROPE": "EU",
    "EUROPEAN UNION": "EU",
    "VIETNAM": "ASEAN",
    "MALAYSIA": "ASEAN",
    "JAPAN": "JP",
    "KOREA": "KR",
    "SOUTH KOREA": "KR",
    "GLOBAL": "GLOBAL",
    "CN": "GLOBAL",
    "CHINA": "GLOBAL",
}

HALLUCINATION_PATTERNS = [
    re.compile(r"\bi'?m\s+sorry\b", re.I),
    re.compile(r"\bas\s+an\s+ai\b", re.I),
    re.compile(r"\bi\s+cannot\b", re.I),
    re.compile(r"未找到对应内容"),
    re.compile(r"无法提供"),
    re.compile(r"作为\s*AI"),
    re.compile(r"no\s+relevant\s+content\s+found", re.I),
]


def _normalize_country(value: Any) -> str:
    return normalize_country_code(value)


def _contains_hallucination(text: Any) -> bool:
    body = str(text or "").strip()
    if not body:
        return True
    return any(pattern.search(body) for pattern in HALLUCINATION_PATTERNS)


def _is_valid_hs_code(hs_code: Any) -> bool:
    raw = str(hs_code or "").strip()
    if not raw or raw.upper() in INVALID_HS:
        return False
    normalized = raw.replace(" ", "")
    if re.fullmatch(r"[0-9]{2,10}([.,][0-9]{1,4}){0,3}", normalized):
        return True
    if re.fullmatch(r"[0-9]{2,10}(,[0-9]{2,10})+", normalized):
        return True
    return False


def validate_data_schema(data: Any, kind: str = "risk_signal") -> Tuple[bool, List[str]]:
    """Return (ok, errors)."""
    errors: List[str] = []

    if not isinstance(data, dict):
        return False, ["payload must be a JSON object"]

    if kind != "risk_signal":
        return False, [f"unsupported kind for python guardrail: {kind}"]

    for field in ("hs_code", "direction", "country", "source", "content_en"):
        if field not in data or data.get(field) in (None, ""):
            errors.append(f"missing required field: {field}")

    country = _normalize_country(data.get("country"))
    if country not in ALLOWED_COUNTRIES:
        errors.append(
            f"country must be one of {', '.join(sorted(ALLOWED_COUNTRIES))} (got {data.get('country')!r})"
        )

    direction = str(data.get("direction", "")).strip().lower()
    if direction not in ALLOWED_DIRECTIONS:
        errors.append("direction must be export or import")

    if not _is_valid_hs_code(data.get("hs_code") or data.get("hs_code_keyword")):
        errors.append("hs_code is missing or invalid")

    risk = str(data.get("risk_level", "Medium")).strip()
    normalized_risk = "High" if risk.lower() == "high" else "Low" if risk.lower() == "low" else "Medium"
    if normalized_risk not in ALLOWED_RISK_LEVELS:
        errors.append("risk_level must be High, Medium, or Low")

    content_en = str(data.get("content_en", "")).strip()
    content_zh = str(data.get("content_zh", content_en)).strip()
    if len(content_en) < 10:
        errors.append("content_en is missing or too short")
    if len(content_zh) < 2:
        errors.append("content_zh is missing or too short")
    if _contains_hallucination(content_en) or _contains_hallucination(content_zh):
        errors.append("content contains AI hallucination or empty placeholder text")

    return len(errors) == 0, errors


def partition_signals(signals: List[dict]) -> Tuple[List[dict], List[dict]]:
    passed: List[dict] = []
    intercepted: List[dict] = []
    for signal in signals:
        ok, reasons = validate_data_schema(signal, "risk_signal")
        if ok:
            passed.append(signal)
        else:
            intercepted.append(
                {
                    "kind": "risk_signal",
                    "reasons": reasons,
                    "raw": signal,
                }
            )
    return passed, intercepted
