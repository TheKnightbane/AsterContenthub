import { beforeEach, expect, it } from 'vitest';
import { rememberEpisode, rememberSeason, seriesPosition } from './series-progress';
import { episodeMedia, parseEpisodes } from './episodes';
import { demoCatalog } from './data';
beforeEach(()=>{const values=new Map<string,string>();Object.assign(globalThis,{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)}});});
it('retains the last played episode separately from a browsed season',()=>{
  const media=episodeMedia({...demoCatalog[0],id:'show',title:'Show'},parseEpisodes([{id:'show:2:3',season:2,episode:3}])[0]);
  rememberEpisode(media);rememberSeason('show',4);
  expect(seriesPosition('show')).toMatchObject({selectedSeason:4,episodeId:'show:2:3',episodeSeason:2,episodeNumber:3});
  rememberEpisode(media);expect(seriesPosition('show')?.selectedSeason).toBe(2);
});
it('ignores corrupt series state and keeps playback available',()=>{
  localStorage.setItem('aster.series.v1','[invalid');expect(seriesPosition('show')).toBeUndefined();rememberSeason('show',2);expect(seriesPosition('show')?.selectedSeason).toBe(2);
});
