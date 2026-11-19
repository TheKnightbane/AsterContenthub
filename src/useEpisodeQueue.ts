import { useEffect, useRef, useState } from 'react';
import type { InstalledAddon, Media } from '../shared/models';
import type { AppSettings } from './settings';
import { rankedSources } from './settings';
import { episodeMedia, loadEpisodes, nextEpisode, seriesMedia, type Episode } from './episodes';
import { resolveStreams } from './addons';
import { playableSource } from './PlayerSources';
export default function useEpisodeQueue(media:Media,addons:InstalledAddon[],settings:AppSettings,transition:(media:Media,url:string,signal:AbortSignal)=>Promise<void>|void){
  const [episodes,setEpisodes]=useState<Episode[]|null>(null),[metadataError,setMetadataError]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
  const active=useRef<AbortController|null>(null),mounted=useRef(true),endedFor=useRef(''),transitionRef=useRef(transition);transitionRef.current=transition;
  const seriesId=media.episode?.seriesId;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;active.current?.abort();};},[]);
  useEffect(()=>{let cancelled=false;setEpisodes(null);setMetadataError('');if(seriesId)void loadEpisodes(addons,seriesMedia(media)).then(items=>{if(!cancelled)setEpisodes(items);}).catch(e=>{if(!cancelled)setMetadataError(e.message);});return()=>{cancelled=true;active.current?.abort();};},[seriesId,addons]);
  const next=episodes?nextEpisode(episodes,media):undefined;
  const advance=async()=>{
    if(!media.episode||active.current)return;
    const controller=new AbortController();active.current=controller;setBusy(true);setError('');setStatus('Finding the next episode…');
    const live=()=>mounted.current&&!controller.signal.aborted;
    try{
      const list=episodes??await loadEpisodes(addons,seriesMedia(media));if(!live())return;setEpisodes(list);setMetadataError('');
      const entry=nextEpisode(list,media);if(!entry){setStatus('You’re caught up. No released episode follows this one.');return;}
      const upcoming=episodeMedia(seriesMedia(media),entry);
      const streams=await resolveStreams(addons,upcoming);controller.signal.throwIfAborted();
      const candidates=rankedSources(streams,settings.quality);const source=candidates[0]??rankedSources(streams.filter(s=>s.infoHash),settings.quality,true)[0];
      if(!source)throw new Error('No playable source was found for the next episode. You can retry or choose another link.');
      const url=await playableSource(upcoming,source,settings,controller.signal,text=>{if(live())setStatus(text);});controller.signal.throwIfAborted();
      if(live()){await transitionRef.current(upcoming,url,controller.signal);if(live()){setStatus('');}}
    }catch(e){if(live()){setError(e instanceof Error?e.message:'Could not load the next episode.');setStatus('');}}
    finally{if(active.current===controller)active.current=null;if(live())setBusy(false);}
  };
  const ended=()=>{if(!settings.autoNext||!media.episode||endedFor.current===media.id)return;endedFor.current=media.id;void advance();};
  return {next,busy,status,error:error||metadataError,canNext:!!media.episode&&(!!next||episodes===null||!!metadataError),advance,ended};
}

