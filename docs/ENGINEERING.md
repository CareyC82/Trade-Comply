# Engineering guardrails

## Workflows

| Workflow | Trigger | Role |
|----------|---------|------|
| [policy-tracker.yml](../.github/workflows/policy-tracker.yml) | Daily 02:00 CST | Stage AI results → `pending_data` only; open review Issue |
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
