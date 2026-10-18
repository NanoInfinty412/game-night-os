import { describe, expect, it } from 'vitest';
import { GAMES, GAME_IDS, buildRounds, questionIds, roundInfo, type GameId } from './catalog.js';
import type { GameContent, Question } from './content.js';

const question = (id: string, category: string): Question => ({
  id,
  category,
  prompt: `${id} prompt?`,
  choices: ['A', 'B', 'C', 'D'],
  answer: 0,
});

const categories = ['Animals', 'Space', 'Food', 'Music'];
const content: GameContent = {
  trivia: Array.from({ length: 40 }, (_, i) => question(`t${i}`, categories[i % 4]!)),
  trueFalse: Array.from({ length: 20 }, (_, i) => ({
    ...question(`tf${i}`, 'True or False'),
    choices: ['True', 'False'],
    answer: i % 2,
  })),
  emoji: Array.from({ length: 12 }, (_, i) => question(`e${i}`, 'Emoji')),
  numbers: Array.from({ length: 10 }, (_, i) => ({
    id: `n${i}`,
    category: 'Numbers',
    prompt: `Number question ${i}?`,
    answer: i,
    unit: '',
    min: 0,
    max: 100,
  })),
};

let seed = 1;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

describe('game catalog', () => {
  it('lists every game once', () => {
    expect(GAMES.map((g) => g.id)).toEqual([...GAME_IDS]);
  });

  it.each(GAME_IDS.map((id) => [id]))('%s builds a playable playlist', (id: GameId) => {
    const rounds = buildRounds(id, content, ['ada', 'bo'], random);
    expect(rounds.length).toBeGreaterThanOrEqual(3);
    const ids = questionIds(rounds);
    expect(new Set(ids).size).toBe(ids.length); // no repeats within a game
  });

  it('Party Mix plays every kind of round', () => {
    const kinds = new Set(buildRounds('party-mix', content, ['ada'], random).map((r) => r.kind));
    expect(kinds).toEqual(new Set(['question', 'number', 'reaction', 'mash']));
  });

  it('Category Clash offers 3 different categories and takes turns choosing', () => {
    const rounds = buildRounds('category-clash', content, ['ada', 'bo'], random);
    const choosers = rounds.map((r) => (r.kind === 'question' ? r.pick?.chooserId : undefined));
    expect(choosers.slice(0, 4)).toEqual(['ada', 'bo', 'ada', 'bo']);
    for (const r of rounds) {
      if (r.kind !== 'question' || !r.pick) throw new Error('expected a pick round');
      const cats = r.pick.options.map((o) => o.category);
      expect(new Set(cats).size).toBe(3);
      for (const o of r.pick.options) expect(o.question.category).toBe(o.category);
    }
  });

  it('true-or-false choices keep True first', () => {
    for (const r of buildRounds('lightning', content, ['ada'], random)) {
      if (r.kind !== 'question') throw new Error('expected questions');
      expect(r.question.choices).toEqual(['True', 'False']);
    }
  });

  it('prefers questions not asked before and respects the trivia length', () => {
    const first = buildRounds('trivia', content, ['ada'], random, { triviaCount: 5 });
    expect(first).toHaveLength(5);
    const used = new Set(questionIds(first));
    const second = buildRounds('trivia', content, ['ada'], random, { triviaCount: 5, used });
    expect(questionIds(second).some((id) => used.has(id))).toBe(false);
  });

  it('reaction GO lands somewhere in the allowed range', () => {
    for (const r of buildRounds('quick-draw', content, ['ada'], random)) {
      if (r.kind !== 'reaction') throw new Error('expected reaction');
      expect(r.goDelayMs).toBeGreaterThanOrEqual(2_500);
      expect(r.goDelayMs).toBeLessThanOrEqual(6_000);
    }
  });

  it('has a title card for every round kind', () => {
    expect(roundInfo('question', { style: 'truefalse' }).title).toBe('True or False?');
    expect(roundInfo('question', { picking: true }).title).toBe('Category Clash');
    expect(roundInfo('mash', { theme: 'balloon' }).emoji).toBe('🎈');
    expect(roundInfo('reaction').title).toBe('Quick Draw');
  });
});
