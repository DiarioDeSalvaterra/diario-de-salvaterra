import type { APIRoute, GetStaticPaths } from 'astro';
import { listarArtigos, artigoJson, json } from '../../../../lib/artigos';
import { artigoSchema } from '../../../../lib/contract';

export const getStaticPaths: GetStaticPaths = async () => {
  const artigos = await listarArtigos();
  return artigos.map((artigo) => ({ params: { slug: artigo.id }, props: { artigo } }));
};

/** A single article, including its body as a Block array. */
export const GET: APIRoute = ({ props }) => json(artigoSchema, artigoJson(props.artigo));
