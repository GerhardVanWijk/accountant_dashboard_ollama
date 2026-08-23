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
}

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
  amount: number;
  description?: string;
  /**
   * Optional, purely informational pointer to an existing document this
   * transaction relates to (e.g. an Invoice or Bill id) — NOT a real
   * foreign-key relationship enforced anywhere, just a free-text
   * reference an accountant can use to cross-check. No cross-module
   * coupling is added by this field.
   */
  sourceReference?: string;
}
