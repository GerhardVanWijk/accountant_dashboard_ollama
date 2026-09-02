-- september_2026_rollback.sql  — GENERATED. Removes EXACTLY the 0044 seed batch and restores the
-- pre-write fingerprint.  FAIL-CLOSED: a guard block ABORTS unless the exact post-seed state is present
-- (so a second run aborts; later JEs / stock activity / a drifted counter all abort).  All restores are
-- ABSOLUTE (idempotent), never deltas.  Company-scoped throughout.  Touches no August/golden history,
-- no schema_migrations, no migration 0043.  The August ON-AUG-2026 fixture is NOT modified.
BEGIN;

-- ── guard: abort unless the exact 0044 post-seed fingerprint is present ──
do $$
declare v_je int; v_ctr int; v_late int; v_inv numeric; v_gl1200 numeric; v_mov int; v_recn int; v_stmt int; v_link int;
begin
  select count(*) into v_je from journal_entries where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-d0%';
  select next_value into v_ctr from journal_number_counters where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01';
  if v_je = 0 and v_ctr = 4101 then raise exception 'ROLLBACK ABORT: batch 0044 not present (0 seed JEs, counter already 4101) — nothing to roll back'; end if;
  if v_je <> 73 then raise exception 'ROLLBACK ABORT: expected 73 seed journal_entries, found %', v_je; end if;
  if v_ctr <> 4174 then raise exception 'ROLLBACK ABORT: journal_number_counters.next_value expected 4174, found %', v_ctr; end if;
  select count(*) into v_late from journal_entries where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and entry_number ~ '^JE-[0-9]+$' and (regexp_replace(entry_number,'\D','','g'))::int > 4173;
  if v_late <> 0 then raise exception 'ROLLBACK ABORT: % journal entries numbered above JE-4173 exist — resolve manually; will not blind-reset the counter', v_late; end if;
  select round(coalesce(sum(quantity_on_hand*cost_price),0),2) into v_inv from products where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and track_inventory;
  if v_inv <> 1478853.74 then raise exception 'ROLLBACK ABORT: inventory valuation expected 1478853.74 (post-seed), found % — later stock activity; not overwriting products/stock_balances', v_inv; end if;
  select round(coalesce(sum(jl.debit-jl.credit),0),2) into v_gl1200 from journal_lines jl join journal_entries j on j.id=jl.journal_entry_id join accounts a on a.id=jl.account_id where j.company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and a.code='1200';
  if v_gl1200 <> 1478853.74 then raise exception 'ROLLBACK ABORT: GL 1200 expected 1478853.74, found %', v_gl1200; end if;
  select count(*) into v_mov from stock_movements where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-e0%';
  if v_mov <> 59 then raise exception 'ROLLBACK ABORT: expected 59 seed stock_movements, found %', v_mov; end if;
  select count(*) into v_recn from reconciliations where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-f3%';
  if v_recn <> 1 then raise exception 'ROLLBACK ABORT: expected 1 seed reconciliations row, found %', v_recn; end if;
  select count(*) into v_stmt from bank_statements where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and reference='ON-SEP-2026';
  if v_stmt <> 1 then raise exception 'ROLLBACK ABORT: ON-SEP-2026 statement not found (count %)', v_stmt; end if;
  select count(*) into v_link from bank_transactions where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id in ('4acd5c92-f515-4beb-94ae-57fb8223d7a0','7f9d173c-b1ab-4d1c-99a7-a375f5f411a2') and status='reconciled' and reconciliation_id::text like '5eed0000-0000-4000-8000-f3%';
  if v_link <> 2 then raise exception 'ROLLBACK ABORT: PAY-2004/REC-1001 not in expected post-seed linked state (count %)', v_link; end if;
  raise notice 'ROLLBACK pre-flight OK — 0044 batch present and unchanged; proceeding.';
end $$;

-- ── 1. un-link the 7 pre-existing September bank_transactions (restore their exact pre-seed state) ──
update bank_transactions set status='unreconciled', bank_statement_line_id=null, reconciliation_id=null, updated_at=now()
  where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id in ('4acd5c92-f515-4beb-94ae-57fb8223d7a0','7f9d173c-b1ab-4d1c-99a7-a375f5f411a2');   -- C2a/C2b: back to unreconciled (their pre-seed status)
update bank_transactions set bank_statement_line_id=null, reconciliation_id=null, updated_at=now()
  where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id in ('17f0ff1f-35b3-4be1-997d-d7ab7a4b4049','6104af71-1d84-4346-ba4a-a5d60a8ec158','3d818821-a022-426f-b943-430a6575135e','ac1b86de-409d-4a79-9ad3-3ebfea24deda','d5b46c1f-fe9e-4e90-9385-aeb1ac0dfd4e');   -- REC-1008/1009/1027: stay 'reconciled', drop the seed links

-- ── 2. break cross-link / back-ref FK cycles on the seed rows before deleting ──
update purchase_orders set bill_id = null where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-60%';
update fixed_assets set source_bill_id = null, journal_entry_id = null, disposal_journal_entry_id = null where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-08%';
update bank_statement_lines set matched_bank_transaction_id = null where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-f1%';

-- ── 3. delete the seed batch (shared FK-safe topological order; journal_entries LAST) ──
delete from bank_transactions     where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-f2%';
delete from bank_statement_lines  where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-f1%';
delete from reconciliations       where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-f3%';
delete from bank_statements       where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-f0%';
delete from inventory_transaction_log where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-0a%';
delete from stock_movements       where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-e0%';
delete from depreciation_entries  where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-09%';
delete from credit_note_lines     where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-41%';
delete from credit_notes          where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-40%';
delete from supplier_return_lines where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-81%';
delete from supplier_returns      where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-80%';
delete from invoice_lines         where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-31%';
delete from invoices              where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-30%';
delete from bill_lines            where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-71%';
delete from bills                 where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-70%';
delete from purchase_order_lines  where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-61%';
delete from purchase_orders       where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-60%';
delete from sales_orders          where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-20%';
delete from quotes                where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-10%';
delete from customer_receipts     where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-50%';
delete from payments              where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-90%';
delete from stock_adjustment_lines where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-a1%';
delete from stock_adjustments     where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-a0%';
delete from stock_take_lines      where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-b1%';
delete from stock_takes           where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-b0%';
delete from stock_transfer_lines  where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-c1%';
delete from stock_transfers       where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-c0%';
delete from fixed_assets          where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-08%';
delete from journal_lines where journal_entry_id in (select id from journal_entries where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-d0%');
delete from journal_entries       where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-d0%';
delete from stock_balances where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and warehouse_id='5eed0000-0000-4000-8000-010000000001';
delete from warehouses where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id='5eed0000-0000-4000-8000-010000000001';
delete from suppliers  where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id='5eed0000-0000-4000-8000-020000000001';

-- ── 4. ABSOLUTE restores (idempotent — safe to run twice; guarded by the pre-flight block above) ──
update fixed_assets set accumulated_depreciation = v.accum, updated_at = now() from (values
  ('FA-001',4800.00::numeric), ('FA-002',666.67::numeric), ('FA-003',1666.67::numeric), ('FA-004',555.56::numeric), ('FA-005',430.56::numeric)
) as v(num,accum) where fixed_assets.company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and fixed_assets.asset_number = v.num;

update products set quantity_on_hand = v.qoh, cost_price = v.wac, updated_at = now() from (values
  ('e49efbd1-74d7-4701-9e7a-b174437cbb8b'::uuid, 165::numeric, 784.2046::numeric),
  ('f12bc2ad-9c45-43d4-8814-31728b128fb8'::uuid, 81::numeric, 894.1719::numeric),
  ('da8f92f9-d103-45bc-b928-d66e0804d80b'::uuid, 81::numeric, 895.3400::numeric),
  ('a5b6f5d0-c453-4ae2-a811-514d6baa9aee'::uuid, 100::numeric, 896.6089::numeric),
  ('bdccbc71-4f9f-4c15-ba8a-a59884bed33e'::uuid, 181::numeric, 207.7895::numeric),
  ('b0d10b92-189a-4619-a996-0fd573d0b287'::uuid, 171::numeric, 276.6000::numeric),
  ('2b995d55-7e7a-464c-b9f3-4ce20da3bb84'::uuid, 47::numeric, 1141.5510::numeric),
  ('a1a589ac-8eec-4654-9087-c049d61b0d18'::uuid, 40::numeric, 1475.0473::numeric),
  ('79b5298e-b34d-43aa-a4e8-5104122d9fe2'::uuid, 11::numeric, 2650.0000::numeric),
  ('f6e4536f-4195-4c48-b043-767fcc002736'::uuid, 52::numeric, 611.5455::numeric),
  ('4e31b8e9-360d-4cd2-923c-d0741ef615eb'::uuid, 22::numeric, 1338.4286::numeric),
  ('fa720588-27f5-4d91-a18d-ad06dbe51bf0'::uuid, 13::numeric, 2083.8462::numeric),
  ('fd727024-acc8-4384-91c8-4f4cd81c6a61'::uuid, 22::numeric, 1544.3636::numeric),
  ('e7f99b76-cb1e-4778-b345-424c3324e5a9'::uuid, 26::numeric, 782.7857::numeric),
  ('aba15935-1b14-47e8-9ad9-3d5b92e20121'::uuid, 213::numeric, 119.2458::numeric),
  ('9279d70d-f8d6-4c14-be52-fa90cee8c9c1'::uuid, 243::numeric, 64.8500::numeric),
  ('1b6a9926-aab9-4c85-89a4-2586f31749a5'::uuid, 88::numeric, 380.0000::numeric),
  ('da787ce2-5b7e-4bec-ba42-a68da679a862'::uuid, 85::numeric, 420.9333::numeric),
  ('8676826b-040e-4693-a2eb-876c1ce2bf91'::uuid, 17::numeric, 1831.5000::numeric),
  ('94ab6fc1-b31d-4ef6-96d0-ded6fa3c1718'::uuid, 7::numeric, 3424.1250::numeric),
  ('4231f62b-19c9-4053-b017-7fb8fea40272'::uuid, 0::numeric, 8900.0000::numeric),
  ('b8cd6190-ffd4-4f73-a0bb-4f535aa48826'::uuid, 25::numeric, 1250.0000::numeric),
  ('cb6e4124-84a0-4f12-8914-e27674c9e710'::uuid, 18::numeric, 983.2667::numeric),
  ('9a3278d3-867e-42c6-8139-340dfdc84da9'::uuid, 163::numeric, 95.5182::numeric),
  ('67becdf3-5573-4fb3-8aac-4e6ea68d5d15'::uuid, 720::numeric, 234.4525::numeric),
  ('d0a2c671-6fb9-48ec-8d0d-1ea1e5b8f5e3'::uuid, 343::numeric, 95.0000::numeric),
  ('57ea5dcf-52e2-41f1-9d62-f716e0899ebd'::uuid, 677::numeric, 28.0811::numeric),
  ('4addbc14-2f71-4441-82ed-c7a936ddb603'::uuid, 498::numeric, 45.1953::numeric),
  ('f833a23d-d874-4504-817b-d091031b743e'::uuid, 489::numeric, 18.0855::numeric),
  ('3ffee2af-a30a-4ff5-bf6a-63419e309477'::uuid, 258::numeric, 54.6812::numeric),
  ('cf7378f1-20f3-4076-8fbf-426259c5071b'::uuid, 904::numeric, 14.9639::numeric),
  ('df345451-4263-4b51-bd19-86554260994d'::uuid, 1052::numeric, 22.0000::numeric),
  ('ee1792f7-78e7-41df-b319-d04cfc8064e4'::uuid, 280::numeric, 68.0948::numeric),
  ('9d0b89df-e023-4f65-89ee-edee62755652'::uuid, 357::numeric, 78.3042::numeric),
  ('01beac73-4bfc-4973-93ce-13d8f6886eb5'::uuid, 246::numeric, 110.6680::numeric)
) as v(pid,qoh,wac) where products.id = v.pid and products.company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01';

update stock_balances set quantity_on_hand = v.qoh, updated_at = now() from (values
  ('e49efbd1-74d7-4701-9e7a-b174437cbb8b'::uuid, 165::numeric),
  ('f12bc2ad-9c45-43d4-8814-31728b128fb8'::uuid, 81::numeric),
  ('da8f92f9-d103-45bc-b928-d66e0804d80b'::uuid, 81::numeric),
  ('a5b6f5d0-c453-4ae2-a811-514d6baa9aee'::uuid, 100::numeric),
  ('bdccbc71-4f9f-4c15-ba8a-a59884bed33e'::uuid, 181::numeric),
  ('b0d10b92-189a-4619-a996-0fd573d0b287'::uuid, 171::numeric),
  ('2b995d55-7e7a-464c-b9f3-4ce20da3bb84'::uuid, 47::numeric),
  ('a1a589ac-8eec-4654-9087-c049d61b0d18'::uuid, 40::numeric),
  ('79b5298e-b34d-43aa-a4e8-5104122d9fe2'::uuid, 11::numeric),
  ('f6e4536f-4195-4c48-b043-767fcc002736'::uuid, 52::numeric),
  ('4e31b8e9-360d-4cd2-923c-d0741ef615eb'::uuid, 22::numeric),
  ('fa720588-27f5-4d91-a18d-ad06dbe51bf0'::uuid, 13::numeric),
  ('fd727024-acc8-4384-91c8-4f4cd81c6a61'::uuid, 22::numeric),
  ('e7f99b76-cb1e-4778-b345-424c3324e5a9'::uuid, 26::numeric),
  ('aba15935-1b14-47e8-9ad9-3d5b92e20121'::uuid, 213::numeric),
  ('9279d70d-f8d6-4c14-be52-fa90cee8c9c1'::uuid, 243::numeric),
  ('1b6a9926-aab9-4c85-89a4-2586f31749a5'::uuid, 88::numeric),
  ('da787ce2-5b7e-4bec-ba42-a68da679a862'::uuid, 85::numeric),
  ('8676826b-040e-4693-a2eb-876c1ce2bf91'::uuid, 17::numeric),
  ('94ab6fc1-b31d-4ef6-96d0-ded6fa3c1718'::uuid, 7::numeric),
  ('4231f62b-19c9-4053-b017-7fb8fea40272'::uuid, 0::numeric),
  ('b8cd6190-ffd4-4f73-a0bb-4f535aa48826'::uuid, 25::numeric),
  ('cb6e4124-84a0-4f12-8914-e27674c9e710'::uuid, 18::numeric),
  ('9a3278d3-867e-42c6-8139-340dfdc84da9'::uuid, 163::numeric),
  ('67becdf3-5573-4fb3-8aac-4e6ea68d5d15'::uuid, 720::numeric),
  ('d0a2c671-6fb9-48ec-8d0d-1ea1e5b8f5e3'::uuid, 343::numeric),
  ('57ea5dcf-52e2-41f1-9d62-f716e0899ebd'::uuid, 677::numeric),
  ('4addbc14-2f71-4441-82ed-c7a936ddb603'::uuid, 498::numeric),
  ('f833a23d-d874-4504-817b-d091031b743e'::uuid, 489::numeric),
  ('3ffee2af-a30a-4ff5-bf6a-63419e309477'::uuid, 258::numeric),
  ('cf7378f1-20f3-4076-8fbf-426259c5071b'::uuid, 904::numeric),
  ('df345451-4263-4b51-bd19-86554260994d'::uuid, 1052::numeric),
  ('ee1792f7-78e7-41df-b319-d04cfc8064e4'::uuid, 280::numeric),
  ('9d0b89df-e023-4f65-89ee-edee62755652'::uuid, 357::numeric),
  ('01beac73-4bfc-4973-93ce-13d8f6886eb5'::uuid, 246::numeric)
) as v(pid,qoh) where stock_balances.product_id = v.pid and stock_balances.warehouse_id='692a3d01-9835-4340-b5ab-44fe96067490' and stock_balances.company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01';

update journal_number_counters set next_value = 4101, updated_at = now() where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01';

-- bank_accounts.current_balance → pre-seed absolute (= pre-seed GL 1000). Idempotent.
update bank_accounts set current_balance = 212270.67, updated_at = now() where id = '2fb81a17-92b6-4936-9925-456a73a91cd1' and company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01';

-- ── 5. post-rollback fingerprint proof (every row: v must equal expected) ──
select 'tb_sum' k, round(sum(jl.debit-jl.credit),2)::text v, '0.00' expected from journal_lines jl join journal_entries j on j.id=jl.journal_entry_id where j.company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01'
union all select 'gl_1200', round(coalesce((select sum(jl.debit-jl.credit) from journal_lines jl join journal_entries j on j.id=jl.journal_entry_id join accounts a on a.id=jl.account_id where j.company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and a.code='1200'),0),2)::text, '1569743.20'
union all select 'inv_val', round(coalesce(sum(quantity_on_hand*cost_price),0),2)::text, '1569743.20' from products where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and track_inventory
union all select 'je_count', count(*)::text, '171' from journal_entries where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01'
union all select 'je_counter', next_value::text, '4101' from journal_number_counters where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01'
union all select 'seed_rows_remaining', (
  (select count(*) from journal_entries where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-%')
 + (select count(*) from stock_movements where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-%')
 + (select count(*) from bank_transactions where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-%')
 + (select count(*) from bank_statement_lines where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-%')
 + (select count(*) from reconciliations where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-%')
 + (select count(*) from invoices where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-%')
 + (select count(*) from bills where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-%')
 + (select count(*) from warehouses where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-%')
 + (select count(*) from suppliers where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id::text like '5eed0000-0000-4000-8000-%'))::text, '0'
union all select 'pay2004_rec1001_status', string_agg(status::text,'/' order by reference), 'unreconciled/unreconciled' from bank_transactions where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id in ('4acd5c92-f515-4beb-94ae-57fb8223d7a0','7f9d173c-b1ab-4d1c-99a7-a375f5f411a2')
union all select 'linked_bt_reconciliation_id', count(*)::text, '0' from bank_transactions where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id in ('4acd5c92-f515-4beb-94ae-57fb8223d7a0','7f9d173c-b1ab-4d1c-99a7-a375f5f411a2','17f0ff1f-35b3-4be1-997d-d7ab7a4b4049','6104af71-1d84-4346-ba4a-a5d60a8ec158','3d818821-a022-426f-b943-430a6575135e','ac1b86de-409d-4a79-9ad3-3ebfea24deda','d5b46c1f-fe9e-4e90-9385-aeb1ac0dfd4e') and reconciliation_id is not null
union all select 'bank_transactions_total', count(*)::text, '94' from bank_transactions where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01'
union all select 'bank_current_balance', round(current_balance,2)::text, '212270.67' from bank_accounts where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and id='2fb81a17-92b6-4936-9925-456a73a91cd1'
union all select 'aug_statement_untouched', (reconciliation_status::text||'/'||line_count::text), 'in_progress/87' from bank_statements where company_id='676c6cda-2e67-4ee3-8aaa-249b2c6bbc01' and reference='ON-AUG-2026';

-- ROLLBACK;  -- dry run: inspect the fingerprint proof above, then re-run with COMMIT
COMMIT;
