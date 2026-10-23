---
description: "Show the register of holders: who holds what in each fund, their share and when they were entered."
---

Read `CLAUDE.md` first. Run `npm run registry -- register` (add `--fund=<name>` for one fund). Present one table per fund, largest holding first, with the total units and value at the foot. Units are the sum of settled transactions only; a pending application is not on the register. If a holder has no address, say so: the register needs one (docs/compliance.md, CA-169-REGISTER).
