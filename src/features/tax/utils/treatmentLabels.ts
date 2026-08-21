import type { VatTreatment } from '@/types';

/** Human-readable label for each VAT treatment — shared by the VAT Return and Tax Rates pages. */
export const treatmentLabels: Record<VatTreatment, string> = {
  standard_rated: 'Standard Rated',
  zero_rated: 'Zero-Rated',
  exempt: 'Exempt',
  out_of_scope: 'Out of Scope',
  capital_goods: 'Capital Goods',
  import_vat: 'Import VAT',
  reverse_charge: 'Reverse Charge',
  non_deductible: 'Non-Deductible',
};

export const VAT_TREATMENTS: VatTreatment[] = [
  'standard_rated',
  'zero_rated',
  'exempt',
  'out_of_scope',
  'capital_goods',
  'import_vat',
  'reverse_charge',
  'non_deductible',
];
