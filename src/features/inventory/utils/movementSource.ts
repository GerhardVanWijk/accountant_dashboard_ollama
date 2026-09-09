import type { StockMovement, StockMovementSourceType } from '@/types';
import { parseLegacyReference } from '@/components/app/record-page';

/**
 * True when `movement` belongs to the document (`type`, `id`) — checking the
 * structured `sourceDocumentType` / `sourceDocumentId` columns first, then
 * falling back to a parsed legacy `"<type>:<uuid>"` free-text `reference`.
 *
 * The fallback matters because a window of movements (and, before the
 * 2026-09-10 repository fix, effectively all of them at read time) surface
 * without the structured columns — so a naive
 * `m.sourceDocumentType === type && m.sourceDocumentId === id` filter
 * silently attributed nothing, which is why a fully-received Purchase Order
 * still showed "Received 0".
 */
export function movementMatchesSource(
  movement: StockMovement,
  type: StockMovementSourceType,
  id: string,
): boolean {
  if (movement.sourceDocumentType && movement.sourceDocumentId) {
    return movement.sourceDocumentType === type && movement.sourceDocumentId === id;
  }
  const legacy = parseLegacyReference(movement.reference);
  return legacy != null && legacy.type === type && legacy.id === id;
}

/** Filter a movement list to those attributable to one source document. */
export function movementsForSource(
  movements: readonly StockMovement[],
  type: StockMovementSourceType,
  id: string | undefined,
): StockMovement[] {
  if (!id) return [];
  return movements.filter((m) => movementMatchesSource(m, type, id));
}
