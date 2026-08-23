import type { BaseEntity, ID, ISODateString } from './common';

/**
 * IFRS / IFRS for SMEs disclosure-framework versioning
 * (SA_ACCOUNTING_MASTER_SPEC.md §48/§49, §116 Phase 12 "Advanced Accounting").
 *
 * §49 explicitly requires this codebase to know that a reporting standard
 * has DIFFERENT EDITIONS over time (2015 IFRS for SMEs vs. the 2025 third
 * edition, effective for periods beginning on or after 1 January 2027 with
 * early adoption permitted — a date the master spec itself supplies) and
 * that a new edition must never silently overwrite the old one ("Do not
 * overwrite the previous standard when a new standard becomes effective").
 * §48 makes the same point for Full IFRS's presentation model: IFRS 18
 * replaces IAS 1's presentation requirements for annual reporting periods
 * beginning on or after 1 January 2027 (early application permitted) — NOT
 * supplied by the master spec text itself, so this fact was independently
 * verified live (WebSearch, 2026-08-22, cross-checked against ifrs.org,
 * PwC, ICAEW, and KPMG, all agreeing) rather than recalled from training
 * data, per §110/§111.
 *
 * This module deliberately does NOT attempt to encode the actual clause-
 * level disclosure REQUIREMENTS of any IFRS/IFRS-for-SMEs edition (e.g. "IFRS
 * 18 requires a management-performance-measures note") — fabricating such a
 * checklist without a verified, complete source would itself violate §110.
 * What IS honestly buildable and useful is the VERSIONING/EFFECTIVE-DATE
 * engine §49 explicitly asks for: which edition of a framework applies to a
 * given reporting period, with early adoption as an explicit, recorded
 * election — never silently overwriting a prior edition, exactly mirroring
 * `TaxRateService.supersede()`'s versioning discipline.
 */

export type ReportingStandardName = 'full_ifrs' | 'ifrs_for_smes';

/**
 * One edition/version of a reporting standard, effective from a given date.
 * Immutable once created — a new edition is added via `supersede()`, which
 * only ever sets `supersededByVersionId` on the prior version; it never
 * edits a version's own fields, exactly the same discipline `TaxRate`
 * already applies (`src/types/taxRate.ts`).
 */
export interface ReportingStandardVersion extends BaseEntity {
  standard: ReportingStandardName;
  /** e.g. "IFRS for SMEs (2015 edition)", "IFRS for SMEs (2025, third edition)", "Full IFRS — IAS 1 presentation", "Full IFRS — IFRS 18 presentation". */
  versionLabel: string;
  /** Applies to reporting periods BEGINNING on or after this date. */
  effectiveFrom: ISODateString;
  earlyAdoptionPermitted: boolean;
  /** Set once a later version for the SAME `standard` is created via supersede() — never set on creation. */
  supersededByVersionId?: ID;
  /** Citation for where effectiveFrom/earlyAdoptionPermitted came from — the master spec text itself for the 2025 IFRS for SMEs edition, a live source cross-check for IFRS 18 (see this file's top doc comment). */
  sourceReference: string;
  notes?: string;
}
