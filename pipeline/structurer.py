"""Structure raw scraper items into risk-signal schema using DeepSeek (optional)."""

from __future__ import annotations

import json
import os
import re
import urllib.request
from datetime import datetime, timezone
from typing import List

DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"

COUNTRY_PATTERN = re.compile(r"\b(US|EU|ASEAN|RU|TW|JP|KR|GLOBAL)\b", re.I)


def _heuristic_structure(item: dict) -> dict:
    text = f"{item.get('title', '')} {item.get('body', '')}"
    country = item.get("default_country") or "GLOBAL"
    if re.search(r"欧盟|EU|European", text, re.I):
        country = "EU"
    elif re.search(r"美国|U\.S\.|United States|BIS|Entity List", text, re.I):
        country = "US"
    elif re.search(r"日本|Japan", text, re.I):
        country = "JP"
    elif re.search(r"韩国|Korea", text, re.I):
        country = "KR"
    elif re.search(r"台湾|Taiwan", text, re.I):
        country = "TW"
    elif re.search(r"俄罗斯|Russia", text, re.I):
        country = "RU"
    elif re.search(r"越南|马来西亚|ASEAN|东南亚", text, re.I):
        country = "ASEAN"

    direction = item.get("default_direction") or "export"
    if re.search(r"进口|import into china|对华进口", text, re.I):
        direction = "import"

    hs_match = re.search(r"\b(\d{4}(?:\.\d{2}){0,2})\b", text)
    hs_code = hs_match.group(1) if hs_match else "8542"

    risk_level = "High" if re.search(r"entity list|出口管制|反倾销|制裁|license", text, re.I) else "Medium"
    source = item.get("source_org") or "Trade Compliance Aggregator"
    content_en = text.strip()[:1200]
    content_zh = content_en

    return {
        "hs_code": hs_code,
        "direction": direction,
        "country": country,
        "risk_level": risk_level,
        "source": source,
        "content_en": content_en,
        "content_zh": content_zh,
        "source_url": item.get("source_url"),
        "pipeline_source": item.get("scraper", "pipeline"),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def _deepseek_structure(item: dict, api_key: str) -> dict:
    prompt = {
        "model": "deepseek-chat",
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a trade compliance data engineer. Return ONE JSON object with keys: "
                    "hs_code, direction (export|import), country (US|EU|ASEAN|RU|TW|JP|KR|GLOBAL|OTHER), "
                    "risk_level (High|Medium|Low), source, content_en, content_zh. English content_en, "
                    "Chinese content_zh. No markdown."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "title": item.get("title"),
                        "body": item.get("body"),
                        "source_org": item.get("source_org"),
                        "default_country": item.get("default_country"),
                        "default_direction": item.get("default_direction"),
                    },
                    ensure_ascii=False,
                ),
            },
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }

    request = urllib.request.Request(
        DEEPSEEK_URL,
        data=json.dumps(prompt).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=90) as response:
        payload = json.loads(response.read().decode("utf-8"))

    content = payload["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    parsed.setdefault("source", item.get("source_org"))
    parsed.setdefault("source_url", item.get("source_url"))
    parsed.setdefault("pipeline_source", item.get("scraper", "pipeline"))
    parsed["fetched_at"] = datetime.now(timezone.utc).isoformat()
    return parsed


def structure_items(raw_items: List[dict]) -> List[dict]:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    structured: List[dict] = []

    for item in raw_items:
        try:
            if api_key:
                signal = _deepseek_structure(item, api_key)
            else:
                signal = _heuristic_structure(item)
            structured.append(signal)
        except Exception:
            structured.append(_heuristic_structure(item))

    return structured
