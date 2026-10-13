import { expect, test } from '@playwright/test';

test('room code from the QR link is prefilled', async ({ page }) => {
  await page.goto('/play?code=play');
  await expect(page.getByLabel('Room code')).toHaveValue('PLAY');
});

test('shows validation errors and does not join', async ({ page }) => {
  await page.goto('/play');
  await page.getByLabel('Room code').fill('AB');
  await page.getByRole('button', { name: 'Join game' }).click();
  await expect(page.getByText('Room codes are 4 letters')).toBeVisible();
  await expect(page.getByText('Enter a nickname')).toBeVisible();
  await expect(page.getByTestId('joined-heading')).toHaveCount(0);
});

test('valid code and nickname reach the waiting screen', async ({ page }) => {
  await page.goto('/play?code=PLAY');
  await page.getByLabel('Nickname').fill('  Ada  ');
  await page.getByRole('button', { name: 'Join game' }).click();
  await expect(page.getByTestId('joined-heading')).toHaveText("You're in, Ada!");
});

test('join screen has no horizontal scroll at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/play');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
