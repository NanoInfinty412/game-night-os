import { describe, expect, it } from 'vitest';
import { roomCodeSchema } from '@gno/shared';
import { generateRoomCode, isBlockedCode } from './roomCode.js';

/** Deterministic pseudo-random sequence (mulberry32). */
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('generateRoomCode', () => {
  it('produces valid codes', () => {
    const random = seeded(1);
    for (let i = 0; i < 1000; i++) {
      expect(roomCodeSchema.safeParse(generateRoomCode(() => false, random)).success).toBe(true);
    }
  });

  it('never returns a code that is already in use (10,000 rooms)', () => {
    const taken = new Set<string>();
    const random = seeded(42);
    for (let i = 0; i < 10_000; i++) {
      const code = generateRoomCode((c) => taken.has(c), random);
      expect(taken.has(code)).toBe(false);
      taken.add(code);
    }
    expect(taken.size).toBe(10_000);
  });

  it('skips blocked words', () => {
    // First draw spells BUTT (all indexes into the alphabet), the next spells GAME.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const letters = [...'BUTT', ...'GAME'].map(
      (l) => (alphabet.indexOf(l) + 0.5) / alphabet.length,
    );
    let i = 0;
    expect(isBlockedCode('BUTT')).toBe(true);
    expect(
      generateRoomCode(
        () => false,
        () => letters[i++]!,
      ),
    ).toBe('GAME');
  });

  it('retries when the first code is taken', () => {
    const codes = ['AAAA', 'BBBB'];
    let call = 0;
    const random = () => {
      const code = codes[Math.floor(call / 4)]!;
      call++;
      return ('ABCDEFGHJKLMNPQRSTUVWXYZ'.indexOf(code[0]!) + 0.5) / 24;
    };
    expect(generateRoomCode((c) => c === 'AAAA', random)).toBe('BBBB');
  });
});
