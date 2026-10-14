import { io, type Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '@gno/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Connects to the game server on the same origin (Vite proxies /socket.io in dev). */
export function createSocket(): GameSocket {
  return io({ transports: ['websocket', 'polling'] });
}

const REQUEST_TIMEOUT_MS = 6000;

/** Sends a request and resolves with the server's acknowledgement, or a friendly timeout error. */
export function request<T>(
  socket: GameSocket,
  event: keyof ClientToServerEvents,
  ...args: unknown[]
): Promise<Ack<T>> {
  return new Promise((resolve) => {
    (socket.timeout(REQUEST_TIMEOUT_MS).emit as (...a: unknown[]) => void)(
      event,
      ...args,
      (timeoutError: Error | null, response: Ack<T>) => {
        if (timeoutError) {
          resolve({
            ok: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: "Can't reach the game right now. Is the TV computer on?",
            },
          });
        } else {
          resolve(response);
        }
      },
    );
  });
}
