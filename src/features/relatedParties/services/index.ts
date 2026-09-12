import { RelatedPartyService } from './relatedPartyService';
import { RelatedPartyTransactionService } from './relatedPartyTransactionService';
import { RealSourceDocumentLookup } from './sourceDocumentLookup';
import { relatedPartyRepository, relatedPartyTransactionRepository } from '../repositories/instances';
import { invoiceService } from '@/services';
import { billService } from '@/features/purchases/services';
import { customerReceiptService } from '@/features/sales/services';
import { paymentService } from '@/features/purchases/services';
import { journalEntryService } from '@/features/accounting/services';

export type { CreateRelatedPartyDTO, UpdateRelatedPartyDTO } from './relatedPartyService';
export type { CreateRelatedPartyTransactionDTO, UpdateRelatedPartyTransactionDTO, ResolvedSourceDocument, SourceDocumentLookup } from './relatedPartyTransactionService';
export type { RelatedPartyDisclosureSummaryRow } from './relatedPartyDisclosureSummary';
export { buildRelatedPartyDisclosureSummary } from './relatedPartyDisclosureSummary';
export { RelatedPartyService } from './relatedPartyService';
export { RelatedPartyTransactionService } from './relatedPartyTransactionService';
export type { RelatedPartyDisclosureReconciliationRow } from './relatedPartyDisclosureReconciliation';
export { reconcileRelatedPartyDisclosures } from './relatedPartyDisclosureReconciliation';

/**
 * Wires the two services to their shared mock repositories, and wires
 * relatedPartyTransactionService's RelatedPartyLookup to the real
 * relatedPartyService singleton — same "narrow interface, real singleton
 * injected" pattern as employees/services/index.ts. This module never
 * posts to the GL — `RealSourceDocumentLookup` (Tax & Compliance
 * integrity audit continuation, 2026-09-12, §10) only READS the five real
 * document services to derive a linked transaction's amount/date, never
 * writes to any of them.
 */
export const relatedPartyService = new RelatedPartyService(relatedPartyRepository, relatedPartyTransactionRepository);

/** Exported so the disclosure-reconciliation view (§11) can re-resolve a linked transaction's CURRENT source amount without duplicating this wiring. */
export const sourceDocumentLookup = new RealSourceDocumentLookup({
  invoices: invoiceService,
  bills: billService,
  journalEntries: journalEntryService,
  customerReceipts: customerReceiptService,
  payments: paymentService,
});

export const relatedPartyTransactionService = new RelatedPartyTransactionService(relatedPartyTransactionRepository, relatedPartyService, sourceDocumentLookup);
