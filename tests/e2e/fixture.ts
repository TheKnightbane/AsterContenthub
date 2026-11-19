import type { Page } from '@playwright/test';
export async function installFixture(page: Page, remoteSource = false) {
  await page.route('https://fixture.aster.test/**', route => route.fulfill({ json: route.request().url().includes('/stream/') ? { streams: [{ name: 'Fixture source', url: remoteSource ? 'https://media.w3.org/2010/05/sintel/trailer.mp4' : 'http://127.0.0.1:1420/media/sintel-trailer.mp4' }] } : { metas: [{ id: 'fixture:sintel', name: 'Sintel', background: '/art/mountains.jpg' }, { id: 'fixture:steel', name: 'Tears of Steel', background: '/art/city.jpg' }] } }));
  await page.addInitScript(() => {
    if (!localStorage.getItem('aster.state.v1')) localStorage.setItem('aster.state.v1', JSON.stringify({ version: 1, seeded: true, items: {}, addons: [{ url: 'https://fixture.aster.test/manifest.json', manifest: { id: 'fixture', name: 'Test Catalog', version: '1', description: 'Test only', resources: ['catalog', 'stream'], types: ['movie'], catalogs: [{ id: 'all', type: 'movie' }] } }] }));
  });
}
export async function playFixture(page: Page) {
  await page.getByRole('button', { name: 'View details', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^(Play|Resume)$/ }).click();
}
