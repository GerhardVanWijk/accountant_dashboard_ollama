import { describe, it, expect } from 'vitest';
import { ListIcon } from 'lucide-react';
import { SEMANTIC_ICONS, resolveTabHint, resolveTabIcon } from './semantic-icons';

describe('resolveTabIcon', () => {
  it('maps the common record-workspace tab slugs to sensible semantic icons', () => {
    expect(resolveTabIcon('overview', 'Overview')).toBe(SEMANTIC_ICONS.overview);
    expect(resolveTabIcon('line-items', 'Line items')).toBe(SEMANTIC_ICONS.lineItems);
    expect(resolveTabIcon('payments', 'Payments')).toBe(SEMANTIC_ICONS.payments);
    expect(resolveTabIcon('accounting', 'Accounting')).toBe(SEMANTIC_ICONS.accounting);
    expect(resolveTabIcon('related', 'Related records')).toBe(SEMANTIC_ICONS.relatedRecords);
    expect(resolveTabIcon('activity', 'Activity')).toBe(SEMANTIC_ICONS.activity);
    expect(resolveTabIcon('receiving', 'Receiving')).toBe(SEMANTIC_ICONS.receiving);
    expect(resolveTabIcon('transactions', 'Traceability')).toBe(SEMANTIC_ICONS.traceability);
  });

  it('falls back to a neutral list icon for an unknown tab', () => {
    expect(resolveTabIcon('xyzzy', 'Frobnicate')).toBe(ListIcon);
  });
});

describe('resolveTabHint', () => {
  it('spells out counts and gives obvious tabs no tooltip subtitle', () => {
    expect(resolveTabHint('overview', 'Overview')).toBeUndefined();
    expect(resolveTabHint('related', 'Related records', 12)).toBe('12 related records');
    expect(resolveTabHint('related', 'Related records', 1)).toBe('1 related record');
    expect(resolveTabHint('payments', 'Payments', 3)).toBe('3 payments');
  });

  it('gives a descriptive subtitle for a count-less semantic tab', () => {
    expect(resolveTabHint('accounting', 'Accounting')).toMatch(/accounts, journals/i);
    expect(resolveTabHint('activity', 'Activity')).toMatch(/change history/i);
    expect(resolveTabHint('documents', 'Documents')).toMatch(/related business documents/i);
  });
});
