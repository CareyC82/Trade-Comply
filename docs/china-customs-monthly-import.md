# China Customs monthly industry import

TraceWize accepts normalized official China Customs exports from three sources, in this order:

1. `CHINA_CUSTOMS_FLOW_FILE` or `--input=<file-or-directory>`
2. `CHINA_CUSTOMS_FLOW_URL`
3. CSV/JSON files placed in `data/inbox/china-customs/`

The official statistics portal remains the authority. This adapter does not estimate or invent missing values.

## Required columns

```csv
month,industry,imports_value_usd,exports_value_usd,partner,scope_label,official_platform_latest_period
2026-05,semiconductors,1000000,2000000,WORLD,Integrated circuits and semiconductor devices,2026-05
```

`month` and `industry` are required. At least one USD value column is required. RMB exports must be converted using a separately verified conversion before import.

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
