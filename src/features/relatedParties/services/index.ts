import { RelatedPartyService } from './relatedPartyService';
import { RelatedPartyTransactionService } from './relatedPartyTransactionService';
import { relatedPartyRepository, relatedPartyTransactionRepository } from '../repositories/instances';

export type { CreateRelatedPartyDTO, UpdateRelatedPartyDTO } from './relatedPartyService';
export type { CreateRelatedPartyTransactionDTO, UpdateRelatedPartyTransactionDTO } from './relatedPartyTransactionService';
export type { RelatedPartyDisclosureSummaryRow } from './relatedPartyDisclosureSummary';
export { buildRelatedPartyDisclosureSummary } from './relatedPartyDisclosureSummary';
export { RelatedPartyService } from './relatedPartyService';
export { RelatedPartyTransactionService } from './relatedPartyTransactionService';

/**
 * Wires the two services to their shared mock repositories, and wires
 * relatedPartyTransactionService's RelatedPartyLookup to the real
 * relatedPartyService singleton — same "narrow interface, real singleton
 * injected" pattern as employees/services/index.ts. This module never
 * touches journalEntryService: it posts nothing to the GL.
 */
export const relatedPartyService = new RelatedPartyService(relatedPartyRepository, relatedPartyTransactionRepository);
export const relatedPartyTransactionService = new RelatedPartyTransactionService(relatedPartyTransactionRepository, relatedPartyService);
