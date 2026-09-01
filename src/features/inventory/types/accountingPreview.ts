import type { ID } from '@/types';

/**
 * One leg of a previewed (not-yet-posted) GL entry — Phase 5's shared
 * accounting-preview contract. Every inventory workflow service builds this
 * from the exact same line-building code its real `postToEngine`/
 * `postTransferLeg` method uses (see each service's private `buildXLines`
 * helper), so the preview the user reviews before posting can never drift
 * from what actually posts.
 */
export interface AccountingPreviewLine {
  accountId: ID;
  /** UI-only human label resolved from the chart of accounts — not required for the debit/credit sum. */
  accountLabel?: string;
  debit: number;
  credit: number;
  /** Reason/source column — e.g. "Loss (write-off)", "Supplier credit value", "Purchase Price Variance". */
  source: string;
}

export interface AccountingEffectPreview {
  lines: AccountingPreviewLine[];
  /** True when Σdebit === Σcredit to the cent. A correctly-built preview is always balanced; surfaced, never hidden, if not. */
  balanced: boolean;
}
