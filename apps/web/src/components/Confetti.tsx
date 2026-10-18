import type { CSSProperties } from 'react';
import { playerColor } from './playerColor';

const PIECES = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i % 7) * 0.12,
  duration: 1.8 + (i % 5) * 0.25,
  color: playerColor(i),
  round: i % 3 === 0,
}));

/** One celebratory burst of falling confetti. Purely decorative. */
export function Confetti() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {PIECES.map((piece, i) => (
        <span
          key={i}
          className={`absolute top-0 block h-3 w-2 animate-[confetti-fall_linear_both] ${piece.round ? 'rounded-full' : 'rounded-sm'}`}
          style={
            {
              left: `${piece.left}%`,
              backgroundColor: piece.color,
              animationDelay: `${piece.delay}s`,
              animationDuration: `${piece.duration}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
