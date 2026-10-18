import type { CSSProperties } from 'react';
import { playerColor } from '../components/playerColor';

/** The room code as bouncy letter tiles, easy to read from across the room. */
export function RoomCodeTiles({ code }: { code: string }) {
  return (
    <p
      data-testid="room-code"
      aria-label={`Room code ${code.split('').join(' ')}`}
      className="flex gap-3"
    >
      {code.split('').map((letter, i) => (
        <span
          key={i}
          aria-hidden
          className="grid size-[5.5rem] animate-[tile-bounce_2.6s_ease-in-out_infinite] place-items-center rounded-2xl text-7xl font-bold text-night-950 shadow-[inset_0_-0.4rem_0_rgba(0,0,0,0.2),0_0.35rem_0_rgba(0,0,0,0.3)]"
          style={
            {
              backgroundColor: playerColor(i + 1),
              animationDelay: `${i * 0.18}s`,
              '--tilt': `${i % 2 === 0 ? -3 : 3}deg`,
            } as CSSProperties
          }
        >
          {letter}
        </span>
      ))}
    </p>
  );
}
