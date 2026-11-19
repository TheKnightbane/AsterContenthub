import type { InstalledAddon, Media } from '../shared/models';
import { endpoint, requestJson, supports, safeUrl } from './addons';

export type Trailer = { kind: 'youtube'; id: string } | { kind: 'video'; url: string };
export function parseTrailer(meta: unknown): Trailer | undefined {
  if (!meta || typeof meta !== 'object') return;
  const m = meta as Record<string, unknown>;
  const candidates = [m.trailerStreams, m.trailers].flatMap(v => Array.isArray(v) ? v : []);
  for (const value of candidates) {
    if (!value || typeof value !== 'object') continue;
    if (typeof value.type === 'string' && !/trailer/i.test(value.type)) continue;
    const id = value.ytId ?? value.source;
    if (typeof id === 'string' && /^[\w-]{11}$/.test(id)) return { kind: 'youtube', id };
    if (typeof value.url === 'string') {
      try {
        const url = new URL(safeUrl(value.url));
        if (['www.youtube.com', 'youtube.com', 'youtu.be'].includes(url.hostname)) {
          const youtubeId = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
          if (youtubeId && /^[\w-]{11}$/.test(youtubeId)) return { kind: 'youtube', id: youtubeId };
        } else if (url.protocol === 'https:') return { kind: 'video', url: url.href };
      } catch { /* An invalid trailer must never prevent browsing. */ }
    }
  }
}
// Session-only cache, bounded so browsing large catalogs cannot grow it indefinitely.
const cache = new Map<string, Promise<Trailer | undefined>>();
export function loadTrailer(addons: InstalledAddon[], media: Media): Promise<Trailer | undefined> {
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
        return parseTrailer(data?.meta);
      }));
      // Retry connection failures on a later hover; missing metadata stays cached.
      if (results.some(r => r.status === 'rejected')) cache.delete(key);
      return results.flatMap(r => r.status === 'fulfilled' && r.value ? [r.value] : [])[0];
    })());
  }
  return cache.get(key)!;
}
