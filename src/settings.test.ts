import { describe, expect, it } from 'vitest';
import { createBackup, defaultSettings, mergeBackup, normalizeSettings, parseBackup, rankedSources, sourceLabel } from './settings';
import { blankState, updateItem } from './storage';
import { demoCatalog } from './data';
describe('settings and playback selection', () => {
  it('bounds imported values and rejects unknown enum choices', () => {
    const value = normalizeSettings({ volume: 500, speed: -1, accent: 'invalid', hardwareDecoding: false, collections: [{ name: 'Bad' }] });
    expect(value.volume).toBe(100); expect(value.speed).toBe(.5); expect(value.accent).toBe('lime'); expect(value.hardwareDecoding).toBe(false); expect(value.collections).toEqual([]);
  });
  it('prefers the requested direct source quality and excludes unsupported sources', () => {
    const streams = [{ name: '4K', url: 'https://example.com/4k' }, { name: '1080p', url: 'https://example.com/hd' }, { name: '720p', url: 'https://example.com/720' }, { name: 'bad', url: 'javascript:alert(1)' }, { name: 'torrent', infoHash: 'a'.repeat(40) }];
    expect(rankedSources(streams, '1080').map(s => s.name)).toEqual(['1080p', '720p', '4K']);
    expect(rankedSources(streams, 'auto')[0].name).toBe('4K');
  });
  it('removes signed playback URLs from user-facing labels', () => {
    const label = sourceLabel({ name: '4K', title: 'https://private.test/file?token=secret\nEnglish · HEVC' });
    expect(label.detail).toBe('English · HEVC'); expect(JSON.stringify(label)).not.toContain('secret');
  });
});
describe('portable backups', () => {
  it('merges newer collection records and excludes addon secrets and retired demos', () => {
    const media = { ...demoCatalog[0], id: 'fixture:movie', demo: false };
    const state = updateItem(blankState(), media, { favorite: true });
    state.addons = [{ url: 'https://example.com/secret-key/manifest.json', manifest: { id: 'test', name: 'Test', version: '1', description: '', resources: [], types: [], catalogs: [] } }];
    const backup = createBackup(state, defaultSettings());
    expect(JSON.stringify(backup)).not.toContain('secret-key');
    const parsed = parseBackup(JSON.stringify(backup));
    expect(mergeBackup(blankState(), parsed).items[media.id].favorite).toBe(true);
    expect(() => parseBackup('{"format":"aster-backup","version":1,"items":{"bad":{}}}')).toThrow(/invalid media/);
  });
});
