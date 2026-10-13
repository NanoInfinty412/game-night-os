import type { PublicPlayer } from '@gno/shared';

// Milestone 1 only: replaced by live room state in milestone 2.
export const SAMPLE_ROOM_CODE = 'PLAY';

export const SAMPLE_PLAYERS: PublicPlayer[] = [
  { id: 'p1', nickname: 'Ramsey', isVip: true, connected: true },
  { id: 'p2', nickname: 'Ada', isVip: false, connected: true },
  { id: 'p3', nickname: 'Big Mike', isVip: false, connected: true },
];
