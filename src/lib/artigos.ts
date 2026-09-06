/**
 * Shared queries and JSON payload builders for the artigos collection.
 *
 * The payload shapes here are the /api/v1 contract documented in CLAUDE.md.
 * Renaming a field is a breaking change for the Expo app: add optional fields
 * instead.
 */

import { getCollection, type CollectionEntry } from 'astro:content';
import { SITE, type Seccao, type Localidade } from '../config/site';
import { markdownParaBlocos, type ImagemResolvida } from './blocks';
import type { Block } from './contract';
import type { z } from 'zod';

export type Artigo = CollectionEntry<'artigos'>;

/**
 * Every image under src/assets/uploads, so body images can be resolved to their
 * built path and real dimensions. Frontmatter covers go through the schema's
 * image() helper; this covers the ones written inline in the Markdown.
 */
const uploads = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/uploads/**/*.{png,jpg,jpeg,webp,avif,gif,svg}',
  { eager: true },
);

const resolverImagem = (src: string): ImagemResolvida | undefined => {
  const nome = src.split('/').pop();
  const chave = Object.keys(uploads).find((k) => k.endsWith(`/${nome}`));
  const img = chave ? uploads[chave]?.default : undefined;
  if (!img) return undefined;
  return { path: img.src, largura: img.width, altura: img.height };
};

/** Published articles, newest first. Drafts never reach the build. */
export async function listarArtigos(): Promise<Artigo[]> {
  const artigos = await getCollection('artigos', ({ data }) => data.rascunho !== true);
  return artigos.sort(
    (a, b) => b.data.publicadoEm.getTime() - a.data.publicadoEm.getTime(),
  );
}

export const porSeccao = (artigos: Artigo[], seccao: Seccao): Artigo[] =>
  artigos.filter((a) => a.data.seccao === seccao);

export const porLocalidade = (artigos: Artigo[], localidade: Localidade): Artigo[] =>
  artigos.filter((a) => a.data.localidades.includes(localidade));

/** Canonical page URL. Absolute, by contract, so it can be shared as-is. */
export const urlArtigo = (id: string): string => `${SITE.baseUrl}/artigo/${id}/`;

/**
 * The fields shared by the list and the single-article endpoint.
 *
 * Image paths stay host-relative: the app resolves them against tenant.baseUrl,
 * which is what lets the site move from dev. to the apex domain without an app
 * release.
 */
export function resumoJson(artigo: Artigo) {
  const { data } = artigo;
  return {
    id: artigo.id,
    slug: artigo.id,
    titulo: data.titulo,
    resumo: data.resumo,
    capa: {
      path: data.capa.src,
      alt: data.capaAlt,
      largura: data.capa.width,
      altura: data.capa.height,
      ...(data.capaCredito ? { credito: data.capaCredito } : {}),
    },
    seccao: data.seccao,
    localidades: data.localidades,
    autor: data.autor,
    publicadoEm: data.publicadoEm.toISOString(),
    destaque: data.destaque,
    url: urlArtigo(artigo.id),
  };
}

/** The single-article payload: the summary fields plus the rendered body. */
export function artigoJson(artigo: Artigo): ReturnType<typeof resumoJson> & { corpo: Block[] } {
  return {
    ...resumoJson(artigo),
    corpo: markdownParaBlocos(artigo.body ?? '', resolverImagem),
  };
}

/**
 * JSON response for an /api/v1 endpoint, validated against the contract before
 * it is written.
 *
 * The parse is the point: a payload that no longer matches the schema fails the
 * build here, rather than shipping to an app that cannot be hotfixed. Zod's
 * error names the offending field.
 */
export const json = <T>(schema: z.ZodType<T>, data: unknown): Response =>
  new Response(JSON.stringify(schema.parse(data), null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
