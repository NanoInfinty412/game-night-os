import { z } from 'zod';
import type { GameContent, NumberQuestion, Question } from './content.js';
import {
  shuffle,
  shuffleChoices,
  type MashTheme,
  type QuestionStyle,
  type RoundKind,
  type RoundSpec,
} from './engine.js';

export const GAME_IDS = [
  'party-mix',
  'trivia',
  'category-clash',
  'lightning',
  'quick-draw',
  'tap-frenzy',
  'closest-wins',
  'emoji-riddles',
] as const;
export type GameId = (typeof GAME_IDS)[number];
export const gameIdSchema = z.enum(GAME_IDS);
export const DEFAULT_GAME: GameId = 'party-mix';

export interface GameInfo {
  id: GameId;
  title: string;
  emoji: string;
  /** One short, friendly line for the menu. */
  tagline: string;
  /** Card colour on the TV menu. */
  color: string;
}

export const GAMES: readonly GameInfo[] = [
  {
    id: 'party-mix',
    title: 'Party Mix',
    emoji: '🎉',
    tagline: 'A bit of everything: trivia, speed, guesses and a tapping finale!',
    color: '#ff4f9a',
  },
  {
    id: 'trivia',
    title: 'Trivia Chaos',
    emoji: '🧠',
    tagline: '10 questions. Answer fast for bigger points!',
    color: '#9b7bff',
  },
  {
    id: 'category-clash',
    title: 'Category Clash',
    emoji: '🎯',
    tagline: 'Take turns choosing the category, then everyone answers.',
    color: '#3ee0d0',
  },
  {
    id: 'lightning',
    title: 'Lightning Round',
    emoji: '⚡',
    tagline: 'True or false? You have 8 seconds. Go go go!',
    color: '#ffd23f',
  },
  {
    id: 'quick-draw',
    title: 'Quick Draw',
    emoji: '🤠',
    tagline: 'Wait for GO… then tap first! Too early and you are out.',
    color: '#ff8a3d',
  },
  {
    id: 'tap-frenzy',
    title: 'Tap Frenzy',
    emoji: '🚀',
    tagline: 'Tap as fast as you can to win the race!',
    color: '#5ab0ff',
  },
  {
    id: 'closest-wins',
    title: 'Closest Wins',
    emoji: '🔢',
    tagline: 'Guess the number. Nearest guess takes the crown!',
    color: '#a6e22e',
  },
  {
    id: 'emoji-riddles',
    title: 'Emoji Riddles',
    emoji: '🤔',
    tagline: 'Which word do the emojis spell?',
    color: '#ff6b6b',
  },
];

export function gameInfo(id: string): GameInfo {
  return GAMES.find((g) => g.id === id) ?? GAMES[0]!;
}

/** Title card text for each kind of round. */
export function roundInfo(
  kind: RoundKind,
  detail?: { style?: QuestionStyle; picking?: boolean; theme?: MashTheme },
): { title: string; emoji: string; howTo: string } {
  switch (kind) {
    case 'question':
      if (detail?.picking)
        return {
          title: 'Category Clash',
          emoji: '🎯',
          howTo: 'One player picks the category. Then everyone answers!',
        };
      if (detail?.style === 'truefalse')
        return { title: 'True or False?', emoji: '⚡', howTo: 'Quick! Tap True or False.' };
      if (detail?.style === 'emoji')
        return { title: 'Emoji Riddle', emoji: '🤔', howTo: 'Which word do the emojis spell?' };
      return {
        title: 'Trivia',
        emoji: '🧠',
        howTo: 'Pick the right answer. Faster = more points!',
      };
    case 'number':
      return {
        title: 'Closest Wins',
        emoji: '🔢',
        howTo: 'Type your best guess. Nearest number wins!',
      };
    case 'reaction':
      return {
        title: 'Quick Draw',
        emoji: '🤠',
        howTo: 'Wait for GO, then tap your phone first. No peeking early!',
      };
    case 'mash': {
      const themes: Record<MashTheme, string> = {
        rocket: 'Rocket Race',
        balloon: 'Balloon Pop',
        turtle: 'Turbo Turtles',
      };
      return {
        title: themes[detail?.theme ?? 'rocket'],
        emoji: detail?.theme === 'balloon' ? '🎈' : detail?.theme === 'turtle' ? '🐢' : '🚀',
        howTo: 'Tap, tap, TAP as fast as you can!',
      };
    }
  }
}

export interface RoundTimings {
  triviaMs: number;
  trueFalseMs: number;
  emojiMs: number;
  numberMs: number;
  pickMs: number;
  /** Reaction "GO" comes at a random moment between these. */
  goDelayMinMs: number;
  goDelayMaxMs: number;
  reactionWindowMs: number;
  mashMs: number;
}

export const DEFAULT_ROUND_TIMINGS: RoundTimings = {
  triviaMs: 20_000,
  trueFalseMs: 8_000,
  emojiMs: 20_000,
  numberMs: 25_000,
  pickMs: 12_000,
  goDelayMinMs: 2_500,
  goDelayMaxMs: 6_000,
  reactionWindowMs: 3_000,
  mashMs: 8_000,
};

export interface BuildOptions {
  timings?: Partial<RoundTimings>;
  /** How many questions Trivia Chaos asks. */
  triviaCount?: number;
  /** Question ids asked earlier in this room; fresh ones are preferred. */
  used?: ReadonlySet<string>;
}

type Step =
  | { kind: 'question'; style: QuestionStyle }
  | { kind: 'pick' }
  | { kind: 'number' }
  | { kind: 'reaction' }
  | { kind: 'mash'; theme: MashTheme };

function lineup(gameId: GameId, triviaCount: number): Step[] {
  const repeat = (n: number, step: Step) => Array.from({ length: n }, () => step);
  switch (gameId) {
    case 'trivia':
      return repeat(triviaCount, { kind: 'question', style: 'trivia' });
    case 'category-clash':
      return repeat(8, { kind: 'pick' });
    case 'lightning':
      return repeat(12, { kind: 'question', style: 'truefalse' });
    case 'quick-draw':
      return repeat(5, { kind: 'reaction' });
    case 'tap-frenzy':
      return [
        { kind: 'mash', theme: 'rocket' },
        { kind: 'mash', theme: 'turtle' },
        { kind: 'mash', theme: 'balloon' },
      ];
    case 'closest-wins':
      return repeat(6, { kind: 'number' });
    case 'emoji-riddles':
      return repeat(8, { kind: 'question', style: 'emoji' });
    case 'party-mix':
      return [
        { kind: 'question', style: 'trivia' },
        { kind: 'question', style: 'truefalse' },
        { kind: 'reaction' },
        { kind: 'question', style: 'emoji' },
        { kind: 'number' },
        { kind: 'pick' },
        { kind: 'mash', theme: 'rocket' },
        { kind: 'question', style: 'trivia' },
        { kind: 'question', style: 'truefalse' },
        { kind: 'reaction' },
        { kind: 'number' },
        { kind: 'mash', theme: 'balloon' },
      ];
  }
}

/**
 * Draws questions without repeats, preferring ones not asked before in this room. Falls back to
 * already-asked questions only when the fresh ones run out.
 */
class Deck<T extends { id: string }> {
  private readonly fresh: T[];
  private readonly stale: T[];
  constructor(items: readonly T[], used: ReadonlySet<string>, random: () => number) {
    this.fresh = shuffle(
      items.filter((i) => !used.has(i.id)),
      random,
    );
    this.stale = shuffle(
      items.filter((i) => used.has(i.id)),
      random,
    );
  }
  draw(accept: (item: T) => boolean = () => true): T | undefined {
    for (const pile of [this.fresh, this.stale]) {
      const index = pile.findIndex(accept);
      if (index >= 0) return pile.splice(index, 1)[0];
    }
    return undefined;
  }
}

/**
 * Turns a game choice into a concrete playlist of rounds, with questions drawn and shuffled.
 * Pure: all randomness comes from `random`.
 */
export function buildRounds(
  gameId: GameId,
  content: GameContent,
  playerIds: string[],
  random: () => number,
  options: BuildOptions = {},
): RoundSpec[] {
  const t = { ...DEFAULT_ROUND_TIMINGS, ...options.timings };
  const used = options.used ?? new Set<string>();
  const decks = {
    trivia: new Deck(content.trivia, used, random),
    truefalse: new Deck(content.trueFalse, used, random),
    emoji: new Deck(content.emoji, used, random),
    numbers: new Deck<NumberQuestion>(content.numbers, used, random),
  };
  const msFor: Record<QuestionStyle, number> = {
    trivia: t.triviaMs,
    truefalse: t.trueFalseMs,
    emoji: t.emojiMs,
  };
  const prepare = (question: Question, style: QuestionStyle) =>
    // True comes before False on every screen, so those are never shuffled.
    style === 'truefalse' ? question : shuffleChoices(question, random);

  const rounds: RoundSpec[] = [];
  let picks = 0;
  for (const step of lineup(gameId, options.triviaCount ?? 10)) {
    switch (step.kind) {
      case 'question': {
        const question = decks[step.style].draw();
        if (question)
          rounds.push({
            kind: 'question',
            style: step.style,
            question: prepare(question, step.style),
            ms: msFor[step.style],
          });
        break;
      }
      case 'pick': {
        const categories = shuffle(
          [...new Set(content.trivia.map((q) => q.category))],
          random,
        ).slice(0, 3);
        const options = categories.flatMap((category) => {
          const question = decks.trivia.draw((q) => q.category === category);
          return question ? [{ category, question: prepare(question, 'trivia') }] : [];
        });
        if (options.length === 0 || playerIds.length === 0) break;
        const chooserId = playerIds[picks % playerIds.length]!;
        picks++;
        rounds.push({
          kind: 'question',
          style: 'trivia',
          question: options[0]!.question,
          ms: t.triviaMs,
          pick: { chooserId, options, ms: t.pickMs },
        });
        break;
      }
      case 'number': {
        const question = decks.numbers.draw();
        if (question) rounds.push({ kind: 'number', question, ms: t.numberMs });
        break;
      }
      case 'reaction': {
        const span = t.goDelayMaxMs - t.goDelayMinMs;
        rounds.push({
          kind: 'reaction',
          goDelayMs: Math.round(t.goDelayMinMs + random() * span),
          windowMs: t.reactionWindowMs,
        });
        break;
      }
      case 'mash':
        rounds.push({ kind: 'mash', theme: step.theme, ms: t.mashMs });
        break;
    }
  }
  return rounds;
}

/** Ids of every question a playlist uses (including Category Clash options not chosen). */
export function questionIds(rounds: RoundSpec[]): string[] {
  return rounds.flatMap((r) => {
    if (r.kind === 'question')
      return r.pick ? r.pick.options.map((o) => o.question.id) : [r.question.id];
    if (r.kind === 'number') return [r.question.id];
    return [];
  });
}
