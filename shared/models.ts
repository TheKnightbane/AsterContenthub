/** Versioned, platform-neutral contracts. Native Swift clients can use the same JSON. */
export type MediaType = 'movie' | 'series';
export interface Media {
  id: string;
  type: MediaType;
  title: string;
  year: number;
  genre: string;
  duration: string;
  description: string;
  art: string;
  accent: string;
  source: string;
  demo?: boolean;
  rating?: string;
  logo?: string;
  catalogId?: string;
  catalogName?: string;
  service?: { provider: string; id: string; parent: string; infoHash?: string };
  imdbId?: string;
  live?: boolean;
  episode?: { seriesId: string; seriesTitle: string; season: number; number: number; title: string };
}
export interface WatchProgress { position: number; duration: number; updatedAt: string }
export interface SavedMedia { media: Media; favorite: boolean; inLibrary: boolean; progress?: WatchProgress; updatedAt: string }
export interface AddonManifest {
  id: string; name: string; version: string; description: string;
  types: string[];
  resources: (string | { name: string; types?: string[]; idPrefixes?: string[] })[];
  catalogs: { id: string; type: string; name?: string; extra?: { name: string; isRequired?: boolean }[]; extraSupported?: string[]; extraRequired?: string[] }[];
  idPrefixes?: string[];
}
export interface InstalledAddon { url: string; manifest: AddonManifest }
export interface LocalState { version: 1; items: Record<string, SavedMedia>; addons: InstalledAddon[]; seeded: boolean }
export interface Stream { name?: string; title?: string; url?: string; externalUrl?: string; infoHash?: string; fileIdx?: number }
export interface SyncRepository { pull(userId: string): Promise<SavedMedia[]>; push(userId: string, items: SavedMedia[]): Promise<void> }
