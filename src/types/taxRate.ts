import type { BaseEntity } from './common';

export type TaxAppliesTo = 'sales' | 'purchases' | 'both';

export interface TaxRate extends BaseEntity {
  name: string;
  code: string;
  /** Percentage value, e.g. 15 for 15%. */
  rate: number;
  appliesTo: TaxAppliesTo;
  isActive: boolean;
}
