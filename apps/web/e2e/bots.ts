import { io, type Socket } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3000';

export interface Bots {
  /** Sends an intent from one bot (0 is the VIP) and resolves with the acknowledgement. */
  send: (index: number, event: string, payload?: unknown) => Promise<{ ok: boolean }>;
  disconnect: () => void;
}

/** Joins the room with headless "phones" talking straight to the server. */
export async function joinBots(roomCode: string, nicknames: string[]): Promise<Bots> {
  const sockets: Socket[] = [];
  const disconnect = () => sockets.forEach((bot) => bot.disconnect());
  const send = async (index: number, event: string, payload?: unknown) => {
    const bot = sockets[index]!.timeout(5000);
    return (await (payload === undefined
      ? bot.emitWithAck(event)
      : bot.emitWithAck(event, payload))) as { ok: boolean };
  };
  try {
    for (const nickname of nicknames) {
      const bot = io(SERVER_URL, { transports: ['websocket'], forceNew: true });
      sockets.push(bot);
      const ack = await send(sockets.length - 1, 'player:join', { roomCode, nickname });
      if (!ack.ok) throw new Error(`Bot ${nickname} could not join: ${JSON.stringify(ack)}`);
    }
  } catch (error) {
    disconnect();
    throw error;
  }
  return { send, disconnect };
}

/** Joins the room with bots and returns a function that disconnects them. */
export async function fillRoom(roomCode: string, nicknames: string[]): Promise<() => void> {
  return (await joinBots(roomCode, nicknames)).disconnect;
}
