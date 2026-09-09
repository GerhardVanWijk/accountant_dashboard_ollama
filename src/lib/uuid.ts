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

/**
 * Canonical RFC-4122 shape: 8-4-4-4-12 hex, any version/variant nibble.
 * Kept deliberately permissive on the version digit so a UUID minted by any
 * source (Postgres `gen_random_uuid()`, `crypto.randomUUID()`, an imported
 * record) is accepted — the only thing we reject is a value Postgres's
 * `uuid` type would choke on.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is a string Postgres would accept as `uuid`. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

/**
 * A boundary guard for any identifier about to be handed to a Postgres
 * `uuid` parameter: returns the trimmed UUID when `value` is one, otherwise
 * `null`. A non-UUID (e.g. a client-generated draft line id like
 * `li_1788987659412` that was persisted into a jsonb `lineItems` array
 * before this app minted real UUIDs for document lines) can never be stored
 * in a `uuid` column anyway — passing `null` keeps the document-level
 * `source_document_id` link intact and stops an `invalid input syntax for
 * type uuid` error from aborting an otherwise-valid posting.
 */
export function coerceUuidOrNull(value: unknown): string | null {
  return isUuid(value) ? (value as string).trim() : null;
}
