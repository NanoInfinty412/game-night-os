import { z } from 'zod';
import type { Phase } from './phases.js';
import { roomCodeSchema, type PublicPlayer } from './room.js';
import { MAX_CHOICES } from './game/content.js';
import { gameIdSchema, type GameId } from './game/catalog.js';
import type { GameView } from './game/view.js';

/** Secret issued by the server to a TV (host) or phone (player) so it can resume after a refresh. */
export const sessionTokenSchema = z.string().min(16).max(128);

export const resumeRequestSchema = z.object({
  roomCode: roomCodeSchema,
  token: sessionTokenSchema,
});
export type ResumeRequest = z.infer<typeof resumeRequestSchema>;

const roundSchema = z.number().int().min(0).max(999);

/**
 * What a phone can do during a round. `round` is the 0-based round it is meant for, so a slow tap
 * can't land on the next round.
 */
export const playerActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('answer'),
    round: roundSchema,
    choice: z
      .number()
      .int()
      .min(0)
      .max(MAX_CHOICES - 1),
  }),
  z.object({
    type: z.literal('guess'),
    round: roundSchema,
    value: z.number().int().min(-1_000_000).max(1_000_000),
  }),
  z.object({ type: z.literal('tap'), round: roundSchema }),
  z.object({ type: z.literal('pick'), round: roundSchema, option: z.number().int().min(0).max(9) }),
]);
export type PlayerActionRequest = z.infer<typeof playerActionSchema>;

export const selectGameSchema = z.object({ gameId: gameIdSchema });

export const ERROR_CODES = [
  'INVALID_PAYLOAD',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'NICKNAME_TAKEN',
  'SESSION_NOT_FOUND',
  'NOT_IN_ROOM',
  'NOT_VIP',
  'NOT_YOUR_PICK',
  'NOT_ENOUGH_PLAYERS',
  'WRONG_PHASE',
  'ALREADY_ANSWERED',
  'TOO_LATE',
  'TOO_FAST',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ProtocolError {
  code: ErrorCode;
  message: string;
}

/** Every request gets exactly one acknowledgement. */
export type Ack<T> = { ok: true; data: T } | { ok: false; error: ProtocolError };
export type AckCallback<T> = (response: Ack<T>) => void;

/** Snapshot broadcast to every screen in a room after any change. */
export interface RoomSnapshot {
  code: string;
  phase: Phase;
  players: PublicPlayer[];
  hostConnected: boolean;
  /** The game the lobby has chosen (VIP phone or TV remote). */
  selectedGame: GameId;
  /** Present while a game runs (INTRO, PLAY, REVEAL, FINAL). */
  game?: GameView;
}

export interface HostSession {
  roomCode: string;
  hostToken: string;
}

export interface PlayerSession {
  roomCode: string;
  playerId: string;
  token: string;
}

/**
 * Socket.IO event maps. Client payloads are typed `unknown` on purpose: the server validates
 * every one with the schemas above before using it.
 */
export interface ClientToServerEvents {
  'host:create': (ack: AckCallback<HostSession>) => void;
  'host:resume': (payload: unknown, ack: AckCallback<HostSession>) => void;
  'player:join': (payload: unknown, ack: AckCallback<PlayerSession>) => void;
  'player:resume': (payload: unknown, ack: AckCallback<PlayerSession>) => void;
  'player:leave': (ack: AckCallback<null>) => void;
  /** VIP or TV: choose which game to play next. */
  'game:select': (payload: unknown, ack: AckCallback<null>) => void;
  /** VIP or TV: start the chosen game from the lobby. */
  'game:start': (ack: AckCallback<null>) => void;
  /** Player: answer, guess, tap or pick (`playerActionSchema`). */
  'game:action': (payload: unknown, ack: AckCallback<null>) => void;
  /** VIP or TV: skip an intro or reveal, or go back to the lobby from the final scores. */
  'game:next': (ack: AckCallback<null>) => void;
  /** VIP or TV: stop the game and go back to the lobby. */
  'game:quit': (ack: AckCallback<null>) => void;
}

export interface ServerToClientEvents {
  'room:state': (snapshot: RoomSnapshot) => void;
  /** The room this socket belonged to no longer exists (expired or closed). */
  'room:closed': () => void;
}
