---
description: "Approve a draft distribution, then record it as paid once the bank payment has gone."
---

Read `CLAUDE.md` first. Show `npm run registry -- distribution <name>` and the totals from `npm run registry -- distributions`. Only on the operator's explicit approval run `npm run registry -- approve-distribution <name> --by="<their name>"`. After the payment run has gone from the bank, run `npm run registry -- distribution-paid <name> --on=YYYY-MM-DD`. This system never makes the payment. Offer `npm run docs -- distribution-statement` for the statements.
