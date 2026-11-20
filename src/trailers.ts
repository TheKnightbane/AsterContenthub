import type { InstalledAddon, Media } from '../shared/models';
import { endpoint, requestJson, supports, safeUrl } from './addons';

export type Trailer = { kind: 'youtube'; id: string } | { kind: 'video'; url: string };
export function parseTrailers(meta: unknown): Trailer[] {
  if (!meta || typeof meta !== 'object') return [];
  const trailers: Trailer[] = [];
  const m = meta as Record<string, unknown>;
  const candidates = [m.trailerStreams, m.trailers].flatMap(v => Array.isArray(v) ? v : []);
  for (const value of candidates) {
    if (!value || typeof value !== 'object') continue;
    if (typeof value.type === 'string' && !/trailer/i.test(value.type)) continue;
    const id = value.ytId ?? value.source;
    if (typeof id === 'string' && /^[\w-]{11}$/.test(id)) { trailers.push({ kind: 'youtube', id }); continue; }
    if (typeof value.url === 'string') {
      try {
        const url = new URL(safeUrl(value.url));
        if (['www.youtube.com', 'youtube.com', 'youtu.be'].includes(url.hostname)) {
          const youtubeId = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
          if (youtubeId && /^[\w-]{11}$/.test(youtubeId)) trailers.push({ kind: 'youtube', id: youtubeId });
        } else if (url.protocol === 'https:') trailers.push({ kind: 'video', url: url.href });
      } catch { /* An invalid trailer must never prevent browsing. */ }
    }
  }
  return [...new Map(trailers.map(t => [JSON.stringify(t), t])).values()];
}
export const parseTrailer = (meta: unknown) => parseTrailers(meta)[0];
// Session-only cache, bounded so browsing large catalogs cannot grow it indefinitely.
const cache = new Map<string, Promise<Trailer[]>>();
export function loadTrailers(addons: InstalledAddon[], media: Media): Promise<Trailer[]> {
  const providers = addons.flatMap(addon => {
    const titleId = media.episode?.seriesId || media.id;
    const id = supports(addon, 'meta', media.type, titleId) ? titleId : media.imdbId;
    return id && supports(addon, 'meta', media.type, id) ? [{ addon, id }] : [];
  });
  const key = JSON.stringify([media.type, media.id, providers.map(p => [p.addon.url, p.id])]);
  if (!cache.has(key)) {
    if (cache.size >= 150) cache.delete(cache.keys().next().value!);
    cache.set(key, (async () => {
      const results = await Promise.allSettled(providers.map(async ({ addon, id }) => {
        const data = await requestJson(endpoint(addon, 'meta', media.type, id)) as { meta?: unknown };
        return parseTrailers(data?.meta);
      }));
      // Retry connection failures on a later hover; missing metadata stays cached.
      if (results.some(r => r.status === 'rejected')) cache.delete(key);
      return [...new Map(results.flatMap(r => r.status === 'fulfilled' ? r.value : []).map(t => [JSON.stringify(t), t])).values()];
    })());
  }
  return cache.get(key)!;
}

export async function loadTrailer(addons: InstalledAddon[], media: Media) { return (await loadTrailers(addons, media))[0]; }
