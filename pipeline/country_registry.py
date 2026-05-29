"""Country registry — aligned with data/country-registry.json and frontend selects."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "data" / "country-registry.json"
CHECKLIST_BASELINES_PATH = ROOT / "data" / "country-checklist-baselines.json"

_REGISTRY: Dict[str, Any] | None = None
_CHECKLIST_BASELINES: Dict[str, Any] | None = None

CHECKLIST_PHASES = ("技术核查", "环保注册", "单证准备", "其他")


def load_registry() -> Dict[str, Any]:
    global _REGISTRY
    if _REGISTRY is None:
        _REGISTRY = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    return _REGISTRY


def load_checklist_baselines() -> Dict[str, Any]:
    global _CHECKLIST_BASELINES
    if _CHECKLIST_BASELINES is None:
        payload = json.loads(CHECKLIST_BASELINES_PATH.read_text(encoding="utf-8"))
        _CHECKLIST_BASELINES = payload.get("baselines", {})
    return _CHECKLIST_BASELINES


def normalize_country_code(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return "GLOBAL"

    reg = load_registry()
    if raw in reg.get("label_to_code", {}):
        return reg["label_to_code"][raw]

    upper = raw.upper()
    codes = reg.get("canonical_codes", [])
    if upper in codes:
        return upper

    aliases = reg.get("aliases", {})
    if upper in aliases:
        return aliases[upper]
    if raw in aliases:
        return aliases[raw]

    return "GLOBAL"


def get_compliance_focus(country: str, direction: str = "export") -> str:
    code = normalize_country_code(country)
    reg = load_registry()
    focus = reg.get("compliance_focus", {}).get(code) or reg.get("compliance_focus", {}).get("GLOBAL", {})
    return focus.get(direction) or focus.get("export") or focus.get("import") or ""


def get_market_theme(country: str) -> str:
    code = normalize_country_code(country)
    reg = load_registry()
    themes = reg.get("market_themes", {})
    return themes.get(code) or themes.get("GLOBAL") or ""


def get_baseline_checklist(country: str, direction: str = "export") -> List[dict]:
    code = normalize_country_code(country)
    baselines = load_checklist_baselines()
    bucket = baselines.get(code) or baselines.get("GLOBAL") or {}
    items = bucket.get(direction) or bucket.get("export") or []
    cleaned: List[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        task = str(item.get("task") or "").strip()
        if not task:
            continue
        phase = str(item.get("phase") or "其他").strip()
        if phase not in CHECKLIST_PHASES:
            phase = "技术核查" if "核查" in phase or "认证" in phase else "单证准备"
        cleaned.append({
            "phase": phase,
            "task": task,
            "desc": str(item.get("desc") or "").strip(),
        })
    return cleaned[:6]


def build_structurer_system_prompt() -> str:
    reg = load_registry()
    lines = [
        "You are a trade compliance data engineer for a multi-country matrix (China export/import).",
        "Return ONE JSON object with keys:",
        "hs_code, direction (export|import), country (US|EU|ASEAN|RU|TW|JP|KR|GLOBAL only),",
        "risk_level (High|Medium|Low), source, content_en, content_zh,",
        "checklist (array of 3-8 action items).",
        "English content_en, Chinese content_zh. No markdown.",
        "",
        "Country codes MUST match frontend dropdown labels exactly:",
    ]
    for row in reg.get("export_options", []):
        lines.append(f'- "{row["label"]}" -> {row["value"]}')
    for row in reg.get("import_options", []):
        lines.append(f'- "{row["label"]}" -> {row["value"]}')
    lines.append('- "Other" -> GLOBAL')
    lines.append("")
    lines.append("Each checklist item MUST be: {\"phase\": \"技术核查|环保注册|单证准备\", \"task\": \"short title\", \"desc\": \"action guide\"}.")
    lines.append("Tailor checklist tasks to the announcement and the assigned country market themes below.")
    lines.append("")
    lines.append("Market themes (use when writing checklist + risk content):")
    themes = reg.get("market_themes", {})
    for code in ("US", "EU", "ASEAN", "RU", "TW", "JP", "KR", "GLOBAL"):
        if themes.get(code):
            lines.append(f"- {code}: {themes[code]}")
    lines.append("")
    lines.append("Regional review weights:")
    for code in ("RU", "TW", "ASEAN", "US", "EU", "JP", "KR"):
        focus = reg.get("compliance_focus", {}).get(code, {})
        if focus.get("export"):
            lines.append(f"- {code} export: {focus['export']}")
        if focus.get("import"):
            lines.append(f"- {code} import: {focus['import']}")
    return "\n".join(lines)


def build_user_context(item: dict) -> dict:
    country = normalize_country_code(item.get("default_country") or item.get("country") or "GLOBAL")
    direction = "import" if item.get("default_direction") == "import" else "export"
    return {
        "title": item.get("title"),
        "body": item.get("body"),
        "source_org": item.get("source_org"),
        "default_country": country,
        "default_direction": direction,
        "compliance_focus": get_compliance_focus(country, direction),
        "market_theme": get_market_theme(country),
        "baseline_checklist": get_baseline_checklist(country, direction),
    }


def normalize_checklist_payload(raw: Any) -> List[dict]:
    if not isinstance(raw, list):
        return []
    cleaned: List[dict] = []
    seen = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        task = str(item.get("task") or "").strip()
        if not task:
            continue
        phase = str(item.get("phase") or "其他").strip()
        key = f"{phase}::{task}"
        if key in seen:
            continue
        seen.add(key)
        cleaned.append({
            "phase": phase,
            "task": task,
            "desc": str(item.get("desc") or "").strip(),
        })
    return cleaned[:12]
