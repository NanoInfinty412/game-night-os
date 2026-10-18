import { z } from 'zod';

export const MIN_CHOICES = 2;
export const MAX_CHOICES = 4;

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

/** A multiple-choice question: trivia, true-or-false and emoji riddles all use this shape. */
export const questionSchema = z
  .object({
    id: idSchema,
    category: z.string().min(1).max(24),
    prompt: z.string().min(2).max(140),
    choices: z.array(z.string().min(1).max(40)).min(MIN_CHOICES).max(MAX_CHOICES),
    /** Index into `choices` of the correct answer. */
    answer: z.number().int().min(0),
  })
  .refine((q) => q.answer < q.choices.length, { message: 'Answer must be one of the choices' })
  .refine((q) => new Set(q.choices.map((c) => c.toLowerCase())).size === q.choices.length, {
    message: 'Choices must be different',
  });

export type Question = z.infer<typeof questionSchema>;

/** "Closest wins": players guess a number, nearest to `answer` scores most. */
export const numberQuestionSchema = z
  .object({
    id: idSchema,
    category: z.string().min(1).max(24),
    prompt: z.string().min(8).max(140),
    answer: z.number().int(),
    /** Shown after the number, e.g. "years" or "legs". */
    unit: z.string().max(16).default(''),
    min: z.number().int(),
    max: z.number().int(),
    /** One friendly sentence shown with the answer. */
    fact: z.string().max(140).optional(),
  })
  .refine((q) => q.min <= q.answer && q.answer <= q.max, {
    message: 'Answer must be between min and max',
  });

export type NumberQuestion = z.infer<typeof numberQuestionSchema>;

export const questionPackSchema = z.object({
  id: z.string(),
  title: z.string(),
  questions: z.array(questionSchema).min(1),
});
export type QuestionPack = z.infer<typeof questionPackSchema>;

export const numberPackSchema = z.object({
  id: z.string(),
  title: z.string(),
  questions: z.array(numberQuestionSchema).min(1),
});
export type NumberPack = z.infer<typeof numberPackSchema>;

/** Everything a game can draw from. The server loads it from `content/packs`. */
export interface GameContent {
  trivia: Question[];
  trueFalse: Question[];
  emoji: Question[];
  numbers: NumberQuestion[];
}
