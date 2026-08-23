/**
 * Postgres SQLSTATE 22P02 ("invalid_text_representation") — what Postgres
 * raises when a `uuid`-typed column is queried with a string that isn't a
 * valid UUID at all (as opposed to a well-formed UUID that simply doesn't
 * match any row). Every `IRepository<T>.getById()` contract in this
 * codebase promises `Promise<T | undefined>` with no assumption about the
 * id's format — a Mock repository's `Array.find()` returns `undefined` for
 * ANY unrecognized id, malformed or not. A Supabase repository must match
 * that: a malformed id is still just "not found", not a different kind of
 * failure the caller has to special-case.
 *
 * This matters beyond tidiness: `billService.test.ts` surfaced it for
 * real (docs/SUPABASE_MIGRATION_GUIDE.md Phase D) — `billService`'s live
 * singleton depends on the real `taxRateService`, and still-Mock
 * Purchases fixtures reference old Mock-style tax rate ids (e.g.
 * `"tax_std_v2"`) that were never valid UUIDs to begin with. Without this
 * check, every such cross-reference from a not-yet-migrated module throws
 * instead of resolving to "not found" the way it always did against Mock.
 */
export function isInvalidUuidError(error: { code?: string } | null): boolean {
  return error?.code === '22P02';
}
