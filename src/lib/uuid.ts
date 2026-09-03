/**
 * A random RFC-4122 v4 UUID.
 *
 * Used to give a logical financial action (e.g. one "apply this customer
 * deposit to this invoice" intent) a STABLE, immutable identity that is
 * generated client-side BEFORE it is posted — so a retry of the same intent
 * re-uses the same id and the server can de-duplicate it, while a genuinely
 * new action gets a fresh id. Never derived from mutable state such as an
 * array length.
 *
 * `crypto.randomUUID` is available in every browser this app targets (it
 * runs over HTTPS) and in the Node/jsdom test runtime; the manual fallback
 * exists only so this never throws in an exotic environment.
 */
export function newUuid(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
