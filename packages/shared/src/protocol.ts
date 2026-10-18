import { z } from 'zod';
import type { Phase } from './phases.js';
import { roomCodeSchema, type PublicPlayer } from './room.js';
import { CHOICES_PER_QUESTION } from './trivia/questions.js';

/** Secret issued by the server to a TV (host) or phone (player) so it can resume after a refresh. */
export const sessionTokenSchema = z.string().min(16).max(128);

export const resumeRequestSchema = z.object({
  roomCode: roomCodeSchema,
  token: sessionTokenSchema,
});
export type ResumeRequest = z.infer<typeof resumeRequestSchema>;

export const answerRequestSchema = z.object({
  /** 0-based round the answer is for, so a slow tap can't land on the next question. */
  round: z.number().int().min(0).max(999),
  choice: z
    .number()
    .int()
    .min(0)
    .max(CHOICES_PER_QUESTION - 1),
});
export type AnswerRequest = z.infer<typeof answerRequestSchema>;

export const ERROR_CODES = [
  'INVALID_PAYLOAD',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'NICKNAME_TAKEN',
  'SESSION_NOT_FOUND',
  'NOT_IN_ROOM',
  'NOT_VIP',
  'NOT_ENOUGH_PLAYERS',
  'WRONG_PHASE',
  'ALREADY_ANSWERED',
  'TOO_LATE',
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

/** A question as screens see it: never includes the answer. */
export interface PublicQuestion {
  id: string;
  category: string;
  prompt: string;
  choices: string[];
}

export interface PlayerResult {
  /** Choice index, or null when the player did not answer in time. */
  choice: number | null;
  points: number;
}

export interface Standing {
  playerId: string;
  score: number;
  /** 1 = first; tied scores share a place. */
  place: number;
}

/** The running Trivia Chaos game. Present in QUESTION, REVEAL and FINAL. */
export interface GameView {
  /** 0-based index of the current question. */
  round: number;
  totalRounds: number;
  question: PublicQuestion;
  questionMs: number;
  /** Absolute server times in milliseconds. Clients only render countdowns from them. */
  deadline: number;
  revealEndsAt: number;
  /** Server clock when this snapshot was sent, so clients can correct for clock drift. */
  serverNow: number;
  /** Who has locked in an answer this round (not what they chose). */
  answeredIds: string[];
  scores: Record<string, number>;
  /** Only once the question has closed. */
  reveal?: { answer: number; results: Record<string, PlayerResult> };
  /** Only in FINAL. */
  standings?: Standing[];
}

/** Snapshot broadcast to every screen in a room after any change. */
export interface RoomSnapshot {
  code: string;
  phase: Phase;
  players: PublicPlayer[];
  hostConnected: boolean;
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
  /** VIP only: start a game from the lobby. */
  'game:start': (ack: AckCallback<null>) => void;
  'game:answer': (payload: unknown, ack: AckCallback<null>) => void;
  /** VIP only: skip the rest of a reveal, or go back to the lobby from the final scores. */
  'game:next': (ack: AckCallback<null>) => void;
}

export interface ServerToClientEvents {
  'room:state': (snapshot: RoomSnapshot) => void;
  /** The room this socket belonged to no longer exists (expired or closed). */
  'room:closed': () => void;
}
