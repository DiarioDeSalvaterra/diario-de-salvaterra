/**
 * Accessibility checks over the built HTML, in jsdom, no browser.
 *
 * On a news site semantic HTML and alt text are requirements, not polish, so
 * these run in CI alongside the contract assertions.
 *
 * Colour contrast is deliberately out of scope here: the palette is fixed and
 * verified by hand against the design direction, and axe cannot see the
 * computed colours through jsdom's stylesheet handling anyway. Re-verify by
 * hand if the palette changes.
 *
 * Run with `bun run build && bun test test/acessibilidade.test.ts`.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

const DIST = join(import.meta.dir, '..', 'dist');
const primeiroArtigo = readdirSync(join(DIST, 'artigo'))[0];

const PAGINAS: Array<[string, string]> = [
  ['página inicial', 'index.html'],
  ['artigo', join('artigo', primeiroArtigo!, 'index.html')],
  ['índice de secção', join('seccao', 'autarquia', 'index.html')],
];

/** Serious and critical only: those are the ones that actually block someone. */
const BLOQUEANTES = new Set(['serious', 'critical']);

async function analisar(ficheiro: string) {
  const html = readFileSync(join(DIST, ficheiro), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://dev.diariodesalvaterra.pt/',
    runScripts: 'dangerously',
  });

  const { window } = dom;
  window.eval(axe.source);

  const resultados = await (window as unknown as { axe: typeof axe }).axe.run(window.document, {
    resultTypes: ['violations'],
    rules: { 'color-contrast': { enabled: false } },
  });

  dom.window.close();

  return resultados.violations
    .filter((v) => BLOQUEANTES.has(v.impact ?? ''))
    .map((v) => ({
      regra: v.id,
      impacto: v.impact,
      descricao: v.help,
      onde: v.nodes.map((n) => n.html.slice(0, 120)),
    }));
}

describe('acessibilidade', () => {
  test.each(PAGINAS)('%s não tem violações graves', async (_nome, ficheiro) => {
    expect(existsSync(join(DIST, ficheiro))).toBe(true);
    expect(await analisar(ficheiro)).toEqual([]);
  }, 30_000);
});
