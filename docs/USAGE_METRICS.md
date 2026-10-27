# Minimal Can I Sell It usage metrics

## Scope

The first-party collector accepts only these events:

- `can_i_sell_entry_click`
- `can_i_sell_check_started`
- `can_i_sell_result_generated`

The payload is limited to the application build, page, single/compare mode, market count, a coarse source class and a test-event flag. Product text, exact tariff codes, supplier details, email addresses, filenames, document contents, full URLs, referrers, IP addresses, cookies and persistent identifiers are not stored.

The request IP is used only in the Function Compute process memory for short-lived abuse throttling. It is not written to OSS or returned by the metrics summary.

## Receiver and retention

The existing Alibaba Function Compute endpoint receives events and writes them to a dedicated OSS prefix. It fails closed with HTTP 503 when OSS is not configured or retention cleanup cannot run. The browser ignores collection failures so compliance results remain available.

Raw anonymous event objects are retained for 30 days by default. Before accepting a new event, the receiver periodically lists the dedicated prefix and deletes objects older than the configured retention period. Set `USAGE_METRICS_RETENTION_DAYS` only to an integer from 1 to 90; set `OSS_USAGE_METRICS_PREFIX` to isolate these objects from feedback records.

The protected `/api/admin/usage-metrics` endpoint returns counts only. It uses the existing admin-route gate and excludes `test_event: true` by default.

## Deployment prerequisites

Do not deploy the browser collector until all of these are verified:

1. The existing FC environment has `OSS_BUCKET`, `OSS_ACCESS_KEY_ID` and `OSS_ACCESS_KEY_SECRET`.
2. Those credentials can list, read, write and delete objects only within the dedicated usage-metrics prefix.
3. `ADMIN_ROUTES_ENABLED=1` and an existing admin secret are configured if summaries are required.
4. A POST with the production Origin receives `202`, while an unapproved Origin is rejected.
5. A test run uses `?tw_test=1`; the default summary excludes it.

No new vendor account, tracking cookie or persistent user identifier is required. Changes to cloud permissions, billing, contracts, privacy terms or consent behavior require separate approval.
