const AVATARS = ['🦊', '🐼', '🐸', '🐙', '🦄', '🐯', '🐵', '🐧'];

/** Friendly animal per seat. Players will pick their own in a later milestone. */
export function seatAvatar(seatIndex: number): string {
  return AVATARS[seatIndex % AVATARS.length]!;
}
