import { useState } from 'react';
import type { ReturnNote } from '@/types';
import { returnNoteService, type CreateReturnNoteDTO, type UpdateReturnNoteDTO } from '../services';

export interface UseReturnNoteMutationsOptions {
  onSuccess?: (returnNote: ReturnNote) => void;
  onError?: (error: Error) => void;
}

/** Hook to handle return note mutations — create/update/cancel/post (Phase 5D). */
export function useReturnNoteMutations(options?: UseReturnNoteMutationsOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function run<T>(fn: () => Promise<T>, notify: (result: T) => void): Promise<T> {
    try {
      setIsLoading(true);
      setError(null);
      const result = await fn();
      notify(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  const createDraft = (dto: CreateReturnNoteDTO) =>
    run(() => returnNoteService.createDraft(dto), (rn) => options?.onSuccess?.(rn));

  const updateDraft = (id: string, patch: UpdateReturnNoteDTO) =>
    run(() => returnNoteService.updateDraft(id, patch), (rn) => options?.onSuccess?.(rn));

  const cancelDraft = (id: string) =>
    run(() => returnNoteService.cancelDraft(id), (rn) => options?.onSuccess?.(rn));

  const deleteDraft = (id: string) =>
    run(() => returnNoteService.deleteDraft(id), () => options?.onSuccess?.(null as unknown as ReturnNote));

  const postReturnNote = (id: string) =>
    run(() => returnNoteService.postReturnNote(id), (rn) => options?.onSuccess?.(rn));

  return {
    isLoading,
    error,
    createDraft,
    updateDraft,
    cancelDraft,
    deleteDraft,
    postReturnNote,
  };
}
