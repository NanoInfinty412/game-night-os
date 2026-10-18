import { useCallback, useEffect, useRef, useState } from 'react';
import type { JoinRequest, PlayerSession, ProtocolError, RoomSnapshot } from '@gno/shared';
import { createSocket, request, type GameSocket } from '../net/socket';
import { load, local, save } from '../net/storage';
import { toLocalClock } from '../game/clock';

// Survives a phone refresh or the browser being backgrounded.
const PLAYER_KEY = 'gno:player';

export type PlayerState =
  | { status: 'connecting' }
  | { status: 'form'; notice?: string }
  | {
      status: 'lobby';
      session: PlayerSession;
      room: RoomSnapshot | undefined;
      connected: boolean;
      justJoined: boolean;
    };

/** The phone's seat in a room: join, resume after refresh or reconnect, and leave. */
export function usePlayerSession(codeFromLink: string | undefined) {
  const [state, setState] = useState<PlayerState>({ status: 'connecting' });
  const socketRef = useRef<GameSocket>(undefined);
  // The server broadcasts the room before it acknowledges a join, so keep the latest snapshot.
  const latestRoom = useRef<RoomSnapshot>(undefined);
  const roomFor = (code: string) =>
    latestRoom.current?.code === code ? latestRoom.current : undefined;

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    async function resume() {
      const stored = load<PlayerSession>(local, PLAYER_KEY);
      // A QR link to a different room means the player wants that room instead.
      if (!stored || (codeFromLink && codeFromLink !== stored.roomCode)) {
        setState((s) => (s.status === 'connecting' ? { status: 'form' } : s));
        return;
      }
      const result = await request<PlayerSession>(socket, 'player:resume', {
        roomCode: stored.roomCode,
        token: stored.token,
      });
      if (result.ok) {
        setState((s) => ({
          status: 'lobby',
          session: result.data,
          room: roomFor(result.data.roomCode) ?? (s.status === 'lobby' ? s.room : undefined),
          connected: true,
          justJoined: false,
        }));
      } else {
        save(local, PLAYER_KEY, undefined);
        setState({ status: 'form', notice: 'That game has ended. Join a new one!' });
      }
    }

    socket.on('connect', () => void resume());
    socket.on('disconnect', () =>
      setState((s) => (s.status === 'lobby' ? { ...s, connected: false } : s)),
    );
    socket.on('room:state', (serverRoom) => {
      const room = toLocalClock(serverRoom, Date.now());
      latestRoom.current = room;
      setState((s) => {
        if (s.status !== 'lobby' || room.code !== s.session.roomCode) return s;
        if (!room.players.some((p) => p.id === s.session.playerId)) {
          save(local, PLAYER_KEY, undefined);
          return { status: 'form', notice: 'You left the room.' };
        }
        return { ...s, room, connected: true };
      });
    });
    socket.on('room:closed', () => {
      save(local, PLAYER_KEY, undefined);
      setState({ status: 'form', notice: 'That game has ended. Join a new one!' });
    });

    return () => {
      socket.disconnect();
    };
  }, [codeFromLink]);

  const join = useCallback(async (joinRequest: JoinRequest): Promise<ProtocolError | undefined> => {
    const socket = socketRef.current;
    if (!socket)
      return { code: 'INTERNAL_ERROR', message: 'Still connecting, try again in a second.' };
    const result = await request<PlayerSession>(socket, 'player:join', joinRequest);
    if (!result.ok) return result.error;
    save(local, PLAYER_KEY, result.data);
    setState({
      status: 'lobby',
      session: result.data,
      room: roomFor(result.data.roomCode),
      connected: true,
      justJoined: true,
    });
    return undefined;
  }, []);

  const leave = useCallback(async () => {
    const socket = socketRef.current;
    if (socket) await request(socket, 'player:leave');
    save(local, PLAYER_KEY, undefined);
    setState({ status: 'form' });
  }, []);

  /** Sends a game intent (start, answer, next); resolves with an error the screen can show. */
  const act = useCallback(
    async (
      event: 'game:start' | 'game:answer' | 'game:next',
      payload?: unknown,
    ): Promise<ProtocolError | undefined> => {
      const socket = socketRef.current;
      if (!socket) return { code: 'INTERNAL_ERROR', message: 'Still connecting…' };
      const result = await (payload === undefined
        ? request<null>(socket, event)
        : request<null>(socket, event, payload));
      return result.ok ? undefined : result.error;
    },
    [],
  );

  return { state, join, leave, act };
}
