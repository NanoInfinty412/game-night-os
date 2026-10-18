import { expect, test } from '@playwright/test';

test('room code from the QR link is prefilled', async ({ page }) => {
  await page.goto('/play?code=play');
  await expect(page.getByLabel('Room code')).toHaveValue('PLAY');
});

test('shows validation errors without contacting a room', async ({ page }) => {
  await page.goto('/play');
  await page.getByLabel('Room code').fill('AB');
  await page.getByRole('button', { name: "Let's play!" }).click();
  await expect(page.getByText('Room codes are 4 letters')).toBeVisible();
  await expect(page.getByText('Enter a nickname')).toBeVisible();
  await expect(page.getByTestId('joined-heading')).toHaveCount(0);
});

test('an unknown room code gets a friendly error', async ({ page }) => {
  await page.goto('/play?code=ZZZZ');
  await page.getByLabel('Your name').fill('Ada');
  await page.getByRole('button', { name: "Let's play!" }).click();
  await expect(page.getByText('No room with code ZZZZ')).toBeVisible();
});

test('join screen has no horizontal scroll at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/play');
  await expect(page.getByLabel('Room code')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
