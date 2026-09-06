import type { APIRoute } from 'astro';
import { SITE, INDEXAVEL } from '../config/site';

/**
 * The dev host publishes fictional news about a real municipality, so it must
 * stay out of search results. Indexing is opt-in per deployment: only a build
 * with PUBLIC_INDEXAVEL=true allows crawling.
 */
export const GET: APIRoute = () => {
  const corpo = INDEXAVEL
    ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE.baseUrl}/rss.xml\n`
    : 'User-agent: *\nDisallow: /\n';

  return new Response(corpo, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
