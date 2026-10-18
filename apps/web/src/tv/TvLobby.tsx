import { GAMES, MAX_PLAYERS, MIN_PLAYERS, gameInfo, type GameId } from '@gno/shared';
import { FloatingShapes } from '../components/FloatingShapes';
import { Logo } from '../components/Logo';
import { EmptySeat, PlayerCard } from '../components/PlayerCard';
import { buildJoinUrl } from '../joinUrl';
import { MusicControl } from './MusicControl';
import { QrCode } from './QrCode';
import { RoomCodeTiles } from './RoomCodeTiles';
import { TvGame } from './TvGame';
import { useHostRoom, type HostEvent } from './useHostRoom';
import { useSpatialNav } from './useSpatialNav';
import { useTvScale } from './useTvScale';

export function TvLobby() {
  useTvScale();
  useSpatialNav();
  const { state, send } = useHostRoom();

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

  if (state.room.game) return <TvGame room={state.room} connected={state.connected} send={send} />;

  const roomCode = state.room.code;
  const players = state.room.players;
  const joinUrl = buildJoinUrl(window.location.origin, roomCode);
  const displayHost = new URL(joinUrl).host;
  const canStart = players.filter((p) => p.connected).length >= MIN_PLAYERS;
  const vip = players.find((p) => p.isVip);
  const selected = gameInfo(state.room.selectedGame);

  return (
    <main className="relative flex h-screen flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--color-night-700),_var(--color-night-950)_70%)] px-8 py-4">
      <FloatingShapes />
      <header className="relative flex items-center justify-between gap-4">
        <Logo className="text-4xl" />
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

      <section className="relative mt-3 grid min-h-0 flex-1 grid-cols-[auto_1fr] gap-8">
        <div className="flex flex-col items-start gap-3">
          <div>
            <p className="text-xl font-semibold text-white/80">📱 Grab your phone and go to</p>
            <p className="text-2xl font-bold text-pop-cyan">{displayHost}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-base font-semibold uppercase tracking-[0.25em] text-white/60">
              Room code
            </p>
            <RoomCodeTiles code={roomCode} />
          </div>
          <div className="flex items-center gap-4">
            <QrCode value={joinUrl} size={132} />
            <p className="max-w-[8rem] text-lg font-medium leading-snug text-white/70">
              or scan me to jump right in! 👈
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-3xl font-bold">Who's playing? 🎉</h2>
            <p data-testid="player-count" className="text-2xl font-bold text-white/60">
              {players.length} / {MAX_PLAYERS}
            </p>
          </div>
          <ul className="grid grid-cols-4 gap-3">
            {players.map((player, index) => (
              <PlayerCard key={player.id} player={player} index={index} compact />
            ))}
            {Array.from({ length: MAX_PLAYERS - players.length }, (_, i) => (
              <EmptySeat key={`empty-${i}`} compact />
            ))}
          </ul>
        </div>
      </section>

      <GameMenu selected={state.room.selectedGame} send={send} />

      <div className="relative mt-3 flex items-center gap-4 rounded-[1.75rem] bg-night-800 px-5 py-3 ring-2 ring-pop-violet/40">
        <p className="flex-1 text-xl font-semibold" data-testid="lobby-banner">
          <span className="font-bold" style={{ color: selected.color }}>
            {selected.emoji} {selected.title}:
          </span>{' '}
          <span className="text-white/80">{selected.tagline}</span>
          <span className="block text-lg text-white/60">
            {canStart && vip ? (
              <>
                👑 <span className="font-bold text-pop-yellow">{vip.nickname}</span> starts the fun
                from their phone! Or press Start with the remote.
              </>
            ) : (
              `Waiting for at least ${MIN_PLAYERS} players… invite the whole family!`
            )}
          </span>
        </p>
        <button
          type="button"
          data-nav
          data-testid="tv-start"
          disabled={!canStart}
          onClick={() => void send('game:start')}
          className="rounded-[1.25rem] bg-pop-pink px-7 py-3 text-3xl font-bold text-night-950 shadow-[0_0.4rem_0_#b02a66] transition focus:scale-105 disabled:opacity-40"
        >
          Start ▶
        </button>
      </div>
    </main>
  );
}

function GameMenu({
  selected,
  send,
}: {
  selected: GameId;
  send: (event: HostEvent, payload?: unknown) => Promise<unknown>;
}) {
  return (
    <nav aria-label="Choose a game" className="relative mt-3">
      <ul className="grid grid-cols-8 gap-3">
        {GAMES.map((game) => {
          const isSelected = game.id === selected;
          return (
            <li key={game.id}>
              <button
                type="button"
                data-nav
                {...(isSelected && { 'data-nav-default': true })}
                data-testid="game-card"
                aria-pressed={isSelected}
                onClick={() => void send('game:select', { gameId: game.id })}
                className={`flex h-[6.5rem] w-full flex-col items-center justify-center gap-1 rounded-[1.25rem] px-2 text-center transition focus:scale-105 ${isSelected ? 'text-night-950' : 'bg-night-800 text-white'}`}
                style={{
                  ...(isSelected && { backgroundColor: game.color }),
                  boxShadow: isSelected
                    ? `0 0.35rem 0 rgba(0,0,0,0.35)`
                    : `inset 0 0 0 0.2rem ${game.color}66`,
                }}
              >
                <span className="text-4xl" aria-hidden>
                  {game.emoji}
                </span>
                <span className="text-base font-bold leading-tight">{game.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
