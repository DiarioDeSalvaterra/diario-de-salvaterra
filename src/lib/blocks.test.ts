/**
 * One runnable check for the converter. It is the contract with the Expo app,
 * so the cases here are the ones that would silently ship wrong content:
 * mark offsets, quote attribution, image hoisting, and refusing bad input.
 *
 * Run with `bun test`.
 */

import { expect, test } from 'bun:test';
import { markdownParaBlocos, type Block } from './blocks';

test('converte os blocos essenciais de um corpo de artigo', () => {
  const blocos = markdownParaBlocos(
    [
      '## Um subtítulo',
      '',
      'Um parágrafo simples.',
      '',
      '> A obra estará concluída no verão.',
      '>',
      '> — Fonte da autarquia',
      '',
      '- Primeiro',
      '- Segundo',
      '',
      '---',
    ].join('\n'),
  );

  expect(blocos).toEqual([
    { tipo: 'titulo', nivel: 2, texto: 'Um subtítulo' },
    { tipo: 'paragrafo', texto: 'Um parágrafo simples.' },
    {
      tipo: 'citacao',
      texto: 'A obra estará concluída no verão.',
      atribuicao: 'Fonte da autarquia',
    },
    { tipo: 'lista', ordenada: false, itens: ['Primeiro', 'Segundo'] },
    { tipo: 'separador' },
  ] satisfies Block[]);
});

test('as quebras suaves do Markdown viram espaços, não quebras de linha', () => {
  // The source file hard-wraps at 80 columns; that must not reach the app.
  expect(markdownParaBlocos('Uma frase que continua\nna linha seguinte.')).toEqual([
    { tipo: 'paragrafo', texto: 'Uma frase que continua na linha seguinte.' },
  ]);
});

test('as marcas apontam para as posições certas do texto', () => {
  const [bloco] = markdownParaBlocos('O **muro** da [escola](/sobre) caiu.');

  expect(bloco).toEqual({
    tipo: 'paragrafo',
    texto: 'O muro da escola caiu.',
    marcas: [
      { tipo: 'negrito', inicio: 2, fim: 6 },
      { tipo: 'ligacao', inicio: 10, fim: 16, href: '/sobre' },
    ],
  });

  // The offsets must actually index the emitted plain text, or the app
  // highlights the wrong words.
  const p = bloco as Extract<Block, { tipo: 'paragrafo' }>;
  expect(p.texto.slice(2, 6)).toBe('muro');
  expect(p.texto.slice(10, 16)).toBe('escola');
});

test('a imagem sai do parágrafo e fica como bloco próprio', () => {
  const blocos = markdownParaBlocos(
    '![Vista do cais](cais.jpg "O cais ao amanhecer")\n\nTexto a seguir.',
    () => ({ path: '/_astro/cais.webp', largura: 1600, altura: 900 }),
  );

  expect(blocos).toEqual([
    {
      tipo: 'imagem',
      path: '/_astro/cais.webp',
      alt: 'Vista do cais',
      largura: 1600,
      altura: 900,
      legenda: 'O cais ao amanhecer',
    },
    { tipo: 'paragrafo', texto: 'Texto a seguir.' },
  ]);
});

test('falha em vez de publicar uma imagem sem texto alternativo', () => {
  expect(() =>
    markdownParaBlocos('![](cais.jpg)', () => ({
      path: '/x.webp',
      largura: 1,
      altura: 1,
    })),
  ).toThrow(/texto alternativo/);
});

test('falha em vez de perder uma imagem que não consegue resolver', () => {
  expect(() => markdownParaBlocos('![Cais](cais.jpg)')).toThrow(/resolver/);
});
