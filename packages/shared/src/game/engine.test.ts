import { describe, expect, it } from 'vitest';
import type { NumberQuestion, Question } from './content.js';
import { questionSchema } from './content.js';
import {
  act,
  doneIds,
  nextDeadline,
  pointsFor,
  rankPoints,
  removePlayer,
  shuffleChoices,
  skip,
  standings,
  startGame,
  tick,
  type PartyGame,
  type PlayerAction,
  type RoundSpec,
} from './engine.js';
import { gameView } from './view.js';

const timing = { introMs: 1_000, revealMs: 2_000 };

const q = (id: string, answer = 0, category = 'Animals'): Question => ({
  id,
  category,
  prompt: `Question ${id} prompt?`,
  choices: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
  answer,
});

const numberQ: NumberQuestion = {
  id: 'legs',
  category: 'Animals',
  prompt: 'How many legs does a spider have?',
  answer: 8,
  unit: 'legs',
  min: 0,
  max: 100,
};

const triviaRound = (question = q('one', 1)): RoundSpec => ({
  kind: 'question',
  style: 'trivia',
  question,
  ms: 20_000,
});

function ok(result: ReturnType<typeof act>): PartyGame {
  if ('rejected' in result) throw new Error(`rejected: ${result.rejected}`);
  return result.game;
}

/** Starts a game at t=0 and skips its first intro, so PLAY opens at t=1000. */
function playing(rounds: RoundSpec[], players = ['ada', 'bo']): PartyGame {
  const game = tick(startGame('test', players, rounds, timing, 0), players, 1_000);
  expect(game.phase).toBe('PLAY');
  return game;
}

const answer = (round: number, choice: number): PlayerAction => ({ type: 'answer', round, choice });

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

describe('rankPoints', () => {
  it('ranks low values first, shares points on ties and skips players who did not play', () => {
    expect(rankPoints({ a: 3, b: 1, c: 3, d: null, e: 9 }, 'low')).toEqual({
      b: 1000,
      a: 800,
      c: 800,
      e: 500,
      d: 0,
    });
  });

  it('ranks high values first', () => {
    expect(rankPoints({ a: 40, b: 55 }, 'high')).toEqual({ b: 1000, a: 800 });
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

describe('phases', () => {
  it('goes INTRO → PLAY → REVEAL → next INTRO → … → FINAL on the clock', () => {
    let game = startGame('test', ['ada'], [triviaRound(), triviaRound(q('two'))], timing, 0);
    expect(game).toMatchObject({ phase: 'INTRO', index: 0, phaseEndsAt: 1_000 });
    expect(nextDeadline(game)).toBe(1_000);
    expect(tick(game, ['ada'], 999)).toBe(game);
    game = tick(game, ['ada'], 1_000);
    expect(game).toMatchObject({ phase: 'PLAY', phaseEndsAt: 21_000 });
    game = tick(game, ['ada'], 21_000);
    expect(game).toMatchObject({ phase: 'REVEAL', phaseEndsAt: 23_000 });
    game = tick(game, ['ada'], 23_000);
    expect(game).toMatchObject({ phase: 'INTRO', index: 1 });
    game = tick(game, ['ada'], 24_000);
    game = tick(game, ['ada'], 44_000);
    game = tick(game, ['ada'], 46_000);
    expect(game.phase).toBe('FINAL');
    expect(nextDeadline(game)).toBeUndefined();
  });

  it('a late tick still gives players the full answer window', () => {
    const game = startGame('test', ['ada'], [triviaRound(), triviaRound(q('two'))], timing, 0);
    expect(tick(game, ['ada'], 5_000)).toMatchObject({ phase: 'PLAY', phaseEndsAt: 25_000 });
  });

  it('skip ends an intro or a reveal early, but never a question', () => {
    let game = startGame('test', ['ada'], [triviaRound()], timing, 0);
    game = skip(game, 100);
    expect(game).toMatchObject({ phase: 'PLAY', phaseEndsAt: 20_100 });
    expect(skip(game, 200)).toBe(game);
    game = tick(game, ['ada'], 20_100);
    expect(skip(game, 20_200).phase).toBe('FINAL');
  });

  it('refuses an empty playlist', () => {
    expect(() => startGame('test', ['ada'], [], timing, 0)).toThrow();
  });
});

describe('question rounds', () => {
  it('scores by speed, records the first answer only and closes once everyone answered', () => {
    let game = playing([triviaRound()]);
    game = ok(act(game, 'ada', answer(0, 1), 6_000)); // 5s in: 875 points
    expect(act(game, 'ada', answer(0, 2), 6_100)).toEqual({ rejected: 'ALREADY_ANSWERED' });
    expect(tick(game, ['ada', 'bo'], 6_000).phase).toBe('PLAY');
    // Bo dropped off: nobody left to wait for.
    expect(tick(game, ['ada'], 6_000).phase).toBe('REVEAL');
    game = ok(act(game, 'bo', answer(0, 3), 7_000));
    game = tick(game, ['ada', 'bo'], 7_000);
    expect(game.phase).toBe('REVEAL');
    expect(game.results).toEqual({ ada: { value: 1, points: 875 }, bo: { value: 3, points: 0 } });
    expect(game.scores).toEqual({ ada: 875, bo: 0 });
  });

  it.each([
    ['NOT_A_PLAYER', 'zed', answer(0, 1), 2_000],
    ['WRONG_ROUND', 'ada', answer(1, 1), 2_000],
    ['INVALID_ACTION', 'ada', answer(0, 4), 2_000],
    ['INVALID_ACTION', 'ada', answer(0, -1), 2_000],
    ['INVALID_ACTION', 'ada', answer(0, 1.5), 2_000],
    ['TOO_LATE', 'ada', answer(0, 1), 21_001],
    ['WRONG_PHASE', 'ada', { type: 'guess', round: 0, value: 3 }, 2_000],
  ] as const)('rejects %s', (reason, player, action, now) => {
    expect(act(playing([triviaRound()]), player, action, now)).toEqual({ rejected: reason });
  });

  it('rejects answers outside PLAY', () => {
    const intro = startGame('test', ['ada'], [triviaRound()], timing, 0);
    expect(act(intro, 'ada', answer(0, 1), 10)).toEqual({ rejected: 'WRONG_PHASE' });
  });

  it('supports true-or-false questions with two choices', () => {
    const tf: Question = {
      id: 'tf',
      category: 'True or False',
      prompt: 'The Sun is a star.',
      choices: ['True', 'False'],
      answer: 0,
    };
    let game = playing([{ kind: 'question', style: 'truefalse', question: tf, ms: 8_000 }]);
    expect(act(game, 'ada', answer(0, 2), 1_500)).toEqual({ rejected: 'INVALID_ACTION' });
    game = ok(act(game, 'ada', answer(0, 0), 1_000));
    game = ok(act(game, 'bo', answer(0, 1), 1_000));
    game = tick(game, ['ada', 'bo'], 1_000);
    expect(game.results.ada?.points).toBe(1000);
    expect(game.results.bo?.points).toBe(0);
  });

  it('never shows the answer before the reveal', () => {
    let game = startGame('test', ['ada', 'bo'], [triviaRound()], timing, 0);
    expect(gameView(game, 0).current).toEqual({
      kind: 'question',
      style: 'trivia',
      pickRound: false,
      answerMs: 20_000,
    });
    game = tick(game, ['ada', 'bo'], 1_000);
    const view = gameView(game, 1_000);
    expect(JSON.stringify(view)).not.toContain('"answer"');
    expect(view.current).toMatchObject({ question: { prompt: 'Question one prompt?' } });
    game = tick(game, [], 21_000);
    expect(gameView(game, 21_000).current).toMatchObject({ answer: 1 });
  });
});

describe('category clash', () => {
  const pickRound: RoundSpec = {
    kind: 'question',
    style: 'trivia',
    question: q('space', 0, 'Space'),
    ms: 20_000,
    pick: {
      chooserId: 'bo',
      ms: 10_000,
      options: [
        { category: 'Space', question: q('space', 0, 'Space') },
        { category: 'Food', question: q('food', 2, 'Food') },
      ],
    },
  };

  it('only the chooser picks; the picked question opens with a fresh timer', () => {
    let game = playing([pickRound]);
    expect(gameView(game, 1_000).current).toMatchObject({
      picking: { chooserId: 'bo', categories: ['Space', 'Food'] },
    });
    expect(gameView(game, 1_000).current).not.toHaveProperty('question');
    expect(act(game, 'ada', answer(0, 0), 1_500)).toEqual({ rejected: 'WRONG_PHASE' });
    expect(act(game, 'ada', { type: 'pick', round: 0, option: 1 }, 1_500)).toEqual({
      rejected: 'NOT_YOUR_PICK',
    });
    expect(act(game, 'bo', { type: 'pick', round: 0, option: 5 }, 1_500)).toEqual({
      rejected: 'INVALID_ACTION',
    });
    game = ok(act(game, 'bo', { type: 'pick', round: 0, option: 1 }, 2_000));
    expect(game.phaseEndsAt).toBe(22_000);
    expect(gameView(game, 2_000).current).toMatchObject({ question: { id: 'food' } });
    game = ok(act(game, 'ada', answer(0, 2), 2_000));
    game = ok(act(game, 'bo', answer(0, 0), 2_000));
    game = tick(game, ['ada', 'bo'], 2_000);
    expect(game.results).toEqual({ ada: { value: 2, points: 1000 }, bo: { value: 0, points: 0 } });
  });

  it('picks the first category when time runs out or the chooser is away', () => {
    const timedOut = tick(playing([pickRound]), ['ada', 'bo'], 11_000);
    expect(gameView(timedOut, 11_000).current).toMatchObject({ question: { id: 'space' } });
    const away = tick(playing([pickRound]), ['ada'], 1_500);
    expect(gameView(away, 1_500).current).toMatchObject({ question: { id: 'space' } });
  });
});

describe('number rounds', () => {
  const round: RoundSpec = { kind: 'number', question: numberQ, ms: 25_000 };

  it('closest guess wins, exact guesses get a bonus, out-of-range guesses are refused', () => {
    let game = playing([round], ['ada', 'bo', 'cy']);
    expect(act(game, 'ada', { type: 'guess', round: 0, value: 101 }, 2_000)).toEqual({
      rejected: 'INVALID_ACTION',
    });
    game = ok(act(game, 'ada', { type: 'guess', round: 0, value: 8 }, 2_000));
    game = ok(act(game, 'bo', { type: 'guess', round: 0, value: 10 }, 2_000));
    expect(act(game, 'bo', { type: 'guess', round: 0, value: 8 }, 2_100)).toEqual({
      rejected: 'ALREADY_ANSWERED',
    });
    game = tick(game, ['ada', 'bo', 'cy'], 26_000);
    expect(game.results).toEqual({
      ada: { value: 8, points: 1250 },
      bo: { value: 10, points: 800 },
      cy: { value: null, points: 0 },
    });
    expect(gameView(game, 26_000).current).toMatchObject({ answer: 8 });
  });

  it('hides the answer while guessing', () => {
    const game = playing([round]);
    expect(JSON.stringify(gameView(game, 1_000))).not.toContain('"answer"');
  });
});

describe('reaction rounds', () => {
  const round: RoundSpec = { kind: 'reaction', goDelayMs: 3_000, windowMs: 3_000 };

  it('flips to GO at the secret moment and ranks the fastest taps; early taps are false starts', () => {
    let game = playing([round], ['ada', 'bo', 'cy']); // GO at 4000
    expect(nextDeadline(game)).toBe(4_000);
    const waiting = gameView(game, 1_500);
    expect(waiting.current).toEqual({ kind: 'reaction', status: 'wait' });
    expect(waiting.phaseEndsAt).toBe(0); // would give away when GO comes
    game = ok(act(game, 'cy', { type: 'tap', round: 0 }, 3_000)); // too early
    expect(act(game, 'cy', { type: 'tap', round: 0 }, 4_100)).toEqual({
      rejected: 'ALREADY_ANSWERED',
    });
    game = tick(game, ['ada', 'bo', 'cy'], 4_000);
    expect(game.round).toMatchObject({ status: 'go' });
    expect(gameView(game, 4_000).current).toEqual({ kind: 'reaction', status: 'go' });
    expect(nextDeadline(game)).toBe(7_000);
    game = ok(act(game, 'bo', { type: 'tap', round: 0 }, 4_250));
    game = ok(act(game, 'ada', { type: 'tap', round: 0 }, 4_400));
    game = tick(game, ['ada', 'bo', 'cy'], 4_400); // everyone has tapped
    expect(game.phase).toBe('REVEAL');
    expect(game.results).toEqual({
      bo: { value: 250, points: 1000 },
      ada: { value: 400, points: 800 },
      cy: { value: null, points: 0, falseStart: true },
    });
  });

  it('ends at the window even if someone never taps', () => {
    const game = tick(playing([round]), ['ada', 'bo'], 7_000);
    expect(game.phase).toBe('REVEAL');
  });
});

describe('mash rounds', () => {
  const round: RoundSpec = { kind: 'mash', theme: 'rocket', ms: 8_000 };

  it('counts taps, ignores impossibly fast ones and runs to the buzzer', () => {
    let game = playing([round]);
    game = ok(act(game, 'ada', { type: 'tap', round: 0 }, 1_000));
    expect(act(game, 'ada', { type: 'tap', round: 0 }, 1_030)).toEqual({ rejected: 'TOO_FAST' });
    game = ok(act(game, 'ada', { type: 'tap', round: 0 }, 1_060));
    game = ok(act(game, 'bo', { type: 'tap', round: 0 }, 1_060));
    expect(gameView(game, 1_100).current).toEqual({
      kind: 'mash',
      theme: 'rocket',
      taps: { ada: 2, bo: 1 },
    });
    expect(tick(game, ['ada', 'bo'], 8_999).phase).toBe('PLAY');
    expect(act(game, 'bo', { type: 'tap', round: 0 }, 9_001)).toEqual({ rejected: 'TOO_LATE' });
    game = tick(game, ['ada', 'bo'], 9_000);
    expect(game.results).toEqual({
      ada: { value: 2, points: 1000 },
      bo: { value: 1, points: 800 },
    });
  });
});

describe('players coming and going', () => {
  it('removePlayer drops the player from every part of the game', () => {
    let game = ok(act(playing([triviaRound()]), 'bo', answer(0, 1), 2_000));
    game = removePlayer(game, 'bo');
    expect(game.playerIds).toEqual(['ada']);
    expect(doneIds(game)).toEqual([]);
    expect(game.scores).toEqual({ ada: 0 });
  });

  it('standings share places on a tie', () => {
    const game: PartyGame = {
      ...playing([triviaRound()]),
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

describe('questionSchema', () => {
  it('accepts 2 to 4 distinct choices with the answer among them', () => {
    expect(questionSchema.safeParse(q('ok')).success).toBe(true);
    expect(questionSchema.safeParse({ ...q('tf'), choices: ['True', 'False'] }).success).toBe(true);
    expect(questionSchema.safeParse({ ...q('dup'), choices: ['A', 'a', 'B', 'C'] }).success).toBe(
      false,
    );
    expect(questionSchema.safeParse({ ...q('far'), answer: 4 }).success).toBe(false);
    expect(questionSchema.safeParse({ ...q('one'), choices: ['A'] }).success).toBe(false);
    expect(
      questionSchema.safeParse({ ...q('five'), choices: ['A', 'B', 'C', 'D', 'E'] }).success,
    ).toBe(false);
  });
});
