# Production data (`prod_data`)

These files are what **index.html** loads for end users (live compliance search).

| Role | Path |
|------|------|
| Policy tags (rules) | [`../tags.json`](../tags.json) |
| Enforcement cases / HS risk signals | [`../cases.json`](../cases.json) |
| Built search catalog | [`../catalog.json`](../catalog.json) |

Paths stay at `data/*.json` so GitHub Pages and existing `fetch('data/tags.json')` calls keep working.

**Staging** for the 02:00 AI pipeline lives in [`../pending_data/queue.json`](../pending_data/queue.json).  
Review and publish via [`admin.html`](../../admin.html) (see [`docs/DATA_REVIEW.md`](../../docs/DATA_REVIEW.md)).
