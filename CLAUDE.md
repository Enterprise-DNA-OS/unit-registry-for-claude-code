# Unit Registry for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What is the register / who holds what | `/register` |
| Tell me about a holder | `/holder` |
| What needs doing this week | `/attention` |
| Are we compliant / what is due | `/compliance` |
| Identity checks due | `/kyc-due` |
| TFN, PIR, non-resident status | `/tax-residency` |
| Fund summary | `/funds` |
| Who owns how much | `/concentration` |
| New application | `/apply`, then `/applications` to settle |
| Redemption | `/redeem` |
| Transfer between holders | `/transfer` |
| New unit price | `/price` |
| Distribution | `/distribute`, then `/approve-distribution` |
| Capital call | `/capital-call` |
| Periodic or exit statements | `/statements` |
| Statements, notices, register extract as documents | `/documents` |
| Note a conversation | `/log` |
| Write to holders | `/draft-notice` |
| Monday review | `/weekly-review` |
| Bring data from Registry Direct | `/import` |
| Back up everything | `/export` |
| Change a field or rule | `/customise` |
| A new page to look at | `/new-view` |

If an ask fits nothing here, run the CLI directly (`npm run registry -- help`) and then propose a new command for it.

## Hard rules

- Units are issued only by `settle` or `transfer`, and both refuse a holder whose identity is not verified. Never work around that with a direct database write.
- Never pay, lodge or send. Distributions, redemptions and calls are calculated and recorded here; the bank pays, the accountant lodges, a person sends.
- Never store a TFN, IRD number or bank account number. Record only whether one was given.
- A settled transaction is never edited or deleted. Correct it with a reversing adjustment and a note.

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off Registry Direct.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/registry-direct
