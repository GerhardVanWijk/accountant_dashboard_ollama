import type { FinancialPlanLine, FinancialPlanType, ID } from '@/types';
import type { IFinancialPlanRepository } from '@/repositories/IFinancialPlanRepository';

/** rounds money to 2dp — `financial_plan_lines.amount` is a plain `numeric` column with no scale, so this is the only guard against float drift / over-precise user input. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface UpsertPlanLineDTO {
  planType: FinancialPlanType;
  accountId: ID;
  periodYear: number;
  periodMonth: number;
  amount: number;
  notes?: string;
}

/**
 * Business-logic layer for Budget/Forecast planning data (Part 11). Pure
 * CRUD — never posts to the ledger, never touches the inventory/journal
 * posting engine (migration 0060's own scope note). "Upsert" here means:
 * one row per (planType, accountId, year, month) — a re-forecast simply
 * overwrites the prior figure, matching the "current state, not a history"
 * model the migration deliberately chose.
 */
export class FinancialPlanService {
  constructor(private readonly repository: IFinancialPlanRepository) {}

  async listPlanLines(planType: FinancialPlanType, year: number): Promise<FinancialPlanLine[]> {
    return this.repository.getByPlanTypeAndYear(planType, year);
  }

  /**
   * Both plan types, every year — a trailing 6/12-month window can span a
   * calendar-year boundary (e.g. Oct 2025 – Sep 2026), so a single-year
   * fetch would silently miss the earlier months. The planning dataset is
   * small by nature (one row per account per month per plan type), so a
   * full-table read is the simplest correct approach — no pagination logic
   * needed for this MVP.
   */
  async listAllPlanLines(): Promise<{ budgetLines: FinancialPlanLine[]; forecastLines: FinancialPlanLine[] }> {
    const all = await this.repository.getAll();
    return {
      budgetLines: all.filter((l) => l.planType === 'budget'),
      forecastLines: all.filter((l) => l.planType === 'forecast'),
    };
  }

  async upsertPlanLine(dto: UpsertPlanLineDTO): Promise<FinancialPlanLine> {
    if (dto.periodMonth < 1 || dto.periodMonth > 12) {
      throw new Error(`Month must be between 1 and 12 (got ${dto.periodMonth}).`);
    }
    if (!Number.isFinite(dto.amount)) {
      throw new Error('Amount must be a number.');
    }
    const amount = round2(dto.amount);
    const existing = (await this.repository.getByPlanTypeAndYear(dto.planType, dto.periodYear)).find(
      (l) => l.accountId === dto.accountId && l.periodMonth === dto.periodMonth,
    );
    if (existing) {
      return this.repository.update(existing.id, { amount, notes: dto.notes });
    }
    return this.repository.create({
      id: '',
      planType: dto.planType,
      accountId: dto.accountId,
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth,
      amount,
      notes: dto.notes,
      createdAt: '',
      updatedAt: '',
    });
  }

  async deletePlanLine(id: ID): Promise<void> {
    return this.repository.delete(id);
  }
}
