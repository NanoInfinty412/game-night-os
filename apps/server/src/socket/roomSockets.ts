import type { FastifyBaseLogger } from 'fastify';
import { Server, type Socket } from 'socket.io';
import { ZodError } from 'zod';
import {
  joinRequestSchema,
  playerActionSchema,
  selectGameSchema,
  resumeRequestSchema,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@gno/shared';
import { GameError } from '../rooms/errors.js';
import type { Actor, Room, RoomManager } from '../rooms/roomManager.js';

export interface SocketData {
  roomCode?: string;
  role?: 'host' | 'player';
  playerId?: string;
}

export type GameServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface RoomSocketOptions {
  /** How long a disconnected player keeps their seat in the lobby. */
  lobbyGraceMs: number;
  /** How long an empty, disconnected room survives. */
  abandonedRoomMs: number;
  sweepIntervalMs: number;
  /** Tapping races update the TV at most this often instead of on every tap. */
  tapBroadcastMs: number;
  now: () => number;
}

export const DEFAULT_ROOM_SOCKET_OPTIONS: RoomSocketOptions = {
  lobbyGraceMs: 60_000,
  abandonedRoomMs: 30 * 60_000,
  sweepIntervalMs: 60_000,
  tapBroadcastMs: 120,
  now: Date.now,
};

const channel = (code: string) => `room:${code}`;

/** Wires Socket.IO events to the RoomManager. Returns a function that stops background timers. */
export function registerRoomSockets(
  io: GameServer,
  rooms: RoomManager,
  log: FastifyBaseLogger,
  options: RoomSocketOptions = DEFAULT_ROOM_SOCKET_OPTIONS,
): () => void {
  const { now } = options;
  // Which socket currently speaks for each host and player; older sockets are ignored.
  const hostSockets = new Map<string, string>();
  const playerSockets = new Map<string, string>();
  const graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const gameTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingBroadcasts = new Map<string, ReturnType<typeof setTimeout>>();

  /** Sends the room to every screen in it, then makes sure its game clock is armed. */
  function broadcast(room: Room) {
    clearTimeout(pendingBroadcasts.get(room.code));
    pendingBroadcasts.delete(room.code);
    io.to(channel(room.code)).emit('room:state', rooms.snapshot(room, now()));
    scheduleGame(room);
  }

  /** Batches rapid changes (tapping races) into one broadcast every few frames. */
  function broadcastSoon(room: Room) {
    if (pendingBroadcasts.has(room.code)) return;
    pendingBroadcasts.set(
      room.code,
      setTimeout(() => {
        pendingBroadcasts.delete(room.code);
        const current = rooms.getRoomOrUndefined(room.code);
        if (current) broadcast(current);
      }, options.tapBroadcastMs),
    );
  }

  function clearGameTimer(code: string) {
    clearTimeout(gameTimers.get(code));
    gameTimers.delete(code);
  }

  /** Wakes up at the room's next deadline (question closes, reveal ends) and moves the game on. */
  function scheduleGame(room: Room) {
    clearGameTimer(room.code);
    const deadline = rooms.nextDeadline(room);
    if (deadline === undefined) return;
    gameTimers.set(
      room.code,
      setTimeout(
        () => {
          gameTimers.delete(room.code);
          let current: Room;
          try {
            current = rooms.getRoom(room.code);
          } catch {
            return; // Room swept.
          }
          if (rooms.tick(current, now())) broadcast(current);
          else scheduleGame(current);
        },
        Math.max(deadline - now(), 1),
      ),
    );
  }

  function scheduleGrace(code: string, playerId: string) {
    cancelGrace(playerId);
    graceTimers.set(
      playerId,
      setTimeout(() => {
        graceTimers.delete(playerId);
        const room = rooms.getRoomOrUndefined(code);
        // Mid-game, a dropped phone keeps its seat and score; the lobby gets a fresh grace period.
        if (!room || room.phase !== 'LOBBY') return;
        broadcast(rooms.removePlayer(code, playerId, now())!);
      }, options.lobbyGraceMs),
    );
  }

  /** Back in the lobby: anyone who dropped out during the game gets a grace period from now. */
  function graceForDisconnected(room: Room) {
    for (const p of room.players) if (!p.connected) scheduleGrace(room.code, p.id);
  }

  function playerOf(socket: GameSocket) {
    const { roomCode, role, playerId } = socket.data;
    if (role !== 'player' || !roomCode || !playerId) {
      throw new GameError('NOT_IN_ROOM', 'You are not in a room.');
    }
    return { roomCode, playerId };
  }

  /** The TV or a phone in a room, for leader-only requests (select, start, next, quit). */
  function actorOf(socket: GameSocket): { roomCode: string; actor: Actor } {
    const { roomCode, role, playerId } = socket.data;
    if (roomCode && role === 'host') return { roomCode, actor: { role: 'host' } };
    if (roomCode && role === 'player' && playerId)
      return { roomCode, actor: { role: 'player', playerId } };
    throw new GameError('NOT_IN_ROOM', 'You are not in a room.');
  }

  function cancelGrace(playerId: string) {
    clearTimeout(graceTimers.get(playerId));
    graceTimers.delete(playerId);
  }

  /** Takes a socket out of whatever room it was in, without changing that room. */
  function detach(socket: GameSocket) {
    if (socket.data.roomCode) void socket.leave(channel(socket.data.roomCode));
    socket.data = {};
  }

  function attach(socket: GameSocket, room: Room, role: 'host' | 'player', playerId?: string) {
    detach(socket);
    socket.data = { roomCode: room.code, role, playerId };
    void socket.join(channel(room.code));
  }

  /** Takes over from an older socket (another tab, or a stale connection) for the same seat. */
  function evict(previousSocketId: string | undefined, socket: GameSocket) {
    if (!previousSocketId || previousSocketId === socket.id) return;
    const previous = io.sockets.sockets.get(previousSocketId);
    if (previous) detach(previous);
  }

  function handle<T>(socket: GameSocket, ack: unknown, action: () => T) {
    if (typeof ack !== 'function') return; // Every request must carry an acknowledgement.
    const reply = ack as (response: Ack<T>) => void;
    try {
      reply({ ok: true, data: action() });
    } catch (error) {
      if (error instanceof GameError) {
        reply({ ok: false, error: { code: error.code, message: error.message } });
      } else if (error instanceof ZodError) {
        const message = error.issues[0]?.message ?? 'Invalid request';
        reply({ ok: false, error: { code: 'INVALID_PAYLOAD', message } });
      } else {
        log.error({ err: error, socket: socket.id }, 'socket handler failed');
        reply({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
        });
      }
    }
  }

  io.on('connection', (socket) => {
    socket.on('host:create', (ack) =>
      handle(socket, ack, () => {
        const room = rooms.createRoom(now());
        attach(socket, room, 'host');
        hostSockets.set(room.code, socket.id);
        broadcast(room);
        return { roomCode: room.code, hostToken: room.hostToken };
      }),
    );

    socket.on('host:resume', (payload, ack) =>
      handle(socket, ack, () => {
        const { roomCode, token } = resumeRequestSchema.parse(payload);
        const room = rooms.resumeHost(roomCode, token, now());
        evict(hostSockets.get(room.code), socket);
        attach(socket, room, 'host');
        hostSockets.set(room.code, socket.id);
        broadcast(room);
        return { roomCode: room.code, hostToken: room.hostToken };
      }),
    );

    socket.on('player:join', (payload, ack) =>
      handle(socket, ack, () => {
        const { roomCode, nickname } = joinRequestSchema.parse(payload);
        const { room, player } = rooms.joinRoom(roomCode, nickname, now());
        attach(socket, room, 'player', player.id);
        playerSockets.set(player.id, socket.id);
        broadcast(room);
        return { roomCode: room.code, playerId: player.id, token: player.token };
      }),
    );

    socket.on('player:resume', (payload, ack) =>
      handle(socket, ack, () => {
        const { roomCode, token } = resumeRequestSchema.parse(payload);
        const { room, player } = rooms.resumePlayer(roomCode, token, now());
        cancelGrace(player.id);
        evict(playerSockets.get(player.id), socket);
        attach(socket, room, 'player', player.id);
        playerSockets.set(player.id, socket.id);
        broadcast(room);
        return { roomCode: room.code, playerId: player.id, token: player.token };
      }),
    );

    socket.on('player:leave', (ack) =>
      handle(socket, ack, () => {
        const { roomCode, playerId } = playerOf(socket);
        cancelGrace(playerId);
        playerSockets.delete(playerId);
        detach(socket);
        const room = rooms.removePlayer(roomCode, playerId, now());
        if (room) broadcast(room);
        return null;
      }),
    );

    socket.on('game:select', (payload, ack) =>
      handle(socket, ack, () => {
        const { roomCode, actor } = actorOf(socket);
        const { gameId } = selectGameSchema.parse(payload);
        broadcast(rooms.selectGame(roomCode, actor, gameId, now()));
        return null;
      }),
    );

    socket.on('game:start', (ack) =>
      handle(socket, ack, () => {
        const { roomCode, actor } = actorOf(socket);
        broadcast(rooms.startGame(roomCode, actor, now()));
        return null;
      }),
    );

    socket.on('game:action', (payload, ack) =>
      handle(socket, ack, () => {
        const { roomCode, playerId } = playerOf(socket);
        const action = playerActionSchema.parse(payload);
        const room = rooms.act(roomCode, playerId, action, now());
        const racing = action.type === 'tap' && room.game?.round.kind === 'mash';
        if (racing && room.phase === 'PLAY') broadcastSoon(room);
        else broadcast(room);
        return null;
      }),
    );

    socket.on('game:next', (ack) =>
      handle(socket, ack, () => {
        const { roomCode, actor } = actorOf(socket);
        const room = rooms.next(roomCode, actor, now());
        if (room.phase === 'LOBBY') graceForDisconnected(room);
        broadcast(room);
        return null;
      }),
    );

    socket.on('game:quit', (ack) =>
      handle(socket, ack, () => {
        const { roomCode, actor } = actorOf(socket);
        const room = rooms.quit(roomCode, actor, now());
        graceForDisconnected(room);
        broadcast(room);
        return null;
      }),
    );

    socket.on('disconnect', () => {
      const { roomCode, role, playerId } = socket.data;
      if (!roomCode) return;
      if (role === 'host' && hostSockets.get(roomCode) === socket.id) {
        hostSockets.delete(roomCode);
        rooms.setHostConnected(roomCode, false, now());
      } else if (role === 'player' && playerId && playerSockets.get(playerId) === socket.id) {
        playerSockets.delete(playerId);
        rooms.setPlayerConnected(roomCode, playerId, false, now());
        scheduleGrace(roomCode, playerId);
      } else {
        return;
      }
      const room = rooms.getRoomOrUndefined(roomCode);
      if (!room) return; // Already swept.
      // Everyone left who is still connected may have answered already.
      rooms.tick(room, now());
      broadcast(room);
    });
  });

  const sweeper = setInterval(() => {
    for (const code of rooms.sweepAbandoned(now(), options.abandonedRoomMs)) {
      io.to(channel(code)).emit('room:closed');
      io.in(channel(code)).socketsLeave(channel(code));
      hostSockets.delete(code);
      clearGameTimer(code);
      clearTimeout(pendingBroadcasts.get(code));
      pendingBroadcasts.delete(code);
    }
  }, options.sweepIntervalMs);
  sweeper.unref();

  return () => {
    clearInterval(sweeper);
    const timers = [graceTimers, gameTimers, pendingBroadcasts];
    for (const map of timers) {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    }
  };
}
