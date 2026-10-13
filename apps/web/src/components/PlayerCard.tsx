import type { PublicPlayer } from '@gno/shared';
import { playerColor } from './playerColor';

export function PlayerCard({ player, index }: { player: PublicPlayer; index: number }) {
  const color = playerColor(index);
  return (
    <li
      data-testid="player-card"
      className="flex animate-[pop-in_400ms_ease-out_both] flex-col items-center gap-3 rounded-3xl bg-night-800 p-5 ring-2 ring-white/5"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <div
        className="grid size-20 place-items-center rounded-full text-4xl font-extrabold text-night-950 lg:size-24 lg:text-5xl"
        style={{ backgroundColor: color }}
        aria-hidden
      >
        {player.nickname.charAt(0).toUpperCase()}
      </div>
      <div className="flex items-center gap-2 text-xl font-bold lg:text-2xl">
        <span className="max-w-[10ch] truncate">{player.nickname}</span>
        {player.isVip && (
          <span className="rounded-md bg-pop-yellow px-1.5 py-0.5 text-xs font-extrabold text-night-950">
            VIP
          </span>
        )}
      </div>
    </li>
  );
}

export function EmptySeat() {
  return (
    <li
      data-testid="empty-seat"
      className="flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-white/10 p-5 text-white/25"
    >
      <div className="size-20 rounded-full border-2 border-dashed border-white/10 lg:size-24" />
      <span className="text-lg font-medium">Open seat</span>
    </li>
  );
}
