import { describe, it, expect } from 'vitest';
import { sha256Hex } from './sha256';

describe('sha256Hex', () => {
  it('matches the FIPS 180-4 test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('is deterministic and sensitive to any change', () => {
    expect(sha256Hex('hello world')).toBe(sha256Hex('hello world'));
    expect(sha256Hex('hello world')).not.toBe(sha256Hex('hello world '));
  });

  it('handles multi-byte UTF-8', () => {
    expect(sha256Hex('R47.66 — café')).toHaveLength(64);
    expect(sha256Hex('R47.66 — café')).toBe(sha256Hex('R47.66 — café'));
  });
});
