import type { APIRoute } from 'astro';
import { listarArtigos, resumoJson, json } from '../../../lib/artigos';
import { listaArtigosSchema } from '../../../lib/contract';

/** Article list, newest first. Bodies are only in articles/{slug}.json. */
export const GET: APIRoute = async () => {
  const artigos = await listarArtigos();
  return json(listaArtigosSchema, { articles: artigos.map(resumoJson) });
};
