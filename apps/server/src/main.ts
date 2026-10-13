import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const app = await buildApp({
  logger: true,
  // Serves the built web app when `pnpm build` has produced it; in dev, Vite serves it instead.
  webDistDir: fileURLToPath(new URL('../../web/dist', import.meta.url)),
});

await app.listen({ port, host });
