---
description: "Calculate a distribution as a draft: cents per unit, record date, payment date, withholding per holder."
---

Read `CLAUDE.md` first. Run `npm run registry -- distribute --fund=<fund> --cents=<c> --record-date=YYYY-MM-DD --payment-date=YYYY-MM-DD`. If it stops on non-resident holders with no withholding rate, ask the operator for the rates from the fund accountant and set them. Then show `npm run registry -- distribution <name>`: gross, withheld and net per holder, and anyone with no bank account on file. Running it again on a draft recalculates it. Approval is separate: `/approve-distribution`.
