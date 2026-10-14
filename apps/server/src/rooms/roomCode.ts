import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@gno/shared';

// Four-letter words we never want shown on a family TV.
const BLOCKED_CODES = new Set([
  'ANUS',
  'ARSE',
  'BUTT',
  'CRAP',
  'CUNT',
  'DAMN',
  'DICK',
  'DUMB',
  'FART',
  'FUCK',
  'FUKK',
  'HELL',
  'JERK',
  'KILL',
  'NAZI',
  'PAKY',
  'PISS',
  'POOP',
  'PORN',
  'PUKE',
  'RAPE',
  'SEXY',
  'SHAG',
  'SHIT',
  'SLUT',
  'SMUT',
  'SUCK',
  'TURD',
  'TWAT',
  'WANK',
  'DEAD',
  'DRUG',
  'GUNS',
  'HATE',
]);

export function isBlockedCode(code: string): boolean {
  return BLOCKED_CODES.has(code);
}

/**
 * Returns a random room code not currently in use and not on the blocklist.
 * `random` returns a float in [0, 1); injectable so tests are deterministic.
 */
export function generateRoomCode(
  isTaken: (code: string) => boolean,
  random: () => number = Math.random,
): string {
  // 24^4 = 331,776 codes; with at most a few hundred live rooms a free code is found almost immediately.
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
    }
    if (!isTaken(code) && !isBlockedCode(code)) return code;
  }
  throw new Error('Could not find a free room code');
}
