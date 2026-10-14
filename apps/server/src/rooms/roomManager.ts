import { randomBytes, randomUUID } from 'node:crypto';
import { MAX_PLAYERS, nicknameSchema, type Phase, type RoomSnapshot } from '@gno/shared';
import { GameError } from './errors.js';
import { generateRoomCode } from './roomCode.js';

export interface Player {
  id: string;
  nickname: string;
  seat: number;
  token: string;
  connected: boolean;
  joinedAt: number;
}

export interface Room {
  code: string;
  hostToken: string;
  hostConnected: boolean;
  phase: Phase;
  players: Player[];
  vipId: string | undefined;
  lastActivity: number;
}

/** Where rooms live. In-memory for the MVP; a shared store can implement this later. */
export interface RoomStore {
  get(code: string): Room | undefined;
  set(room: Room): void;
  delete(code: string): void;
  has(code: string): boolean;
  all(): Iterable<Room>;
}

export class InMemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, Room>();
  get(code: string) {
    return this.rooms.get(code);
  }
  set(room: Room) {
    this.rooms.set(room.code, room);
  }
  delete(code: string) {
    this.rooms.delete(code);
  }
  has(code: string) {
    return this.rooms.has(code);
  }
  all() {
    return this.rooms.values();
  }
}

export interface RoomManagerOptions {
  store?: RoomStore;
  random?: () => number;
  newToken?: () => string;
}

const defaultToken = () => randomBytes(24).toString('base64url');

/**
 * Room membership rules. Knows nothing about sockets or timers: callers pass `now`
 * and decide when to call `removePlayer` or `sweepIdle`.
 */
export class RoomManager {
  private readonly store: RoomStore;
  private readonly random: () => number;
  private readonly newToken: () => string;

  constructor(options: RoomManagerOptions = {}) {
    this.store = options.store ?? new InMemoryRoomStore();
    this.random = options.random ?? Math.random;
    this.newToken = options.newToken ?? defaultToken;
  }

  createRoom(now: number): Room {
    const room: Room = {
      code: generateRoomCode((code) => this.store.has(code), this.random),
      hostToken: this.newToken(),
      hostConnected: true,
      phase: 'LOBBY',
      players: [],
      vipId: undefined,
      lastActivity: now,
    };
    this.store.set(room);
    return room;
  }

  getRoom(code: string): Room {
    const room = this.store.get(code);
    if (!room)
      throw new GameError('ROOM_NOT_FOUND', `No room with code ${code}. Check the code on the TV.`);
    return room;
  }

  resumeHost(code: string, hostToken: string, now: number): Room {
    const room = this.getRoom(code);
    if (room.hostToken !== hostToken)
      throw new GameError('SESSION_NOT_FOUND', 'That room belongs to another screen.');
    room.hostConnected = true;
    room.lastActivity = now;
    return room;
  }

  setHostConnected(code: string, connected: boolean, now: number) {
    const room = this.store.get(code);
    if (!room) return;
    room.hostConnected = connected;
    room.lastActivity = now;
  }

  joinRoom(code: string, rawNickname: string, now: number): { room: Room; player: Player } {
    const room = this.getRoom(code);
    const nickname = nicknameSchema.parse(rawNickname);
    if (room.phase !== 'LOBBY') throw new GameError('ROOM_FULL', 'That game has already started.');
    if (room.players.length >= MAX_PLAYERS) {
      throw new GameError('ROOM_FULL', `This room is full (${MAX_PLAYERS} players).`);
    }
    const taken = room.players.some(
      (p) => p.nickname.toLocaleLowerCase() === nickname.toLocaleLowerCase(),
    );
    if (taken)
      throw new GameError(
        'NICKNAME_TAKEN',
        `Someone is already called ${nickname}. Try another name!`,
      );

    const usedSeats = new Set(room.players.map((p) => p.seat));
    let seat = 0;
    while (usedSeats.has(seat)) seat++;

    const player: Player = {
      id: randomUUID(),
      nickname,
      seat,
      token: this.newToken(),
      connected: true,
      joinedAt: now,
    };
    room.players.push(player);
    room.vipId ??= player.id;
    room.lastActivity = now;
    return { room, player };
  }

  resumePlayer(code: string, token: string, now: number): { room: Room; player: Player } {
    const room = this.getRoom(code);
    const player = room.players.find((p) => p.token === token);
    if (!player)
      throw new GameError('SESSION_NOT_FOUND', 'You are no longer in this room. Join again!');
    player.connected = true;
    room.lastActivity = now;
    return { room, player };
  }

  setPlayerConnected(code: string, playerId: string, connected: boolean, now: number) {
    const player = this.store.get(code)?.players.find((p) => p.id === playerId);
    if (!player) return;
    player.connected = connected;
    this.store.get(code)!.lastActivity = now;
  }

  /** Removes a player; the earliest remaining joiner becomes VIP if the VIP left. */
  removePlayer(code: string, playerId: string, now: number): Room | undefined {
    const room = this.store.get(code);
    if (!room) return undefined;
    room.players = room.players.filter((p) => p.id !== playerId);
    if (room.vipId === playerId) {
      const next = [...room.players].sort((a, b) => a.joinedAt - b.joinedAt || a.seat - b.seat)[0];
      room.vipId = next?.id;
    }
    room.lastActivity = now;
    return room;
  }

  /**
   * Deletes rooms nobody is connected to (no TV, no phones) and that have been quiet for
   * `idleMs`. A lobby left open on a TV is never removed. Returns the codes removed.
   */
  sweepAbandoned(now: number, idleMs: number): string[] {
    const removed: string[] = [];
    for (const room of [...this.store.all()]) {
      const anyoneConnected = room.hostConnected || room.players.some((p) => p.connected);
      if (!anyoneConnected && now - room.lastActivity >= idleMs) {
        this.store.delete(room.code);
        removed.push(room.code);
      }
    }
    return removed;
  }

  snapshot(room: Room): RoomSnapshot {
    return {
      code: room.code,
      phase: room.phase,
      hostConnected: room.hostConnected,
      players: [...room.players]
        .sort((a, b) => a.seat - b.seat)
        .map((p) => ({
          id: p.id,
          nickname: p.nickname,
          seat: p.seat,
          isVip: p.id === room.vipId,
          connected: p.connected,
        })),
    };
  }
}
