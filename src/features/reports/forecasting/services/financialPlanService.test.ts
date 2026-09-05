import { describe, expect, it } from 'vitest';
import { MockFinancialPlanRepository } from '@/repositories/mock/MockFinancialPlanRepository';
import { FinancialPlanService } from './financialPlanService';

/**
 * Completion-run stabilization (2026-09-05), Part 5 — Forecasting pre-QA
 * review found `FinancialPlanService.upsertPlanLine` was the only write
 * path onto `financial_plan_lines.amount` (a plain, unscoped `numeric`
 * column — migration 0060) and did not round to money precision, so a
 * user-typed value like `100.999` (or float drift from client-side
 * arithmetic) would be stored and summed verbatim by
 * `computeForecastReport.ts`. This suite covers the fix and the basic
 * upsert contract, which had no dedicated test file before this run.
 */
describe('FinancialPlanService.upsertPlanLine', () => {
  it('creates a new line when none exists for (planType, accountId, year, month)', async () => {
    const service = new FinancialPlanService(new MockFinancialPlanRepository());
    const line = await service.upsertPlanLine({ planType: 'budget', accountId: 'acc_1', periodYear: 2026, periodMonth: 3, amount: 1000 });
    expect(line.planType).toBe('budget');
    expect(line.amount).toBe(1000);
    expect(line.id).toBeTruthy();
  });

  it('re-upserting the SAME (planType, accountId, year, month) overwrites the prior figure — one current value, not a history', async () => {
    const service = new FinancialPlanService(new MockFinancialPlanRepository());
    const first = await service.upsertPlanLine({ planType: 'budget', accountId: 'acc_1', periodYear: 2026, periodMonth: 3, amount: 1000 });
    const second = await service.upsertPlanLine({ planType: 'budget', accountId: 'acc_1', periodYear: 2026, periodMonth: 3, amount: 1500 });
    expect(second.id).toBe(first.id);
    expect(second.amount).toBe(1500);
    const all = await service.listPlanLines('budget', 2026);
    expect(all).toHaveLength(1);
  });

  it('a different planType, account, year, or month is a SEPARATE line — never conflated', async () => {
    const service = new FinancialPlanService(new MockFinancialPlanRepository());
    await service.upsertPlanLine({ planType: 'budget', accountId: 'acc_1', periodYear: 2026, periodMonth: 3, amount: 1000 });
    await service.upsertPlanLine({ planType: 'forecast', accountId: 'acc_1', periodYear: 2026, periodMonth: 3, amount: 1000 });
    await service.upsertPlanLine({ planType: 'budget', accountId: 'acc_2', periodYear: 2026, periodMonth: 3, amount: 1000 });
    await service.upsertPlanLine({ planType: 'budget', accountId: 'acc_1', periodYear: 2026, periodMonth: 4, amount: 1000 });
    const budget2026 = await service.listPlanLines('budget', 2026);
    expect(budget2026).toHaveLength(3);
  });

  it('rounds the amount to 2dp (money precision) — fixes a real over-precision gap, financial_plan_lines.amount has no numeric scale', async () => {
    const service = new FinancialPlanService(new MockFinancialPlanRepository());
    const line = await service.upsertPlanLine({ planType: 'budget', accountId: 'acc_1', periodYear: 2026, periodMonth: 3, amount: 100.999 });
    expect(line.amount).toBe(101);
  });

  it('rounds a float-drift value (e.g. 0.1 + 0.2) to a clean 2dp figure', async () => {
    const service = new FinancialPlanService(new MockFinancialPlanRepository());
    const line = await service.upsertPlanLine({ planType: 'budget', accountId: 'acc_1', periodYear: 2026, periodMonth: 3, amount: 0.1 + 0.2 });
    expect(line.amount).toBe(0.3);
  });

  it('rounding also applies on the UPDATE path, not just create', async () => {
    const service = new FinancialPlanService(new MockFinancialPlanRepository());
    await service.upsertPlanLine({ planType: 'budget', accountId: 'acc_1', periodYear: 2026, periodMonth: 3, amount: 1000 });
    const updated = await service.upsertPlanLine({ planType: 'budget', accountId: 'acc_1', periodYear: 2026, periodMonth: 3, amount: 250.005 });
    expect(updated.amount).toBe(250.01);
  });

  it('rejects a month outside 1-12', async () => {
    const service = new FinancialPlanService(new MockFinancialPlanRepository());
    await expect(
      service.upsertPlanLine({ planType: 'budget', accountId: 'acc_1', periodYear: 2026, periodMonth: 13, amount: 100 }),
    ).rejects.toThrow(/Month must be between 1 and 12/);
    await expect(
      service.upsertPlanLine({ planType: 'budget', accountId: 'acc_1', periodYear: 2026, periodMonth: 0, amount: 100 }),
    ).rejects.toThrow(/Month must be between 1 and 12/);
  });

  it('rejects a non-finite amount (NaN / Infinity) rather than silently storing it', async () => {
    const service = new FinancialPlanService(new MockFinancialPlanRepository());
    await expect(
      service.upsertPlanLine({ planType: 'budget', accountId: 'acc_1', periodYear: 2026, periodMonth: 3, amount: Number.NaN }),
    ).rejects.toThrow(/Amount must be a number/);
    await expect(
      service.upsertPlanLine({ planType: 'budget', accountId: 'acc_1', periodYear: 2026, periodMonth: 3, amount: Number.POSITIVE_INFINITY }),
    ).rejects.toThrow(/Amount must be a number/);
  });

  it('a negative amount is accepted (e.g. a planned contra/adjustment figure) — no sign restriction imposed here', async () => {
    const service = new FinancialPlanService(new MockFinancialPlanRepository());
    const line = await service.upsertPlanLine({ planType: 'forecast', accountId: 'acc_1', periodYear: 2026, periodMonth: 3, amount: -500 });
    expect(line.amount).toBe(-500);
  });
});

describe('FinancialPlanService.listAllPlanLines', () => {
  it('splits every plan line by planType across every year — a 6/12-month window can span a calendar-year boundary', async () => {
    const repo = new MockFinancialPlanRepository();
    const service = new FinancialPlanService(repo);
    await service.upsertPlanLine({ planType: 'budget', accountId: 'acc_1', periodYear: 2025, periodMonth: 11, amount: 100 });
    await service.upsertPlanLine({ planType: 'budget', accountId: 'acc_1', periodYear: 2026, periodMonth: 2, amount: 200 });
    await service.upsertPlanLine({ planType: 'forecast', accountId: 'acc_1', periodYear: 2026, periodMonth: 2, amount: 250 });
    const { budgetLines, forecastLines } = await service.listAllPlanLines();
    expect(budgetLines).toHaveLength(2);
    expect(forecastLines).toHaveLength(1);
  });
});

describe('FinancialPlanService.deletePlanLine', () => {
  it('removes the line', async () => {
    const service = new FinancialPlanService(new MockFinancialPlanRepository());
    const line = await service.upsertPlanLine({ planType: 'budget', accountId: 'acc_1', periodYear: 2026, periodMonth: 3, amount: 100 });
    await service.deletePlanLine(line.id);
    expect(await service.listPlanLines('budget', 2026)).toHaveLength(0);
  });
});
