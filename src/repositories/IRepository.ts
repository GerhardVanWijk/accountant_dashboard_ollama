/**
 * Generic data-access contract every repository implements.
 *
 * Per docs/DECISIONS.md (ADR 001), concrete implementations for Phase 0
 * live under src/repositories/mock/ as stateful in-memory stores. A future
 * REST/Supabase-backed implementation can satisfy the same contract
 * without any caller (service/hook) needing to change.
 *
 * RULE (docs/ARCHITECTURE.md / docs/DO_NOT_BREAK.md): components must
 * NEVER import a repository directly. Access data only through a hook
 * that calls a service, which calls a repository.
 */
export interface IRepository<T, TId = string> {
  getAll(): Promise<T[]>;
  getById(id: TId): Promise<T | undefined>;
  create(entity: T): Promise<T>;
  update(id: TId, patch: Partial<T>): Promise<T>;
  delete(id: TId): Promise<void>;
}
