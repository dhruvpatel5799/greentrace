# Carbon Auditor

## Purpose

The Carbon Auditor module handles procurement CSV uploads for GreenTrace's supply-chain carbon accounting flow. It validates uploaded files, normalizes vendor line items, and persists the parsed procurement records for downstream Scopes 1–3 analysis.

## Endpoints

### POST /carbon-auditor/upload

Uploads a CSV document with the following expected columns:

- vendor_name
- description
- amount_usd
- naics_code (optional)

Validation rules:

- file must be a CSV (`.csv` extension)
- file size must be 5MB or less
- required headers are `vendor_name`, `description`, and `amount_usd`
- rows are stored in Cloud SQL as `procurement_line_items`

## Local run

```bash
cd api
npm install
npm run dev
```

## Test command

```bash
cd api
npm test -- --runTestsByPath __tests__/procurementRoutes.test.js --runInBand
```
