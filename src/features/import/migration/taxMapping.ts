import type { ExternalTaxRef, TaxMappingChoice, TaxMappingSelections } from '../types';

export interface TaxMappingSuggestion {
  ref: ExternalTaxRef;
  /** Set only for an exact code/rate/known-alias match against an ACTUAL configured Vertex tax rate — never a newly invented tax definition, never a name-similarity guess. */
  suggestedTaxRateId?: string;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * A small, explicit alias catalog for the exact examples the brief itself
 * names (Part 24: "STANDARD / VAT15 / 15%" etc.) — every alias maps to a
 * `VatTreatment` value that must already exist as a configured, currently
 * effective Vertex tax rate; this NEVER creates a tax definition, and matching
 * is exact-normalized-token only (no fuzzy/partial matching, same rule as
 * `accountMapping.ts`).
 */
const TREATMENT_ALIASES: Record<string, string> = {
  standard: 'standard_rated', std: 'standard_rated', vat15: 'standard_rated', standardrated: 'standard_rated',
  zero: 'zero_rated', zerorated: 'zero_rated',
  exempt: 'exempt',
  novat: 'out_of_scope', outofscope: 'out_of_scope', noneoftheabove: 'out_of_scope',
};

/**
 * Safe auto-mapping (Part 24): an external tax code that matches an
 * existing Vertex tax rate's own `code` exactly, or its numeric `rate`
 * (e.g. "15" / "15%" -> a rate with `rate === 15`), or one of the small
 * explicit treatment aliases above, becomes a pre-filled suggestion — still
 * shown for confirmation on the Tax Mapping step, never applied silently.
 * Everything else is left unmapped ("Requires review").
 */
export function suggestTaxMappings(
  refs: ExternalTaxRef[],
  taxRates: { id: string; code: string; treatment: string; rate: number }[],
): TaxMappingSuggestion[] {
  const byCode = new Map(taxRates.map((t) => [normalizeToken(t.code), t.id]));
  const byRateNumber = new Map(taxRates.map((t) => [String(t.rate), t.id]));
  const byTreatment = new Map(taxRates.map((t) => [t.treatment, t.id]));

  return refs.map((ref) => {
    const token = normalizeToken(ref.code);
    let suggestedTaxRateId = byCode.get(token);
    if (!suggestedTaxRateId && ref.rate !== undefined) suggestedTaxRateId = byRateNumber.get(String(ref.rate));
    if (!suggestedTaxRateId) {
      const rateMatch = token.match(/^(\d+(?:\.\d+)?)(?:pct|percent)?$/);
      if (rateMatch) suggestedTaxRateId = byRateNumber.get(rateMatch[1]);
    }
    if (!suggestedTaxRateId) {
      const aliasTreatment = TREATMENT_ALIASES[token];
      if (aliasTreatment) suggestedTaxRateId = byTreatment.get(aliasTreatment);
    }
    return { ref, suggestedTaxRateId };
  });
}

function isWellFormedTaxChoice(value: unknown): value is TaxMappingChoice {
  if (!value || typeof value !== 'object') return false;
  const action = (value as { action?: unknown }).action;
  if (action === 'ignore') return true;
  if (action === 'mapped') return typeof (value as { taxRateId?: unknown }).taxRateId === 'string';
  return false;
}

/**
 * Tax-mapping mirror of `restoreAccountMappingSelections` — same rules:
 * restores a saved profile's `taxMappings` only for the external tax codes
 * present in THIS import, only when the stored `taxRateId` is still in
 * `treatments` (the same company-scoped, currently-effective list
 * `getMappableTaxTreatments(ctx)` hands the step — a deleted, no-longer-
 * effective, or cross-company rate id simply won't appear there), and only
 * ever by exact stored code (never a name/description guess). Still just
 * pre-filled form state — the Tax Mapping step always renders for explicit
 * confirmation before `execute()` runs.
 */
export function restoreTaxMappingSelections(
  stored: Record<string, unknown>,
  refs: ExternalTaxRef[],
  treatments: { id: string; code: string; treatment: string; rate: number }[],
): TaxMappingSelections {
  const validTaxRateIds = new Set(treatments.map((t) => t.id));
  const result: TaxMappingSelections = {};
  for (const ref of refs) {
    const choice = stored[ref.code];
    if (!isWellFormedTaxChoice(choice)) continue;
    if (choice.action === 'mapped' && !validTaxRateIds.has(choice.taxRateId)) continue;
    result[ref.code] = choice;
  }
  return result;
}
