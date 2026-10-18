import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type {
  TriviaSettings,
  Ack,
  ClientToServerEvents,
  HostSession,
  PlayerSession,
  RoomSnapshot,
  ServerToClientEvents,
} from '@gno/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { RoomSocketOptions } from './roomSockets.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let app: FastifyInstance | undefined;
const clients: Client[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await app?.close();
  app = undefined;
});

async function startServer(
  roomSockets: Partial<RoomSocketOptions> = {},
  trivia?: Partial<TriviaSettings>,
) {
  app = await buildApp({ roomSockets, trivia });
  await app.listen({ port: 0, host: '127.0.0.1' });
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

async function client(url: string): Promise<Client> {
  const socket: Client = connect(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

/** Sends a request and resolves with its acknowledgement. */
function request<T>(socket: Client, event: string, ...args: unknown[]): Promise<Ack<T>> {
  return new Promise((resolve) =>
    (socket.emit as (...a: unknown[]) => void)(event, ...args, resolve),
  );
}

async function ok<T>(promise: Promise<Ack<T>>): Promise<T> {
  const ack = await promise;
  if (!ack.ok) throw new Error(`${ack.error.code}: ${ack.error.message}`);
  return ack.data;
}

/** Resolves with the next room:state matching `predicate`. */
function nextState(
  socket: Client,
  predicate: (s: RoomSnapshot) => boolean = () => true,
): Promise<RoomSnapshot> {
  return new Promise((resolve) => {
    const listener = (state: RoomSnapshot) => {
      if (!predicate(state)) return;
      socket.off('room:state', listener);
      resolve(state);
    };
    socket.on('room:state', listener);
  });
}

async function hostRoom(url: string) {
  const tv = await client(url);
  const session = await ok(request<HostSession>(tv, 'host:create'));
  return { tv, session };
}

describe('room sockets', () => {
  it('TV and three phones all receive the same lobby within 500ms', async () => {
    const url = await startServer();
    const { tv, session } = await hostRoom(url);
    const phones = await Promise.all([client(url), client(url), client(url)]);

    for (const [i, phone] of phones.slice(0, 2).entries()) {
      await ok(
        request<PlayerSession>(phone, 'player:join', {
          roomCode: session.roomCode.toLowerCase(),
          nickname: `P${i}`,
        }),
      );
    }
    const allStates = Promise.all(
      [tv, ...phones].map((s) => nextState(s, (state) => state.players.length === 3)),
    );
    const started = Date.now();
    await ok(
      request<PlayerSession>(phones[2]!, 'player:join', {
        roomCode: session.roomCode,
        nickname: 'P2',
      }),
    );
    const states = await allStates;
    expect(Date.now() - started).toBeLessThan(500);
    for (const state of states) expect(state).toEqual(states[0]);
    expect(states[0]!.players.map((p) => [p.nickname, p.seat, p.isVip])).toEqual([
      ['P0', 0, true],
      ['P1', 1, false],
      ['P2', 2, false],
    ]);
  });

  it.each([
    ['unknown room', { roomCode: 'ZZZZ', nickname: 'Ada' }, 'ROOM_NOT_FOUND'],
    ['malformed code', { roomCode: 'Z1', nickname: 'Ada' }, 'INVALID_PAYLOAD'],
    ['empty nickname', { roomCode: '__ROOM__', nickname: '   ' }, 'INVALID_PAYLOAD'],
    ['too-long nickname', { roomCode: '__ROOM__', nickname: 'x'.repeat(40) }, 'INVALID_PAYLOAD'],
    ['wrong shape', 'ABCD', 'INVALID_PAYLOAD'],
    [
      'extra fields ignored but score not trusted',
      { roomCode: '__ROOM__', score: 9999 },
      'INVALID_PAYLOAD',
    ],
  ])('rejects a join with %s and changes nothing', async (_name, payload, code) => {
    const url = await startServer();
    const { tv, session } = await hostRoom(url);
    const phone = await client(url);
    const body =
      typeof payload === 'object'
        ? {
            ...payload,
            roomCode: payload.roomCode === '__ROOM__' ? session.roomCode : payload.roomCode,
          }
        : payload;
    const ack = await request<PlayerSession>(phone, 'player:join', body);
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.error.code).toBe(code);

    // The room is unchanged: a valid join still gets seat 0.
    const joined = nextState(tv, (s) => s.players.length === 1);
    await ok(request(phone, 'player:join', { roomCode: session.roomCode, nickname: 'Ada' }));
    expect((await joined).players[0]).toMatchObject({ nickname: 'Ada', seat: 0 });
  });

  it('rejects a duplicate nickname and a ninth player', async () => {
    const url = await startServer();
    const { session } = await hostRoom(url);
    const phones = await Promise.all(Array.from({ length: 9 }, () => client(url)));
    await ok(request(phones[0]!, 'player:join', { roomCode: session.roomCode, nickname: 'Ada' }));

    const dup = await request(phones[1]!, 'player:join', {
      roomCode: session.roomCode,
      nickname: 'ada',
    });
    expect(dup).toMatchObject({ ok: false, error: { code: 'NICKNAME_TAKEN' } });

    for (let i = 1; i < 8; i++) {
      await ok(
        request(phones[i]!, 'player:join', { roomCode: session.roomCode, nickname: `P${i}` }),
      );
    }
    const ninth = await request(phones[8]!, 'player:join', {
      roomCode: session.roomCode,
      nickname: 'Late',
    });
    expect(ninth).toMatchObject({ ok: false, error: { code: 'ROOM_FULL' } });
  });

  it('ignores requests without an acknowledgement instead of crashing', async () => {
    const url = await startServer();
    const { tv, session } = await hostRoom(url);
    const phone = await client(url);
    (phone.emit as (...a: unknown[]) => void)('player:join', {
      roomCode: session.roomCode,
      nickname: 'NoAck',
    });
    const joined = nextState(tv, (s) => s.players.length === 1);
    await ok(request(phone, 'player:join', { roomCode: session.roomCode, nickname: 'Ada' }));
    expect((await joined).players.map((p) => p.nickname)).toEqual(['Ada']);
  });

  it('a refreshed phone resumes the same seat, and leaving removes it for everyone', async () => {
    const url = await startServer();
    const { tv, session } = await hostRoom(url);
    const phone = await client(url);
    const joined = await ok(
      request<PlayerSession>(phone, 'player:join', { roomCode: session.roomCode, nickname: 'Ada' }),
    );

    const offline = nextState(tv, (s) => s.players[0]?.connected === false);
    phone.disconnect();
    expect((await offline).players).toHaveLength(1);

    const reloaded = await client(url);
    const online = nextState(tv, (s) => s.players[0]?.connected === true);
    const resumed = await ok(
      request<PlayerSession>(reloaded, 'player:resume', {
        roomCode: session.roomCode,
        token: joined.token,
      }),
    );
    expect(resumed.playerId).toBe(joined.playerId);
    expect((await online).players[0]?.seat).toBe(0);

    const empty = nextState(tv, (s) => s.players.length === 0);
    await ok(request(reloaded, 'player:leave'));
    expect((await empty).players).toEqual([]);
    expect(await request(reloaded, 'player:leave')).toMatchObject({
      ok: false,
      error: { code: 'NOT_IN_ROOM' },
    });
  });

  it('a forged token cannot take over a seat or a TV', async () => {
    const url = await startServer();
    const { session } = await hostRoom(url);
    const attacker = await client(url);
    expect(
      await request(attacker, 'player:resume', {
        roomCode: session.roomCode,
        token: 'x'.repeat(32),
      }),
    ).toMatchObject({ ok: false, error: { code: 'SESSION_NOT_FOUND' } });
    expect(
      await request(attacker, 'host:resume', { roomCode: session.roomCode, token: 'x'.repeat(32) }),
    ).toMatchObject({ ok: false, error: { code: 'SESSION_NOT_FOUND' } });
  });

  it('removes a player who stays disconnected past the grace period and passes VIP on', async () => {
    const url = await startServer({ lobbyGraceMs: 100 });
    const { tv, session } = await hostRoom(url);
    const vip = await client(url);
    const other = await client(url);
    await ok(request(vip, 'player:join', { roomCode: session.roomCode, nickname: 'First' }));
    await ok(request(other, 'player:join', { roomCode: session.roomCode, nickname: 'Second' }));

    const handedOver = nextState(tv, (s) => s.players.length === 1);
    vip.disconnect();
    expect((await handedOver).players[0]).toMatchObject({ nickname: 'Second', isVip: true });
  });

  it('the TV resumes its room after a refresh and phones see it come back', async () => {
    const url = await startServer();
    const { tv, session } = await hostRoom(url);
    const phone = await client(url);
    await ok(request(phone, 'player:join', { roomCode: session.roomCode, nickname: 'Ada' }));

    const hostGone = nextState(phone, (s) => !s.hostConnected);
    tv.disconnect();
    await hostGone;

    const newTv = await client(url);
    const hostBack = nextState(phone, (s) => s.hostConnected);
    await ok(
      request(newTv, 'host:resume', { roomCode: session.roomCode, token: session.hostToken }),
    );
    expect((await hostBack).players.map((p) => p.nickname)).toEqual(['Ada']);
  });

  it('closes rooms nobody is connected to after the idle timeout', async () => {
    const url = await startServer({ abandonedRoomMs: 50, sweepIntervalMs: 20 });
    const { tv, session } = await hostRoom(url);
    tv.disconnect();
    await new Promise((r) => setTimeout(r, 200));
    const phone = await client(url);
    expect(
      await request(phone, 'player:join', { roomCode: session.roomCode, nickname: 'Ada' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND' },
    });
  });
});

describe('trivia game over sockets', () => {
  async function lobbyOfTwo(trivia: Partial<TriviaSettings>, roomSockets = {}) {
    const url = await startServer(roomSockets, trivia);
    const { tv, session } = await hostRoom(url);
    const ada = await client(url);
    const bo = await client(url);
    await ok(request(ada, 'player:join', { roomCode: session.roomCode, nickname: 'Ada' }));
    await ok(request(bo, 'player:join', { roomCode: session.roomCode, nickname: 'Bo' }));
    return { url, tv, ada, bo, session };
  }

  it('plays a whole game: early close, timeout, reveal, final scores, back to lobby', async () => {
    const { tv, ada, bo } = await lobbyOfTwo({ questionCount: 2, questionMs: 400, revealMs: 150 });
    const seen: RoomSnapshot[] = [];
    tv.on('room:state', (s) => seen.push(s));

    expect(await request(bo, 'game:start')).toMatchObject({
      ok: false,
      error: { code: 'NOT_VIP' },
    });
    const question = nextState(tv, (s) => s.phase === 'QUESTION');
    await ok(request(ada, 'game:start'));
    const q1 = (await question).game!;
    expect(q1.round).toBe(0);
    expect(q1.totalRounds).toBe(2);
    expect(q1.question).not.toHaveProperty('answer');

    // Round 1: both answer, so it reveals without waiting for the clock.
    const reveal = nextState(tv, (s) => s.phase === 'REVEAL');
    await ok(request(ada, 'game:answer', { round: 0, choice: 0 }));
    expect(await request(ada, 'game:answer', { round: 0, choice: 1 })).toMatchObject({
      ok: false,
      error: { code: 'ALREADY_ANSWERED' },
    });
    await ok(request(bo, 'game:answer', { round: 0, choice: 1 }));
    const r1 = (await reveal).game!;
    expect(Date.now()).toBeLessThan(q1.deadline);
    const answer = r1.reveal!.answer;
    const adaId = r1.answeredIds[0]!;
    expect(r1.reveal!.results[adaId]!.points > 0).toBe(answer === 0);

    // The reveal ends on its own, then nobody answers round 2 and the clock closes it.
    const q2 = (await nextState(tv, (s) => s.phase === 'QUESTION')).game!;
    expect(q2.round).toBe(1);
    expect(await request(bo, 'game:answer', { round: 0, choice: 0 })).toMatchObject({
      ok: false,
      error: { code: 'WRONG_PHASE' },
    });
    const final = await nextState(tv, (s) => s.phase === 'FINAL');
    expect(final.game!.standings).toHaveLength(2);
    expect(final.game!.reveal).toBeUndefined();

    // No snapshot ever leaked the answer while the question was open.
    for (const state of seen.filter((s) => s.phase === 'QUESTION')) {
      expect(state.game?.reveal).toBeUndefined();
    }

    const lobby = nextState(tv, (s) => s.phase === 'LOBBY');
    await ok(request(ada, 'game:next'));
    expect((await lobby).game).toBeUndefined();
  });

  it('a lone player cannot start a game', async () => {
    const { tv, ada, bo } = await lobbyOfTwo({});
    const left = nextState(tv, (s) => s.players.length === 1);
    await ok(request(bo, 'player:leave'));
    await left;
    expect(await request(ada, 'game:start')).toMatchObject({
      ok: false,
      error: { code: 'NOT_ENOUGH_PLAYERS' },
    });
  });

  it('a dropped phone keeps its seat during a game and the question closes without it', async () => {
    const { tv, ada, bo } = await lobbyOfTwo(
      { questionCount: 2, questionMs: 5_000, revealMs: 60_000 },
      { lobbyGraceMs: 50 },
    );
    const question = nextState(tv, (s) => s.phase === 'QUESTION');
    await ok(request(ada, 'game:start'));
    await question;
    await ok(request(ada, 'game:answer', { round: 0, choice: 0 }));

    const reveal = nextState(tv, (s) => s.phase === 'REVEAL');
    bo.disconnect();
    const revealed = await reveal;
    await new Promise((r) => setTimeout(r, 150)); // longer than the lobby grace period
    const skip = nextState(tv, (s) => s.phase === 'QUESTION');
    await ok(request(ada, 'game:next'));
    expect((await skip).players.map((p) => [p.nickname, p.connected])).toEqual([
      ['Ada', true],
      ['Bo', false],
    ]);
    expect(revealed.game!.round).toBe(0);
  });

  it('rejects malformed answers', async () => {
    const { tv, ada } = await lobbyOfTwo({ questionCount: 1 });
    const question = nextState(tv, (s) => s.phase === 'QUESTION');
    await ok(request(ada, 'game:start'));
    await question;
    for (const payload of [{ round: 0, choice: 4 }, { round: -1, choice: 0 }, { choice: 1 }, 'A']) {
      expect(await request(ada, 'game:answer', payload)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_PAYLOAD' },
      });
    }
  });
});
