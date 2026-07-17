# China Customs monthly industry import

TraceWize accepts official China Customs exports from three sources, in this order:

1. `CHINA_CUSTOMS_FLOW_FILE` or `--input=<file-or-directory>`
2. `CHINA_CUSTOMS_FLOW_URL`
3. Excel/CSV/JSON files placed in `data/inbox/china-customs/`

The official statistics portal remains the authority. This adapter does not estimate, invent, or silently convert missing values.

## Direct Excel import

Files exported from the China Customs statistics platform can be placed directly in `data/inbox/china-customs/` as `.xlsx` or legacy `.xls` files. TraceWize:

- scans the first 30 rows for the real header, so report titles above the table are allowed;
- recognizes common Chinese month, industry, direction, partner, and USD-value headers;
- accepts one row containing both import and export values, or separate import/export rows and files;
- preserves the last verified value when a new file updates only one trade direction;
- rejects RMB-only workbooks rather than applying an unverified exchange rate.

Example wide table:

| 统计月份 | 行业 | 进口金额（美元） | 出口金额（美元） | 贸易伙伴 | 平台最新月份 |
| --- | --- | ---: | ---: | --- | --- |
| 2026年5月 | 存储器 | 1000000 | 2000000 | 世界 | 2026-05 |

Example long table:

| 统计年月 | 行业类别 | 进出口类型 | 金额（美元） | 贸易伙伴 | 平台最新月份 |
| --- | --- | --- | ---: | --- | --- |
| 2026-05 | 存储器 | 进口 | 1000000 | 世界 | 2026-05 |
| 2026-05 | 存储器 | 出口 | 2000000 | 世界 | 2026-05 |

If an export omits month, industry, or direction columns, use a descriptive filename such as `2026-05_memory_import.xlsx`. The file must still contain an explicit USD value column such as `金额（美元）`.

## Normalized CSV columns

```csv
month,industry,imports_value_usd,exports_value_usd,partner,scope_label,official_platform_latest_period
2026-05,semiconductors,1000000,2000000,WORLD,Integrated circuits and semiconductor devices,2026-05
```

`month` and `industry` are required unless they can be safely inferred from the filename. At least one explicit USD value column is required. RMB exports must be converted using a separately verified conversion before import.

## Run locally

Import one official export:

```bash
node scripts/import-china-customs-flow.js ~/Downloads/2026-05_memory_import.xlsx
```

Process every supported file in the inbox:

```bash
npm run sync:trade-flow:cn
```

Supported inbox formats are `.xlsx`, `.xls`, `.csv`, and `.json`.

## Maintained industries

- Semiconductors & AI hardware
- Memory components
- Computers & data processing
- Telecom & connected devices
- Batteries & energy storage
- Solar & photovoltaic
- Industrial automation
- Healthcare & laboratory equipment
- Gaming & interactive electronics

Each target month requires both imports and exports for all nine industries. The generated `data/china-customs-sync-plan.json` lists every missing direction.
