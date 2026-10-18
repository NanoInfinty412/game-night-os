import { useEffect } from 'react';

/**
 * Scales every rem-based size with the screen height, so the TV layout designed at 720p
 * fills a 1080p or 4K screen instead of leaving empty space, and shrinks to fit TV browsers that
 * report a small viewport (many Android TVs use 960x540). Restores the default on leave.
 */
export function useTvScale() {
  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = 'clamp(10px, 2.2vh, 48px)';
    return () => {
      root.style.fontSize = '';
    };
  }, []);
}
