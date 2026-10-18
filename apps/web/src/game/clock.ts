import type { RoomSnapshot } from '@gno/shared';

/**
 * Rewrites the game's deadline from the server's clock to this device's clock, using the
 * `serverNow` stamp sent with the snapshot. Phones and TVs often disagree by a few seconds.
 */
export function toLocalClock(room: RoomSnapshot, receivedAt: number): RoomSnapshot {
  if (!room.game) return room;
  const offset = receivedAt - room.game.serverNow;
  const { phaseEndsAt } = room.game;
  return {
    ...room,
    game: {
      ...room.game,
      // 0 means "no deadline" (or a secret one), so it stays 0.
      phaseEndsAt: phaseEndsAt === 0 ? 0 : phaseEndsAt + offset,
      serverNow: receivedAt,
    },
  };
}
