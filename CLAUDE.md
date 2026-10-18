# Game Night OS

Party-game platform: a TV/shared browser shows the game (`/tv`), phones are controllers (`/play`).
Eight games (the Party Pack: Party Mix, Trivia Chaos, Category Clash, Lightning Round, Quick Draw,
Tap Frenzy, Closest Wins, Emoji Riddles). Protocol, phases and events: `docs/protocol.md`.
Playtesting on Windows + Android TV: `docs/PLAYTEST.md`.

## Layout

- `apps/web` React + Vite + Tailwind v4 + React Router. `src/tv`, `src/play`, `src/components`, `e2e/` (Playwright).
- `apps/server` Fastify + Socket.IO. `buildApp()` in `src/app.ts` is what tests use. Room rules live in `src/rooms/roomManager.ts` (no sockets or timers); socket wiring, grace timers and sweeping in `src/socket/roomSockets.ts`.
- `packages/shared` Zod schemas, protocol types (`protocol.ts`), and the pure party engine (`src/game`: `engine.ts` rounds and scoring, `catalog.ts` games and playlists, `view.ts` what screens may see). Imported as `@gno/shared`.
- `content/packs` question packs (JSON, validated by `questionPackSchema` / `numberPackSchema`; loaded by `apps/server/src/game/questionPack.ts`). Questions must be original, accurate and kid-safe.
- `apps/android-tv` plain-Java WebView app that finds the game PC on the LAN and shows `/tv`. Built only in CI (`.github/workflows/android-tv.yml`, artifact `game-night-tv-apk`). `downloads/game-night-tv.apk` is served at `/game-night-tv.apk`.
- `start-game.cmd` one-click Windows install + build + start.

## Commands

```bash
pnpm install
pnpm dev            # server :3000 + web :5173 (LAN-visible); web proxies /health and /socket.io
pnpm test           # Vitest, all workspaces
pnpm test:e2e       # Playwright; starts both dev servers itself
pnpm lint && pnpm typecheck && pnpm format:check
pnpm build && pnpm start   # production: server serves apps/web/dist
```

## Rules

- The server is authoritative for membership, phases, timers, answers and scores. Clients send intents only.
- Validate every client message with a schema from `packages/shared`. Never trust client ids, scores or phases.
- Keep game logic as pure functions (`(state, action, now) => state`), separate from sockets and React.
- Timers are absolute server deadlines; clients only render countdowns.
- No databases, accounts, payments, analytics or AI dependencies in the MVP. Ask before adding a dependency.
- No secrets in client code or in the repo.
- TV screen must stay usable with arrow keys + Enter (Android TV remote; mark focusable controls `data-nav`, see `useSpatialNav`) and fit 960x540, 1280x720 and 1920x1080 without scrolling or spilling. Size TV elements in rem: `useTvScale` scales rem with screen height.
- Phone screens must work at 360px wide.
- Family friendly: playful, kid-safe wording and visuals; no scary or mature content in UI, questions or sounds.
- Music and sound effects are original and synthesized with the Web Audio API (`apps/web/src/audio`): no audio files, no licensed songs. New songs go in `songs.ts`.
- Decorative animation must respect `prefers-reduced-motion` (handled globally in `index.css`).

## Definition of done

1. `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` all pass locally and in GitHub Actions CI.
2. New behaviour has tests at the lowest layer that can prove it (engine > server integration > e2e).
3. The report lists commands run, what passed, and anything not verified.
4. `docs/protocol.md` is updated when events, phases or payloads change.
