import { useEffect, useState } from 'react';
import type { HostSession, RoomSnapshot } from '@gno/shared';
import { createSocket, request } from '../net/socket';
import { load, save, session } from '../net/storage';

// Per browser tab, so a refresh keeps the room but a second TV tab gets its own.
const HOST_KEY = 'gno:host';

export type HostRoomState =
  | { status: 'connecting' }
  | { status: 'ready'; room: RoomSnapshot; connected: boolean }
  | { status: 'error'; message: string };

/** Creates (or after a refresh, resumes) this TV's room and keeps its live snapshot. */
export function useHostRoom(): HostRoomState {
  const [state, setState] = useState<HostRoomState>({ status: 'connecting' });

  useEffect(() => {
    const socket = createSocket();

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
    socket.on('room:state', (room) => setState({ status: 'ready', room, connected: true }));
    socket.on('room:closed', () => {
      save(session, HOST_KEY, undefined);
      void openRoom();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return state;
}
