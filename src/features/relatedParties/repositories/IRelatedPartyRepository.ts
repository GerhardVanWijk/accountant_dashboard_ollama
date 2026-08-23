import type { RelatedParty } from '@/types/relatedParty';
import type { IRepository } from '@/repositories/IRepository';

/** Related party master data contract, mirroring IEmployeeRepository's shape. */
export type IRelatedPartyRepository = IRepository<RelatedParty>;
