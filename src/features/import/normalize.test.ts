import { describe, it, expect } from 'vitest';
import { asString, asNumber, asBoolean, asISODate, requireField } from './normalize';

describe('asString', () => {
  it('trims and returns a string', () => {
    expect(asString('  Widget  ')).toBe('Widget');
  });
  it('returns undefined for blank/missing', () => {
    expect(asString(undefined)).toBeUndefined();
    expect(asString('   ')).toBeUndefined();
  });
  it('stringifies a number', () => {
    expect(asString(42)).toBe('42');
  });
});

describe('asNumber', () => {
  it('passes a real number through', () => {
    expect(asNumber(1.5)).toBe(1.5);
  });
  it('parses a plain numeric string', () => {
    expect(asNumber('123.45')).toBe(123.45);
  });
  it('strips currency symbols and thousands separators (international convention)', () => {
    expect(asNumber('$1,234.56')).toBe(1234.56);
  });
  it('parses South African "1 234,56" comma-decimal convention', () => {
    expect(asNumber('R 1 234,56')).toBe(1234.56);
  });
  it('returns undefined for blank/missing, not zero', () => {
    expect(asNumber(undefined)).toBeUndefined();
    expect(asNumber('')).toBeUndefined();
  });
  it('returns undefined for unparseable text', () => {
    expect(asNumber('not a number')).toBeUndefined();
  });
  it('returns undefined for a Date', () => {
    expect(asNumber(new Date())).toBeUndefined();
  });
});

describe('asBoolean', () => {
  it('passes a real boolean through', () => {
    expect(asBoolean(true)).toBe(true);
    expect(asBoolean(false)).toBe(false);
  });
  it('treats a nonzero number as true, zero as false', () => {
    expect(asBoolean(1)).toBe(true);
    expect(asBoolean(0)).toBe(false);
  });
  it('recognizes common text tokens', () => {
    expect(asBoolean('Yes')).toBe(true);
    expect(asBoolean('no')).toBe(false);
    expect(asBoolean('Active')).toBe(true);
    expect(asBoolean('inactive')).toBe(false);
  });
  it('returns undefined for an unrecognized token', () => {
    expect(asBoolean('maybe')).toBeUndefined();
  });
});

describe('asISODate', () => {
  it('formats a real Date object as YYYY-MM-DD', () => {
    expect(asISODate(new Date(Date.UTC(2026, 7, 1)))).toBe('2026-08-01');
  });
  it('parses an ISO date string', () => {
    expect(asISODate('2026-08-01')).toBe('2026-08-01');
  });
  it('parses South African DD/MM/YYYY convention', () => {
    expect(asISODate('01/08/2026')).toBe('2026-08-01');
  });
  it('returns undefined for missing/unparseable input', () => {
    expect(asISODate(undefined)).toBeUndefined();
    expect(asISODate('not a date')).toBeUndefined();
  });
});

describe('requireField', () => {
  it('pushes an error and returns true when missing', () => {
    const messages: { field?: string; message: string; severity: 'warning' | 'error' }[] = [];
    const missing = requireField(undefined, 'sku', 'SKU', messages);
    expect(missing).toBe(true);
    expect(messages).toEqual([{ field: 'sku', message: 'SKU is required.', severity: 'error' }]);
  });
  it('returns false and pushes nothing when present', () => {
    const messages: { field?: string; message: string; severity: 'warning' | 'error' }[] = [];
    expect(requireField('PEN-1', 'sku', 'SKU', messages)).toBe(false);
    expect(messages).toEqual([]);
  });
});
