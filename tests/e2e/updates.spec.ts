import { test, expect } from '@playwright/test';
import { installFixture, playFixture } from './fixture';

async function updaterFixture(page: import('@playwright/test').Page, fails = false, supported = true) {
  await installFixture(page);
  await page.clock.install();
  await page.addInitScript(({ fails, supported }) => {
    const root = window as any; root.isTauri = true; root.updateCalls = [];
    root.__TAURI_INTERNALS__ = { transformCallback: () => 1, invoke: async (command: string, args: any) => {
      root.updateCalls.push(command);
      if (command === 'app_update_supported') return supported;
      if (command === 'mpv_available') return false;
      if (command === 'addon_get') return args.url.includes('/stream/') ? { streams: [{ name: 'Fixture', url: 'http://127.0.0.1:1420/media/sintel-trailer.mp4' }] } : { metas: [{ id: 'fixture:sintel', name: 'Sintel', background: '/art/mountains.jpg' }] };
      if (command === 'rd_request') throw new Error('Not connected');
      if (command === 'plugin:updater|check') return { rid: 12, currentVersion: '0.1.0-alpha.3', version: '0.1.0-alpha.4', rawJson: {} };
      if (command === 'plugin:updater|download') {
        if (fails) throw new Error('Invalid signature');
        args.onEvent.onmessage({ event: 'Started', data: { contentLength: 100 } });
        args.onEvent.onmessage({ event: 'Progress', data: { chunkLength: 100 } });
        return 13;
      }
      return null;
    } };
  }, { fails, supported });
  await page.goto('/');
}

test('automatic updates download in the background and install after an idle countdown', async ({ page }) => {
  await updaterFixture(page);
  await page.clock.fastForward(4500);
  await expect(page.getByRole('status', { name: 'App update' })).toContainText('0.1.0-alpha.4 is ready');
  await page.clock.fastForward(61_000);
  await expect.poll(() => page.evaluate(() => (window as any).updateCalls)).toContain('plugin:updater|install');
  const commands = await page.evaluate(() => (window as any).updateCalls);
  expect(commands.indexOf('app_prepare_update')).toBeLessThan(commands.indexOf('plugin:updater|install'));
});

test('updates never interrupt playback and Later defers automatic installation', async ({ page }) => {
  await updaterFixture(page); await playFixture(page);
  await page.clock.fastForward(4500); await page.clock.fastForward(65_000);
  expect(await page.evaluate(() => (window as any).updateCalls.includes('plugin:updater|install'))).toBe(false);
  await expect(page.getByRole('status', { name: 'App update' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.clock.fastForward(1000);
  await page.getByRole('button', { name: 'Later', exact: true }).click();
  await page.clock.fastForward(65_000);
  expect(await page.evaluate(() => (window as any).updateCalls.includes('plugin:updater|install'))).toBe(false);
  await page.getByRole('button', { name: 'Restart to update', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).updateCalls)).toContain('plugin:updater|install');
});

test('failed signature verification keeps the current app and allows retry', async ({ page }) => {
  await updaterFixture(page, true);
  await page.clock.fastForward(4500);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /About/ }).click();
  await expect(page.getByText('Updates could not be checked or verified.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => (window as any).updateCalls.includes('plugin:updater|install'))).toBe(false);
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
  expect(await page.evaluate(() => (window as any).updateCalls.filter((c: string) => c === 'plugin:updater|check').length)).toBe(2);
});

test('portable previews check versions without attempting automatic installation', async ({ page }) => {
  await updaterFixture(page, false, false);
  await page.clock.fastForward(4500); await page.clock.fastForward(65_000);
  const commands = await page.evaluate(() => (window as any).updateCalls);
  expect(commands).toContain('plugin:updater|check');
  expect(commands).not.toContain('plugin:updater|download');
  expect(commands).not.toContain('plugin:updater|install');
});

test('turning automatic updates off persists and still permits a manual check', async ({ page }) => {
  await updaterFixture(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /About/ }).click();
  await page.getByRole('switch', { name: 'Automatic updates', exact: true }).uncheck();
  await page.reload(); await page.clock.fastForward(5000);
  expect(await page.evaluate(() => (window as any).updateCalls.includes('plugin:updater|check'))).toBe(false);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /About/ }).click();
  await expect(page.getByRole('switch', { name: 'Automatic updates', exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect(page.getByRole('status', { name: 'App update' })).toContainText('0.1.0-alpha.4 is ready');
  await page.clock.fastForward(65_000);
  expect(await page.evaluate(() => (window as any).updateCalls.includes('plugin:updater|install'))).toBe(false);
});
