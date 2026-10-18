/** Room phases. Legal transitions are documented in docs/protocol.md. */
export const PHASES = ['LOBBY', 'INTRO', 'PLAY', 'REVEAL', 'FINAL', 'PAUSED'] as const;
export type Phase = (typeof PHASES)[number];
