import { describe, expect, it } from 'vitest';
import { endpoint, safeUrl, supports, validateManifest } from './addons';
import { blankState, updateItem } from './storage';
import { demoCatalog } from './data';
const manifest = { id: 'test.addon', name: 'Test', version: '1.0.0', description: 'Test catalog', types: ['movie'], resources: ['catalog', { name: 'stream', types: ['movie'], idPrefixes: ['tt'] }], catalogs: [{ id: 'popular', type: 'movie' }] };
describe('local collection', () => {
  it('preserves independent flags and progress when saving an item', () => {
    const media = demoCatalog[0];
    let state = updateItem(blankState(), media, { favorite: true });
    state = updateItem(state, media, { inLibrary: true, progress: { position: 13, duration: 60, updatedAt: new Date().toISOString() } });
    expect(state.items[media.id]).toMatchObject({ favorite: true, inLibrary: true, progress: { position: 13 } });
    state = updateItem(state, media, { favorite: false });
    expect(state.items[media.id].inLibrary).toBe(true);
  });
});
describe('Stremio protocol', () => {
  it('rejects invalid manifests', () => { expect(() => validateManifest({ name: 'Bad' })).toThrow(); expect(validateManifest(manifest).id).toBe('test.addon'); });
  it('respects stream resource types and ID prefixes', () => {
    const addon = { url: 'https://example.com/config/manifest.json', manifest };
    expect(supports(addon, 'stream', 'movie', 'tt123')).toBe(true);
    expect(supports(addon, 'stream', 'series', 'tt123')).toBe(false);
    expect(supports(addon, 'stream', 'movie', 'other')).toBe(false);
    expect(endpoint(addon, 'stream', 'movie', 'tt123:1:2')).toBe('https://example.com/config/stream/movie/tt123%3A1%3A2.json');
  });
  it('rejects unsafe transport and credentials', () => { expect(() => safeUrl('javascript:alert(1)')).toThrow(); expect(() => safeUrl('https://user:secret@example.com')).toThrow(); expect(safeUrl('http://localhost:7000/manifest.json')).toContain('localhost'); });
});
