import { describe, expect, it } from 'vitest';
import { loadGameContent, loadQuestionPack } from './questionPack.js';

describe('content packs', () => {
  const content = loadGameContent();

  it('family-classics has at least 150 questions across 10+ categories', () => {
    const pack = loadQuestionPack();
    expect(pack.id).toBe('family-classics');
    expect(pack.questions.length).toBeGreaterThanOrEqual(150);
    expect(new Set(pack.questions.map((q) => q.category)).size).toBeGreaterThanOrEqual(10);
  });

  it('every pack has enough questions for its games', () => {
    expect(content.trueFalse.length).toBeGreaterThanOrEqual(40);
    expect(content.emoji.length).toBeGreaterThanOrEqual(24);
    expect(content.numbers.length).toBeGreaterThanOrEqual(24);
  });

  it('has no repeated prompts in any pack', () => {
    for (const pack of [content.trivia, content.trueFalse, content.emoji, content.numbers]) {
      const prompts = pack.map((q) => q.prompt.toLowerCase());
      expect(new Set(prompts).size).toBe(prompts.length);
    }
  });

  it('true-or-false questions are exactly True then False, with both answers used', () => {
    for (const q of content.trueFalse) expect(q.choices).toEqual(['True', 'False']);
    const trues = content.trueFalse.filter((q) => q.answer === 0).length;
    expect(trues).toBeGreaterThan(content.trueFalse.length / 4);
    expect(trues).toBeLessThan((content.trueFalse.length * 3) / 4);
  });

  it('spreads correct answers across all four positions in four-choice packs', () => {
    for (const pack of [content.trivia, content.emoji]) {
      const counts = [0, 0, 0, 0];
      for (const q of pack) counts[q.answer]!++;
      for (const count of counts) expect(count).toBeGreaterThan(pack.length / 8);
    }
  });
});
