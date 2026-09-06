# CLAUDE.md — Diário de Salvaterra

## What this is

Proof of concept for a reusable local-newspaper platform. Public face is a small
local news site for **Salvaterra de Magos** (Ribatejo, Portugal). It exists to
demonstrate the pattern to real newspapers later, so it must look like a real
paper, not like a demo.

A companion **Expo app** will consume this site's JSON API. The contract under
"JSON API" is the interface between them — treat it as public and stable.

Site language is **European Portuguese (pt-PT)**. All UI strings, labels, dates
and slugs in Portuguese. Code, comments and commit messages in English.

## Stack

- **Astro** (static output) + TypeScript
- **Content collections** with Zod schemas
- **Sveltia CMS** at `/admin`, GitHub backend, fine-grained PAT auth
- **GitHub Pages** via `withastro/action`
- **Bun** as package manager and script runner — Astro itself runs on Node

## Hosting

| | |
|---|---|
| Dev | `dev.diariodesalvaterra.pt` (current) |
| Prod | `diariodesalvaterra.pt` (later) |

- Custom domain, so **do not set `base`** in `astro.config.mjs`. Set `site` only.
- `public/CNAME` must contain the current host — Astro copies `public/` into
  `dist/`, which is what gets published.
- **The dev host must not be indexed.** `robots.txt` with `Disallow: /` plus
  `<meta name="robots" content="noindex, nofollow">` in the base layout, both
  driven by an env var so they switch off automatically at the apex domain.
  This is fictional news about a real municipality — indexing it is a real
  problem, not an untidiness.

## Hard constraints

From the hosting model. Do not design around them.

1. **Static only.** No server, no database, no runtime secrets, no executing API
   routes. Everything is built at commit time.
2. **Content is Markdown + frontmatter** in the repo. Never HTML blobs, never a
   proprietary format. It must stay portable to a real CMS later.
3. **Images live in git forever.** Never commit anything over ~250KB. Target
   1600px max width, WebP. History cannot be pruned later without pain.
4. **No client-side JS unless it earns its place.** Astro ships zero by default.
5. **No tracking, no ads, no third-party embeds.**

## Content model

`src/content/artigos/{slug}.md`

```ts
{
  titulo: string            // headline
  resumo: string            // standfirst, 1–2 sentences, feed + JSON
  capa: image               // cover: feed AND above the title on the article page
  capaAlt: string
  capaCredito?: string
  seccao: Seccao            // exactly one
  localidades: Localidade[] // zero or more
  autor: string
  publicadoEm: Date
  destaque?: boolean        // hero slot on the front page
  rascunho?: boolean
}
```

### Quotes in the body

An attributed pull quote is a blockquote whose **final paragraph** begins with a
dash. The attribution must be its own paragraph, separated by a blank `>` line:

```markdown
> A obra estará concluída no verão.
>
> — Um comerciante com loja junto ao acesso sul
```

Without the blank line it is one paragraph and the dash stays in the quote text.

## Taxonomy

Two independent axes. Do not merge them into one "categories" field — this
mirrors how Portuguese regional papers actually work.

**Secções** (one per article)
`autarquia` · `economia` · `cultura` · `desporto` · `sociedade` · `nacional`

**Localidades** (many per article — the four freguesias of the concelho)
`salvaterra-e-foros` · `marinhais` · `muge` · `gloria-do-ribatejo-e-granho`

Display names live only in `src/config/site.ts`. Never hardcode them.

## Routes

```
/                      front page — hero destaque + feed
/artigo/{slug}         article
/seccao/{slug}         section index
/localidade/{slug}     place index
/sobre                 ficha técnica, editorial statement, demo notice
/rss.xml
/admin                 Sveltia CMS
```

## JSON API — stable contract

Static files emitted at build time. The Expo app depends on these. Renaming a
field is a breaking change; add optional fields instead.

```
/api/v1/tenant.json
  { id, nome, descricao, locale, baseUrl, seccoes[], localidades[], capabilities{} }

/api/v1/articles.json
  { articles: [{ id, slug, titulo, resumo, capa{path,alt,largura,altura},
                 seccao, localidades[], autor, publicadoEm, url }] }

/api/v1/articles/{slug}.json
  { ...same fields, corpo: Block[] }
```

**All paths in the JSON are relative.** `baseUrl` in `tenant.json` is the only
absolute host, and clients resolve against it. This is what lets the site move
from `dev.` to the apex without rebuilding the app. The one exception is each
article's `url`, which stays absolute for sharing and canonical tags.

**`corpo` is a block array, never an HTML string.** Markdown converts to blocks
at build time.

```ts
type Block =
  | { tipo: 'paragrafo';  texto: string; marcas?: Marca[] }
  | { tipo: 'titulo';     nivel: 2|3; texto: string }
  | { tipo: 'imagem';     path: string; alt: string; legenda?: string; largura: number; altura: number }
  | { tipo: 'citacao';    texto: string; atribuicao?: string }
  | { tipo: 'lista';      ordenada: boolean; itens: string[] }
  | { tipo: 'separador' }
```

**Inline marks.** A paragraph carries plain text plus the marks that apply to
it, as offsets into that text. The app renders with native text components and
never parses HTML.

```ts
type Marca =
  | { tipo: 'negrito';  inicio: number; fim: number }
  | { tipo: 'italico';  inicio: number; fim: number }
  | { tipo: 'codigo';   inicio: number; fim: number }
  | { tipo: 'ligacao';  inicio: number; fim: number; href: string }
```

Offsets are indices into the emitted `texto`, half-open: `texto.slice(inicio,
fim)` is exactly the marked run. Strikethrough collapses to `italico`; there is
no separate mark for it.

**Fields beyond the shapes above**, all additive and safe for older clients to
ignore: `capa.credito` and `destaque` on an article, `aviso` on the tenant.

**Text normalisation.** A single newline inside a Markdown paragraph is a soft
break and becomes a space, so the source file's line wrapping never reaches the
app. Only an explicit hard break emits `\n`.

**Blocks the converter does not produce.** A fenced code block degrades to a
`paragrafo`; raw HTML in the Markdown is dropped rather than passed to an app
that cannot render it. Both are marked in `src/lib/blocks.ts`.

**Failures are build failures.** An image without alt text, or one the build
cannot resolve, throws instead of shipping. On a news site alt text is a
requirement, and silently dropping content is worse than a red build.

`capabilities` must be present from day one even though everything is `true`.
The app renders from capabilities, never from assumptions.

The converter lives in `src/lib/blocks.ts` and imports nothing from Astro, so it
stays testable with `bun test` and portable to another project. Keep it that
way: the build injects a resolver callback for image paths and dimensions rather
than letting Astro leak into the module.

## Design direction

Reference is https://postal.pt — a real regional paper — minus the ads and the
SEO filler. Editorial, not startup-y.

- **Palette**: ink `#131820`, cream `#F0E8D8`, ochre `#C9722F`. Ochre is an
  accent only — rules, chips, link hover. Never large ochre fills.
- **Type**: serif headlines (Source Serif 4), sans body and UI (Inter). Both need
  full pt-PT diacritics. Headlines tight and large.
- **Front page**: one hero `destaque` with a large cover, then a denser grid.
  Every card shows secção chip, localidade tags, date.
- **Article page**: cover above the title, then title, standfirst, byline, date,
  body. Measure ~65–75 characters.
- Mobile-first. Fast and legible on a five-year-old Android.

## Demo content

All articles are **fictional**, about a real municipality. Therefore:

- Persistent visible notice on every page and in `/sobre`:
  *conteúdo fictício, site de demonstração*.
- **Never name real living people**, officials, or businesses.
- Never copy or rewrite articles from Notícias do Sorraia, O Mirante, Postal or
  anyone else. Original mock text only.

## Agent working style

Install the **ponytail** skill. The rules below restate its core so this file
stands alone if the skill isn't loaded.

### The ladder — stop at the first rung that holds

1. Does this need to exist? → no: skip it
2. Does the stdlib do it? → use it
3. Native platform or Astro built-in? → use it
4. Already-installed dependency? → use it
5. One line? → one line
6. Only then: the minimum that works

Mark every deliberate shortcut with a `ponytail:` comment naming its limit and
its upgrade path, so deferred work doesn't silently become permanent.

**Lazy, not negligent.** Never on the chopping block: validation at trust
boundaries, error handling, security, accessibility. On a news site semantic
HTML and alt text are requirements, not polish.

The over-build traps here are specific and predictable: reaching for a component
library, a state manager, an image CDN, or a client-side router. Astro plus
hand-rolled CSS covers all of it.

### Token discipline

- Read narrowly. Never dump a directory or a whole file when a range will do.
- Don't re-read files already in context.
- Prefer targeted edits over file rewrites.
- Batch related edits into one pass.
- Stop and ask before any refactor touching more than ~5 files.

### Prose

Terse and telegraphic in chat. No preamble, no restating the request, no summary
of what you just did.

**This applies to chat output only.** Write proper, complete sentences in the
appropriate language for anything that persists:

- code comments and commit messages
- this file and any docs in the repo
- pt-PT site copy, `/sobre`, ficha técnica
- the mock article content — it has to read like journalism

## Commands

```bash
bun install
bun run dev          # local dev
bun run build        # static build to dist/
bun run preview      # serve the build
bun test             # converter self-check
bunx astro check     # typecheck
```

## Known friction

- **Sveltia media folder vs Astro image optimisation.** Images the CMS commits to
  `public/` bypass `astro:assets`. Point Sveltia's `media_folder` at
  `src/assets/uploads` and use the `image()` helper in the collection schema so
  covers get optimised.
- **Sveltia auth** uses a fine-grained PAT held in the browser. Fine for one
  editor. Move to a Cloudflare Worker OAuth relay when real editors appear.
- **Cloudflare DNS**, if used, must stay grey-clouded (DNS only) until GitHub has
  issued the certificate. Proxying blocks provisioning.

## Don'ts

- Don't add a database, an API server, or anything needing a runtime secret
- Don't run Astro under the Bun runtime (`--bun`) — sharp and the bundler chain
  are unreliable there
- Don't introduce a UI framework or component library — hand-rolled CSS
- Don't add analytics, ads, cookie banners or consent tooling
- Don't put real news, real people, or scraped content in the repo
- Don't let the dev host become indexable
- Don't change the `/api/v1` shape without updating this file first
## Environment variables

Both are read at build time and default to the dev host.

| Variable | Default | Effect |
|---|---|---|
| `PUBLIC_BASE_URL` | `https://dev.diariodesalvaterra.pt` | `site` in the Astro config, `baseUrl` in `tenant.json`, canonical tags |
| `PUBLIC_INDEXAVEL` | unset (not indexable) | `true` drops the `noindex` meta and switches `robots.txt` to `Allow: /` |

The apex build is therefore:

```bash
PUBLIC_BASE_URL=https://diariodesalvaterra.pt PUBLIC_INDEXAVEL=true bun run build
```

Remember to update `public/CNAME` in the same change: it holds the host the
build is published to.
