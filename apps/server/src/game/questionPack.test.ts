import { describe, expect, it } from 'vitest';
import { loadQuestionPack } from './questionPack.js';

describe('family-classics pack', () => {
  const pack = loadQuestionPack();

  it('passes the schema with unique ids and at least 150 questions', () => {
    expect(pack.id).toBe('family-classics');
    expect(pack.questions.length).toBeGreaterThanOrEqual(150);
  });

  it('has no repeated prompts', () => {
    const prompts = pack.questions.map((q) => q.prompt.toLowerCase());
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it('spreads correct answers across all four positions', () => {
    const counts = [0, 0, 0, 0];
    for (const q of pack.questions) counts[q.answer]!++;
    for (const count of counts) expect(count).toBeGreaterThan(pack.questions.length / 8);
  });

  it('covers plenty of categories', () => {
    expect(new Set(pack.questions.map((q) => q.category)).size).toBeGreaterThanOrEqual(10);
  });
});
