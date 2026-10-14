import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS } from '@gno/shared';
import { GameError } from './errors.js';
import { RoomManager } from './roomManager.js';

function setup() {
  let n = 0;
  const rooms = new RoomManager({ newToken: () => `token-${String(++n).padStart(12, '0')}` });
  const room = rooms.createRoom(0);
  return { rooms, room };
}

function expectGameError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(GameError);
    expect((error as GameError).code).toBe(code);
    return;
  }
  throw new Error(`Expected GameError ${code}`);
}

describe('RoomManager', () => {
  it('creates an empty lobby with a host token', () => {
    const { rooms, room } = setup();
    expect(rooms.snapshot(room)).toEqual({
      code: room.code,
      phase: 'LOBBY',
      hostConnected: true,
      players: [],
    });
    expect(room.hostToken).toMatch(/^token-/);
  });

  it('seats players in order, makes the first one VIP and trims names', () => {
    const { rooms, room } = setup();
    rooms.joinRoom(room.code, '  Ada ', 1);
    rooms.joinRoom(room.code, 'Ramsey', 2);
    const players = rooms.snapshot(room).players;
    expect(players.map((p) => [p.nickname, p.seat, p.isVip])).toEqual([
      ['Ada', 0, true],
      ['Ramsey', 1, false],
    ]);
  });

  it('reports an unknown room code', () => {
    const { rooms } = setup();
    expectGameError(() => rooms.joinRoom('ZZZZ', 'Ada', 1), 'ROOM_NOT_FOUND');
  });

  it('rejects duplicate nicknames regardless of case', () => {
    const { rooms, room } = setup();
    rooms.joinRoom(room.code, 'Ada', 1);
    expectGameError(() => rooms.joinRoom(room.code, 'aDA', 2), 'NICKNAME_TAKEN');
    expect(room.players).toHaveLength(1);
  });

  it(`rejects player ${MAX_PLAYERS + 1}`, () => {
    const { rooms, room } = setup();
    for (let i = 0; i < MAX_PLAYERS; i++) rooms.joinRoom(room.code, `P${i}`, i);
    expectGameError(() => rooms.joinRoom(room.code, 'Late', 99), 'ROOM_FULL');
    expect(room.players).toHaveLength(MAX_PLAYERS);
  });

  it('reuses the lowest free seat and hands VIP to the earliest remaining joiner', () => {
    const { rooms, room } = setup();
    const a = rooms.joinRoom(room.code, 'A', 1).player;
    rooms.joinRoom(room.code, 'B', 2);
    rooms.joinRoom(room.code, 'C', 3);
    rooms.removePlayer(room.code, a.id, 4);
    const d = rooms.joinRoom(room.code, 'D', 5).player;
    expect(d.seat).toBe(0);
    const snapshot = rooms.snapshot(room);
    expect(snapshot.players.find((p) => p.isVip)?.nickname).toBe('B');
    expect(snapshot.players.map((p) => p.nickname)).toEqual(['D', 'B', 'C']);
  });

  it('resumes a player only with their own token', () => {
    const { rooms, room } = setup();
    const { player } = rooms.joinRoom(room.code, 'Ada', 1);
    rooms.setPlayerConnected(room.code, player.id, false, 2);
    expect(rooms.snapshot(room).players[0]?.connected).toBe(false);
    expect(rooms.resumePlayer(room.code, player.token, 3).player.id).toBe(player.id);
    expect(rooms.snapshot(room).players[0]?.connected).toBe(true);
    expectGameError(
      () => rooms.resumePlayer(room.code, 'token-not-a-real-one', 4),
      'SESSION_NOT_FOUND',
    );
  });

  it('resumes the host only with the host token', () => {
    const { rooms, room } = setup();
    rooms.setHostConnected(room.code, false, 1);
    expectGameError(() => rooms.resumeHost(room.code, 'token-wrong-wrong', 2), 'SESSION_NOT_FOUND');
    expect(rooms.resumeHost(room.code, room.hostToken, 3).hostConnected).toBe(true);
  });

  it('sweeps only rooms that are empty of connections and idle long enough', () => {
    const { rooms, room } = setup();
    const other = rooms.createRoom(0);
    rooms.setHostConnected(room.code, false, 10);
    expect(rooms.sweepAbandoned(100, 1000)).toEqual([]);
    expect(rooms.sweepAbandoned(1010, 1000)).toEqual([room.code]);
    // `other` still has its TV connected, so it stays however long it is idle.
    expect(rooms.sweepAbandoned(1_000_000, 1000)).toEqual([]);
    expect(rooms.getRoom(other.code).code).toBe(other.code);
  });
});
