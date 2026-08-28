# China Customs monthly industry imports

This inbox is the preferred input for China Customs monthly data. Put official
XLSX, XLS, CSV, or JSON exports here and run:

```sh
npm run sync:trade-flow:cn
```

Use `manifest.json` when a batch spans multiple files. The manifest should list
every required month, industry, and direction. See
`docs/china-customs-export-manifest.example.json`.

After placing the official files here, validate the batch and generate the
manifest (replace the month with the latest month visibly shown by the official
platform):

```sh
npm run prepare:trade-flow:cn -- --latest=2026-05
```

The command does not estimate missing values. It stops and lists every missing
month, industry, and direction until the official batch is complete.

The importer stages incomplete batches in
`data/china-customs-pending-batch.json`. Production data in
`data/china-industry-flow.json` is replaced only after every required
month x industry x direction value is present. Missing official values must
remain blank; do not estimate or copy values from another month.

The official file/workbook path is preferred. `CHINA_CUSTOMS_FLOW_URL` is a
fallback for a stable direct export URL, not for scraping the interactive
query page.
