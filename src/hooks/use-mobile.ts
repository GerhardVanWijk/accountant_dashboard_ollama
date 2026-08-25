import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * Ported verbatim from accounting-v0-frontend/hooks/use-mobile.ts.
 * Kebab-case filename (unlike this app's own useClickOutside.ts/useTheme.ts
 * convention) because src/components/ui/shadcn/sidebar.tsx hardcodes the
 * import path '@/hooks/use-mobile' — matching it exactly means zero edits
 * to the ported shadcn file itself.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener('change', onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return !!isMobile;
}
