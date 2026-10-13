import { expect, test } from '@playwright/test';

test('TV lobby shows room code, QR code and player seats', async ({ page }) => {
  await page.goto('/tv');
  await expect(page.getByTestId('room-code')).toHaveText('PLAY');
  await expect(page.getByTestId('join-qr')).toBeVisible();
  await expect(page.getByTestId('player-card')).toHaveCount(3);
  await expect(page.getByTestId('empty-seat')).toHaveCount(5);
  await expect(page.getByTestId('player-count')).toHaveText('3 / 8');
});

for (const { width, height } of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  test(`TV lobby fits ${width}x${height} without scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/tv');
    await expect(page.getByTestId('join-qr')).toBeVisible();
    const size = await page.evaluate(() => ({
      w: document.documentElement.scrollWidth,
      h: document.documentElement.scrollHeight,
    }));
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
