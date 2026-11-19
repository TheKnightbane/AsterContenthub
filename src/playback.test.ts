import { describe, expect, it } from 'vitest';
import { buildInfuseUrl } from './players';
import { parseMagnet, selectedFileLink, streamMagnet } from './debrid';
import type { TorrentInfo } from './debrid';
import { demoCatalog } from './data';
describe('Infuse handoff', () => {
  it('uses a reachable demo URL and an integer resume position', () => {
    const result = new URL(buildInfuseUrl(demoCatalog[0], '/media/sintel-trailer.mp4', 12.8));
    expect(result.protocol).toBe('infuse:');
    expect(result.hostname).toBe('x-callback-url');
    expect(result.searchParams.get('url')).toBe('https://media.w3.org/2010/05/sintel/trailer.mp4');
    expect(result.searchParams.get('position')).toBe('12');
  });
  it('preserves signed URL parameters and rejects local-only sources', () => {
    const media = { ...demoCatalog[0], demo: false };
    const source = 'https://cdn.example/video.mkv?token=a+b&expires=123';
    expect(new URL(buildInfuseUrl(media, source, 0)).searchParams.get('url')).toBe(source);
    expect(() => buildInfuseUrl(media, 'http://tauri.localhost/video.mp4', 0)).toThrow('local');
    expect(() => buildInfuseUrl(media, 'javascript:alert(1)', 0)).toThrow();
  });
});
describe('Real-Debrid torrent mapping', () => {
  const info: TorrentInfo = { id: 'ABC123', filename: 'Open Film', status: 'downloaded', progress: 100, files: [{ id: 1, path: '/readme.txt', bytes: 50, selected: 0 }, { id: 2, path: '/film.mp4', bytes: 9000, selected: 1 }], links: ['https://real-debrid.com/d/EXAMPLE'] };
  it('maps selected video files to provider links without using unselected indexes', () => { expect(selectedFileLink(info, 2)).toBe(info.links[0]); expect(() => selectedFileLink(info, 1)).toThrow(); });
  it('does not play downloading sources or ambiguous file mappings', () => { expect(() => selectedFileLink({ ...info, status: 'downloading' }, 2)).toThrow('preparing'); expect(() => selectedFileLink({ ...info, links: [] }, 2)).toThrow('match'); });
  it('validates torrent hashes and magnet input', () => { expect(streamMagnet({ infoHash: 'a'.repeat(40) })).toContain('urn:btih:'); expect(parseMagnet(`magnet:?xt=urn:btih:${'a'.repeat(40)}`)).toContain('magnet:'); expect(() => streamMagnet({ infoHash: 'bad' })).toThrow(); expect(() => parseMagnet('https://example.com')).toThrow(); });
});
