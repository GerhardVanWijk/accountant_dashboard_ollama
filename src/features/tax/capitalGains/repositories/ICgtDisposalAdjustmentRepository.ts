import type { CgtDisposalAdjustment, ID } from '@/types';
import type { IRepository } from '@/repositories/IRepository';

export interface ICgtDisposalAdjustmentRepository extends IRepository<CgtDisposalAdjustment> {
  getByDisposal(disposalId: ID): Promise<CgtDisposalAdjustment | undefined>;
}
