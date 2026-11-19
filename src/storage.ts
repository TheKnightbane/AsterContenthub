import { activeProfile, profileKey } from './profiles';
import type { LocalState, Media, SavedMedia } from '../shared/models';
export const STORAGE_KEY = 'aster.state.v1';
export const blankState = (): LocalState => ({ version: 1, items: {}, addons: [], seeded: true });
export function initialState(): LocalState {
  return blankState();
}
export const isOpenCinema = (media: Media) => media.demo === true || ['aster:sintel', 'aster:cosmos', 'aster:spring', 'aster:steel', 'aster:bunny', 'aster:caminandes'].includes(media.id);
export function validItem(item: unknown): item is SavedMedia {
  if (!item || typeof item !== 'object') return false;
  const value = item as SavedMedia;
  return !!value.media && typeof value.media.id === 'string' && typeof value.media.title === 'string' && typeof value.favorite === 'boolean' && typeof value.inLibrary === 'boolean' && typeof value.updatedAt === 'string';
}
export function loadState(profileId=activeProfile().id): LocalState {
  try {
    const raw = localStorage.getItem(profileKey(STORAGE_KEY,profileId));
    if (!raw) { const fresh=initialState(); if(profileId!=='default'){try{fresh.addons=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}').addons||[];}catch{}}return fresh; }
    const data = JSON.parse(raw) as LocalState;
    if (data.version !== 1 || !data.items || !Array.isArray(data.addons)) return initialState();
    return { ...data, items: Object.fromEntries(Object.entries(data.items).filter(([, item]) => validItem(item) && !isOpenCinema(item.media))), addons: data.addons.filter(a => a && typeof a.url === 'string' && a.manifest && Array.isArray(a.manifest.catalogs)) };
  } catch { return initialState(); }
}
export function saveState(state: LocalState,profileId=activeProfile().id): boolean {
  try { localStorage.setItem(profileKey(STORAGE_KEY,profileId), JSON.stringify(state)); return true; } catch { return false; }
}
export function updateItem(state: LocalState, media: Media, patch: Partial<Omit<SavedMedia, 'media'>>): LocalState {
  const existing = state.items[media.id] || { media, favorite: false, inLibrary: false, updatedAt: '' };
  return { ...state, items: { ...state.items, [media.id]: { ...existing, ...patch, media, updatedAt: new Date().toISOString() } } };
}

