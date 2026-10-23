---
description: "Set a fund unit price from the latest valuation or NAV."
---

Read `CLAUDE.md` first. Ask for the price, the date it applies from and where it came from (a valuation, the fund accountant's NAV). Run `npm run registry -- price --fund=<fund> --price=<p> --on=YYYY-MM-DD`. Say back the old and new price and the change in total fund value from `fund-review`. Ask the operator to keep the valuation or NAV file with the fund's records. A price older than three months shows in `/attention`.
