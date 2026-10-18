import { expect, test, type Page } from '@playwright/test';
import { fillRoom, joinBots, type Bots } from './bots';
import { fits } from './helpers';

test('TV creates a room with a fresh code, QR code and empty seats', async ({ page }) => {
  await page.goto('/tv');
  await expect(page.getByTestId('room-code')).toHaveText(/^[A-HJ-NP-Z]{4}$/);
  await expect(page.getByTestId('join-qr')).toBeVisible();
  await expect(page.getByTestId('player-card')).toHaveCount(0);
  await expect(page.getByTestId('empty-seat')).toHaveCount(8);
  await expect(page.getByTestId('player-count')).toHaveText('0 / 8');
  await expect(page.getByText('Waiting for at least 2 players')).toBeVisible();
});

// Some Android TV browsers report a 960x540 viewport, so the TV must fit that too.
const TV_SIZES = [
  { width: 960, height: 540 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

for (const { width, height } of TV_SIZES) {
  test(`TV lobby with a full room fits ${width}x${height} without scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/tv');
    await expect(page.getByTestId('join-qr')).toBeVisible();
    const code = (await page.getByTestId('room-code').textContent())!;
    const disconnectBots = await fillRoom(code, [
      'Grandma',
      'Grandpa',
      'Mum',
      'Dad',
      'Ada',
      'Sam',
      'Big Mike',
      'Lou',
    ]);
    await expect(page.getByTestId('player-card')).toHaveCount(8);
    try {
      await fits(page);
    } finally {
      disconnectBots();
    }
  });
}

test('dev server proxies the API health check', async ({ request }) => {
  const response = await request.get('/health');
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ ok: true });
});

test('music starts on the first key press and the button turns it off and on', async ({ page }) => {
  await page.goto('/tv');
  const musicButton = page.getByRole('button', { name: /^Music (on|off)$/ });
  await expect(musicButton).toHaveAttribute('aria-pressed', 'false');

  await page.keyboard.press('Space');
  await expect(musicButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('now-playing')).toContainText('Lobby Bounce');

  await page.getByRole('button', { name: 'Next song' }).click();
  await expect(page.getByTestId('now-playing')).toContainText('Silly Parade');

  await musicButton.click();
  await expect(musicButton).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('now-playing')).toHaveCount(0);

  // Turning it off is remembered, so a reload stays quiet even after a key press.
  await page.reload();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Music off' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: 'Music off' }).click();
  await expect(page.getByRole('button', { name: 'Music on' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

const FAMILY = ['Grandma', 'Grandpa', 'Mum', 'Dad', 'Ada', 'Sam', 'Big Mike', 'Lou'];

/** Every bot plays the round in front of it, so all four kinds of round get shown. */
async function playRound(page: Page, bots: Bots) {
  const room = bots.room()!;
  const game = room.game!;
  const current = game.current;
  const round = game.round;
  const all = (event: string, payload: (i: number) => unknown) =>
    Promise.all(FAMILY.map((_, i) => bots.send(i, event, payload(i))));
  switch (current.kind) {
    case 'question': {
      if (current.picking) {
        await expect(page.getByTestId('tv-categories')).toBeVisible();
        await fits(page);
        const chooser = room.players.findIndex((p) => p.id === current.picking!.chooserId);
        await bots.send(chooser, 'game:action', { type: 'pick', round, option: 1 });
        await expect.poll(() => bots.room()?.game?.current).not.toHaveProperty('picking');
      }
      await expect(page.getByTestId('question-prompt')).toBeVisible();
      await fits(page);
      const choices = current.style === 'truefalse' ? 2 : 4;
      await all('game:action', (i) => ({ type: 'answer', round, choice: i % choices }));
      return;
    }
    case 'number': {
      await expect(page.getByTestId('question-prompt')).toBeVisible();
      await fits(page);
      const { min } = current.question!;
      await all('game:action', (i) => ({ type: 'guess', round, value: min + i }));
      return;
    }
    case 'reaction':
      await expect(page.getByTestId('reaction-light')).toHaveAttribute('data-status', 'go', {
        timeout: 10_000,
      });
      await fits(page);
      await all('game:action', () => ({ type: 'tap', round }));
      return;
    case 'mash':
      for (let tap = 0; tap < 6; tap++) {
        await all('game:action', () => ({ type: 'tap', round }));
        await page.waitForTimeout(60);
      }
      await expect(page.getByTestId('mash-lanes')).toBeVisible();
      await fits(page);
      return;
  }
}

for (const { width, height } of TV_SIZES) {
  test(`every Party Mix screen with 8 players fits ${width}x${height}`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width, height });
    await page.goto('/tv');
    const code = (await page.getByTestId('room-code').textContent())!;
    const bots = await joinBots(code, FAMILY);
    const phase = () => bots.room()?.game?.phase;
    try {
      expect((await bots.send(0, 'game:select', { gameId: 'party-mix' })).ok).toBe(true);
      expect((await bots.send(0, 'game:start')).ok).toBe(true);
      await expect.poll(() => bots.room()?.game?.totalRounds).toBe(12);
      for (let round = 0; round < 12; round++) {
        await expect(page.getByTestId('round-label')).toHaveText(`Round ${round + 1} of 12`);
        await expect(page.getByTestId('round-intro')).toBeVisible();
        if (round === 0) await fits(page);
        await bots.send(0, 'game:next');
        await expect.poll(phase).toBe('PLAY');
        await playRound(page, bots);
        await expect.poll(phase, { timeout: 15_000 }).toBe('REVEAL');
        await expect(page.getByTestId('score-strip')).toBeVisible();
        await fits(page);
        await bots.send(0, 'game:next');
      }
      await expect(page.getByTestId('final-title')).toBeVisible();
      await expect(page.getByTestId('podium-step')).toHaveCount(3);
      await fits(page);
    } finally {
      bots.disconnect();
    }
  });
}
