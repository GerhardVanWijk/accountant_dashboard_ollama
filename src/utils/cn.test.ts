import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins truthy class values and drops falsy ones', () => {
    expect(cn('a', false, undefined, null, 'b', 0 && 'c')).toBe('a b');
  });

  it('flattens nested arrays', () => {
    expect(cn('a', ['b', ['c', false]])).toBe('a b c');
  });
});
