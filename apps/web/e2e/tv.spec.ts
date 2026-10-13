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
