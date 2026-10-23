# Moving off Registry Direct

Registry Direct gives you a free self-service way out: export your holders from the All holdings list, and export each holder's Transaction History. ([What happens if you offboard](https://help.registrydirect.com.au/hc/en-us/articles/360001214012), [All holdings list](https://help.registrydirect.com.au/hc/en-us/articles/4403275993485), [Transaction history](https://help.registrydirect.com.au/hc/en-us/articles/360000979331)). Tax file numbers come on request from Registry Direct; this system does not store them, only whether one was quoted.

## 1. Export from Registry Direct

1. **Holders, then All Holdings.** Use the Columns dropdown to show every column, including Nil holdings if you want former holders. Actions, then Export all rows to CSV.
2. **Each holder's Transactions tab** (optional, for full history). Set the export period to cover every date, then Export, then CSV.

## 2. Import the holdings

```bash
npm run registry -- import registry-direct ./all-holdings.csv --dry-run
npm run registry -- import registry-direct ./all-holdings.csv --as-at=2026-10-31
```

Each row becomes a holder and an opening balance dated on its First transaction date (or `--as-at`). Running it again does not double anything.

| Registry Direct column | Goes to |
|---|---|
| Holder | holder name |
| HIN/SRN | holder reference |
| Security | the fund (created if new; set its details afterwards) |
| Quantity | opening balance in units (commas are fine) |
| Email, Address | email, address |
| TFN quoted? | whether a TFN or ABN was quoted |
| Tax country for payment (or Tax declaration country) | tax country |
| Bank details provided? | bank account on file (yes or no only) |
| Tax dec submitted | tax residency self-certification received |
| AML risk rating, Next review date | risk rating, next identity review |
| Verification | identity status: verified if it says verified, pass or complete; otherwise pending |
| External ID | external id |
| Everything else | kept as-is on the holder's source record |

## 3. Import a holder's history (optional)

```bash
npm run registry -- import registry-direct-history ./transactions-marlow.csv --fund=EASTBANK --holder="Marlow Family Trust" --dry-run
npm run registry -- import registry-direct-history ./transactions-marlow.csv --fund=EASTBANK --holder="Marlow Family Trust"
```

The history replaces that holder's opening balance. It refuses if the rows do not add up to the last Balance, or to the opening balance already loaded. Types mapped: Application, Redemption, Transfer in, Transfer out, Distribution allotment or reinvestment, Adjustment. Anything else stops the import and names the row: ask Claude Code to add the mapping.

## 4. Finish the setup

For each fund, run `set funds <name> --data=<file>` with its structure, jurisdiction (AU or NZ), offer type (retail or wholesale), currency and reporting month, then `price` with the latest unit price. Then run `/compliance` and `/attention`.

## What does not come across

- Past distribution payments, periodic statements and tax statements as documents. Keep the files; the full service paid export from Registry Direct includes them.
- Bank account numbers and TFNs. Collect them into your payment and tax process, not into this database.
- Online application forms and the investor app. Applications are recorded here when the form arrives; investors get statements by email or post.
