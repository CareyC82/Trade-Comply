# Trade Comply

Import/export compliance pre-checks for electronics and semiconductors. Current coverage starts with China.

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

### Local dual services

| Service | Command | URL | Purpose |
|---------|---------|-----|---------|
| **Site preview (Pages)** | `npm run dev:preview` or `python3 -m http.server 8000` | http://localhost:8000 | User-facing `index.html`, loads **production** JSON |
| **Review admin API** | `ADMIN_REVIEW_PASSWORD='secret' npm run dev:admin` | http://127.0.0.1:8787/admin.html | Human review of **pending** queue |

Environment variables:

| Variable | Where | Purpose |
|----------|-------|---------|
| `ADMIN_REVIEW_PASSWORD` | Local admin server | Bearer token for `/api/review/*` |
| `ADMIN_REVIEW_PORT` | Optional (default `8787`) | Admin listen port |
| `DEEPSEEK_API_KEY` | FC / policy tracker CI | AI parsing & HS classify |
| `GITHUB_TOKEN` | CI + optional local publish | Issues, `repository_dispatch`, git push |
| `AUTO_PUBLISH_SYNC=1` | Optional on admin server | Auto git push after each Approve |
| `PUBLISH_DISPATCH=1` | With publish | Trigger `sync-prod-deploy` → redeploy FC |

Alibaba FC (production API) secrets are configured in GitHub Actions (`deploy-fc.yml`), not in the static site.

### Standard review iron law

1. **`git pull origin main`** — sync remote `pending_data` written by the 02:00 policy tracker.
2. **Review locally** — http://127.0.0.1:8787/admin.html → Approve / Reject each item.
3. **Publish in one shot** — after all approvals, push **all three paths together** (never partial):

```bash
npm run build:catalog    # if not already rebuilt by approve
npm run publish:reviewed -- --dispatch
```

This commits and pushes:

- `data/tags.json` (and `data/cases.json` if changed)
- `data/catalog.json`
- `data/pending_data/queue.json`

Commit messages must include **`[admin-publish]`** for production data changes (CI guardrail).

4. **GitHub Pages** updates from the push automatically. **`--dispatch`** triggers [Sync Prod Deploy](.github/workflows/sync-prod-deploy.yml) to redeploy FC with the same JSON.

### Automation boundaries (CI guardrail)

- **Policy tracker (bot)** may only write `data/pending_data/queue.json` and `data/inbox/*`.
- **Production files** (`data/tags.json`, `data/cases.json`, `data/catalog.json`) must not be modified by automation; only human/admin commits with `[admin-publish]`.
- When staging adds items, an Issue is opened: `🚨 [Action Required] Daily Regulatory Update Pending Review - YYYY-MM-DD`.

See [docs/DATA_REVIEW.md](docs/DATA_REVIEW.md) and [docs/ENGINEERING.md](docs/ENGINEERING.md).

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
