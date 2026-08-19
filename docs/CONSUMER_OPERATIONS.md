# Consumer service operations

## Production configuration

Create `.env.production` outside source control. Production startup fails unless both secrets contain at least 32 characters and `CONSUMER_DATA_DIR` is an absolute persistent path.

```dotenv
NODE_ENV=production
CONSUMER_SESSION_SECRET=replace-with-an-independent-random-value
CONSUMER_FILE_ENCRYPTION_KEY=replace-with-a-different-random-value
CONSUMER_DATA_DIR=/var/lib/tracewize-consumer
CONSUMER_HOST=0.0.0.0
CONSUMER_PORT=8790
CONSUMER_PUBLIC_URL=https://consumer.example.com
```

Never rotate the file encryption key without an explicit migration: existing private evidence would become unreadable. Keep the service behind TLS reverse proxying. The Compose port binds to localhost by default.

```bash
docker compose up -d --build
curl --fail http://127.0.0.1:8790/api/consumer/health/live
curl --fail http://127.0.0.1:8790/api/consumer/health/ready
```

`live` confirms the process responds. `ready` additionally requires configured secrets, parsers, consistent storage and disk usage below the warning threshold.

Run the complete production preflight before exposing traffic:

```bash
npm run consumer:preflight
```

It checks production mode, HTTPS public origin, separate secrets, persistent-directory permissions and disk pressure without printing secret values.

## Maintenance

Run these with the same environment and persistent data volume as the service:

```bash
npm run consumer:health
npm run consumer:audit
npm run consumer:repair
npm run consumer:cleanup
npm run consumer:backup
npm run consumer:recovery-drill
npm run consumer:maintain
npm run consumer:fcc-probe
node scripts/manage-consumer-workspace.js restore --confirm-restore
```

`audit` is read-only. `repair` removes inconsistent private file records. `cleanup` enforces evidence retention. `backup` creates an atomic last-good database snapshot. Restore replaces the primary database and therefore requires the explicit flag; take an external volume snapshot first. Back up encrypted blobs together with the database and encryption key.

`recovery-drill` creates an isolated temporary account, assessment and encrypted evidence blob, corrupts only the temporary database, restores it and verifies record/blob integrity. It never opens the configured production directory. `maintain` is the one-shot task intended for a scheduler; it cleans retention, audits storage, refreshes the backup only after a clean audit, reports readiness as JSON and exits non-zero on failure.

An hourly host-cron template is available at [`deploy/consumer-maintenance.cron.example`](../deploy/consumer-maintenance.cron.example). Install it only on the host attached to the persistent volume. Forward non-zero exit status or failed JSON results to the existing infrastructure alerting system; this project does not transmit alerts or private data to a new external provider.

## Logs and alerts

The server emits one-line JSON operational logs without request bodies, emails, cookies, tokens or authorization headers. Alert on readiness HTTP 503, `request_failed` 5xx events, disk pressure, invalid backups, and repeated parser or FCC-service failures.

The FCC ID check is rate-limited, cached in process, and fail-closed. A database match proves only that the ID appears in the official EAS response; confirm that the grant belongs to the exact product, model and radio configuration.

`npm run consumer:fcc-probe` tests the deployment host's real network path. HTTP 403 or any malformed response produces `available: false`, a non-zero exit and the manual-EAS fallback. Do not replace the official source with a third-party database merely to make this probe green.
