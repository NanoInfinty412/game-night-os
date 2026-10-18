/** Each answer has its own colour and shape, so it can be told apart without colour too. */
export const ANSWER_STYLES = [
  { shape: '▲', name: 'triangle', color: '#ff4f9a', shadow: '#b02a66' },
  { shape: '◆', name: 'diamond', color: '#3ee0d0', shadow: '#1f9c90' },
  { shape: '●', name: 'circle', color: '#ffd23f', shadow: '#b8901a' },
  { shape: '■', name: 'square', color: '#a6e22e', shadow: '#6f9a17' },
] as const;

export function answerStyle(index: number) {
  return ANSWER_STYLES[index % ANSWER_STYLES.length]!;
}

const TRUE_FALSE_STYLES = [
  { shape: '✔', name: 'true', color: '#a6e22e', shadow: '#6f9a17' },
  { shape: '✘', name: 'false', color: '#ff6b6b', shadow: '#b03c3c' },
] as const;

/** True is a green tick and False a red cross; everything else uses the four shapes. */
export function choiceStyle(index: number, style?: string) {
  if (style === 'truefalse') return TRUE_FALSE_STYLES[index % 2]!;
  return answerStyle(index);
}

/** "1st", "2nd", "3rd", "4th"… */
export function ordinal(place: number): string {
  const suffix =
    place % 100 >= 11 && place % 100 <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[place % 10] ?? 'th');
  return `${place}${suffix}`;
}
