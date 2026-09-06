import type { APIRoute } from 'astro';
import { SITE, SECCOES, LOCALIDADES, CAPABILITIES } from '../../../config/site';
import { json } from '../../../lib/artigos';

/**
 * Tenant descriptor. `baseUrl` is the only absolute host in the whole API:
 * every other path is relative and resolved against it by the app.
 */
export const GET: APIRoute = () =>
  json({
    id: SITE.id,
    nome: SITE.nome,
    descricao: SITE.descricao,
    locale: SITE.locale,
    baseUrl: SITE.baseUrl,
    aviso: SITE.aviso,
    seccoes: Object.entries(SECCOES).map(([slug, nome]) => ({ slug, nome })),
    localidades: Object.entries(LOCALIDADES).map(([slug, nome]) => ({ slug, nome })),
    capabilities: CAPABILITIES,
  });
