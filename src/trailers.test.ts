import { describe, expect, it, vi } from 'vitest';
import { parseTrailer, parseTrailers, loadTrailers } from './trailers';
import { demoCatalog } from './data';

describe('addon trailer metadata', () => {
  it('accepts Cinemeta trailerStreams and legacy Stremio trailers', () => {
    expect(parseTrailer({ trailerStreams: [{ ytId: 'P6AaSMfXHbA' }] })).toEqual({ kind: 'youtube', id: 'P6AaSMfXHbA' });
    expect(parseTrailer({ trailers: [{ source: 'P6AaSMfXHbA', type: 'Trailer' }] })).toEqual({ kind: 'youtube', id: 'P6AaSMfXHbA' });
    expect(parseTrailer({ trailers: [{ url: 'https://cdn.example.com/trailer.mp4' }] })).toEqual({ kind: 'video', url: 'https://cdn.example.com/trailer.mp4' });
  });
  it('ignores malformed IDs, clips, executable URLs and embedded credentials', () => {
    expect(parseTrailer({ trailers: [{ source: 'bad/id', type: 'Trailer' }, { source: 'P6AaSMfXHbA', type: 'Clip' }, { url: 'javascript:alert(1)' }, { url: 'https://user:secret@example.com/a.mp4' }] })).toBeUndefined();
    expect(parseTrailer(null)).toBeUndefined();
  });
});

it('keeps alternate trailers without duplicates and resolves IMDb aliases from other catalogs',async()=>{
  expect(parseTrailers({trailerStreams:[{ytId:'P6AaSMfXHbA'},{ytId:'M7lc1UVf-VE'}],trailers:[{source:'P6AaSMfXHbA',type:'Trailer'}]})).toHaveLength(2);
  const fetcher=vi.fn(async(_url:string)=>new Response(JSON.stringify({meta:{trailers:[{source:'P6AaSMfXHbA',type:'Trailer'}]}}),{status:200}));
  vi.stubGlobal('fetch',fetcher);
  try{
    const trailers=await loadTrailers([{url:'https://alias-metadata.test/manifest.json',manifest:{id:'alias',name:'Alias metadata',version:'1',description:'Fixture',types:['movie'],resources:['meta'],idPrefixes:['tt'],catalogs:[]}}],{...demoCatalog[0],id:'tmdb:1368337',imdbId:'tt33764258'});
    expect(fetcher.mock.calls[0][0]).toBe('https://alias-metadata.test/meta/movie/tt33764258.json');
    expect(trailers[0]).toEqual({kind:'youtube',id:'P6AaSMfXHbA'});
  }finally{vi.unstubAllGlobals();}
});
