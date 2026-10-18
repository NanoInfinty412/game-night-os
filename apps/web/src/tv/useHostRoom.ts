import { useCallback, useEffect, useRef, useState } from 'react';
import type { HostSession, ProtocolError, RoomSnapshot } from '@gno/shared';
import { createSocket, request, type GameSocket } from '../net/socket';
import { load, save, session } from '../net/storage';
import { toLocalClock } from '../game/clock';

// Per browser tab, so a refresh keeps the room but a second TV tab gets its own.
const HOST_KEY = 'gno:host';

export type HostRoomState =
  | { status: 'connecting' }
  | { status: 'ready'; room: RoomSnapshot; connected: boolean }
  | { status: 'error'; message: string };

export type HostEvent = 'game:select' | 'game:start' | 'game:next' | 'game:quit';

/**
 * Creates (or after a refresh, resumes) this TV's room and keeps its live snapshot. `send` lets
 * the TV remote lead the game: choose, start, skip and quit.
 */
export function useHostRoom(): {
  state: HostRoomState;
  send: (event: HostEvent, payload?: unknown) => Promise<ProtocolError | undefined>;
} {
  const [state, setState] = useState<HostRoomState>({ status: 'connecting' });
  const socketRef = useRef<GameSocket>(undefined);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    async function openRoom() {
      const stored = load<HostSession>(session, HOST_KEY);
      if (stored) {
        const resumed = await request<HostSession>(socket, 'host:resume', {
          roomCode: stored.roomCode,
          token: stored.hostToken,
        });
        if (resumed.ok) return;
        save(session, HOST_KEY, undefined);
      }
      const created = await request<HostSession>(socket, 'host:create');
      if (created.ok) save(session, HOST_KEY, created.data);
      else setState({ status: 'error', message: created.error.message });
    }

    socket.on('connect', () => void openRoom());
    socket.on('disconnect', () =>
      setState((current) =>
        current.status === 'ready' ? { ...current, connected: false } : current,
      ),
    );
    socket.on('room:state', (room) =>
      setState({ status: 'ready', room: toLocalClock(room, Date.now()), connected: true }),
    );
    socket.on('room:closed', () => {
      save(session, HOST_KEY, undefined);
      void openRoom();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const send = useCallback(async (event: HostEvent, payload?: unknown) => {
    const socket = socketRef.current;
    if (!socket) return { code: 'INTERNAL_ERROR' as const, message: 'Still connecting…' };
    const result = await (payload === undefined
      ? request<null>(socket, event)
      : request<null>(socket, event, payload));
    return result.ok ? undefined : result.error;
  }, []);

  return { state, send };
}
