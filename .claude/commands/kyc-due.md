---
description: "Holders whose identity is not verified, or whose ongoing review is overdue or due in the next 60 days."
---

Read `CLAUDE.md` first. Run `npm run registry -- kyc-due` (optionally `--fund=<name>`). Order: not verified, overdue, due soon. High risk first within each. When the operator confirms a check is done, record it with `set investors "<name>" --data=<file>` setting `aml_status`, `aml_verified_on` and `aml_next_review` from the evidence they give you. Never mark someone verified without that evidence.
