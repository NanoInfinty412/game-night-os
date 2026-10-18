import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  numberPackSchema,
  questionPackSchema,
  type GameContent,
  type NumberPack,
  type QuestionPack,
} from '@gno/shared';

export const PACKS_DIR = fileURLToPath(new URL('../../../../content/packs/', import.meta.url));

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function checkUniqueIds(ids: string[], path: string) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Duplicate question id ${id} in ${path}`);
    seen.add(id);
  }
}

/** Reads and validates a multiple-choice pack; throws with the first problem if it is invalid. */
export function loadQuestionPack(path: string = `${PACKS_DIR}family-classics.json`): QuestionPack {
  const pack = questionPackSchema.parse(readJson(path));
  checkUniqueIds(
    pack.questions.map((q) => q.id),
    path,
  );
  return pack;
}

export function loadNumberPack(path: string = `${PACKS_DIR}closest-number.json`): NumberPack {
  const pack = numberPackSchema.parse(readJson(path));
  checkUniqueIds(
    pack.questions.map((q) => q.id),
    path,
  );
  return pack;
}

/** Every pack the games draw from. */
export function loadGameContent(dir: string = PACKS_DIR): GameContent {
  const content: GameContent = {
    trivia: loadQuestionPack(`${dir}family-classics.json`).questions,
    trueFalse: loadQuestionPack(`${dir}true-or-false.json`).questions,
    emoji: loadQuestionPack(`${dir}emoji-riddles.json`).questions,
    numbers: loadNumberPack(`${dir}closest-number.json`).questions,
  };
  checkUniqueIds(
    [...content.trivia, ...content.trueFalse, ...content.emoji, ...content.numbers].map(
      (q) => q.id,
    ),
    dir,
  );
  return content;
}
