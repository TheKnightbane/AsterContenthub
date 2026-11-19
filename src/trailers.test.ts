import { describe, expect, it } from 'vitest';
import { parseTrailer } from './trailers';

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
