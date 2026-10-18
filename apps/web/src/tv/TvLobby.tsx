import { MAX_PLAYERS, MIN_PLAYERS } from '@gno/shared';
import { FloatingShapes } from '../components/FloatingShapes';
import { Logo } from '../components/Logo';
import { EmptySeat, PlayerCard } from '../components/PlayerCard';
import { buildJoinUrl } from '../joinUrl';
import { MusicControl } from './MusicControl';
import { QrCode } from './QrCode';
import { RoomCodeTiles } from './RoomCodeTiles';
import { TvGame } from './TvGame';
import { useHostRoom } from './useHostRoom';
import { useTvScale } from './useTvScale';

export function TvLobby() {
  useTvScale();
  const state = useHostRoom();

  if (state.status !== 'ready') {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-night-950 px-6 text-center">
        <FloatingShapes />
        <Logo className="relative text-6xl" />
        <p data-testid="tv-status" className="relative text-3xl font-semibold text-white/80">
          {state.status === 'error' ? `😕 ${state.message}` : 'Setting up your room… 🎈'}
        </p>
      </main>
    );
  }

  if (state.room.game) return <TvGame room={state.room} connected={state.connected} />;

  const roomCode = state.room.code;
  const players = state.room.players;
  const joinUrl = buildJoinUrl(window.location.origin, roomCode);
  const displayHost = new URL(joinUrl).host;
  const canStart = players.filter((p) => p.connected).length >= MIN_PLAYERS;
  const vip = players.find((p) => p.isVip);

  return (
    <main className="relative flex min-h-screen flex-col bg-[radial-gradient(ellipse_at_top,_var(--color-night-700),_var(--color-night-950)_70%)] px-6 py-5 lg:px-12 lg:py-8">
      <FloatingShapes />
      <header className="relative flex items-center justify-between gap-4">
        <Logo className="text-4xl lg:text-5xl" />
        <div className="flex items-center gap-4">
          {!state.connected && (
            <span
              role="status"
              className="rounded-full bg-pop-orange/20 px-4 py-1 text-lg font-semibold text-pop-orange"
            >
              📶 Reconnecting…
            </span>
          )}
          <MusicControl />
        </div>
      </header>

      <section className="relative mt-5 grid flex-1 gap-8 lg:grid-cols-[auto_1fr] lg:gap-14">
        <div className="flex flex-col items-center gap-4 lg:items-start">
          <div className="text-center lg:text-left">
            <p className="text-2xl font-semibold text-white/80">📱 Grab your phone and go to</p>
            <p className="text-3xl font-bold text-pop-cyan">{displayHost}</p>
          </div>
          <div className="flex flex-col items-center gap-2 lg:items-start">
            <p className="text-lg font-semibold uppercase tracking-[0.25em] text-white/60">
              Room code
            </p>
            <RoomCodeTiles code={roomCode} />
          </div>
          <div className="flex items-center gap-4">
            <QrCode value={joinUrl} size={168} />
            <p className="max-w-[9rem] text-lg font-medium leading-snug text-white/70">
              or scan me to jump right in! 👈
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-4xl font-bold">Who's playing? 🎉</h2>
            <p data-testid="player-count" className="text-2xl font-bold text-white/60">
              {players.length} / {MAX_PLAYERS}
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:gap-5">
            {players.map((player, index) => (
              <PlayerCard key={player.id} player={player} index={index} />
            ))}
            {Array.from({ length: MAX_PLAYERS - players.length }, (_, i) => (
              <EmptySeat key={`empty-${i}`} />
            ))}
          </ul>
          <p className="mt-auto rounded-[1.75rem] bg-night-800 px-6 py-4 text-center text-2xl font-semibold ring-2 ring-pop-violet/40">
            {canStart && vip ? (
              <>
                👑 <span className="font-bold text-pop-yellow">{vip.nickname}</span> starts the fun
                from their phone!
              </>
            ) : (
              `Waiting for at least ${MIN_PLAYERS} players… invite the whole family!`
            )}
          </p>
        </div>
      </section>
    </main>
  );
}
