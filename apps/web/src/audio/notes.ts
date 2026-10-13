const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Frequency in Hz of a note name like `A4`, `C#5` or `Bb2` (equal temperament, A4 = 440 Hz). */
export function noteToFrequency(note: string): number {
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!match) throw new Error(`Not a note: ${note}`);
  const [, letter, accidental, octave] = match;
  const semitone = SEMITONES[letter!]! + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  const midi = (Number(octave) + 1) * 12 + semitone;
  return 440 * 2 ** ((midi - 69) / 12);
}
