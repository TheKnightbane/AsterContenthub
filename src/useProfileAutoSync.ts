import { useEffect, useRef } from 'react';
import type { LocalState, SavedMedia } from '../shared/models';
import type { LocalProfile } from './profiles';
import { syncProfile } from './profile-sync';
export default function useProfileAutoSync(profile:LocalProfile,state:LocalState,merge:(items:SavedMedia[])=>void){
  const latest=useRef({profile,state,merge});latest.current={profile,state,merge};const running=useRef(false);
  const sync=async()=>{if(running.current||!latest.current.profile.cloudId||!navigator.onLine)return;running.current=true;const current=latest.current;try{const items=await syncProfile(current.profile,Object.values(current.state.items));current.merge(items);}catch{/* Local changes stay queued for the next online retry. */}finally{running.current=false;}};
  useEffect(()=>{if(!profile.cloudId)return;const timer=setInterval(()=>void sync(),30000);const online=()=>void sync();window.addEventListener('online',online);void sync();return()=>{clearInterval(timer);window.removeEventListener('online',online);};},[profile.id,profile.cloudId]);
  useEffect(()=>{if(!profile.cloudId)return;const timer=setTimeout(()=>void sync(),2000);return()=>clearTimeout(timer);},[profile.id,profile.cloudId,state.items]);
}
