"""Country registry — aligned with data/country-registry.json and frontend selects."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "data" / "country-registry.json"

_REGISTRY: Dict[str, Any] | None = None


def load_registry() -> Dict[str, Any]:
    global _REGISTRY
    if _REGISTRY is None:
        _REGISTRY = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    return _REGISTRY


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


def build_structurer_system_prompt() -> str:
    reg = load_registry()
    lines = [
        "You are a trade compliance data engineer for a multi-country matrix (China export/import).",
        "Return ONE JSON object with keys: hs_code, direction (export|import),",
        "country (US|EU|ASEAN|RU|TW|JP|KR|GLOBAL only), risk_level (High|Medium|Low),",
        "source, content_en, content_zh. English content_en, Chinese content_zh. No markdown.",
        "",
        "Country codes MUST match frontend option values exactly:",
    ]
    for row in reg.get("export_options", []):
        lines.append(f"- {row['label']} -> {row['value']}")
    for row in reg.get("import_options", []):
        lines.append(f"- {row['label']} -> {row['value']}")
    lines.append("")
    lines.append("Regional review weights (apply when assigning risk_level and content):")
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
    }
