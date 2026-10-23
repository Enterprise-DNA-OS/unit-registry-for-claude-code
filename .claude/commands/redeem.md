---
description: "Record a redemption: part or all of a holding, at the fund price or a stated price."
---

Read `CLAUDE.md` first. Run `npm run registry -- holder` first to confirm the holding. Then `npm run registry -- redeem --fund=<fund> --holder="<name>" --units=<n> --on=YYYY-MM-DD` (or `--all`; add `--price=<p>` if the redemption price is not the current unit price). A full redemption creates an exit: remind the operator an exit statement is now due (`/statements`). Paying the money is done outside this system.
