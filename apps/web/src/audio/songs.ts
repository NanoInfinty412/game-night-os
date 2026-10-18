/**
 * Original tunes written for Game Night OS, so there is nothing to license.
 * Each track is a list of eighth-note steps: a note name, or null for a rest.
 * Drum steps: k = kick, s = snare, h = hi-hat.
 */
export type Drum = 'k' | 's' | 'h';

export interface Song {
  id: string;
  title: string;
  bpm: number;
  melody: (string | null)[];
  bass: (string | null)[];
  drums: (Drum | null)[];
}

const _ = null;

const bar = (...steps: (string | null)[]) => steps;
const repeat = <T>(steps: T[], times: number): T[] =>
  Array.from({ length: times }, () => steps).flat();

export const SONGS: Song[] = [
  {
    id: 'lobby-bounce',
    title: 'Lobby Bounce',
    bpm: 120,
    // C – Am – F – G
    melody: [
      ...bar('E5', 'G5', 'C6', 'G5', 'E5', 'G5', 'A5', 'G5'),
      ...bar('E5', _, 'C5', 'E5', 'A5', _, 'G5', 'E5'),
      ...bar('F5', 'A5', 'C6', 'A5', 'F5', 'A5', 'G5', 'F5'),
      ...bar('D5', _, 'G5', _, 'B4', 'D5', 'G5', _),
    ],
    bass: [
      ...bar('C3', _, 'G3', _, 'C3', _, 'G3', _),
      ...bar('A2', _, 'E3', _, 'A2', _, 'E3', _),
      ...bar('F2', _, 'C3', _, 'F2', _, 'C3', _),
      ...bar('G2', _, 'D3', _, 'G2', _, 'B2', _),
    ],
    drums: repeat<Drum | null>(['k', 'h', 's', 'h', 'k', 'k', 's', 'h'], 4),
  },
  {
    id: 'silly-parade',
    title: 'Silly Parade',
    bpm: 132,
    // F – Dm – Bb – C
    melody: [
      ...bar('F5', _, 'A5', 'C6', _, 'A5', 'F5', _),
      ...bar('D5', 'F5', 'A5', _, 'F5', 'D5', _, _),
      ...bar('Bb4', 'D5', 'F5', 'Bb5', _, 'F5', 'D5', _),
      ...bar('C5', 'E5', 'G5', 'C6', _, 'Bb5', 'G5', 'E5'),
    ],
    bass: [
      ...bar('F2', _, 'F3', _, 'F2', _, 'F3', _),
      ...bar('D2', _, 'D3', _, 'D2', _, 'D3', _),
      ...bar('Bb1', _, 'Bb2', _, 'Bb1', _, 'Bb2', _),
      ...bar('C2', _, 'C3', _, 'C2', _, 'C3', _),
    ],
    drums: repeat<Drum | null>(['k', _, 's', 'h', 'k', 'h', 's', _], 4),
  },
  {
    id: 'thinking-cap',
    title: 'Thinking Cap',
    bpm: 104,
    // G – Em – C – D
    melody: [
      ...bar('B4', _, 'D5', _, 'G5', _, 'D5', _),
      ...bar('E5', _, 'G5', _, 'B5', _, 'G5', _),
      ...bar('C5', _, 'E5', _, 'G5', 'A5', 'G5', 'E5'),
      ...bar('D5', _, 'F#5', _, 'A5', _, 'F#5', 'D5'),
    ],
    bass: [
      ...bar('G2', _, _, _, 'D3', _, _, _),
      ...bar('E2', _, _, _, 'B2', _, _, _),
      ...bar('C3', _, _, _, 'G2', _, _, _),
      ...bar('D3', _, _, _, 'A2', _, _, _),
    ],
    drums: repeat<Drum | null>(['k', _, 'h', _, 's', _, 'h', _], 4),
  },
  {
    id: 'speedy-sneakers',
    title: 'Speedy Sneakers',
    bpm: 150,
    // A – F – C – G, quick and bouncy for racing rounds
    melody: [
      ...bar('A4', 'C5', 'E5', 'C5', 'A4', 'E4', 'A4', 'C5'),
      ...bar('F4', 'A4', 'C5', 'A4', 'F4', 'C4', 'F4', 'A4'),
      ...bar('E4', 'G4', 'C5', 'G4', 'E4', 'C4', 'E4', 'G4'),
      ...bar('D4', 'G4', 'B4', 'D5', 'B4', 'G4', 'D4', _),
    ],
    bass: [
      ...bar('A2', 'A2', 'E3', 'A2', 'A2', 'A2', 'E3', 'A2'),
      ...bar('F2', 'F2', 'C3', 'F2', 'F2', 'F2', 'C3', 'F2'),
      ...bar('C3', 'C3', 'G3', 'C3', 'C3', 'C3', 'G3', 'C3'),
      ...bar('G2', 'G2', 'D3', 'G2', 'G2', 'G2', 'B2', 'D3'),
    ],
    drums: repeat<Drum | null>(['k', 'h', 's', 'h', 'k', 'h', 's', 's'], 4),
  },
  {
    id: 'sunny-picnic',
    title: 'Sunny Picnic',
    bpm: 112,
    // D – Bm – G – A, a gentle sing-along
    melody: [
      ...bar('F#5', _, 'A5', 'F#5', 'D5', _, 'E5', 'F#5'),
      ...bar('D5', _, 'B4', 'D5', 'F#5', _, 'E5', 'D5'),
      ...bar('B4', 'D5', 'G5', _, 'F#5', 'E5', 'D5', 'B4'),
      ...bar('C#5', 'E5', 'A5', _, 'G5', 'F#5', 'E5', _),
    ],
    bass: [
      ...bar('D3', _, 'A2', _, 'D3', _, 'A2', _),
      ...bar('B2', _, 'F#2', _, 'B2', _, 'F#2', _),
      ...bar('G2', _, 'D3', _, 'G2', _, 'D3', _),
      ...bar('A2', _, 'E3', _, 'A2', _, 'C#3', _),
    ],
    drums: repeat<Drum | null>(['k', _, 'h', 'k', 's', _, 'h', _], 4),
  },
];
