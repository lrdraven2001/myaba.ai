import { useEffect, useState } from 'react';

/**
 * True when the viewport is below Tailwind's `md` breakpoint (768px).
 * Used for structural layout changes that CSS alone can't express cleanly
 * (e.g. the chat master-detail: single pane on mobile, dual pane on desktop).
 */
export function useIsMobile(query = '(max-width: 767px)'): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setIsMobile(mql.matches);
    update(); // set the initial value in an effect (never call matchMedia during render)
    // Listen to both the media-query change and window resize — some environments
    // (device emulation, older Safari) don't fire matchMedia 'change' reliably.
    mql.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      mql.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, [query]);
  return isMobile;
}
