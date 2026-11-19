import { describe, expect, it } from 'vitest';
import { formatTime, trackLabel } from './EmbeddedPlayer';
describe('embedded player labels', () => {
  it('formats movie durations and safely handles missing values', () => {
    expect(formatTime(9142)).toBe('2:32:22');
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(61)).toBe('1:01');
  });
  it('uses supplied language and track names with clear fallback labels', () => {
    expect(trackLabel({ id: 1, type: 'audio', lang: 'es', title: 'Dub' })).toBe('Spanish · Dub');
    expect(trackLabel({ id: 2, type: 'sub' })).toBe('Subtitle track 2');
  });
});
