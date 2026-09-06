/**
 * Single source of truth for site metadata and taxonomy.
 *
 * Every display label on the site and in the JSON API is read from here.
 * Nothing anywhere else may hardcode a secção or localidade name: adding a
 * freguesia or renaming a section must be a one-line change in this file.
 */

/** Base URL of the current deployment, without a trailing slash. */
// `||`, not `??`: an unset GitHub Actions variable arrives as an empty string,
// which would otherwise win over the default and produce a site with no host.
const baseUrl = (
  import.meta.env.PUBLIC_BASE_URL || 'https://dev.diariodesalvaterra.pt'
).replace(/\/$/, '');

export const SITE = {
  id: 'diario-de-salvaterra',
  nome: 'Diário de Salvaterra',
  descricao:
    'Jornal local do concelho de Salvaterra de Magos. Autarquia, economia, cultura, desporto e sociedade, das quatro freguesias.',
  locale: 'pt-PT',
  baseUrl,
  /**
   * Shown on every page and in /sobre. The articles are invented, the
   * municipality is real, so the notice is a requirement and not decoration.
   */
  aviso: 'Conteúdo fictício, site de demonstração.',
} as const;

/**
 * Indexing is opt-in per deployment. The dev host must never be crawled: it
 * carries fictional news about a real municipality. Set PUBLIC_INDEXAVEL=true
 * only on the apex domain.
 */
export const INDEXAVEL = import.meta.env.PUBLIC_INDEXAVEL === 'true';

/** Secções — exactly one per article. */
export const SECCOES = {
  autarquia: 'Autarquia',
  economia: 'Economia',
  cultura: 'Cultura',
  desporto: 'Desporto',
  sociedade: 'Sociedade',
  nacional: 'Nacional',
} as const;

/** Localidades — the four freguesias of the concelho. Zero or more per article. */
export const LOCALIDADES = {
  'salvaterra-e-foros': 'Salvaterra de Magos e Foros de Salvaterra',
  marinhais: 'Marinhais',
  muge: 'Muge',
  'gloria-do-ribatejo-e-granho': 'Glória do Ribatejo e Granho',
} as const;

export type Seccao = keyof typeof SECCOES;
export type Localidade = keyof typeof LOCALIDADES;

// Non-empty tuples, so z.enum() in the collection schema infers the literal
// union rather than widening to string.
export const SECCAO_SLUGS = Object.keys(SECCOES) as [Seccao, ...Seccao[]];
export const LOCALIDADE_SLUGS = Object.keys(LOCALIDADES) as [Localidade, ...Localidade[]];

export const nomeSeccao = (s: Seccao): string => SECCOES[s];
export const nomeLocalidade = (l: Localidade): string => LOCALIDADES[l];

/**
 * Capabilities are sent to the app from day one, all true for now. The app
 * renders from these flags rather than assuming what a tenant supports, so a
 * future newspaper can turn one off without an app release.
 */
export const CAPABILITIES = {
  artigos: true,
  seccoes: true,
  localidades: true,
  destaques: true,
  rss: true,
} as const;

/** Long-form date, e.g. "14 de março de 2026". */
export const formatarData = (d: Date): string =>
  d.toLocaleDateString(SITE.locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

/** Machine-readable date for <time datetime> and JSON. */
export const dataISO = (d: Date): string => d.toISOString().slice(0, 10);
