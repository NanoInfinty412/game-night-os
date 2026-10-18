import { useEffect, useState } from 'react';
import type { GameView, PlayerSession, ProtocolError, RoomSnapshot } from '@gno/shared';
import { sfx } from '../audio/engine';
import { Confetti } from '../components/Confetti';
import { seatAvatar } from '../components/avatars';
import { playerColor } from '../components/playerColor';
import { answerStyle, ordinal } from '../game/answerStyles';
import { useCountdown } from '../game/useCountdown';
import type { usePlayerSession } from './usePlayerSession';

type Act = ReturnType<typeof usePlayerSession>['act'];

/** The phone as a controller while a game runs: answer buttons, then how you did. */
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
  const myScore = game.scores[session.playerId] ?? 0;

  return (
    <main className="relative mx-auto flex min-h-svh w-full max-w-md flex-col gap-4 overflow-hidden px-4 py-4">
      <header className="flex items-center justify-between gap-2">
        {me && (
          <span
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-lg font-bold text-night-950"
            style={{ backgroundColor: playerColor(me.seat) }}
          >
            <span aria-hidden>{seatAvatar(me.seat)}</span>
            {me.nickname}
          </span>
        )}
        <span data-testid="my-score" className="text-lg font-bold text-pop-yellow">
          ⭐ {myScore}
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
      {room.phase === 'QUESTION' && (
        <AnswerPad
          key={game.round}
          game={game}
          answered={game.answeredIds.includes(session.playerId)}
          act={act}
        />
      )}
      {room.phase === 'REVEAL' && (
        <RoundResult game={game} playerId={session.playerId} isVip={!!me?.isVip} act={act} />
      )}
      {room.phase === 'FINAL' && (
        <FinalResult game={game} playerId={session.playerId} isVip={!!me?.isVip} act={act} />
      )}
    </main>
  );
}

function AnswerPad({ game, answered, act }: { game: GameView; answered: boolean; act: Act }) {
  const [picked, setPicked] = useState<number>();
  const [error, setError] = useState<ProtocolError>();
  const seconds = useCountdown(game.deadline);
  const locked = answered || picked !== undefined;

  async function choose(choice: number) {
    if (locked) return;
    setPicked(choice);
    sfx.pop();
    const failure = await act('game:answer', { round: game.round, choice });
    if (failure && failure.code !== 'ALREADY_ANSWERED') {
      setPicked(undefined);
      setError(failure);
      sfx.oops();
    }
  }

  return (
    <section className="flex flex-1 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-semibold text-white/70">
          Question {game.round + 1}/{game.totalRounds}
        </p>
        <span
          data-testid="phone-countdown"
          className={`rounded-full px-3 py-0.5 text-xl font-bold ${seconds <= 5 ? 'bg-pop-orange text-night-950' : 'bg-white/10'}`}
        >
          ⏱ {seconds}
        </span>
      </div>
      <p className="text-xl font-semibold leading-snug">{game.question.prompt}</p>
      {locked ? (
        <div
          data-testid="locked-in"
          className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
        >
          <span className="text-6xl" aria-hidden>
            🔒
          </span>
          <p className="text-3xl font-bold">Locked in!</p>
          {picked !== undefined && (
            <p
              className="rounded-2xl px-4 py-2 text-xl font-bold text-night-950"
              style={{ backgroundColor: answerStyle(picked).color }}
            >
              {answerStyle(picked).shape} {game.question.choices[picked]}
            </p>
          )}
          <p className="text-lg text-white/70">Eyes on the TV 📺</p>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-3">
          {game.question.choices.map((choice, i) => {
            const style = answerStyle(i);
            return (
              <button
                key={i}
                type="button"
                data-testid="answer-button"
                onClick={() => void choose(i)}
                disabled={seconds === 0}
                className="flex min-h-16 items-center gap-3 rounded-3xl px-4 py-3 text-left text-2xl font-bold text-night-950 transition active:translate-y-1 disabled:opacity-50"
                style={{ backgroundColor: style.color, boxShadow: `0 6px 0 ${style.shadow}` }}
              >
                <span className="text-3xl" aria-hidden>
                  {style.shape}
                </span>
                <span>{choice}</span>
              </button>
            );
          })}
        </div>
      )}
      {error && (
        <p role="alert" className="text-center text-lg font-medium text-pop-orange">
          🙈 {error.message}
        </p>
      )}
    </section>
  );
}

function RoundResult({
  game,
  playerId,
  isVip,
  act,
}: {
  game: GameView;
  playerId: string;
  isVip: boolean;
  act: Act;
}) {
  const result = game.reveal?.results[playerId];
  const answer = game.reveal?.answer ?? 0;
  const correct = !!result && result.points > 0;
  const missed = !result || result.choice === null;
  const last = game.round + 1 >= game.totalRounds;

  useEffect(() => {
    if (correct) sfx.join();
    else sfx.oops();
  }, [correct, game.round]);

  return (
    <section
      data-testid="round-result"
      data-correct={correct}
      className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
    >
      <span className="text-7xl" aria-hidden>
        {correct ? '🎉' : missed ? '⏰' : '🙈'}
      </span>
      <p className="text-4xl font-bold">
        {correct ? 'Correct!' : missed ? 'Too slow!' : 'Not this time!'}
      </p>
      {correct ? (
        <p className="text-3xl font-bold text-pop-lime">+{result.points} points</p>
      ) : (
        <p className="text-xl text-white/80">
          The answer was{' '}
          <span className="font-bold text-pop-yellow">{game.question.choices[answer]}</span>
        </p>
      )}
      <PlaceLine game={game} playerId={playerId} />
      {isVip && <VipButton act={act} label={last ? 'See final scores 🏆' : 'Next question ⏭'} />}
    </section>
  );
}

function FinalResult({
  game,
  playerId,
  isVip,
  act,
}: {
  game: GameView;
  playerId: string;
  isVip: boolean;
  act: Act;
}) {
  const mine = game.standings?.find((s) => s.playerId === playerId);
  const won = mine?.place === 1;
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
        {won ? 'Trivia champion! Take a bow. 🙇' : 'Great playing! Ready for a rematch?'}
      </p>
      {isVip ? (
        <VipButton act={act} label="Play again 🔁" />
      ) : (
        <p className="text-lg text-white/70">👑 The VIP can start another game.</p>
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
