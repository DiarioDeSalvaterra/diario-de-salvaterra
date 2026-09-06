import type { APIRoute } from 'astro';
import { listarArtigos, resumoJson, json } from '../../../lib/artigos';

/** Article list, newest first. Bodies are only in articles/{slug}.json. */
export const GET: APIRoute = async () => {
  const artigos = await listarArtigos();
  return json({ articles: artigos.map(resumoJson) });
};
