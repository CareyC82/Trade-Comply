# Multi-country panel & global compliance pipeline

## Frontend

- **Counterparty country** dropdown on `index.html` (Electronics + Semiconductor) and `hscode.html`.
- Export options: US, EU, ASEAN, RU, Other.
- Import options: TW, JP, KR, US, Other.
- Deep link: `index.html?search=8542310000&direction=export&country=US`
- Matching country rules are **sorted first** and highlighted (gold border).

## Risk signal schema

See `data/risk-signal.schema.json`. Pending queue items use `kind: "risk_signal"` with payload fields:

| Field | Values |
|-------|--------|
| `hs_code` | HS or keyword |
| `direction` | `export` \| `import` |
| `country` | `US` \| `EU` \| `ASEAN` \| `RU` \| `TW` \| `JP` \| `KR` \| `GLOBAL` \| `OTHER` |
| `risk_level` | `High` \| `Medium` \| `Low` |
| `source` | Official agency name |
| `content_en` / `content_zh` | Descriptions |

On approve, signals merge into `data/tags.json` as enriched tags (backward compatible with search).

## Pipeline (02:00)

Workflow: `.github/workflows/global-compliance-pipeline.yml` (18:05 UTC).

```bash
pip install -r pipeline/requirements.txt
export DEEPSEEK_API_KEY=sk-...   # optional; heuristics used if unset
python3 pipeline/pipeline.py
# offline fixtures:
python3 pipeline/pipeline.py --offline
```

Flow: **CCPIT/MOFCOM alerts** + **US BIS** → structure → guardrail → auto-publish to `data/tags.json`.

Country codes are defined in `data/country-registry.json` (aligned with frontend `<select>` options: US, EU, ASEAN, RU, TW, JP, KR, GLOBAL).

## Local test

```bash
npm run dev:preview          # :8000
ADMIN_REVIEW_PASSWORD=x npm run dev:admin   # :8787
open "http://localhost:8000/index.html?search=8542&direction=export&country=US"
```
