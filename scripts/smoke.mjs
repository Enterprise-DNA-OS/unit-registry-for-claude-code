#!/usr/bin/env node
// npm test: a temporary database, the migration, the seed twice, every command, PASS.
// TEST_DATABASE_URL runs the same checks in a throwaway schema on a real Postgres.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { run, reads, resolve, format, tables } from './registry.mjs';
import { parseCsv } from './lib/csv.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-test-'));
const testUrl = process.env.TEST_DATABASE_URL || '';
const schema = 'registry_test_' + Date.now();
process.env.DATABASE_URL = '';
process.env.DATA_DIR = path.join(temp, 'db');
process.env.OUTPUT_DIR = temp;

let db, checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.equal(String(a), String(b), m); checks++; };
const fail = async (fn, re) => { await assert.rejects(fn, re); checks++; };
const file = (n, v) => { const p = path.join(temp, n); fs.writeFileSync(p, typeof v === 'string' ? v : JSON.stringify(v)); return p; };
const cli = (s, args = [], status = 0) => {
  const p = spawnSync(process.execPath, [s, ...args], { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
  assert.equal(p.status, status, p.stderr || p.stdout); checks++; return p.stdout;
};
const units = async (fund, holder) => (await db.query('select units from holdings_view where fund = $1 and holder = $2', [fund, holder]))[0]?.units;

try {
  if (testUrl) {
    process.env.DATABASE_URL = testUrl;
    const admin = await getDb();
    try { await admin.exec(`create schema ${schema}`); } finally { await admin.close(); }
    const u = new URL(testUrl); u.searchParams.set('options', '-c search_path=' + schema); process.env.DATABASE_URL = u.toString();
  }
  db = await getDb();
  eq((await migrate(db)).ran.length, 1, 'fresh migration');
  eq((await migrate(db)).ran.length, 0, 'repeat migrate is a no-op');
  const seed = fs.readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8');
  await db.exec(seed); await db.exec(seed);
  eq((await db.query('select count(*) from transactions'))[0].count, 16, 'seed idempotent');
  const day = (await db.query('select current_date::text as d'))[0].d;

  // Every read, with and without a fund filter.
  for (const key of Object.keys(reads)) {
    const rows = await run(db, [key]); ok(Array.isArray(rows), key); ok(format(rows).length > 0, 'format ' + key);
    ok(Array.isArray(await run(db, [key, '--fund=harbourside'])), key + ' filtered');
  }
  ok((await run(db, ['help'])).length > 30, 'help');
  eq((await run(db, ['register', '--fund=HARBOURSIDE'])).length, 5, 'five current Harbourside holders');
  ok((await run(db, ['holder', 'whitford'])).holdings.length === 1, 'holder by partial name');
  ok((await run(db, ['holder', 'X0001003'])).holder.name === 'Priya Raman', 'holder by SRN');
  ok((await run(db, ['fund', 'kauri'])).register.length === 3, 'fund detail');
  await fail(() => run(db, ['holder', 'a']), /Ambiguous/);
  await fail(() => run(db, ['holder', 'nobody here']), /Not found/);
  await fail(() => run(db, ['bogus']), /Unknown command/);

  // The seed has something to say.
  const attention = await run(db, ['attention']);
  for (const issue of ['Application waiting to settle', 'Capital call unpaid', 'Distribution not approved by payment date', 'Unit price older than 3 months', 'Identity review overdue', 'No contact on file'])
    ok(attention.some((r) => r.issue === issue), 'attention: ' + issue);
  const compliance = await run(db, ['compliance']);
  for (const rule of ['AU-TFN-WITHHOLDING', 'NZ-PIE-PIR', 'CRS-SELF-CERT', 'NON-RESIDENT-RATE', 'AML-ONGOING-REVIEW', 'AU-CA-1017D-PERIODIC', 'AU-CA-1017D-EXIT', 'CA-169-REGISTER'])
    ok(compliance.some((r) => r.rule === rule), 'compliance: ' + rule);
  ok(!compliance.some((r) => r.rule === 'AU-CA-1017D-PERIODIC' && r.reference === 'J & K Whitford'), 'issued statement clears the rule');
  ok(!compliance.some((r) => r.fund === 'KAURI' && r.rule.startsWith('AU-CA')), 'wholesale NZ fund has no periodic statement rule');

  // Applications: identity first, then money, then units.
  await fail(() => run(db, ['settle', 'HPT-APP-007', `--on=${day}`]), /identity is pending/);
  await run(db, ['set', 'investors', 'Ben Okafor', `--data=${file('ben.json', { aml_status: 'verified', aml_verified_on: day, aml_next_review: '2028-01-01' })}`]);
  await fail(() => run(db, ['settle', 'HPT-APP-007', `--on=${day}`]), /no application money/);
  await run(db, ['receive', 'HPT-APP-007', `--on=${day}`]);
  await run(db, ['settle', 'HPT-APP-007', `--on=${day}`]);
  eq(Number(await units('HARBOURSIDE', 'Ben Okafor')), 20000, 'units issued once settled');
  await fail(() => run(db, ['settle', 'HPT-APP-007', `--on=${day}`]), /settled/);
  await fail(() => run(db, ['cancel', 'HPT-APP-007']), /reversing adjustment/);

  const app = await run(db, ['apply', '--fund=Harbourside', '--holder=Priya', '--amount=10850']);
  eq(Number(app[0].units), 10000, 'amount divided by the unit price');
  await run(db, ['cancel', app[0].ref]);
  await fail(() => run(db, ['apply', '--fund=Harbourside', '--holder=Priya', '--amount=-5']), /positive/);
  await fail(() => run(db, ['apply', '--fund=Harbourside', '--holder=Priya', '--units=10', '--received=2026-02-30']), /Invalid/);

  // Redemptions and transfers.
  await fail(() => run(db, ['redeem', '--fund=Harbourside', '--holder=Priya', '--units=50000', `--on=${day}`]), /40000/);
  const red = await run(db, ['redeem', '--fund=Harbourside', '--holder=Priya', '--units=10000', `--on=${day}`]);
  eq(red[0].amount, '10850.00', 'redemption at the fund price');
  await fail(() => run(db, ['transfer', '--fund=Harbourside', '--from=Whitford', '--to=Lachlan', '--units=500000', `--on=${day}`]), /Cannot transfer/);
  await run(db, ['transfer', '--fund=Harbourside', '--from=Whitford', '--to=Coastline', '--units=5000', `--on=${day}`]);
  eq(Number(await units('HARBOURSIDE', 'Coastline Super Fund')), 280000, 'transfer in');
  eq(Number(await units('HARBOURSIDE', 'J & K Whitford')), 120000, 'transfer out');
  await run(db, ['redeem', '--fund=Harbourside', '--holder=Priya', '--all', `--on=${day}`]);
  eq(Number(await units('HARBOURSIDE', 'Priya Raman')), 0, 'full redemption leaves a nil holding');

  // Distributions: non-resident rate held, TFN withholding at 47%, approve, paid.
  await fail(() => run(db, ['distribute', '--fund=Harbourside', '--cents=2', `--record-date=${day}`, `--payment-date=${day}`]), /Sofia Marchetti/);
  await run(db, ['set', 'investors', 'Sofia', `--data=${file('sofia.json', { withholding_rate: 15, crs_self_cert_on: day })}`]);
  await run(db, ['set', 'investors', 'Ben Okafor', `--data=${file('ben-tfn.json', { tfn_quoted: false })}`]);
  const dist = await run(db, ['distribute', '--fund=Harbourside', '--cents=2', `--record-date=${day}`, `--payment-date=${day}`, '--name=TEST-DIST']);
  eq(dist[0].holders, 5, 'every holder with units at the record date');
  const lines = await run(db, ['distribution', 'TEST-DIST']);
  const ben = lines.find((l) => l.holder === 'Ben Okafor');
  eq(ben.gross, '400.00', 'gross is units times cents'); eq(ben.withholding, '188.00', '47% with no TFN'); eq(ben.net, '212.00', 'net');
  eq(lines.find((l) => l.holder === 'Sofia Marchetti').withholding, '240.00', 'non-resident rate');
  eq(lines.find((l) => l.holder === 'Hartley Holdings Pty Ltd').withholding, '0.00', 'TFN quoted');
  ok(!lines.some((l) => l.holder === 'Priya Raman'), 'nil holder excluded');
  const again = await run(db, ['distribute', '--fund=Harbourside', '--cents=2', `--record-date=${day}`, `--payment-date=${day}`, '--name=TEST-DIST']);
  eq(again[0].holders, 5, 'recalculating a draft does not duplicate lines');
  await fail(() => run(db, ['distribution-paid', 'TEST-DIST', `--on=${day}`]), /approved/);
  await run(db, ['approve-distribution', 'TEST-DIST', '--by=Fund Accountant']);
  await fail(() => run(db, ['approve-distribution', 'TEST-DIST', '--by=Someone']), /draft/);
  await fail(() => run(db, ['distribute', '--fund=Harbourside', '--cents=3', `--record-date=${day}`, `--payment-date=${day}`, '--name=TEST-DIST']), /cannot be recalculated/);
  await run(db, ['distribution-paid', 'TEST-DIST', `--on=${day}`]);
  await fail(() => run(db, ['distribute', '--fund=Harbourside', '--cents=2', '--record-date=2026-05-02', '--payment-date=2026-05-01']), /before the record date/);

  // Capital calls.
  const call = await run(db, ['call', '--fund=Parnell', '--cents=5', '--due=2030-01-31', '--name=TEST-CALL']);
  eq(call.length, 3, 'one line per holder');
  eq(call.find((c) => c.holder === 'Whitcombe Ltd').amount, '12500.00', 'call amount');
  await run(db, ['call-paid', 'TEST-CALL', '--holder=Whitcombe', `--on=${day}`]);
  await fail(() => run(db, ['call-paid', 'TEST-CALL', '--holder=Whitcombe', `--on=${day}`]), /No unpaid/);

  // Statements.
  const periodic = await run(db, ['statement-run', '--fund=Harbourside', '--kind=periodic']);
  ok(periodic.some((s) => s.holder === 'Lachlan Doyle'), 'periodic statement for a holder who held at period end');
  ok(!periodic.some((s) => s.holder === 'J & K Whitford'), 'already issued not prepared again');
  await run(db, ['statement-issued', '--fund=Harbourside', '--kind=periodic', `--on=${day}`]);
  const exits = await run(db, ['statement-run', '--fund=Harbourside', '--kind=exit']);
  ok(exits.some((s) => s.holder === 'Lachlan Doyle') && exits.some((s) => s.holder === 'Priya Raman'), 'exit statements for nil holders');
  await run(db, ['statement-issued', '--fund=Harbourside', '--kind=exit', '--holder=Lachlan', `--on=${day}`]);
  const after = await run(db, ['compliance', '--fund=Harbourside']);
  ok(!after.some((r) => r.rule === 'AU-CA-1017D-PERIODIC'), 'periodic rule cleared');
  ok(!after.some((r) => r.rule === 'AU-CA-1017D-EXIT' && r.reference === 'Lachlan Doyle'), 'exit rule cleared for Lachlan');
  ok(after.some((r) => r.rule === 'AU-CA-1017D-EXIT' && r.reference === 'Priya Raman'), 'exit rule still open for Priya');
  await fail(() => run(db, ['statement-run', '--fund=Harbourside', '--kind=annual']), /periodic or exit/);

  // Prices, records, notes, drafts.
  await run(db, ['price', '--fund=Kauri', '--price=1.4400', `--on=${day}`]);
  ok(!(await run(db, ['attention'])).some((r) => r.issue === 'Unit price older than 3 months'), 'fresh price clears attention');
  await run(db, ['add', 'funds', `--data=${file('fund.json', { name: 'TESTFUND', legal_name: 'Test Fund', jurisdiction: 'NZ', currency: 'NZD' })}`]);
  await run(db, ['add', 'investors', `--data=${file('inv.json', { name: 'Test Holder', tax_country: 'NZ', aml_status: 'verified' })}`]);
  await run(db, ['add', 'investors', `--data=${file('pending.json', { name: 'Pending Buyer', tax_country: 'NZ' })}`]);
  await fail(() => run(db, ['transfer', '--fund=Kauri', '--from=Aroha', '--to=Pending Buyer', '--units=1', `--on=${day}`]), /identity is pending/);
  await fail(() => run(db, ['apply', '--fund=TESTFUND', '--holder=Test Holder', '--units=10']), /no unit price/);
  await fail(() => run(db, ['add', 'investors', `--data=${file('bad.json', { name: 'X', id: 'nope' })}`]), /Unsupported/);
  await fail(() => run(db, ['set', 'investors', 'Test Holder', `--data=${file('bad-date.json', { aml_next_review: '2026-13-01' })}`]), /Invalid/);
  await run(db, ['log', '--holder=Whitcombe', '--fund=Parnell', '--note=Paid the call']);
  ok((await run(db, ['notes'])).some((n) => n.note === 'Paid the call'), 'note logged');
  for (const [cmdArgs, needle] of [[['draft-distribution-notice', 'TEST-DIST'], 'Not sent'], [['draft-call-reminder', 'PCS-CALL-01'], 'Whitcombe'], [['draft-holder-letter', 'Grant Liu', '--about=Missing address'], 'no email on file']]) {
    const out = await run(db, cmdArgs); ok(fs.readFileSync(out[0].file, 'utf8').includes(needle), 'draft ' + cmdArgs[0]);
  }

  // Import from Registry Direct: preview, load, repeat, then a holder's full history.
  const holdingsCsv = path.join(REPO_ROOT, 'fixtures', 'registry-direct-all-holdings.csv');
  const historyCsv = path.join(REPO_ROOT, 'fixtures', 'registry-direct-transactions.csv');
  const before = (await db.query('select count(*) from transactions'))[0].count;
  const preview = await run(db, ['import', 'registry-direct', holdingsCsv, '--dry-run']);
  eq(preview[0].holdings, 3, 'preview counts'); eq((await db.query('select count(*) from transactions'))[0].count, before, 'preview is read-only');
  await run(db, ['import', 'registry-direct', holdingsCsv]);
  await run(db, ['import', 'registry-direct', holdingsCsv]);
  eq(Number(await units('EASTBANK-OFFICE-FUND-UNITS', 'Marlow Family Trust')), 120000, 'opening balance, commas parsed, repeat import idempotent');
  ok((await db.query("select aml_status from investors where name = 'Daniel Sato'"))[0].aml_status === 'verified', 'verification mapped');
  ok((await db.query("select source_record from investors where name = 'Daniel Sato'"))[0].source_record['Tax type'] === 'Individual', 'unmapped columns kept');
  ok(!(await db.query("select 1 from transactions t join investors i on i.id = t.investor_id where i.name = 'Nina Patel'")).length, 'nil holding imports the holder only');
  await fail(() => run(db, ['import', 'registry-direct-history', historyCsv, '--fund=EASTBANK', '--holder=Daniel']), /does not match/);
  eq((await run(db, ['import', 'registry-direct-history', historyCsv, '--fund=EASTBANK', '--holder=Marlow', '--dry-run']))[0].closing_units, 120000, 'history preview');
  await run(db, ['import', 'registry-direct-history', historyCsv, '--fund=EASTBANK', '--holder=Marlow']);
  eq(Number(await units('EASTBANK-OFFICE-FUND-UNITS', 'Marlow Family Trust')), 120000, 'history replaces the opening balance');
  eq((await run(db, ['holder', 'Marlow'])).transactions.length, 3, 'three history rows');
  await run(db, ['import', 'registry-direct-history', historyCsv, '--fund=EASTBANK', '--holder=Marlow']);
  eq((await run(db, ['holder', 'Marlow'])).transactions.length, 3, 'repeat history import idempotent');
  await fail(() => run(db, ['import', 'registry-direct-history', file('short.csv', 'Settlement date,Type,Quantity,Balance\n01/02/2024,Application,100,999\n'), '--fund=EASTBANK', '--holder=Marlow']), /last Balance/);
  await fail(() => run(db, ['import', 'registry-direct-history', file('odd.csv', 'Settlement date,Type,Quantity,Balance\n01/02/2024,Bonus issue,100,100\n'), '--fund=EASTBANK', '--holder=Marlow']), /not mapped/);
  await fail(() => run(db, ['import', 'other', holdingsCsv]), /Supported imports/);
  ok(parseCsv('﻿a,b\r\n"two\nlines","a""b"\r\n')[0].b === 'a"b', 'quoted CSV');

  // Export and re-seed safety.
  const out = await run(db, ['export']);
  eq(Object.keys(JSON.parse(fs.readFileSync(out[0].file, 'utf8')).records).length, tables.length, 'full export');
  await db.exec(seed);
  eq(Number(await units('HARBOURSIDE', 'Priya Raman')), 0, 're-seed keeps your writes');
  await resolve(db, 'funds', 'harbour');
  await db.close(); db = null;

  // The CLI, views and documents as a person runs them.
  for (const key of Object.keys(reads)) ok(Array.isArray(JSON.parse(cli('scripts/registry.mjs', [key, '--json']))), 'CLI ' + key);
  ok(cli('scripts/registry.mjs', ['holder', 'Aroha']).includes('holdings'), 'CLI holder');
  cli('scripts/registry.mjs', ['holder', 'nobody'], 1);
  cli('scripts/view.mjs'); cli('scripts/docs.mjs');
  ok(fs.readFileSync(path.join(temp, 'views', 'week.html'), 'utf8').includes('Harbour Fund Services'), 'branded view');
  for (const d of ['holding-statement', 'distribution-statement', 'periodic-statement', 'capital-call-notice', 'register-extract'])
    ok(fs.readdirSync(path.join(temp, 'docs-out', d)).length > 0, 'document ' + d);

  const commands = fs.readdirSync(path.join(REPO_ROOT, '.claude', 'commands')).filter((x) => x.endsWith('.md') && x !== 'README.md').length;
  console.log(`PASS: ${checks} checks; ${commands} agent commands; ${testUrl ? 'isolated Postgres schema' : 'temporary PGlite database'}.`);
} finally {
  await db?.close();
  if (testUrl) { process.env.DATABASE_URL = testUrl; const admin = await getDb(); try { await admin.exec(`drop schema if exists ${schema} cascade`); } finally { await admin.close(); } }
  fs.rmSync(temp, { recursive: true, force: true });
}
