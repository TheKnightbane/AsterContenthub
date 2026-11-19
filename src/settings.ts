import { activeProfile, profileKey } from './profiles';
import type { LocalState, Media, SavedMedia, Stream } from '../shared/models';
import { blankState, isOpenCinema, validItem } from './storage';
import { safeUrl } from './addons';

export interface Collection { id: string; name: string; mediaIds: string[] }
export interface AppSettings {
  debridService: 'auto' | 'real-debrid' | 'torbox' | 'premiumize' | 'alldebrid';
  accent: 'lime' | 'ice' | 'violet'; density: 'comfortable' | 'compact'; textSize: 'standard' | 'large'; reducedMotion: boolean; pinnedSidebar: boolean;
  hoverTrailers: boolean; showSpotlight: boolean; showContinue: boolean; showRatings: boolean; showLogos: boolean; showBadges: boolean; hiddenRows: string[];
  onlineSearch: boolean; searchDelay: number; searchSort: 'relevance' | 'title' | 'year'; discovery: 'all' | 'movie' | 'series';
  saveHistory: boolean; watchedThreshold: number; profileName: string; collections: Collection[];
  quality: 'auto' | '1080' | '2160' | '720'; resume: boolean; autoNext: boolean; volume: number; speed: number; hardwareDecoding: boolean; subtitleScale: number; subtitleDelay: number; audioDelay: number; seekSeconds: number; controlsDelay: number;
}
export const SETTINGS_KEY = 'aster.settings.v1';
export const defaultSettings = (): AppSettings => ({ debridService: 'auto', accent: 'lime', density: 'comfortable', textSize: 'standard', reducedMotion: false, pinnedSidebar: false, hoverTrailers: true, showSpotlight: true, showContinue: true, showRatings: true, showLogos: true, showBadges: true, hiddenRows: [], onlineSearch: true, searchDelay: 350, searchSort: 'relevance', discovery: 'all', saveHistory: true, watchedThreshold: 95, profileName: 'Your space', collections: [], quality: '1080', resume: true, autoNext: true, volume: 100, speed: 1, hardwareDecoding: true, subtitleScale: 1, subtitleDelay: 0, audioDelay: 0, seekSeconds: 10, controlsDelay: 2.5 });
export function normalizeSettings(input: unknown): AppSettings {
  const result = defaultSettings();
  if (!input || typeof input !== 'object') return result;
  const v = input as Record<string, unknown>;
  for (const key of ['hoverTrailers', 'reducedMotion', 'pinnedSidebar', 'showSpotlight', 'showContinue', 'showRatings', 'showLogos', 'showBadges', 'onlineSearch', 'saveHistory', 'resume', 'autoNext', 'hardwareDecoding'] as const) if (typeof v[key] === 'boolean') result[key] = v[key] as boolean;
  const enums = { debridService: ['auto', 'real-debrid', 'torbox', 'premiumize', 'alldebrid'], accent: ['lime', 'ice', 'violet'], density: ['comfortable', 'compact'], textSize: ['standard', 'large'], searchSort: ['relevance', 'title', 'year'], discovery: ['all', 'movie', 'series'], quality: ['auto', '1080', '2160', '720'] };
  for (const key of Object.keys(enums) as (keyof typeof enums)[]) if (enums[key].includes(String(v[key]))) Object.assign(result, { [key]: v[key] });
  const ranges = { searchDelay: [250, 1500], watchedThreshold: [80, 99], volume: [0, 100], speed: [.5, 2], subtitleScale: [.5, 2], subtitleDelay: [-30, 30], audioDelay: [-5, 5], seekSeconds: [5, 60], controlsDelay: [1, 10] };
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) if (typeof v[key] === 'number' && Number.isFinite(v[key])) result[key] = Math.max(ranges[key][0], Math.min(ranges[key][1], v[key] as number));
  if (typeof v.profileName === 'string' && v.profileName.trim()) result.profileName = v.profileName.trim().slice(0, 40);
  if (Array.isArray(v.hiddenRows)) result.hiddenRows = v.hiddenRows.filter(x => typeof x === 'string' && x.length < 500).slice(0, 200);
  if (Array.isArray(v.collections)) result.collections = v.collections.filter(c => c && typeof c.id === 'string' && typeof c.name === 'string' && Array.isArray(c.mediaIds)).slice(0, 100).map(c => ({ id: c.id.slice(0, 100), name: c.name.slice(0, 60), mediaIds: c.mediaIds.filter((id: unknown) => typeof id === 'string').slice(0, 1000) }));
  return result;
}
export function loadSettings(profileId=activeProfile().id): AppSettings { try { return normalizeSettings(JSON.parse(localStorage.getItem(profileKey(SETTINGS_KEY,profileId)) || '{}')); } catch { return defaultSettings(); } }
export function saveSettings(settings: AppSettings,profileId=activeProfile().id) { try { localStorage.setItem(profileKey(SETTINGS_KEY,profileId), JSON.stringify(normalizeSettings(settings))); return true; } catch { return false; } }
export const rowKey = (m: Media) => `${m.source}:${m.type}:${m.catalogId ?? 'all'}`;
export function sourceLabel(stream: Stream) {
  // Provider descriptions sometimes contain signed URLs. Never expose them in the chooser.
  const clean = (value: string) => value.replace(/(?:https?:\/\/|magnet:\?)[^\s]+/gi, '').replace(/[\u0000-\u001f]/g, ' ').trim();
  return { name: clean(stream.name || '') || (stream.infoHash ? 'Torrent source' : 'Video source'), detail: clean(stream.title || '').slice(0, 180) || 'Ready for your selected player' };
}
export function sourceQuality(stream: Stream) { const text = `${stream.name || ''} ${stream.title || ''}`; return /2160|4k|uhd/i.test(text) ? 2160 : /1080|fhd/i.test(text) ? 1080 : /720/i.test(text) ? 720 : 0; }
export function rankedSources(streams: Stream[], quality: AppSettings['quality'], allowTorrent = false) {
  return streams.filter(s => { if (allowTorrent && s.infoHash && /^[a-f0-9]{40}$/i.test(s.infoHash)) return true; try { return !!s.url && !!safeUrl(s.url); } catch { return false; } }).map((s, index) => ({ s, index, score: (quality === 'auto' ? sourceQuality(s) / 10 : sourceQuality(s) === Number(quality) ? 1000 : sourceQuality(s) > Number(quality) ? -100 : sourceQuality(s) / 10) })).sort((a, b) => b.score - a.score || a.index - b.index).map(x => x.s);
}
export interface Backup { format: 'aster-backup'; version: 1; createdAt: string; items: Record<string, SavedMedia>; settings: AppSettings }
export function createBackup(state: LocalState, settings: AppSettings): Backup { return { format: 'aster-backup', version: 1, createdAt: new Date().toISOString(), items: Object.fromEntries(Object.entries(state.items).filter(([, item]) => !isOpenCinema(item.media))), settings }; }
export function parseBackup(text: string): Backup {
  if (text.length > 5 * 1024 * 1024) throw new Error('Backup exceeds 5 MB.');
  const v = JSON.parse(text);
  if (v?.format !== 'aster-backup' || v.version !== 1 || !v.items || typeof v.items !== 'object' || Array.isArray(v.items)) throw new Error('Choose an Aster backup JSON file.');
  const items: Record<string, SavedMedia> = {};
  for (const [key, item] of Object.entries(v.items)) {
    if (!validItem(item) || item.media.id !== key || !['movie', 'series'].includes(item.media.type) || !['art', 'description', 'source', 'genre', 'duration', 'accent'].every(k => typeof (item.media as unknown as Record<string, unknown>)[k] === 'string') || !Number.isFinite(item.media.year)) throw new Error('This backup contains an invalid media record. No changes were made.');
    if (item.progress && (!Number.isFinite(item.progress.position) || !Number.isFinite(item.progress.duration) || item.progress.position < 0 || item.progress.duration <= 0)) throw new Error('This backup contains invalid watch progress.');
    if (!isOpenCinema(item.media)) items[key] = item;
  }
  return { format: 'aster-backup', version: 1, createdAt: String(v.createdAt || ''), items, settings: normalizeSettings(v.settings) };
}
export function mergeBackup(state: LocalState, backup: Backup): LocalState {
  const items = { ...state.items };
  for (const [id, item] of Object.entries(backup.items)) if (!items[id] || item.updatedAt > items[id].updatedAt) items[id] = item;
  return { ...blankState(), ...state, items };
}


