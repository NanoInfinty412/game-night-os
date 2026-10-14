import { devices, expect, test, type Browser, type Page } from '@playwright/test';

/** Opens a phone browser, follows the TV's QR link and joins. */
async function joinFromPhone(browser: Browser, code: string, nickname: string): Promise<Page> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const phone = await context.newPage();
  await phone.goto(`/play?code=${code}`);
  await phone.getByLabel('Your name').fill(nickname);
  await phone.getByRole('button', { name: "Let's play!" }).click();
  await expect(phone.getByTestId('joined-heading')).toHaveText(`You're in, ${nickname}!`);
  return phone;
}

async function openTv(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await context.newPage();
  await tv.goto('/tv');
  const code = (await tv.getByTestId('room-code').textContent())!;
  expect(code).toMatch(/^[A-Z]{4}$/);
  return { tv, code };
}

const cardNames = (tv: Page) => tv.getByTestId('player-card').locator('span.truncate');

test('two phones join the TV lobby and everyone stays in sync', async ({ browser }) => {
  const { tv, code } = await openTv(browser);

  const ada = await joinFromPhone(browser, code, 'Ada');
  await expect(cardNames(tv)).toHaveText(['Ada']);
  await expect(tv.getByText('Waiting for at least 2 players')).toBeVisible();
  await expect(ada.getByTestId('vip-note')).toContainText("You're the VIP");

  const sam = await joinFromPhone(browser, code, 'Sam');
  await expect(cardNames(tv)).toHaveText(['Ada', 'Sam']);
  await expect(tv.getByTestId('player-count')).toHaveText('2 / 8');
  await expect(tv.getByText('Ada starts the fun from their phone!')).toBeVisible();
  await expect(ada.getByTestId('other-players')).toContainText('Sam');
  await expect(sam.getByTestId('other-players')).toContainText('Ada');
  await expect(sam.getByTestId('vip-note')).toHaveCount(0);
});

test('a taken name is rejected on the phone', async ({ browser }) => {
  const { code } = await openTv(browser);
  await joinFromPhone(browser, code, 'Ada');

  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const phone = await context.newPage();
  await phone.goto(`/play?code=${code}`);
  await phone.getByLabel('Your name').fill('ADA');
  await phone.getByRole('button', { name: "Let's play!" }).click();
  await expect(phone.getByText('Someone is already called ADA')).toBeVisible();
});

test('refreshing a phone keeps its seat; leaving frees it', async ({ browser }) => {
  const { tv, code } = await openTv(browser);
  const ada = await joinFromPhone(browser, code, 'Ada');
  const sam = await joinFromPhone(browser, code, 'Sam');

  await ada.reload();
  await expect(ada.getByTestId('joined-heading')).toHaveText("You're in, Ada!");
  await expect(ada.getByTestId('vip-note')).toBeVisible();
  await expect(cardNames(tv)).toHaveText(['Ada', 'Sam']);
  await expect(tv.locator('[data-connected="false"]')).toHaveCount(0);

  await sam.getByRole('button', { name: 'Leave room' }).click();
  await expect(sam.getByLabel('Your name')).toBeVisible();
  await expect(cardNames(tv)).toHaveText(['Ada']);
});

test('a closed phone shows as reconnecting on the TV, then comes back', async ({ browser }) => {
  const { tv, code } = await openTv(browser);
  const ada = await joinFromPhone(browser, code, 'Ada');
  const url = ada.url();
  const storage = await ada.context().storageState();

  await ada.close();
  await expect(tv.getByText('reconnecting…')).toBeVisible();

  const reopened = await (
    await browser.newContext({ ...devices['Pixel 7'], storageState: storage })
  ).newPage();
  await reopened.goto(url);
  await expect(reopened.getByTestId('joined-heading')).toHaveText("You're in, Ada!");
  await expect(tv.getByText('reconnecting…')).toHaveCount(0);
});

test('refreshing the TV keeps the same room and players', async ({ browser }) => {
  const { tv, code } = await openTv(browser);
  await joinFromPhone(browser, code, 'Ada');
  await tv.reload();
  await expect(tv.getByTestId('room-code')).toHaveText(code);
  await expect(cardNames(tv)).toHaveText(['Ada']);
});
