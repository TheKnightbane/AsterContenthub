import { LoaderCircle, SkipForward } from 'lucide-react';
import type useEpisodeQueue from './useEpisodeQueue';
export default function EpisodeControls({queue,autoNext,changeAuto}:{queue:ReturnType<typeof useEpisodeQueue>;autoNext:boolean;changeAuto:(value:boolean)=>void}){
  return <div className="next-episode-bar"><div className="next-episode-actions"><button className="secondary" aria-label="Next episode" disabled={queue.busy||!queue.canNext} onClick={()=>void queue.advance()}>{queue.busy?<LoaderCircle className="spin" size={17}/>:<SkipForward size={17}/>}<span>Next episode{queue.next&&<small>S{queue.next.season} E{queue.next.number} · {queue.next.title}</small>}</span></button><label><input type="checkbox" checked={autoNext} onChange={e=>changeAuto(e.target.checked)}/>Auto-play next episode</label></div>{queue.status&&<p role="status">{queue.status}</p>}{queue.error&&<p role="alert">{queue.error}</p>}{!queue.canNext&&!queue.error&&<p>You’re caught up with this show.</p>}</div>;
}
