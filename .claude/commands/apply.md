---
description: "Record a new application for units: who, which fund, how much."
---

Read `CLAUDE.md` first. Confirm the holder exists (`npm run registry -- holder`); if not, add them first with `add investors --data=<file>` using only details the operator gives. Then run `npm run registry -- apply --fund=<fund> --holder="<name>" --amount=<money>` (or `--units=<n>`), adding `--received=YYYY-MM-DD` if the money is already in. Units are the amount divided by the current unit price, rounded down to four decimals. Report the reference and what it is waiting for.
