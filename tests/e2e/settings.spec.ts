import { test, expect } from '@playwright/test';
import { installFixture } from './fixture';
const openSettings = async (page: import('@playwright/test').Page, section: string) => {
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: new RegExp(`^${section}`) }).click();
};

test('settings persist, apply appearance and expose supported versus planned connections', async ({ page }) => {
  await page.goto('/');
  await openSettings(page, 'Appearance');
  await page.getByLabel('Accent colour').selectOption('ice');
  await page.getByRole('switch', { name: 'Reduce animations' }).check();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-accent', 'ice');
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: /^Playback/ }).click();
  await page.getByLabel('Starting volume').fill('65');
  await page.getByLabel('Playback speed').fill('1.25');
  await page.getByLabel('Subtitle size').fill('1.2');
  await page.getByLabel('Preferred source quality').selectOption('2160');
  await page.reload();
  await openSettings(page, 'Playback');
  await expect(page.getByLabel('Starting volume')).toHaveValue('65');
  await expect(page.getByLabel('Playback speed')).toHaveValue('1.25');
  await expect(page.getByLabel('Subtitle size')).toHaveValue('1.2');
  await expect(page.getByLabel('Preferred source quality')).toHaveValue('2160');
  await page.screenshot({ path: '../aster-settings-playback.png', fullPage: true });
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: /^Connections/ }).click();
  await page.getByRole('button', { name: 'Open TorBox connection', exact: true }).click();
  await expect(page.getByLabel('TorBox API key')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.screenshot({ path: '../aster-settings-connections.png', fullPage: true });
  await page.getByLabel('Search settings').fill('backup');
  await expect(page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button')).toHaveCount(1);
});

test('custom collections and Home controls change the actual Home page', async ({ page }) => {
  await installFixture(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'View details', exact: true }).click();
  await page.getByRole('button', { name: 'Add to library', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await openSettings(page, 'Collections');
  await page.getByLabel('Collection name').fill('Sunday cinema');
  await page.getByRole('checkbox', { name: 'Sintel', exact: true }).check();
  await page.getByRole('button', { name: 'Create collection', exact: true }).click();
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: /^Home & display/ }).click();
  await page.getByRole('switch', { name: 'Show cinematic spotlight' }).uncheck();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Featured stories' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Sunday cinema', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Sunday cinema', exact: true })).toBeVisible();
});

test('backup imports preview before merging and reject invalid records', async ({ page }) => {
  await page.goto('/');
  await openSettings(page, 'Data & backup');
  await page.getByLabel('Import backup file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"aster-backup","version":1,"items":{"bad":{}}}') });
  await expect(page.getByRole('status')).toContainText('invalid media record');
  const media = { id: 'backup:film', type: 'movie', title: 'Restored Movie', art: '/art/forest.jpg', source: 'Backup', genre: 'Drama', year: 2020, duration: '90 min', description: 'Restored content', accent: '#fff' };
  const backup = { format: 'aster-backup', version: 1, items: { [media.id]: { media, favorite: true, inLibrary: true, updatedAt: new Date().toISOString() } }, settings: { accent: 'violet' } };
  await page.getByLabel('Import backup file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByText('Review import · 1 saved titles')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aster.state.v1')!).items['backup:film'])).toBeUndefined();
  await page.getByRole('button', { name: 'Merge backup', exact: true }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View Restored Movie', exact: true })).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-accent', 'violet');
});

test('one click chooses preferred quality and hides private source URLs', async ({ page }) => {
  await installFixture(page);
  await page.route('https://fixture.aster.test/stream/**', route => route.fulfill({ json: { streams: [
    { name: '4K', title: 'https://private.test/secret-access\nEnglish · HEVC', url: 'http://127.0.0.1:1420/media/sintel-trailer.mp4?quality=4k' },
    { name: '1080p', title: 'English · H264', url: 'http://127.0.0.1:1420/media/sintel-trailer.mp4?quality=1080' }
  ] } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('video')).toHaveAttribute('src', /quality=1080/);
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'View details', exact: true }).click();
  await page.getByRole('button', { name: 'Choose source', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose source', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('dialog')).not.toContainText('secret-access');
  await expect(page.getByRole('button', { name: /4K English/ })).toBeVisible();
  await page.screenshot({ path: '../aster-simple-play.png', fullPage: true });
  await page.getByRole('button', { name: /4K English/ }).click();
  await expect(page.locator('video')).toHaveAttribute('src', /quality=4k/);
  await page.locator('video').evaluate(async(v:HTMLVideoElement)=>{if(v.readyState<1)await new Promise(resolve=>v.addEventListener('loadedmetadata',resolve,{once:true}));v.currentTime=5;v.pause();});
  await page.getByRole('button',{name:'Change source',exact:true}).click();
  await expect(page.getByRole('region',{name:'Playback sources'})).toBeVisible();
  await page.getByRole('button',{name:/Play source: 1080p/}).click();
  await expect(page.locator('video')).toHaveAttribute('src',/quality=1080/);
  // Browser decoding can round the requested seek to a nearby video frame.
  await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThanOrEqual(4.8);
  await expect(page.locator('.detail-body')).toHaveCount(0);
});

test('settings fit a narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto('/');
  await openSettings(page, 'Playback');
  await expect(page.getByLabel('Preferred source quality')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


