import { useEffect, useRef } from 'react';
import {
  gameInfo,
  roundInfo,
  type GameView,
  type PublicPlayer,
  type RoomSnapshot,
  type RoundView,
} from '@gno/shared';
import { sfx } from '../audio/engine';
import { Confetti } from '../components/Confetti';
import { FloatingShapes } from '../components/FloatingShapes';
import { Logo } from '../components/Logo';
import { seatAvatar } from '../components/avatars';
import { playerColor } from '../components/playerColor';
import { choiceStyle, ordinal } from '../game/answerStyles';
import { useCountdown } from '../game/useCountdown';
import { MusicControl } from './MusicControl';
import type { HostEvent } from './useHostRoom';

type Send = (event: HostEvent, payload?: unknown) => Promise<unknown>;

/** The shared screen while a game runs: round intros, play, reveals and the final podium. */
export function TvGame({
  room,
  connected,
  send,
}: {
  room: RoomSnapshot;
  connected: boolean;
  send: Send;
}) {
  const game = room.game!;
  const info = gameInfo(game.gameId);
  useTvSounds(game);
  const canSkip = game.phase === 'INTRO' || game.phase === 'REVEAL';

  return (
    <main className="relative flex h-screen flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--color-night-700),_var(--color-night-950)_70%)] px-8 py-4">
      <FloatingShapes />
      <header className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Logo className="text-3xl" />
          <span className="text-xl font-bold" style={{ color: info.color }}>
            {info.emoji} {info.title}
          </span>
        </div>
        <p
          data-testid="round-label"
          className="rounded-full bg-white/10 px-5 py-1.5 text-2xl font-bold"
        >
          {game.phase === 'FINAL'
            ? 'Final scores'
            : `Round ${game.round + 1} of ${game.totalRounds}`}
        </p>
        <div className="flex items-center gap-3">
          {!connected && (
            <span
              role="status"
              className="rounded-full bg-pop-orange/20 px-4 py-1 text-lg font-semibold text-pop-orange"
            >
              📶 Reconnecting…
            </span>
          )}
          {canSkip && (
            <HostButton testId="tv-skip" onClick={() => void send('game:next')} isDefault>
              Skip ⏭
            </HostButton>
          )}
          {game.phase === 'FINAL' ? (
            <HostButton testId="tv-again" onClick={() => void send('game:next')} isDefault>
              Back to menu 🏠
            </HostButton>
          ) : (
            <HostButton testId="tv-quit" onClick={() => void send('game:quit')}>
              Menu 🏠
            </HostButton>
          )}
          <MusicControl />
        </div>
      </header>

      {game.phase === 'INTRO' && <IntroCard game={game} />}
      {(game.phase === 'PLAY' || game.phase === 'REVEAL') && (
        <RoundStage game={game} players={room.players} />
      )}
      {game.phase === 'FINAL' && <FinalScores game={game} players={room.players} />}
    </main>
  );
}

function HostButton({
  children,
  onClick,
  testId,
  isDefault = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  testId: string;
  isDefault?: boolean;
}) {
  return (
    <button
      type="button"
      data-nav
      {...(isDefault && { 'data-nav-default': true })}
      data-testid={testId}
      onClick={onClick}
      className="rounded-full bg-white/10 px-4 py-2 text-lg font-bold transition hover:bg-white/20 focus:scale-105 focus:bg-white/25"
    >
      {children}
    </button>
  );
}

/** Whooshes, dings, ticks and a fanfare at the right moments. */
function useTvSounds(game: GameView) {
  const status = game.current.kind === 'reaction' ? game.current.status : '';
  const key = `${game.phase}:${game.round}:${status}`;
  const last = useRef<string>(undefined);
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    if (game.phase === 'INTRO') sfx.whoosh();
    else if (game.phase === 'REVEAL') sfx.ding();
    else if (game.phase === 'FINAL') sfx.fanfare();
    else if (status === 'go') sfx.go();
  }, [key, game.phase, status]);
}

function titleFor(current: RoundView) {
  return roundInfo(current.kind, {
    style: current.kind === 'question' ? current.style : undefined,
    picking: current.kind === 'question' && current.pickRound,
    theme: current.kind === 'mash' ? current.theme : undefined,
  });
}

function IntroCard({ game }: { game: GameView }) {
  const seconds = useCountdown(game.phaseEndsAt);
  const info = titleFor(game.current);
  return (
    <section
      data-testid="round-intro"
      className="relative flex flex-1 flex-col items-center justify-center gap-5 text-center"
    >
      <p className="text-2xl font-bold uppercase tracking-[0.3em] text-white/60">
        Round {game.round + 1}
      </p>
      <span className="animate-[pop-in_500ms_cubic-bezier(.34,1.56,.64,1)_both] text-[7rem] leading-none">
        {info.emoji}
      </span>
      <h1 data-testid="round-title" className="text-6xl font-bold">
        {info.title}
      </h1>
      <p className="max-w-[48rem] text-3xl font-semibold text-white/80">{info.howTo}</p>
      <p className="text-2xl text-white/60">📱 Get your phones ready… {seconds}</p>
      <Lineup game={game} />
    </section>
  );
}

/** A row of dots: rounds done, this round, rounds to come. */
function Lineup({ game }: { game: GameView }) {
  const emoji: Record<string, string> = {
    question: '🧠',
    number: '🔢',
    reaction: '🤠',
    mash: '🚀',
  };
  return (
    <ol className="flex flex-wrap justify-center gap-2" aria-label="Rounds">
      {game.lineup.map((kind, i) => (
        <li
          key={i}
          className={`grid size-[2.6rem] place-items-center rounded-full text-xl ${i === game.round ? 'scale-125 bg-pop-yellow' : i < game.round ? 'bg-white/30 opacity-50' : 'bg-white/10'}`}
        >
          {emoji[kind]}
        </li>
      ))}
    </ol>
  );
}

function RoundStage({ game, players }: { game: GameView; players: PublicPlayer[] }) {
  const revealing = game.phase === 'REVEAL';
  const current = game.current;
  return (
    <section className="relative mt-3 flex min-h-0 flex-1 flex-col gap-3">
      {current.kind === 'question' && (
        <QuestionStage game={game} current={current} players={players} revealing={revealing} />
      )}
      {current.kind === 'number' && (
        <NumberStage game={game} current={current} players={players} revealing={revealing} />
      )}
      {current.kind === 'reaction' && (
        <ReactionStage game={game} current={current} players={players} revealing={revealing} />
      )}
      {current.kind === 'mash' && (
        <MashStage game={game} current={current} players={players} revealing={revealing} />
      )}
      {revealing ? (
        <ScoreStrip game={game} players={players} />
      ) : (
        // The race lanes already show everyone, so they get the room instead.
        current.kind !== 'mash' && <PlayerChips game={game} players={players} />
      )}
    </section>
  );
}

function StageHeader({
  game,
  label,
  prompt,
  big = false,
  revealing,
}: {
  game: GameView;
  label: string;
  prompt: React.ReactNode;
  big?: boolean;
  revealing: boolean;
}) {
  return (
    <div className="flex items-start gap-6">
      <div className="min-w-0 flex-1">
        <p className="text-xl font-bold uppercase tracking-[0.2em] text-pop-cyan">{label}</p>
        <h1
          data-testid="question-prompt"
          className={`mt-1 font-bold leading-tight ${big ? 'text-[5rem] tracking-wider' : 'text-[2.4rem]'}`}
        >
          {prompt}
        </h1>
      </div>
      {revealing ? (
        <NextIn deadline={game.phaseEndsAt} last={game.round + 1 >= game.totalRounds} />
      ) : (
        game.phaseEndsAt > 0 && (
          <CountdownBubble deadline={game.phaseEndsAt} totalMs={game.phaseMs} />
        )
      )}
    </div>
  );
}

function QuestionStage({
  game,
  current,
  players,
  revealing,
}: {
  game: GameView;
  current: Extract<RoundView, { kind: 'question' }>;
  players: PublicPlayer[];
  revealing: boolean;
}) {
  if (current.picking) {
    const chooser = players.find((p) => p.id === current.picking!.chooserId);
    return (
      <>
        <StageHeader
          game={game}
          revealing={false}
          label="🎯 Category Clash"
          prompt={
            <>
              {chooser ? <Avatar player={chooser} size="sm" /> : null}{' '}
              <span style={{ color: chooser ? playerColor(chooser.seat) : undefined }}>
                {chooser?.nickname ?? 'Someone'}
              </span>{' '}
              is picking the category…
            </>
          }
        />
        <ul className="grid flex-1 grid-cols-3 gap-4" data-testid="tv-categories">
          {current.picking.categories.map((category, i) => (
            <li
              key={category}
              className="grid animate-[breathe_2.8s_ease-in-out_infinite] place-items-center rounded-[1.75rem] text-4xl font-bold text-night-950"
              style={{ backgroundColor: playerColor(i + 2), animationDelay: `${i * 0.4}s` }}
            >
              {category}
            </li>
          ))}
        </ul>
      </>
    );
  }
  const question = current.question!;
  const pickedBy = (choice: number) =>
    revealing ? players.filter((p) => game.results?.[p.id]?.value === choice) : [];
  const twoChoices = question.choices.length === 2;
  return (
    <>
      <StageHeader
        game={game}
        revealing={revealing}
        label={current.style === 'emoji' ? '🤔 Which word is it?' : question.category}
        prompt={question.prompt}
        big={current.style === 'emoji'}
      />
      <ol className={`grid min-h-0 flex-1 gap-4 ${twoChoices ? 'grid-cols-2' : 'grid-cols-2'}`}>
        {question.choices.map((choice, i) => {
          const style = choiceStyle(i, current.style);
          const correct = current.answer === i;
          return (
            <li
              key={i}
              data-testid="tv-choice"
              data-correct={revealing ? correct : undefined}
              className={`relative flex items-center gap-4 rounded-[1.75rem] px-6 py-3 text-night-950 transition ${twoChoices ? 'justify-center' : ''} ${revealing && !correct ? 'opacity-35' : ''} ${correct ? 'animate-[pop-in_400ms_ease-out] ring-[0.4rem] ring-white' : ''}`}
              style={{ backgroundColor: style.color, boxShadow: `0 0.4rem 0 ${style.shadow}` }}
            >
              <span className={twoChoices ? 'text-6xl' : 'text-4xl'} aria-hidden>
                {style.shape}
              </span>
              <span
                className={`font-bold leading-tight ${twoChoices ? 'text-6xl' : 'flex-1 text-3xl'}`}
              >
                {choice}
              </span>
              {correct && <span className="text-4xl">✅</span>}
              {pickedBy(i).length > 0 && (
                <span className="absolute -top-3 right-4 flex -space-x-2">
                  {pickedBy(i).map((p) => (
                    <Avatar key={p.id} player={p} size="sm" />
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function NumberStage({
  game,
  current,
  players,
  revealing,
}: {
  game: GameView;
  current: Extract<RoundView, { kind: 'number' }>;
  players: PublicPlayer[];
  revealing: boolean;
}) {
  const question = current.question!;
  const unit = question.unit ? ` ${question.unit}` : '';
  const guesses = players
    .map((p) => ({ player: p, result: game.results?.[p.id] }))
    .filter((g) => g.result && g.result.value !== null)
    .sort((a, b) => (b.result!.points ?? 0) - (a.result!.points ?? 0));
  return (
    <>
      <StageHeader
        game={game}
        revealing={revealing}
        label="🔢 Closest wins"
        prompt={question.prompt}
      />
      {revealing && current.answer !== undefined ? (
        <div className="flex min-h-0 flex-1 items-center gap-8">
          <div className="flex flex-col items-center gap-2 rounded-[1.75rem] bg-pop-lime px-10 py-6 text-night-950">
            <span className="text-2xl font-bold uppercase tracking-widest">Answer</span>
            <span data-testid="number-answer" className="text-[5rem] font-bold leading-none">
              {current.answer.toLocaleString()}
            </span>
            <span className="text-2xl font-bold">{question.unit}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {current.fact && (
              <p className="text-2xl font-semibold text-white/80">💡 {current.fact}</p>
            )}
            <ol className="flex flex-wrap gap-3">
              {guesses.map(({ player, result }) => (
                <li
                  key={player.id}
                  className="flex items-center gap-2 rounded-full bg-night-800 py-1 pl-1 pr-4 text-2xl font-bold"
                >
                  <Avatar player={player} size="sm" />
                  {player.nickname}: {result!.value!.toLocaleString()}
                  {result!.points > 0 && <span className="text-pop-lime">+{result!.points}</span>}
                </li>
              ))}
              {guesses.length === 0 && (
                <li className="text-2xl text-white/60">Nobody guessed this time!</li>
              )}
            </ol>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <span className="text-[6rem] leading-none" aria-hidden>
            🤔
          </span>
          <p className="text-4xl font-bold">Type your guess on your phone!</p>
          <p className="text-2xl text-white/70">
            Somewhere between {question.min.toLocaleString()} and {question.max.toLocaleString()}
            {unit}
          </p>
        </div>
      )}
    </>
  );
}

function ReactionStage({
  game,
  current,
  players,
  revealing,
}: {
  game: GameView;
  current: Extract<RoundView, { kind: 'reaction' }>;
  players: PublicPlayer[];
  revealing: boolean;
}) {
  if (revealing) {
    const rows = players
      .map((p) => ({ player: p, result: game.results?.[p.id] }))
      .sort((a, b) => (a.result?.value ?? 1e9) - (b.result?.value ?? 1e9));
    return (
      <>
        <StageHeader game={game} revealing label="🤠 Quick Draw" prompt="Fastest fingers!" />
        <ol
          className="flex min-h-0 flex-1 flex-col justify-center gap-2"
          data-testid="reaction-results"
        >
          {rows.map(({ player, result }, i) => (
            <li
              key={player.id}
              className="flex items-center gap-4 rounded-full bg-night-800 py-1 pl-1 pr-6 text-2xl font-bold"
            >
              <Avatar player={player} size="sm" />
              <span className="w-[2.5rem] text-white/60">
                {result?.value != null ? `${i + 1}.` : ''}
              </span>
              <span className="flex-1">{player.nickname}</span>
              <span>
                {result?.falseStart
                  ? '🙈 Too early!'
                  : result?.value != null
                    ? `${(result.value / 1000).toFixed(3)} s`
                    : '😴 No tap'}
              </span>
              {result && result.points > 0 && (
                <span className="text-pop-lime">+{result.points}</span>
              )}
            </li>
          ))}
        </ol>
      </>
    );
  }
  const go = current.status === 'go';
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div
        data-testid="reaction-light"
        data-status={current.status}
        className={`grid size-[18rem] place-items-center rounded-full text-[4.5rem] font-bold text-night-950 ${go ? 'animate-[pop-in_250ms_ease-out] bg-pop-lime shadow-[0_0_6rem_1rem_var(--color-pop-lime)]' : 'animate-[breathe_1.6s_ease-in-out_infinite] bg-pop-pink'}`}
      >
        {go ? 'GO!' : '✋'}
      </div>
      <p className="text-4xl font-bold">{go ? 'TAP! TAP! TAP!' : 'Wait for it… don’t tap yet!'}</p>
    </div>
  );
}

function MashStage({
  game,
  current,
  players,
  revealing,
}: {
  game: GameView;
  current: Extract<RoundView, { kind: 'mash' }>;
  players: PublicPlayer[];
  revealing: boolean;
}) {
  const info = titleFor(current);
  const best = Math.max(20, ...Object.values(current.taps));
  return (
    <>
      <StageHeader
        game={game}
        revealing={revealing}
        label={`${info.emoji} ${info.title}`}
        prompt={revealing ? 'And the winner is…' : 'Tap tap TAP on your phone!'}
      />
      <ol
        className="flex min-h-0 flex-1 flex-col justify-center gap-[1.5%]"
        data-testid="mash-lanes"
      >
        {players.map((p) => {
          const taps = current.taps[p.id] ?? 0;
          const share = Math.min(1, taps / best);
          const winner = revealing && game.results?.[p.id]?.points === 1000;
          return (
            <li key={p.id} className="flex max-h-[3.2rem] min-h-0 flex-1 items-center gap-3">
              <span className="w-[9rem] truncate text-right text-xl font-bold">{p.nickname}</span>
              <div className="relative h-full flex-1 rounded-full bg-white/10">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150"
                  style={{ width: `${share * 100}%`, backgroundColor: `${playerColor(p.seat)}aa` }}
                />
                <span
                  className="absolute top-1/2 -translate-y-1/2 text-[2.2rem] leading-none transition-[left] duration-150"
                  style={{
                    left: `calc(${share * 100}% - ${share * 3}rem)`,
                    fontSize: current.theme === 'balloon' ? `${2 + share * 1.6}rem` : undefined,
                  }}
                  aria-hidden
                >
                  {current.theme === 'balloon' ? '🎈' : current.theme === 'turtle' ? '🐢' : '🚀'}
                </span>
              </div>
              <span data-testid="mash-count" className="w-[5rem] text-2xl font-bold">
                {taps} {winner && '🏆'}
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function PlayerChips({ game, players }: { game: GameView; players: PublicPlayer[] }) {
  const showDone = game.current.kind !== 'mash';
  return (
    <ul className="flex flex-wrap justify-center gap-3">
      {players.map((p) => {
        const done = game.doneIds.includes(p.id);
        return (
          <li
            key={p.id}
            data-testid="tv-player"
            data-answered={done}
            className={`flex items-center gap-2 rounded-full bg-night-800 py-1 pl-1 pr-4 ring-2 ${done ? 'ring-white/40' : 'ring-white/10'} ${p.connected ? '' : 'opacity-50'}`}
          >
            <Avatar player={p} size="sm" />
            <span className="max-w-[8rem] truncate text-xl font-bold">{p.nickname}</span>
            {showDone && (
              <span className="text-xl" aria-label={done ? 'locked in' : 'thinking'}>
                {done ? '🔒' : '🤔'}
              </span>
            )}
            <span className="text-lg font-semibold text-white/60">{game.scores[p.id] ?? 0}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Totals after a round, leader first, with this round's points. */
function ScoreStrip({ game, players }: { game: GameView; players: PublicPlayer[] }) {
  const sorted = [...players].sort((a, b) => (game.scores[b.id] ?? 0) - (game.scores[a.id] ?? 0));
  return (
    <ul className="flex flex-wrap justify-center gap-3" data-testid="score-strip">
      {sorted.map((p, i) => {
        const points = game.results?.[p.id]?.points ?? 0;
        return (
          <li
            key={p.id}
            data-testid="tv-player"
            className="flex items-center gap-2 rounded-full bg-night-800 py-1 pl-1 pr-4 ring-2 ring-white/20"
          >
            <Avatar player={p} size="sm" />
            <span className="max-w-[8rem] truncate text-xl font-bold">
              {i === 0 ? '👑 ' : ''}
              {p.nickname}
            </span>
            <span className="text-xl font-bold">{game.scores[p.id] ?? 0}</span>
            <span className={`text-lg font-bold ${points ? 'text-pop-lime' : 'text-white/40'}`}>
              +{points}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function CountdownBubble({ deadline, totalMs }: { deadline: number; totalMs: number }) {
  const seconds = useCountdown(deadline);
  const urgent = seconds <= 5;
  const fraction = totalMs > 0 ? Math.min(1, (seconds * 1000) / totalMs) : 0;
  const lastTick = useRef<number>(undefined);
  useEffect(() => {
    if (seconds > 0 && seconds <= 3 && lastTick.current !== seconds) sfx.tick();
    lastTick.current = seconds;
  }, [seconds]);
  return (
    <div
      data-testid="countdown"
      className="relative grid size-[6.5rem] shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(${urgent ? 'var(--color-pop-orange)' : 'var(--color-pop-yellow)'} ${fraction * 360}deg, rgb(255 255 255 / 0.1) 0deg)`,
      }}
    >
      <span
        className={`grid size-[5.3rem] place-items-center rounded-full bg-night-900 text-5xl font-bold ${urgent ? 'animate-[breathe_1s_ease-in-out_infinite] text-pop-orange' : ''}`}
      >
        {seconds}
      </span>
    </div>
  );
}

function NextIn({ deadline, last }: { deadline: number; last: boolean }) {
  const seconds = useCountdown(deadline);
  return (
    <p className="shrink-0 rounded-[1.5rem] bg-night-800 px-5 py-3 text-center text-xl font-semibold text-white/80">
      {last ? 'Final scores' : 'Next round'} in
      <span className="block text-4xl font-bold text-pop-yellow">{seconds}</span>
    </p>
  );
}

function FinalScores({ game, players }: { game: GameView; players: PublicPlayer[] }) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const ranked = (game.standings ?? []).flatMap((s) => {
    const player = byId.get(s.playerId);
    return player ? [{ ...s, player }] : [];
  });
  const winners = ranked.filter((r) => r.place === 1);
  const vip = players.find((p) => p.isVip);
  // Podium order: 2nd, 1st, 3rd.
  const podium = [ranked[1], ranked[0], ranked[2]];
  const heights = ['h-[7rem]', 'h-[10rem]', 'h-[5rem]'];

  return (
    <section className="relative mt-2 flex flex-1 flex-col items-center gap-4">
      <Confetti />
      <h1 data-testid="final-title" className="text-5xl font-bold">
        🏆 {winners.map((w) => w.player.nickname).join(' & ')} {winners.length > 1 ? 'win' : 'wins'}
        !
      </h1>
      <div className="flex flex-1 items-end justify-center gap-5">
        {podium.map((entry, i) =>
          entry ? (
            <div key={entry.playerId} className="flex w-[13rem] flex-col items-center gap-2">
              <Avatar player={entry.player} size="lg" />
              <span className="max-w-full truncate text-2xl font-bold">
                {entry.player.nickname}
              </span>
              <div
                data-testid="podium-step"
                className={`flex w-full flex-col items-center justify-start rounded-t-[1.5rem] pt-3 text-night-950 ${heights[i]}`}
                style={{ backgroundColor: playerColor(entry.player.seat) }}
              >
                <span className="text-4xl font-bold">{ordinal(entry.place)}</span>
                <span className="text-xl font-bold">{entry.score} pts</span>
              </div>
            </div>
          ) : null,
        )}
      </div>
      {ranked.length > 3 && (
        <ol className="flex flex-wrap justify-center gap-3">
          {ranked.slice(3).map((r) => (
            <li
              key={r.playerId}
              className="flex items-center gap-2 rounded-full bg-night-800 py-1 pl-1 pr-4"
            >
              <Avatar player={r.player} size="sm" />
              <span className="text-xl font-bold">
                {ordinal(r.place)} {r.player.nickname} · {r.score}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="rounded-[1.75rem] bg-night-800 px-6 py-3 text-2xl font-semibold ring-2 ring-pop-violet/40">
        👑 <span className="font-bold text-pop-yellow">{vip?.nickname ?? 'The VIP'}</span> or the
        remote picks the next game!
      </p>
    </section>
  );
}

function Avatar({ player, size }: { player: PublicPlayer; size: 'sm' | 'lg' }) {
  return (
    <span
      title={player.nickname}
      className={`inline-grid shrink-0 place-items-center rounded-full align-middle ring-2 ring-night-950 ${size === 'lg' ? 'size-[5rem] text-5xl' : 'size-[2.6rem] text-2xl'}`}
      style={{ backgroundColor: playerColor(player.seat) }}
      aria-hidden
    >
      {seatAvatar(player.seat)}
    </span>
  );
}
