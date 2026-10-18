import { createReadStream, existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/roomManager.js';
import type {
  BuildOptions,
  ClientToServerEvents,
  PartyTiming,
  ServerToClientEvents,
} from '@gno/shared';
import { loadGameContent } from './game/questionPack.js';
import {
  DEFAULT_ROOM_SOCKET_OPTIONS,
  registerRoomSockets,
  type RoomSocketOptions,
  type SocketData,
} from './socket/roomSockets.js';

export interface AppOptions {
  /** Built web app to serve (production only). Skipped if the folder does not exist. */
  webDistDir?: string;
  logger?: boolean;
  rooms?: RoomManager;
  roomSockets?: Partial<RoomSocketOptions>;
  /** Round lengths and Trivia Chaos length; used when `rooms` is not given. */
  build?: Omit<BuildOptions, 'used'>;
  /** Intro and reveal lengths; used when `rooms` is not given. */
  timing?: Partial<PartyTiming>;
  /** Android TV app to offer at `/game-night-tv.apk`, so a TV can download it from this computer. */
  apkPath?: string;
}

export const APK_ROUTE = '/game-night-tv.apk';

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  app.get('/health', async () => ({ ok: true }));

  const apkPath = options.apkPath;
  app.get(APK_ROUTE, async (_request, reply) => {
    if (!apkPath || !existsSync(apkPath)) return reply.code(404).send({ error: 'Not found' });
    return reply
      .type('application/vnd.android.package-archive')
      .header('content-disposition', 'attachment; filename="game-night-tv.apk"')
      .send(createReadStream(apkPath));
  });

  // Same-origin only: in dev the Vite server proxies /socket.io, in production we serve the web app.
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(app.server, {
    serveClient: false,
  });
  const rooms =
    options.rooms ??
    new RoomManager({ content: loadGameContent(), build: options.build, timing: options.timing });
  const stopRoomSockets = registerRoomSockets(io, rooms, app.log, {
    ...DEFAULT_ROOM_SOCKET_OPTIONS,
    ...options.roomSockets,
  });
  app.addHook('preClose', (done) => {
    stopRoomSockets();
    // Open websockets would otherwise keep the HTTP server from closing.
    io.disconnectSockets(true);
    io.engine.close();
    done();
  });

  if (options.webDistDir && existsSync(options.webDistDir)) {
    await app.register(fastifyStatic, { root: options.webDistDir });
    // Client-side routes (/tv, /play) fall back to the SPA entry point.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/health')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  }

  return app;
}
