import type { ReconciliationEvidence } from '@/types';

export interface ConfidenceFactor {
  points: number;
  label: string;
  detail?: string;
  met: boolean;
}

export interface ConfidenceResult {
  /** 0-100. */
  value: number;
  evidence: ReconciliationEvidence[];
}

/**
 * Every confidence score in this module is built from named, weighted
 * factors — never a bare number a reader has to trust blindly (per the
 * spec's "confidence must not be a mysterious number" requirement). Only
 * `met` factors contribute to both the score and the evidence list, so the
 * evidence array IS the full explanation of the score, not a curated
 * subset of it.
 */
export function buildConfidence(factors: ConfidenceFactor[]): ConfidenceResult {
  let value = 0;
  const evidence: ReconciliationEvidence[] = [];
  for (const factor of factors) {
    if (!factor.met) continue;
    value += factor.points;
    evidence.push({ label: factor.label, detail: factor.detail });
  }
  return { value: Math.max(0, Math.min(100, Math.round(value))), evidence };
}
