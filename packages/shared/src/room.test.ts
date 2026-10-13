import { describe, expect, it } from 'vitest';
import { joinRequestSchema, nicknameSchema, roomCodeSchema } from './room.js';

describe('roomCodeSchema', () => {
  it('normalises case and whitespace', () => {
    expect(roomCodeSchema.parse(' abcd ')).toBe('ABCD');
  });

  it.each(['ABC', 'ABCDE', 'AB1D', 'ABOD', 'ABID', ''])('rejects %j', (code) => {
    expect(roomCodeSchema.safeParse(code).success).toBe(false);
  });
});

describe('nicknameSchema', () => {
  it('trims and accepts a normal name', () => {
    expect(nicknameSchema.parse('  Ramsey ')).toBe('Ramsey');
  });

  it('rejects blank and overlong names', () => {
    expect(nicknameSchema.safeParse('   ').success).toBe(false);
    expect(nicknameSchema.safeParse('x'.repeat(17)).success).toBe(false);
  });
});

describe('joinRequestSchema', () => {
  it('rejects unknown shapes', () => {
    expect(joinRequestSchema.safeParse({ roomCode: 'ABCD' }).success).toBe(false);
    expect(joinRequestSchema.safeParse('ABCD').success).toBe(false);
  });
});
