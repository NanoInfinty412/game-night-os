import { describe, expect, it } from 'vitest';
import { noteToFrequency } from './notes';
import { SONGS } from './songs';

describe('noteToFrequency', () => {
  it('tunes A4 to 440 Hz and handles sharps, flats and octaves', () => {
    expect(noteToFrequency('A4')).toBe(440);
    expect(noteToFrequency('A5')).toBeCloseTo(880);
    expect(noteToFrequency('C4')).toBeCloseTo(261.63, 1);
    expect(noteToFrequency('F#5')).toBeCloseTo(noteToFrequency('Gb5'));
  });

  it('rejects anything that is not a note', () => {
    expect(() => noteToFrequency('H2')).toThrow();
    expect(() => noteToFrequency('C')).toThrow();
  });
});

describe('SONGS', () => {
  it('has several songs with unique ids', () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length);
  });

  it.each(SONGS.map((s) => [s.title, s] as const))(
    '%s has equal-length tracks of whole bars with valid notes',
    (_title, song) => {
      expect(song.melody.length % 8).toBe(0);
      expect(song.bass.length).toBe(song.melody.length);
      expect(song.drums.length).toBe(song.melody.length);
      for (const note of [...song.melody, ...song.bass]) {
        if (note !== null) expect(() => noteToFrequency(note)).not.toThrow();
      }
    },
  );

  it('keeps every note in a comfortable, non-shrill range', () => {
    for (const song of SONGS) {
      for (const note of [...song.melody, ...song.bass]) {
        if (note === null) continue;
        const hz = noteToFrequency(note);
        expect(hz).toBeGreaterThan(50);
        expect(hz).toBeLessThan(1100);
      }
    }
  });
});
