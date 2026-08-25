# Engineering guardrails

## Workflows

| Workflow | Trigger | Role |
|----------|---------|------|
| [policy-tracker.yml](../.github/workflows/policy-tracker.yml) | Daily 02:00 CST | Auto-publish validated tags; guardrail Issue on failures |
| [global-compliance-pipeline.yml](../.github/workflows/global-compliance-pipeline.yml) | Daily 02:00 CST | Scrape + structure + auto-publish risk signals |
| [ci-guardrail.yml](../.github/workflows/ci-guardrail.yml) | Push / PR to `main` | Block bot prod writes; validate queue; unit tests |
| [catalog.yml](../.github/workflows/catalog.yml) | Push / PR | Catalog schema + artifact freshness |
| [deploy-fc.yml](../.github/workflows/deploy-fc.yml) | Push to FC paths / manual | Deploy Alibaba FC with bundled `data/*.json` |
| [sync-prod-deploy.yml](../.github/workflows/sync-prod-deploy.yml) | `repository_dispatch: prod-data-published` | Validate prod data; trigger FC redeploy |

## Production vs staging paths

| Zone | Paths |
|------|-------|
| **Staging** | `data/pending_data/queue.json`, `data/inbox/*` |
| **Production** | `data/tags.json`, `data/cases.json`, `data/catalog.json` |

## Publish scripts

```bash
node scripts/publish-reviewed-data.js           # git push three paths
node scripts/publish-reviewed-data.js --dispatch # + repository_dispatch
```

## Admin auto-sync (optional)

```bash
export AUTO_PUBLISH_SYNC=1
export PUBLISH_DISPATCH=1
export GITHUB_TOKEN=ghp_...
ADMIN_REVIEW_PASSWORD=secret node scripts/admin-server.js
```

Each Approve will attempt `git push` + dispatch. Most operators prefer manual `npm run publish:reviewed` after reviewing all items.

## Japan and Singapore national trade-flow feeds

The monthly trade-flow job accepts official commodity-level JSON feeds directly:

- `JP_OFFICIAL_COMMODITY_FLOW_URL` — Japan Customs commodity-by-country rows.
- `SG_OFFICIAL_COMMODITY_FLOW_URL` — SingStat T010001 AHTN commodity-by-market rows.

The response must declare `complete: true` and contain `rows`. Each row needs a commodity code
(`hs_code`, `statistical_code`, or `ahtn_code`), partner, month, flow (`import`/`export`), and value.
Use `value_usd`, or provide `value_local` together with `local_currency_per_usd` (globally, per row,
or in `exchange_rates[YYYY-MM]`). `value_scale` supports official tables expressed in thousands.

The adapter maps maintained 6-digit HS codes into the nine product industries. A candidate snapshot
is published only when both directions, every configured partner, every configured industry, and
the latest official month pass the complete-batch gate. Failed or partial snapshots never replace
the previous accepted national series.

## Filing-grade exact tariff feeds

The daily duty-rate workflow downloads and parses the latest official EU TARIC
`Duties Import 01-99.xlsx` workbook directly from the European Commission CIRCABC database.
It also queries the public China Customs tariff service directly for every maintained
China HS prefix and requires complete pagination before publishing. Normalized official
Singapore lines are extracted from the official STCCED PDF and published as non-dutiable
only when the separate Singapore Customs dutiable-goods page confirms all four dutiable
classes. Mexico lines are downloaded from the official SNICE `Fracciones Arancelarias`
workbook: 8-digit TIGIE import rates are joined to the workbook's 2-digit NICO rows and
published as filing-grade 10-digit codes.

Malaysia uses a local, operator-supplied official artifact because the public JKDM pages do not
currently expose a reliable complete download to the automated crawler. Supply an XLSX, CSV, or
full HTML table together with a JSON manifest, then run:

```bash
npm run import:duty-rates:my:dry-run -- --file /path/to/tariff.xlsx --manifest /path/to/manifest.json
npm run import:duty-rates:my -- --file /path/to/tariff.xlsx --manifest /path/to/manifest.json
```

The manifest requires `authority: "Royal Malaysian Customs Department"`,
`coverage_scope: "full_tariff"`, `source_url` on an HTTPS `customs.gov.my` host, `published_at`,
`effective_at`, `complete: true`, the exact `expected_rows`, and the artifact `sha256`. Publication
requires every row to carry an explicit rate and an exact 10-digit AHTN code, with no conflicting
rates for the same code. Any failure updates only the Admin import status and preserves the prior
last-good duty data. SST, preferences, exemptions, and SIRIM/MCMC/ST approvals remain separate.

The remaining P2 markets use the same guarded artifact workflow:

```bash
npm run import:duty-rates:p2:dry-run -- --country=IN --file /path/to/tariff.xlsx --manifest /path/to/manifest.json
npm run import:duty-rates:p2 -- --country=IN --file /path/to/tariff.xlsx --manifest /path/to/manifest.json
```

Use `KR`, `VN`, or `TW` for the other markets. Exact national code lengths are enforced: India and
Vietnam 8 digits, Korea 10 digits, and Taiwan 11 digits. India additionally requires explicit BCD,
SWS, and IGST fields; only BCD becomes the base-duty override. The manifest must identify the market
and official authority, use the configured government HTTPS domain, declare `coverage_scope` as
`full_tariff`, and provide complete/hash/row-count/publication/effective-date evidence. VAT/GST,
preferences, exemptions, and product approvals remain separate layers in every market.

Each response must declare `complete: true`, identify an official HTTPS source, and provide 8- or
10-digit rows with a base-duty field and optional effective dates. Heading-only rows, conflicting
rates, invalid dates, and incomplete snapshots are rejected. Exact overrides apply only when the
entered national tariff code matches the official line; broad HS prefixes remain pre-screening
signals. VAT/GST, preferences, trade remedies, licensing, and product controls stay separate.

## Weekly unmet-search expansion loop

Searches with zero matched rules or only one weak rule are recorded as `search_gap` events through
the existing feedback endpoint. The browser deduplicates identical route/query gaps per session.
`unmet-search-weekly.yml` summarizes the last seven days from OSS and updates
`data/unmet-search-backlog.json`. Its scheduled trigger is currently paused while OSS is not
enabled; the workflow remains available for manual runs and the weekly schedule should be restored
after persistent feedback storage is configured.
The workflow accepts either dedicated `OSS_ACCESS_KEY_*` secrets or the deployment
`ALIBABA_CLOUD_ACCESS_KEY_*` aliases, and fails at an explicit configuration preflight
when the bucket or credentials are missing. `?health=feedback` reports only whether
feedback persistence is configured (`oss` versus log fallback), never secret values.

No-match searches receive a higher priority weight than weak matches. The generated queue preserves
manual review status and lists the required research sequence: product attributes, official HS
mapping, keyword/HS enrichment, and official-source verification before a rule is published.
