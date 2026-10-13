import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

export interface AppOptions {
  /** Built web app to serve (production only). Skipped if the folder does not exist. */
  webDistDir?: string;
  logger?: boolean;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  app.get('/health', async () => ({ ok: true }));

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
