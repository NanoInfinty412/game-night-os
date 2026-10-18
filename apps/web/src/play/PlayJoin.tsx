import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  GAMES,
  MIN_PLAYERS,
  gameInfo,
  NICKNAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  joinRequestSchema,
  type JoinRequest,
  type PlayerSession,
  type ProtocolError,
  type GameId,
  type RoomSnapshot,
} from '@gno/shared';
import { sfx } from '../audio/engine';
import { Confetti } from '../components/Confetti';
import { FloatingShapes } from '../components/FloatingShapes';
import { Logo } from '../components/Logo';
import { seatAvatar } from '../components/avatars';
import { playerColor } from '../components/playerColor';
import { PlayGame } from './PlayGame';
import { usePlayerSession } from './usePlayerSession';

type FieldErrors = Partial<Record<keyof JoinRequest | 'form', string>>;

export function PlayJoin() {
  const [searchParams] = useSearchParams();
  const codeFromLink = searchParams.get('code')?.trim().toUpperCase() || undefined;
  const { state, join, leave, act } = usePlayerSession(codeFromLink);

  if (state.status === 'connecting') {
    return (
      <Centered>
        <Logo className="text-[2.6rem]" />
        <p className="text-xl text-white/70">Connecting… 🎈</p>
      </Centered>
    );
  }
  if (state.status === 'lobby' && state.room?.game) {
    return (
      <PlayGame session={state.session} room={state.room} connected={state.connected} act={act} />
    );
  }
  if (state.status === 'lobby') {
    return (
      <PlayerLobby
        onStart={() => act('game:start')}
        onSelect={(gameId) => act('game:select', { gameId })}
        session={state.session}
        room={state.room}
        connected={state.connected}
        celebrate={state.justJoined}
        onLeave={leave}
      />
    );
  }
  return <JoinForm initialCode={codeFromLink ?? ''} notice={state.notice} onJoin={join} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden px-4 py-10 text-center">
      <FloatingShapes />
      <div className="relative flex flex-col items-center gap-5">{children}</div>
    </main>
  );
}

function JoinForm({
  initialCode,
  notice,
  onJoin,
}: {
  initialCode: string;
  notice?: string;
  onJoin: ReturnType<typeof usePlayerSession>['join'];
}) {
  const [roomCode, setRoomCode] = useState(initialCode);
  const [nickname, setNickname] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const result = joinRequestSchema.safeParse({ roomCode, nickname });
    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof JoinRequest;
        fieldErrors[field] ??= issue.message;
      }
      setErrors(fieldErrors);
      sfx.oops();
      return;
    }
    setErrors({});
    setBusy(true);
    const error = await onJoin(result.data);
    setBusy(false);
    if (!error) {
      sfx.join();
      return;
    }
    sfx.oops();
    if (error.code === 'NICKNAME_TAKEN') setErrors({ nickname: error.message });
    else if (error.code === 'ROOM_NOT_FOUND' || error.code === 'ROOM_FULL')
      setErrors({ roomCode: error.message });
    else setErrors({ form: error.message });
  }

  return (
    <main className="relative mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-8 overflow-hidden px-4 py-10">
      <FloatingShapes />
      <div className="relative flex flex-col items-center gap-3">
        <Logo className="text-[2.6rem]" />
        <p className="text-lg font-medium text-white/70">Let's play together! 🎈</p>
      </div>
      {notice && (
        <p
          role="status"
          className="relative rounded-2xl bg-pop-violet/20 px-4 py-3 text-center text-lg font-medium"
        >
          {notice}
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate className="relative flex flex-col gap-5">
        <Field label="Room code" error={errors.roomCode} htmlFor="room-code">
          <input
            id="room-code"
            name="roomCode"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={ROOM_CODE_LENGTH}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            placeholder="ABCD"
            className="w-full rounded-3xl border-4 border-pop-yellow/40 bg-night-800 px-4 py-3 text-center text-4xl font-bold uppercase tracking-[0.35em] text-pop-yellow placeholder:text-white/15 focus:border-pop-yellow focus:outline-none"
          />
        </Field>
        <Field label="Your name" error={errors.nickname} htmlFor="nickname">
          <input
            id="nickname"
            name="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={NICKNAME_MAX_LENGTH}
            autoComplete="nickname"
            placeholder="What should we call you?"
            className="w-full rounded-3xl border-4 border-pop-cyan/40 bg-night-800 px-4 py-3 text-2xl font-semibold placeholder:text-lg placeholder:text-white/30 focus:border-pop-cyan focus:outline-none"
          />
        </Field>
        {errors.form && (
          <p role="alert" className="text-lg font-medium text-pop-orange">
            🙈 {errors.form}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-3xl bg-pop-pink px-6 py-4 text-3xl font-bold text-night-950 shadow-[0_7px_0_#b02a66] transition hover:-translate-y-0.5 active:translate-y-1.5 active:shadow-none disabled:opacity-60"
        >
          {busy ? 'Joining…' : "Let's play! 🎉"}
        </button>
      </form>
    </main>
  );
}

function PlayerLobby({
  session,
  room,
  connected,
  celebrate,
  onLeave,
  onStart,
  onSelect,
}: {
  session: PlayerSession;
  room: RoomSnapshot | undefined;
  connected: boolean;
  celebrate: boolean;
  onLeave: () => void;
  onStart: () => Promise<ProtocolError | undefined>;
  onSelect: (gameId: GameId) => Promise<ProtocolError | undefined>;
}) {
  const me = room?.players.find((p) => p.id === session.playerId);
  const others = room?.players.filter((p) => p.id !== session.playerId) ?? [];
  const [showConfetti, setShowConfetti] = useState(celebrate);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string>();
  const readyCount = room?.players.filter((p) => p.connected).length ?? 0;
  const canStart = readyCount >= MIN_PLAYERS;

  async function start() {
    setStarting(true);
    setStartError(undefined);
    const error = await onStart();
    setStarting(false);
    if (error) {
      setStartError(error.message);
      sfx.oops();
    }
  }

  useEffect(() => {
    if (!showConfetti) return;
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, [showConfetti]);

  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden px-4 py-10 text-center">
      <FloatingShapes />
      {showConfetti && <Confetti />}
      {!connected && (
        <p
          role="status"
          className="relative rounded-full bg-pop-orange/20 px-4 py-1 font-semibold text-pop-orange"
        >
          📶 Reconnecting…
        </p>
      )}
      {me && (
        <div
          className="relative grid size-32 animate-[bob_2s_ease-in-out_infinite] place-items-center rounded-full text-7xl shadow-[inset_0_-8px_0_rgba(0,0,0,0.18)]"
          style={{ backgroundColor: playerColor(me.seat) }}
          aria-hidden
        >
          {seatAvatar(me.seat)}
        </div>
      )}
      <h1 data-testid="joined-heading" className="relative text-4xl font-bold">
        You're in{me ? `, ${me.nickname}` : ''}!
      </h1>
      <p className="relative max-w-xs text-xl text-white/80">
        Room <span className="font-bold text-pop-yellow">{session.roomCode}</span>. Watch the TV 📺
      </p>
      {me?.isVip && (
        <p
          data-testid="vip-note"
          className="relative max-w-xs rounded-2xl bg-pop-yellow/15 px-4 py-3 text-lg font-semibold text-pop-yellow"
        >
          👑 You're the VIP!{' '}
          {canStart
            ? 'Start when everyone is in.'
            : `You can start once ${MIN_PLAYERS} players are here.`}
        </p>
      )}
      {me?.isVip && room && (
        <div className="relative w-full max-w-sm">
          <p className="mb-2 text-base font-semibold uppercase tracking-widest text-white/60">
            Pick a game
          </p>
          <ul className="grid grid-cols-2 gap-2">
            {GAMES.map((game) => {
              const isSelected = game.id === room.selectedGame;
              return (
                <li key={game.id}>
                  <button
                    type="button"
                    data-testid="phone-game"
                    data-game={game.id}
                    aria-pressed={isSelected}
                    onClick={() => {
                      sfx.tap();
                      void onSelect(game.id);
                    }}
                    className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-base font-bold transition active:scale-95 ${isSelected ? 'text-night-950' : 'bg-night-800 text-white'}`}
                    style={
                      isSelected
                        ? { backgroundColor: game.color }
                        : { boxShadow: `inset 0 0 0 3px ${game.color}66` }
                    }
                  >
                    <span className="text-2xl" aria-hidden>
                      {game.emoji}
                    </span>
                    <span className="leading-tight">{game.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-base text-white/70">{gameInfo(room.selectedGame).tagline}</p>
        </div>
      )}
      {me?.isVip && (
        <button
          type="button"
          data-testid="start-game"
          onClick={() => void start()}
          disabled={!canStart || starting}
          className="relative rounded-3xl bg-pop-pink px-8 py-4 text-3xl font-bold text-night-950 shadow-[0_7px_0_#b02a66] transition active:translate-y-1.5 active:shadow-none disabled:opacity-50"
        >
          {starting ? 'Starting…' : 'Start game 🚀'}
        </button>
      )}
      {startError && (
        <p role="alert" className="relative text-lg font-medium text-pop-orange">
          🙈 {startError}
        </p>
      )}
      {!me?.isVip && room && (
        <div className="relative flex flex-col items-center gap-1">
          <p data-testid="selected-game" className="text-2xl font-bold">
            {gameInfo(room.selectedGame).emoji} {gameInfo(room.selectedGame).title}
          </p>
          <p className="text-lg text-white/70">Waiting for the 👑 VIP to start the game…</p>
        </div>
      )}
      {others.length > 0 && (
        <div className="relative flex flex-col items-center gap-2">
          <p className="text-base font-semibold uppercase tracking-widest text-white/60">
            Playing with
          </p>
          <ul data-testid="other-players" className="flex max-w-xs flex-wrap justify-center gap-2">
            {others.map((p) => (
              <li
                key={p.id}
                className={`rounded-full px-3 py-1 text-lg font-semibold text-night-950 ${p.connected ? '' : 'opacity-50'}`}
                style={{ backgroundColor: playerColor(p.seat) }}
              >
                {seatAvatar(p.seat)} {p.nickname}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        onClick={onLeave}
        className="relative mt-4 rounded-full border-2 border-white/20 px-5 py-2 text-lg font-semibold text-white/70 hover:bg-white/10"
      >
        Leave room
      </button>
    </main>
  );
}

function Field({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={htmlFor}
        className="text-base font-semibold uppercase tracking-widest text-white/70"
      >
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-lg font-medium text-pop-orange">
          🙈 {error}
        </p>
      )}
    </div>
  );
}
