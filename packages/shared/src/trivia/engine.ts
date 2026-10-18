import type { Question } from './questions.js';

/**
 * Trivia Chaos rules as pure functions: every function takes the current game and `now`
 * (milliseconds) and returns a new game. No timers, sockets or randomness live here
 * except through the `random` argument.
 */

export interface TriviaSettings {
  questionCount: number;
  questionMs: number;
  revealMs: number;
}

export const DEFAULT_TRIVIA_SETTINGS: TriviaSettings = {
  questionCount: 10,
  questionMs: 20_000,
  revealMs: 7_000,
};

export const MAX_POINTS = 1000;
/** A correct answer at the very last moment still earns half points. */
export const MIN_CORRECT_POINTS = 500;

export interface RoundResult {
  choice: number | null;
  points: number;
}

export interface TriviaGame {
  phase: 'QUESTION' | 'REVEAL' | 'FINAL';
  settings: TriviaSettings;
  questions: Question[];
  /** 0-based index into `questions`. */
  round: number;
  playerIds: string[];
  questionStartedAt: number;
  /** End of the answer window (QUESTION) — absolute server time. */
  deadline: number;
  /** When the reveal automatically moves on (REVEAL). */
  revealEndsAt: number;
  answers: Record<string, { choice: number; at: number }>;
  scores: Record<string, number>;
  results: Record<string, RoundResult>;
}

export type AnswerRejection =
  | 'WRONG_PHASE'
  | 'NOT_A_PLAYER'
  | 'INVALID_CHOICE'
  | 'ALREADY_ANSWERED'
  | 'TOO_LATE'
  | 'WRONG_ROUND';

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
export function pointsFor(elapsedMs: number, questionMs: number): number {
  const fraction = Math.min(Math.max(elapsedMs / questionMs, 0), 1);
  return Math.round(MAX_POINTS - (MAX_POINTS - MIN_CORRECT_POINTS) * fraction);
}

export function startGame(
  playerIds: string[],
  questions: Question[],
  settings: TriviaSettings,
  now: number,
  random: () => number,
): TriviaGame {
  if (questions.length === 0) throw new Error('A game needs at least one question');
  const picked = questions.slice(0, settings.questionCount).map((q) => shuffleChoices(q, random));
  return {
    phase: 'QUESTION',
    settings: { ...settings, questionCount: picked.length },
    questions: picked,
    round: 0,
    playerIds: [...playerIds],
    questionStartedAt: now,
    deadline: now + settings.questionMs,
    revealEndsAt: 0,
    answers: {},
    scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
    results: {},
  };
}

export function submitAnswer(
  game: TriviaGame,
  playerId: string,
  round: number,
  choice: number,
  now: number,
): { game: TriviaGame } | { rejected: AnswerRejection } {
  if (game.phase !== 'QUESTION') return { rejected: 'WRONG_PHASE' };
  if (round !== game.round) return { rejected: 'WRONG_ROUND' };
  if (!game.playerIds.includes(playerId)) return { rejected: 'NOT_A_PLAYER' };
  const question = game.questions[game.round]!;
  if (!Number.isInteger(choice) || choice < 0 || choice >= question.choices.length)
    return { rejected: 'INVALID_CHOICE' };
  if (game.answers[playerId]) return { rejected: 'ALREADY_ANSWERED' };
  if (now > game.deadline) return { rejected: 'TOO_LATE' };
  return { game: { ...game, answers: { ...game.answers, [playerId]: { choice, at: now } } } };
}

/** True when the question should close: time is up, or everyone still connected has answered. */
export function isQuestionOver(
  game: TriviaGame,
  connectedPlayerIds: string[],
  now: number,
): boolean {
  if (game.phase !== 'QUESTION') return false;
  if (now >= game.deadline) return true;
  const waitingFor = connectedPlayerIds.filter(
    (id) => game.playerIds.includes(id) && !game.answers[id],
  );
  return connectedPlayerIds.some((id) => game.playerIds.includes(id)) && waitingFor.length === 0;
}

export function revealAnswer(game: TriviaGame, now: number): TriviaGame {
  if (game.phase !== 'QUESTION') return game;
  const question = game.questions[game.round]!;
  const results: Record<string, RoundResult> = {};
  const scores = { ...game.scores };
  for (const id of game.playerIds) {
    const answer = game.answers[id];
    const points =
      answer && answer.choice === question.answer
        ? pointsFor(answer.at - game.questionStartedAt, game.settings.questionMs)
        : 0;
    results[id] = { choice: answer?.choice ?? null, points };
    scores[id] = (scores[id] ?? 0) + points;
  }
  return { ...game, phase: 'REVEAL', results, scores, revealEndsAt: now + game.settings.revealMs };
}

/** From REVEAL: the next question, or the final leaderboard after the last one. */
export function advance(game: TriviaGame, now: number): TriviaGame {
  if (game.phase !== 'REVEAL') return game;
  if (game.round + 1 >= game.questions.length) return { ...game, phase: 'FINAL' };
  return {
    ...game,
    phase: 'QUESTION',
    round: game.round + 1,
    questionStartedAt: now,
    deadline: now + game.settings.questionMs,
    revealEndsAt: 0,
    answers: {},
    results: {},
  };
}

/** Removes a player who left mid-game; their points leave with them. */
export function removePlayer(game: TriviaGame, playerId: string): TriviaGame {
  const without = <T>(record: Record<string, T>) =>
    Object.fromEntries(Object.entries(record).filter(([id]) => id !== playerId));
  return {
    ...game,
    playerIds: game.playerIds.filter((id) => id !== playerId),
    answers: without(game.answers),
    scores: without(game.scores),
    results: without(game.results),
  };
}

/** Player ids ordered by score (highest first), with shared places for ties. */
export function standings(game: TriviaGame): { playerId: string; score: number; place: number }[] {
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
