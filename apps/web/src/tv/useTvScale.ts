import { useEffect } from 'react';

/**
 * Scales every rem-based size with the screen height, so the TV layout designed at 720p
 * fills a 1080p or 4K screen instead of leaving empty space. Restores the default on leave.
 */
export function useTvScale() {
  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = 'clamp(16px, 2.2vh, 48px)';
    return () => {
      root.style.fontSize = '';
    };
  }, []);
}
