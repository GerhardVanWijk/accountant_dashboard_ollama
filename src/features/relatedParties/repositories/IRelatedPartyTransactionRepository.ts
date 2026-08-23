import type { RelatedPartyTransaction } from '@/types/relatedParty';
import type { IRepository } from '@/repositories/IRepository';

/**
 * Related party transaction contract. Unlike this codebase's append-only
 * GL-posting records, this data supports update/delete — it is
 * disclosure data an accountant may need to correct, not a posted
 * accounting entry, so no immutability rule applies here.
 */
export type IRelatedPartyTransactionRepository = IRepository<RelatedPartyTransaction>;
