#!/usr/bin/env python3
"""
Global compliance pipeline — 02:00 multi-country risk signal ingestion.

Scrapes CCPIT/MOFCOM-style alerts + US BIS, structures with DeepSeek (or heuristics),
runs Data Validation Guardrail, auto-publishes passing rows to prod (tags.json),
routes failures to data/pending_data.json via Node auto-publish script.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from structurer import structure_items
from validate_guardrail import partition_signals

ROOT = Path(__file__).resolve().parents[1]
BATCH_PATH = ROOT / "data" / "pending_data" / "pipeline_batch.json"
GUARDRAIL_REPORT_PATH = ROOT / "data" / "pending_data" / "guardrail_report.json"


def main() -> int:
    print("=== CRON JOB START: 凌晨2点全球海关规则数据抓取开始 (global-compliance-pipeline) ===")
    parser = argparse.ArgumentParser(description="Trade Comply global compliance pipeline")
    parser.add_argument("--offline", action="store_true", help="Use fixture scraper output only")
    parser.add_argument("--dry-run", action="store_true", help="Structure + guardrail only; skip Node publish")
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

    passed, intercepted = partition_signals(signals)
    print(f"Guardrail: {len(passed)} passed, {len(intercepted)} intercepted.")

    BATCH_PATH.parent.mkdir(parents=True, exist_ok=True)
    pipeline_run = datetime.now(timezone.utc).isoformat()
    BATCH_PATH.write_text(
        json.dumps({"pipeline_run": pipeline_run, "signals": passed}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {BATCH_PATH.relative_to(ROOT)} ({len(passed)} signal(s) for auto-publish).")

    GUARDRAIL_REPORT_PATH.write_text(
        json.dumps(
            {
                "pipeline_run": pipeline_run,
                "passed_count": len(passed),
                "intercepted_count": len(intercepted),
                "intercepted": intercepted,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    if args.dry_run:
        print("=== CRON JOB SUCCESS: Dry run 完成（未发布） ===")
        return 0

    if not passed and intercepted:
        print("All signals intercepted by guardrail; running Node to record pending_data.json.")
    elif not passed:
        print("=== CRON JOB SUCCESS: 无通过护栏的信号，管道正常结束 ===")
        return 0

    publish_script = ROOT / "scripts" / "auto-publish-pipeline.js"
    result = subprocess.run(["node", str(publish_script)], cwd=str(ROOT), check=False)
    if result.returncode not in (0, 2):
        print("WARN: Node auto-publish script failed; batch file is still available.")
        return result.returncode

    print("=== CRON JOB SUCCESS: 成功洗入最新规则数据 (global-compliance-pipeline) ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
