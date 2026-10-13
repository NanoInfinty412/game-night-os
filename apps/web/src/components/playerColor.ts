const PLAYER_COLORS = [
  '#ff4f9a',
  '#ffd23f',
  '#3ee0d0',
  '#ff8a3d',
  '#a6e22e',
  '#9b7bff',
  '#5ab0ff',
  '#ff6b6b',
];

/** Stable colour per seat; wraps if there are ever more seats than colours. */
export function playerColor(seatIndex: number): string {
  return PLAYER_COLORS[seatIndex % PLAYER_COLORS.length]!;
}
