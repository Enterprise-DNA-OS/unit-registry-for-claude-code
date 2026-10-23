---
description: "Prepare periodic and exit statements, render them, and record when they were issued."
---

Read `CLAUDE.md` first. Run `npm run registry -- statement-run --fund=<fund> --kind=periodic` (the last completed period) or `--kind=exit` (holders who left). Then `npm run docs -- periodic-statement` renders each one in your brand into `docs-out/`. Once the operator confirms they went out, run `npm run registry -- statement-issued --fund=<fund> --kind=<kind> --on=YYYY-MM-DD` (add `--holder` for one). Check `/compliance` afterwards: the 1017D rows should be gone. Tax statements come from the fund accountant.
