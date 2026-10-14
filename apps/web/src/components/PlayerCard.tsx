import type { PublicPlayer } from '@gno/shared';
import { seatAvatar } from './avatars';
import { playerColor } from './playerColor';

export function PlayerCard({ player, index }: { player: PublicPlayer; index: number }) {
  const color = playerColor(player.seat);
  return (
    <li
      data-testid="player-card"
      data-connected={player.connected}
      className="relative flex animate-[pop-in_500ms_cubic-bezier(.34,1.56,.64,1)_both] flex-col items-center gap-3 rounded-[1.75rem] bg-night-800 p-5 ring-4"
      style={{ animationDelay: `${index * 120}ms`, ['--tw-ring-color' as string]: `${color}55` }}
    >
      {player.isVip && (
        <span className="absolute -top-3 right-3 rotate-6 rounded-full bg-pop-yellow px-2.5 py-0.5 text-sm font-bold text-night-950 shadow-[0_3px_0_#b8901a]">
          👑 VIP
        </span>
      )}
      <div
        className="grid size-20 animate-[bob_2.2s_ease-in-out_infinite] place-items-center rounded-full text-5xl shadow-[inset_0_-6px_0_rgba(0,0,0,0.18)]"
        style={{ backgroundColor: color, animationDelay: `${index * 0.3}s` }}
        aria-hidden
      >
        {seatAvatar(player.seat)}
      </div>
      <span className="max-w-full truncate text-2xl font-bold">{player.nickname}</span>
      {!player.connected && (
        <span className="absolute inset-x-3 bottom-2 rounded-full bg-night-950/80 py-0.5 text-center text-sm font-semibold text-white/70">
          📶 reconnecting…
        </span>
      )}
    </li>
  );
}

export function EmptySeat() {
  return (
    <li
      data-testid="empty-seat"
      className="flex flex-col items-center justify-center gap-3 rounded-[1.75rem] border-4 border-dashed border-white/10 p-5 text-white/30"
    >
      <div className="grid size-20 animate-[breathe_2.8s_ease-in-out_infinite] place-items-center rounded-full border-4 border-dashed border-white/15 text-4xl font-bold">
        ?
      </div>
      <span className="text-lg font-semibold">Saving a seat…</span>
    </li>
  );
}
