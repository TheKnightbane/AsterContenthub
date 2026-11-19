import { test, expect } from '@playwright/test';
import { installFixture, playFixture } from './fixture';

test('Real-Debrid resolves a hoster link without persisting the API token', async ({ page }) => {
  await page.route('https://api.real-debrid.com/rest/1.0/**', async route => {
    expect(route.request().headers().authorization).toBe('Bearer demo-only-token');
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path.endsWith('/user') ? { username: 'Demo account', type: 'premium' } : { download: 'http://127.0.0.1:1420/media/sintel-trailer.mp4', filename: 'Sintel trailer.mp4' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.screenshot({ path: '../aster-services.png', fullPage: true });
  await page.getByLabel('Real-Debrid API token').fill('demo-only-token');
  await page.getByRole('button', { name: 'Connect Real-Debrid', exact: true }).click();
  await expect(page.getByText('Demo account', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('demo-only-token');
  await page.getByLabel('Hoster URL or magnet link').fill('https://example.com/open-film');
  await page.getByRole('button', { name: 'Resolve source', exact: true }).click();
  await page.getByRole('button', { name: 'Play resolved video' }).click();
  await expect(page.locator('video')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Disconnect Real-Debrid' }).click();
  await expect(page.getByLabel('Real-Debrid API token')).toBeVisible();
});

test('Infuse preference persists and produces an Apple handoff link on Windows', async ({ page }) => {
  await installFixture(page, true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: /^Playback/ }).click();
  await page.getByRole('radio', { name: /^Infuse/ }).check();
  await page.reload();
  await playFixture(page);
  await expect(page.getByRole('heading', { name: 'Play with Infuse' })).toBeVisible();
  const link = await page.getByLabel('Infuse playback link').inputValue();
  expect(new URL(link).protocol).toBe('infuse:');
  expect(new URL(link).searchParams.get('url')).toContain('media.w3.org');
  await expect(page.getByText(/On Windows, copy this handoff link/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open in Infuse' })).toHaveCount(0);
});

test('addon torrent workflow adds only on request and selects the chosen video file', async ({ page }) => {
  let added = false; let selected = false;
  await page.route('https://api.real-debrid.com/rest/1.0/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/user')) return route.fulfill({ json: { username: 'Torrent demo', type: 'premium' } });
    if (path.endsWith('/addMagnet')) { added = true; return route.fulfill({ json: { id: 'TEST123' } }); }
    if (path.includes('/selectFiles/')) { expect(route.request().postData()).toBe('files=2'); selected = true; return route.fulfill({ status: 204 }); }
    if (path.includes('/info/')) return route.fulfill({ json: { id: 'TEST123', filename: 'Open Film', status: selected ? 'downloaded' : 'waiting_files_selection', progress: selected ? 100 : 0, files: [{ id: 1, path: '/README.txt', bytes: 20, selected: 0 }, { id: 2, path: '/Open Film.mp4', bytes: 90000, selected: selected ? 1 : 0 }], links: selected ? ['https://real-debrid.com/d/fixture'] : [] } });
    return route.fulfill({ json: { download: 'http://127.0.0.1:1420/media/sintel-trailer.mp4', filename: 'Open Film.mp4' } });
  });
  await page.route('https://torrent-addon.aster.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const json = path === '/manifest.json' ? { id: 'test.torrent', name: 'Torrent fixture', description: 'Test source', version: '1.0.0', resources: ['catalog', 'stream'], types: ['movie'], catalogs: [{ id: 'all', type: 'movie' }] } : path.startsWith('/catalog/') ? { metas: [{ id: 'fixture:open', name: 'Open Film' }] } : { streams: [{ name: 'Open torrent', infoHash: 'a'.repeat(40) }] };
    await route.fulfill({ json });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByLabel('Real-Debrid API token').fill('demo-only-token');
  await page.getByRole('button', { name: 'Connect Real-Debrid', exact: true }).click();
  await page.getByRole('button', { name: 'Addons', exact: true }).click();
  await page.getByLabel('Addon manifest URL').fill('https://torrent-addon.aster.test/manifest.json');
  await page.getByRole('button', { name: 'Install addon' }).click();
  await expect(page.getByRole('heading', { name: /Torrent fixture/ })).toBeVisible();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search content' }).fill('Open Film');
  await page.getByRole('button', { name: 'View Open Film' }).click();
  await page.getByText('Choose source', { exact: false }).click();
  await page.getByRole('button', { name: /Open torrent/ }).last().click();
  expect(added).toBe(false);
  await page.getByRole('button', { name: 'Add to Real-Debrid', exact: true }).click();
  await page.getByRole('radio', { name: /Open Film.mp4/ }).check();
  await expect(page.getByRole('dialog').getByRole('radio')).toHaveCount(1);
  await page.getByRole('button', { name: 'Prepare selected file' }).click();
  await expect(page.locator('video')).toBeVisible();
  expect(selected).toBe(true);
});

test('Play automatically prepares a torrent movie with connected Real-Debrid', async ({ page }) => {
  let added = false; let selected = false;
  await page.route('https://api.real-debrid.com/rest/1.0/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/user')) return route.fulfill({ json: { username: 'Torrent demo', type: 'premium' } });
    if (path.endsWith('/addMagnet')) { added = true; return route.fulfill({ json: { id: 'TEST123' } }); }
    if (path.includes('/selectFiles/')) { expect(route.request().postData()).toBe('files=2'); selected = true; return route.fulfill({ status: 204 }); }
    if (path.includes('/info/')) return route.fulfill({ json: { id: 'TEST123', filename: 'Open Film', status: selected ? 'downloaded' : 'waiting_files_selection', progress: selected ? 100 : 0, files: [{ id: 1, path: '/README.txt', bytes: 20, selected: 0 }, { id: 2, path: '/Open Film.mp4', bytes: 90000, selected: selected ? 1 : 0 }], links: selected ? ['https://real-debrid.com/d/fixture'] : [] } });
    return route.fulfill({ json: { download: 'http://127.0.0.1:1420/media/sintel-trailer.mp4', filename: 'Open Film.mp4' } });
  });
  await page.route('https://torrent-addon.aster.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const json = path === '/manifest.json' ? { id: 'test.torrent', name: 'Torrent fixture', description: 'Test source', version: '1.0.0', resources: ['catalog', 'stream'], types: ['movie'], catalogs: [{ id: 'all', type: 'movie' }] } : path.startsWith('/catalog/') ? { metas: [{ id: 'fixture:open', name: 'Open Film' }] } : { streams: [{ name: 'Open torrent', infoHash: 'a'.repeat(40) }] };
    await route.fulfill({ json });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByLabel('Real-Debrid API token').fill('demo-only-token');
  await page.getByRole('button', { name: 'Connect Real-Debrid', exact: true }).click();
  await page.getByRole('button', { name: 'Addons', exact: true }).click();
  await page.getByLabel('Addon manifest URL').fill('https://torrent-addon.aster.test/manifest.json');
  await page.getByRole('button', { name: 'Install addon' }).click();
  await expect(page.getByRole('heading', { name: /Torrent fixture/ })).toBeVisible();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search content' }).fill('Open Film');
  await page.getByRole('button', { name: 'View Open Film' }).click();
  expect(added).toBe(false);
  await page.getByRole('dialog').getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('video')).toBeVisible();
  expect(selected).toBe(true);
});

test('invalid Real-Debrid credentials surface an error and remain disconnected', async ({ page }) => {
  await page.route('https://api.real-debrid.com/rest/1.0/user', route => route.fulfill({ status: 401, json: { error: 'bad_token' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByLabel('Real-Debrid API token').fill('invalid-test-token');
  await page.getByRole('button', { name: 'Connect Real-Debrid', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('HTTP 401');
  await expect(page.getByRole('button', { name: 'Disconnect Real-Debrid' })).toHaveCount(0);
});
