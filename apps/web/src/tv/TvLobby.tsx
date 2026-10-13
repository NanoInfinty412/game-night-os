import { MAX_PLAYERS, MIN_PLAYERS } from '@gno/shared';
import { Logo } from '../components/Logo';
import { EmptySeat, PlayerCard } from '../components/PlayerCard';
import { PreviewBadge } from '../components/PreviewBadge';
import { buildJoinUrl } from '../joinUrl';
import { SAMPLE_PLAYERS, SAMPLE_ROOM_CODE } from '../sampleData';
import { QrCode } from './QrCode';
import { useTvScale } from './useTvScale';

export function TvLobby() {
  useTvScale();
  const roomCode = SAMPLE_ROOM_CODE;
  const players = SAMPLE_PLAYERS;
  const joinUrl = buildJoinUrl(window.location.origin, roomCode);
  const displayHost = new URL(joinUrl).host;
  const canStart = players.length >= MIN_PLAYERS;

  return (
    <main className="flex min-h-screen flex-col bg-[radial-gradient(ellipse_at_top,_var(--color-night-700),_var(--color-night-950)_70%)] px-6 py-6 lg:px-14 lg:py-10">
      <header className="flex items-center justify-between gap-4">
        <Logo className="text-3xl lg:text-5xl" />
        <PreviewBadge />
      </header>

      <section className="mt-6 grid flex-1 gap-10 lg:grid-cols-[auto_1fr] lg:gap-16">
        <div className="flex flex-col items-center gap-5 lg:items-start">
          <div className="text-center lg:text-left">
            <p className="text-xl font-medium text-white/70 lg:text-2xl">Join on your phone at</p>
            <p className="text-2xl font-bold text-pop-cyan lg:text-3xl">{displayHost}</p>
          </div>
          <div className="text-center lg:text-left">
            <p className="text-lg font-medium uppercase tracking-[0.3em] text-white/60">
              Room code
            </p>
            <p
              data-testid="room-code"
              className="text-8xl font-extrabold tracking-[0.15em] text-pop-yellow drop-shadow-[0_6px_0_rgba(0,0,0,0.35)] lg:text-9xl"
            >
              {roomCode}
            </p>
          </div>
          <QrCode value={joinUrl} size={208} />
          <p className="text-lg text-white/60">or scan to jump straight in</p>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-3xl font-extrabold lg:text-4xl">Players</h2>
            <p data-testid="player-count" className="text-2xl font-bold text-white/60">
              {players.length} / {MAX_PLAYERS}
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:gap-6">
            {players.map((player, index) => (
              <PlayerCard key={player.id} player={player} index={index} />
            ))}
            {Array.from({ length: MAX_PLAYERS - players.length }, (_, i) => (
              <EmptySeat key={`empty-${i}`} />
            ))}
          </ul>
          <p className="mt-auto rounded-2xl bg-night-800/70 px-6 py-4 text-center text-2xl font-bold">
            {canStart ? (
              <>
                <span className="text-pop-yellow">{players.find((p) => p.isVip)?.nickname}</span>{' '}
                can start the game from their phone
              </>
            ) : (
              `Waiting for at least ${MIN_PLAYERS} players…`
            )}
          </p>
        </div>
      </section>
    </main>
  );
}
