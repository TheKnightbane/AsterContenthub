import { afterEach, describe, expect, it, vi } from 'vitest';
import { needsSetup, saveSetup, SETUP_KEY } from './setup';
afterEach(() => vi.unstubAllGlobals());
function storage(values: Record<string, string> = {}) { vi.stubGlobal('localStorage', { getItem: (key: string) => values[key] ?? null, setItem: (key: string, value: string) => { values[key] = value; } }); return values; }
describe('first-launch setup', () => {
  it('welcomes fresh installs and resumes unfinished setup even after adding addons', () => {
    const values = storage(); expect(needsSetup()).toBe(true);
    values['aster.state.v1'] = JSON.stringify({ version: 1, items: {}, addons: [{ url: 'https://example.test/manifest.json', manifest: { catalogs: [] } }] });
    expect(needsSetup()).toBe(false);
    saveSetup('in-progress', 2); expect(needsSetup()).toBe(true);
    saveSetup('complete', 3); expect(needsSetup()).toBe(false);
  });
  it('keeps completion separate from profile data and does not erase existing settings', () => {
    const values = storage({ 'aster.settings.v1': '{"profileName":"Viewer"}', 'aster.state.v1': '{"version":1,"items":{},"addons":[]}' });
    saveSetup('complete', 3); expect(values['aster.settings.v1']).toContain('Viewer'); expect(values['aster.state.v1']).toContain('addons'); expect(values[SETUP_KEY]).not.toContain('token');
  });
});
