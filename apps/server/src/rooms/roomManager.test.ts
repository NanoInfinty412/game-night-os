import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, type Question } from '@gno/shared';
import { GameError } from './errors.js';
import { RoomManager } from './roomManager.js';

function setup() {
  let n = 0;
  const rooms = new RoomManager({ newToken: () => `token-${String(++n).padStart(12, '0')}` });
  const room = rooms.createRoom(0);
  return { rooms, room };
}

const questions: Question[] = ['one', 'two', 'three', 'four'].map((id) => ({
  id,
  category: 'Test',
  prompt: `Question ${id}?`,
  choices: ['A', 'B', 'C', 'D'],
  answer: 0,
}));

/** A room with Ada (VIP) and Bo, playing 2 questions of 10s with a 5s reveal. */
function gameSetup() {
  const rooms = new RoomManager({
    questions,
    trivia: { questionCount: 2, questionMs: 10_000, revealMs: 5_000 },
    random: () => 0.9999, // keeps question and choice order
  });
  const room = rooms.createRoom(0);
  const ada = rooms.joinRoom(room.code, 'Ada', 0).player;
  const bo = rooms.joinRoom(room.code, 'Bo', 0).player;
  return { rooms, room, ada, bo };
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
    expect(rooms.snapshot(room, 0)).toEqual({
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
    const players = rooms.snapshot(room, 0).players;
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
    const snapshot = rooms.snapshot(room, 0);
    expect(snapshot.players.find((p) => p.isVip)?.nickname).toBe('B');
    expect(snapshot.players.map((p) => p.nickname)).toEqual(['D', 'B', 'C']);
  });

  it('resumes a player only with their own token', () => {
    const { rooms, room } = setup();
    const { player } = rooms.joinRoom(room.code, 'Ada', 1);
    rooms.setPlayerConnected(room.code, player.id, false, 2);
    expect(rooms.snapshot(room, 0).players[0]?.connected).toBe(false);
    expect(rooms.resumePlayer(room.code, player.token, 3).player.id).toBe(player.id);
    expect(rooms.snapshot(room, 0).players[0]?.connected).toBe(true);
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

describe('RoomManager games', () => {
  it('only the VIP can start, and only with two connected players', () => {
    const { rooms, room, ada, bo } = gameSetup();
    expectGameError(() => rooms.startGame(room.code, bo.id, 0), 'NOT_VIP');
    rooms.setPlayerConnected(room.code, bo.id, false, 0);
    expectGameError(() => rooms.startGame(room.code, ada.id, 0), 'NOT_ENOUGH_PLAYERS');
    rooms.setPlayerConnected(room.code, bo.id, true, 0);
    rooms.startGame(room.code, ada.id, 1_000);
    expect(room.phase).toBe('QUESTION');
    expectGameError(() => rooms.startGame(room.code, ada.id, 0), 'WRONG_PHASE');
    expectGameError(() => rooms.joinRoom(room.code, 'Late', 2_000), 'ROOM_FULL');
  });

  it('never puts the answer in a snapshot before the reveal', () => {
    const { rooms, room, ada } = gameSetup();
    rooms.startGame(room.code, ada.id, 1_000);
    const view = rooms.snapshot(room, 1_500).game!;
    expect(view).toMatchObject({ round: 0, totalRounds: 2, deadline: 11_000, serverNow: 1_500 });
    expect(view.question).not.toHaveProperty('answer');
    expect(view.reveal).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain('"answer"');
  });

  it('reveals as soon as everyone connected answered, then plays to the end and back', () => {
    const { rooms, room, ada, bo } = gameSetup();
    rooms.startGame(room.code, ada.id, 0);
    rooms.answer(room.code, ada.id, 0, 0, 2_000);
    expect(room.phase).toBe('QUESTION');
    expect(rooms.snapshot(room, 2_000).game!.answeredIds).toEqual([ada.id]);
    expectGameError(() => rooms.answer(room.code, ada.id, 0, 1, 2_100), 'ALREADY_ANSWERED');
    rooms.answer(room.code, bo.id, 0, 3, 3_000);
    expect(room.phase).toBe('REVEAL');
    expect(rooms.snapshot(room, 3_000).game!.reveal).toEqual({
      answer: 0,
      results: { [ada.id]: { choice: 0, points: 900 }, [bo.id]: { choice: 3, points: 0 } },
    });
    expect(rooms.nextDeadline(room)).toBe(8_000);

    expectGameError(() => rooms.next(room.code, bo.id, 4_000), 'NOT_VIP');
    rooms.next(room.code, ada.id, 4_000);
    expect(room.phase).toBe('QUESTION');
    expectGameError(() => rooms.answer(room.code, bo.id, 0, 0, 4_100), 'WRONG_PHASE');

    // Nobody answers: the clock closes the question and then the reveal.
    expect(rooms.tick(room, 13_999)).toBe(false);
    expect(rooms.tick(room, 14_000)).toBe(true);
    expect(room.phase).toBe('REVEAL');
    expectGameError(() => rooms.answer(room.code, bo.id, 1, 0, 14_001), 'WRONG_PHASE');
    rooms.tick(room, 19_000);
    expect(room.phase).toBe('FINAL');
    expect(rooms.snapshot(room, 19_000).game!.standings).toEqual([
      { playerId: ada.id, score: 900, place: 1 },
      { playerId: bo.id, score: 0, place: 2 },
    ]);
    expect(rooms.nextDeadline(room)).toBeUndefined();

    rooms.next(room.code, ada.id, 20_000);
    expect(room.phase).toBe('LOBBY');
    expect(room.game).toBeUndefined();
  });

  it('a rematch asks questions that were not asked yet', () => {
    const { rooms, room, ada } = gameSetup();
    rooms.startGame(room.code, ada.id, 0);
    const first = room.game!.questions.map((q) => q.id);
    room.game = { ...room.game!, phase: 'FINAL' };
    rooms.next(room.code, ada.id, 1);
    rooms.startGame(room.code, ada.id, 2);
    const second = room.game!.questions.map((q) => q.id);
    expect(second.filter((id) => first.includes(id))).toEqual([]);
  });

  it('a player leaving mid-game no longer holds up the question', () => {
    const { rooms, room, ada, bo } = gameSetup();
    rooms.startGame(room.code, ada.id, 0);
    rooms.answer(room.code, bo.id, 0, 0, 1_000);
    rooms.removePlayer(room.code, ada.id, 2_000);
    expect(room.phase).toBe('REVEAL');
    expect(room.vipId).toBe(bo.id);
    rooms.removePlayer(room.code, bo.id, 3_000);
    expect(room.phase).toBe('LOBBY');
  });

  it('rejects answers that are not a valid choice', () => {
    const { rooms, room, ada } = gameSetup();
    expectGameError(() => rooms.answer(room.code, ada.id, 0, 0, 0), 'WRONG_PHASE');
    rooms.startGame(room.code, ada.id, 0);
    expectGameError(() => rooms.answer(room.code, ada.id, 0, 7, 1), 'INVALID_PAYLOAD');
    expectGameError(() => rooms.answer(room.code, 'nobody', 0, 0, 1), 'NOT_IN_ROOM');
    expectGameError(() => rooms.answer(room.code, ada.id, 0, 0, 10_001), 'TOO_LATE');
  });
});
