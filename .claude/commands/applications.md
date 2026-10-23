---
description: "Applications waiting to settle, and what each one is waiting for: identity, money or a settlement date."
---

Read `CLAUDE.md` first. Run `npm run registry -- pending`. For each row say what is missing: identity not verified, money not received, or ready to settle. When the operator confirms money arrived, run `npm run registry -- receive <ref> --on=YYYY-MM-DD`. To issue units run `npm run registry -- settle <ref> --on=YYYY-MM-DD`; the CLI refuses while identity is not verified or money is not recorded, and you never work around that.
