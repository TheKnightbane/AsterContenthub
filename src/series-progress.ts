import { profileKey } from './profiles';
import type { Media } from '../shared/models';
const KEY='aster.series.v1';
export interface SeriesPosition { selectedSeason:number; episodeId?:string; episodeSeason?:number; episodeNumber?:number; updatedAt:string }
function read():Record<string,SeriesPosition>{try{const value=JSON.parse(localStorage.getItem(profileKey(KEY))||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).filter(([,v])=>v&&typeof v==='object'&&Number.isInteger((v as SeriesPosition).selectedSeason)&&typeof (v as SeriesPosition).updatedAt==='string')) as Record<string,SeriesPosition>:{};}catch{return {};}}
export function seriesPosition(id:string){return read()[id];}
function write(id:string,position:Partial<SeriesPosition>){try{const items=read();items[id]={...items[id],selectedSeason:position.selectedSeason??items[id]?.selectedSeason??1,...position,updatedAt:new Date().toISOString()};localStorage.setItem(profileKey(KEY),JSON.stringify(Object.fromEntries(Object.entries(items).sort((a,b)=>b[1].updatedAt.localeCompare(a[1].updatedAt)).slice(0,1000))));}catch{/* Playback remains available without storage. */}}
export function rememberSeason(id:string,season:number){if(Number.isInteger(season)&&season>=0)write(id,{selectedSeason:season});}
export function rememberEpisode(media:Media){if(media.episode)write(media.episode.seriesId,{selectedSeason:media.episode.season,episodeId:media.id,episodeSeason:media.episode.season,episodeNumber:media.episode.number});}



export function clearSeriesProgress(){try{localStorage.removeItem(profileKey(KEY));}catch{/* Storage may be unavailable. */}}

