import { describe, expect, it } from 'vitest';
import { getGreeting } from './getGreeting';

describe('getGreeting', () => {
  it('returns a morning greeting before noon', () => {
    expect(getGreeting(new Date('2026-08-20T08:00:00'))).toBe('Good morning');
  });

  it('returns an afternoon greeting between noon and 6pm', () => {
    expect(getGreeting(new Date('2026-08-20T14:00:00'))).toBe('Good afternoon');
  });

  it('returns an evening greeting after 6pm', () => {
    expect(getGreeting(new Date('2026-08-20T20:00:00'))).toBe('Good evening');
  });
});
