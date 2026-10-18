import type { ErrorCode } from '@gno/shared';

/** An expected, user-facing failure. Its message is safe to show on a phone or TV. */
export class GameError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}
