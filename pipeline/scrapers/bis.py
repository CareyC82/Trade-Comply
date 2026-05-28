"""US BIS export control announcements scraper."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import List

import requests

FIXTURE_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "bis_sample.json"
BIS_NEWS_URL = "https://www.bis.gov/news-updates"
ENTITY_LIST_HINT = re.compile(r"entity list|added to the entity list|export control|semiconductor|advanced computing", re.I)


def _load_fixture() -> List[dict]:
    if FIXTURE_PATH.exists():
        return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return []


def scrape_bis(*, offline: bool = False) -> List[dict]:
    if offline:
        return _load_fixture()

    headers = {
        "User-Agent": "TradeComplyBot/1.0 (+https://github.com/CareyC82/Trade-Comply)"
    }

    try:
        from bs4 import BeautifulSoup

        response = requests.get(BIS_NEWS_URL, headers=headers, timeout=30)
        response.raise_for_status()
        response.encoding = response.apparent_encoding or "utf-8"
        soup = BeautifulSoup(response.text, "lxml")
        items: List[dict] = []

        for anchor in soup.select("a")[:120]:
            title = (anchor.get_text() or "").strip()
            href = anchor.get("href") or ""
            if len(title) < 16 or not ENTITY_LIST_HINT.search(title):
                continue
            link = href if href.startswith("http") else f"https://www.bis.gov{href}"
            items.append(
                {
                    "title": title[:240],
                    "body": title,
                    "source_org": "US BIS",
                    "source_url": link,
                    "scraper": "bis",
                    "default_country": "US",
                    "default_direction": "export",
                }
            )
            if len(items) >= 6:
                break

        if items:
            return items
    except Exception:
        pass

    return _load_fixture()
