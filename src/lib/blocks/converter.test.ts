/**
 * Converter tests.
 *
 * This is the contract with the Expo app, so the cases here are the ones that
 * would silently ship wrong content: mark offsets, quote attribution, image
 * handling, pt-PT typography, and anything the converter does not model.
 *
 * Run with `bun test`.
 */

import { describe, expect, test } from 'bun:test';
import { markdownParaBlocos } from './index';
import { blockSchema, type Block } from '../contract';

/** Every emitted block must satisfy the published schema, in every test. */
const converter = (md: string, resolver?: Parameters<typeof markdownParaBlocos>[1]): Block[] => {
  const blocos = markdownParaBlocos(md, resolver);
  for (const bloco of blocos) blockSchema.parse(bloco);
  return blocos;
};

const imagemFalsa = () => ({ path: '/_astro/cais.webp', largura: 1600, altura: 900 });

describe('tipos de bloco', () => {
  test('paragrafo', () => {
    expect(converter('Um parágrafo simples.')).toEqual([
      { tipo: 'paragrafo', texto: 'Um parágrafo simples.' },
    ]);
  });

  test('titulo de nível 2 e 3', () => {
    expect(converter('## Dois\n\n### Três')).toEqual([
      { tipo: 'titulo', nivel: 2, texto: 'Dois' },
      { tipo: 'titulo', nivel: 3, texto: 'Três' },
    ]);
  });

  test('títulos abaixo de h3 descem para h3, nunca inventam um nível', () => {
    expect(converter('#### Quatro\n\n##### Cinco')).toEqual([
      { tipo: 'titulo', nivel: 3, texto: 'Quatro' },
      { tipo: 'titulo', nivel: 3, texto: 'Cinco' },
    ]);
  });

  test('um h1 no corpo é erro: o título vem do frontmatter', () => {
    expect(() => converter('# Um título\n\nTexto.')).toThrow(/nível 1/);
  });

  test('separador', () => {
    expect(converter('---')).toEqual([{ tipo: 'separador' }]);
  });
});

describe('marcas', () => {
  test('negrito, itálico e ligação, com as posições certas', () => {
    const [bloco] = converter('O **muro** da *escola* em [Muge](/localidade/muge/) caiu.');
    const p = bloco as Extract<Block, { tipo: 'paragrafo' }>;

    expect(p.texto).toBe('O muro da escola em Muge caiu.');
    // The offsets must index the emitted plain text, or the app highlights the
    // wrong words.
    for (const m of p.marcas!) {
      expect(p.texto.slice(m.inicio, m.fim)).not.toBe('');
    }
    expect(p.marcas).toEqual([
      { tipo: 'negrito', inicio: 2, fim: 6 },
      { tipo: 'italico', inicio: 10, fim: 16 },
      { tipo: 'ligacao', inicio: 20, fim: 24, href: '/localidade/muge/' },
    ]);
    expect(p.texto.slice(2, 6)).toBe('muro');
    expect(p.texto.slice(10, 16)).toBe('escola');
    expect(p.texto.slice(20, 24)).toBe('Muge');
  });

  test('marcas adjacentes não se sobrepõem', () => {
    const p = converter('**um***dois*')[0] as Extract<Block, { tipo: 'paragrafo' }>;
    expect(p.texto).toBe('umdois');
    expect(p.marcas).toEqual([
      { tipo: 'negrito', inicio: 0, fim: 2 },
      { tipo: 'italico', inicio: 2, fim: 6 },
    ]);
  });

  test('marcas encaixadas cobrem os dois intervalos', () => {
    const p = converter('Um **muro *muito* alto**.')[0] as Extract<Block, { tipo: 'paragrafo' }>;
    expect(p.texto).toBe('Um muro muito alto.');
    expect(p.marcas).toEqual([
      { tipo: 'italico', inicio: 8, fim: 13 },
      { tipo: 'negrito', inicio: 3, fim: 18 },
    ]);
    expect(p.texto.slice(8, 13)).toBe('muito');
    expect(p.texto.slice(3, 18)).toBe('muro muito alto');
  });

  test('ligação dentro de negrito guarda o href', () => {
    const p = converter('**[Muge](/muge/)**')[0] as Extract<Block, { tipo: 'paragrafo' }>;
    expect(p.marcas).toContainEqual({ tipo: 'ligacao', inicio: 0, fim: 4, href: '/muge/' });
  });
});

describe('imagens', () => {
  test('sem legenda, e fora do parágrafo que a envolvia', () => {
    expect(converter('![Vista do cais](cais.jpg)\n\nTexto.', imagemFalsa)).toEqual([
      { tipo: 'imagem', path: '/_astro/cais.webp', alt: 'Vista do cais', largura: 1600, altura: 900 },
      { tipo: 'paragrafo', texto: 'Texto.' },
    ]);
  });

  test('com legenda', () => {
    const [bloco] = converter('![Vista do cais](cais.jpg "O cais ao amanhecer")', imagemFalsa);
    expect(bloco).toMatchObject({ tipo: 'imagem', legenda: 'O cais ao amanhecer' });
  });

  test('uma imagem dentro de uma ligação não desaparece, e guarda o href', () => {
    // The usual way to point a photo at its source, [![alt](img)](url), and the
    // shape that lost an entire image on the first article an editor wrote.
    expect(
      converter('[![Plantel](foto.jpg)](https://exemplo.pt/publicacao)', imagemFalsa),
    ).toEqual([
      {
        tipo: 'imagem',
        path: '/_astro/cais.webp',
        alt: 'Plantel',
        largura: 1600,
        altura: 900,
        href: 'https://exemplo.pt/publicacao',
      },
    ]);
  });

  test('uma imagem sem ligação não ganha href nenhum', () => {
    const [bloco] = converter('![Cais](cais.jpg)', imagemFalsa);
    expect(bloco).not.toHaveProperty('href');
  });

  test('falha em vez de publicar uma imagem sem texto alternativo', () => {
    expect(() => converter('![](cais.jpg)', imagemFalsa)).toThrow(/texto alternativo/);
  });

  test('falha em vez de perder uma imagem que não consegue resolver', () => {
    expect(() => converter('![Cais](cais.jpg)')).toThrow(/resolver/);
  });
});

describe('citações', () => {
  test('com atribuição, quando o travessão é o último parágrafo', () => {
    expect(converter('> A obra fica pronta no verão.\n>\n> — Um comerciante')).toEqual([
      { tipo: 'citacao', texto: 'A obra fica pronta no verão.', atribuicao: 'Um comerciante' },
    ]);
  });

  test('sem atribuição', () => {
    expect(converter('> A obra fica pronta no verão.')).toEqual([
      { tipo: 'citacao', texto: 'A obra fica pronta no verão.' },
    ]);
  });

  test('um travessão na mesma linha fica no texto, não vira atribuição', () => {
    const [bloco] = converter('> A obra — dizem — fica pronta no verão.');
    expect(bloco).toEqual({
      tipo: 'citacao',
      texto: 'A obra — dizem — fica pronta no verão.',
    });
  });
});

describe('listas', () => {
  test('não ordenada', () => {
    expect(converter('- Um\n- Dois')).toEqual([
      { tipo: 'lista', ordenada: false, itens: ['Um', 'Dois'] },
    ]);
  });

  test('ordenada', () => {
    expect(converter('1. Um\n2. Dois')).toEqual([
      { tipo: 'lista', ordenada: true, itens: ['Um', 'Dois'] },
    ]);
  });

  test('uma lista encaixada é achatada para a lista de cima, sem perder texto', () => {
    // Block has no nesting. The indent level is dropped on purpose; the text
    // never is. See the note in index.ts.
    expect(converter('- Um\n  - Um A\n  - Um B\n- Dois')).toEqual([
      { tipo: 'lista', ordenada: false, itens: ['Um', 'Um A', 'Um B', 'Dois'] },
    ]);
  });
});

describe('texto em português', () => {
  test('diacríticos, aspas angulares e travessões sobrevivem intactos', () => {
    const original = 'Em Salvaterra ouviu-se «não à obra» — disse a associação — à porta da junta.';
    expect(converter(original)).toEqual([{ tipo: 'paragrafo', texto: original }]);
  });

  test('o espaço insecável sobrevive a uma quebra de linha', () => {
    // \s matches U+00A0 in JavaScript, so collapsing soft breaks with \s would
    // eat this. In pt-PT the space is typographic and has to stay.
    const p = converter('Subiu 5 % este ano\ne deve subir mais.')[0] as Extract<
      Block,
      { tipo: 'paragrafo' }
    >;
    expect(p.texto).toBe('Subiu 5 % este ano e deve subir mais.');
    expect(p.texto).toContain(' ');
  });

  test('a quebra suave do ficheiro vira espaço, não quebra de linha', () => {
    expect(converter('Uma frase que continua\nna linha seguinte.')).toEqual([
      { tipo: 'paragrafo', texto: 'Uma frase que continua na linha seguinte.' },
    ]);
  });
});

describe('o que o contrato não modela', () => {
  // Nothing an editor wrote may disappear. Each of these becomes a
  // desconhecido block carrying its own source, so the app can fall back and
  // the loss is visible instead of silent.
  test('uma tabela', () => {
    const md = '| Ano | Bancas |\n| --- | --- |\n| 2026 | 23 |';
    expect(converter(md)).toEqual([{ tipo: 'desconhecido', origem: 'table', fonte: md }]);
  });

  test('um bloco de código', () => {
    const md = '```js\nconst a = 1;\n```';
    expect(converter(md)).toEqual([{ tipo: 'desconhecido', origem: 'code', fonte: md }]);
  });

  test('HTML em bruto', () => {
    expect(converter('<div class="x">olá</div>')).toEqual([
      { tipo: 'desconhecido', origem: 'html', fonte: '<div class="x">olá</div>' },
    ]);
  });

  test('nada se perde em silêncio: o texto à volta continua lá', () => {
    const blocos = converter('Antes.\n\n```\ncódigo\n```\n\nDepois.');
    expect(blocos.map((b) => b.tipo)).toEqual(['paragrafo', 'desconhecido', 'paragrafo']);
  });

  test('uma definição de ligação não gera bloco nenhum', () => {
    // The only nodes allowed to vanish: they are referenced from inline text
    // and render nothing of their own.
    expect(converter('Ver [o mapa][m].\n\n[m]: /mapa')).toEqual([
      {
        tipo: 'paragrafo',
        texto: 'Ver o mapa.',
        marcas: [{ tipo: 'ligacao', inicio: 4, fim: 10, href: '/mapa' }],
      },
    ]);
  });
});

describe('referências', () => {
  test('uma imagem por referência não desaparece', () => {
    expect(converter('![Vista do cais][c]\n\n[c]: cais.jpg', imagemFalsa)).toEqual([
      { tipo: 'imagem', path: '/_astro/cais.webp', alt: 'Vista do cais', largura: 1600, altura: 900 },
    ]);
  });

  test('uma referência sem definição passa como texto literal, sem perder nada', () => {
    // CommonMark does not treat an undefined reference as a link at all, so the
    // brackets survive verbatim. Ugly in the app, but visible — which beats a
    // sentence quietly losing its words.
    expect(converter('Ver [o mapa][inexistente].')).toEqual([
      { tipo: 'paragrafo', texto: 'Ver [o mapa][inexistente].' },
    ]);
  });
});
