/**
 * Build-output assertions.
 *
 * These run against dist/ after a build, and they are the gate that stands
 * between a bad build and the Expo app. A failure here must block the deploy,
 * not warn: see the CI gate in CLAUDE.md.
 *
 * Run with `bun run build && bun test test/dist.test.ts`.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artigoSchema, listaArtigosSchema, tenantSchema } from '../src/lib/contract';

const DIST = join(import.meta.dir, '..', 'dist');

if (!existsSync(DIST)) {
  throw new Error('dist/ não existe. Corra `bun run build` antes destes testes.');
}

const ler = (p: string) => readFileSync(join(DIST, p), 'utf8');
const lerJson = (p: string) => JSON.parse(ler(p));

const artigosMd = readdirSync(join(import.meta.dir, '..', 'src', 'content', 'artigos'));
/** Drafts are excluded from the build, so they must be excluded from the count. */
const publicados = artigosMd.filter(
  (f) =>
    f.endsWith('.md') &&
    !/^\s*rascunho:\s*true\s*$/m.test(
      readFileSync(join(import.meta.dir, '..', 'src', 'content', 'artigos', f), 'utf8'),
    ),
);

const ROTAS = [
  'index.html',
  'sobre/index.html',
  'rss.xml',
  'robots.txt',
  'CNAME',
  'admin/index.html',
  'admin/config.yml',
  'api/v1/tenant.json',
  'api/v1/articles.json',
  'seccao/autarquia/index.html',
  'seccao/economia/index.html',
  'seccao/cultura/index.html',
  'seccao/desporto/index.html',
  'seccao/sociedade/index.html',
  'seccao/nacional/index.html',
  'localidade/salvaterra-e-foros/index.html',
  'localidade/marinhais/index.html',
  'localidade/muge/index.html',
  'localidade/gloria-do-ribatejo-e-granho/index.html',
];

describe('rotas', () => {
  test.each(ROTAS)('%s foi gerada', (rota) => {
    expect(existsSync(join(DIST, rota))).toBe(true);
  });

  test('cada artigo publicado tem página e JSON', () => {
    for (const { slug } of lerJson('api/v1/articles.json').articles) {
      expect(existsSync(join(DIST, 'artigo', slug, 'index.html'))).toBe(true);
      expect(existsSync(join(DIST, 'api/v1/articles', `${slug}.json`))).toBe(true);
    }
  });
});

describe('contrato', () => {
  test('tenant.json valida contra o esquema', () => {
    expect(() => tenantSchema.parse(lerJson('api/v1/tenant.json'))).not.toThrow();
  });

  test('articles.json valida contra o esquema', () => {
    expect(() => listaArtigosSchema.parse(lerJson('api/v1/articles.json'))).not.toThrow();
  });

  test('cada articles/{slug}.json parseia e valida', () => {
    const ficheiros = readdirSync(join(DIST, 'api/v1/articles')).filter((f) => f.endsWith('.json'));
    expect(ficheiros.length).toBeGreaterThan(0);
    for (const f of ficheiros) {
      expect(() => artigoSchema.parse(lerJson(join('api/v1/articles', f)))).not.toThrow();
    }
  });

  test('a contagem em articles.json bate com os artigos não-rascunho', () => {
    expect(lerJson('api/v1/articles.json').articles).toHaveLength(publicados.length);
  });
});

describe('caminhos', () => {
  /**
   * The dev -> apex move works only because nothing in the JSON hardcodes the
   * host. The two documented exceptions are tenant.baseUrl and each article's
   * url, which is absolute so it can be shared and used as a canonical tag.
   */
  test('nenhum host absoluto no JSON, tirando as duas exceções do contrato', () => {
    const ficheiros = [
      'api/v1/articles.json',
      ...readdirSync(join(DIST, 'api/v1/articles'))
        .filter((f) => f.endsWith('.json'))
        .map((f) => join('api/v1/articles', f)),
    ];

    for (const f of ficheiros) {
      const dados = lerJson(f);
      const artigos = 'articles' in dados ? dados.articles : [dados];
      for (const artigo of artigos) {
        // Drop the one field allowed to be absolute, then nothing else may be.
        const { url, ...resto } = artigo;
        expect(url).toStartWith('http');
        const encontrados = JSON.stringify(resto).match(/https?:\\?\/\\?\//g) ?? [];
        expect(encontrados).toEqual([]);
      }
    }

    const tenant = lerJson('api/v1/tenant.json');
    const { baseUrl, ...resto } = tenant;
    expect(baseUrl).toStartWith('http');
    expect(JSON.stringify(resto).match(/https?:\\?\/\\?\//g) ?? []).toEqual([]);
  });

  test('cada imagem referida no JSON existe mesmo em dist', () => {
    const caminhos = new Set<string>();

    for (const artigo of lerJson('api/v1/articles.json').articles) {
      caminhos.add(artigo.capa.path);
    }
    for (const f of readdirSync(join(DIST, 'api/v1/articles')).filter((f) => f.endsWith('.json'))) {
      const artigo = lerJson(join('api/v1/articles', f));
      caminhos.add(artigo.capa.path);
      for (const bloco of artigo.corpo) {
        if (bloco.tipo === 'imagem') caminhos.add(bloco.path);
      }
    }

    expect(caminhos.size).toBeGreaterThan(0);
    for (const c of caminhos) {
      expect({ caminho: c, existe: existsSync(join(DIST, c)) }).toEqual({
        caminho: c,
        existe: true,
      });
    }
  });
});
