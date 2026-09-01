import { supabase } from '@/config/supabase';
import { DocumentLineParityChecker } from './DocumentLineParityChecker';

/**
 * Phase 9B (docs/PHASE_9B_DESIGN.md §3-4): the shared, live-wired
 * {@link DocumentLineParityChecker}. READ-ONLY — it only issues `select`
 * queries and never mutates either representation.
 *
 * Intended use: after migrations 0037-0042 are applied and BEFORE
 * `NORMALIZED_DOCUMENT_LINES_ENABLED` (src/config/featureFlags.ts) is ever
 * flipped `true`, run `documentLineParityChecker.check()` and require a
 * clean report (`result.ok === true`, or every finding individually
 * explained) as the gate for enabling the projection.
 */
export const documentLineParityChecker = new DocumentLineParityChecker(supabase);
