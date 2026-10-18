export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Picks which box a remote's arrow key should move to: the nearest one whose centre lies in that
 * direction, preferring boxes straight ahead over ones off to the side. Returns -1 if none.
 */
export function nextIndex(from: Box, candidates: Box[], direction: Direction): number {
  const cx = from.x + from.width / 2;
  const cy = from.y + from.height / 2;
  let best = -1;
  let bestScore = Infinity;
  candidates.forEach((box, index) => {
    const bx = box.x + box.width / 2;
    const by = box.y + box.height / 2;
    const dx = bx - cx;
    const dy = by - cy;
    const ahead =
      direction === 'right' ? dx : direction === 'left' ? -dx : direction === 'down' ? dy : -dy;
    const side = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (ahead <= 1) return;
    const score = ahead + side * 2;
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}
