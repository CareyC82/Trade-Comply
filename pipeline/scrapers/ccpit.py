"""CCPIT / MOFCOM-style fair-trade alert aggregator scraper."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import List

import requests

FIXTURE_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "ccpit_sample.json"

# Public trade remedy notice listings (may change; fixture used on failure)
CCPIT_URLS = [
    "http://www.mofcom.gov.cn/article/b/c/",
    "https://www.ccpit.org/",
]


def _load_fixture() -> List[dict]:
    if FIXTURE_PATH.exists():
        return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return []


def _fetch_html(url: str, timeout: int = 25) -> str:
    headers = {
        "User-Agent": "TradeComplyBot/1.0 (+https://github.com/CareyC82/Trade-Comply)"
    }
    response = requests.get(url, headers=headers, timeout=timeout)
    response.raise_for_status()
    response.encoding = response.apparent_encoding or "utf-8"
    return response.text


def _extract_articles(html: str, source_url: str) -> List[dict]:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "lxml")
    items: List[dict] = []
    for anchor in soup.select("a")[:80]:
        title = (anchor.get_text() or "").strip()
        href = anchor.get("href") or ""
        if len(title) < 12:
            continue
        if not re.search(r"反倾销|反补贴|337|关税|贸易救济|实体清单|出口管制|chip|semiconductor", title, re.I):
            continue
        link = href if href.startswith("http") else source_url.rstrip("/") + "/" + href.lstrip("/")
        items.append(
            {
                "title": title[:240],
                "body": title,
                "source_org": "CCPIT / MOFCOM Fair Trade Alerts",
                "source_url": link,
                "scraper": "ccpit",
            }
        )
        if len(items) >= 8:
            break
    return items


def scrape_ccpit(*, offline: bool = False) -> List[dict]:
    if offline:
        return _load_fixture()

    collected: List[dict] = []
    for url in CCPIT_URLS:
        try:
            html = _fetch_html(url)
            collected.extend(_extract_articles(html, url))
            if collected:
                break
        except Exception:
            continue

    if not collected:
        return _load_fixture()
    return collected
