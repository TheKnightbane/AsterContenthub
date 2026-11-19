import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPlaybackPreferences, loadPlayer, savePlaybackPreferences } from './players';
afterEach(() => vi.unstubAllGlobals());
describe('player preferences', () => {
  it('retains mpv as the chosen player and validates saved languages', () => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'aster.player.v1' ? 'mpv' : JSON.stringify({ audioLanguage: 'es', subtitleLanguage: 'bad-language', subtitleMode: 'off' }) });
    expect(loadPlayer()).toBe('mpv');
    expect(loadPlaybackPreferences()).toEqual({ audioLanguage: 'es', subtitleLanguage: 'en', subtitleMode: 'off' });
  });
  it('falls back safely when storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('disabled'); }, setItem: () => { throw new Error('disabled'); } });
    expect(loadPlaybackPreferences()).toEqual({ audioLanguage: 'en', subtitleLanguage: 'en', subtitleMode: 'auto' });
    expect(savePlaybackPreferences({ audioLanguage: 'en', subtitleLanguage: 'en', subtitleMode: 'auto' })).toBe(false);
  });
});
