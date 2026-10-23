---
description: "Bring your register across from Registry Direct: the All holdings export, then each holder's transaction history if you want it."
---

Read `CLAUDE.md` first. Read `docs/replace-registry-direct.md`. Run `npm run registry -- import registry-direct <all-holdings.csv> --dry-run` and show the preview. On a yes, run it without `--dry-run`. Each holding becomes an opening balance. For a holder's full history: `npm run registry -- import registry-direct-history <transactions.csv> --fund=<fund> --holder="<name>" --dry-run`, then without. The import refuses if the history does not add up to the holding. Afterwards set each fund's structure, jurisdiction, offer type, currency and unit price with `set funds`, and run `/compliance`.
