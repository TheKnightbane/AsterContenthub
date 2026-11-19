import { test, expect } from '@playwright/test';

test('cinematic home groups addon catalogs, changes spotlight, and scrolls landscape rows', async ({ page }) => {
  await page.route('https://home.aster.test/**', async route => {
    const series = route.request().url().includes('/series/');
    await route.fulfill({ json: { metas: Array.from({ length: 12 }, (_, i) => ({ id: `${series ? 'series' : 'movie'}:${i}`, name: `${series ? 'Series' : 'Movie'} ${i}`, background: '/art/forest.jpg', imdbRating: '8.2', description: 'A cinematic discovery from your installed catalog.' })) } });
  });
  await page.addInitScript(() => localStorage.setItem('aster.state.v1', JSON.stringify({ version: 1, seeded: true, items: {}, addons: [{ url: 'https://home.aster.test/manifest.json', manifest: { id: 'home.fixture', name: 'Test Cinema', version: '1', description: 'Fixture', resources: ['catalog'], types: ['movie', 'series'], catalogs: [{ id: 'popular', type: 'movie', name: 'Popular Movies' }, { id: 'popular', type: 'series', name: 'Popular Series' }] } }] })));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Popular Movies', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Popular Series', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Open Cinema', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Feature Movie 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Movie 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View details', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  const row = page.getByRole('region', { name: 'Popular Movies', exact: true }).locator('.cinema-rail');
  await page.getByRole('button', { name: 'Scroll Popular Movies right', exact: true }).click();
  await expect.poll(() => row.evaluate(node => node.scrollLeft)).toBeGreaterThan(100);
  await page.setViewportSize({ width: 640, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search content' })).toBeVisible();
});

test('starts empty and removes retired demo records while retaining addon content', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your next story starts here.' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('aster.state.v1', JSON.stringify({ version: 1, seeded: true, addons: [], items: {
    'aster:sintel': { media: { id: 'aster:sintel', title: 'Sintel', demo: true }, favorite: true, inLibrary: true, updatedAt: '2026-01-01' },
    'tt:keep': { media: { id: 'tt:keep', title: 'Saved Movie', type: 'movie', source: 'My addon', art: '/art/forest.jpg', genre: 'Drama', year: 2020, description: 'Keep this title.' }, favorite: true, inLibrary: true, updatedAt: '2026-01-01' }
  } })));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Saved Movie', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('aster.state.v1')!).items))).toEqual(['tt:keep']);
  await page.getByRole('button', { name: 'Addons', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Aster Open Cinema', exact: true })).toHaveCount(0);
});

test('keeps the same compact navigation and palette on every page', async ({ page }) => {
  await page.goto('/');

  const background = await page.locator('main').evaluate(node => getComputedStyle(node).backgroundColor);
  for (const name of ['Search', 'Library', 'Favorites', 'Continue Watching', 'Addons', 'Settings', 'Home']) {
    await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.sidebar')).toHaveCSS('width', '248px');
    expect(await page.locator('main').evaluate(node => getComputedStyle(node).backgroundColor)).toBe(background);
    if (name === 'Search') await page.screenshot({ path: '../aster-theme-search.png' });
  }
});

test('sidebar expands over content on hover and keyboard focus', async ({ page }) => {
  await page.goto('/');
  const sidebar = page.locator('.sidebar');
  const originalLeft = await page.locator('main').evaluate(node => node.getBoundingClientRect().left);
  await sidebar.hover();
  await expect(sidebar).toHaveCSS('width', '248px');
  await expect(sidebar.getByRole('button', { name: 'Settings', exact: true }).locator('span')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: '../aster-sidebar-expanded.png' });
  expect(await page.locator('main').evaluate(node => node.getBoundingClientRect().left)).toBe(originalLeft);
  await page.locator('h1').click();
  await expect(sidebar).toHaveCSS('width', '76px');
  await page.keyboard.press('Tab');
  await sidebar.getByRole('button', { name: 'Library', exact: true }).focus();
  await expect(sidebar).toHaveCSS('width', '248px');
});

for (const width of [1440, 2560, 3840]) {
  test(`catalog fills the available width at ${width}px and the final card is reachable`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1440 });
    await page.route('https://wide.aster.test/**', route => route.fulfill({ json: { metas: Array.from({ length: 12 }, (_, i) => ({ id: `wide:${i}`, name: `Wide movie ${i}`, background: '/art/forest.jpg' })) } }));
    await page.addInitScript(() => localStorage.setItem('aster.state.v1', JSON.stringify({ version: 1, seeded: true, items: {}, addons: [{ url: 'https://wide.aster.test/manifest.json', manifest: { id: 'wide', name: 'Wide Catalog', version: '1', description: 'Fixture', resources: ['catalog'], types: ['movie'], catalogs: [{ id: 'popular', type: 'movie', name: 'Popular Movies' }] } }] })));
    await page.goto('/');
    const row = page.locator('.cinema-rail');
    await expect(row.locator('article')).toHaveCount(12);
    const box = await row.boundingBox();
    expect(box!.x + box!.width).toBeGreaterThan(width - 25);
    const arrows = await page.locator('.rail-arrows').boundingBox();
    expect(arrows!.x + arrows!.width).toBeGreaterThan(width - 90);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await row.evaluate(el => { el.style.scrollBehavior = 'auto'; el.scrollLeft = el.scrollWidth; });
    await expect.poll(async () => {
      const last = await row.locator('article').last().boundingBox();
      return last!.x + last!.width;
    }).toBeLessThan(width);
    if (width === 2560) await page.screenshot({ path: '../aster-fullscreen-layout-fixed.png' });
  });
}
