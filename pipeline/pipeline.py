#!/usr/bin/env python3
"""
Global compliance pipeline — 02:00 multi-country risk signal ingestion.

Scrapes CCPIT/MOFCOM-style alerts + US BIS, structures with DeepSeek (or heuristics),
writes batch file for Node ingest into pending_data queue.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from structurer import structure_items

ROOT = Path(__file__).resolve().parents[1]
BATCH_PATH = ROOT / "data" / "pending_data" / "pipeline_batch.json"


def main() -> int:
    parser = argparse.ArgumentParser(description="Trade Comply global compliance pipeline")
    parser.add_argument("--offline", action="store_true", help="Use fixture scraper output only")
    args = parser.parse_args()

    if args.offline:
        fixture_ccpit = json.loads((ROOT / "pipeline/fixtures/ccpit_sample.json").read_text(encoding="utf-8"))
        fixture_bis = json.loads((ROOT / "pipeline/fixtures/bis_sample.json").read_text(encoding="utf-8"))
        raw_items = fixture_ccpit + fixture_bis
    else:
        from scrapers.bis import scrape_bis
        from scrapers.ccpit import scrape_ccpit

        raw_items = []
        raw_items.extend(scrape_ccpit(offline=False))
        raw_items.extend(scrape_bis(offline=False))

    if not raw_items:
        print("No raw items scraped.")
        return 0

    print(f"Scraped {len(raw_items)} raw announcement(s).")
    signals = structure_items(raw_items)
    print(f"Structured {len(signals)} risk signal(s).")

    BATCH_PATH.parent.mkdir(parents=True, exist_ok=True)
    BATCH_PATH.write_text(json.dumps({"signals": signals}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {BATCH_PATH.relative_to(ROOT)}")

    ingest = ROOT / "scripts" / "ingest-pipeline-batch.js"
    result = subprocess.run(["node", str(ingest)], cwd=str(ROOT), check=False)
    if result.returncode != 0:
        print("WARN: Node ingest script failed; batch file is still available for manual ingest.")
        return result.returncode

    print("Pipeline completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
