/**
 * The /api/v1 contract, as Zod schemas.
 *
 * This is the single definition of the API shape. The build validates every
 * payload against it before writing a file, so a mismatch fails the build
 * rather than reaching the Expo app; the app imports the inferred types from
 * here later. Like the converter, this module imports nothing from Astro.
 *
 * Renaming a field is a breaking change. Add optional fields instead, and
 * update CLAUDE.md in the same commit.
 */

import { z } from 'zod';

/** A path inside the site: relative, so clients resolve it against baseUrl. */
const caminhoRelativo = z
  .string()
  .min(1)
  .refine((p) => p.startsWith('/') && !/^\/\//.test(p), {
    message: 'tem de ser um caminho relativo ao host, a começar por "/"',
  })
  .refine((p) => !/^[a-z][a-z0-9+.-]*:/i.test(p), {
    message: 'não pode conter um esquema nem um host absoluto',
  });

export const marcaSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('negrito'), inicio: z.number().int().min(0), fim: z.number().int().min(0) }),
  z.object({ tipo: z.literal('italico'), inicio: z.number().int().min(0), fim: z.number().int().min(0) }),
  z.object({ tipo: z.literal('codigo'), inicio: z.number().int().min(0), fim: z.number().int().min(0) }),
  z.object({
    tipo: z.literal('ligacao'),
    inicio: z.number().int().min(0),
    fim: z.number().int().min(0),
    href: z.string().min(1),
  }),
]);

export const blockSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('paragrafo'), texto: z.string(), marcas: z.array(marcaSchema).optional() }),
  z.object({ tipo: z.literal('titulo'), nivel: z.union([z.literal(2), z.literal(3)]), texto: z.string() }),
  z.object({
    tipo: z.literal('imagem'),
    path: caminhoRelativo,
    alt: z.string().min(1),
    legenda: z.string().optional(),
    largura: z.number().int().positive(),
    altura: z.number().int().positive(),
    // Set when the image was wrapped in a link, the usual way to point a photo
    // at its source. Absolute, because it normally leaves the site.
    href: z.string().min(1).optional(),
  }),
  z.object({ tipo: z.literal('citacao'), texto: z.string(), atribuicao: z.string().optional() }),
  z.object({ tipo: z.literal('lista'), ordenada: z.boolean(), itens: z.array(z.string()) }),
  z.object({ tipo: z.literal('separador') }),
  /**
   * Valid Markdown the contract does not model: tables, fenced code, raw HTML.
   * It carries its own source so nothing an editor wrote is ever lost, and the
   * app can decide what to do with it. Dropping these silently would publish an
   * article with a paragraph missing and nobody would notice.
   */
  z.object({ tipo: z.literal('desconhecido'), origem: z.string(), fonte: z.string() }),
]);

export const capaSchema = z.object({
  path: caminhoRelativo,
  alt: z.string().min(1),
  largura: z.number().int().positive(),
  altura: z.number().int().positive(),
  credito: z.string().optional(),
});

export const resumoArtigoSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  titulo: z.string().min(1),
  resumo: z.string().min(1),
  capa: capaSchema,
  seccao: z.string().min(1),
  localidades: z.array(z.string()),
  autor: z.string().min(1),
  publicadoEm: z.iso.datetime(),
  destaque: z.boolean(),
  // The one absolute URL on an article, by contract: it is shared and used as
  // the canonical tag.
  url: z.url(),
});

export const artigoSchema = resumoArtigoSchema.extend({
  corpo: z.array(blockSchema),
});

export const listaArtigosSchema = z.object({
  articles: z.array(resumoArtigoSchema),
});

export const tenantSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  descricao: z.string().min(1),
  locale: z.string().min(1),
  // The only absolute host in the whole API. Everything else is relative and
  // resolved against it, which is what lets the site move from dev. to the apex
  // without an app release.
  baseUrl: z.url(),
  aviso: z.string().min(1),
  seccoes: z.array(z.object({ slug: z.string().min(1), nome: z.string().min(1) })).nonempty(),
  localidades: z.array(z.object({ slug: z.string().min(1), nome: z.string().min(1) })).nonempty(),
  capabilities: z.record(z.string(), z.boolean()),
});

export type Marca = z.infer<typeof marcaSchema>;
export type Block = z.infer<typeof blockSchema>;
export type ResumoArtigo = z.infer<typeof resumoArtigoSchema>;
export type Artigo = z.infer<typeof artigoSchema>;
export type ListaArtigos = z.infer<typeof listaArtigosSchema>;
export type Tenant = z.infer<typeof tenantSchema>;
