import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

/** Optional overrides, e.g. QUESTION_SECONDS=5 for a quick playtest. */
function envNumber(name: string, scale = 1): number | undefined {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value * scale : undefined;
}
const trivia = Object.fromEntries(
  Object.entries({
    questionCount: envNumber('QUESTIONS_PER_GAME'),
    questionMs: envNumber('QUESTION_SECONDS', 1000),
    revealMs: envNumber('REVEAL_SECONDS', 1000),
  }).filter(([, value]) => value !== undefined),
);

const app = await buildApp({
  logger: true,
  trivia,
  // Serves the built web app when `pnpm build` has produced it; in dev, Vite serves it instead.
  webDistDir: fileURLToPath(new URL('../../web/dist', import.meta.url)),
});

await app.listen({ port, host });
