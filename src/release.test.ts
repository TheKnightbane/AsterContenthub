import { describe, it, expect } from 'vitest';
import { advancesFeed, updateManifest } from '../scripts/release-manifest.mjs';
describe('signed release feed', () => {
  it('uses semantic versions so delayed alpha releases cannot roll the feed backwards', () => {
    expect(advancesFeed('0.1.0-alpha.9', '0.1.0-alpha.10')).toBe(true);
    expect(advancesFeed('0.1.0-alpha.10', '0.1.0-alpha.9')).toBe(false);
    expect(advancesFeed('0.1.0', '0.1.0-alpha.10')).toBe(false);
    expect(advancesFeed('0.1.0', '0.1.0')).toBe(false);
  });
  it('refuses unsigned installers and malformed release locations', () => {
    expect(() => updateManifest('0.1.0', '', 'owner/repo')).toThrow();
    expect(() => updateManifest('not-a-version', 'anything', 'owner/repo')).toThrow();
    expect(() => updateManifest('0.1.0', 'anything', 'https://evil.test')).toThrow();
    const signature = btoa('untrusted comment: fixture\nline2\ntrusted comment: fixture\tversion:0.1.0-alpha.3\nline4');
    const feed = updateManifest('0.1.0-alpha.3', signature, 'TheKnightbane/AsterContenthub');
    expect(feed.platforms['windows-x86_64'].url).toBe('https://github.com/TheKnightbane/AsterContenthub/releases/download/v0.1.0-alpha.3/AsterContentHub-Setup-0.1.0-alpha.3-x64.exe');
  });
});
