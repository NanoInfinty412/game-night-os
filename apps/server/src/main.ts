import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

/** Optional overrides, e.g. QUESTION_SECONDS=5 for a quick playtest. */
function envNumber(name: string, scale = 1): number | undefined {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value * scale : undefined;
}
function defined<T extends object>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

const questionMs = envNumber('QUESTION_SECONDS', 1000);
const build = defined({
  triviaCount: envNumber('QUESTIONS_PER_GAME'),
  timings: questionMs ? { triviaMs: questionMs, emojiMs: questionMs } : undefined,
});
const timing = defined({ revealMs: envNumber('REVEAL_SECONDS', 1000) });

// Serves the built web app when `pnpm build` has produced it; in dev, Vite serves it instead.
const webDistDir = fileURLToPath(new URL('../../web/dist', import.meta.url));
const app = await buildApp({ logger: true, build, timing, webDistDir });
await app.listen({ port, host });

/** Addresses phones and TVs on the same Wi-Fi can use to reach this computer. */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((net) => net && net.family === 'IPv4' && !net.internal)
    .map((net) => net!.address);
}

const servingWeb = existsSync(webDistDir);
const webPort = servingWeb ? port : 5173;
const lines = lanAddresses().map((ip) => `   📺 TV:     http://${ip}:${webPort}/tv`);
console.log(
  [
    '',
    '🎉 Game Night is ready!',
    ...(lines.length ? lines : [`   📺 TV:     http://localhost:${webPort}/tv`]),
    '   📱 Phones: scan the QR code on the TV',
    servingWeb ? '' : '   (dev mode: the web app is served by Vite on port 5173)',
    '',
  ].join('\n'),
);
