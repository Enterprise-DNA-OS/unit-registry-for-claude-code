-- Unit Registry for Claude Code: the register of an unlisted fund, unit trust or syndicate.
-- Works on Postgres and PGlite. Units come only from settled transactions, so a holding is
-- always the sum of its history and can be reconstructed at any date.

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table funds (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                      -- short code the operator types, e.g. HARBOURSIDE
  legal_name text not null,
  structure text not null default 'unit_trust' check (structure in ('unit_trust','pie','syndicate','company')),
  jurisdiction text not null default 'AU' check (jurisdiction in ('AU','NZ')),
  offer_type text not null default 'wholesale' check (offer_type in ('retail','wholesale')),
  currency text not null default 'AUD',
  unit_price numeric(18,6),                        -- latest price used for value and applications
  price_on date,
  period_end_month int not null default 6 check (period_end_month between 1 and 12),
  status text not null default 'open' check (status in ('open','closed','winding_up')),
  source_record jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table investors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                       -- registered name of the holding
  holder_ref text unique,                          -- HIN or SRN
  holder_type text not null default 'individual' check (holder_type in ('individual','joint','company','trust','smsf','partnership')),
  email text,
  address text,
  tax_country text not null default 'AU',          -- tax residence for payments
  tfn_quoted boolean not null default false,       -- AU: TFN or ABN quoted (never store the number here)
  pir numeric(4,1) check (pir in (10.5,17.5,28)), -- NZ PIE prescribed investor rate
  withholding_rate numeric(5,2),                   -- non-resident rate set from the fund accountant's advice
  crs_self_cert_on date,                           -- tax residency self-certification received
  aml_status text not null default 'pending' check (aml_status in ('pending','verified','failed')),
  aml_verified_on date,
  aml_risk text not null default 'low' check (aml_risk in ('low','medium','high')),
  aml_next_review date,
  bank_on_file boolean not null default false,
  external_id text,
  source_record jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  fund_id uuid not null references funds(id),
  investor_id uuid not null references investors(id),
  kind text not null check (kind in ('opening','application','redemption','transfer_in','transfer_out','reinvestment','adjustment')),
  units numeric(18,4) not null check (units <> 0),
  price numeric(18,6),
  amount numeric(18,2),
  status text not null default 'pending' check (status in ('pending','settled','cancelled')),
  received_on date,                                -- application money received
  settled_on date,
  note text,
  source_record jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind in ('opening','application','transfer_in','reinvestment') and units > 0)
      or (kind in ('redemption','transfer_out') and units < 0)
      or kind = 'adjustment'),
  check (status <> 'settled' or settled_on is not null)
);
create index transactions_holding on transactions (fund_id, investor_id, settled_on);

create table distributions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  fund_id uuid not null references funds(id),
  cents_per_unit numeric(12,6) not null check (cents_per_unit > 0),
  record_date date not null,
  payment_date date not null,
  status text not null default 'draft' check (status in ('draft','approved','paid')),
  approved_by text,
  paid_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (payment_date >= record_date)
);

create table distribution_lines (
  id uuid primary key default gen_random_uuid(),
  distribution_id uuid not null references distributions(id) on delete cascade,
  investor_id uuid not null references investors(id),
  units numeric(18,4) not null,
  gross numeric(18,2) not null,
  withholding_rate numeric(5,2) not null default 0,
  withholding numeric(18,2) not null default 0,
  net numeric(18,2) not null,
  reason text,
  unique (distribution_id, investor_id)
);

create table capital_calls (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  fund_id uuid not null references funds(id),
  cents_per_unit numeric(12,6) not null check (cents_per_unit > 0),
  due_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table capital_call_lines (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references capital_calls(id) on delete cascade,
  investor_id uuid not null references investors(id),
  units numeric(18,4) not null,
  amount numeric(18,2) not null,
  paid_on date,
  unique (call_id, investor_id)
);

create table statements (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references funds(id),
  investor_id uuid not null references investors(id),
  kind text not null check (kind in ('periodic','exit')),
  period_start date not null,
  period_end date not null,
  prepared_on date not null default current_date,
  issued_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fund_id, investor_id, kind, period_end)
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references investors(id),
  fund_id uuid references funds(id),
  recorded_on date not null default current_date,
  note text not null,
  created_at timestamptz not null default now()
);

create trigger funds_touch before update on funds for each row execute function touch_updated_at();
create trigger investors_touch before update on investors for each row execute function touch_updated_at();
create trigger transactions_touch before update on transactions for each row execute function touch_updated_at();
create trigger distributions_touch before update on distributions for each row execute function touch_updated_at();
create trigger capital_calls_touch before update on capital_calls for each row execute function touch_updated_at();
create trigger statements_touch before update on statements for each row execute function touch_updated_at();

-- Current holdings: settled units only. Nil holdings stay visible for exit statements.
create view holdings_view as
select f.id as fund_id, f.name as fund, i.id as investor_id, i.name as holder, i.holder_ref,
       sum(t.units)::numeric(18,4) as units,
       round(sum(t.units) * coalesce(f.unit_price, 0), 2) as value,
       f.currency,
       min(t.settled_on) as entered_on,
       max(t.settled_on) as last_movement_on
from transactions t
join funds f on f.id = t.fund_id
join investors i on i.id = t.investor_id
where t.status = 'settled'
group by f.id, f.name, f.unit_price, f.currency, i.id, i.name, i.holder_ref;

-- The register itself: who holds what, where they live, when they were entered.
create view register_view as
select h.fund, h.holder, h.holder_ref, i.holder_type, i.address, h.units, h.value, h.currency, h.entered_on,
       round(100 * h.units / nullif(sum(h.units) over (partition by h.fund_id), 0), 2) as pct_of_fund
from holdings_view h join investors i on i.id = h.investor_id
where h.units > 0;

-- Last completed reporting period end for each fund (period_end_month, last day of month).
create view fund_periods_view as
select f.id as fund_id, f.name as fund, p.period_end,
       (p.period_end - interval '1 year' + interval '1 day')::date as period_start,
       (p.period_end + interval '6 months')::date as statements_due_on
from funds f
cross join lateral (
  select case when x.end_this_year <= current_date then x.end_this_year
              else (x.end_this_year - interval '1 year')::date end as period_end
  from (select (make_date(extract(year from current_date)::int, f.period_end_month, 1) + interval '1 month' - interval '1 day')::date as end_this_year) x
) p;

-- Holders who left a fund: nil balance now, and the date they left.
create view exits_view as
select h.fund_id, h.fund, h.investor_id, h.holder, h.last_movement_on as exited_on,
       (h.last_movement_on + interval '6 months')::date as exit_statement_due_on
from holdings_view h
where h.units = 0;

create view distribution_view as
select d.name as distribution, f.name as fund, d.status, d.record_date, d.payment_date, d.cents_per_unit,
       count(l.id) as holders, coalesce(sum(l.units),0) as units, coalesce(sum(l.gross),0) as gross,
       coalesce(sum(l.withholding),0) as withholding, coalesce(sum(l.net),0) as net, f.currency
from distributions d join funds f on f.id = d.fund_id
left join distribution_lines l on l.distribution_id = d.id
group by d.id, d.name, f.name, f.currency;

create view calls_view as
select c.name as call, f.name as fund, c.due_on, i.name as holder, l.units, l.amount, f.currency, l.paid_on,
       case when l.paid_on is not null then 'paid'
            when c.due_on < current_date then 'overdue'
            else 'open' end as state
from capital_call_lines l
join capital_calls c on c.id = l.call_id
join funds f on f.id = c.fund_id
join investors i on i.id = l.investor_id;

-- What needs a person this week. One row per problem, oldest first within each issue.
create view attention_view as
select 'Application waiting to settle' as issue, f.name as fund, t.ref as reference,
       i.name || ': ' || trim_scale(t.units) || ' units, ' || case when i.aml_status <> 'verified' then 'identity not verified' when t.received_on is null then 'money not received' else 'ready to settle' end as detail,
       t.created_at::date as since
from transactions t join funds f on f.id = t.fund_id join investors i on i.id = t.investor_id
where t.status = 'pending' and t.kind = 'application'
union all
select 'Capital call unpaid', fund, call, holder || ': ' || amount || ' ' || currency, due_on
from calls_view where state = 'overdue'
union all
select 'Distribution not approved by payment date', f.name, d.name, d.status, d.payment_date
from distributions d join funds f on f.id = d.fund_id
where d.status = 'draft' and d.payment_date <= current_date
union all
select 'Unit price older than 3 months', name, name, coalesce(price_on::text, 'never priced'), price_on
from funds where status = 'open' and (price_on is null or price_on < current_date - 92)
union all
select 'Identity review overdue', h.fund, h.holder, i.aml_risk || ' risk, review was due ' || i.aml_next_review, i.aml_next_review
from holdings_view h join investors i on i.id = h.investor_id
where h.units > 0 and i.aml_next_review < current_date
union all
select 'No contact on file', h.fund, h.holder, 'no email and no address', h.entered_on
from holdings_view h join investors i on i.id = h.investor_id
where h.units > 0 and coalesce(i.email,'') = '' and coalesce(i.address,'') = ''
union all
select 'No bank account for distributions', h.fund, h.holder, trim_scale(h.units) || ' units', h.entered_on
from holdings_view h join investors i on i.id = h.investor_id
where h.units > 0 and not i.bank_on_file;

-- The rules in docs/compliance.md, each as rows. due_on is the statutory or policy date.
create view compliance_view as
select 'AU-AMLCTF-CDD' as rule, h.fund, h.holder as reference,
       'holds units with identity ' || i.aml_status as detail, h.entered_on as due_on
from holdings_view h join investors i on i.id = h.investor_id join funds f on f.id = h.fund_id
where h.units > 0 and i.aml_status <> 'verified' and f.jurisdiction = 'AU'
union all
select 'NZ-AMLCFT-CDD', h.fund, h.holder, 'holds units with identity ' || i.aml_status, h.entered_on
from holdings_view h join investors i on i.id = h.investor_id join funds f on f.id = h.fund_id
where h.units > 0 and i.aml_status <> 'verified' and f.jurisdiction = 'NZ'
union all
select 'AML-ONGOING-REVIEW', h.fund, h.holder, i.aml_risk || ' risk review overdue', i.aml_next_review
from holdings_view h join investors i on i.id = h.investor_id
where h.units > 0 and i.aml_next_review < current_date
union all
select 'AU-TFN-WITHHOLDING', h.fund, h.holder, 'no TFN or ABN quoted: withhold 47% at the next distribution', null::date
from holdings_view h join investors i on i.id = h.investor_id join funds f on f.id = h.fund_id
where h.units > 0 and f.jurisdiction = 'AU' and i.tax_country = 'AU' and not i.tfn_quoted
union all
select 'NZ-PIE-PIR', h.fund, h.holder, 'no prescribed investor rate: taxed at the 28% default', null::date
from holdings_view h join investors i on i.id = h.investor_id join funds f on f.id = h.fund_id
where h.units > 0 and f.structure = 'pie' and i.tax_country = 'NZ' and i.pir is null
union all
select 'CRS-SELF-CERT', h.fund, h.holder, 'tax resident in ' || i.tax_country || ' with no self-certification on file', null::date
from holdings_view h join investors i on i.id = h.investor_id join funds f on f.id = h.fund_id
where h.units > 0 and i.tax_country <> f.jurisdiction and i.crs_self_cert_on is null
union all
select 'NON-RESIDENT-RATE', h.fund, h.holder, 'tax resident in ' || i.tax_country || ' with no withholding rate set', null::date
from holdings_view h join investors i on i.id = h.investor_id join funds f on f.id = h.fund_id
where h.units > 0 and i.tax_country <> f.jurisdiction and i.withholding_rate is null
union all
select 'AU-CA-1017D-PERIODIC', p.fund, i.name, 'periodic statement for the period ending ' || p.period_end || ' not issued', p.statements_due_on
from fund_periods_view p
join funds f on f.id = p.fund_id
join investors i on exists (
  select 1 from transactions t where t.fund_id = p.fund_id and t.investor_id = i.id and t.status = 'settled' and t.settled_on <= p.period_end)
where f.jurisdiction = 'AU' and f.offer_type = 'retail'
  and (select coalesce(sum(units),0) from transactions t where t.fund_id = p.fund_id and t.investor_id = i.id and t.status = 'settled' and t.settled_on <= p.period_end) > 0
  and not exists (select 1 from statements s where s.fund_id = p.fund_id and s.investor_id = i.id and s.kind = 'periodic' and s.period_end = p.period_end and s.issued_on is not null)
union all
select 'AU-CA-1017D-EXIT', e.fund, e.holder, 'left on ' || e.exited_on || ', exit statement not issued', e.exit_statement_due_on
from exits_view e join funds f on f.id = e.fund_id
where f.jurisdiction = 'AU' and f.offer_type = 'retail'
  and not exists (select 1 from statements s where s.fund_id = e.fund_id and s.investor_id = e.investor_id and s.kind = 'exit' and s.issued_on is not null)
union all
select 'CA-169-REGISTER', h.fund, h.holder, 'register entry has no address', null::date
from holdings_view h join investors i on i.id = h.investor_id
where h.units > 0 and coalesce(i.address,'') = '';
