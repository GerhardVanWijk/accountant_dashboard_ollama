import { useAuthStore } from '@/stores/authStore';
import { CORE_ENTITLEMENTS, type EntitlementKey } from '../entitlements';
import { useEntitlementStore } from '../stores/entitlementStore';

/**
 * Layer 2 gate — "does this company's plan include this module?".
 *
 * - `superuser` always passes (explicit, auditable support access).
 * - A company **Admin does NOT bypass** — a commercial plan restriction is
 *   not an access-control question (see docs/PLAN_ENTITLEMENTS.md).
 * - Core features always pass.
 * - Until the store has loaded (or if the resolver call failed), this
 *   returns `true` — the frontend gate is UX, never the security boundary,
 *   and a resolver outage must not lock a paying customer out of their own
 *   books. Sensitive writes are still guarded server-side by
 *   `require_entitlement(...)`.
 */
export function useEntitlement(key: EntitlementKey): boolean {
  const role = useAuthStore((s) => s.profile?.role);
  const loaded = useEntitlementStore((s) => s.loaded);
  const has = useEntitlementStore((s) => s.entitlements.has(key));

  if (role === 'superuser') return true;
  if (CORE_ENTITLEMENTS.includes(key)) return true;
  if (!loaded) return true;
  return has;
}

/** The whole entitlement set (for the sidebar / upgrade page). */
export function useEntitlements() {
  return useEntitlementStore((s) => s.entitlements);
}

export function useSubscription() {
  return useEntitlementStore((s) => s.subscription);
}

export function usePlanCode(): string | null {
  return useEntitlementStore((s) => s.planCode);
}
