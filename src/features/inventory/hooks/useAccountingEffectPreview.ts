import { useEffect, useState } from 'react';
import type { AccountingEffectPreview } from '../types/accountingPreview';

interface PreviewState {
  preview: AccountingEffectPreview | null;
  previewLoading: boolean;
  previewError: string | undefined;
}

/**
 * Loads the `previewAccountingEffect()` (or dispatch/receive/post variant)
 * result for a record-detail page — the exact journal entry a post/confirm
 * would create, recomputed live from the same line-builder that posts.
 * Extracted from the (identical) useEffect in every inventory
 * *DetailSheet so the full-page *DetailPage components share one copy.
 *
 * Pass `loader = undefined` (e.g. a completed/cancelled record with nothing
 * left to post) to clear the preview.
 */
export function useAccountingEffectPreview(
  loader: ((id: string) => Promise<AccountingEffectPreview>) | undefined,
  id: string | undefined,
): PreviewState {
  const [preview, setPreview] = useState<AccountingEffectPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!id || !loader) {
      setPreview(null);
      setPreviewError(undefined);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(undefined);
    loader(id)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : 'Failed to calculate the accounting effect.');
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loader, id]);

  return { preview, previewLoading, previewError };
}
