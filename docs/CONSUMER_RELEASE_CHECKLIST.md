# Can I Sell It? — Technical Release Checklist

This checklist covers product code and operational reliability only. Marketing and user-acquisition work is outside this repository workflow.

## Automated release gate

Run before every consumer release:

```bash
npm run check:consumer-release
npm test
git diff --check
```

The gate verifies maintained-product count, official-source metadata and review age, US/EU/JP/SG rule separation, unsupported-product safe exits, mobile result layout, private-workspace fallback, local review-request behavior, supplier-request downloads, and client evidence-upload limits.

## Product regression

- The automated suite contains at least 30 realistic descriptions covering maintained consumer-electronics aliases.
- Explicit negative facts such as `wired`, `no wireless`, and `no battery` must not create FCC, RED, radio, or UN38.3 requirements.
- Wireless, lithium-battery, mains-powered, camera/microphone, child-directed, and medical-claim facts must activate only the applicable gates.
- Unsupported products must return `Not enough information` and must not receive a definitive sellability conclusion.

## Supplier evidence

- Accept only PDF, PNG, JPEG, and WebP files whose signature matches the declared type.
- Limit each browser submission to 5 files and 10 MB per file; retain no more than 20 active files per account.
- Reject active PDF content and malformed Base64 before storage.
- Keep files encrypted at rest, scoped to the signed-in user, and delete them at retention expiry or account deletion.
- Parsing success is not document verification. Exact model, document kind, market applicability, holder, required fields, and dates remain separate checks.
- Model mismatch, expired evidence, wrong-market evidence, unreadable files, parser failure, and parser unavailability must all fail closed.

## Manual browser verification

Test at desktop width and at 390 px mobile width:

1. Submit a supported Bluetooth-and-battery product and confirm a preliminary result appears before supplier evidence is requested.
2. Change Amazon to TikTok Shop and confirm channel-specific language changes without changing the legal market-access rules.
3. Submit an unsupported product and confirm the coverage limitation and manual review request are visible.
4. Select more than 5 files, an unsupported type, and a file larger than 10 MB; confirm submission is stopped with an actionable message.
5. Simulate an unavailable private server; confirm the public assessment remains usable and no upload is implied.
6. Confirm all result cards, evidence messages, and review buttons fit without horizontal scrolling and are usable by touch.

## Production prerequisites

- Set independent `CONSUMER_SESSION_SECRET` and `CONSUMER_FILE_ENCRYPTION_KEY` values.
- Configure the server-only `OPENAI_API_KEY` only if the optional assistant is enabled.
- Install and health-check `pdftotext` and `tesseract`; a missing parser must never approve a document.
- Confirm the configured retention period and filesystem backup policy match the published privacy notice.
- Review official sources before their release-gate freshness deadline.
