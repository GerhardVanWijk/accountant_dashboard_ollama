import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Backwards compatibility for the old `?record=<id>` modal-state URLs.
 * Bookmarks, deep links, tests and any not-yet-migrated internal
 * navigation still land on `/sales/orders?record=<id>`; this redirects
 * them (replace, so Back still works) to the canonical
 * `/sales/orders/<id>` record page.
 *
 * Call it at the top of a *list* page. Returns nothing — the redirect is a
 * side effect.
 */
export function useLegacyRecordRedirect(basePath: string): void {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const recordId = searchParams.get('record');

  useEffect(() => {
    if (!recordId) return;
    const rest = new URLSearchParams(searchParams);
    rest.delete('record');
    const query = rest.toString();
    navigate(`${basePath}/${recordId}${query ? `?${query}` : ''}`, { replace: true });
  }, [recordId, basePath, navigate, searchParams]);
}
