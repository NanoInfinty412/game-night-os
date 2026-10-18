import { describe, expect, it } from 'vitest';
import { ordinal } from './answerStyles';

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [22, '22nd'],
  ])('%i is %s', (n, text) => expect(ordinal(n)).toBe(text));
});
