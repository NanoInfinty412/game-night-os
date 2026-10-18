import type { NumberQuestion, Question } from './content.js';

/**
 * The party game as pure functions. A game is a playlist of rounds; each round is one of a few
 * kinds (a question, a number guess, a reaction test, a tapping race). Every function takes the
 * current game and `now` (ms) and returns a new game: no timers, sockets or randomness live here.
 *
 * Phases per round: INTRO (title card) → PLAY → REVEAL, then the next round's INTRO, or FINAL.
 */

export type QuestionStyle = 'trivia' | 'truefalse' | 'emoji';

export interface PickOption {
  category: string;
  question: Question;
}

export type RoundSpec =
  | {
      kind: 'question';
      style: QuestionStyle;
      question: Question;
      ms: number;
      /** Category Clash: `chooserId` first picks one of these, which replaces `question`. */
      pick?: { chooserId: string; options: PickOption[]; ms: number };
    }
  | { kind: 'number'; question: NumberQuestion; ms: number }
  | { kind: 'reaction'; goDelayMs: number; windowMs: number }
  | { kind: 'mash'; theme: MashTheme; ms: number };

export type RoundKind = RoundSpec['kind'];
export type MashTheme = 'rocket' | 'balloon' | 'turtle';

export type RoundState =
  | {
      kind: 'question';
      spec: Extract<RoundSpec, { kind: 'question' }>;
      status: 'picking' | 'answering';
      question: Question;
      /** When answering opened, for speed points. */
      openedAt: number;
      answers: Record<string, { choice: number; at: number }>;
    }
  | {
      kind: 'number';
      spec: Extract<RoundSpec, { kind: 'number' }>;
      guesses: Record<string, { value: number; at: number }>;
    }
  | {
      kind: 'reaction';
      spec: Extract<RoundSpec, { kind: 'reaction' }>;
      goAt: number;
      status: 'wait' | 'go';
      taps: Record<string, { at: number; falseStart: boolean }>;
    }
  | {
      kind: 'mash';
      spec: Extract<RoundSpec, { kind: 'mash' }>;
      taps: Record<string, number>;
      lastTapAt: Record<string, number>;
    };

export interface RoundResult {
  points: number;
  /** Choice index, guess, reaction time in ms, or tap count; null if the player didn't play. */
  value: number | null;
  falseStart?: boolean;
}

export interface PartyTiming {
  introMs: number;
  revealMs: number;
}

export const DEFAULT_TIMING: PartyTiming = { introMs: 4_000, revealMs: 7_000 };

export interface PartyGame {
  gameId: string;
  phase: 'INTRO' | 'PLAY' | 'REVEAL' | 'FINAL';
  timing: PartyTiming;
  rounds: RoundSpec[];
  /** 0-based index into `rounds`. */
  index: number;
  playerIds: string[];
  round: RoundState;
  phaseEndsAt: number;
  scores: Record<string, number>;
  /** Filled when a round is revealed. */
  results: Record<string, RoundResult>;
}

export type PlayerAction =
  | { type: 'answer'; round: number; choice: number }
  | { type: 'guess'; round: number; value: number }
  | { type: 'tap'; round: number }
  | { type: 'pick'; round: number; option: number };

export type ActionRejection =
  | 'WRONG_PHASE'
  | 'WRONG_ROUND'
  | 'NOT_A_PLAYER'
  | 'NOT_YOUR_PICK'
  | 'INVALID_ACTION'
  | 'ALREADY_ANSWERED'
  | 'TOO_LATE'
  | 'TOO_FAST';

export const MAX_POINTS = 1000;
/** A correct answer at the very last moment still earns half points. */
export const MIN_CORRECT_POINTS = 500;
/** Points for 1st, 2nd, 3rd… in ranked rounds (closest guess, fastest reaction, most taps). */
export const RANK_POINTS = [1000, 800, 650, 500, 400, 300, 250, 200];
/** Extra points for guessing a number exactly. */
export const EXACT_BONUS = 250;
/** Fastest a finger can honestly tap: taps closer together than this are ignored. */
export const MIN_TAP_GAP_MS = 50;

/** Fisher–Yates on a copy. */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Same question with its choices in a random order; `answer` follows the correct choice. */
export function shuffleChoices(question: Question, random: () => number): Question {
  const order = shuffle(
    question.choices.map((_, i) => i),
    random,
  );
  return {
    ...question,
    choices: order.map((i) => question.choices[i]!),
    answer: order.indexOf(question.answer),
  };
}

/** Points for a correct answer given after `elapsedMs`: 1000 at once, sliding to 500 at the deadline. */
export function pointsFor(elapsedMs: number, windowMs: number): number {
  const fraction = Math.min(Math.max(elapsedMs / windowMs, 0), 1);
  return Math.round(MAX_POINTS - (MAX_POINTS - MIN_CORRECT_POINTS) * fraction);
}

/**
 * Ranks players by a score (lower is better for `low`), giving tied players the same rank.
 * Players with `null` get no rank and no points.
 */
export function rankPoints(
  values: Record<string, number | null>,
  better: 'low' | 'high',
): Record<string, number> {
  const ranked = Object.entries(values)
    .filter((entry): entry is [string, number] => entry[1] !== null)
    .sort(([, a], [, b]) => (better === 'low' ? a - b : b - a));
  const points: Record<string, number> = {};
  let rank = 0;
  ranked.forEach(([id, value], index) => {
    if (index === 0 || value !== ranked[index - 1]![1]) rank = index;
    points[id] = RANK_POINTS[rank] ?? RANK_POINTS[RANK_POINTS.length - 1]!;
  });
  for (const id of Object.keys(values)) points[id] ??= 0;
  return points;
}

function playMs(spec: RoundSpec): number {
  switch (spec.kind) {
    case 'question':
      return spec.pick ? spec.pick.ms : spec.ms;
    case 'number':
    case 'mash':
      return spec.ms;
    case 'reaction':
      return spec.goDelayMs + spec.windowMs;
  }
}

function freshRound(spec: RoundSpec, now: number): RoundState {
  switch (spec.kind) {
    case 'question':
      return {
        kind: 'question',
        spec,
        status: spec.pick ? 'picking' : 'answering',
        question: spec.question,
        openedAt: now,
        answers: {},
      };
    case 'number':
      return { kind: 'number', spec, guesses: {} };
    case 'reaction':
      return { kind: 'reaction', spec, goAt: now + spec.goDelayMs, status: 'wait', taps: {} };
    case 'mash':
      return { kind: 'mash', spec, taps: {}, lastTapAt: {} };
  }
}

function enterIntro(game: PartyGame, index: number, now: number): PartyGame {
  const spec = game.rounds[index]!;
  return {
    ...game,
    phase: 'INTRO',
    index,
    round: freshRound(spec, now),
    phaseEndsAt: now + game.timing.introMs,
    results: {},
  };
}

function enterPlay(game: PartyGame, now: number): PartyGame {
  const spec = game.rounds[game.index]!;
  return { ...game, phase: 'PLAY', round: freshRound(spec, now), phaseEndsAt: now + playMs(spec) };
}

export function startGame(
  gameId: string,
  playerIds: string[],
  rounds: RoundSpec[],
  timing: PartyTiming,
  now: number,
): PartyGame {
  if (rounds.length === 0) throw new Error('A game needs at least one round');
  const blank: PartyGame = {
    gameId,
    phase: 'INTRO',
    timing,
    rounds,
    index: 0,
    playerIds: [...playerIds],
    round: freshRound(rounds[0]!, now),
    phaseEndsAt: 0,
    scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
    results: {},
  };
  return enterIntro(blank, 0, now);
}

/** Applies one player's action, or says why it was refused. */
export function act(
  game: PartyGame,
  playerId: string,
  action: PlayerAction,
  now: number,
): { game: PartyGame } | { rejected: ActionRejection } {
  if (game.phase !== 'PLAY') return { rejected: 'WRONG_PHASE' };
  if (action.round !== game.index) return { rejected: 'WRONG_ROUND' };
  if (!game.playerIds.includes(playerId)) return { rejected: 'NOT_A_PLAYER' };
  if (now > game.phaseEndsAt) return { rejected: 'TOO_LATE' };
  const round = game.round;
  const withRound = (next: RoundState) => ({ game: { ...game, round: next } });

  switch (action.type) {
    case 'pick': {
      if (round.kind !== 'question' || round.status !== 'picking' || !round.spec.pick)
        return { rejected: 'WRONG_PHASE' };
      if (round.spec.pick.chooserId !== playerId) return { rejected: 'NOT_YOUR_PICK' };
      const option = round.spec.pick.options[action.option];
      if (!Number.isInteger(action.option) || !option) return { rejected: 'INVALID_ACTION' };
      return { game: openPicked(game, option.question, now) };
    }
    case 'answer': {
      if (round.kind !== 'question' || round.status !== 'answering')
        return { rejected: 'WRONG_PHASE' };
      const { choice } = action;
      if (!Number.isInteger(choice) || choice < 0 || choice >= round.question.choices.length)
        return { rejected: 'INVALID_ACTION' };
      if (round.answers[playerId]) return { rejected: 'ALREADY_ANSWERED' };
      return withRound({
        ...round,
        answers: { ...round.answers, [playerId]: { choice, at: now } },
      });
    }
    case 'guess': {
      if (round.kind !== 'number') return { rejected: 'WRONG_PHASE' };
      const { value } = action;
      const { min, max } = round.spec.question;
      if (!Number.isInteger(value) || value < min || value > max)
        return { rejected: 'INVALID_ACTION' };
      if (round.guesses[playerId]) return { rejected: 'ALREADY_ANSWERED' };
      return withRound({ ...round, guesses: { ...round.guesses, [playerId]: { value, at: now } } });
    }
    case 'tap': {
      if (round.kind === 'reaction') {
        if (round.taps[playerId]) return { rejected: 'ALREADY_ANSWERED' };
        const tap = { at: now, falseStart: now < round.goAt };
        return withRound({ ...round, taps: { ...round.taps, [playerId]: tap } });
      }
      if (round.kind === 'mash') {
        const last = round.lastTapAt[playerId];
        if (last !== undefined && now - last < MIN_TAP_GAP_MS) return { rejected: 'TOO_FAST' };
        return withRound({
          ...round,
          taps: { ...round.taps, [playerId]: (round.taps[playerId] ?? 0) + 1 },
          lastTapAt: { ...round.lastTapAt, [playerId]: now },
        });
      }
      return { rejected: 'WRONG_PHASE' };
    }
  }
}

/** Category Clash: the chosen question opens with a fresh answer window. */
function openPicked(game: PartyGame, question: Question, now: number): PartyGame {
  const round = game.round;
  if (round.kind !== 'question') return game;
  return {
    ...game,
    round: { ...round, status: 'answering', question, openedAt: now, answers: {} },
    phaseEndsAt: now + round.spec.ms,
  };
}

/** Who has done their part this round (answered, guessed, tapped). */
export function doneIds(game: PartyGame): string[] {
  const round = game.round;
  if (game.phase !== 'PLAY' && game.phase !== 'REVEAL') return [];
  switch (round.kind) {
    case 'question':
      return Object.keys(round.answers);
    case 'number':
      return Object.keys(round.guesses);
    case 'reaction':
      return Object.keys(round.taps);
    case 'mash':
      return Object.keys(round.taps);
  }
}

function isPlayOver(game: PartyGame, connectedIds: string[], now: number): boolean {
  if (now >= game.phaseEndsAt) return true;
  const round = game.round;
  if (round.kind === 'mash') return false; // Everyone taps until the buzzer.
  if (round.kind === 'question' && round.status === 'picking') return false;
  const playing = connectedIds.filter((id) => game.playerIds.includes(id));
  if (playing.length === 0) return false;
  const done = new Set(doneIds(game));
  return playing.every((id) => done.has(id));
}

function scoreRound(game: PartyGame): Record<string, RoundResult> {
  const round = game.round;
  const results: Record<string, RoundResult> = {};
  const ids = game.playerIds;
  switch (round.kind) {
    case 'question': {
      for (const id of ids) {
        const answer = round.answers[id];
        const correct = answer?.choice === round.question.answer;
        results[id] = {
          value: answer?.choice ?? null,
          points: correct ? pointsFor(answer.at - round.openedAt, round.spec.ms) : 0,
        };
      }
      return results;
    }
    case 'number': {
      const target = round.spec.question.answer;
      const off = Object.fromEntries(
        ids.map((id) => {
          const guess = round.guesses[id];
          return [id, guess ? Math.abs(guess.value - target) : null];
        }),
      );
      const points = rankPoints(off, 'low');
      for (const id of ids) {
        const guess = round.guesses[id];
        results[id] = {
          value: guess?.value ?? null,
          points: (points[id] ?? 0) + (guess?.value === target ? EXACT_BONUS : 0),
        };
      }
      return results;
    }
    case 'reaction': {
      const times = Object.fromEntries(
        ids.map((id) => {
          const tap = round.taps[id];
          return [id, tap && !tap.falseStart ? tap.at - round.goAt : null];
        }),
      );
      const points = rankPoints(times, 'low');
      for (const id of ids) {
        const tap = round.taps[id];
        results[id] = {
          value: times[id] ?? null,
          points: points[id] ?? 0,
          ...(tap?.falseStart && { falseStart: true }),
        };
      }
      return results;
    }
    case 'mash': {
      const taps = Object.fromEntries(ids.map((id) => [id, round.taps[id] ?? null]));
      const points = rankPoints(taps, 'high');
      for (const id of ids) results[id] = { value: taps[id] ?? null, points: points[id] ?? 0 };
      return results;
    }
  }
}

function reveal(game: PartyGame, now: number): PartyGame {
  const results = scoreRound(game);
  const scores = { ...game.scores };
  for (const [id, result] of Object.entries(results))
    scores[id] = (scores[id] ?? 0) + result.points;
  return { ...game, phase: 'REVEAL', results, scores, phaseEndsAt: now + game.timing.revealMs };
}

function advance(game: PartyGame, now: number): PartyGame {
  if (game.index + 1 >= game.rounds.length) return { ...game, phase: 'FINAL', phaseEndsAt: 0 };
  return enterIntro(game, game.index + 1, now);
}

/**
 * Applies whatever the clock (or players dropping out) says should have happened by `now`.
 * Returns the same object when nothing changed.
 */
export function tick(game: PartyGame, connectedIds: string[], now: number): PartyGame {
  let current = game;
  // A few steps at most (e.g. intro ends → play), bounded so a bad clock can't spin.
  for (let step = 0; step < 8; step++) {
    const next = step1(current, connectedIds, now);
    if (next === current) return current;
    current = next;
  }
  return current;
}

function step1(game: PartyGame, connectedIds: string[], now: number): PartyGame {
  switch (game.phase) {
    case 'INTRO':
      return now >= game.phaseEndsAt ? enterPlay(game, now) : game;
    case 'PLAY': {
      const round = game.round;
      if (round.kind === 'question' && round.status === 'picking' && round.spec.pick) {
        const chooserHere = connectedIds.includes(round.spec.pick.chooserId);
        // Nobody to pick, or they ran out of time: the first option it is.
        if (!chooserHere || now >= game.phaseEndsAt)
          return openPicked(game, round.spec.pick.options[0]!.question, now);
        return game;
      }
      if (round.kind === 'reaction' && round.status === 'wait' && now >= round.goAt) {
        return { ...game, round: { ...round, status: 'go' } };
      }
      return isPlayOver(game, connectedIds, now) ? reveal(game, now) : game;
    }
    case 'REVEAL':
      return now >= game.phaseEndsAt ? advance(game, now) : game;
    case 'FINAL':
      return game;
  }
}

/** Host or VIP skips ahead: ends an intro or a reveal early. */
export function skip(game: PartyGame, now: number): PartyGame {
  if (game.phase === 'INTRO') return enterPlay(game, now);
  if (game.phase === 'REVEAL') return advance(game, now);
  return game;
}

/** When `tick` next needs to run, or undefined if nothing is pending. */
export function nextDeadline(game: PartyGame): number | undefined {
  if (game.phase === 'FINAL') return undefined;
  const round = game.round;
  if (game.phase === 'PLAY' && round.kind === 'reaction' && round.status === 'wait')
    return Math.min(round.goAt, game.phaseEndsAt);
  return game.phaseEndsAt;
}

/** Removes a player who left mid-game; their points leave with them. */
export function removePlayer(game: PartyGame, playerId: string): PartyGame {
  const without = <T>(record: Record<string, T>) =>
    Object.fromEntries(Object.entries(record).filter(([id]) => id !== playerId));
  const round = game.round;
  let nextRound: RoundState = round;
  if (round.kind === 'question') nextRound = { ...round, answers: without(round.answers) };
  if (round.kind === 'number') nextRound = { ...round, guesses: without(round.guesses) };
  if (round.kind === 'reaction') nextRound = { ...round, taps: without(round.taps) };
  if (round.kind === 'mash')
    nextRound = { ...round, taps: without(round.taps), lastTapAt: without(round.lastTapAt) };
  return {
    ...game,
    playerIds: game.playerIds.filter((id) => id !== playerId),
    round: nextRound,
    scores: without(game.scores),
    results: without(game.results),
  };
}

export interface StandingEntry {
  playerId: string;
  score: number;
  place: number;
}

/** Player ids ordered by score (highest first), with shared places for ties. */
export function standings(game: PartyGame): StandingEntry[] {
  const sorted = [...game.playerIds].sort((a, b) => (game.scores[b] ?? 0) - (game.scores[a] ?? 0));
  let place = 0;
  let previous: number | undefined;
  return sorted.map((playerId, index) => {
    const score = game.scores[playerId] ?? 0;
    if (score !== previous) place = index + 1;
    previous = score;
    return { playerId, score, place };
  });
}
