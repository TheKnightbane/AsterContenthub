import { test, expect } from '@playwright/test';
import { installFixture, playFixture } from './fixture';
test('addon content works without credentials; search, collection, and playback persist', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await installFixture(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sintel', exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '../aster-preview.png', fullPage: true });
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search content' }).fill('Tears');
  await expect(page.getByRole('button', { name: 'View Tears of Steel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Spring' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Favorite Tears of Steel', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /^Favorites/ }).click();
  await expect(page.getByRole('button', { name: 'View Tears of Steel' })).toBeVisible();
  await page.getByRole('button', { name: 'View Tears of Steel' }).click();
  await page.getByRole('button', { name: 'Add to library', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View Tears of Steel' })).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await playFixture(page);
  await expect(page.locator('video')).toBeVisible();
  await page.locator('video').evaluate(async (node: HTMLVideoElement) => { if (node.readyState < 1) await new Promise<void>(resolve => node.addEventListener('loadedmetadata', () => resolve(), { once: true })); node.currentTime = 12; node.pause(); node.dispatchEvent(new Event('pause')); });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  const position = await page.evaluate(() => JSON.parse(localStorage.getItem('aster.state.v1')!).items['fixture:sintel'].progress.position);
  expect(position).toBeGreaterThanOrEqual(12);
  await page.getByRole('button', { name: 'Profiles & sync' }).click();
  await expect(page.getByRole('button', { name: /Enable sync/ })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('installs a Stremio addon, reads catalog, resolves a stream, removes addon', async ({ page }) => {
  await page.route('https://addon.aster.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const json = path === '/manifest.json' ? { id: 'test.fixture', name: 'Test Cinema', description: 'A test addon', version: '1.0.0', resources: ['catalog', 'stream'], types: ['movie'], catalogs: [{ id: 'all', type: 'movie' }] } : path.startsWith('/catalog/') ? { metas: [{ id: 'test:film', name: 'Fixture Film', description: 'A test film' }] } : { streams: [{ name: 'Local preview', url: 'http://127.0.0.1:1420/media/sintel-trailer.mp4' }] };
    await route.fulfill({ json });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Addons', exact: true }).click();
  await page.getByLabel('Addon manifest URL').fill('https://addon.aster.test/manifest.json');
  await page.getByRole('button', { name: 'Install addon' }).click();
  await expect(page.getByRole('heading', { name: /Test Cinema/ })).toBeVisible();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search content' }).fill('Fixture');
  await page.getByRole('button', { name: 'View Fixture Film' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('video')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Addons', exact: true }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Test Cinema/ })).toHaveCount(0);
});

test('handles empty search and narrow layout', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search content' }).fill('no-such-story');
  await expect(page.getByText('A little space for something great.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


