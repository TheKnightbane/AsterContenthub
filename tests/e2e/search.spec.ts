import { test, expect } from '@playwright/test';
const manifest = { id: 'test.cinemeta', name: 'Cinemeta fixture', description: 'Metadata only', version: '1.0.0', types: ['movie'], resources: ['catalog', 'meta'], catalogs: [{ type: 'movie', id: 'top', extra: [{ name: 'search' }] }] };
test('finds titles outside the loaded catalog and explains a metadata-only addon', async ({ page }) => {
  let searches = 0;
  await page.route('https://search.aster.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/manifest.json') return route.fulfill({ json: manifest });
    if (path.includes('/search=')) { searches++; return route.fulfill({ json: { metas: [{ id: 'tt2543164', name: 'Arrival', releaseInfo: '2016' }] } }); }
    return route.fulfill({ json: { metas: [] } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Addons', exact: true }).click();
  await page.getByLabel('Addon manifest URL').fill('https://search.aster.test/manifest.json');
  await page.getByRole('button', { name: 'Install addon' }).click();
  await expect(page.getByRole('heading', { name: /Cinemeta fixture/ })).toBeVisible();
  await expect(page.getByText('No playback sources', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Search content').fill('Arrival');
  await page.getByRole('button', { name: 'View Arrival' }).click();
  expect(searches).toBeGreaterThan(0);
  await expect(page.getByText('A stream-provider addon is needed')).toBeVisible();
  await expect(page.getByText(/Catalog addons such as Cinemeta find movies/)).toBeVisible();
  await page.getByRole('button', { name: 'Manage stream addons' }).click();
  await expect(page.getByText(/No stream-provider addon is installed/)).toBeVisible();
});

test('ignores stale search responses and surfaces failed remote searches with retry', async ({ page }) => {
  let failing = false;
  await page.route('https://search.aster.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/manifest.json') return route.fulfill({ json: manifest });
    if (!path.includes('/search=')) return route.fulfill({ json: { metas: [] } });
    if (path.includes('First')) { await new Promise(resolve => setTimeout(resolve, 1000)); return route.fulfill({ json: { metas: [{ id: 'first', name: 'First stale result' }] } }); }
    if (failing) return route.fulfill({ status: 503, json: {} });
    return route.fulfill({ json: { metas: [{ id: 'second', name: 'Second result' }] } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Addons', exact: true }).click();
  await page.getByLabel('Addon manifest URL').fill('https://search.aster.test/manifest.json');
  await page.getByRole('button', { name: 'Install addon' }).click();
  await expect(page.getByRole('heading', { name: /Cinemeta fixture/ })).toBeVisible();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Search content').fill('First');
  await page.waitForRequest(request => request.url().includes('/search=First.json'));
  await page.getByLabel('Search content').fill('Second');
  await expect(page.getByRole('button', { name: 'View Second result' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View First stale result' })).toHaveCount(0);
  failing = true;
  await page.getByLabel('Search content').fill('Failure');
  await expect(page.getByText(/Search could not reach all catalogs/)).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: 'Retry search' }).click();
  // Provider-ranked results may not contain the exact query; they should still appear.
  await expect(page.getByRole('button', { name: 'View Second result' })).toBeVisible();
});
