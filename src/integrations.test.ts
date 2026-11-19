import { beforeEach, expect, it } from 'vitest';
import { chooseResolver, itemMedia, type ConnectionSummary, type ServiceItem } from './integrations';
import { markTracked, queueCompletion } from './tracking';
const saved:ConnectionSummary[]=[{provider:'torbox',account:'Test',configured:true,autoTrack:false},{provider:'trakt',account:'Test',configured:true,autoTrack:true}];
const item:ServiceItem={id:'file-1',name:'Movie',kind:'video',detail:'',parent:'folder-1',year:2020,imdbId:'tt12345',magnet:'',mediaType:'movie'};
beforeEach(()=>{const values=new Map<string,string>();Object.assign(globalThis,{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});});
it('selects only an available resolver and respects the explicit preference',()=>{
  expect(chooseResolver('auto',true,saved)).toBe('real-debrid');
  expect(chooseResolver('auto',false,saved)).toBe('torbox');
  expect(chooseResolver('premiumize',true,saved)).toBeNull();
  expect(chooseResolver('torbox',true,saved)).toBe('torbox');
});
it('saves opaque file references and strips private tracker URLs from indexer results',()=>{
  expect(itemMedia('webdav',item).service).toEqual({provider:'webdav',id:'file-1',parent:'folder-1'});
  const result=itemMedia('prowlarr',{...item,kind:'torrent',magnet:'magnet:?xt=urn:btih:'+'a'.repeat(40)+'&tr=https://tracker.test/private-passkey'});
  expect(result.service?.infoHash).toBe('a'.repeat(40));expect(JSON.stringify(result)).not.toContain('private-passkey');
  expect(()=>itemMedia('jackett',{...item,kind:'torrent',magnet:'magnet:?xt=invalid'})).toThrow();
});
it('queues completed movies only after opt-in and deduplicates successful tracking',()=>{
  const media=itemMedia('webdav',item);
  queueCompletion(media,98,100,saved.map(c=>({...c,autoTrack:false})),95);
  expect(JSON.parse(localStorage.getItem('aster.tracker.queue.v1')||'[]')).toHaveLength(0);
  queueCompletion(media,20,100,saved,95);
  expect(JSON.parse(localStorage.getItem('aster.tracker.queue.v1')||'[]')).toHaveLength(0);
  queueCompletion(media,98,100,saved,95);queueCompletion(media,99,100,saved,95);
  const jobs=JSON.parse(localStorage.getItem('aster.tracker.queue.v1')!);expect(jobs).toHaveLength(1);
  markTracked('trakt','tt12345',jobs[0].watchedAt);queueCompletion(media,100,100,saved,95);
  expect(JSON.parse(localStorage.getItem('aster.tracker.queue.v1')!)).toHaveLength(0);
});
