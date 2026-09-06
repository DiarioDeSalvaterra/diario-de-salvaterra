/**
 * Markdown -> Block[] converter.
 *
 * This module is the heart of the /api/v1 contract with the Expo app, and it
 * deliberately imports nothing from Astro. It is plain TypeScript over an mdast
 * tree, so it can be unit-tested with `bun test`, run in a script, or lifted
 * into another project unchanged.
 *
 * ponytail: parsing is delegated to mdast-util-from-markdown rather than
 * hand-rolled. A block-level Markdown parser looks like fifty lines until it
 * meets lazy continuation, setext headings, nested emphasis and escapes — and
 * this output is a published contract, so being quietly wrong is expensive.
 */

import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import type { PhrasingContent, RootContent } from 'mdast';

/** Inline marks on a paragraph, as offsets into its plain text. */
export type Marca =
  | { tipo: 'negrito'; inicio: number; fim: number }
  | { tipo: 'italico'; inicio: number; fim: number }
  | { tipo: 'codigo'; inicio: number; fim: number }
  | { tipo: 'ligacao'; inicio: number; fim: number; href: string };

export type Block =
  | { tipo: 'paragrafo'; texto: string; marcas?: Marca[] }
  | { tipo: 'titulo'; nivel: 2 | 3; texto: string }
  | {
      tipo: 'imagem';
      path: string;
      alt: string;
      legenda?: string;
      largura: number;
      altura: number;
    }
  | { tipo: 'citacao'; texto: string; atribuicao?: string }
  | { tipo: 'lista'; ordenada: boolean; itens: string[] }
  | { tipo: 'separador' };

/** Dimensions and final path for an image referenced from the article body. */
export interface ImagemResolvida {
  path: string;
  largura: number;
  altura: number;
}

/**
 * Resolves a Markdown image source to its built path and dimensions. Supplied
 * by the caller because only the build knows where an asset ends up; keeping it
 * out here is what lets this module stay free of Astro.
 */
export type ResolverImagem = (src: string) => ImagemResolvida | undefined;

/**
 * Flattens inline nodes to plain text while recording where the marks fell.
 *
 * The app receives text plus offsets instead of an HTML string, so it can
 * render with native text components and still show bold, italics and links.
 */
function inline(nodes: readonly PhrasingContent[]): { texto: string; marcas: Marca[] } {
  let texto = '';
  const marcas: Marca[] = [];

  const walk = (ns: readonly PhrasingContent[]): void => {
    for (const n of ns) {
      switch (n.type) {
        case 'text':
          // A single newline inside a Markdown paragraph is a soft break, i.e.
          // a space. Passing the source file's hard wrapping through would make
          // the app render line breaks in the middle of sentences.
          texto += n.value.replace(/\s*\n\s*/g, ' ');
          break;
        case 'inlineCode': {
          const inicio = texto.length;
          texto += n.value;
          marcas.push({ tipo: 'codigo', inicio, fim: texto.length });
          break;
        }
        case 'strong':
        case 'emphasis':
        case 'delete': {
          const inicio = texto.length;
          walk(n.children);
          // Delete (~~strikethrough~~) has no Marca of its own; treating it as
          // emphasis keeps the contract small and still reads correctly.
          marcas.push({
            tipo: n.type === 'strong' ? 'negrito' : 'italico',
            inicio,
            fim: texto.length,
          });
          break;
        }
        case 'link': {
          const inicio = texto.length;
          walk(n.children);
          marcas.push({ tipo: 'ligacao', inicio, fim: texto.length, href: n.url });
          break;
        }
        case 'break':
          texto += '\n';
          break;
        case 'image':
          // An image inside a paragraph is lifted out by the block walker; its
          // alt text must not leak into the surrounding prose.
          break;
        default:
          if ('children' in n) walk(n.children as readonly PhrasingContent[]);
          else if ('value' in n) texto += String(n.value);
      }
    }
  };

  walk(nodes);
  return { texto, marcas };
}

/** Plain text of an inline run, marks discarded. */
const plano = (nodes: readonly PhrasingContent[]): string => inline(nodes).texto;

function paragrafo(nodes: readonly PhrasingContent[]): Block | undefined {
  const { texto, marcas } = inline(nodes);
  if (!texto.trim()) return undefined;
  return marcas.length > 0 ? { tipo: 'paragrafo', texto, marcas } : { tipo: 'paragrafo', texto };
}

function imagem(
  node: Extract<PhrasingContent, { type: 'image' }>,
  resolver: ResolverImagem | undefined,
): Block {
  if (!resolver) {
    throw new Error(
      `markdownParaBlocos: o corpo contém a imagem "${node.url}" mas não foi passado um resolver.`,
    );
  }
  const r = resolver(node.url);
  if (!r) {
    throw new Error(`markdownParaBlocos: não foi possível resolver a imagem "${node.url}".`);
  }
  const alt = node.alt ?? '';
  // Alt text is an accessibility requirement on a news site, not polish. A
  // missing one fails the build rather than shipping an unlabelled image.
  if (!alt.trim()) {
    throw new Error(`markdownParaBlocos: a imagem "${node.url}" não tem texto alternativo.`);
  }
  const legenda = node.title?.trim();
  return {
    tipo: 'imagem',
    path: r.path,
    alt,
    largura: r.largura,
    altura: r.altura,
    ...(legenda ? { legenda } : {}),
  };
}

/**
 * A blockquote whose final paragraph begins with a dash is read as an
 * attributed pull quote, the way quotes are actually written in copy:
 *
 *     > O mercado mudou muito.
 *     >
 *     > — Uma produtora de hortícolas
 *
 * The attribution must be its own paragraph. Detecting it by line would be
 * fragile now that soft breaks collapse to spaces.
 */
function citacao(blocos: readonly Block[]): Block | undefined {
  const textos = blocos
    .map((b) => ('texto' in b ? b.texto : ''))
    .filter((t) => t.trim());
  if (textos.length === 0) return undefined;

  const ultimo = textos[textos.length - 1]!.trim();
  const m = /^[—–-]\s*(.+)$/.exec(ultimo);
  if (m && textos.length > 1) {
    return {
      tipo: 'citacao',
      texto: textos.slice(0, -1).join('\n\n').trim(),
      atribuicao: m[1]!.trim(),
    };
  }
  return { tipo: 'citacao', texto: textos.join('\n\n').trim() };
}

function converter(nodes: readonly RootContent[], resolver: ResolverImagem | undefined): Block[] {
  const out: Block[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph': {
        // Images are block-level in the output even when Markdown nests them in
        // a paragraph, so they are hoisted and the remaining prose kept.
        for (const child of node.children) {
          if (child.type === 'image') out.push(imagem(child, resolver));
        }
        const p = paragrafo(node.children);
        if (p) out.push(p);
        break;
      }
      case 'heading': {
        // h1 is the article title, rendered from frontmatter. Anything deeper
        // than h3 collapses to h3 rather than inventing a level the app cannot
        // render.
        const nivel = node.depth <= 2 ? 2 : 3;
        const texto = plano(node.children);
        if (texto.trim()) out.push({ tipo: 'titulo', nivel, texto });
        break;
      }
      case 'blockquote': {
        const c = citacao(converter(node.children, resolver));
        if (c) out.push(c);
        break;
      }
      case 'list': {
        const itens = node.children
          .map((li) => converter(li.children, resolver)
            .map((b) => ('texto' in b ? b.texto : ''))
            .filter(Boolean)
            .join(' '))
          .filter((t) => t.trim());
        if (itens.length > 0) out.push({ tipo: 'lista', ordenada: node.ordered === true, itens });
        break;
      }
      case 'thematicBreak':
        out.push({ tipo: 'separador' });
        break;
      case 'code':
        // ponytail: no code block in the contract — a local paper has no use
        // for one. Rendered as a plain paragraph; add a 'codigo' block if that
        // ever stops being true.
        if (node.value.trim()) out.push({ tipo: 'paragrafo', texto: node.value });
        break;
      case 'html':
        // Content is Markdown, never HTML blobs. Raw HTML is dropped instead of
        // being passed through to an app that cannot render it.
        break;
      default:
        break;
    }
  }

  return out;
}

/**
 * Converts an article body to the block array the app renders.
 *
 * @param markdown Article body, frontmatter already stripped.
 * @param resolver Required only if the body references images.
 */
export function markdownParaBlocos(markdown: string, resolver?: ResolverImagem): Block[] {
  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  return converter(tree.children, resolver);
}
