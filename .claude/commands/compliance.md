---
description: "Check the register against the rules in docs/compliance.md (identity checks, TFN withholding, PIR, CRS self-certification, periodic and exit statements, register contents) and report what is breached or due, with the rule cited."
---

1. Read `docs/compliance.md`. Each rule has an id, its source, and what a breach looks like in the data.
2. Run `npm run registry -- compliance --json` (add `--fund=<name>` for one fund).
3. Report as a table: rule, fund, holder, detail, due date, days left. Order: past due first, then due within 30 days, then rules with no date (fix before the next distribution or issue).
4. For each breach, name the fix the operator can approve: verify identity (`/kyc-due`), set a rate (`/tax-residency`), prepare and issue statements (`/statements`), add an address (`set investors`). Draft any letter to `drafts/`; never send.
5. If a rule in `docs/compliance.md` looks out of date, say so and stop. Do not guess at law. The operator confirms the rule, then you update the doc and the view together with `/customise`.

Nothing here is legal or tax advice. The doc records the rules the operator told the system to check, with sources.
