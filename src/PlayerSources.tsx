import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Play } from 'lucide-react';
import type { InstalledAddon, Media, Stream } from '../shared/models';
import type { AppSettings } from './settings';
import { sourceLabel, sourceQuality } from './settings';
import { resolveStreams, safeUrl } from './addons';
import { connections, chooseResolver, resolveService } from './integrations';
import { addMagnet, getDebridUser, isVideo, selectFile, selectedFileLink, streamMagnet, torrentInfo, unrestrictLink } from './debrid';
import { episodeFile } from './episodes';
export async function playableSource(media:Media,source:Stream,settings:AppSettings,signal:AbortSignal,status:(text:string)=>void):Promise<string>{
  if(source.url)return safeUrl(source.url);
  if(!source.infoHash)throw new Error('This source has no supported playback link.');
  let rd=false;try{await getDebridUser();rd=true;}catch{/* Other cloud providers remain available. */}
  signal.throwIfAborted();const resolver=chooseResolver(settings.debridService,rd,await connections());signal.throwIfAborted();
  if(!resolver)throw new Error('Connect a torrent service in Settings to play this source.');
  status('Preparing the selected source…');
  if(resolver!=='real-debrid'){
    if(media.episode)throw new Error('For episode torrents, use Real-Debrid or choose the exact episode file in your connected cloud library.');
    return (await resolveService(resolver,streamMagnet(source))).url;
  }
  const id=await addMagnet(streamMagnet(source));signal.throwIfAborted();let info=await torrentInfo(id);signal.throwIfAborted();
  const file=episodeFile((info.files||[]).filter(isVideo),media);
  if(!file)throw new Error('The selected source has no matching video file. Try another source.');
  if(info.status==='waiting_files_selection')await selectFile(id,file.id);
  for(let attempt=0;attempt<8;attempt++){
    signal.throwIfAborted();info=await torrentInfo(id);signal.throwIfAborted();
    if(info.status==='downloaded')return (await unrestrictLink(selectedFileLink(info,file.id))).download;
    if(['error','magnet_error','virus','dead','magnet_conversion'].includes(info.status))throw new Error('This source is unavailable. Try another source.');
    status(`Preparing the selected source (${Math.round(info.progress||0)}%)…`);
    await new Promise<void>(resolve=>setTimeout(resolve,1500));
  }
  throw new Error('This source is still preparing. Your current video is still available; try another link.');
}
export default function PlayerSources({media,addons,settings,currentSource,select}:{media:Media;addons:InstalledAddon[];settings:AppSettings;currentSource:string;select:(url:string)=>void}){
  const [sources,setSources]=useState<Stream[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState<number|null>(null),[error,setError]=useState(''),[status,setStatus]=useState(''),[attempt,setAttempt]=useState(0);
  const mounted=useRef(true),operation=useRef<AbortController|null>(null);
  useEffect(()=>{mounted.current=true;let cancelled=false;setLoading(true);setError('');void resolveStreams(addons,media).then(items=>{if(!cancelled)setSources(items);}).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;mounted.current=false;operation.current?.abort();};},[media.id,addons,attempt]);
  const choose=async(source:Stream,index:number)=>{const controller=new AbortController();operation.current?.abort();operation.current=controller;setBusy(index);setError('');setStatus('Opening the selected source…');try{const url=await playableSource(media,source,settings,controller.signal,text=>{if(mounted.current&&!controller.signal.aborted)setStatus(text);});if(mounted.current&&!controller.signal.aborted)select(url);}catch(e){if(mounted.current&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Could not open this source.');}finally{if(mounted.current&&!controller.signal.aborted){setBusy(null);setStatus('');}}};
  return <section className="player-source-panel" aria-label="Playback sources"><h3>Change source</h3><p>Choose another link. Playback continues from your current position when it loads.</p>{loading&&<p role="status"><LoaderCircle className="spin" size={16}/> Finding sources…</p>}{error&&<p role="alert" className="message error">{error}</p>}{status&&<p role="status">{status}</p>}<div className="player-source-list">{sources.map((source,index)=>{const label=sourceLabel(source),quality=sourceQuality(source),current=source.url===currentSource;return <button key={index} className={`player-source-option ${current?'chosen':''}`} aria-label={`${current?'Current source: ':'Play source: '}${label.name} ${label.detail}`} disabled={busy!==null||(!source.url&&!source.infoHash)} onClick={()=>void choose(source,index)}>{busy===index?<LoaderCircle className="spin" size={17}/>:current?<Check size={17}/>:<Play size={17}/>}<span>{label.name}<small>{label.detail}</small></span>{quality>0&&<b>{quality===2160?'4K':`${quality}p`}</b>}</button>;})}</div>{!loading&&!sources.length&&!error&&<p>No alternate links were returned by your stream addons for this title.</p>}<button className="secondary" disabled={loading||busy!==null} onClick={()=>setAttempt(n=>n+1)}>Refresh sources</button></section>;
}

