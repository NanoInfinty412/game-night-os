import { useEffect } from 'react';
import { nextIndex, type Direction } from './spatialNav';

const KEYS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

function candidates(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-nav]')].filter(
    (el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0,
  );
}

/**
 * Lets a TV remote (arrow keys + Enter) move between every element marked `data-nav`. The first
 * arrow press focuses `data-nav-default` (or the first element); Enter clicks the focused button.
 */
export function useSpatialNav() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const direction = KEYS[event.key];
      if (!direction) return;
      const items = candidates();
      if (items.length === 0) return;
      event.preventDefault();
      const current = document.activeElement as HTMLElement | null;
      if (!current || !items.includes(current)) {
        (items.find((el) => el.hasAttribute('data-nav-default')) ?? items[0])!.focus();
        return;
      }
      const rect = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      };
      const others = items.filter((el) => el !== current);
      const index = nextIndex(rect(current), others.map(rect), direction);
      if (index >= 0) others[index]!.focus();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
