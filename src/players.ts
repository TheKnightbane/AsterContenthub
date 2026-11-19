import { loadSettings } from './settings';
import type { Media } from '../shared/models';
import { safeUrl } from './addons';
import { invoke, isTauri } from '@tauri-apps/api/core';
export type PlayerChoice = 'builtin' | 'infuse' | 'mpv';
export interface PlaybackPreferences { audioLanguage: string; subtitleLanguage: string; subtitleMode: 'auto' | 'off' }
export const LANGUAGE_OPTIONS = [{ code: '', name: 'Use stream default' }, { code: 'en', name: 'English' }, { code: 'es', name: 'Spanish' }, { code: 'fr', name: 'French' }, { code: 'de', name: 'German' }, { code: 'it', name: 'Italian' }, { code: 'pt', name: 'Portuguese' }, { code: 'hi', name: 'Hindi' }, { code: 'ja', name: 'Japanese' }, { code: 'ko', name: 'Korean' }, { code: 'zh', name: 'Chinese' }, { code: 'ar', name: 'Arabic' }, { code: 'ru', name: 'Russian' }, { code: 'uk', name: 'Ukrainian' }];
export function loadPlaybackPreferences(): PlaybackPreferences {
  try { const value = JSON.parse(localStorage.getItem('aster.playback.v1') || '{}'); return { audioLanguage: LANGUAGE_OPTIONS.some(l => l.code === value.audioLanguage) ? value.audioLanguage : 'en', subtitleLanguage: LANGUAGE_OPTIONS.some(l => l.code === value.subtitleLanguage) ? value.subtitleLanguage : 'en', subtitleMode: value.subtitleMode === 'off' ? 'off' : 'auto' }; } catch { return { audioLanguage: 'en', subtitleLanguage: 'en', subtitleMode: 'auto' }; }
}
export function savePlaybackPreferences(value: PlaybackPreferences): boolean { try { localStorage.setItem('aster.playback.v1', JSON.stringify(value)); return true; } catch { return false; } }
export const mpvAvailable = () => isTauri() ? invoke<boolean>('mpv_available') : Promise.resolve(false);
export async function launchMpv(media: Media, source: string, position: number, sessionId: string, preferences: PlaybackPreferences, bounds: { x: number; y: number; width: number; height: number }) {
  if (!isTauri()) throw new Error('mpv launches from the Windows app. Use the built-in player in browser preview.');
  if (!media.demo) safeUrl(source);
  return invoke<void>('mpv_play', { source, demo: !!media.demo, title: media.title, position, sessionId, ...preferences, options: loadSettings(), ...bounds });
}
export const PLAYER_KEY = 'aster.player.v1';
export function loadPlayer(): PlayerChoice { try { const value = localStorage.getItem(PLAYER_KEY); return value === 'infuse' || value === 'mpv' ? value : 'builtin'; } catch { return 'builtin'; } }
export function savePlayer(player: PlayerChoice): boolean { try { localStorage.setItem(PLAYER_KEY, player); return true; } catch { return false; } }
export function buildInfuseUrl(media: Media, source: string, position: number): string {
  const playable = media.demo ? 'https://media.w3.org/2010/05/sintel/trailer.mp4' : safeUrl(source);
  const url = new URL(playable);
  if (['localhost', 'tauri.localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost')) throw new Error('This stream is local to the Windows app. Use a video URL reachable from your Apple device.');
  const extension = url.pathname.match(/\.(mp4|mkv|m4v|mov|webm|avi)$/i)?.[1] ?? 'mp4';
  const filename = media.demo ? 'Sintel-2010-trailer.mp4' : `${media.title}${media.year ? `-${media.year}` : ''}.${extension}`;
  const params = new URLSearchParams({ url: playable, filename, position: String(Number.isFinite(position) ? Math.max(0, Math.floor(position)) : 0) });
  return `infuse://x-callback-url/play?${params}`;
}
export const supportsInfuseLaunch = () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform) || (/Mac/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
