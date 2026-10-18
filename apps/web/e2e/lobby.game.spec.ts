import { readFileSync } from 'node:fs';
import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import type { QuestionPack } from '@gno/shared';

const pack = JSON.parse(
  readFileSync(new URL('../../../content/packs/family-classics.json', import.meta.url), 'utf8'),
) as QuestionPack;

/** The correct answer text for the prompt on screen (choices are shuffled per game). */
function correctAnswer(prompt: string): string {
  const question = pack.questions.find((q) => q.prompt === prompt);
  if (!question) throw new Error(`Unknown question: ${prompt}`);
  return question.choices[question.answer]!;
}

async function joinFromPhone(browser: Browser, code: string, nickname: string): Promise<Page> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const phone = await context.newPage();
  await phone.goto(`/play?code=${code}`);
  await phone.getByLabel('Your name').fill(nickname);
  await phone.getByRole('button', { name: "Let's play!" }).click();
  await expect(phone.getByTestId('joined-heading')).toHaveText(`You're in, ${nickname}!`);
  return phone;
}

test('a TV and two phones play a whole game of Trivia Chaos', async ({ browser }) => {
  test.setTimeout(120_000);
  const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvContext.newPage();
  await tv.goto('/tv');
  const code = (await tv.getByTestId('room-code').textContent())!;

  const ada = await joinFromPhone(browser, code, 'Ada');
  await expect(ada.getByTestId('start-game')).toBeDisabled();
  const sam = await joinFromPhone(browser, code, 'Sam');
  await expect(sam.getByTestId('start-game')).toHaveCount(0);
  await expect(sam.getByText('Waiting for the 👑 VIP')).toBeVisible();

  await ada.getByTestId('start-game').click();
  await expect(tv.getByTestId('round-label')).toHaveText('Question 1 of 10');

  for (let round = 1; round <= 10; round++) {
    await expect(tv.getByTestId('round-label')).toHaveText(`Question ${round} of 10`);
    await expect(ada.getByTestId('answer-button')).toHaveCount(4);
    const prompt = (await tv.getByTestId('question-prompt').textContent())!;
    const right = correctAnswer(prompt);

    // Ada always knows it; Sam always picks a wrong one.
    await ada.getByTestId('answer-button').filter({ hasText: right }).first().click();
    await expect(ada.getByTestId('locked-in')).toBeVisible();
    await expect(tv.locator('[data-testid="tv-player"][data-answered="true"]')).toHaveCount(1);
    const wrongButtons = sam.getByTestId('answer-button').filter({ hasNotText: right });
    await wrongButtons.first().click();

    // Everyone answered, so the reveal comes straight away.
    await expect(tv.locator('[data-testid="tv-choice"][data-correct="true"]')).toHaveText(
      new RegExp(right.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
    await expect(ada.getByTestId('round-result')).toHaveAttribute('data-correct', 'true');
    await expect(sam.getByTestId('round-result')).toHaveAttribute('data-correct', 'false');
    await expect(sam.getByTestId('vip-next')).toHaveCount(0);
    await ada.getByTestId('vip-next').click();
  }

  await expect(tv.getByTestId('final-title')).toHaveText('🏆 Ada wins!');
  await expect(ada.getByTestId('final-place')).toHaveText('You came 1st!');
  await expect(sam.getByTestId('final-place')).toHaveText('You came 2nd!');
  await expect(sam.getByTestId('my-score')).toHaveText('⭐ 0');

  // Play again returns everyone to the lobby.
  await ada.getByTestId('vip-next').click();
  await expect(tv.getByTestId('room-code')).toHaveText(code);
  await expect(ada.getByTestId('start-game')).toBeEnabled();
  await expect(sam.getByTestId('joined-heading')).toHaveText("You're in, Sam!");
});

test('a refreshed phone mid-question stays locked in and keeps playing', async ({ browser }) => {
  const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const tv = await tvContext.newPage();
  await tv.goto('/tv');
  const code = (await tv.getByTestId('room-code').textContent())!;
  const ada = await joinFromPhone(browser, code, 'Ada');
  const sam = await joinFromPhone(browser, code, 'Sam');
  await ada.getByTestId('start-game').click();

  await sam.getByTestId('answer-button').first().click();
  await sam.reload();
  await expect(sam.getByTestId('locked-in')).toBeVisible();
  await ada.getByTestId('answer-button').first().click();
  await expect(sam.getByTestId('round-result')).toBeVisible();
  await expect(tv.getByTestId('tv-choice')).toHaveCount(4);
});
