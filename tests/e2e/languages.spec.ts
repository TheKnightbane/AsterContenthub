import { test, expect } from '@playwright/test';
test('voice and subtitle preferences persist across restarts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: /^Playback/ }).click();
  await page.getByLabel('Preferred voice language').selectOption('es');
  await page.locator('#subtitle-mode').selectOption('off');
  await page.getByLabel('Preferred subtitle language').selectOption('fr');
  await page.reload();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: /^Playback/ }).click();
  await expect(page.getByLabel('Preferred voice language')).toHaveValue('es');
  await expect(page.locator('#subtitle-mode')).toHaveValue('off');
  await expect(page.getByLabel('Preferred subtitle language')).toHaveValue('fr');
  await expect(page.getByRole('radio', { name: /mpv · Recommended/ })).toBeDisabled();
  await expect(page.getByText(/Audio language and Subtitles buttons below the video/)).toBeVisible();
  await page.screenshot({ path: '../aster-player-settings.png', fullPage: true });
});
