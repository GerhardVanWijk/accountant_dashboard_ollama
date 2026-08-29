import type {
  ReconciliationEvidence,
  ReconciliationEvidenceData,
  ReconciliationEvidenceFactor,
  ReconciliationIssueType,
} from '@/types';

/**
 * The version stamp for every detector's weight/logic table in this module.
 * Bump it whenever a factor's points, threshold, or meaning changes so a
 * historical `ReconciliationIssue.evidenceData` stays interpretable against
 * the rules that actually produced it (docs/BANK_STATEMENT_ARCHITECTURE_AUDIT.md
 * "version the weight table").
 */
export const DETECTOR_VERSION = '2026.08';

/** One weighted factor a detector scores — becomes BOTH a prose evidence line (when met) AND a machine `ReconciliationEvidenceFactor`. */
export interface EvidenceFactorInput {
  /** Stable machine key, e.g. `'same_date'` — never changes once shipped. */
  key: string;
  /** Human-readable, shown in the prose evidence list and the factor scorecard. */
  label: string;
  detail?: string;
  /** Points this factor contributes when `met`. */
  points: number;
  /** Points it could contribute — for "3 of 6 factors met" / "62 of 100". Defaults to `points`. */
  maxPoints?: number;
  met: boolean;
  /** The measured value behind the verdict, e.g. `0.16`, `'2 days'`, `true`. */
  observedValue?: string | number | boolean;
}

/** Everything the detectors actually compute, minus the parts `buildEvidence` fills in itself (`detectorType`, `detectorVersion`, `factors`, `confidenceMax`). */
export type EvidenceFields = Partial<
  Omit<ReconciliationEvidenceData, 'detectorType' | 'detectorVersion' | 'factors' | 'confidenceMax'>
>;

export interface BuildEvidenceInput {
  detectorType: ReconciliationIssueType;
  factors: EvidenceFactorInput[];
  fields?: EvidenceFields;
}

export interface BuildEvidenceResult {
  /** Confidence 0-100 — sum of the points of every MET factor, clamped. */
  value: number;
  /** Confidence ceiling 0-100 — sum of every factor's `maxPoints`, clamped. */
  valueMax: number;
  /** The prose view — one entry per MET factor (kept identical in spirit to the old `buildConfidence`). */
  evidence: ReconciliationEvidence[];
  /** The structured counterpart — every field the detector computed, plus the full factor scorecard (met AND unmet). */
  evidenceData: ReconciliationEvidenceData;
}

const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Replaces the old `buildConfidence` helper: same "confidence is
 * only ever a sum of named, weighted factors" contract, but it also emits
 * the structured `ReconciliationEvidenceData` the audit requires — every
 * factor as data (met and unmet, so a reader sees "3 of 6 met" and what is
 * missing), plus the raw numbers the detector measured. The prose
 * `evidence[]` is still only the MET factors, so it reads as the explanation
 * of the score, not a padded list.
 */
export function buildEvidence(input: BuildEvidenceInput): BuildEvidenceResult {
  let value = 0;
  let max = 0;
  const evidence: ReconciliationEvidence[] = [];
  const factors: ReconciliationEvidenceFactor[] = [];

  for (const f of input.factors) {
    const maxPoints = f.maxPoints ?? f.points;
    max += maxPoints;
    if (f.met) {
      value += f.points;
      evidence.push({ label: f.label, detail: f.detail });
    }
    factors.push({
      key: f.key,
      label: f.label,
      points: f.met ? f.points : 0,
      maxPoints,
      met: f.met,
      observedValue: f.observedValue,
    });
  }

  const valueMax = clamp100(max);

  return {
    value: clamp100(value),
    valueMax,
    evidence,
    evidenceData: {
      detectorType: input.detectorType,
      detectorVersion: DETECTOR_VERSION,
      confidenceMax: valueMax,
      factors,
      ...input.fields,
    },
  };
}
