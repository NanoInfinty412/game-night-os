import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /health', () => {
  it('returns ok', async () => {
    app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});

describe('unknown routes', () => {
  it('return 404 when no web build is served', async () => {
    app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/nope' });
    expect(response.statusCode).toBe(404);
  });
});

describe('serving the built web app', () => {
  it('falls back to index.html for client routes but keeps /health as JSON', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'gno-web-'));
    writeFileSync(join(dist, 'index.html'), '<title>Game Night OS</title>');
    app = await buildApp({ webDistDir: dist });

    const tv = await app.inject({ method: 'GET', url: '/tv' });
    expect(tv.statusCode).toBe(200);
    expect(tv.body).toContain('Game Night OS');

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.json()).toEqual({ ok: true });
  });
});
