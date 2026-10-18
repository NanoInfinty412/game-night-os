import { describe, expect, it } from 'vitest';
import {
  advance,
  isQuestionOver,
  pointsFor,
  removePlayer,
  revealAnswer,
  shuffleChoices,
  standings,
  startGame,
  submitAnswer,
  type TriviaGame,
  type TriviaSettings,
} from './engine.js';
import { questionSchema, type Question } from './questions.js';

const settings: TriviaSettings = { questionCount: 2, questionMs: 20_000, revealMs: 7_000 };

const q = (id: string, answer = 0): Question => ({
  id,
  category: 'Animals',
  prompt: `Question ${id} prompt?`,
  choices: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
  answer,
});

/** random() === 0.999… keeps Fisher–Yates order, so choices stay put. */
const keepOrder = () => 0.9999;

function answered(result: ReturnType<typeof submitAnswer>): TriviaGame {
  if ('rejected' in result) throw new Error(`rejected: ${result.rejected}`);
  return result.game;
}

function newGame(now = 1_000): TriviaGame {
  return startGame(['ada', 'bo'], [q('one', 1), q('two', 2), q('three')], settings, now, keepOrder);
}

describe('pointsFor', () => {
  it.each([
    [0, 1000],
    [5_000, 875],
    [10_000, 750],
    [19_999, 500],
    [20_000, 500],
    [99_000, 500],
    [-50, 1000],
  ])('%i ms elapsed earns %i points', (elapsed, points) => {
    expect(pointsFor(elapsed, 20_000)).toBe(points);
  });
});

describe('shuffleChoices', () => {
  it('keeps the same correct choice text whatever the order', () => {
    const question = q('x', 2);
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 50; i++) {
      const shuffled = shuffleChoices(question, random);
      expect(shuffled.choices[shuffled.answer]).toBe('Charlie');
      expect([...shuffled.choices].sort()).toEqual([...question.choices].sort());
    }
  });
});

describe('startGame', () => {
  it('opens the first question with an absolute deadline and zero scores', () => {
    const game = newGame(1_000);
    expect(game.phase).toBe('QUESTION');
    expect(game.round).toBe(0);
    expect(game.questions.map((x) => x.id)).toEqual(['one', 'two']);
    expect(game.settings.questionCount).toBe(2);
    expect(game.deadline).toBe(21_000);
    expect(game.scores).toEqual({ ada: 0, bo: 0 });
  });

  it('plays fewer rounds when the pack is short', () => {
    const game = startGame(['ada'], [q('one')], { ...settings, questionCount: 10 }, 0, keepOrder);
    expect(game.settings.questionCount).toBe(1);
  });

  it('refuses an empty question list', () => {
    expect(() => startGame(['ada'], [], settings, 0, keepOrder)).toThrow();
  });
});

describe('submitAnswer', () => {
  it('records the first answer only', () => {
    const game = answered(submitAnswer(newGame(), 'ada', 0, 1, 2_000));
    expect(game.answers.ada).toEqual({ choice: 1, at: 2_000 });
    expect(submitAnswer(game, 'ada', 0, 2, 2_500)).toEqual({ rejected: 'ALREADY_ANSWERED' });
  });

  it.each([
    ['NOT_A_PLAYER', 'zed', 0, 1, 2_000],
    ['WRONG_ROUND', 'ada', 1, 1, 2_000],
    ['INVALID_CHOICE', 'ada', 0, 4, 2_000],
    ['INVALID_CHOICE', 'ada', 0, -1, 2_000],
    ['INVALID_CHOICE', 'ada', 0, 1.5, 2_000],
    ['TOO_LATE', 'ada', 0, 1, 21_001],
  ] as const)('rejects %s', (reason, player, round, choice, now) => {
    expect(submitAnswer(newGame(), player, round, choice, now)).toEqual({ rejected: reason });
  });

  it('accepts an answer exactly at the deadline', () => {
    expect('game' in submitAnswer(newGame(), 'ada', 0, 1, 21_000)).toBe(true);
  });

  it('rejects answers during the reveal', () => {
    const revealed = revealAnswer(newGame(), 5_000);
    expect(submitAnswer(revealed, 'ada', 0, 1, 5_001)).toEqual({ rejected: 'WRONG_PHASE' });
  });
});

describe('isQuestionOver', () => {
  it('closes early once every connected player has answered', () => {
    let game = newGame();
    expect(isQuestionOver(game, ['ada', 'bo'], 2_000)).toBe(false);
    game = answered(submitAnswer(game, 'ada', 0, 1, 2_000));
    expect(isQuestionOver(game, ['ada', 'bo'], 2_000)).toBe(false);
    // Bo dropped off: nobody left to wait for.
    expect(isQuestionOver(game, ['ada'], 2_000)).toBe(true);
    game = answered(submitAnswer(game, 'bo', 0, 0, 3_000));
    expect(isQuestionOver(game, ['ada', 'bo'], 3_000)).toBe(true);
  });

  it('closes at the deadline even if nobody answered', () => {
    expect(isQuestionOver(newGame(), ['ada', 'bo'], 21_000)).toBe(true);
  });

  it('waits for the deadline when nobody is connected', () => {
    expect(isQuestionOver(newGame(), [], 2_000)).toBe(false);
  });
});

describe('a full game', () => {
  it('scores by speed, reveals, advances and finishes', () => {
    let game = newGame(0);
    // Round 1: answer is index 1. Ada right after 5s, Bo wrong.
    game = answered(submitAnswer(game, 'ada', 0, 1, 5_000));
    game = answered(submitAnswer(game, 'bo', 0, 3, 6_000));
    game = revealAnswer(game, 6_000);
    expect(game.phase).toBe('REVEAL');
    expect(game.revealEndsAt).toBe(13_000);
    expect(game.results).toEqual({ ada: { choice: 1, points: 875 }, bo: { choice: 3, points: 0 } });

    // Round 2: answer is index 2. Bo right after 10s, Ada never answers.
    game = advance(game, 13_000);
    expect(game.phase).toBe('QUESTION');
    expect(game.round).toBe(1);
    expect(game.deadline).toBe(33_000);
    expect(game.answers).toEqual({});
    game = answered(submitAnswer(game, 'bo', 1, 2, 23_000));
    game = revealAnswer(game, 33_000);
    expect(game.results).toEqual({
      ada: { choice: null, points: 0 },
      bo: { choice: 2, points: 750 },
    });
    expect(game.scores).toEqual({ ada: 875, bo: 750 });

    game = advance(game, 40_000);
    expect(game.phase).toBe('FINAL');
    expect(standings(game)).toEqual([
      { playerId: 'ada', score: 875, place: 1 },
      { playerId: 'bo', score: 750, place: 2 },
    ]);
  });

  it('ignores reveal and advance in the wrong phase', () => {
    const game = newGame();
    expect(advance(game, 2_000)).toBe(game);
    const revealed = revealAnswer(game, 2_000);
    expect(revealAnswer(revealed, 3_000)).toBe(revealed);
  });
});

describe('standings', () => {
  it('shares places on a tie', () => {
    const game: TriviaGame = {
      ...newGame(),
      playerIds: ['a', 'b', 'c'],
      scores: { a: 500, b: 900, c: 500 },
    };
    expect(standings(game).map((s) => [s.playerId, s.place])).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 2],
    ]);
  });
});

describe('removePlayer', () => {
  it('drops the player from every part of the game', () => {
    let game = answered(submitAnswer(newGame(), 'bo', 0, 1, 2_000));
    game = removePlayer(game, 'bo');
    expect(game.playerIds).toEqual(['ada']);
    expect(game.answers).toEqual({});
    expect(game.scores).toEqual({ ada: 0 });
  });
});

describe('questionSchema', () => {
  it('rejects duplicate choices and out-of-range answers', () => {
    expect(questionSchema.safeParse(q('ok')).success).toBe(true);
    expect(questionSchema.safeParse({ ...q('dup'), choices: ['A', 'a', 'B', 'C'] }).success).toBe(
      false,
    );
    expect(questionSchema.safeParse({ ...q('far'), answer: 4 }).success).toBe(false);
    expect(questionSchema.safeParse({ ...q('few'), choices: ['A', 'B', 'C'] }).success).toBe(false);
  });
});
