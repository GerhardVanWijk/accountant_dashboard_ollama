import { useEffect, type RefObject } from 'react';

/**
 * Invokes `handler` on a mousedown/touchstart outside `ref`'s element, and
 * on Escape. Used by dismissable nav dropdowns/menus (top-bar section
 * dropdowns, the account menu, the mobile slide-over).
 */
export function useClickOutside(
  ref: RefObject<HTMLElement>,
  active: boolean,
  handler: () => void,
): void {
  useEffect(() => {
    if (!active) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (ref.current && !ref.current.contains(target)) {
        handler();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handler();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, active, handler]);
}
