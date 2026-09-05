import type { FinancialPlanLine, FinancialPlanType } from '@/types';
import type { IRepository } from './IRepository';

export interface IFinancialPlanRepository extends IRepository<FinancialPlanLine> {
  getByPlanTypeAndYear(planType: FinancialPlanType, year: number): Promise<FinancialPlanLine[]>;
}
