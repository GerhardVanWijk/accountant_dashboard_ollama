import type { ReportingStandardVersion } from '@/types';

/**
 * Seed reporting-standard editions (SA_ACCOUNTING_MASTER_SPEC.md §48/§49).
 * The IFRS-for-SMEs 2025 edition's effective date/early-adoption terms are
 * quoted directly from the master spec text itself (user-supplied, per
 * §110 not independently re-verified beyond that). The IFRS 18 dates were
 * NOT in the master spec text and were independently verified live
 * (WebSearch, 2026-08-22, cross-checked against ifrs.org/PwC/ICAEW/KPMG,
 * all agreeing) — see `src/types/reportingStandard.ts`'s doc comment.
 */
export const seedReportingStandardVersions: ReportingStandardVersion[] = [
  {
    id: 'rsv_smes_2015',
    standard: 'ifrs_for_smes',
    versionLabel: 'IFRS for SMEs (2015 edition)',
    effectiveFrom: '2015-01-01T00:00:00.000Z',
    earlyAdoptionPermitted: false,
    supersededByVersionId: 'rsv_smes_2025',
    sourceReference: 'IASB — IFRS for SMEs Accounting Standard, 2015 edition (in force until superseded by the 2025 third edition below).',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'rsv_smes_2025',
    standard: 'ifrs_for_smes',
    versionLabel: 'IFRS for SMEs (2025, third edition)',
    effectiveFrom: '2027-01-01T00:00:00.000Z',
    earlyAdoptionPermitted: true,
    sourceReference:
      'SA_ACCOUNTING_MASTER_SPEC.md §49: "The 2025 third edition of IFRS for SMEs was issued in February 2025 and is effective for periods beginning on or after 1 January 2027, with early adoption permitted." (user-supplied in the master spec, not independently re-verified against IASB source material — §110.)',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'rsv_ifrs_ias1',
    standard: 'full_ifrs',
    versionLabel: 'Full IFRS — IAS 1 presentation',
    effectiveFrom: '2005-01-01T00:00:00.000Z',
    earlyAdoptionPermitted: false,
    supersededByVersionId: 'rsv_ifrs_ifrs18',
    sourceReference: 'IAS 1 Presentation of Financial Statements (in force until superseded by IFRS 18 below).',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'rsv_ifrs_ifrs18',
    standard: 'full_ifrs',
    versionLabel: 'Full IFRS — IFRS 18 presentation',
    effectiveFrom: '2027-01-01T00:00:00.000Z',
    earlyAdoptionPermitted: true,
    sourceReference:
      'Verified live 2026-08-22 (WebSearch, cross-checked against ifrs.org, PwC Viewpoint, ICAEW, KPMG — all agreeing): IFRS 18 Presentation and Disclosure in Financial Statements, issued April 2024, replaces IAS 1, effective for annual reporting periods beginning on or after 1 January 2027, early application permitted.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
