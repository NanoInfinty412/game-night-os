import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { questionPackSchema, type QuestionPack } from '@gno/shared';

export const DEFAULT_PACK_PATH = fileURLToPath(
  new URL('../../../../content/packs/family-classics.json', import.meta.url),
);

/** Reads and validates a question pack; throws with the first problem if the file is invalid. */
export function loadQuestionPack(path: string = DEFAULT_PACK_PATH): QuestionPack {
  const pack = questionPackSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  const seen = new Set<string>();
  for (const question of pack.questions) {
    if (seen.has(question.id)) throw new Error(`Duplicate question id ${question.id} in ${path}`);
    seen.add(question.id);
  }
  return pack;
}
