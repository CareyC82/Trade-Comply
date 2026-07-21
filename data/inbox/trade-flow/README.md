# National official monthly trade-flow batches

Place validated national customs or statistics exports here as JSON manifests. The monthly sync accepts a batch only when every declared market, month, industry, and direction is present. An incomplete or invalid batch is rejected and the last-good production rows remain unchanged.

The user-facing dataset is industry-level. Exact HS codes are optional evidence and are not required in each row.

```json
{
  "schema_version": "1.0",
  "complete": true,
  "source": {
    "id": "jp-customs-monthly-industry",
    "name": "Japan Customs monthly trade statistics",
    "source_url": "https://www.customs.go.jp/toukei/info/index_e.htm"
  },
  "expected": {
    "markets": ["JP"],
    "months": ["2026-05"],
    "industry_ids": ["semiconductor_ai"],
    "directions": ["import", "export"]
  },
  "series": [
    {
      "market": "JP",
      "partner": "WORLD",
      "industry_id": "semiconductor_ai",
      "month": "2026-05",
      "imports_value_usd": 0,
      "exports_value_usd": 0
    }
  ]
}
```

Zero is a valid official value. Missing fields are not interpreted as zero.
