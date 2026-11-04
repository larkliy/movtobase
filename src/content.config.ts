import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

const docs = defineCollection({
  loader: docsLoader(),
  schema: docsSchema({
    extend: z.object({
      course: z.enum(['zig', 'csharp']).optional(),
      lesson: z.number().optional(),
      article: z.number().optional(),
      part: z.number().min(1).max(3).optional(),
      duration: z.number().optional(),
      tags: z.array(z.string()).default([]),
    }),
  }),
});

const taskSchema = z.object({
  number: z.number(),
  title: z.string(),
  lesson: z.string(),
  part: z.number().min(1).max(3),
  difficulty: z.number().min(1).max(3),
  tags: z.array(z.string()).default([]),
  description: z.string().default(''),
});

const tasks = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/tasks' }),
  schema: taskSchema,
});

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    course: z.literal('csharp'),
    article: z.number(),
    duration: z.number(),
    tags: z.array(z.string()).default([]),
  }),
});

const answers = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/answers' }),
  schema: taskSchema,
});

const i18n = defineCollection({
  loader: i18nLoader(),
});

export const collections = { docs, tasks, answers, articles, i18n };
