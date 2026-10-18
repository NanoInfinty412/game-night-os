import { describe, expect, it } from 'vitest';
import type { RoomSnapshot } from '@gno/shared';
import { toLocalClock } from './clock';

const room: RoomSnapshot = {
  code: 'ABCD',
  phase: 'PLAY',
  players: [],
  hostConnected: true,
  selectedGame: 'trivia',
  game: {
    gameId: 'trivia',
    phase: 'PLAY',
    round: 0,
    totalRounds: 10,
    lineup: ['question'],
    current: { kind: 'question', style: 'trivia', pickRound: false, answerMs: 20_000 },
    phaseEndsAt: 120_000,
    phaseMs: 20_000,
    serverNow: 100_000,
    doneIds: [],
    scores: {},
  },
};

describe('toLocalClock', () => {
  it('keeps the time remaining the same on a device whose clock is 5s ahead', () => {
    const local = toLocalClock(room, 105_000);
    expect(local.game!.phaseEndsAt - 105_000).toBe(20_000);
  });

  it('keeps a hidden deadline hidden', () => {
    const hidden = { ...room, game: { ...room.game!, phaseEndsAt: 0 } };
    expect(toLocalClock(hidden, 105_000).game!.phaseEndsAt).toBe(0);
  });

  it('leaves lobby snapshots alone', () => {
    const lobby = { ...room, phase: 'LOBBY' as const, game: undefined };
    expect(toLocalClock(lobby, 1)).toBe(lobby);
  });
});
