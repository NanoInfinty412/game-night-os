import { useEffect, useRef, useState } from 'react';
import {
  roundInfo,
  type GameView,
  type PlayerSession,
  type ProtocolError,
  type RoomSnapshot,
  type RoundView,
} from '@gno/shared';
import { buzz, sfx } from '../audio/engine';
import { Confetti } from '../components/Confetti';
import { seatAvatar } from '../components/avatars';
import { playerColor } from '../components/playerColor';
import { choiceStyle, ordinal } from '../game/answerStyles';
import { useCountdown } from '../game/useCountdown';
import type { usePlayerSession } from './usePlayerSession';

type Act = ReturnType<typeof usePlayerSession>['act'];

interface RoundProps {
  game: GameView;
  playerId: string;
  act: Act;
}

/** The phone as a controller while a game runs. */
export function PlayGame({
  session,
  room,
  connected,
  act,
}: {
  session: PlayerSession;
  room: RoomSnapshot;
  connected: boolean;
  act: Act;
}) {
  const game = room.game!;
  const me = room.players.find((p) => p.id === session.playerId);
  const isVip = !!me?.isVip;
  const props: RoundProps = { game, playerId: session.playerId, act };
  const current = game.current;
  // Remount controllers every round so local state (taps, guesses) starts fresh.
  const roundKey = `${game.round}:${game.phase}`;

  return (
    <main className="relative mx-auto flex min-h-svh w-full max-w-md flex-col gap-3 overflow-hidden px-4 py-4">
      <header className="flex items-center justify-between gap-2">
        {me && (
          <span
            className="flex max-w-[60%] items-center gap-2 truncate rounded-full py-1 pl-1 pr-3 text-lg font-bold text-night-950"
            style={{ backgroundColor: playerColor(me.seat) }}
          >
            <span aria-hidden>{seatAvatar(me.seat)}</span>
            {me.nickname}
          </span>
        )}
        <span data-testid="my-score" className="text-lg font-bold text-pop-yellow">
          ⭐ {game.scores[session.playerId] ?? 0}
        </span>
      </header>
      {!connected && (
        <p
          role="status"
          className="self-center rounded-full bg-pop-orange/20 px-4 py-1 font-semibold text-pop-orange"
        >
          📶 Reconnecting…
        </p>
      )}
      {game.phase !== 'FINAL' && (
        <p className="text-center text-base font-semibold text-white/60">
          Round {game.round + 1} of {game.totalRounds}
        </p>
      )}

      {game.phase === 'INTRO' && <IntroScreen game={game} isVip={isVip} act={act} />}
      {game.phase === 'PLAY' && current.kind === 'question' && (
        <QuestionPad key={roundKey} {...props} current={current} />
      )}
      {game.phase === 'PLAY' && current.kind === 'number' && (
        <NumberPad key={roundKey} {...props} current={current} />
      )}
      {game.phase === 'PLAY' && current.kind === 'reaction' && (
        <ReactionPad key={roundKey} {...props} current={current} />
      )}
      {game.phase === 'PLAY' && current.kind === 'mash' && <MashPad key={roundKey} {...props} />}
      {game.phase === 'REVEAL' && <RoundResult key={roundKey} {...props} isVip={isVip} />}
      {game.phase === 'FINAL' && <FinalResult {...props} isVip={isVip} />}
    </main>
  );
}

function titleFor(current: RoundView) {
  return roundInfo(current.kind, {
    style: current.kind === 'question' ? current.style : undefined,
    picking: current.kind === 'question' && current.pickRound,
    theme: current.kind === 'mash' ? current.theme : undefined,
  });
}

function IntroScreen({ game, isVip, act }: { game: GameView; isVip: boolean; act: Act }) {
  const info = titleFor(game.current);
  const seconds = useCountdown(game.phaseEndsAt);
  return (
    <section
      data-testid="phone-intro"
      className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
    >
      <span className="animate-[pop-in_500ms_cubic-bezier(.34,1.56,.64,1)_both] text-8xl">
        {info.emoji}
      </span>
      <h1 className="text-4xl font-bold">{info.title}</h1>
      <p className="max-w-xs text-xl text-white/80">{info.howTo}</p>
      <p className="text-lg text-white/60">Starting in {seconds}…</p>
      {isVip && <VipButton act={act} label="Start now ⏭" />}
    </section>
  );
}

function Countdown({ game }: { game: GameView }) {
  const seconds = useCountdown(game.phaseEndsAt);
  if (game.phaseEndsAt === 0) return null;
  return (
    <span
      data-testid="phone-countdown"
      className={`rounded-full px-3 py-0.5 text-xl font-bold ${seconds <= 5 ? 'bg-pop-orange text-night-950' : 'bg-white/10'}`}
    >
      ⏱ {seconds}
    </span>
  );
}

function LockedIn({ children }: { children?: React.ReactNode }) {
  return (
    <div
      data-testid="locked-in"
      className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
    >
      <span className="text-6xl" aria-hidden>
        🔒
      </span>
      <p className="text-3xl font-bold">Locked in!</p>
      {children}
      <p className="text-lg text-white/70">Eyes on the TV 📺</p>
    </div>
  );
}

function ErrorLine({ error }: { error?: ProtocolError }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-center text-lg font-medium text-pop-orange">
      🙈 {error.message}
    </p>
  );
}

function QuestionPad({
  game,
  playerId,
  act,
  current,
}: RoundProps & { current: Extract<RoundView, { kind: 'question' }> }) {
  const [picked, setPicked] = useState<number>();
  const [error, setError] = useState<ProtocolError>();
  const seconds = useCountdown(game.phaseEndsAt);

  if (current.picking) {
    const mine = current.picking.chooserId === playerId;
    if (!mine)
      return (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <span className="text-7xl">🎯</span>
          <p data-testid="waiting-pick" className="text-2xl font-bold">
            Someone else is picking the category…
          </p>
          <p className="text-lg text-white/70">Watch the TV 📺</p>
        </section>
      );
    return (
      <section className="flex flex-1 flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-2xl font-bold">🎯 Your turn! Pick a category</p>
          <Countdown game={game} />
        </div>
        {current.picking.categories.map((category, i) => (
          <button
            key={category}
            type="button"
            data-testid="category-button"
            onClick={async () => {
              sfx.pop();
              const failure = await act('game:action', {
                type: 'pick',
                round: game.round,
                option: i,
              });
              setError(failure);
            }}
            className="min-h-20 flex-1 rounded-3xl px-4 text-3xl font-bold text-night-950 active:translate-y-1"
            style={{ backgroundColor: playerColor(i + 2), boxShadow: '0 6px 0 rgba(0,0,0,0.3)' }}
          >
            {category}
          </button>
        ))}
        <ErrorLine error={error} />
      </section>
    );
  }

  const question = current.question!;
  const answered = game.doneIds.includes(playerId);
  const locked = answered || picked !== undefined;

  async function choose(choice: number) {
    if (locked) return;
    setPicked(choice);
    sfx.pop();
    buzz(20);
    const failure = await act('game:action', { type: 'answer', round: game.round, choice });
    if (failure && failure.code !== 'ALREADY_ANSWERED') {
      setPicked(undefined);
      setError(failure);
      sfx.oops();
    }
  }

  const twoChoices = question.choices.length === 2;
  return (
    <section className="flex flex-1 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-semibold text-cyan-200/80">{question.category}</p>
        <Countdown game={game} />
      </div>
      <p
        className={`font-semibold leading-snug ${current.style === 'emoji' ? 'text-center text-5xl tracking-wider' : 'text-xl'}`}
      >
        {question.prompt}
      </p>
      {locked ? (
        <LockedIn>
          {picked !== undefined && (
            <p
              className="rounded-2xl px-4 py-2 text-xl font-bold text-night-950"
              style={{ backgroundColor: choiceStyle(picked, current.style).color }}
            >
              {choiceStyle(picked, current.style).shape} {question.choices[picked]}
            </p>
          )}
        </LockedIn>
      ) : (
        <div className={`grid flex-1 gap-3 ${twoChoices ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {question.choices.map((choice, i) => {
            const style = choiceStyle(i, current.style);
            return (
              <button
                key={i}
                type="button"
                data-testid="answer-button"
                onClick={() => void choose(i)}
                disabled={seconds === 0}
                className={`flex min-h-16 items-center gap-3 rounded-3xl px-4 py-3 text-2xl font-bold text-night-950 transition active:translate-y-1 disabled:opacity-50 ${twoChoices ? 'flex-col justify-center text-3xl' : 'text-left'}`}
                style={{ backgroundColor: style.color, boxShadow: `0 6px 0 ${style.shadow}` }}
              >
                <span className={twoChoices ? 'text-6xl' : 'text-3xl'} aria-hidden>
                  {style.shape}
                </span>
                <span>{choice}</span>
              </button>
            );
          })}
        </div>
      )}
      <ErrorLine error={error} />
    </section>
  );
}

function NumberPad({
  game,
  playerId,
  act,
  current,
}: RoundProps & { current: Extract<RoundView, { kind: 'number' }> }) {
  const [digits, setDigits] = useState('');
  const [sent, setSent] = useState<number>();
  const [error, setError] = useState<ProtocolError>();
  const question = current.question!;
  const maxDigits = String(question.max).length;
  const answered = game.doneIds.includes(playerId) || sent !== undefined;

  async function submit() {
    const value = Number(digits);
    if (digits === '' || value < question.min || value > question.max) {
      setError({
        code: 'INVALID_PAYLOAD',
        message: `Pick a number from ${question.min} to ${question.max.toLocaleString()}.`,
      });
      sfx.oops();
      return;
    }
    setSent(value);
    sfx.pop();
    const failure = await act('game:action', { type: 'guess', round: game.round, value });
    if (failure && failure.code !== 'ALREADY_ANSWERED') {
      setSent(undefined);
      setError(failure);
    }
  }

  if (answered)
    return (
      <LockedIn>
        {sent !== undefined && (
          <p className="text-4xl font-bold text-pop-yellow">
            {sent.toLocaleString()} {question.unit}
          </p>
        )}
      </LockedIn>
    );

  const press = (key: string) => {
    setError(undefined);
    sfx.tap();
    if (key === '⌫') setDigits((d) => d.slice(0, -1));
    else setDigits((d) => (d.length >= maxDigits ? d : (d + key).replace(/^0+(?=\d)/, '')));
  };

  return (
    <section className="flex flex-1 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xl font-semibold leading-snug">{question.prompt}</p>
        <Countdown game={game} />
      </div>
      <p
        data-testid="guess-display"
        className="rounded-3xl bg-night-800 py-3 text-center text-5xl font-bold tracking-wider text-pop-yellow"
      >
        {digits === '' ? '?' : Number(digits).toLocaleString()}
        <span className="ml-2 text-2xl text-white/60">{question.unit}</span>
      </p>
      <div className="grid flex-1 grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0'].map((key) => (
          <button
            key={key}
            type="button"
            data-testid={`key-${key === '⌫' ? 'back' : key}`}
            onClick={() => press(key)}
            className="min-h-14 rounded-2xl bg-white/10 text-3xl font-bold active:bg-white/25"
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          data-testid="send-guess"
          onClick={() => void submit()}
          className="min-h-14 rounded-2xl bg-pop-lime text-2xl font-bold text-night-950 active:translate-y-0.5"
        >
          Send ✔
        </button>
      </div>
      <ErrorLine error={error} />
    </section>
  );
}

function ReactionPad({
  game,
  playerId,
  act,
  current,
}: RoundProps & { current: Extract<RoundView, { kind: 'reaction' }> }) {
  const [tapped, setTapped] = useState<'early' | 'ok'>();
  const go = current.status === 'go';
  const done = tapped ?? (game.doneIds.includes(playerId) ? 'ok' : undefined);

  useEffect(() => {
    if (go) buzz(80);
  }, [go]);

  async function tap() {
    if (done) return;
    const early = !go;
    setTapped(early ? 'early' : 'ok');
    if (early) {
      sfx.boing();
      buzz([40, 40, 40]);
    } else sfx.pop();
    await act('game:action', { type: 'tap', round: game.round });
  }

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <button
        type="button"
        data-testid="reaction-button"
        data-status={current.status}
        onPointerDown={() => void tap()}
        className={`grid aspect-square w-full max-w-[20rem] place-items-center rounded-full text-6xl font-bold text-night-950 select-none ${done === 'early' ? 'bg-white/20 text-white' : done ? 'bg-pop-cyan' : go ? 'animate-[pop-in_200ms_ease-out] bg-pop-lime' : 'bg-pop-pink'}`}
      >
        {done === 'early' ? '🙈' : done ? '✔' : go ? 'TAP!' : 'Wait…'}
      </button>
      <p className="text-2xl font-bold">
        {done === 'early'
          ? 'Too early! Wait for GO next time.'
          : done
            ? 'Tapped! Look at the TV.'
            : go
              ? 'NOW! TAP!'
              : 'Wait for GO… no peeking!'}
      </p>
    </section>
  );
}

function MashPad({ game, act }: RoundProps) {
  const [count, setCount] = useState(0);
  const lastSent = useRef(0);
  const seconds = useCountdown(game.phaseEndsAt);
  const over = seconds === 0;

  function tap() {
    if (over) return;
    const now = performance.now();
    // The server ignores taps closer together than 50ms; don't send ones it would drop.
    if (now - lastSent.current < 55) return;
    lastSent.current = now;
    setCount((c) => c + 1);
    sfx.tap();
    void act('game:action', { type: 'tap', round: game.round });
  }

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <div className="flex w-full items-center justify-between">
        <p className="text-2xl font-bold">Tap tap TAP!</p>
        <Countdown game={game} />
      </div>
      <button
        type="button"
        data-testid="mash-button"
        onPointerDown={tap}
        disabled={over}
        className="grid aspect-square w-full max-w-[20rem] place-items-center rounded-full bg-pop-yellow text-7xl font-bold text-night-950 shadow-[0_10px_0_#b8901a] select-none active:translate-y-2 active:shadow-[0_2px_0_#b8901a] disabled:opacity-50"
        style={{ touchAction: 'manipulation' }}
      >
        <span>
          <span data-testid="mash-taps" className="block">
            {count}
          </span>
          <span className="block text-2xl">taps</span>
        </span>
      </button>
    </section>
  );
}

function RoundResult({ game, playerId, act, isVip }: RoundProps & { isVip: boolean }) {
  const result = game.results?.[playerId];
  const current = game.current;
  const points = result?.points ?? 0;
  const won = points > 0;
  const last = game.round + 1 >= game.totalRounds;

  useEffect(() => {
    if (won) {
      sfx.join();
      buzz(60);
    } else sfx.oops();
  }, [won]);

  let emoji = won ? '🎉' : '🙈';
  let headline = won ? 'Nice one!' : 'Not this time!';
  let detail: React.ReactNode = null;

  if (current.kind === 'question' && current.question && current.answer !== undefined) {
    const missed = result?.value == null;
    if (missed) {
      emoji = '⏰';
      headline = 'Too slow!';
    } else if (won) headline = 'Correct!';
    if (!won)
      detail = (
        <>
          The answer was{' '}
          <span className="font-bold text-pop-yellow">
            {current.question.choices[current.answer]}
          </span>
        </>
      );
  } else if (current.kind === 'number' && current.answer !== undefined) {
    const exact = result?.value === current.answer;
    if (exact) {
      emoji = '🎯';
      headline = 'Exactly right!';
    } else if (won) headline = 'Close one!';
    detail = (
      <>
        {result?.value != null ? `You said ${result.value.toLocaleString()}. ` : ''}
        The answer was{' '}
        <span className="font-bold text-pop-yellow">
          {current.answer.toLocaleString()} {current.question?.unit}
        </span>
      </>
    );
  } else if (current.kind === 'reaction') {
    if (result?.falseStart) {
      emoji = '🙈';
      headline = 'Too early!';
    } else if (result?.value != null) {
      emoji = '⚡';
      headline = `${(result.value / 1000).toFixed(3)} seconds!`;
    } else {
      emoji = '😴';
      headline = 'No tap!';
    }
  } else if (current.kind === 'mash') {
    emoji = points === 1000 ? '🏆' : '💪';
    headline = `${result?.value ?? 0} taps!`;
  }

  return (
    <section
      data-testid="round-result"
      data-correct={won}
      className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
    >
      <span className="text-7xl" aria-hidden>
        {emoji}
      </span>
      <p className="text-4xl font-bold">{headline}</p>
      {won ? (
        <p className="text-3xl font-bold text-pop-lime">+{points} points</p>
      ) : (
        <p className="text-2xl font-bold text-white/60">+0</p>
      )}
      {detail && <p className="text-xl text-white/80">{detail}</p>}
      <PlaceLine game={game} playerId={playerId} />
      {isVip && <VipButton act={act} label={last ? 'See final scores 🏆' : 'Next round ⏭'} />}
    </section>
  );
}

function FinalResult({ game, playerId, act, isVip }: RoundProps & { isVip: boolean }) {
  const mine = game.standings?.find((s) => s.playerId === playerId);
  const won = mine?.place === 1;
  useEffect(() => {
    if (won) buzz([80, 60, 80, 60, 200]);
  }, [won]);
  return (
    <section
      data-testid="final-result"
      className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
    >
      {won && <Confetti />}
      <span className="text-7xl" aria-hidden>
        {won ? '🏆' : mine && mine.place <= 3 ? '🥳' : '🌟'}
      </span>
      <p data-testid="final-place" className="text-4xl font-bold">
        {mine ? `You came ${ordinal(mine.place)}!` : 'Game over!'}
      </p>
      <p className="text-2xl font-semibold text-pop-yellow">{mine?.score ?? 0} points</p>
      <p className="max-w-xs text-lg text-white/80">
        {won ? 'Champion! Take a bow. 🙇' : 'Great playing! Ready for a rematch?'}
      </p>
      {isVip ? (
        <VipButton act={act} label="Pick the next game 🔁" />
      ) : (
        <p className="text-lg text-white/70">👑 The VIP picks the next game.</p>
      )}
    </section>
  );
}

function PlaceLine({ game, playerId }: { game: GameView; playerId: string }) {
  const scores = Object.values(game.scores);
  const mine = game.scores[playerId] ?? 0;
  const place = 1 + scores.filter((s) => s > mine).length;
  return (
    <p className="rounded-full bg-white/10 px-4 py-1 text-lg font-semibold">
      ⭐ {mine} points · {ordinal(place)} place
    </p>
  );
}

function VipButton({ act, label }: { act: Act; label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      data-testid="vip-next"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await act('game:next');
        setBusy(false);
      }}
      className="mt-2 rounded-3xl bg-pop-violet px-6 py-3 text-2xl font-bold text-night-950 shadow-[0_6px_0_#5b42b8] active:translate-y-1 active:shadow-none disabled:opacity-60"
    >
      {label}
    </button>
  );
}
