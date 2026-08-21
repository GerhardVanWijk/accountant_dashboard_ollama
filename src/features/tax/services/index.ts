import { TaxRateService } from './taxRateService';
import { MockTaxRateRepository } from '@/repositories/mock/MockTaxRateRepository';
import { auditLogService } from '@/services/auditLogService';

export type { CreateTaxRateDTO, SupersedeTaxRateInput } from './taxRateService';
export { TaxRateService } from './taxRateService';

export const taxRateService = new TaxRateService(new MockTaxRateRepository(), auditLogService);
