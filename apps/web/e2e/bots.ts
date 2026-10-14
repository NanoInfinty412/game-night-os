import { io, type Socket } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3000';

/**
 * Joins the room with headless "phones" talking straight to the server.
 * Returns a function that disconnects them.
 */
export async function fillRoom(roomCode: string, nicknames: string[]): Promise<() => void> {
  const bots: Socket[] = [];
  const disconnect = () => bots.forEach((bot) => bot.disconnect());
  try {
    for (const nickname of nicknames) {
      const bot = io(SERVER_URL, { transports: ['websocket'], forceNew: true });
      bots.push(bot);
      const ack = (await bot.timeout(5000).emitWithAck('player:join', { roomCode, nickname })) as {
        ok: boolean;
      };
      if (!ack.ok) throw new Error(`Bot ${nickname} could not join: ${JSON.stringify(ack)}`);
    }
  } catch (error) {
    disconnect();
    throw error;
  }
  return disconnect;
}
