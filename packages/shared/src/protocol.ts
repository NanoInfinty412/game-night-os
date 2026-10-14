import { z } from 'zod';
import type { Phase } from './phases.js';
import { roomCodeSchema, type PublicPlayer } from './room.js';

/** Secret issued by the server to a TV (host) or phone (player) so it can resume after a refresh. */
export const sessionTokenSchema = z.string().min(16).max(128);

export const resumeRequestSchema = z.object({
  roomCode: roomCodeSchema,
  token: sessionTokenSchema,
});
export type ResumeRequest = z.infer<typeof resumeRequestSchema>;

export const ERROR_CODES = [
  'INVALID_PAYLOAD',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'NICKNAME_TAKEN',
  'SESSION_NOT_FOUND',
  'NOT_IN_ROOM',
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
}

export interface ServerToClientEvents {
  'room:state': (snapshot: RoomSnapshot) => void;
  /** The room this socket belonged to no longer exists (expired or closed). */
  'room:closed': () => void;
}
