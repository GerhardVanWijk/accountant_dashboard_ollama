import type { ColumnMapping, ImportFieldDef, SuggestedMapping } from './types';

/** Case/punctuation/whitespace-insensitive comparison key — "Cost Ex VAT", "cost-ex-vat" and "COST_EX_VAT" all normalize identically. */
function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Suggests a column mapping by exact (normalized) match against each
 * field's label + `aliases` list — never a fuzzy/partial match, so every
 * suggestion is either right or absent, never a confident-looking guess
 * that's actually wrong (spec §5: "do not guess mappings silently if
 * confidence is low"). The caller always renders the result for the user
 * to review/override — this never applies itself.
 *
 * A header matching more than one field (e.g. two columns both aliasing
 * "Cost") resolves first-column-wins, left to right, so the mapping is
 * deterministic; a field with no matching header is left unmapped.
 */
export function suggestColumnMapping(headers: string[], fields: ImportFieldDef[]): SuggestedMapping {
  const normalizedHeaders = headers.map(normalizeHeader);
  const mapping: ColumnMapping = {};
  const confident: Record<string, boolean> = {};

  for (const field of fields) {
    const candidates = [field.label, ...field.aliases].map(normalizeHeader);
    const columnIndex = normalizedHeaders.findIndex((h) => h.length > 0 && candidates.includes(h));
    if (columnIndex !== -1) {
      mapping[field.key] = columnIndex;
      confident[field.key] = true;
    } else {
      mapping[field.key] = undefined;
      confident[field.key] = false;
    }
  }

  return { mapping, confident };
}

/** Every required field in `fields` has a mapped column in `mapping`. */
export function hasAllRequiredMappings(mapping: ColumnMapping, fields: ImportFieldDef[]): boolean {
  return fields.filter((f) => f.required).every((f) => mapping[f.key] !== undefined);
}

/** Applies a `ColumnMapping` to one parsed data row, producing the `fieldKey → cell value` shape every adapter's `normalizeRow()` consumes. */
export function mapRow(row: (string | number | boolean | Date | undefined)[], mapping: ColumnMapping, fields: ImportFieldDef[]): Record<string, string | number | boolean | Date | undefined> {
  const raw: Record<string, string | number | boolean | Date | undefined> = {};
  for (const field of fields) {
    const columnIndex = mapping[field.key];
    raw[field.key] = columnIndex === undefined ? undefined : row[columnIndex];
  }
  return raw;
}
