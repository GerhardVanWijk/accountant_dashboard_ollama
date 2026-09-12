import type { BaseEntity, ID, ISODateString } from './common';

/**
 * Related Parties (SA_ACCOUNTING_MASTER_SPEC.md §88 "RELATED PARTIES") —
 * a disclosure-support register, not an accounting/GL-posting module.
 * Identifies directors, shareholders, subsidiaries, associates, key
 * management, and other related entities, plus the transactions between
 * them, so the information is available for financial statement
 * disclosure. No journal entries are ever created from this data.
 */
export type RelatedPartyRelationshipType =
  | 'director'
  | 'shareholder'
  | 'subsidiary'
  | 'associate'
  | 'key_management'
  | 'other_related_entity';

export interface RelatedParty extends BaseEntity {
  name: string;
  relationshipType: RelatedPartyRelationshipType;
  /**
   * Free-text detail, e.g. "Holds 30% of issued shares", "CFO",
   * "Wholly-owned subsidiary incorporated in...". No shareholder register
   * or org-chart data exists anywhere in this codebase to derive this
   * from automatically, so it is always entered manually (§110: don't
   * guess, don't fabricate ownership percentages or directorships this
   * app has no real source for).
   */
  relationshipDetail?: string;
  isActive: boolean;
  /**
   * When this relationship began (Tax & Compliance integrity audit
   * continuation, 2026-09-12, §9). Required — every relationship has a
   * real start, even if entered retroactively; defaults to today for a
   * newly-added party. Historical relationships are never deleted merely
   * because they end — `effectiveTo` (below) closes the period instead,
   * same "supersede/close, never destroy" discipline as
   * `TaxRateService.supersede()`.
   */
  effectiveFrom: ISODateString;
  /**
   * When this relationship ended, if it has. Deactivating a related party
   * (isActive -> false) closes the period by setting this — the party
   * record itself is preserved for historical disclosure, never deleted.
   * Must be on/after `effectiveFrom` (enforced by a DB CHECK constraint,
   * not just this type).
   */
  effectiveTo?: ISODateString;
}

/**
 * Real, existing accounting-record tables a related-party transaction can
 * genuinely link to (Tax & Compliance integrity audit continuation,
 * 2026-09-12, §10). Deliberately NOT a generic/open-ended polymorphic
 * type — each value here corresponds to a table this codebase actually
 * has and can validate against (see migration 0106's trigger). `undefined`
 * (no source type set at all) is the honest "Manual / Other" route for a
 * disclosure that genuinely has no matching accounting record — never
 * forced into a fake link.
 */
export type RelatedPartySourceDocumentType = 'invoice' | 'bill' | 'journal_entry' | 'customer_receipt' | 'payment';

export interface RelatedPartyTransaction extends BaseEntity {
  relatedPartyId: ID;
  transactionDate: ISODateString;
  /**
   * Free-text nature of the transaction — e.g. "Loan advanced",
   * "Consulting fee", "Rental of premises". No fixed category enum: real
   * related-party transactions are too varied to force into a closed
   * list, and guessing a taxonomy this codebase hasn't verified against
   * actual disclosure standards would violate §110.
   */
  natureOfTransaction: string;
  /**
   * When `sourceDocumentType`/`sourceDocumentId` are set, this is DERIVED
   * from the source record at create/link time, never independently
   * retyped — see relatedPartyTransactionService.ts's `resolveSource()`.
   * Only genuinely manually-entered when this transaction has no linked
   * source (the honest Manual/Other route).
   */
  amount: number;
  description?: string;
  /**
   * Which real accounting-record table `sourceDocumentId` points into.
   * `undefined` (with `sourceDocumentId` also undefined) means this
   * transaction is Manual/Other — a legitimate disclosure with no
   * matching accounting record, not a data-entry gap.
   */
  sourceDocumentType?: RelatedPartySourceDocumentType;
  /** The real record's id in the table named by `sourceDocumentType` — validated to exist (and belong to the same company) at write time by the service/DB, never trusted as free text. */
  sourceDocumentId?: ID;
  /**
   * Free-text supplementary note — e.g. "per loan agreement dated...",
   * or, for a Manual/Other transaction, why no accounting record exists.
   * NOT a substitute for `sourceDocumentType`/`sourceDocumentId`: this
   * field alone was the pre-2026-09-12 "linkage" and is not validated
   * against anything (see docs on the audit finding this closes).
   */
  sourceReference?: string;
}
