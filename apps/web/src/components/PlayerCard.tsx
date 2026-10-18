import type { PublicPlayer } from '@gno/shared';
import { seatAvatar } from './avatars';
import { playerColor } from './playerColor';

export function PlayerCard({
  player,
  index,
  compact = false,
}: {
  player: PublicPlayer;
  index: number;
  /** Smaller card for the TV lobby, which also shows the game menu. */
  compact?: boolean;
}) {
  const color = playerColor(player.seat);
  return (
    <li
      data-testid="player-card"
      data-connected={player.connected}
      className={`relative flex animate-[pop-in_500ms_cubic-bezier(.34,1.56,.64,1)_both] flex-col items-center rounded-[1.75rem] bg-night-800 ring-4 ${compact ? 'gap-1.5 p-3' : 'gap-3 p-5'}`}
      style={{ animationDelay: `${index * 120}ms`, ['--tw-ring-color' as string]: `${color}55` }}
    >
      {player.isVip && (
        <span className="absolute -top-3 right-3 rotate-6 rounded-full bg-pop-yellow px-2.5 py-0.5 text-sm font-bold text-night-950 shadow-[0_3px_0_#b8901a]">
          👑 VIP
        </span>
      )}
      <div
        className={`grid animate-[bob_2.2s_ease-in-out_infinite] place-items-center rounded-full shadow-[inset_0_-6px_0_rgba(0,0,0,0.18)] ${compact ? 'size-14 text-4xl' : 'size-20 text-5xl'}`}
        style={{ backgroundColor: color, animationDelay: `${index * 0.3}s` }}
        aria-hidden
      >
        {seatAvatar(player.seat)}
      </div>
      <span className={`max-w-full truncate font-bold ${compact ? 'text-xl' : 'text-2xl'}`}>
        {player.nickname}
      </span>
      {!player.connected && (
        <span className="absolute inset-x-3 bottom-2 rounded-full bg-night-950/80 py-0.5 text-center text-sm font-semibold text-white/70">
          📶 reconnecting…
        </span>
      )}
    </li>
  );
}

export function EmptySeat({ compact = false }: { compact?: boolean }) {
  return (
    <li
      data-testid="empty-seat"
      className={`flex flex-col items-center justify-center rounded-[1.75rem] border-4 border-dashed border-white/10 text-white/30 ${compact ? 'gap-1.5 p-3' : 'gap-3 p-5'}`}
    >
      <div
        className={`grid animate-[breathe_2.8s_ease-in-out_infinite] place-items-center rounded-full border-4 border-dashed border-white/15 font-bold ${compact ? 'size-14 text-3xl' : 'size-20 text-4xl'}`}
      >
        ?
      </div>
      <span className={`font-semibold ${compact ? 'text-base' : 'text-lg'}`}>Saving a seat…</span>
    </li>
  );
}
