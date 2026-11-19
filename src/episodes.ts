import type { InstalledAddon, Media } from '../shared/models';
import { endpoint, requestJson, supports } from './addons';
export interface Episode { id:string; title:string; season:number; number:number; overview:string; released:string }
export function parseEpisodes(value:unknown):Episode[]{
  if(!Array.isArray(value))return [];
  const episodes=value.flatMap((v,index)=>{
    if(!v||typeof v!=='object'||typeof v.id!=='string'||!v.id||v.id.length>1000)return [];
    const suffix=v.id.match(/:(\d+):(\d+)$/);
    const season=v.season??(suffix?Number(suffix[1]):1),number=v.episode??(suffix?Number(suffix[2]):index+1);
    if(!Number.isInteger(season)||season<0||!Number.isInteger(number)||number<0)return [];
    return [{id:v.id,title:typeof v.title==='string'?v.title:typeof v.name==='string'?v.name:`Episode ${number}`,season,number,overview:typeof v.overview==='string'?v.overview:'',released:typeof v.released==='string'?v.released:''}];
  });
  return [...new Map(episodes.map(e=>[e.id,e])).values()].sort((a,b)=>a.season-b.season||a.number-b.number);
}
export async function loadEpisodes(addons:InstalledAddon[],media:Media):Promise<Episode[]>{
  const providers=addons.filter(a=>supports(a,'meta','series',media.id));
  if(!providers.length)throw new Error('Install a metadata addon such as Cinemeta to load seasons and episodes.');
  const results=await Promise.allSettled(providers.map(async addon=>{
    const data=await requestJson(endpoint(addon,'meta','series',media.id)) as {meta?:{videos?:unknown}};
    return parseEpisodes(data?.meta?.videos);
  }));
  const episodes=[...new Map(results.flatMap(r=>r.status==='fulfilled'?r.value:[]).map(e=>[e.id,e])).values()].sort((a,b)=>a.season-b.season||a.number-b.number);
  if(!episodes.length&&results.some(r=>r.status==='rejected'))throw new Error('Episode details could not be loaded. Check your metadata addons and retry.');
  return episodes;
}
export function episodeMedia(series:Media,episode:Episode):Media{return {...series,id:episode.id,title:`${series.title} · S${episode.season} E${episode.number} · ${episode.title}`,description:episode.overview||series.description,duration:'Episode',episode:{seriesId:series.id,seriesTitle:series.title,season:episode.season,number:episode.number,title:episode.title}};}
export function seriesMedia(media:Media):Media{return media.episode?{...media,id:media.episode.seriesId,title:media.episode.seriesTitle,episode:undefined}:media;}
export function nextEpisode(episodes:Episode[],current:Media,now=Date.now()):Episode|undefined{
  if(!current.episode)return;
  const {season,number}=current.episode;
  return [...episodes].sort((a,b)=>a.season-b.season||a.number-b.number).find(e=>e.season>0&&(e.season>season||(e.season===season&&e.number>number))&&(!e.released||!Number.isFinite(Date.parse(e.released))||Date.parse(e.released)<=now));
}
export function episodeFile<T extends {path:string;bytes:number}>(files:T[],media:Media):T|undefined{
  const candidates=files.filter(f=>!f.path.toLowerCase().includes('sample'));
  if(!media.episode)return candidates.sort((a,b)=>b.bytes-a.bytes)[0];
  const {season,number}=media.episode;
  const pattern=new RegExp(`(?:s0*${season}[ ._-]*e0*${number}(?!\\d)|(?:^|[^\\d])0*${season}x0*${number}(?!\\d))`,'i');
  return candidates.filter(f=>pattern.test(f.path)).sort((a,b)=>b.bytes-a.bytes)[0]||(candidates.length===1?candidates[0]:undefined);
}
