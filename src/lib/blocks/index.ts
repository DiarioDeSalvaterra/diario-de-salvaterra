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

/**
 * Block and Marca are defined once, in the contract module, and re-exported
 * here for convenience. Two hand-written copies of a published shape drift.
 */
export type { Block, Marca } from '../contract';
import type { Block, Marca } from '../contract';

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
          //
          // [ \t] and not \s: in JavaScript \s matches U+00A0, so a
          // non-breaking space sitting next to a line wrap would be eaten. In
          // pt-PT that space is typographic and must survive.
          texto += n.value.replace(/[ \t]*\n[ \t]*/g, ' ');
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

/**
 * Collects every image in an inline tree, however deeply nested, along with the
 * link wrapping it if there is one.
 *
 * Markdown puts an image inside a paragraph, and often inside a link on top of
 * that ([![alt](img)](url), the usual way to link a photo to its source). Only
 * looking at direct children loses the whole image without a trace.
 */
function imagensEm(
  nodes: readonly PhrasingContent[],
  href?: string,
): Array<{ node: Extract<PhrasingContent, { type: 'image' }>; href?: string }> {
  const encontradas: Array<{ node: Extract<PhrasingContent, { type: 'image' }>; href?: string }> = [];
  for (const n of nodes) {
    if (n.type === 'image') encontradas.push({ node: n, href });
    else if (n.type === 'link') encontradas.push(...imagensEm(n.children, n.url));
    else if ('children' in n) encontradas.push(...imagensEm(n.children as readonly PhrasingContent[], href));
  }
  return encontradas;
}

function imagem(
  node: Extract<PhrasingContent, { type: 'image' }>,
  resolver: ResolverImagem | undefined,
  href?: string,
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
    ...(href ? { href } : {}),
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

/**
 * Wraps an unmodelled node, keeping the Markdown that produced it. mdast gives
 * every node its source offsets, so the original text is quoted verbatim rather
 * than reconstructed.
 */
function desconhecido(node: RootContent, fonte: string): Block | undefined {
  const inicio = node.position?.start?.offset;
  const fim = node.position?.end?.offset;
  const bruto = inicio !== undefined && fim !== undefined ? fonte.slice(inicio, fim) : '';
  if (!bruto.trim()) return undefined;
  return { tipo: 'desconhecido', origem: node.type, fonte: bruto };
}

function converter(
  nodes: readonly RootContent[],
  resolver: ResolverImagem | undefined,
  fonte: string,
): Block[] {
  const out: Block[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph': {
        // Images are block-level in the output even when Markdown nests them in
        // a paragraph, or in a link inside one, so they are hoisted and the
        // remaining prose kept.
        for (const { node: img, href } of imagensEm(node.children)) {
          out.push(imagem(img, resolver, href));
        }
        const p = paragrafo(node.children);
        if (p) out.push(p);
        break;
      }
      case 'heading': {
        // The article title is the page's only h1 and comes from the
        // frontmatter, so one in the body is a mistake worth failing on rather
        // than silently demoting. Anything below h3 collapses to h3 instead of
        // inventing a level the app cannot render.
        if (node.depth === 1) {
          throw new Error(
            `markdownParaBlocos: o corpo tem um título de nível 1 ("${plano(node.children)}"). ` +
              'O título do artigo vem do frontmatter; use ## a partir daqui.',
          );
        }
        const nivel = node.depth === 2 ? 2 : 3;
        const texto = plano(node.children);
        if (texto.trim()) out.push({ tipo: 'titulo', nivel, texto });
        break;
      }
      case 'blockquote': {
        const c = citacao(converter(node.children, resolver, fonte));
        if (c) out.push(c);
        break;
      }
      case 'list': {
        // ponytail: a nested list is flattened into its parent, each nested
        // item becoming an item of the same list, in order. Block has no
        // nesting and a flat list renders correctly everywhere; no text is
        // lost, only the indent level. Give `itens` a recursive type if the
        // app ever needs to show the hierarchy.
        const itens: string[] = [];
        for (const li of node.children) {
          for (const bloco of converter(li.children, resolver, fonte)) {
            if (bloco.tipo === 'lista') itens.push(...bloco.itens);
            else if ('texto' in bloco && bloco.texto.trim()) itens.push(bloco.texto);
          }
        }
        if (itens.length > 0) out.push({ tipo: 'lista', ordenada: node.ordered === true, itens });
        break;
      }
      case 'thematicBreak':
        out.push({ tipo: 'separador' });
        break;
      // Link and footnote definitions render nothing by design: they are
      // referenced from inline text, not shown. They are the only nodes that
      // may vanish without becoming a desconhecido block.
      case 'definition':
      case 'footnoteDefinition':
        break;
      default: {
        const bloco = desconhecido(node, fonte);
        if (bloco) out.push(bloco);
        break;
      }
    }
  }

  return out;
}

/**
 * Rewrites reference links and images ([texto][id], ![alt][id]) into their
 * inline equivalents, using the definitions collected from the document.
 *
 * Without this a reference link loses its href and a reference image vanishes
 * entirely, both without a trace — exactly the silent loss the desconhecido
 * block exists to prevent. A reference with no matching definition is left
 * alone: there is no destination to lose, and its text still comes through.
 */
function resolverReferencias(nodes: readonly RootContent[]): void {
  const definicoes = new Map<string, { url: string; title?: string | null }>();

  const recolher = (ns: readonly RootContent[]): void => {
    for (const n of ns) {
      if (n.type === 'definition') definicoes.set(n.identifier, { url: n.url, title: n.title });
      if ('children' in n) recolher(n.children as readonly RootContent[]);
    }
  };

  const trocar = (ns: readonly RootContent[]): void => {
    for (const n of ns) {
      if (n.type === 'linkReference' || n.type === 'imageReference') {
        const d = definicoes.get(n.identifier);
        if (d) {
          const alt = n.type === 'imageReference' ? n.alt : undefined;
          Object.assign(n, {
            type: n.type === 'imageReference' ? 'image' : 'link',
            url: d.url,
            title: d.title ?? null,
            ...(alt !== undefined ? { alt } : {}),
          });
        }
      }
      if ('children' in n) trocar(n.children as readonly RootContent[]);
    }
  };

  recolher(nodes);
  trocar(nodes);
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
  resolverReferencias(tree.children);
  return converter(tree.children, resolver, markdown);
}
