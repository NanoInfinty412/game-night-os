import { readFileSync } from 'node:fs';
import { devices, expect, type Browser, type Page } from '@playwright/test';
import type { NumberPack, QuestionPack } from '@gno/shared';

function readPack<T>(name: string): T {
  return JSON.parse(
    readFileSync(new URL(`../../../content/packs/${name}.json`, import.meta.url), 'utf8'),
  ) as T;
}

const questions = ['family-classics', 'true-or-false', 'emoji-riddles'].flatMap(
  (name) => readPack<QuestionPack>(name).questions,
);
const numbers = readPack<NumberPack>('closest-number').questions;

/** The correct answer text for the prompt on screen (choices are shuffled per game). */
export function correctAnswer(prompt: string): string {
  const question = questions.find((q) => q.prompt === prompt);
  if (!question) throw new Error(`Unknown question: ${prompt}`);
  return question.choices[question.answer]!;
}

export function numberAnswer(prompt: string): number {
  const question = numbers.find((q) => q.prompt === prompt);
  if (!question) throw new Error(`Unknown number question: ${prompt}`);
  return question.answer;
}

export const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Opens a phone browser, follows the TV's QR link and joins. */
export async function joinFromPhone(browser: Browser, code: string, nickname: string) {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const phone = await context.newPage();
  await phone.goto(`/play?code=${code}`);
  await phone.getByLabel('Your name').fill(nickname);
  await phone.getByRole('button', { name: "Let's play!" }).click();
  await expect(phone.getByTestId('joined-heading')).toHaveText(`You're in, ${nickname}!`);
  return phone;
}

export async function openTv(browser: Browser, viewport = { width: 1920, height: 1080 }) {
  const context = await browser.newContext({ viewport });
  const tv = await context.newPage();
  await tv.goto('/tv');
  const code = (await tv.getByTestId('room-code').textContent())!;
  expect(code).toMatch(/^[A-Z]{4}$/);
  return { tv, code };
}

/** A TV with Ada (VIP) and Sam joined from phones, with `gameId` chosen on Ada's phone. */
export async function partyOf2(browser: Browser, gameId: string) {
  const { tv, code } = await openTv(browser);
  const ada = await joinFromPhone(browser, code, 'Ada');
  const sam = await joinFromPhone(browser, code, 'Sam');
  await ada.locator(`[data-testid="phone-game"][data-game="${gameId}"]`).click();
  await expect(tv.locator('[data-testid="game-card"][aria-pressed="true"]')).toHaveCount(1);
  await expect(sam.getByTestId('selected-game')).not.toHaveText('');
  await ada.getByTestId('start-game').click();
  return { tv, code, ada, sam };
}

/** The VIP skips the round's title card. */
export async function skipIntro(tv: Page, vip: Page) {
  await expect(tv.getByTestId('round-intro')).toBeVisible();
  await vip.getByTestId('vip-next').click();
  await expect(tv.getByTestId('round-intro')).toHaveCount(0);
}

export async function fits(page: Page) {
  const viewport = page.viewportSize()!;
  const size = await page.evaluate(() => {
    // The TV screen clips its overflow, so also check that nothing spills out of it.
    const main = document.querySelector('main')!;
    return {
      w: document.documentElement.scrollWidth,
      h: document.documentElement.scrollHeight,
      spill: main.scrollHeight - main.clientHeight,
    };
  });
  expect(size.w).toBeLessThanOrEqual(viewport.width);
  expect(size.h).toBeLessThanOrEqual(viewport.height);
  expect(size.spill, 'content spilling out of the screen').toBeLessThanOrEqual(1);
}
