---
description: "Raise a capital call on every current holder, track who has paid, and chase who has not."
---

Read `CLAUDE.md` first. To raise one: `npm run registry -- call --fund=<fund> --cents=<c> --due=YYYY-MM-DD`, then `npm run docs -- capital-call-notice` for the notices. To record a payment: `npm run registry -- call-paid <call> --holder="<name>" --on=YYYY-MM-DD`. To see the state: `npm run registry -- calls`. To chase: `npm run registry -- draft-call-reminder <call>` writes the reminders to `drafts/`. Nothing is sent from here.
