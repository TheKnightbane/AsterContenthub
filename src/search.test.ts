import { afterEach, describe, expect, it, vi } from 'vitest';
import { endpoint, hasResource, searchAddon, searchableCatalogs } from './addons';
import type { InstalledAddon } from '../shared/models';
const addon: InstalledAddon = { url: 'https://catalog.example/config/manifest.json', manifest: { id: 'test.catalog', name: 'Catalog', version: '1.0.0', description: 'Metadata only', types: ['movie'], resources: ['catalog', 'meta'], catalogs: [{ id: 'top', type: 'movie', extra: [{ name: 'search' }] }] } };
afterEach(() => vi.unstubAllGlobals());
describe('remote catalog search', () => {
  it('encodes search extras in the protocol path and retains addon configuration', () => {
    expect(endpoint(addon, 'catalog', 'movie', 'top', { search: 'Tom & Jerry/2021' })).toBe('https://catalog.example/config/catalog/movie/top/search=Tom%20%26%20Jerry%2F2021.json');
  });
  it('supports search-only and legacy catalogs but skips unprovided required extras', () => {
    const configured = { ...addon, manifest: { ...addon.manifest, catalogs: [{ id: 'required-search', type: 'movie', extra: [{ name: 'search', isRequired: true }] }, { id: 'legacy', type: 'movie', extraSupported: ['search'], extraRequired: ['search'] }, { id: 'needs-genre', type: 'movie', extra: [{ name: 'search' }, { name: 'genre', isRequired: true }] }] } };
    expect(searchableCatalogs(configured).map(c => c.id)).toEqual(['required-search', 'legacy']);
    expect(hasResource(addon, 'stream')).toBe(false);
  });
  it('queries the provider rather than filtering a previously loaded catalog', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ metas: [{ id: 'tt-new', name: 'A remotely ranked result', releaseInfo: '2016' }] }) });
    vi.stubGlobal('fetch', fetch);
    const result = await searchAddon(addon, 'Arrival');
    expect(fetch.mock.calls[0][0]).toContain('/search=Arrival.json');
    expect(result.items[0].id).toBe('tt-new');
  });
  it('keeps successful catalogs when another search catalog fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({ ok: true, json: async () => ({ metas: [{ id: 'ok', name: 'Available' }] }) }));
    const result = await searchAddon({ ...addon, manifest: { ...addon.manifest, catalogs: [...addon.manifest.catalogs, { id: 'second', type: 'movie', extraSupported: ['search'] }] } }, 'Available');
    expect(result.failedCatalogs).toBe(1);
    expect(result.items[0].id).toBe('ok');
  });
});
