import { randomBytes, randomUUID } from 'node:crypto';
import {
  DEFAULT_TRIVIA_SETTINGS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  advance,
  isQuestionOver,
  nicknameSchema,
  removePlayer as removeFromGame,
  revealAnswer,
  shuffle,
  standings,
  startGame,
  submitAnswer,
  type AnswerRejection,
  type ErrorCode,
  type GameView,
  type Phase,
  type Question,
  type RoomSnapshot,
  type TriviaGame,
  type TriviaSettings,
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
  game: TriviaGame | undefined;
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
  questions?: Question[];
  trivia?: Partial<TriviaSettings>;
}

const REJECTIONS: Record<AnswerRejection, [ErrorCode, string]> = {
  WRONG_PHASE: ['WRONG_PHASE', 'Answers are closed for this question.'],
  WRONG_ROUND: ['WRONG_PHASE', 'That question is already over.'],
  NOT_A_PLAYER: ['NOT_IN_ROOM', 'You are not playing in this game.'],
  INVALID_CHOICE: ['INVALID_PAYLOAD', 'Pick one of the answers.'],
  ALREADY_ANSWERED: ['ALREADY_ANSWERED', 'You already locked in an answer!'],
  TOO_LATE: ['TOO_LATE', 'Time is up for this question.'],
};

const defaultToken = () => randomBytes(24).toString('base64url');

/**
 * Room membership rules. Knows nothing about sockets or timers: callers pass `now`
 * and decide when to call `removePlayer` or `sweepIdle`.
 */
export class RoomManager {
  private readonly store: RoomStore;
  private readonly random: () => number;
  private readonly newToken: () => string;
  private readonly questions: Question[];
  readonly trivia: TriviaSettings;

  constructor(options: RoomManagerOptions = {}) {
    this.store = options.store ?? new InMemoryRoomStore();
    this.random = options.random ?? Math.random;
    this.newToken = options.newToken ?? defaultToken;
    this.questions = options.questions ?? [];
    this.trivia = { ...DEFAULT_TRIVIA_SETTINGS, ...options.trivia };
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
    if (room.vipId === playerId) {
      const next = [...room.players].sort((a, b) => a.joinedAt - b.joinedAt || a.seat - b.seat)[0];
      room.vipId = next?.id;
    }
    room.lastActivity = now;
    return room;
  }

  /** VIP starts Trivia Chaos with everyone in the lobby. */
  startGame(code: string, playerId: string, now: number): Room {
    const room = this.getRoom(code);
    this.requireVip(room, playerId);
    if (room.phase !== 'LOBBY') throw new GameError('WRONG_PHASE', 'A game is already running.');
    if (room.players.filter((p) => p.connected).length < MIN_PLAYERS) {
      throw new GameError(
        'NOT_ENOUGH_PLAYERS',
        `You need at least ${MIN_PLAYERS} players to start.`,
      );
    }
    if (this.questions.length === 0) throw new Error('No trivia questions loaded');

    let fresh = this.questions.filter((q) => !room.usedQuestionIds.has(q.id));
    if (fresh.length < this.trivia.questionCount) {
      room.usedQuestionIds.clear();
      fresh = this.questions;
    }
    const picked = shuffle(fresh, this.random).slice(0, this.trivia.questionCount);
    for (const q of picked) room.usedQuestionIds.add(q.id);

    const playerIds = room.players.map((p) => p.id);
    room.game = startGame(playerIds, picked, this.trivia, now, this.random);
    room.phase = room.game.phase;
    room.lastActivity = now;
    return room;
  }

  answer(code: string, playerId: string, round: number, choice: number, now: number): Room {
    const room = this.getRoom(code);
    if (!room.game) throw new GameError('WRONG_PHASE', 'No question is open right now.');
    const result = submitAnswer(room.game, playerId, round, choice, now);
    if ('rejected' in result) {
      const [errorCode, message] = REJECTIONS[result.rejected];
      throw new GameError(errorCode, message);
    }
    room.game = result.game;
    room.lastActivity = now;
    this.tick(room, now);
    return room;
  }

  /** VIP skips the rest of a reveal, or returns everyone to the lobby after the final scores. */
  next(code: string, playerId: string, now: number): Room {
    const room = this.getRoom(code);
    this.requireVip(room, playerId);
    if (room.game?.phase === 'REVEAL') room.game = advance(room.game, now);
    else if (room.game?.phase === 'FINAL') this.endGame(room);
    else throw new GameError('WRONG_PHASE', 'There is nothing to skip right now.');
    room.phase = room.game?.phase ?? 'LOBBY';
    room.lastActivity = now;
    return room;
  }

  /**
   * Applies whatever the clock says should have happened: closes a question at its deadline
   * (or once every connected player answered) and ends a reveal. Returns true if anything changed.
   */
  tick(room: Room, now: number): boolean {
    const before = room.game;
    if (!before) return false;
    let game = before;
    const connected = room.players.filter((p) => p.connected).map((p) => p.id);
    if (isQuestionOver(game, connected, now)) game = revealAnswer(game, now);
    if (game.phase === 'REVEAL' && now >= game.revealEndsAt) game = advance(game, now);
    room.game = game;
    room.phase = game.phase;
    return game !== before;
  }

  /** When `tick` next needs to run for this room, or undefined if nothing is pending. */
  nextDeadline(room: Room): number | undefined {
    if (room.game?.phase === 'QUESTION') return room.game.deadline;
    if (room.game?.phase === 'REVEAL') return room.game.revealEndsAt;
    return undefined;
  }

  private endGame(room: Room) {
    room.game = undefined;
    room.phase = 'LOBBY';
  }

  private requireVip(room: Room, playerId: string) {
    if (room.vipId !== playerId) {
      throw new GameError('NOT_VIP', 'Only the 👑 player can do that.');
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

function gameView(game: TriviaGame, now: number): GameView {
  const { answer, ...question } = game.questions[game.round]!;
  return {
    round: game.round,
    totalRounds: game.questions.length,
    question,
    questionMs: game.settings.questionMs,
    deadline: game.deadline,
    revealEndsAt: game.revealEndsAt,
    serverNow: now,
    answeredIds: Object.keys(game.answers),
    scores: { ...game.scores },
    ...(game.phase === 'REVEAL' && { reveal: { answer, results: { ...game.results } } }),
    ...(game.phase === 'FINAL' && { standings: standings(game) }),
  };
}
