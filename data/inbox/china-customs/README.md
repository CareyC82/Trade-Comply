# China Customs monthly industry imports

This inbox is the preferred input for China Customs monthly data. Put official
XLSX, XLS, CSV, or JSON exports here and run:

```sh
npm run sync:trade-flow:cn
```

Use `manifest.json` when a batch spans multiple files. The manifest should list
every required month, industry, and direction. See
`docs/china-customs-export-manifest.example.json`.

The importer stages incomplete batches in
`data/china-customs-pending-batch.json`. Production data in
`data/china-industry-flow.json` is replaced only after every required
month x industry x direction value is present. Missing official values must
remain blank; do not estimate or copy values from another month.

The official file/workbook path is preferred. `CHINA_CUSTOMS_FLOW_URL` is a
fallback for a stable direct export URL, not for scraping the interactive
query page.
