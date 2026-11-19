import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Media } from '../shared/models';
export const providers = [
  { id:'torbox', name:'TorBox', group:'connections', auth:'key', hint:'Browse cloud torrents and resolve magnets or hosted links.', help:'https://torbox.app/settings' },
  { id:'premiumize', name:'Premiumize', group:'connections', auth:'key', hint:'Browse cloud folders and play ready direct downloads.', help:'https://www.premiumize.me/account' },
  { id:'alldebrid', name:'AllDebrid', group:'connections', auth:'key', hint:'Browse magnets and resolve hosted links or movie torrents.', help:'https://alldebrid.com/apikeys/' },
  { id:'pikpak', name:'PikPak', group:'connections', auth:'dav', hint:'Browse and play files through official PikPak WebDAV. Requires PikPak Premium.', help:'https://mypikpak.com/en-US/help-center/connected_apps/webdav/how_to' },
  { id:'webdav', name:'WebDAV', group:'connections', auth:'dav', hint:'Browse folders and play original video files from your server.', help:'' },
  { id:'jellyfin', name:'Jellyfin', group:'connections', auth:'server', hint:'Sign in to your server, browse movies and episodes, and play original files.', help:'https://jellyfin.org/docs/' },
  { id:'emby', name:'Emby', group:'connections', auth:'server', hint:'Sign in to your server, browse movies and episodes, and play original files.', help:'https://emby.media/support.html' },
  { id:'plex', name:'Plex', group:'connections', auth:'serverKey', hint:'Browse your server libraries, shows and episodes using your Plex token.', help:'https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/' },
  { id:'jackett', name:'Jackett', group:'connections', auth:'indexer', hint:'Search your configured Torznab indexers and play magnet results through a debrid service.', help:'https://github.com/Jackett/Jackett/wiki/Jackett-API' },
  { id:'prowlarr', name:'Prowlarr', group:'connections', auth:'indexer', hint:'Search configured indexers and play magnet results through a debrid service.', help:'https://wiki.servarr.com/prowlarr' },
  { id:'iptv', name:'IPTV', group:'connections', auth:'playlist', hint:'Load an M3U playlist, search channels, and watch live streams.', help:'' },
  { id:'trakt', name:'Trakt', group:'tracking', auth:'oauth', hint:'Browse movie watchlists/history and optionally sync completed movies.', help:'https://developer.trakt.tv/docs/create-an-app' },
  { id:'simkl', name:'Simkl', group:'tracking', auth:'oauth', hint:'AUTH V2 sign-in, movie watchlist/history and optional completed-movie sync.', help:'https://simkl.com/settings/developer/' },
  { id:'mdblist', name:'MDBList', group:'tracking', auth:'key', hint:'Browse your lists and play their identified movies using your addons.', help:'https://mdblist.com/preferences/' }
] as const;
export type ProviderId = typeof providers[number]['id'];
export type Provider = typeof providers[number];
export interface ConnectionSummary { provider: ProviderId; account: string; configured: boolean; autoTrack: boolean; verified?: boolean }
export interface ConnectionInput { baseUrl: string; token: string; username: string; password: string; userId: string; clientId: string; clientSecret: string; refreshToken?: string }
export interface ServiceItem { id: string; name: string; kind:'folder'|'video'|'torrent'|'title'; detail:string; parent:string; year:number; imdbId:string; magnet:string; mediaType:string }
export interface ServicePage { items: ServiceItem[]; nextPage: number|null }
export interface DeviceAuth { sessionId:string; userCode:string; verificationUrl:string; interval:number; expiresIn:number }
export function callIntegration<T>(command:string,args:Record<string,unknown>={}):Promise<T>{if(!isTauri())return Promise.reject(new Error('Service connections use the Windows desktop app so credentials stay in Windows Credential Manager.'));return invoke<T>(command,args);}
export async function connections():Promise<ConnectionSummary[]>{if(!isTauri())return [];const result=await invoke<ConnectionSummary[]>('integration_connections');return Array.isArray(result)?result:[];}
export function connectionChanged(){window.dispatchEvent(new Event('aster:integrations-changed'));}
export function playService(media:Media){const service=media.service;if(!service)throw new Error('Missing service reference.');return callIntegration<{url:string}>('integration_play',{provider:service.provider,parent:service.parent,itemId:service.id});}
export function resolveService(provider:string,source:string){return callIntegration<{url:string}>('integration_resolve',{provider,source});}
export function itemMedia(provider:ProviderId,item:ServiceItem):Media {
  const base:Media={ id:`service:${provider}:${item.parent}:${item.id}`,title:item.name,type:item.mediaType==='episode'?'series':'movie',year:item.year||0,genre:item.mediaType==='live'?'Live TV':item.mediaType==='episode'?'Episode':'Your media',duration:item.mediaType==='live'?'Live':'Service video',description:item.detail||`From your ${providers.find(p=>p.id===provider)?.name||provider} connection.`,art:'/art/city.jpg',accent:'#9bd9ff',source:providers.find(p=>p.id===provider)?.name||provider,live:item.mediaType==='live',imdbId:item.imdbId||undefined };
  if(item.kind==='title')return{...base,id:item.imdbId||item.id,genre:'Discover',duration:'Addon title'};
  if(item.kind==='torrent') {
    const hash=new URL(item.magnet).searchParams.getAll('xt').map(x=>x.replace(/^urn:btih:/i,'')).find(x=>/^[a-f0-9]{40}$/i.test(x));
    if(!hash)throw new Error('This search result does not include a supported movie hash.');
    return{...base,id:`torrent:${hash}`,service:{provider,id:item.id,parent:item.parent,infoHash:hash}};
  }
  return{...base,service:{provider,id:item.id,parent:item.parent}};
}
export async function openIntegrationLink(url:string){if(isTauri())return callIntegration('integration_open_url',{url});window.open(url,'_blank','noopener,noreferrer');}
export function chooseResolver(preference:string,rdConnected:boolean,saved:ConnectionSummary[]):string|null{
  if(preference!=='auto')return preference==='real-debrid'?rdConnected?preference:null:saved.some(c=>c.provider===preference)?preference:null;
  return rdConnected?'real-debrid':saved.find(c=>['torbox','premiumize','alldebrid'].includes(c.provider))?.provider||null;
}
