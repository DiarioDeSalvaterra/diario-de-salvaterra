import { defineCollection } from 'astro:content';
import { z } from 'zod';
import { glob } from 'astro/loaders';
import { SECCAO_SLUGS, LOCALIDADE_SLUGS } from './config/site';

/**
 * Articles are Markdown + frontmatter in the repo, so the content stays
 * portable to a real CMS later.
 *
 * `capa` uses the image() helper rather than a plain string: Sveltia commits
 * uploads to src/assets/uploads, and only assets referenced through image()
 * go through astro:assets optimisation. Anything under public/ would bypass it.
 */
const artigos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/artigos' }),
  schema: ({ image }) =>
    z.object({
      titulo: z.string(),
      resumo: z.string(),
      capa: image(),
      capaAlt: z.string(),
      capaCredito: z.string().optional(),
      seccao: z.enum(SECCAO_SLUGS),
      localidades: z.array(z.enum(LOCALIDADE_SLUGS)).default([]),
      autor: z.string(),
      publicadoEm: z.coerce.date(),
      destaque: z.boolean().default(false),
      rascunho: z.boolean().default(false),
    }),
});

export const collections = { artigos };
