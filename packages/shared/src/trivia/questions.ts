import { z } from 'zod';

export const CHOICES_PER_QUESTION = 4;

export const questionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    category: z.string().min(1).max(24),
    prompt: z.string().min(8).max(140),
    choices: z.array(z.string().min(1).max(40)).length(CHOICES_PER_QUESTION),
    /** Index into `choices` of the correct answer. */
    answer: z
      .number()
      .int()
      .min(0)
      .max(CHOICES_PER_QUESTION - 1),
  })
  .refine((q) => new Set(q.choices.map((c) => c.toLowerCase())).size === q.choices.length, {
    message: 'Choices must be different',
  });

export type Question = z.infer<typeof questionSchema>;

export const questionPackSchema = z.object({
  id: z.string(),
  title: z.string(),
  questions: z.array(questionSchema).min(1),
});

export type QuestionPack = z.infer<typeof questionPackSchema>;
