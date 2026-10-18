import {
  doneIds,
  standings,
  type PartyGame,
  type RoundResult,
  type StandingEntry,
} from './engine.js';
import type { MashTheme, QuestionStyle, RoundKind } from './engine.js';

/** A question as screens see it: never includes the answer. */
export interface PublicQuestion {
  id: string;
  category: string;
  prompt: string;
  choices: string[];
}

export interface PublicNumberQuestion {
  id: string;
  category: string;
  prompt: string;
  unit: string;
  min: number;
  max: number;
}

/**
 * What screens may know about the current round. Secrets (the answer, when the reaction "GO"
 * happens) only appear once they are no longer secret.
 */
export type RoundView =
  | {
      kind: 'question';
      style: QuestionStyle;
      /** Category Clash: someone is choosing the category. */
      picking?: { chooserId: string; categories: string[] };
      /** Present once answering is open (PLAY) and in REVEAL. */
      question?: PublicQuestion;
      answerMs: number;
      /** REVEAL only. */
      answer?: number;
    }
  | {
      kind: 'number';
      /** Present from PLAY on. */
      question?: PublicNumberQuestion;
      answer?: number;
      fact?: string;
    }
  | { kind: 'reaction'; status: 'wait' | 'go' }
  | { kind: 'mash'; theme: MashTheme; taps: Record<string, number> };

export interface GameView {
  gameId: string;
  phase: PartyGame['phase'];
  /** 0-based index of the current round. */
  round: number;
  totalRounds: number;
  /** Kinds of every round, so screens can show what's coming. */
  lineup: RoundKind[];
  current: RoundView;
  /** Absolute server time (ms) when the current phase ends; 0 when it doesn't. */
  phaseEndsAt: number;
  /** Length of the current phase, for countdown rings. */
  phaseMs: number;
  /** Server clock when this snapshot was sent, so clients can correct for clock drift. */
  serverNow: number;
  /** Who has done their part this round (not what they chose). */
  doneIds: string[];
  scores: Record<string, number>;
  /** REVEAL only. */
  results?: Record<string, RoundResult>;
  /** FINAL only. */
  standings?: StandingEntry[];
}

function roundView(game: PartyGame): RoundView {
  const round = game.round;
  const showContent = game.phase === 'PLAY' || game.phase === 'REVEAL';
  const revealed = game.phase === 'REVEAL' || game.phase === 'FINAL';
  switch (round.kind) {
    case 'question': {
      const view: RoundView = {
        kind: 'question',
        style: round.spec.style,
        answerMs: round.spec.ms,
      };
      if (game.phase === 'PLAY' && round.status === 'picking' && round.spec.pick) {
        view.picking = {
          chooserId: round.spec.pick.chooserId,
          categories: round.spec.pick.options.map((o) => o.category),
        };
      } else if (showContent || revealed) {
        const { answer, ...question } = round.question;
        view.question = question;
        if (revealed) view.answer = answer;
      }
      return view;
    }
    case 'number': {
      const { answer, fact, ...question } = round.spec.question;
      if (!showContent && !revealed) return { kind: 'number' };
      return {
        kind: 'number',
        question,
        ...(revealed && { answer, ...(fact !== undefined && { fact }) }),
      };
    }
    case 'reaction':
      return { kind: 'reaction', status: game.phase === 'PLAY' ? round.status : 'wait' };
    case 'mash':
      return { kind: 'mash', theme: round.spec.theme, taps: { ...round.taps } };
  }
}

function phaseMs(game: PartyGame): number {
  const round = game.round;
  switch (game.phase) {
    case 'INTRO':
      return game.timing.introMs;
    case 'REVEAL':
      return game.timing.revealMs;
    case 'FINAL':
      return 0;
    case 'PLAY':
      switch (round.kind) {
        case 'question':
          return round.status === 'picking' && round.spec.pick ? round.spec.pick.ms : round.spec.ms;
        case 'number':
        case 'mash':
          return round.spec.ms;
        case 'reaction':
          return round.spec.goDelayMs + round.spec.windowMs;
      }
  }
}

export function gameView(game: PartyGame, now: number): GameView {
  // The reaction round's end would give away when "GO" comes, so it stays hidden until then.
  const hideClock =
    game.phase === 'PLAY' && game.round.kind === 'reaction' && game.round.status === 'wait';
  return {
    gameId: game.gameId,
    phase: game.phase,
    round: game.index,
    totalRounds: game.rounds.length,
    lineup: game.rounds.map((r) => r.kind),
    current: roundView(game),
    phaseEndsAt: hideClock ? 0 : game.phaseEndsAt,
    phaseMs: hideClock ? 0 : phaseMs(game),
    serverNow: now,
    doneIds: doneIds(game),
    scores: { ...game.scores },
    ...(game.phase === 'REVEAL' && { results: { ...game.results } }),
    ...(game.phase === 'FINAL' && { standings: standings(game) }),
  };
}
