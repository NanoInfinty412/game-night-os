import { expect, test } from '@playwright/test';
import { fillRoom, joinBots } from './bots';

test('TV creates a room with a fresh code, QR code and empty seats', async ({ page }) => {
  await page.goto('/tv');
  await expect(page.getByTestId('room-code')).toHaveText(/^[A-HJ-NP-Z]{4}$/);
  await expect(page.getByTestId('join-qr')).toBeVisible();
  await expect(page.getByTestId('player-card')).toHaveCount(0);
  await expect(page.getByTestId('empty-seat')).toHaveCount(8);
  await expect(page.getByTestId('player-count')).toHaveText('0 / 8');
  await expect(page.getByText('Waiting for at least 2 players')).toBeVisible();
});

for (const { width, height } of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
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
    const size = await page.evaluate(() => ({
      w: document.documentElement.scrollWidth,
      h: document.documentElement.scrollHeight,
    }));
    disconnectBots();
    expect(size.w).toBeLessThanOrEqual(width);
    expect(size.h).toBeLessThanOrEqual(height);
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

for (const { width, height } of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  test(`TV game screens with 8 players fit ${width}x${height}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height });
    await page.goto('/tv');
    const code = (await page.getByTestId('room-code').textContent())!;
    const bots = await joinBots(code, FAMILY);
    const fits = async () => {
      const size = await page.evaluate(() => ({
        w: document.documentElement.scrollWidth,
        h: document.documentElement.scrollHeight,
      }));
      expect(size.w).toBeLessThanOrEqual(width);
      expect(size.h).toBeLessThanOrEqual(height);
    };
    try {
      expect((await bots.send(0, 'game:start')).ok).toBe(true);
      await expect(page.getByTestId('question-prompt')).toBeVisible();
      await expect(page.getByTestId('countdown')).toBeVisible();
      await fits();

      for (let round = 0; round < 10; round++) {
        await expect(page.getByTestId('round-label')).toHaveText(`Question ${round + 1} of 10`);
        await Promise.all(
          FAMILY.map((_, i) => bots.send(i, 'game:answer', { round, choice: i % 4 })),
        );
        await expect(page.locator('[data-correct="true"]')).toHaveCount(1);
        if (round === 0) await fits();
        await bots.send(0, 'game:next');
      }
      await expect(page.getByTestId('final-title')).toBeVisible();
      await expect(page.getByTestId('podium-step')).toHaveCount(3);
      await fits();
    } finally {
      bots.disconnect();
    }
  });
}
