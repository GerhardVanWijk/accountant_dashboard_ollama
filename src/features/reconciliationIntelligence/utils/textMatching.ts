/**
 * Small, pure fuzzy-matching primitives shared by every detector that needs
 * "how close are these two candidates" (date proximity, reference overlap,
 * description overlap) — extracted here after a review found the same four
 * functions independently copy-pasted into utils/matching.ts and five
 * detector files. Deliberately NOT the same module as
 * src/features/banking/utils/matching.ts's tokenOverlapRatio: that one
 * scores a different comparison (an imported statement line against an
 * already-recorded transaction) and is frozen banking-module territory,
 * not a cross-feature utility — this module is this feature's own single
 * source of truth for text/date proximity scoring instead.
 */

export function daysBetween(a: string, b: string): number {
  const diffMs = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

/** 0-1: fraction of `a`'s (or `b`'s, whichever is larger) tokens that also appear in the other string. */
export function descriptionOverlap(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  for (const t of setA) if (setB.has(t)) overlap += 1;
  return overlap / Math.max(setA.size, setB.size);
}

/** Exact match, or one reference containing the other (handles a prefix/suffix like a bank's own transaction-id wrapper around the real reference). */
export function referencesMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const ra = a.trim().toLowerCase();
  const rb = b.trim().toLowerCase();
  return ra.length > 0 && (ra === rb || ra.includes(rb) || rb.includes(ra));
}

/**
 * 0-1 similarity between two reference strings, for
 * `ReconciliationEvidenceData.referenceSimilarity`: 1 on an exact match, 0.8
 * when one contains the other, otherwise the token overlap ratio (0 when
 * either side is missing).
 */
export function referenceSimilarity(a?: string, b?: string): number {
  if (!a || !b) return 0;
  const ra = a.trim().toLowerCase();
  const rb = b.trim().toLowerCase();
  if (!ra || !rb) return 0;
  if (ra === rb) return 1;
  if (ra.includes(rb) || rb.includes(ra)) return 0.8;
  return descriptionOverlap(ra, rb);
}
