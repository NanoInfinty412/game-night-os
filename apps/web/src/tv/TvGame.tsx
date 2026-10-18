import type { GameView, PublicPlayer, RoomSnapshot } from '@gno/shared';
import { Confetti } from '../components/Confetti';
import { FloatingShapes } from '../components/FloatingShapes';
import { Logo } from '../components/Logo';
import { seatAvatar } from '../components/avatars';
import { playerColor } from '../components/playerColor';
import { answerStyle, ordinal } from '../game/answerStyles';
import { useCountdown } from '../game/useCountdown';
import { MusicControl } from './MusicControl';

/** The shared screen while Trivia Chaos is running: question, reveal and final scores. */
export function TvGame({ room, connected }: { room: RoomSnapshot; connected: boolean }) {
  const game = room.game!;
  return (
    <main className="relative flex h-screen flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--color-night-700),_var(--color-night-950)_70%)] px-8 py-5">
      <FloatingShapes />
      <header className="relative flex items-center justify-between gap-4">
        <Logo className="text-3xl" />
        <p
          data-testid="round-label"
          className="rounded-full bg-white/10 px-5 py-1.5 text-2xl font-bold"
        >
          {room.phase === 'FINAL'
            ? 'Final scores'
            : `Question ${game.round + 1} of ${game.totalRounds}`}
        </p>
        <div className="flex items-center gap-4">
          {!connected && (
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
      {room.phase === 'FINAL' ? (
        <FinalScores game={game} players={room.players} />
      ) : (
        <QuestionStage game={game} players={room.players} revealing={room.phase === 'REVEAL'} />
      )}
    </main>
  );
}

function QuestionStage({
  game,
  players,
  revealing,
}: {
  game: GameView;
  players: PublicPlayer[];
  revealing: boolean;
}) {
  const reveal = revealing ? game.reveal : undefined;
  const pickedBy = (choice: number) =>
    reveal ? players.filter((p) => reveal.results[p.id]?.choice === choice) : [];

  return (
    <section className="relative mt-4 flex flex-1 flex-col gap-4">
      <div className="flex items-start gap-6">
        <div className="flex-1">
          <p className="text-xl font-bold uppercase tracking-[0.2em] text-pop-cyan">
            {game.question.category}
          </p>
          <h1 data-testid="question-prompt" className="mt-1 text-[2.6rem] font-bold leading-tight">
            {game.question.prompt}
          </h1>
        </div>
        {reveal ? (
          <NextIn deadline={game.revealEndsAt} last={game.round + 1 >= game.totalRounds} />
        ) : (
          <CountdownBubble deadline={game.deadline} totalMs={game.questionMs} />
        )}
      </div>

      <ol className="grid flex-1 grid-cols-2 gap-4">
        {game.question.choices.map((choice, i) => {
          const style = answerStyle(i);
          const correct = reveal?.answer === i;
          return (
            <li
              key={i}
              data-testid="tv-choice"
              data-correct={reveal ? correct : undefined}
              className={`relative flex items-center gap-4 rounded-[1.75rem] px-6 py-3 text-night-950 transition ${reveal && !correct ? 'opacity-35' : ''} ${correct ? 'animate-[pop-in_400ms_ease-out] ring-[0.4rem] ring-white' : ''}`}
              style={{ backgroundColor: style.color, boxShadow: `0 0.4rem 0 ${style.shadow}` }}
            >
              <span className="text-4xl" aria-hidden>
                {style.shape}
              </span>
              <span className="flex-1 text-3xl font-bold leading-tight">{choice}</span>
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

      <ul className="flex flex-wrap justify-center gap-3">
        {players.map((p) => {
          const answered = game.answeredIds.includes(p.id);
          const points = reveal?.results[p.id]?.points;
          return (
            <li
              key={p.id}
              data-testid="tv-player"
              data-answered={answered}
              className={`flex items-center gap-2 rounded-full bg-night-800 py-1 pl-1 pr-4 ring-2 ${answered || reveal ? 'ring-white/40' : 'ring-white/10'} ${p.connected ? '' : 'opacity-50'}`}
            >
              <Avatar player={p} size="sm" />
              <span className="max-w-[8rem] truncate text-xl font-bold">{p.nickname}</span>
              {reveal ? (
                <span className={`text-xl font-bold ${points ? 'text-pop-lime' : 'text-white/50'}`}>
                  {points ? `+${points}` : '+0'}
                </span>
              ) : (
                <span className="text-xl" aria-label={answered ? 'locked in' : 'thinking'}>
                  {answered ? '🔒' : '🤔'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CountdownBubble({ deadline, totalMs }: { deadline: number; totalMs: number }) {
  const seconds = useCountdown(deadline);
  const urgent = seconds <= 5;
  const fraction = Math.min(1, (seconds * 1000) / totalMs);
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
      {last ? 'Final scores' : 'Next question'} in
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
        👑 <span className="font-bold text-pop-yellow">{vip?.nickname ?? 'The VIP'}</span> can start
        another round from their phone!
      </p>
    </section>
  );
}

function Avatar({ player, size }: { player: PublicPlayer; size: 'sm' | 'lg' }) {
  return (
    <span
      title={player.nickname}
      className={`grid shrink-0 place-items-center rounded-full ring-2 ring-night-950 ${size === 'lg' ? 'size-[5rem] text-5xl' : 'size-[2.6rem] text-2xl'}`}
      style={{ backgroundColor: playerColor(player.seat) }}
      aria-hidden
    >
      {seatAvatar(player.seat)}
    </span>
  );
}
