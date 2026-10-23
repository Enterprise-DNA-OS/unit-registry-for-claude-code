-- Demo register: three fictional funds, eleven fictional holders. Dates move with today so the
-- overdue, stale and missing rows always have something to say. Safe to run more than once:
-- every insert skips rows that already exist, so your own writes survive a re-seed.

insert into funds (id, name, legal_name, structure, jurisdiction, offer_type, currency, unit_price, price_on, period_end_month) values
 ('00000000-0000-4000-8000-000000000001','HARBOURSIDE','Harbourside Property Trust','unit_trust','AU','retail','AUD',1.085000,current_date-40,6),
 ('00000000-0000-4000-8000-000000000002','KAURI','Kauri Income Fund','pie','NZ','wholesale','NZD',1.412300,current_date-130,3),
 ('00000000-0000-4000-8000-000000000003','PARNELL','Parnell Childcare Syndicate','syndicate','NZ','wholesale','NZD',1.000000,current_date-20,3)
on conflict (id) do nothing;

insert into investors (id, name, holder_ref, holder_type, email, address, tax_country, tfn_quoted, pir, withholding_rate, crs_self_cert_on, aml_status, aml_verified_on, aml_risk, aml_next_review, bank_on_file) values
 ('00000000-0000-4000-8000-000000000101','J & K Whitford','X0001001','joint','whitford@example.com','14 Bay Road, Manly NSW 2095','AU',true,null,null,null,'verified',current_date-760,'low',current_date+300,true),
 ('00000000-0000-4000-8000-000000000102','Coastline Super Fund','X0001002','smsf','trustee@coastline.example','PO Box 88, Newcastle NSW 2300','AU',true,null,null,null,'verified',current_date-740,'low',current_date+200,true),
 ('00000000-0000-4000-8000-000000000103','Priya Raman','X0001003','individual','priya@example.com','3/9 Hill Street, Brunswick VIC 3056','AU',false,null,null,null,'verified',current_date-700,'low',current_date+400,true),
 ('00000000-0000-4000-8000-000000000104','Lachlan Doyle','X0001004','individual','lachlan@example.com','22 River Terrace, Kangaroo Point QLD 4169','AU',true,null,null,null,'verified',current_date-720,'low',current_date+100,true),
 ('00000000-0000-4000-8000-000000000105','Hartley Holdings Pty Ltd','X0001005','company','accounts@hartley.example','Level 4, 100 King Street, Sydney NSW 2000','AU',true,null,null,null,'verified',current_date-690,'high',current_date-35,true),
 ('00000000-0000-4000-8000-000000000106','Sofia Marchetti','X0001006','individual','sofia@example.it','Via Roma 12, Milano 20121, Italy','IT',false,null,null,null,'verified',current_date-650,'medium',current_date+60,false),
 ('00000000-0000-4000-8000-000000000107','Ben Okafor','X0001007','individual','ben.okafor@example.com','5 Ocean Parade, Coogee NSW 2034','AU',true,null,null,null,'pending',null,'low',null,false),
 ('00000000-0000-4000-8000-000000000108','Aroha Ngata','N0002001','individual','aroha@example.co.nz','17 Ponsonby Road, Auckland 1011','NZ',false,17.5,null,null,'verified',current_date-500,'low',current_date+500,true),
 ('00000000-0000-4000-8000-000000000109','Te Awa Family Trust','N0002002','trust','teawa@example.co.nz','RD 2, Cambridge 3494','NZ',false,null,null,null,'verified',current_date-480,'medium',current_date+90,true),
 ('00000000-0000-4000-8000-000000000110','Grant Liu','N0002003','individual','','','NZ',false,28,null,null,'verified',current_date-470,'low',current_date+300,true),
 ('00000000-0000-4000-8000-000000000111','Whitcombe Ltd','N0002004','company','office@whitcombe.example.nz','8 Customs Street, Auckland 1010','NZ',false,null,null,null,'verified',current_date-300,'low',current_date+400,true)
on conflict (id) do nothing;

insert into transactions (id, ref, fund_id, investor_id, kind, units, price, amount, status, received_on, settled_on, note) values
 ('00000000-0000-4000-8000-000000001001','HPT-APP-001','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','application',150000,1.000000,150000.00,'settled',current_date-752,current_date-750,'Initial offer'),
 ('00000000-0000-4000-8000-000000001002','HPT-APP-002','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000102','application',250000,1.000000,250000.00,'settled',current_date-752,current_date-750,'Initial offer'),
 ('00000000-0000-4000-8000-000000001003','HPT-APP-003','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000103','application',40000,1.000000,40000.00,'settled',current_date-702,current_date-700,null),
 ('00000000-0000-4000-8000-000000001004','HPT-APP-004','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000104','application',60000,1.000000,60000.00,'settled',current_date-722,current_date-720,null),
 ('00000000-0000-4000-8000-000000001005','HPT-RED-001','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000104','redemption',-60000,1.070000,64200.00,'settled',null,current_date-62,'Full redemption, moving interstate'),
 ('00000000-0000-4000-8000-000000001006','HPT-APP-005','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000105','application',300000,1.000000,300000.00,'settled',current_date-692,current_date-690,null),
 ('00000000-0000-4000-8000-000000001007','HPT-APP-006','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000106','application',80000,1.020000,81600.00,'settled',current_date-652,current_date-650,null),
 ('00000000-0000-4000-8000-000000001008','HPT-TRF-001-OUT','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','transfer_out',-25000,null,null,'settled',null,current_date-300,'Off-market transfer to Coastline Super Fund'),
 ('00000000-0000-4000-8000-000000001009','HPT-TRF-001-IN','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000102','transfer_in',25000,null,null,'settled',null,current_date-300,'Off-market transfer from J & K Whitford'),
 ('00000000-0000-4000-8000-000000001010','HPT-APP-007','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000107','application',20000,1.085000,21700.00,'pending',null,null,'Application form received, identity check outstanding'),
 ('00000000-0000-4000-8000-000000001011','KIF-APP-001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000108','application',35000,1.380000,48300.00,'settled',current_date-505,current_date-500,null),
 ('00000000-0000-4000-8000-000000001012','KIF-APP-002','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000109','application',120000,1.380000,165600.00,'settled',current_date-485,current_date-480,null),
 ('00000000-0000-4000-8000-000000001013','KIF-APP-003','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000110','application',50000,1.390000,69500.00,'settled',current_date-472,current_date-470,null),
 ('00000000-0000-4000-8000-000000001014','PCS-APP-001','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000108','application',100000,1.000000,100000.00,'settled',current_date-302,current_date-300,'Syndicate close'),
 ('00000000-0000-4000-8000-000000001015','PCS-APP-002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000110','application',150000,1.000000,150000.00,'settled',current_date-302,current_date-300,'Syndicate close'),
 ('00000000-0000-4000-8000-000000001016','PCS-APP-003','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000111','application',250000,1.000000,250000.00,'settled',current_date-302,current_date-300,'Syndicate close')
on conflict (id) do nothing;

-- Last quarter's distribution, paid. Priya Raman has no TFN quoted, so 47% was withheld.
insert into distributions (id, name, fund_id, cents_per_unit, record_date, payment_date, status, approved_by, paid_on) values
 ('00000000-0000-4000-8000-000000002001','HPT-DIST-PRIOR','00000000-0000-4000-8000-000000000001',1.750000,current_date-100,current_date-85,'paid','Fund Accountant',current_date-85),
 ('00000000-0000-4000-8000-000000002002','HPT-DIST-LATEST','00000000-0000-4000-8000-000000000001',1.800000,current_date-12,current_date-2,'draft',null,null)
on conflict (id) do nothing;

insert into distribution_lines (distribution_id, investor_id, units, gross, withholding_rate, withholding, net, reason)
select d.id, h.investor_id, h.units, round(h.units * d.cents_per_unit / 100, 2),
       case when i.tax_country = 'AU' and not i.tfn_quoted then 47 else coalesce(case when i.tax_country <> 'AU' then i.withholding_rate end, 0) end,
       round(round(h.units * d.cents_per_unit / 100, 2) * case when i.tax_country = 'AU' and not i.tfn_quoted then 47 else coalesce(case when i.tax_country <> 'AU' then i.withholding_rate end, 0) end / 100, 2),
       round(h.units * d.cents_per_unit / 100, 2) - round(round(h.units * d.cents_per_unit / 100, 2) * case when i.tax_country = 'AU' and not i.tfn_quoted then 47 else coalesce(case when i.tax_country <> 'AU' then i.withholding_rate end, 0) end / 100, 2),
       case when i.tax_country = 'AU' and not i.tfn_quoted then 'No TFN or ABN quoted' end
from distributions d
cross join lateral (
  select t.investor_id, sum(t.units) as units from transactions t
  where t.fund_id = d.fund_id and t.status = 'settled' and t.settled_on <= d.record_date
  group by t.investor_id having sum(t.units) > 0
) h
join investors i on i.id = h.investor_id
where d.id = '00000000-0000-4000-8000-000000002001'
on conflict (distribution_id, investor_id) do nothing;

-- Parnell called 10 cents a unit for the building fit-out. Whitcombe has not paid.
insert into capital_calls (id, name, fund_id, cents_per_unit, due_on) values
 ('00000000-0000-4000-8000-000000003001','PCS-CALL-01','00000000-0000-4000-8000-000000000003',10,current_date-10)
on conflict (id) do nothing;
insert into capital_call_lines (call_id, investor_id, units, amount, paid_on) values
 ('00000000-0000-4000-8000-000000003001','00000000-0000-4000-8000-000000000108',100000,10000.00,current_date-14),
 ('00000000-0000-4000-8000-000000003001','00000000-0000-4000-8000-000000000110',150000,15000.00,current_date-11),
 ('00000000-0000-4000-8000-000000003001','00000000-0000-4000-8000-000000000111',250000,25000.00,null)
on conflict (call_id, investor_id) do nothing;

-- Periodic statements for Harbourside's last period: two issued, the rest still to go.
insert into statements (fund_id, investor_id, kind, period_start, period_end, prepared_on, issued_on)
select p.fund_id, i.id, 'periodic', p.period_start, p.period_end, least(p.period_end + 30, current_date), least(p.period_end + 45, current_date)
from fund_periods_view p cross join investors i
where p.fund = 'HARBOURSIDE' and i.name in ('J & K Whitford','Coastline Super Fund')
on conflict (fund_id, investor_id, kind, period_end) do nothing;

insert into notes (id, investor_id, fund_id, recorded_on, note) values
 ('00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000000105','00000000-0000-4000-8000-000000000001',current_date-40,'Asked for the 12-month return before topping up. Waiting on the June valuation.'),
 ('00000000-0000-4000-8000-000000004002','00000000-0000-4000-8000-000000000111','00000000-0000-4000-8000-000000000003',current_date-5,'Finance manager on leave, call payment promised on return.')
on conflict (id) do nothing;
