import type { RoomSnapshot } from '@gno/shared';

/**
 * Rewrites the game's deadlines from the server's clock to this device's clock, using the
 * `serverNow` stamp sent with the snapshot. Phones and TVs often disagree by a few seconds.
 */
export function toLocalClock(room: RoomSnapshot, receivedAt: number): RoomSnapshot {
  if (!room.game) return room;
  const offset = receivedAt - room.game.serverNow;
  return {
    ...room,
    game: {
      ...room.game,
      deadline: room.game.deadline + offset,
      revealEndsAt: room.game.revealEndsAt + offset,
      serverNow: receivedAt,
    },
  };
}
