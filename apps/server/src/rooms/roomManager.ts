import { randomBytes, randomUUID } from 'node:crypto';
import {
  DEFAULT_GAME,
  DEFAULT_TIMING,
  MAX_PLAYERS,
  MIN_PLAYERS,
  act,
  buildRounds,
  gameView,
  nextDeadline,
  nicknameSchema,
  questionIds,
  removePlayer as removeFromGame,
  skip,
  startGame,
  tick,
  type ActionRejection,
  type BuildOptions,
  type ErrorCode,
  type GameContent,
  type GameId,
  type PartyGame,
  type PartyTiming,
  type Phase,
  type PlayerAction,
  type RoomSnapshot,
} from '@gno/shared';
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
  /** The game the lobby will play next. */
  selectedGame: GameId;
  game: PartyGame | undefined;
  /** Questions already asked in this room, so a rematch gets fresh ones. */
  usedQuestionIds: Set<string>;
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
  content?: GameContent;
  /** Round lengths and Trivia Chaos length. */
  build?: Omit<BuildOptions, 'used'>;
  timing?: Partial<PartyTiming>;
}

/** Who is asking: the TV (host) or a phone. The TV and the VIP phone lead the game. */
export type Actor = { role: 'host' } | { role: 'player'; playerId: string };

const REJECTIONS: Record<ActionRejection, [ErrorCode, string]> = {
  WRONG_PHASE: ['WRONG_PHASE', "That's not open right now."],
  WRONG_ROUND: ['WRONG_PHASE', 'That round is already over.'],
  NOT_A_PLAYER: ['NOT_IN_ROOM', 'You are not playing in this game.'],
  NOT_YOUR_PICK: ['NOT_YOUR_PICK', "It's someone else's turn to pick."],
  INVALID_ACTION: ['INVALID_PAYLOAD', 'That is not one of the options.'],
  ALREADY_ANSWERED: ['ALREADY_ANSWERED', 'You already locked in!'],
  TOO_LATE: ['TOO_LATE', 'Time is up!'],
  TOO_FAST: ['TOO_FAST', 'Whoa, slow down a tiny bit!'],
};

const EMPTY_CONTENT: GameContent = { trivia: [], trueFalse: [], emoji: [], numbers: [] };

const defaultToken = () => randomBytes(24).toString('base64url');

/**
 * Room membership rules. Knows nothing about sockets or timers: callers pass `now`
 * and decide when to call `removePlayer` or `sweepIdle`.
 */
export class RoomManager {
  private readonly store: RoomStore;
  private readonly random: () => number;
  private readonly newToken: () => string;
  private readonly content: GameContent;
  private readonly build: Omit<BuildOptions, 'used'>;
  readonly timing: PartyTiming;

  constructor(options: RoomManagerOptions = {}) {
    this.store = options.store ?? new InMemoryRoomStore();
    this.random = options.random ?? Math.random;
    this.newToken = options.newToken ?? defaultToken;
    this.content = options.content ?? EMPTY_CONTENT;
    this.build = options.build ?? {};
    this.timing = { ...DEFAULT_TIMING, ...options.timing };
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
      selectedGame: DEFAULT_GAME,
      game: undefined,
      usedQuestionIds: new Set(),
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

  getRoomOrUndefined(code: string): Room | undefined {
    return this.store.get(code);
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
    if (room.game) {
      room.game = removeFromGame(room.game, playerId);
      if (room.players.length === 0) this.endGame(room);
      else this.tick(room, now);
    }
    if (room.game) {
      // Category Clash turns that belonged to the leaver go to someone still here.
      room.game = reassignPicks(room.game, playerId);
    }
    if (room.vipId === playerId) {
      const next = [...room.players].sort((a, b) => a.joinedAt - b.joinedAt || a.seat - b.seat)[0];
      room.vipId = next?.id;
    }
    room.lastActivity = now;
    return room;
  }

  /** The TV or VIP chooses which game the lobby plays next. */
  selectGame(code: string, actor: Actor, gameId: GameId, now: number): Room {
    const room = this.getRoom(code);
    this.requireLeader(room, actor);
    if (room.phase !== 'LOBBY') throw new GameError('WRONG_PHASE', 'A game is already running.');
    room.selectedGame = gameId;
    room.lastActivity = now;
    return room;
  }

  /** The TV or VIP starts the chosen game with everyone in the lobby. */
  startGame(code: string, actor: Actor, now: number): Room {
    const room = this.getRoom(code);
    this.requireLeader(room, actor);
    if (room.phase !== 'LOBBY') throw new GameError('WRONG_PHASE', 'A game is already running.');
    if (room.players.filter((p) => p.connected).length < MIN_PLAYERS) {
      throw new GameError(
        'NOT_ENOUGH_PLAYERS',
        `You need at least ${MIN_PLAYERS} players to start.`,
      );
    }
    const playerIds = [...room.players].sort((a, b) => a.joinedAt - b.joinedAt).map((p) => p.id);
    const rounds = buildRounds(room.selectedGame, this.content, playerIds, this.random, {
      ...this.build,
      used: room.usedQuestionIds,
    });
    if (rounds.length === 0) throw new Error(`No content loaded for ${room.selectedGame}`);
    for (const id of questionIds(rounds)) room.usedQuestionIds.add(id);

    room.game = startGame(room.selectedGame, playerIds, rounds, this.timing, now);
    room.phase = room.game.phase;
    room.lastActivity = now;
    return room;
  }

  /** A phone answers, guesses, taps or picks. */
  act(code: string, playerId: string, action: PlayerAction, now: number): Room {
    const room = this.getRoom(code);
    if (!room.game) throw new GameError('WRONG_PHASE', 'No game is running right now.');
    const result = act(room.game, playerId, action, now);
    if ('rejected' in result) {
      const [errorCode, message] = REJECTIONS[result.rejected];
      throw new GameError(errorCode, message);
    }
    room.game = result.game;
    room.lastActivity = now;
    this.tick(room, now);
    return room;
  }

  /** TV or VIP skips an intro or reveal, or returns everyone to the lobby after the final scores. */
  next(code: string, actor: Actor, now: number): Room {
    const room = this.getRoom(code);
    this.requireLeader(room, actor);
    const phase = room.game?.phase;
    if (phase === 'INTRO' || phase === 'REVEAL') room.game = skip(room.game!, now);
    else if (phase === 'FINAL') this.endGame(room);
    else throw new GameError('WRONG_PHASE', 'There is nothing to skip right now.');
    this.tick(room, now);
    room.phase = room.game?.phase ?? 'LOBBY';
    room.lastActivity = now;
    return room;
  }

  /** TV or VIP stops the game early and goes back to the lobby. */
  quit(code: string, actor: Actor, now: number): Room {
    const room = this.getRoom(code);
    this.requireLeader(room, actor);
    if (!room.game) throw new GameError('WRONG_PHASE', 'No game is running.');
    this.endGame(room);
    room.lastActivity = now;
    return room;
  }

  /**
   * Applies whatever the clock says should have happened (intro ends, a round closes at its
   * deadline or once every connected player is done, a reveal ends). Returns true if anything changed.
   */
  tick(room: Room, now: number): boolean {
    const before = room.game;
    if (!before) return false;
    const connected = room.players.filter((p) => p.connected).map((p) => p.id);
    room.game = tick(before, connected, now);
    room.phase = room.game.phase;
    return room.game !== before;
  }

  /** When `tick` next needs to run for this room, or undefined if nothing is pending. */
  nextDeadline(room: Room): number | undefined {
    return room.game && nextDeadline(room.game);
  }

  private endGame(room: Room) {
    room.game = undefined;
    room.phase = 'LOBBY';
  }

  private requireLeader(room: Room, actor: Actor) {
    if (actor.role === 'host') return;
    if (room.vipId !== actor.playerId) {
      throw new GameError('NOT_VIP', 'Only the 👑 player or the TV can do that.');
    }
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

  snapshot(room: Room, now: number): RoomSnapshot {
    return {
      code: room.code,
      phase: room.phase,
      hostConnected: room.hostConnected,
      selectedGame: room.selectedGame,
      game: room.game && gameView(room.game, now),
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

/** Hands a leaver's upcoming Category Clash turns to the first player still in the game. */
function reassignPicks(game: PartyGame, leaverId: string): PartyGame {
  const heir = game.playerIds[0];
  if (!heir) return game;
  let changed = false;
  const rounds = game.rounds.map((round, index) => {
    if (index <= game.index || round.kind !== 'question' || round.pick?.chooserId !== leaverId)
      return round;
    changed = true;
    return { ...round, pick: { ...round.pick, chooserId: heir } };
  });
  return changed ? { ...game, rounds } : game;
}
