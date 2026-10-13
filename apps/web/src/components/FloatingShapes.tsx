import type { CSSProperties } from 'react';

// Fixed positions so the background looks the same on every render and in screenshots.
const SHAPES: {
  kind: 'circle' | 'star' | 'squiggle' | 'triangle';
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
}[] = [
  { kind: 'star', x: 6, y: 78, size: 3.2, color: 'var(--color-pop-yellow)', delay: 0 },
  { kind: 'circle', x: 18, y: 12, size: 2, color: 'var(--color-pop-pink)', delay: 1.5 },
  { kind: 'squiggle', x: 33, y: 88, size: 4, color: 'var(--color-pop-cyan)', delay: 3 },
  { kind: 'triangle', x: 47, y: 6, size: 2.6, color: 'var(--color-pop-lime)', delay: 0.8 },
  { kind: 'circle', x: 62, y: 92, size: 1.6, color: 'var(--color-pop-yellow)', delay: 2.2 },
  { kind: 'star', x: 76, y: 10, size: 2.4, color: 'var(--color-pop-cyan)', delay: 4 },
  { kind: 'squiggle', x: 90, y: 70, size: 3.6, color: 'var(--color-pop-pink)', delay: 1 },
  { kind: 'triangle', x: 95, y: 30, size: 2, color: 'var(--color-pop-orange)', delay: 2.8 },
  { kind: 'circle', x: 3, y: 40, size: 1.4, color: 'var(--color-pop-violet)', delay: 3.6 },
  { kind: 'star', x: 55, y: 50, size: 1.6, color: 'var(--color-pop-violet)', delay: 5 },
];

function Shape({ kind, color }: { kind: string; color: string }) {
  switch (kind) {
    case 'star':
      return (
        <path
          d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z"
          fill={color}
        />
      );
    case 'triangle':
      return <path d="M12 3l9 17H3z" fill={color} />;
    case 'squiggle':
      return (
        <path
          d="M2 12c3-6 5-6 7 0s4 6 7 0 5-6 6 0"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
        />
      );
    default:
      return <circle cx="12" cy="12" r="9" fill={color} />;
  }
}

/** Slowly drifting confetti shapes behind the content. Purely decorative. */
export function FloatingShapes() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {SHAPES.map((shape, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className="absolute animate-[drift_9s_ease-in-out_infinite] opacity-35"
          style={
            {
              left: `${shape.x}%`,
              top: `${shape.y}%`,
              width: `${shape.size}rem`,
              height: `${shape.size}rem`,
              animationDelay: `-${shape.delay}s`,
            } as CSSProperties
          }
        >
          <Shape kind={shape.kind} color={shape.color} />
        </svg>
      ))}
    </div>
  );
}
