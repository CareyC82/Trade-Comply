# Trade Comply

Global import/export compliance pre-checks for electronics and semiconductor supply chains.

This is a free, front-end-first pre-screening tool for companies that ship, source, import, export, or support cross-border trade in electronics, semiconductors, wireless devices, batteries, UAV-related products, and advanced manufacturing items.

The product is intentionally narrower than a full trade compliance platform, but the brand is not limited to one country or one trade direction. Current data coverage focuses on China import/export rules because that is the first market being built out.

The core question is:

> Before a product moves across a border, what compliance signals should a business check first?

It cites official regulatory sources where available and is designed for preliminary screening only. It does not provide legal advice.

---

## What It Does

Enter a product name, HS Code, or risk feature such as `drone`, `Bluetooth`, `lithium battery`, `AI chip`, or `8525.89`. The app returns relevant compliance signals grouped by category.

Current China-focused coverage includes:

- **Dual-Use Controls** - Export control signals for sensitive items, UAVs, chips, and advanced manufacturing.
- **Semiconductors** - Chips, equipment, foundry services, advanced packaging, and supply chain risk.
- **Wireless Devices** - SRRC and radio transmission equipment approval signals.
- **Encryption** - Commercial encryption import/export control signals.
- **Battery Safety** - Lithium battery and dangerous goods transport references.
- **CCC / Product Rules** - Product certification signals for electronics and consumer goods.
- **Customs / VAT** - Export VAT rebate, customs documentation, and import/export references.
- **Penalty Cases** - Related enforcement cases for risk awareness.

Each result is intended to point users toward the official source or next check, not to replace professional review.

---

## Target Users

- Overseas buyers sourcing electronics or semiconductor-related products.
- China-based exporters and importers that do not have a dedicated compliance team.
- Freight forwarders, customs brokers, and cross-border service providers.
- Compliance consultants, lawyers, and advisors who need a fast first-pass research tool.

---

## Product Direction

The project is being narrowed from a broad trade compliance lookup site into a focused import/export compliance pre-check product for electronics and semiconductors.

Near-term priorities:

1. Make the positioning explicit while keeping the brand expandable beyond China.
2. Add a structured pre-screening questionnaire for sensitive product attributes.
3. Strengthen semiconductor and advanced manufacturing coverage.
4. Add a downloadable pre-check report.
5. Track unmet searches and use them to expand the database.
6. Add future country modules without renaming the core product.

---

## Features

- Product name and HS Code search.
- Export/import direction toggle.
- **Multi-country counterparty panel** (US / EU / ASEAN / RU / TW / JP / KR) with deep-link from HS classifier.
- **Global compliance crawler** (MOFCOM, GAC, BIS, CBP, EUR-Lex) → DeepSeek `refineWithAI` → hash-gated `tags.json` (see [Data Review SOP](docs/DATA_REVIEW.md)).
- Electronics and semiconductor category indexes.
- Official-source compliance cards.
- Penalty case library.
- Knowledge base for key China trade regulations.
- Incoterm decision tree and customs value calculator as supporting tools.
- Mobile-first interface.
- Embedded disclaimer on risk-screening limits.

---

## Quick Start

Run locally:

```bash
git clone https://github.com/CareyC82/Trade-Comply.git
cd Trade-Comply
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000
```

---

## Developer Workflow & Data Review SOP

Full operator guide (中文 + diagrams): **[docs/DATA_REVIEW.md](docs/DATA_REVIEW.md)** · shortcut: [DATA_REVIEW.md](DATA_REVIEW.md)

### Two layers (no conflict)

| Layer | Who runs it | What happens |
|-------|-------------|--------------|
| **Automated (Cron)** | GitHub Actions ~02:00 CST | Global crawl + `refineWithAI` → hash-gated writes to a **staging workspace** (CI copy of `tags.json` / manifest). Bot may auto-push with `[auto-publish]` after catalog build. Legacy parser rows go to **`data/pending_data/queue.json`**. |
| **Manual Review Panel** | Administrator on `admin.html` | **Test crawl** locally, **Approve/Reject** queue items, then **Push to GitHub** after catalog validation. |

### Local services

| Service | Command | URL | Purpose |
|---------|---------|-----|---------|
| **Site preview** | `npm run dev:preview` or `python3 -m http.server 8000` | http://localhost:8000 | Static site; reads committed prod JSON |

China Customs monthly industry data can be imported directly from official `.xlsx`, `.xls`, `.csv`, or `.json` exports. See [China Customs monthly industry import](docs/china-customs-monthly-import.md) for supported Chinese headers, file naming, and validation rules.
| **Review admin API** | `npm run restart:admin` | http://127.0.0.1:8787/admin.html | Manual Review Panel (not the public site port) |

Create **`.env.local`** from `.env.example` (`ADMIN_REVIEW_PASSWORD`, `DEEPSEEK_API_KEY`).

| Variable | Purpose |
|----------|---------|
| `ADMIN_REVIEW_PASSWORD` | Bearer token for `/api/review/*` and `/api/test-crawl` |
| `DEEPSEEK_API_KEY` | Global crawler AI refiner (local test + Cron) |
| `GITHUB_TOKEN` | Push + optional `repository_dispatch` for FC sync |
| `AUTO_PUBLISH_SYNC=1` | Optional: auto git push after each queue Approve |

### 1) Cron — automated crawl & AI refine (staging)

Workflows (see [policy-tracker.yml](.github/workflows/policy-tracker.yml)):

1. **`GLOBAL_CRAWL_SOURCES`** — fetch official MOFCOM / GAC / BIS / CBP / EUR-Lex pages.
2. **`refineWithAI()`** — English-only regulatory JSON; non-relevant noise skipped.
3. **Hash-gated upsert** — catalog-valid `tag_id` values (`CL-GLPOL-*`) into `data/tags.json` on the runner.
4. **`npm run build:catalog`** (via pipeline) — validate `tag_id` / `case_id` patterns.
5. **Optional bot push** — commit `[auto-publish]` to `main` when CI succeeds.

Parallel: [global-compliance-pipeline.yml](.github/workflows/global-compliance-pipeline.yml) ingests Python risk signals; guardrail failures land in `data/pending_data.json`.

Local dry-run (no git push):

```bash
npm run fetch:global:pipeline   # same engine as Cron
```

### 2) Manual Review Panel — administrator workflow

Open http://127.0.0.1:8787/admin.html (API base `http://127.0.0.1:8787`).

| Action | Effect |
|--------|--------|
| **立即测试抓取** (`/api/test-crawl?persist=1`) | Runs the **same** global crawler on your machine; updates **local** `data/tags.json` only. Terminal shows `[GLOBAL-CRAWL]` logs; response includes `{ changed, errors }`. Does **not** push to GitHub. |
| **Approve / Reject** | Processes **`data/pending_data/queue.json`** (legacy / parser staging). Approve merges into local prod JSON. |
| **推送到 GitHub** | Calls publish-sync → **`build-catalog.js --check`** (full catalog validation) → then commits and pushes prod paths with **`[admin-publish]`**. |

CLI equivalent after local review:

```bash
npm run build:catalog
npm run publish:reviewed -- --dispatch
```

**Must push together** (never partial):

- `data/tags.json`
- `data/cases.json` (if changed)
- `data/catalog.json`
- `data/pending_data/queue.json`

`--dispatch` triggers [sync-prod-deploy.yml](.github/workflows/sync-prod-deploy.yml) so GitHub Pages and Alibaba FC use the same JSON.

### Recommended daily flow

1. **`git pull origin main`** — pick up overnight `[auto-publish]` Cron commits.
2. Optionally **立即测试抓取** to verify sources after URL or config changes.
3. **Approve** any rows still in `pending_data/queue.json`.
4. When ready for users to see changes: **推送到 GitHub** or `npm run publish:reviewed -- --dispatch`.

### CI guardrails

- Bot prod writes require **`[auto-publish]`** in the commit message (Cron).
- Human prod writes require **`[admin-publish]`** (panel or CLI).
- Invalid `tag_id` formats (e.g. legacy `CL-GLOBAL-CN-SEMI-EXP`) fail `build-catalog.js` until migrated to `CL-GLPOL-*`.

See [docs/ENGINEERING.md](docs/ENGINEERING.md).

### Tests

```bash
npm test
```

---

## Data Files

- `data/tags.json` - Compliance tags and rule mappings.
- `data/cases.json` - Penalty and enforcement case references.
- `data/categories.json` - Product category index.
- `data/quick-actions.json` - Quick search entry points.
- `data/knowledge-base.json` - Structured regulation directory.
- `data/incoterms.json` - Incoterms decision tree and calculator data.
- `data/updates.json` - Recent update feed.

---

## Disclaimer

This tool provides preliminary import/export compliance screening based on structured data and cited sources. It is not legal advice, customs advice, or a substitute for review by qualified professionals.
