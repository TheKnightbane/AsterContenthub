import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Stream } from '../shared/models';
import { safeUrl } from './addons';
export interface DebridUser { username: string; type: string; expiration?: string; premium?: number }
export interface TorrentFile { id: number; path: string; bytes: number; selected: number }
export interface TorrentInfo { id: string; filename: string; status: string; progress: number; files: TorrentFile[]; links: string[] }
export interface DebridLink { download: string; filename: string }
let sessionToken = '';
const API = 'https://api.real-debrid.com/rest/1.0/';

async function browserRequest<T>(method: string, path: string, params: Record<string, string>, token = sessionToken): Promise<T> {
  if (!token) throw new Error('Connect your Real-Debrid account first.');
  const response = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body: method === 'POST' ? new URLSearchParams(params) : undefined, signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (response.status === 202 || response.status === 204) return {} as T;
  if (!response.ok) throw new Error(`Real-Debrid request failed (HTTP ${response.status}). Check your token, account status, or source availability.`);
  return response.json();
}
export async function debridRequest<T>(method: string, path: string, params: Record<string, string> = {}): Promise<T> {
  if (isTauri()) return invoke<T>('rd_request', { method, path, params });
  return browserRequest<T>(method, path, params);
}
export async function connectDebrid(token: string): Promise<DebridUser> {
  token = token.trim();
  if (!token || /\s/.test(token) || token.length > 2048) throw new Error('Enter a valid API token.');
  if (isTauri()) return invoke('rd_connect', { token });
  const user = await browserRequest<DebridUser>('GET', 'user', {}, token);
  sessionToken = token;
  return user;
}
export async function disconnectDebrid(): Promise<void> {
  if (isTauri()) await invoke('rd_disconnect');
  sessionToken = '';
}
export const getDebridUser = () => debridRequest<DebridUser>('GET', 'user');
export async function unrestrictLink(link: string): Promise<DebridLink> {
  const result = await debridRequest<DebridLink>('POST', 'unrestrict/link', { link: safeUrl(link) });
  if (!result.download || !result.filename) throw new Error('Real-Debrid did not return a playable link.');
  safeUrl(result.download);
  return result;
}
export function streamMagnet(stream: Stream): string {
  if (!stream.infoHash || !/^[a-f0-9]{40}$/i.test(stream.infoHash)) throw new Error('This source does not contain a supported torrent info hash.');
  return `magnet:?xt=urn:btih:${stream.infoHash}`;
}
export function parseMagnet(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'magnet:' || !url.searchParams.getAll('xt').some(xt => /^urn:btih:([a-f0-9]{40}|[a-z2-7]{32})$/i.test(xt))) throw new Error('Enter a valid BitTorrent magnet link.');
  return url.href;
}
export async function addMagnet(magnet: string): Promise<string> {
  const result = await debridRequest<{ id: string }>('POST', 'torrents/addMagnet', { magnet: parseMagnet(magnet) });
  if (!result.id || !/^[a-z0-9]+$/i.test(result.id)) throw new Error('Real-Debrid returned an invalid torrent ID.');
  return result.id;
}
export const torrentInfo = (id: string) => debridRequest<TorrentInfo>('GET', `torrents/info/${encodeURIComponent(id)}`);
export const selectFile = (id: string, file: number) => debridRequest('POST', `torrents/selectFiles/${encodeURIComponent(id)}`, { files: String(file) });
export function selectedFileLink(info: TorrentInfo, fileId: number): string {
  if (info.status !== 'downloaded') throw new Error(`Real-Debrid is preparing this source (${info.status}, ${Math.round(info.progress || 0)}%). Recheck when ready.`);
  const files = info.files.filter(file => file.selected === 1);
  const index = files.findIndex(file => file.id === fileId);
  if (index < 0 || files.length !== info.links.length || !info.links[index]) throw new Error('Could not match this file to a Real-Debrid link. Select a single file and retry.');
  return safeUrl(info.links[index]);
}
export const isVideo = (file: TorrentFile) => /\.(mp4|mkv|m4v|mov|webm|avi|ts|m2ts)$/i.test(file.path);
