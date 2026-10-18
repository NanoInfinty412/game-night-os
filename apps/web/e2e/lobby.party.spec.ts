import { expect, test } from '@playwright/test';
import { correctAnswer, joinFromPhone, numberAnswer, openTv, partyOf2, skipIntro } from './helpers';

test('Quick Draw: tapping before GO is a false start, the patient tapper wins', async ({
  browser,
}) => {
  const { tv, ada, sam } = await partyOf2(browser, 'quick-draw');
  await expect(tv.getByTestId('round-title')).toHaveText('Quick Draw');
  await skipIntro(tv, ada);

  await expect(tv.getByTestId('reaction-light')).toHaveAttribute('data-status', 'wait');
  await sam.getByTestId('reaction-button').click();
  await expect(sam.getByText('Too early!')).toBeVisible();

  await expect(ada.getByTestId('reaction-button')).toHaveAttribute('data-status', 'go', {
    timeout: 10_000,
  });
  await ada.getByTestId('reaction-button').click();

  await expect(tv.getByTestId('reaction-results')).toBeVisible();
  await expect(ada.getByTestId('round-result')).toHaveAttribute('data-correct', 'true');
  await expect(sam.getByTestId('round-result')).toHaveAttribute('data-correct', 'false');
  await expect(sam.getByTestId('round-result')).toContainText('Too early!');
});

test('Tap Frenzy: more taps wins the race', async ({ browser }) => {
  const { tv, ada, sam } = await partyOf2(browser, 'tap-frenzy');
  await expect(tv.getByTestId('round-title')).toHaveText('Rocket Race');
  await skipIntro(tv, ada);
  await expect(tv.getByTestId('mash-lanes')).toBeVisible();

  for (let i = 0; i < 12; i++) {
    await ada.getByTestId('mash-button').click();
    await ada.waitForTimeout(70);
  }
  await sam.getByTestId('mash-button').click();
  await expect(ada.getByTestId('mash-taps')).toHaveText('12');

  // The race runs out on its own.
  await expect(ada.getByTestId('round-result')).toContainText('12 taps!', { timeout: 15_000 });
  await expect(sam.getByTestId('round-result')).toContainText('1 taps!');
  await expect(tv.getByTestId('score-strip')).toContainText('Ada');
});

test('Closest Wins: an exact guess beats a wild one', async ({ browser }) => {
  const { tv, ada, sam } = await partyOf2(browser, 'closest-wins');
  await skipIntro(tv, ada);
  const prompt = (await tv.getByTestId('question-prompt').textContent())!;
  const answer = numberAnswer(prompt);

  for (const digit of String(answer)) await ada.getByTestId(`key-${digit}`).click();
  await expect(ada.getByTestId('guess-display')).toContainText(answer.toLocaleString('en-US'));
  await ada.getByTestId('send-guess').click();
  await sam.getByTestId('key-0').click();
  await sam.getByTestId('send-guess').click();

  await expect(tv.getByTestId('number-answer')).toHaveText(answer.toLocaleString('en-US'));
  await expect(ada.getByTestId('round-result')).toContainText('Exactly right!');
});

test('Category Clash: the chooser picks a category, then everyone answers', async ({ browser }) => {
  const { tv, ada, sam } = await partyOf2(browser, 'category-clash');
  await skipIntro(tv, ada);

  await expect(tv.getByTestId('tv-categories')).toBeVisible();
  await expect(sam.getByTestId('waiting-pick')).toBeVisible();
  const category = (await ada.getByTestId('category-button').nth(1).textContent())!;
  await ada.getByTestId('category-button').nth(1).click();

  await expect(ada.getByTestId('answer-button')).toHaveCount(4);
  await expect(tv.getByText(category.trim()).first()).toBeVisible();
  const right = correctAnswer((await tv.getByTestId('question-prompt').textContent())!);
  await ada.getByTestId('answer-button').filter({ hasText: right }).first().click();
  await sam.getByTestId('answer-button').filter({ hasNotText: right }).first().click();
  await expect(ada.getByTestId('round-result')).toHaveAttribute('data-correct', 'true');
});

test('Lightning Round and Emoji Riddles use their own answer pads', async ({ browser }) => {
  const lightning = await partyOf2(browser, 'lightning');
  await skipIntro(lightning.tv, lightning.ada);
  await expect(lightning.ada.getByTestId('answer-button')).toHaveText([/True/, /False/]);
  const right = correctAnswer((await lightning.tv.getByTestId('question-prompt').textContent())!);
  await lightning.ada.getByTestId('answer-button').filter({ hasText: right }).click();
  await lightning.sam.getByTestId('answer-button').filter({ hasNotText: right }).click();
  await expect(lightning.ada.getByTestId('round-result')).toHaveAttribute('data-correct', 'true');

  const emoji = await partyOf2(browser, 'emoji-riddles');
  await expect(emoji.tv.getByTestId('round-title')).toHaveText('Emoji Riddle');
  await skipIntro(emoji.tv, emoji.ada);
  const riddle = correctAnswer((await emoji.tv.getByTestId('question-prompt').textContent())!);
  await emoji.ada.getByTestId('answer-button').filter({ hasText: riddle }).first().click();
  await emoji.sam.getByTestId('answer-button').filter({ hasNotText: riddle }).first().click();
  await expect(emoji.ada.getByTestId('round-result')).toHaveAttribute('data-correct', 'true');
});

test('the VIP game picker and the number pad fit a 360px phone', async ({ browser }) => {
  const { tv, code } = await openTv(browser);
  const ada = await joinFromPhone(browser, code, 'Ada');
  const sam = await joinFromPhone(browser, code, 'Sam');
  await ada.setViewportSize({ width: 360, height: 740 });
  const overflow = () =>
    ada.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await expect(ada.getByTestId('phone-game')).toHaveCount(8);
  expect(await overflow()).toBe(0);

  await ada.locator('[data-testid="phone-game"][data-game="closest-wins"]').click();
  await expect(sam.getByTestId('selected-game')).toContainText('Closest Wins');
  await ada.getByTestId('start-game').click();
  await skipIntro(tv, ada);
  await expect(ada.getByTestId('key-9')).toBeVisible();
  expect(await overflow()).toBe(0);
});
