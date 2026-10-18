import { expect, test } from '@playwright/test';
import { correctAnswer, escapeRegExp, joinFromPhone, openTv, partyOf2, skipIntro } from './helpers';

test('a TV and two phones play a whole game of Trivia Chaos', async ({ browser }) => {
  test.setTimeout(150_000);
  const { tv, code } = await openTv(browser);

  const ada = await joinFromPhone(browser, code, 'Ada');
  await expect(ada.getByTestId('start-game')).toBeDisabled();
  const sam = await joinFromPhone(browser, code, 'Sam');
  await expect(sam.getByTestId('start-game')).toHaveCount(0);
  await expect(sam.getByTestId('phone-game')).toHaveCount(0);
  await expect(sam.getByText('Waiting for the 👑 VIP')).toBeVisible();

  // The VIP picks the game from their phone; the TV and the other phone follow.
  await expect(ada.getByTestId('phone-game')).toHaveCount(8);
  await ada.locator('[data-testid="phone-game"][data-game="trivia"]').click();
  await expect(tv.locator('[data-testid="game-card"][aria-pressed="true"]')).toContainText(
    'Trivia Chaos',
  );
  await expect(sam.getByTestId('selected-game')).toContainText('Trivia Chaos');

  await ada.getByTestId('start-game').click();
  for (let round = 1; round <= 10; round++) {
    await expect(tv.getByTestId('round-label')).toHaveText(`Round ${round} of 10`);
    await skipIntro(tv, ada);
    await expect(ada.getByTestId('answer-button')).toHaveCount(4);
    const prompt = (await tv.getByTestId('question-prompt').textContent())!;
    const right = correctAnswer(prompt);

    // Ada always knows it; Sam always picks a wrong one.
    await ada.getByTestId('answer-button').filter({ hasText: right }).first().click();
    await expect(ada.getByTestId('locked-in')).toBeVisible();
    await expect(tv.locator('[data-testid="tv-player"][data-answered="true"]')).toHaveCount(1);
    await sam.getByTestId('answer-button').filter({ hasNotText: right }).first().click();

    // Everyone answered, so the reveal comes straight away.
    await expect(tv.locator('[data-testid="tv-choice"][data-correct="true"]')).toHaveText(
      new RegExp(escapeRegExp(right)),
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

  // Back to the menu returns everyone to the lobby with the same game picked.
  await ada.getByTestId('vip-next').click();
  await expect(tv.getByTestId('room-code')).toHaveText(code);
  await expect(ada.getByTestId('start-game')).toBeEnabled();
  await expect(sam.getByTestId('selected-game')).toContainText('Trivia Chaos');
});

test('a refreshed phone mid-question stays locked in and keeps playing', async ({ browser }) => {
  const { tv, ada, sam } = await partyOf2(browser, 'trivia');
  await skipIntro(tv, ada);

  await sam.getByTestId('answer-button').first().click();
  await sam.reload();
  await expect(sam.getByTestId('locked-in')).toBeVisible();
  await ada.getByTestId('answer-button').first().click();
  await expect(sam.getByTestId('round-result')).toBeVisible();
  await expect(tv.getByTestId('tv-choice')).toHaveCount(4);
});

test('the TV remote can pick a game, start it, skip and quit back to the menu', async ({
  browser,
}) => {
  const { tv, code } = await openTv(browser);
  await joinFromPhone(browser, code, 'Ada');
  await joinFromPhone(browser, code, 'Sam');

  // Arrow keys move between game cards and Enter picks one, like an Android TV remote.
  await tv.keyboard.press('ArrowRight'); // the first press lands on the selected game
  await expect(tv.getByTestId('game-card').first()).toBeFocused();
  await tv.keyboard.press('ArrowRight');
  await tv.keyboard.press('ArrowRight');
  await tv.keyboard.press('Enter');
  await expect(tv.locator('[data-testid="game-card"][aria-pressed="true"]')).toContainText(
    'Category Clash',
  );
  await tv.keyboard.press('ArrowDown');
  await expect(tv.getByTestId('tv-start')).toBeFocused();
  await tv.keyboard.press('Enter');
  await expect(tv.getByTestId('round-title')).toHaveText('Category Clash');
  await tv.keyboard.press('ArrowDown'); // the first press on a new screen lands on Skip
  await expect(tv.getByTestId('tv-skip')).toBeFocused();
  await tv.keyboard.press('Enter');
  await expect(tv.getByTestId('tv-categories')).toBeVisible();
  await tv.getByTestId('tv-quit').click();
  await expect(tv.getByTestId('room-code')).toHaveText(code);
});
