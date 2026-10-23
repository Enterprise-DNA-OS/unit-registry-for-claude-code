<h1 align="center">Unit Registry for Claude Code</h1>

<p align="center">
  <strong>The open-source unit registry that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Registry Direct data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=registry-direct">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/registry-direct?utm_source=github&utm_medium=readme&utm_campaign=registry-direct">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-registry-direct">Instead of Registry Direct</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Unit Registry for Claude Code does the job you pay Registry Direct for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Registry Direct dashboard cannot.

Registry Direct quotes its Trusts plan privately. Its published Companies Premium plan is $200 a month plus 50 cents per holding a month, identity checks are $9 per individual, and support is $250 an hour, all before GST ([pricing](https://www.registrydirect.com.au/pricing/), checked 23 October 2026).

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=registry-direct).

It is the register for an unlisted unit trust, a property syndicate, a PIE fund or a small company with many shareholders: holders, applications, redemptions, transfers, unit prices, distributions with TFN and non-resident withholding, capital calls, periodic and exit statements, and the identity and tax-residency status of every holder. It is built for fund managers, syndicators and the fund administrators who run registers for them in Australia and New Zealand.

Nothing here pays anyone or lodges anything. Distributions and redemptions are calculated and recorded; your bank makes the payment and your accountant lodges the tax reports.

### Ten questions Registry Direct's screens will not answer for you

1. Which holders will lose 47% of their next distribution because no TFN was quoted?
2. How many holders make up half of each fund, and who holds more than 20%?
3. Which applications are stuck, and is each one waiting on identity or on money?
4. Who still owes money on the last capital call, and how much?
5. Which retail holders are still owed a periodic or exit statement, and by when?
6. Which high-risk holders are overdue for their identity review?
7. Which non-resident holders have no self-certification or withholding rate set?
8. What did each holder receive, and what was withheld, in the last distribution?
9. Which funds have a unit price more than three months old?
10. Which holders could not be paid a distribution today because there is no bank account on file?

Each one is a single command today. See `docs/questions.json`.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/unit-registry-for-claude-code.git
cd unit-registry-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`, or ask "what needs doing on the register this week?"

### Your first hour: ten things to ask for

1. "Show me the Harbourside register, largest holder first."
2. "What needs attention this week?"
3. "Which compliance items are due before Christmas?"
4. "Draft a 1.8 cent distribution for Harbourside with a record date of the 31st."
5. "Who has not paid the Parnell call? Draft the reminders."
6. "Ben Okafor's identity check came back verified today. Settle his application."
7. "Prepare the periodic statements for last year and render them."
8. "Add a field for each holder's adviser." (`/customise`)
9. "Make me a page I can print for the board: register, distributions and calls." (`/new-view`)
10. "Bring across my Registry Direct export." (`/import`)

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/register` | The register of holders by fund, with share and date entered |
| `/holders` | Every holder with tax residency, identity status and holdings |
| `/holder` | One holder: holdings, transactions, distributions, notes |
| `/funds` | Fund review: holders, value, pending work, calls, compliance |
| `/attention` | What needs a person this week |
| `/compliance` | The register checked against the rules in `docs/compliance.md` |
| `/kyc-due` | Identity checks not done, overdue or due in 60 days |
| `/tax-residency` | TFN, PIR, non-resident rate and CRS self-certification status |
| `/concentration` | Who owns how much of each fund |
| `/transactions` | Applications, redemptions, transfers, newest first |
| `/applications` | Applications waiting to settle, and what each is waiting for |
| `/apply` | Record a new application |
| `/redeem` | Record a redemption, part or full |
| `/transfer` | Register an off-market transfer |
| `/price` | Set a unit price from a valuation or NAV |
| `/distribute` | Calculate a distribution as a draft, with withholding |
| `/approve-distribution` | Approve a draft, then record it paid |
| `/capital-call` | Raise a call, record payments, chase who has not paid |
| `/statements` | Prepare, render and record periodic and exit statements |
| `/documents` | Render statements, notices and the register extract in your brand |
| `/log` | Note a call, email or promise against a holder |
| `/draft-notice` | Draft a distribution notice, call reminder or holder letter |
| `/weekly-review` | The Monday registry review |
| `/import` | Bring your register across from Registry Direct |
| `/export` | Every record to one JSON file |
| `/customise` | Add a field, change a rule, in plain language |
| `/new-view` | A new read-only page from a description |
| `/help` | Every command, grouped |

`npm run view` renders the week, the register and the fund review as HTML pages in your brand. `npm run docs` renders holding statements, distribution statements, periodic and exit statements, capital call notices and the register extract.

## Instead of Registry Direct

Export All holdings to CSV from Registry Direct and run `npm run registry -- import registry-direct ./all-holdings.csv --dry-run`, then without `--dry-run`. Each holder's transaction history can follow. Column by column mapping, and what does not come across: [docs/replace-registry-direct.md](docs/replace-registry-direct.md). The rules the register is checked against, with sources: [docs/compliance.md](docs/compliance.md).

## Architecture

```
unit-registry-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Unit Registry for Claude Code for your business, migrates your Registry Direct data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=registry-direct)
- Read more: [enterprisedna.co/omni/instead-of/registry-direct](https://enterprisedna.co/omni/instead-of/registry-direct?utm_source=github&utm_medium=readme&utm_campaign=registry-direct)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
