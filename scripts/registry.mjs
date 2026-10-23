#!/usr/bin/env node
// The one CLI for the register. Human tables by default, --json for machines.
//   npm run registry -- help
// Every write runs in a transaction. Nothing here moves money or lodges anything:
// distributions and capital calls are calculated and recorded, a person pays and sends.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick, yesNo } from './lib/csv.mjs';

export const fields = {
  funds: ['name', 'legal_name', 'structure', 'jurisdiction', 'offer_type', 'currency', 'period_end_month', 'status'],
  investors: ['name', 'holder_ref', 'holder_type', 'email', 'address', 'tax_country', 'tfn_quoted', 'pir', 'withholding_rate',
    'crs_self_cert_on', 'aml_status', 'aml_verified_on', 'aml_risk', 'aml_next_review', 'bank_on_file', 'external_id'],
};
export const tables = ['funds', 'investors', 'transactions', 'distributions', 'distribution_lines', 'capital_calls', 'capital_call_lines', 'statements', 'notes'];

// Reads that take an optional --fund=<name> filter.
export const reads = {
  funds: `select f.name, f.legal_name, f.structure, f.jurisdiction, f.offer_type, f.currency, f.unit_price, f.price_on,
            count(h.investor_id) filter (where h.units > 0) as holders, coalesce(sum(h.units),0) as units, coalesce(sum(h.value),0) as value
          from funds f left join holdings_view h on h.fund_id = f.id {where} group by f.id order by f.name`,
  register: `select fund, holder, holder_ref, holder_type, units, pct_of_fund, value, currency, entered_on, address from register_view {where} order by fund, units desc`,
  holders: `select i.name, i.holder_ref, i.holder_type, i.tax_country, i.aml_status, i.aml_risk, i.aml_next_review, i.bank_on_file,
              string_agg(h.fund || ' ' || h.units, ', ' order by h.fund) filter (where h.units > 0) as holdings
            from investors i left join holdings_view h on h.investor_id = i.id {where} group by i.id order by i.name`,
  transactions: `select t.ref, f.name as fund, i.name as holder, t.kind, t.units, t.price, t.amount, t.status, t.received_on, t.settled_on, t.note
                 from transactions t join funds f on f.id = t.fund_id join investors i on i.id = t.investor_id {where}
                 order by coalesce(t.settled_on, t.created_at::date) desc, t.ref`,
  pending: `select t.ref, f.name as fund, i.name as holder, t.kind, t.units, t.amount, f.currency, i.aml_status, t.received_on, t.created_at::date as lodged_on
            from transactions t join funds f on f.id = t.fund_id join investors i on i.id = t.investor_id
            {where} {and} t.status = 'pending' order by t.created_at`,
  distributions: `select * from distribution_view {where} order by record_date desc`,
  calls: `select * from calls_view {where} order by due_on desc, holder`,
  statements: `select f.name as fund, i.name as holder, s.kind, s.period_start, s.period_end, s.prepared_on, s.issued_on
               from statements s join funds f on f.id = s.fund_id join investors i on i.id = s.investor_id {where}
               order by s.period_end desc, f.name, i.name`,
  attention: `select issue, fund, reference, detail, since from attention_view {where} order by issue, since nulls first, reference`,
  compliance: `select rule, fund, reference, detail, due_on, case when due_on is null then null else due_on - current_date end as days_left
               from compliance_view {where} order by due_on nulls first, rule, reference`,
  'kyc-due': `select i.name as holder, i.aml_status, i.aml_risk, i.aml_verified_on, i.aml_next_review,
                case when i.aml_status <> 'verified' then 'not verified' when i.aml_next_review < current_date then 'overdue' else 'due within 60 days' end as state
              from investors i where (i.aml_status <> 'verified' or i.aml_next_review < current_date + 60)
                and exists (select 1 from transactions t join funds f on f.id = t.fund_id where t.investor_id = i.id and t.status <> 'cancelled' {andFund})
              order by i.aml_next_review nulls first`,
  'tax-residency': `select i.name as holder, i.tax_country, i.tfn_quoted, i.pir, i.withholding_rate, i.crs_self_cert_on,
                      string_agg(distinct h.fund, ', ') as funds
                    from investors i join holdings_view h on h.investor_id = i.id and h.units > 0 {where}
                    group by i.id order by i.tax_country, i.name`,
  concentration: `select fund, holder, units, pct_of_fund, sum(pct_of_fund) over (partition by fund order by units desc, holder) as cumulative_pct
                  from register_view {where} order by fund, units desc`,
  notes: `select n.recorded_on, i.name as holder, f.name as fund, n.note from notes n join investors i on i.id = n.investor_id
          left join funds f on f.id = n.fund_id {where} order by n.recorded_on desc`,
  'fund-review': `select f.name as fund, f.currency,
      (select count(*) from holdings_view h where h.fund_id = f.id and h.units > 0) as holders,
      (select coalesce(sum(value),0) from holdings_view h where h.fund_id = f.id) as value,
      current_date - f.price_on as price_age_days,
      (select count(*) from transactions t where t.fund_id = f.id and t.status = 'pending') as pending,
      (select coalesce(sum(amount),0) from calls_view c where c.fund = f.name and c.state = 'overdue') as calls_overdue,
      (select max(record_date) from distributions d where d.fund_id = f.id and d.status = 'paid') as last_paid_distribution,
      (select count(*) from compliance_view c where c.fund = f.name) as compliance_items
    from funds f {where} order by f.name`,
};
const fundColumn = { funds: 'f.name', register: 'fund', holders: 'h.fund', transactions: 'f.name', pending: 'f.name', distributions: 'fund',
  calls: 'fund', statements: 'f.name', attention: 'fund', compliance: 'fund', 'tax-residency': 'h.fund', concentration: 'fund', notes: 'f.name', 'fund-review': 'f.name' };

const flag = (args, k) => { const a = args.find((x) => x === '--' + k || x.startsWith('--' + k + '=')); return a === undefined ? undefined : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true; };
function required(v, label) { if (v === undefined || v === null || v === true || String(v).trim() === '') throw Error('Required: ' + label); return String(v); }
function date(v, label = 'date') {
  required(v, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v) throw Error(`Invalid ${label}: ${v} (use YYYY-MM-DD)`);
  return v;
}
function positive(v, label) { required(v, label); if (!/^\d+(\.\d+)?$/.test(String(v)) || Number(v) <= 0) throw Error(`Expected a positive number: ${label}`); return String(v); }

const nameColumn = { funds: 'name', investors: 'name', transactions: 'ref', distributions: 'name', capital_calls: 'name' };
export async function resolve(db, t, q) {
  const col = nameColumn[t];
  if (!col) throw Error('Unknown record type: ' + t);
  required(q, t + ' name or id');
  let rows = await db.query(`select id, ${col} as name from ${t} where id::text = lower($1) or lower(${col}) = lower($1)`, [q]);
  if (!rows.length && t === 'investors') rows = await db.query('select id, name from investors where lower(holder_ref) = lower($1)', [q]);
  if (!rows.length) rows = await db.query(`select id, ${col} as name from ${t} where starts_with(id::text, lower($1)) or position(lower($1) in lower(${col})) > 0 order by ${col}`, [q]);
  if (rows.length !== 1) throw Error(rows.length ? `Ambiguous ${t} "${q}": ${rows.map((r) => r.name).join(', ')}` : `Not found: ${q}`);
  return rows[0].id;
}
async function tx(db, fn) { await db.exec('begin'); try { const r = await fn(); await db.exec('commit'); return r; } catch (e) { await db.exec('rollback'); throw e; } }
const one = async (db, t, id, lock = false) => (await db.query(`select * from ${t} where id = $1${lock ? ' for update' : ''}`, [id]))[0];
const today = async (db) => (await db.query('select current_date::text as d'))[0].d;
async function holding(db, fundId, investorId, asAt = null) {
  const r = await db.query(`select coalesce(sum(units),0)::text as units from transactions where fund_id = $1 and investor_id = $2 and status = 'settled' and ($3::date is null or settled_on <= $3::date)`, [fundId, investorId, asAt]);
  return r[0].units;
}
async function nextRef(db, fund, kind) {
  const prefix = `${fund.name}-${kind}-`;
  const r = await db.query(`select count(*)::int as n from transactions where ref like $1`, [prefix + '%']);
  return prefix + String(r[0].n + 1).padStart(3, '0');
}
function writeFile(dir, name, body) {
  const base = path.resolve(process.env.OUTPUT_DIR || REPO_ROOT, dir);
  fs.mkdirSync(base, { recursive: true });
  const file = path.join(base, name);
  fs.writeFileSync(file, body);
  return file;
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export function format(rows) {
  if (!Array.isArray(rows)) return JSON.stringify(rows, null, 2);
  if (!rows.length) return 'No records.';
  const keys = Object.keys(rows[0]);
  const str = (v, k = '') => (/units/.test(k) && typeof v === 'string' && /^-?\d+\.\d+$/.test(v) ? v.replace(/\.?0+$/, '') : v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  const w = keys.map((k) => Math.max(k.length, ...rows.map((r) => str(r[k], k).length)));
  return [keys.map((k, i) => k.padEnd(w[i])).join('  '), w.map((n) => '-'.repeat(n)).join('  '),
    ...rows.map((r) => keys.map((k, i) => str(r[k], k).padEnd(w[i])).join('  '))].join('\n');
}

export const syntax = [
  ...Object.keys(reads).map((k) => `${k} [--fund=name]`),
  'holder <name|ref>', 'fund <name>',
  'add <funds|investors> --data=file.json', 'set <funds|investors> <name> --data=file.json',
  'apply --fund=name --holder=name (--amount=N | --units=N) [--ref=X] [--received=YYYY-MM-DD]',
  'receive <ref> --on=YYYY-MM-DD', 'settle <ref> --on=YYYY-MM-DD', 'cancel <ref>',
  'redeem --fund=name --holder=name (--units=N | --all) --on=YYYY-MM-DD [--price=N]',
  'transfer --fund=name --from=name --to=name --units=N --on=YYYY-MM-DD',
  'price --fund=name --price=N --on=YYYY-MM-DD',
  'distribute --fund=name --cents=N --record-date=YYYY-MM-DD --payment-date=YYYY-MM-DD [--name=X]',
  'distribution <name>', 'approve-distribution <name> --by=person', 'distribution-paid <name> --on=YYYY-MM-DD',
  'call --fund=name --cents=N --due=YYYY-MM-DD [--name=X]', 'call-paid <call> --holder=name --on=YYYY-MM-DD',
  'statement-run --fund=name --kind=periodic|exit', 'statement-issued --fund=name --kind=periodic|exit --on=YYYY-MM-DD [--holder=name]',
  'log --holder=name --note=text [--fund=name]',
  'draft-distribution-notice <distribution>', 'draft-call-reminder <call>', 'draft-holder-letter <holder> --about=text',
  'import registry-direct <all-holdings.csv> [--as-at=YYYY-MM-DD] [--dry-run]',
  'import registry-direct-history <transactions.csv> --fund=name --holder=name [--dry-run]',
  'export', 'help',
];

export async function run(db, args) {
  const [cmd, ...rest] = args;
  const f = (k) => flag(rest, k);
  if (!cmd || cmd === 'help') return syntax.map((command) => ({ command }));

  if (reads[cmd]) {
    let sql = reads[cmd], params = [];
    const fund = f('fund');
    if (fund) {
      const id = await resolve(db, 'funds', fund);
      const name = (await one(db, 'funds', id)).name;
      params = [name];
      if (cmd === 'kyc-due') sql = sql.replace('{andFund}', 'and f.name = $1');
      else { sql = sql.replace('{where}', `where ${fundColumn[cmd]} = $1`).replace('{and}', 'and'); }
    }
    sql = sql.replace('{where}', '').replace('{and}', 'where').replace('{andFund}', '');
    return db.query(sql, params);
  }

  if (cmd === 'holder') {
    const id = await resolve(db, 'investors', rest[0]);
    return {
      holder: await one(db, 'investors', id),
      holdings: await db.query('select fund, units, value, currency, entered_on, last_movement_on from holdings_view where investor_id = $1 order by fund', [id]),
      transactions: await db.query(`select t.ref, f.name as fund, t.kind, t.units, t.price, t.amount, t.status, t.settled_on from transactions t join funds f on f.id = t.fund_id where t.investor_id = $1 order by t.settled_on nulls last`, [id]),
      distributions: await db.query(`select d.name, d.record_date, l.units, l.gross, l.withholding, l.net, d.status from distribution_lines l join distributions d on d.id = l.distribution_id where l.investor_id = $1 order by d.record_date`, [id]),
      notes: await db.query('select recorded_on, note from notes where investor_id = $1 order by recorded_on desc', [id]),
    };
  }
  if (cmd === 'fund') {
    const id = await resolve(db, 'funds', rest[0]);
    const fund = await one(db, 'funds', id);
    return {
      fund,
      register: await db.query('select holder, units, pct_of_fund, value from register_view where fund = $1 order by units desc', [fund.name]),
      distributions: await db.query('select * from distribution_view where fund = $1 order by record_date desc', [fund.name]),
      compliance: await db.query('select rule, reference, detail, due_on from compliance_view where fund = $1', [fund.name]),
    };
  }

  if (cmd === 'add' || cmd === 'set') {
    const t = rest[0];
    if (!fields[t]) throw Error('Supported record types: funds, investors');
    const data = JSON.parse(fs.readFileSync(required(f('data'), '--data'), 'utf8'));
    if (!data || Array.isArray(data) || typeof data !== 'object') throw Error('Expected one JSON object');
    const keys = Object.keys(data);
    if (!keys.length || keys.some((k) => !fields[t].includes(k))) throw Error(`Unsupported or empty fields. Allowed: ${fields[t].join(', ')}`);
    for (const k of keys) if (/_on$|_review$/.test(k) && data[k] !== null) date(data[k], k);
    if (cmd === 'add') return db.query(`insert into ${t} (${keys.join(',')}) values (${keys.map((_, i) => '$' + (i + 1)).join(',')}) returning *`, keys.map((k) => data[k]));
    const id = await resolve(db, t, rest[1]);
    return db.query(`update ${t} set ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} where id = $${keys.length + 1} returning *`, [...keys.map((k) => data[k]), id]);
  }

  if (cmd === 'apply') return tx(db, async () => {
    const fund = await one(db, 'funds', await resolve(db, 'funds', f('fund')));
    const investorId = await resolve(db, 'investors', f('holder'));
    if (fund.status !== 'open') throw Error(`${fund.name} is ${fund.status}: no new applications`);
    if (!fund.unit_price) throw Error(`${fund.name} has no unit price. Run price first.`);
    let units, amount;
    if (f('units')) { units = positive(f('units'), '--units'); amount = (await db.query('select round($1::numeric * $2::numeric, 2)::text as a', [units, fund.unit_price]))[0].a; }
    else { amount = positive(f('amount'), '--amount or --units'); units = (await db.query('select trunc($1::numeric / $2::numeric, 4)::text as u', [amount, fund.unit_price]))[0].u; }
    const received = f('received') ? date(f('received'), '--received') : null;
    const ref = f('ref') ? required(f('ref'), '--ref') : await nextRef(db, fund, 'APP');
    return db.query(`insert into transactions (ref, fund_id, investor_id, kind, units, price, amount, received_on, note)
      values ($1,$2,$3,'application',$4,$5,$6,$7,'Application lodged') returning ref, kind, units, price, amount, status, received_on`, [ref, fund.id, investorId, units, fund.unit_price, amount, received]);
  });

  if (cmd === 'receive') return tx(db, async () => {
    const id = await resolve(db, 'transactions', rest[0]);
    const t = await one(db, 'transactions', id, true);
    if (t.kind !== 'application' || t.status !== 'pending') throw Error('Only a pending application can record money received');
    return db.query('update transactions set received_on = $1 where id = $2 returning ref, status, received_on', [date(f('on'), '--on'), id]);
  });

  if (cmd === 'settle') return tx(db, async () => {
    const id = await resolve(db, 'transactions', rest[0]);
    const t = await one(db, 'transactions', id, true);
    if (t.status !== 'pending') throw Error(`${t.ref} is ${t.status}`);
    const inv = await one(db, 'investors', t.investor_id);
    if (inv.aml_status !== 'verified') throw Error(`Held: ${inv.name} identity is ${inv.aml_status}. Units are not issued before customer due diligence (docs/compliance.md).`);
    if (t.kind === 'application' && !t.received_on) throw Error(`Held: no application money recorded for ${t.ref}. Run receive first.`);
    const on = date(f('on'), '--on');
    if (t.received_on && on < String(t.received_on)) throw Error('Settlement date is before the money was received');
    return db.query(`update transactions set status = 'settled', settled_on = $1 where id = $2 returning ref, kind, units, status, settled_on`, [on, id]);
  });

  if (cmd === 'cancel') return tx(db, async () => {
    const id = await resolve(db, 'transactions', rest[0]);
    const t = await one(db, 'transactions', id, true);
    if (t.status !== 'pending') throw Error(`Only pending transactions can be cancelled. ${t.ref} is ${t.status}; record a reversing adjustment instead.`);
    return db.query(`update transactions set status = 'cancelled' where id = $1 returning ref, status`, [id]);
  });

  if (cmd === 'redeem') return tx(db, async () => {
    const fund = await one(db, 'funds', await resolve(db, 'funds', f('fund')), true);
    const investorId = await resolve(db, 'investors', f('holder'));
    const held = await holding(db, fund.id, investorId);
    const units = f('all') ? held : positive(f('units'), '--units or --all');
    if (Number(held) <= 0) throw Error('No units held');
    if ((await db.query('select $1::numeric > $2::numeric as over', [units, held]))[0].over) throw Error(`Cannot redeem ${units}: ${held} units held`);
    const price = f('price') ? positive(f('price'), '--price') : fund.unit_price;
    if (!price) throw Error('No redemption price. Pass --price or run price first.');
    const on = date(f('on'), '--on');
    const ref = await nextRef(db, fund, 'RED');
    return db.query(`insert into transactions (ref, fund_id, investor_id, kind, units, price, amount, status, settled_on, note)
      values ($1,$2,$3,'redemption',-$4::numeric,$5,round($4::numeric * $5::numeric, 2),'settled',$6,$7) returning ref, units, price, amount, settled_on`,
      [ref, fund.id, investorId, units, price, on, units === held ? 'Full redemption' : 'Partial redemption']);
  });

  if (cmd === 'transfer') return tx(db, async () => {
    const fund = await one(db, 'funds', await resolve(db, 'funds', f('fund')), true);
    const from = await resolve(db, 'investors', f('from')), to = await resolve(db, 'investors', f('to'));
    if (from === to) throw Error('Transfer needs two different holders');
    const units = positive(f('units'), '--units'), on = date(f('on'), '--on');
    const held = await holding(db, fund.id, from);
    if ((await db.query('select $1::numeric > $2::numeric as over', [units, held]))[0].over) throw Error(`Cannot transfer ${units}: ${held} units held`);
    const buyer = await one(db, 'investors', to);
    if (buyer.aml_status !== 'verified') throw Error(`Held: ${buyer.name} identity is ${buyer.aml_status}. Verify before registering the transfer.`);
    const ref = await nextRef(db, fund, 'TRF');
    const seller = await one(db, 'investors', from);
    await db.query(`insert into transactions (ref, fund_id, investor_id, kind, units, status, settled_on, note) values ($1,$2,$3,'transfer_out',-$4::numeric,'settled',$5,$6)`, [ref + '-OUT', fund.id, from, units, on, 'Transfer to ' + buyer.name]);
    await db.query(`insert into transactions (ref, fund_id, investor_id, kind, units, status, settled_on, note) values ($1,$2,$3,'transfer_in',$4::numeric,'settled',$5,$6)`, [ref + '-IN', fund.id, to, units, on, 'Transfer from ' + seller.name]);
    return db.query('select ref, kind, units, settled_on, note from transactions where ref like $1 order by ref desc', [ref + '-%']);
  });

  if (cmd === 'price') {
    const id = await resolve(db, 'funds', f('fund'));
    return db.query('update funds set unit_price = $1, price_on = $2 where id = $3 returning name, unit_price, price_on', [positive(f('price'), '--price'), date(f('on'), '--on'), id]);
  }

  if (cmd === 'distribute') return tx(db, async () => {
    const fund = await one(db, 'funds', await resolve(db, 'funds', f('fund')), true);
    const cents = positive(f('cents'), '--cents');
    const record = date(f('record-date'), '--record-date'), pay = date(f('payment-date'), '--payment-date');
    if (pay < record) throw Error('Payment date is before the record date');
    const name = f('name') ? required(f('name'), '--name') : `${fund.name}-DIST-${record}`;
    const existing = (await db.query('select * from distributions where name = $1', [name]))[0];
    if (existing && existing.status !== 'draft') throw Error(`${name} is ${existing.status}: it cannot be recalculated`);
    const missing = await db.query(`select i.name, i.tax_country from transactions t join investors i on i.id = t.investor_id
      where t.fund_id = $1 and t.status = 'settled' and t.settled_on <= $2 and i.tax_country <> $3 and i.withholding_rate is null
      group by i.id having sum(t.units) > 0`, [fund.id, record, fund.jurisdiction]);
    if (missing.length) throw Error(`Held: no withholding rate set for non-resident holders: ${missing.map((m) => `${m.name} (${m.tax_country})`).join(', ')}. Get the rate from the fund accountant and set it on the holder.`);
    let dist;
    if (existing) {
      await db.query('delete from distribution_lines where distribution_id = $1', [existing.id]);
      dist = (await db.query('update distributions set cents_per_unit = $1, record_date = $2, payment_date = $3 where id = $4 returning *', [cents, record, pay, existing.id]))[0];
    } else {
      dist = (await db.query('insert into distributions (name, fund_id, cents_per_unit, record_date, payment_date) values ($1,$2,$3,$4,$5) returning *', [name, fund.id, cents, record, pay]))[0];
    }
    // Withholding: AU fund, AU resident, no TFN or ABN quoted -> 47%. Non-resident -> the rate set on the holder.
    await db.query(`insert into distribution_lines (distribution_id, investor_id, units, gross, withholding_rate, withholding, net, reason)
      select $1, x.investor_id, x.units, x.gross, x.rate, round(x.gross * x.rate / 100, 2), x.gross - round(x.gross * x.rate / 100, 2), x.reason
      from (
        select h.investor_id, h.units, round(h.units * $2::numeric / 100, 2) as gross,
          case when i.tax_country <> $4 then i.withholding_rate
               when $4 = 'AU' and not i.tfn_quoted then 47 else 0 end as rate,
          case when i.tax_country <> $4 then 'Non-resident rate set on holder'
               when $4 = 'AU' and not i.tfn_quoted then 'No TFN or ABN quoted' end as reason
        from (select investor_id, sum(units) as units from transactions where fund_id = $3 and status = 'settled' and settled_on <= $5 group by investor_id having sum(units) > 0) h
        join investors i on i.id = h.investor_id
      ) x`, [dist.id, cents, fund.id, fund.jurisdiction, record]);
    return db.query('select * from distribution_view where distribution = $1', [name]);
  });

  if (cmd === 'distribution') {
    const id = await resolve(db, 'distributions', rest[0]);
    return db.query(`select i.name as holder, l.units, l.gross, l.withholding_rate, l.withholding, l.net, l.reason, i.bank_on_file
      from distribution_lines l join investors i on i.id = l.investor_id where l.distribution_id = $1 order by l.units desc`, [id]);
  }
  if (cmd === 'approve-distribution') return tx(db, async () => {
    const id = await resolve(db, 'distributions', rest[0]);
    const lines = await db.query('select count(*)::int as n from distribution_lines where distribution_id = $1', [id]);
    if (!lines[0].n) throw Error('No lines to approve. Run distribute first.');
    const r = await db.query(`update distributions set status = 'approved', approved_by = $1 where id = $2 and status = 'draft' returning name, status, approved_by`, [required(f('by'), '--by'), id]);
    if (!r.length) throw Error('Only a draft distribution can be approved');
    return r;
  });
  if (cmd === 'distribution-paid') return tx(db, async () => {
    const id = await resolve(db, 'distributions', rest[0]);
    const r = await db.query(`update distributions set status = 'paid', paid_on = $1 where id = $2 and status = 'approved' returning name, status, paid_on`, [date(f('on'), '--on'), id]);
    if (!r.length) throw Error('Only an approved distribution can be recorded as paid');
    return r;
  });

  if (cmd === 'call') return tx(db, async () => {
    const fund = await one(db, 'funds', await resolve(db, 'funds', f('fund')), true);
    const cents = positive(f('cents'), '--cents'), due = date(f('due'), '--due');
    const name = f('name') ? required(f('name'), '--name') : `${fund.name}-CALL-${due}`;
    const call = (await db.query('insert into capital_calls (name, fund_id, cents_per_unit, due_on) values ($1,$2,$3,$4) returning *', [name, fund.id, cents, due]))[0];
    await db.query(`insert into capital_call_lines (call_id, investor_id, units, amount)
      select $1, investor_id, units, round(units * $2::numeric / 100, 2) from holdings_view where fund_id = $3 and units > 0`, [call.id, cents, fund.id]);
    return db.query('select * from calls_view where call = $1 order by holder', [name]);
  });
  if (cmd === 'call-paid') return tx(db, async () => {
    const callId = await resolve(db, 'capital_calls', rest[0]);
    const investorId = await resolve(db, 'investors', f('holder'));
    const r = await db.query('update capital_call_lines set paid_on = $1 where call_id = $2 and investor_id = $3 and paid_on is null returning amount, paid_on', [date(f('on'), '--on'), callId, investorId]);
    if (!r.length) throw Error('No unpaid line for that holder on this call');
    return r;
  });

  if (cmd === 'statement-run') return tx(db, async () => {
    const fund = await one(db, 'funds', await resolve(db, 'funds', f('fund')));
    const kind = required(f('kind'), '--kind');
    if (kind === 'periodic') {
      await db.query(`insert into statements (fund_id, investor_id, kind, period_start, period_end)
        select p.fund_id, t.investor_id, 'periodic', p.period_start, p.period_end
        from fund_periods_view p join transactions t on t.fund_id = p.fund_id and t.status = 'settled' and t.settled_on <= p.period_end
        where p.fund_id = $1 group by p.fund_id, t.investor_id, p.period_start, p.period_end having sum(t.units) > 0
        on conflict (fund_id, investor_id, kind, period_end) do nothing`, [fund.id]);
    } else if (kind === 'exit') {
      await db.query(`insert into statements (fund_id, investor_id, kind, period_start, period_end)
        select e.fund_id, e.investor_id, 'exit',
          coalesce((select max(s.period_end) + 1 from statements s where s.fund_id = e.fund_id and s.investor_id = e.investor_id and s.kind = 'periodic' and s.period_end < e.exited_on),
                   (select min(settled_on) from transactions t where t.fund_id = e.fund_id and t.investor_id = e.investor_id and t.status = 'settled')),
          e.exited_on
        from exits_view e where e.fund_id = $1
        on conflict (fund_id, investor_id, kind, period_end) do nothing`, [fund.id]);
    } else throw Error('--kind must be periodic or exit');
    return db.query(`select i.name as holder, s.kind, s.period_start, s.period_end, s.prepared_on, s.issued_on from statements s join investors i on i.id = s.investor_id
      where s.fund_id = $1 and s.kind = $2 and s.issued_on is null order by i.name`, [fund.id, kind]);
  });
  if (cmd === 'statement-issued') return tx(db, async () => {
    const fundId = await resolve(db, 'funds', f('fund'));
    const kind = required(f('kind'), '--kind');
    const holderId = f('holder') ? await resolve(db, 'investors', f('holder')) : null;
    const r = await db.query(`update statements set issued_on = $1 where fund_id = $2 and kind = $3 and issued_on is null and ($4::uuid is null or investor_id = $4::uuid)
      returning period_end, issued_on, (select name from investors where id = investor_id) as holder`, [date(f('on'), '--on'), fundId, kind, holderId]);
    if (!r.length) throw Error('No prepared statements waiting. Run statement-run first.');
    return r;
  });

  if (cmd === 'log') {
    const investorId = await resolve(db, 'investors', f('holder'));
    const fundId = f('fund') ? await resolve(db, 'funds', f('fund')) : null;
    return db.query('insert into notes (investor_id, fund_id, note) values ($1,$2,$3) returning recorded_on, note', [investorId, fundId, required(f('note'), '--note')]);
  }

  if (cmd === 'draft-distribution-notice') {
    const id = await resolve(db, 'distributions', rest[0]);
    const d = (await db.query('select d.*, f.legal_name, f.currency from distributions d join funds f on f.id = d.fund_id where d.id = $1', [id]))[0];
    const lines = await db.query(`select i.name as holder, l.units, l.gross, l.withholding, l.net from distribution_lines l join investors i on i.id = l.investor_id where l.distribution_id = $1 order by i.name`, [id]);
    const body = `# Draft distribution notice: ${d.legal_name}\n\nFor review. Not sent.\n\n${d.legal_name} will pay a distribution of ${d.cents_per_unit} cents per unit to holders on the register at ${d.record_date}, paid on ${d.payment_date} (${d.currency}).\n\nStatus: ${d.status}${d.approved_by ? `, approved by ${d.approved_by}` : ''}.\n\n${format(lines)}\n`;
    return [{ file: writeFile('drafts', `distribution-notice-${slug(d.name)}.md`, body), holders: lines.length }];
  }
  if (cmd === 'draft-call-reminder') {
    const id = await resolve(db, 'capital_calls', rest[0]);
    const c = (await db.query('select c.*, f.legal_name, f.currency from capital_calls c join funds f on f.id = c.fund_id where c.id = $1', [id]))[0];
    const unpaid = await db.query('select holder, amount, due_on, state from calls_view where call = $1 and paid_on is null order by holder', [c.name]);
    const body = `# Draft capital call reminder: ${c.legal_name}\n\nFor review. Not sent. One letter per holder below.\n\n` + unpaid.map((u) =>
      `## ${u.holder}\n\nThe capital call of ${c.cents_per_unit} cents per unit on your units in ${c.legal_name} was due on ${u.due_on}. Our records show ${u.amount} ${c.currency} outstanding. If you have paid in the last few days, thank you; please send the payment reference so we can match it.\n`).join('\n');
    return [{ file: writeFile('drafts', `call-reminder-${slug(c.name)}.md`, body), unpaid: unpaid.length }];
  }
  if (cmd === 'draft-holder-letter') {
    const id = await resolve(db, 'investors', rest[0]);
    const inv = await one(db, 'investors', id);
    const held = await db.query('select fund, units, value, currency from holdings_view where investor_id = $1 and units > 0', [id]);
    const body = `# Draft letter to ${inv.name}\n\nFor review. Not sent.\n\nAbout: ${required(f('about'), '--about')}\n\nTo: ${inv.email || '(no email on file)'}\nAddress: ${inv.address || '(no address on file)'}\n\nCurrent holdings:\n\n${format(held)}\n`;
    return [{ file: writeFile('drafts', `letter-${slug(inv.name)}.md`, body) }];
  }

  if (cmd === 'import') return importRegistryDirect(db, rest, f);

  if (cmd === 'export') {
    const data = { exported_at: new Date().toISOString(), records: {} };
    await db.exec('begin isolation level repeatable read');
    try { for (const t of tables) data.records[t] = await db.query(`select * from ${t} order by id`); await db.exec('commit'); } catch (e) { await db.exec('rollback'); throw e; }
    return [{ file: writeFile('exports', `registry-${Date.now()}.json`, JSON.stringify(data, null, 2) + '\n'), record_types: tables.length }];
  }

  throw Error(`Unknown command: ${cmd}. Run help.`);
}

// Registry Direct: Holders > All holdings > Actions > Export all rows to CSV, and a holder's
// Transactions tab > Export > CSV. Column names follow the Registry Direct help centre.
async function importRegistryDirect(db, rest, f) {
  const source = rest[0];
  const file = required(rest[1], 'CSV file');
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  if (!rows.length) throw Error('Empty export');
  const dry = rest.includes('--dry-run');

  if (source === 'registry-direct') {
    const asAt = f('as-at') ? date(f('as-at'), '--as-at') : await today(db);
    const parsed = rows.map((r, i) => {
      const line = i + 2;
      const holder = required(pick(r, 'Holder'), `row ${line} Holder`).trim();
      const security = required(pick(r, 'Security'), `row ${line} Security`).trim();
      const qty = String(pick(r, 'Quantity')).replace(/,/g, '').trim();
      if (!/^-?\d+(\.\d+)?$/.test(qty)) throw Error(`row ${line}: Quantity "${qty}" is not a number`);
      const first = pick(r, 'First transaction date', 'Date added');
      const tfn = pick(r, 'TFN quoted?');
      return {
        holder, security, units: qty, ref: pick(r, 'HIN/SRN') || null, email: pick(r, 'Email') || null, address: pick(r, 'Address') || null,
        tax_country: (pick(r, 'Tax country for payment', 'Tax declaration country') || 'AU').trim().slice(0, 2).toUpperCase(),
        tfn_quoted: yesNo(tfn), bank: yesNo(pick(r, 'Bank details provided?')), crs: yesNo(pick(r, 'Tax dec submitted')),
        risk: (pick(r, 'AML risk rating') || 'low').trim().toLowerCase(), review: pick(r, 'Next review date') || null,
        verified: /verified|pass|complete/i.test(pick(r, 'Verification')), external: pick(r, 'External ID') || null,
        entered: first && /^\d{4}-\d{2}-\d{2}$/.test(first) ? first : asAt, source: r,
      };
    });
    for (const p of parsed) if (!['low', 'medium', 'high'].includes(p.risk)) p.risk = 'medium';
    const securities = [...new Set(parsed.map((p) => p.security))];
    if (dry) return [{ holdings: parsed.length, holders: new Set(parsed.map((p) => p.holder.toLowerCase())).size, funds: securities.length, as_at: asAt,
      note: 'Preview only. Each holding becomes an opening balance on its first transaction date. Import a holder\'s Transaction History to replace it with the full history.' }];
    return tx(db, async () => {
      let opened = 0;
      for (const s of securities) {
        await db.query(`insert into funds (name, legal_name, source_record) values ($1, $2, $3) on conflict (name) do nothing`,
          [s.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'FUND', s, JSON.stringify({ security: s })]);
      }
      for (const p of parsed) {
        const fundName = p.security.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'FUND';
        const fund = (await db.query('select id from funds where name = $1', [fundName]))[0];
        const inv = (await db.query(`insert into investors (name, holder_ref, email, address, tax_country, tfn_quoted, bank_on_file, crs_self_cert_on,
            aml_status, aml_risk, aml_next_review, external_id, source_record)
          values ($1,$2,$3,$4,$5,$6,$7,case when $8 then $9::date end,$10,$11,$12,$13,$14)
          on conflict (name) do update set holder_ref = coalesce(excluded.holder_ref, investors.holder_ref), email = coalesce(excluded.email, investors.email),
            address = coalesce(excluded.address, investors.address), tax_country = excluded.tax_country, tfn_quoted = excluded.tfn_quoted,
            bank_on_file = excluded.bank_on_file, aml_risk = excluded.aml_risk, aml_next_review = coalesce(excluded.aml_next_review, investors.aml_next_review),
            external_id = coalesce(excluded.external_id, investors.external_id), source_record = excluded.source_record
          returning id`,
          [p.holder, p.ref, p.email, p.address, p.tax_country, p.tfn_quoted, p.bank, p.crs, asAt, p.verified ? 'verified' : 'pending', p.risk,
            p.review && /^\d{4}-\d{2}-\d{2}$/.test(p.review) ? p.review : null, p.external, JSON.stringify(p.source)]))[0];
        if (Number(p.units) === 0) continue;
        const ref = `RD-OPEN-${fundName}-${p.ref || p.holder}`.toUpperCase().replace(/[^A-Z0-9-]+/g, '-');
        const r = await db.query(`insert into transactions (ref, fund_id, investor_id, kind, units, status, settled_on, note, source_record)
          values ($1,$2,$3,'opening',$4,'settled',$5,'Opening balance from Registry Direct',$6) on conflict (ref) do nothing returning id`,
          [ref, fund.id, inv.id, p.units, p.entered, JSON.stringify(p.source)]);
        opened += r.length;
      }
      return [{ holdings: parsed.length, opening_balances_added: opened, funds: securities.length,
        note: 'Set each fund\'s structure, jurisdiction, offer type, currency and unit price before the first distribution. Identity status comes from the Verification column: check it.' }];
    });
  }

  if (source === 'registry-direct-history') {
    const fund = await one(db, 'funds', await resolve(db, 'funds', f('fund')));
    const investorId = await resolve(db, 'investors', f('holder'));
    const kinds = { application: 'application', redemption: 'redemption', 'transfer in': 'transfer_in', 'transfer out': 'transfer_out',
      'distribution allotment': 'reinvestment', 'distribution reinvestment': 'reinvestment', reinvestment: 'reinvestment', adjustment: 'adjustment' };
    const parsed = rows.map((r, i) => {
      const line = i + 2;
      const on = required(pick(r, 'Settlement date'), `row ${line} Settlement date`).trim();
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(on) ? on : (() => { const m = on.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (!m) throw Error(`row ${line}: date "${on}" (use YYYY-MM-DD or DD/MM/YYYY)`); return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; })();
      date(iso, `row ${line} Settlement date`);
      const type = required(pick(r, 'Type'), `row ${line} Type`).trim().toLowerCase();
      const kind = kinds[type];
      if (!kind) throw Error(`row ${line}: transaction type "${type}" is not mapped. Map it by hand or ask Claude Code to extend the import.`);
      let units = String(pick(r, 'Quantity')).replace(/,/g, '').trim();
      if (!/^-?\d+(\.\d+)?$/.test(units) || Number(units) === 0) throw Error(`row ${line}: Quantity "${units}"`);
      if (['redemption', 'transfer_out'].includes(kind) && !units.startsWith('-')) units = '-' + units;
      if (['application', 'transfer_in', 'reinvestment'].includes(kind)) units = units.replace(/^-/, '');
      const price = String(pick(r, 'Price')).replace(/[$,]/g, '').trim() || null;
      const paid = String(pick(r, 'Paid')).replace(/[$,]/g, '').trim() || null;
      return { on: iso, kind, units, price, paid, balance: String(pick(r, 'Balance')).replace(/,/g, '').trim(), source: r };
    }).sort((a, b) => a.on.localeCompare(b.on));
    const total = parsed.reduce((s, p) => s + Number(p.units), 0);
    const last = parsed[parsed.length - 1].balance;
    if (last && Math.abs(Number(last) - total) > 0.00005) throw Error(`History adds to ${total} units but the last Balance is ${last}. Export the full history (all dates) and try again.`);
    if (dry) return [{ transactions: parsed.length, closing_units: total, note: 'Preview only.' }];
    return tx(db, async () => {
      const others = await db.query(`select count(*)::int as n from transactions where fund_id = $1 and investor_id = $2 and kind <> 'opening' and status <> 'cancelled' and ref not like 'RD-HIST-%'`, [fund.id, investorId]);
      if (others[0].n) throw Error('This holder already has transactions recorded here. Import history only before working the register.');
      const opening = await holding(db, fund.id, investorId);
      if (Number(opening) && Math.abs(Number(opening) - total) > 0.00005) throw Error(`Opening balance ${opening} does not match the history total ${total}. Nothing changed.`);
      await db.query(`delete from transactions where fund_id = $1 and investor_id = $2 and (kind = 'opening' or ref like 'RD-HIST-%')`, [fund.id, investorId]);
      const inv = await one(db, 'investors', investorId);
      let n = 0;
      for (const p of parsed) {
        n++;
        await db.query(`insert into transactions (ref, fund_id, investor_id, kind, units, price, amount, status, settled_on, note, source_record)
          values ($1,$2,$3,$4,$5,$6,$7,'settled',$8,'Imported from Registry Direct',$9)`,
          [`RD-HIST-${fund.name}-${(inv.holder_ref || inv.name).toUpperCase().replace(/[^A-Z0-9]+/g, '-')}-${String(n).padStart(4, '0')}`, fund.id, investorId, p.kind, p.units, p.price, p.paid, p.on, JSON.stringify(p.source)]);
      }
      return [{ transactions: n, closing_units: await holding(db, fund.id, investorId) }];
    });
  }
  throw Error('Supported imports: registry-direct, registry-direct-history');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let db;
  try {
    db = await getDb();
    const args = process.argv.slice(2);
    const out = await run(db, args.filter((x) => x !== '--json'));
    if (args.includes('--json')) console.log(JSON.stringify(out, null, 2));
    else if (Array.isArray(out)) console.log(format(out));
    else for (const [k, v] of Object.entries(out)) console.log(`\n${k}\n${format(Array.isArray(v) ? v : [v])}`);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await db?.close();
  }
}
