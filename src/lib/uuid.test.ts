import { describe, it, expect } from 'vitest';
import { newUuid, isUuid, coerceUuidOrNull } from './uuid';

describe('newUuid', () => {
  it('produces a canonical RFC-4122 v4 UUID', () => {
    const id = newUuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(isUuid(id)).toBe(true);
  });

  it('is unique across calls', () => {
    const seen = new Set(Array.from({ length: 200 }, () => newUuid()));
    expect(seen.size).toBe(200);
  });
});

describe('isUuid', () => {
  it('accepts canonical UUIDs (any version nibble), trimming surrounding whitespace', () => {
    expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(isUuid('7C9E6679-7425-40DE-944B-E07FC1F90AE7')).toBe(true);
    expect(isUuid('  7c9e6679-7425-40de-944b-e07fc1f90ae7  ')).toBe(true);
  });

  it('rejects the client-generated draft line ids that caused the PO defect', () => {
    expect(isUuid('li_1788987659412')).toBe(false);
    expect(isUuid('li_1788987659412_0')).toBe(false);
  });

  it('rejects other non-UUID values', () => {
    expect(isUuid('')).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('7c9e6679-7425-40de-944b-e07fc1f90ae')).toBe(false); // too short
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(12345)).toBe(false);
  });
});

describe('coerceUuidOrNull', () => {
  it('passes a real UUID through (trimmed)', () => {
    expect(coerceUuidOrNull('  7c9e6679-7425-40de-944b-e07fc1f90ae7 ')).toBe('7c9e6679-7425-40de-944b-e07fc1f90ae7');
  });

  it('maps a non-UUID identifier to null so it can never reach a Postgres uuid parameter', () => {
    expect(coerceUuidOrNull('li_1788987659412')).toBeNull();
    expect(coerceUuidOrNull('')).toBeNull();
    expect(coerceUuidOrNull(undefined)).toBeNull();
  });
});
