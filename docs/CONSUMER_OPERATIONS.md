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
```

Never rotate the file encryption key without an explicit migration: existing private evidence would become unreadable. Keep the service behind TLS reverse proxying. The Compose port binds to localhost by default.

```bash
docker compose up -d --build
curl --fail http://127.0.0.1:8790/api/consumer/health/live
curl --fail http://127.0.0.1:8790/api/consumer/health/ready
```

`live` confirms the process responds. `ready` additionally requires configured secrets, parsers, consistent storage and disk usage below the warning threshold.

## Maintenance

Run these with the same environment and persistent data volume as the service:

```bash
npm run consumer:health
npm run consumer:audit
npm run consumer:repair
npm run consumer:cleanup
npm run consumer:backup
node scripts/manage-consumer-workspace.js restore --confirm-restore
```

`audit` is read-only. `repair` removes inconsistent private file records. `cleanup` enforces evidence retention. `backup` creates an atomic last-good database snapshot. Restore replaces the primary database and therefore requires the explicit flag; take an external volume snapshot first. Back up encrypted blobs together with the database and encryption key.

## Logs and alerts

The server emits one-line JSON operational logs without request bodies, emails, cookies, tokens or authorization headers. Alert on readiness HTTP 503, `request_failed` 5xx events, disk pressure, invalid backups, and repeated parser or FCC-service failures.

The FCC ID check is rate-limited, cached in process, and fail-closed. A database match proves only that the ID appears in the official EAS response; confirm that the grant belongs to the exact product, model and radio configuration.
