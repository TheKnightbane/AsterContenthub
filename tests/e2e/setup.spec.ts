import { test, expect } from '@playwright/test';
test.use({ storageState: { cookies: [], origins: [] } });
const manifest = (stream = false) => ({ id: stream ? 'setup.streams' : 'com.linvo.cinemeta', name: stream ? 'My stream addon' : 'Cinemeta', version: '1', description: 'Setup fixture', types: ['movie', 'series'], resources: stream ? ['stream'] : ['catalog', 'meta'], catalogs: stream ? [] : [{ id: 'all', type: 'movie', name: 'Popular Movies' }] });
test.beforeEach(async ({ page }) => {
  await page.route('https://v3-cinemeta.strem.io/**', route => route.fulfill({ json: route.request().url().endsWith('/manifest.json') ? manifest() : { metas: [{ id: 'tt123456', name: 'Setup movie', background: '/art/mountains.jpg' }] } }));
  await page.route('https://streams.setup.test/**', route => route.fulfill({ json: manifest(true) }));
});

test('first launch connects addons and optional Real-Debrid without saving the token in app storage', async ({ page }) => {
  await page.route('https://api.real-debrid.com/rest/1.0/user', async route => {
    expect(route.request().headers().authorization).toBe('Bearer setup-private-token');
    await route.fulfill({ json: { username: 'New viewer', type: 'premium' } });
  });
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Your next story, one click away.' })).toBeVisible();
  await page.screenshot({ path: '../aster-setup-welcome.png' });
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Add Cinemeta' }).click();
  await expect(page.getByRole('list', { name: 'Installed addons' })).toContainText('Cinemeta');
  await page.getByLabel('Addon manifest URL').fill('stremio://streams.setup.test/manifest.json');
  await page.getByRole('button', { name: 'Add addon', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Installed addons' })).toContainText('Playback sources');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Real-Debrid API token').fill('setup-private-token');
  await page.getByRole('button', { name: 'Connect Real-Debrid', exact: true }).click();
  await expect(page.getByText('Connected as New viewer')).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Start exploring' }).click();
  await expect(page.getByRole('heading', { name: 'Setup movie', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('setup-private-token');
  await page.reload(); await expect(page.getByRole('heading', { name: 'Setup movie', exact: true })).toBeVisible();
  await expect(page.getByRole('main', { name: 'Aster first-time setup' })).toHaveCount(0);
});

test('unfinished setup resumes with saved addons; catalog-only setup explains missing streams', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Add Cinemeta' }).click();
  await expect(page.getByRole('button', { name: 'Added', exact: true })).toBeDisabled();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Bring your addons.' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Installed addons' }).getByText('Cinemeta', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
  await expect(page.getByText('Add a stream-provider addon in Addons before watching movies or episodes.', { exact: false })).toBeVisible();
  await page.screenshot({ path: '../aster-setup-ready.png' });
  await page.getByRole('button', { name: 'Start exploring' }).click();
});

test('setup is skippable and can be reopened from About', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Skip setup', exact: true }).click();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Your next story starts here.' })).toBeVisible();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: /^About/ }).click();
  await page.getByRole('button', { name: 'Run setup again' }).click();
  await expect(page.getByRole('heading', { name: 'Your next story, one click away.' })).toBeVisible();
});

test('invalid addons and rejected Real-Debrid tokens leave the user able to retry or skip', async ({ page }) => {
  await page.route('https://bad.setup.test/**', route => route.fulfill({ json: { bad: true } }));
  await page.route('https://api.real-debrid.com/**', route => route.fulfill({ status: 401, json: {} }));
  await page.goto('/'); await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByLabel('Addon manifest URL').fill('https://bad.setup.test/manifest.json');
  await page.getByRole('button', { name: 'Add addon', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Could not add');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Real-Debrid API token').fill('bad-private-token'); await page.getByRole('button', { name: 'Connect Real-Debrid', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not connect'); expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('bad-private-token');
  await page.getByRole('button', { name: 'Skip setup', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Your next story starts here.' })).toBeVisible();
});

test('an existing configured installation is preserved and does not get first-launch setup', async ({ page }) => {
  await page.addInitScript(value => localStorage.setItem('aster.state.v1', JSON.stringify({ version: 1, items: {}, addons: [{ url: 'https://v3-cinemeta.strem.io/manifest.json', manifest: value }] })), manifest());
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Setup movie', exact: true })).toBeVisible();
  await expect(page.getByRole('main', { name: 'Aster first-time setup' })).toHaveCount(0);
});

test('the new-user setup fits a smaller window', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 }); await page.goto('/'); await page.getByRole('button', { name: 'Get started' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByLabel('Addon manifest URL')).toBeVisible();
});
