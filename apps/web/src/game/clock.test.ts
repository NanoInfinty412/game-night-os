import { describe, expect, it } from 'vitest';
import type { RoomSnapshot } from '@gno/shared';
import { toLocalClock } from './clock';

const room: RoomSnapshot = {
  code: 'ABCD',
  phase: 'QUESTION',
  players: [],
  hostConnected: true,
  game: {
    round: 0,
    totalRounds: 10,
    question: { id: 'q', category: 'Animals', prompt: 'Who?', choices: ['a', 'b', 'c', 'd'] },
    questionMs: 20_000,
    deadline: 120_000,
    revealEndsAt: 0,
    serverNow: 100_000,
    answeredIds: [],
    scores: {},
  },
};

describe('toLocalClock', () => {
  it('keeps the time remaining the same on a device whose clock is 5s ahead', () => {
    const local = toLocalClock(room, 105_000);
    expect(local.game!.deadline - 105_000).toBe(20_000);
  });

  it('leaves lobby snapshots alone', () => {
    const lobby = { ...room, phase: 'LOBBY' as const, game: undefined };
    expect(toLocalClock(lobby, 1)).toBe(lobby);
  });
});
