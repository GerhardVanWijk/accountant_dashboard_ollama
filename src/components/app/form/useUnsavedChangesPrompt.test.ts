import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useUnsavedChangesPrompt } from './useUnsavedChangesPrompt';

describe('useUnsavedChangesPrompt', () => {
  it('registers a beforeunload handler only while dirty', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');

    const { rerender, unmount } = renderHook(({ dirty }) => useUnsavedChangesPrompt(dirty), {
      initialProps: { dirty: false },
    });
    expect(add).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));

    rerender({ dirty: true });
    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    rerender({ dirty: false });
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    unmount();
    add.mockRestore();
    remove.mockRestore();
  });

  it('the handler cancels the unload event', () => {
    let captured: ((e: BeforeUnloadEvent) => unknown) | undefined;
    vi.spyOn(window, 'addEventListener').mockImplementation((type, handler) => {
      if (type === 'beforeunload') captured = handler as never;
    });

    renderHook(() => useUnsavedChangesPrompt(true));

    const event = new Event('beforeunload') as BeforeUnloadEvent;
    const prevented = vi.spyOn(event, 'preventDefault');
    captured?.(event);
    expect(prevented).toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
