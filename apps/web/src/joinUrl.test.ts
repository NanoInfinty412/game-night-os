import { describe, expect, it } from 'vitest';
import { buildJoinUrl } from './joinUrl';
import { playerColor } from './components/playerColor';

describe('buildJoinUrl', () => {
  it('points at /play with the room code', () => {
    expect(buildJoinUrl('http://192.168.1.20:5173', 'GAME')).toBe(
      'http://192.168.1.20:5173/play?code=GAME',
    );
  });

  it('ignores any path on the origin', () => {
    expect(buildJoinUrl('https://example.com/tv', 'ABCD')).toBe(
      'https://example.com/play?code=ABCD',
    );
  });
});

describe('playerColor', () => {
  it('gives the first eight seats distinct colours', () => {
    const colors = new Set(Array.from({ length: 8 }, (_, i) => playerColor(i)));
    expect(colors.size).toBe(8);
  });
});
