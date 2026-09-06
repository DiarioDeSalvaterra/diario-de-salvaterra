import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { SITE } from '../config/site';
import { listarArtigos, urlArtigo } from '../lib/artigos';

export const GET: APIRoute = async () => {
  const artigos = await listarArtigos();
  return rss({
    title: SITE.nome,
    // The notice belongs in the feed too: a reader may never see the site.
    description: `${SITE.descricao} ${SITE.aviso}`,
    site: SITE.baseUrl,
    customData: `<language>${SITE.locale}</language>`,
    items: artigos.map((artigo) => ({
      title: artigo.data.titulo,
      description: artigo.data.resumo,
      pubDate: artigo.data.publicadoEm,
      author: artigo.data.autor,
      link: urlArtigo(artigo.id),
      categories: [artigo.data.seccao, ...artigo.data.localidades],
    })),
  });
};
