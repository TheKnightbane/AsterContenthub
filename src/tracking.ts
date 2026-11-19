import { activeProfile, profileKey } from './profiles';
import type { Media } from '../shared/models';
import type { ConnectionSummary } from './integrations';
import { callIntegration } from './integrations';
interface Job { key:string; provider:string; imdbId:string; watchedAt:string; retryAfter:number }
const QUEUE='aster.tracker.queue.v1', SENT='aster.tracker.sent.v1';
const running=new Set<string>();
const read=<T>(key:string,fallback:T,profileId=activeProfile().id):T=>{try{const value=JSON.parse(localStorage.getItem(profileKey(key,profileId))||'null');return Array.isArray(value)?value as T:fallback;}catch{return fallback;}};
const readJobs=(profileId=activeProfile().id)=>read<Job[]>(QUEUE,[],profileId).filter(j=>j&&typeof j.key==='string'&&['trakt','simkl'].includes(j.provider)&&/^tt\d+$/.test(j.imdbId)&&typeof j.watchedAt==='string'&&Number.isFinite(j.retryAfter));
const write=(key:string,value:unknown,profileId=activeProfile().id)=>{try{localStorage.setItem(profileKey(key,profileId),JSON.stringify(value));}catch{/* Local playback remains available when storage is full. */}};
const identity=(provider:string,imdbId:string,at:string)=>`${provider}:${imdbId}:${at.slice(0,10)}`;
export function markTracked(provider:string,imdbId:string,watchedAt:string,profileId=activeProfile().id){const key=identity(provider,imdbId,watchedAt);const sent=read<string[]>(SENT,[],profileId);write(SENT,[...new Set([...sent,key])].slice(-5000),profileId);write(QUEUE,readJobs(profileId).filter(j=>j.key!==key),profileId);}
export function queueCompletion(media:Media,position:number,duration:number,saved:ConnectionSummary[],threshold:number){
  if(media.type!=='movie'||media.live||!Number.isFinite(duration)||duration<=0||position/duration<threshold/100)return;
  const imdbId=media.imdbId||media.id;if(!/^tt\d+$/.test(imdbId))return;
  const at=new Date().toISOString();const sent=read<string[]>(SENT,[]);const jobs=readJobs();
  for(const c of saved.filter(c=>c.autoTrack&&['trakt','simkl'].includes(c.provider))){const key=identity(c.provider,imdbId,at);if(!sent.includes(key)&&!jobs.some(j=>j.key===key)&&jobs.length<500)jobs.push({key,provider:c.provider,imdbId,watchedAt:at,retryAfter:0});}
  write(QUEUE,jobs);
}
export async function flushTracking(saved:ConnectionSummary[]){const profileId=activeProfile().id;if(running.has(profileId))return;running.add(profileId);try{
  for(const job of readJobs(profileId).slice(0,50)){
    if(job.retryAfter>Date.now()||!saved.some(c=>c.provider===job.provider&&c.autoTrack))continue;
    try{await callIntegration('integration_watched',{provider:job.provider,imdbId:job.imdbId,watchedAt:job.watchedAt});markTracked(job.provider,job.imdbId,job.watchedAt,profileId);}catch{write(QUEUE,readJobs(profileId).map(j=>j.key===job.key?{...j,retryAfter:Date.now()+60000}:j),profileId);}
  }
}finally{running.delete(profileId);}}

