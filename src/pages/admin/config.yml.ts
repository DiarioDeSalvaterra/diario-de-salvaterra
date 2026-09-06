import type { APIRoute } from 'astro';
import { SITE, SECCOES, LOCALIDADES } from '../../config/site';

/**
 * Sveltia CMS configuration, generated at build time.
 *
 * It is generated rather than checked in so that the secção and localidade
 * labels come from src/config/site.ts like everywhere else. A hand-written
 * config.yml would be a second copy of the taxonomy, and it would drift the
 * first time a freguesia is added.
 *
 * The body is JSON. YAML 1.2 is a superset of JSON, so the file parses as the
 * config.yml Sveltia expects while needing no YAML serialiser here.
 */

const opcoes = (m: Record<string, string>) =>
  Object.entries(m).map(([value, label]) => ({ label, value }));

const config = {
  backend: {
    name: 'github',
    repo: 'DiarioDeSalvaterra/diario-de-salvaterra',
    branch: 'main',
    // No OAuth relay and nothing to configure for it: the editor clicks
    // "Sign In with Token" and pastes a fine-grained PAT, which stays in their
    // browser. Fine for a single editor; see the note in CLAUDE.md before a
    // second one appears.
  },

  site_url: SITE.baseUrl,
  display_url: SITE.baseUrl,

  // Global fallback only. The artigos collection overrides both below, and its
  // override is the one that matters.
  media_folder: 'src/assets/uploads',
  public_folder: '/src/assets/uploads',

  collections: [
    {
      name: 'artigos',
      label: 'Artigos',
      label_singular: 'Artigo',
      folder: 'src/content/artigos',
      create: true,
      slug: '{{slug}}',
      preview_path: 'artigo/{{slug}}',
      sortable_fields: ['publicadoEm', 'titulo', 'seccao'],

      /**
       * Both paths are relative to the collection folder, so an upload lands in
       * src/assets/uploads and the frontmatter gets ../../assets/uploads/x.webp.
       *
       * This is the whole reason the CMS does not write to public/: only files
       * under src/ reach astro:assets through the image() helper in the
       * collection schema. Anything in public/ is served exactly as uploaded.
       */
      media_folder: '../../assets/uploads',
      public_folder: '../../assets/uploads',

      fields: [
        { label: 'Título', name: 'titulo', widget: 'string' },
        {
          label: 'Resumo',
          name: 'resumo',
          widget: 'text',
          hint: 'Uma ou duas frases. Aparece na página inicial, no feed e na aplicação.',
        },
        {
          label: 'Imagem de capa',
          name: 'capa',
          widget: 'image',
          hint: 'Máximo 1600px de largura e 250KB. As imagens ficam no repositório para sempre.',
        },
        {
          label: 'Texto alternativo da capa',
          name: 'capaAlt',
          widget: 'string',
          hint: 'Descreva a imagem para quem não a vê. Obrigatório.',
        },
        { label: 'Crédito da capa', name: 'capaCredito', widget: 'string', required: false },
        {
          label: 'Secção',
          name: 'seccao',
          widget: 'select',
          options: opcoes(SECCOES),
        },
        {
          label: 'Localidades',
          name: 'localidades',
          widget: 'select',
          multiple: true,
          required: false,
          default: [],
          options: opcoes(LOCALIDADES),
          hint: 'As freguesias a que a notícia diz respeito. Pode não ser nenhuma.',
        },
        { label: 'Autor', name: 'autor', widget: 'string' },
        {
          label: 'Publicado em',
          name: 'publicadoEm',
          widget: 'datetime',
          // Stored as a plain date. picker_utc keeps the day from shifting for
          // an editor in a timezone behind UTC.
          format: 'YYYY-MM-DD',
          date_format: 'DD/MM/YYYY',
          time_format: false,
          picker_utc: true,
        },
        {
          label: 'Destaque na página inicial',
          name: 'destaque',
          widget: 'boolean',
          default: false,
          required: false,
        },
        {
          label: 'Rascunho',
          name: 'rascunho',
          widget: 'boolean',
          default: false,
          required: false,
          hint: 'Um rascunho não é publicado nem aparece na API.',
        },
        {
          label: 'Corpo',
          name: 'body',
          widget: 'markdown',
          hint: 'Para uma citação com fonte, deixe uma linha ">" vazia antes do travessão.',
        },
      ],
    },
  ],
} as const;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(config, null, 2), {
    headers: { 'content-type': 'text/yaml; charset=utf-8' },
  });
