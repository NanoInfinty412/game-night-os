import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, type GameContent, type Question } from '@gno/shared';
import { GameError } from './errors.js';
import { RoomManager } from './roomManager.js';

function setup() {
  let n = 0;
  const rooms = new RoomManager({ newToken: () => `token-${String(++n).padStart(12, '0')}` });
  const room = rooms.createRoom(0);
  return { rooms, room };
}

const trivia: Question[] = ['one', 'two', 'three', 'four'].map((id) => ({
  id,
  category: 'Test',
  prompt: `Question ${id}?`,
  choices: ['A', 'B', 'C', 'D'],
  answer: 0,
}));
const content: GameContent = { trivia, trueFalse: [], emoji: [], numbers: [] };

/** A room with Ada (VIP) and Bo; Trivia Chaos plays 2 questions of 10s, intro 1s, reveal 5s. */
function gameSetup() {
  const rooms = new RoomManager({
    content,
    build: { triviaCount: 2, timings: { triviaMs: 10_000 } },
    timing: { introMs: 1_000, revealMs: 5_000 },
    random: () => 0.9999, // keeps question and choice order
  });
  const room = rooms.createRoom(0);
  const ada = rooms.joinRoom(room.code, 'Ada', 0).player;
  const bo = rooms.joinRoom(room.code, 'Bo', 0).player;
  rooms.selectGame(room.code, { role: 'host' }, 'trivia', 0);
  const as = (id: string) => ({ role: 'player' as const, playerId: id });
  return { rooms, room, ada, bo, as };
}

const answer = (round: number, choice: number) => ({ type: 'answer' as const, round, choice });

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
      selectedGame: 'party-mix',
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
  it('the VIP or the TV choose and start; only with two connected players', () => {
    const { rooms, room, ada, bo, as } = gameSetup();
    expect(room.selectedGame).toBe('trivia');
    expectGameError(() => rooms.selectGame(room.code, as(bo.id), 'quick-draw', 0), 'NOT_VIP');
    rooms.selectGame(room.code, as(ada.id), 'quick-draw', 0);
    expect(rooms.snapshot(room, 0).selectedGame).toBe('quick-draw');
    rooms.selectGame(room.code, { role: 'host' }, 'trivia', 0);
    expectGameError(() => rooms.startGame(room.code, as(bo.id), 0), 'NOT_VIP');
    rooms.setPlayerConnected(room.code, bo.id, false, 0);
    expectGameError(() => rooms.startGame(room.code, as(ada.id), 0), 'NOT_ENOUGH_PLAYERS');
    rooms.setPlayerConnected(room.code, bo.id, true, 0);
    rooms.startGame(room.code, { role: 'host' }, 1_000);
    expect(room.phase).toBe('INTRO');
    expectGameError(() => rooms.startGame(room.code, as(ada.id), 0), 'WRONG_PHASE');
    expectGameError(() => rooms.selectGame(room.code, as(ada.id), 'trivia', 0), 'WRONG_PHASE');
    expectGameError(() => rooms.joinRoom(room.code, 'Late', 2_000), 'ROOM_FULL');
  });

  it('never puts the answer in a snapshot before the reveal', () => {
    const { rooms, room, ada, as } = gameSetup();
    rooms.startGame(room.code, as(ada.id), 0);
    rooms.tick(room, 1_000);
    const view = rooms.snapshot(room, 1_500).game!;
    expect(view).toMatchObject({ phase: 'PLAY', round: 0, totalRounds: 2, phaseEndsAt: 11_000 });
    expect(view.serverNow).toBe(1_500);
    expect(JSON.stringify(view)).not.toContain('"answer"');
  });

  it('reveals once everyone connected answered, then plays to the end and back', () => {
    const { rooms, room, ada, bo, as } = gameSetup();
    rooms.startGame(room.code, as(ada.id), 0);
    expectGameError(() => rooms.act(room.code, ada.id, answer(0, 0), 500), 'WRONG_PHASE');
    rooms.next(room.code, as(ada.id), 500); // skip the intro: answering opens at 500
    expect(room.phase).toBe('PLAY');
    rooms.act(room.code, ada.id, answer(0, 0), 2_500);
    expect(room.phase).toBe('PLAY');
    expect(rooms.snapshot(room, 2_500).game!.doneIds).toEqual([ada.id]);
    expectGameError(() => rooms.act(room.code, ada.id, answer(0, 1), 2_600), 'ALREADY_ANSWERED');
    rooms.act(room.code, bo.id, answer(0, 3), 3_000);
    expect(room.phase).toBe('REVEAL');
    expect(rooms.snapshot(room, 3_000).game!.results).toEqual({
      [ada.id]: { value: 0, points: 900 },
      [bo.id]: { value: 3, points: 0 },
    });
    expect(rooms.nextDeadline(room)).toBe(8_000);

    expectGameError(() => rooms.next(room.code, as(bo.id), 4_000), 'NOT_VIP');
    rooms.next(room.code, { role: 'host' }, 4_000);
    expect(room.phase).toBe('INTRO');
  });

  it('the clock runs intros, questions and reveals to the final scores', () => {
    const { rooms, room, ada, as } = gameSetup();
    rooms.startGame(room.code, as(ada.id), 0);
    let t = 0;
    while (room.phase !== 'FINAL' && t < 100_000) {
      t = rooms.nextDeadline(room)!;
      rooms.tick(room, t);
    }
    expect(room.phase).toBe('FINAL');
    expect(rooms.snapshot(room, t).game!.standings).toHaveLength(2);
    expect(rooms.nextDeadline(room)).toBeUndefined();
    rooms.next(room.code, as(ada.id), t + 1);
    expect(room.phase).toBe('LOBBY');
    expect(room.game).toBeUndefined();
  });

  it('a rematch asks questions that were not asked yet', () => {
    const { rooms, room, ada, as } = gameSetup();
    rooms.startGame(room.code, as(ada.id), 0);
    const first = [...room.usedQuestionIds];
    rooms.quit(room.code, as(ada.id), 1);
    rooms.startGame(room.code, as(ada.id), 2);
    const second = [...room.usedQuestionIds].filter((id) => !first.includes(id));
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
  });

  it('a player leaving mid-game no longer holds up the question', () => {
    const { rooms, room, ada, bo, as } = gameSetup();
    rooms.startGame(room.code, as(ada.id), 0);
    rooms.tick(room, 1_000);
    rooms.act(room.code, bo.id, answer(0, 0), 1_500);
    rooms.removePlayer(room.code, ada.id, 2_000);
    expect(room.phase).toBe('REVEAL');
    expect(room.vipId).toBe(bo.id);
    rooms.removePlayer(room.code, bo.id, 3_000);
    expect(room.phase).toBe('LOBBY');
  });

  it('only the VIP or TV can quit', () => {
    const { rooms, room, ada, bo, as } = gameSetup();
    expectGameError(() => rooms.quit(room.code, as(ada.id), 0), 'WRONG_PHASE');
    rooms.startGame(room.code, as(ada.id), 0);
    expectGameError(() => rooms.quit(room.code, as(bo.id), 0), 'NOT_VIP');
    rooms.quit(room.code, { role: 'host' }, 0);
    expect(room.phase).toBe('LOBBY');
  });

  it('maps engine refusals to protocol errors', () => {
    const { rooms, room, ada, as } = gameSetup();
    rooms.startGame(room.code, as(ada.id), 0);
    rooms.tick(room, 1_000);
    expectGameError(() => rooms.act(room.code, ada.id, answer(0, 3.5), 1_001), 'INVALID_PAYLOAD');
    expectGameError(() => rooms.act(room.code, 'nobody', answer(0, 0), 1_001), 'NOT_IN_ROOM');
    expectGameError(() => rooms.act(room.code, ada.id, answer(1, 0), 1_001), 'WRONG_PHASE');
    expectGameError(() => rooms.act(room.code, ada.id, answer(0, 0), 11_001), 'TOO_LATE');
  });
});
