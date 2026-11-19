import { expect, it } from 'vitest';
import { episodeFile, episodeMedia, nextEpisode, parseEpisodes } from './episodes';
import { demoCatalog } from './data';
it('normalizes addon episodes, preserves exact video IDs and sorts specials and seasons',()=>{
  const items=parseEpisodes([{id:'tt123:2:3',title:'Third',season:2,episode:3},{id:'tt123:1:1',title:'Pilot',season:1,episode:1},{id:'special',season:0,episode:1},{id:'bad',season:-1,episode:1},{title:'Missing ID'}]);
  expect(items.map(e=>e.id)).toEqual(['special','tt123:1:1','tt123:2:3']);
  const media=episodeMedia({...demoCatalog[0],id:'tt123',type:'series',title:'Show'},items[2]);
  expect(media.id).toBe('tt123:2:3');expect(media.episode).toMatchObject({seriesId:'tt123',season:2,number:3});expect(media.type).toBe('series');
});
it('advances across season boundaries, skipping specials and unaired episodes, and stops at the end',()=>{
  const list=parseEpisodes([{id:'special',season:0,episode:1},{id:'one',season:1,episode:9},{id:'two',season:2,episode:1},{id:'future',season:2,episode:2,released:'2099-01-01'}]);
  const series={...demoCatalog[0],id:'show',type:'series' as const};
  expect(nextEpisode(list,episodeMedia(series,list[1]))?.id).toBe('two');
  expect(nextEpisode(list,episodeMedia(series,list[2]))).toBeUndefined();
  expect(nextEpisode(list,series)).toBeUndefined();
});
it('selects the matching episode instead of the largest file in a season pack',()=>{
  const media=episodeMedia({...demoCatalog[0],type:'series'},parseEpisodes([{id:'tt1:2:3',season:2,episode:3}])[0]);
  const files=[{path:'/Show.S02E01.mkv',bytes:999},{path:'/Show.S02E03.mkv',bytes:500},{path:'/Show.S02E030.mkv',bytes:2000},{path:'/Show.S02E03.sample.mkv',bytes:900}];
  expect(episodeFile(files,media)?.path).toBe('/Show.S02E03.mkv');
  expect(episodeFile([files[0],files[2]],media)).toBeUndefined();
  expect(episodeFile([{path:'/episode.mkv',bytes:100}],media)?.path).toBe('/episode.mkv');
});
