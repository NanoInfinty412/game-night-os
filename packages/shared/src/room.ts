import { z } from 'zod';

/** Letters used in room codes. Excludes I and O, which read as 1 and 0 on a TV. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const NICKNAME_MAX_LENGTH = 16;

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`), {
    message: `Room codes are ${ROOM_CODE_LENGTH} letters`,
  });

export const nicknameSchema = z
  .string()
  .trim()
  .min(1, { message: 'Enter a nickname' })
  .max(NICKNAME_MAX_LENGTH, { message: `Nicknames are at most ${NICKNAME_MAX_LENGTH} characters` });

export const joinRequestSchema = z.object({
  roomCode: roomCodeSchema,
  nickname: nicknameSchema,
});

export type JoinRequest = z.infer<typeof joinRequestSchema>;

/** What every screen is allowed to know about a player. */
export interface PublicPlayer {
  id: string;
  nickname: string;
  isVip: boolean;
  connected: boolean;
}
