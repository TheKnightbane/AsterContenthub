import { invoke, isTauri } from '@tauri-apps/api/core';
import type { AddonManifest, InstalledAddon, Media, Stream } from '../shared/models';
export function safeUrl(value: string): string {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS URL without embedded credentials.');
  return url.href;
}
export async function requestJson(url: string): Promise<unknown> {
  safeUrl(url);
  if (isTauri()) return invoke('addon_get', { url });
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Addon returned HTTP ${response.status}.`);
  return response.json();
}
export function validateManifest(value: unknown): AddonManifest {
  const m = value as AddonManifest;
  if (!m || !['id', 'name', 'version', 'description'].every(k => typeof (m as unknown as Record<string, unknown>)[k] === 'string') || !Array.isArray(m.resources) || !Array.isArray(m.types) || !Array.isArray(m.catalogs) || !m.catalogs.every(c => c && typeof c.id === 'string' && typeof c.type === 'string')) throw new Error('This URL does not return a valid Stremio addon manifest.');
  return m;
}
export async function installAddon(input: string): Promise<InstalledAddon> {
  const url = safeUrl(input.trim().replace(/^stremio:\/\//, 'https://'));
  if (!new URL(url).pathname.endsWith('/manifest.json')) throw new Error('Enter the full addon URL ending in /manifest.json.');
  return { url, manifest: validateManifest(await requestJson(url)) };
}
export function endpoint(addon: InstalledAddon, resource: string, type: string, id: string, extras?: Record<string, string>): string {
  const suffix = extras && Object.keys(extras).length ? '/' + Object.entries(extras).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&') : '';
  return `${addon.url.slice(0, addon.url.lastIndexOf('/'))}/${resource}/${encodeURIComponent(type)}/${encodeURIComponent(id)}${suffix}.json`;
}
export const hasResource = (addon: InstalledAddon, name: string) => addon.manifest.resources.some(r => (typeof r === 'string' ? r : r.name) === name);
export function searchableCatalogs(addon: InstalledAddon) {
  return addon.manifest.catalogs.filter(c => ['movie', 'series'].includes(c.type) &&
    (c.extra?.some(e => e.name === 'search') || c.extraSupported?.includes('search')) &&
    !c.extra?.some(e => e.isRequired && e.name !== 'search') && !c.extraRequired?.some(name => name !== 'search'));
}
export function supports(addon: InstalledAddon, resource: string, type: string, id: string): boolean {
  return addon.manifest.resources.some(r => {
    const spec = typeof r === 'string' ? { name: r, types: addon.manifest.types, idPrefixes: addon.manifest.idPrefixes } : r;
    return spec.name === resource && (spec.types ?? addon.manifest.types).includes(type) && (!spec.idPrefixes?.length || spec.idPrefixes.some(prefix => id.startsWith(prefix)));
  });
}
export async function addonCatalog(addon: InstalledAddon): Promise<Media[]> {
  const catalogs = addon.manifest.catalogs.filter(c => ['movie', 'series'].includes(c.type) && !c.extra?.some(e => e.isRequired) && !c.extraRequired?.length);
  return (await requestCatalogs(addon, catalogs)).items;
}
async function requestCatalogs(addon: InstalledAddon, catalogs: AddonManifest['catalogs'], extras?: Record<string, string>) {
  const results = await Promise.allSettled(catalogs.map(async c => {
    const data = await requestJson(endpoint(addon, 'catalog', c.type, c.id, extras)) as { metas?: Record<string, unknown>[] };
    if (!Array.isArray(data.metas)) throw new Error('Addon catalog has no metas array.');
    return data.metas.filter(m => typeof m.id === 'string' && typeof m.name === 'string').slice(0, 80).map(m => ({ id: m.id as string, type: c.type as Media['type'], title: m.name as string, year: Number(String(m.releaseInfo ?? '').slice(0, 4)) || 0, genre: Array.isArray(m.genres) ? String(m.genres[0] ?? 'Discover') : 'Discover', duration: typeof m.runtime === 'string' ? m.runtime : 'Addon title', description: typeof m.description === 'string' ? m.description : `Discover this title from ${addon.manifest.name}.`, art: typeof m.background === 'string' ? m.background : typeof m.poster === 'string' ? m.poster : '/art/mountains.jpg', accent: '#a5b8a2', source: addon.manifest.name, imdbId: typeof (m.imdb_id ?? m.imdbId) === 'string' && /^tt\d+$/.test(String(m.imdb_id ?? m.imdbId)) ? String(m.imdb_id ?? m.imdbId) : undefined, catalogId: c.id, catalogName: c.name || (c.type === 'series' ? 'Popular Series' : 'Popular Movies'), rating: typeof m.imdbRating === 'string' || typeof m.imdbRating === 'number' ? String(m.imdbRating) : undefined, logo: typeof m.logo === 'string' ? m.logo : undefined }));
  }));
  if (results.length && results.every(r => r.status === 'rejected')) throw new Error(`${addon.manifest.name} could not load its catalog. Check the addon connection and try again.`);
  return { items: results.flatMap(r => r.status === 'fulfilled' ? r.value : []), failedCatalogs: results.filter(r => r.status === 'rejected').length };
}
export function searchAddon(addon: InstalledAddon, query: string) {
  return requestCatalogs(addon, searchableCatalogs(addon), { search: query.trim() });
}
export async function resolveStreams(addons: InstalledAddon[], media: Media): Promise<Stream[]> {
  const eligible = addons.filter(a => supports(a, 'stream', media.type, media.id));
  const results = await Promise.allSettled(eligible.map(async addon => {
    const data = await requestJson(endpoint(addon, 'stream', media.type, media.id)) as { streams?: Stream[] };
    return Array.isArray(data.streams) ? data.streams.filter(s => s && typeof s === 'object') : [];
  }));
  if (results.length && results.every(r => r.status === 'rejected')) throw new Error('The stream addons could not be reached. Try again later.');
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}
