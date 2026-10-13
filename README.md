# Game Night OS

A party-game platform: one screen hosts the game, everyone plays from their phone browser.

## Run it locally

Prerequisites: Node 22 LTS and Git. Then enable pnpm once with `corepack enable`.

```bash
pnpm install
pnpm dev
```

- TV / host screen: open `http://localhost:5173/tv`
- Phone: on the same Wi-Fi, open `http://<this computer's LAN IP>:5173/play` or scan the QR code on the TV.
  On Windows, find the IP with `ipconfig` and allow Node through the firewall on private networks if asked.
  The QR code uses the address the TV page was opened with, so open `/tv` via the LAN IP (not `localhost`) when testing with phones.

Milestone 1 status: screens use sample data; real rooms arrive in milestone 2.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

`pnpm test:e2e` needs Playwright's Chromium once: `pnpm --filter @gno/web exec playwright install chromium`.
