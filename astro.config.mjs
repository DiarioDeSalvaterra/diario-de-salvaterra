// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

const site = process.env.PUBLIC_BASE_URL ?? 'https://dev.diariodesalvaterra.pt';

// No `base`: the site is served from the root of a custom domain, on both the
// dev host and the apex. Setting one would break every absolute path.
export default defineConfig({
  site,
  fonts: [
    {
      // Serif headlines, sans body — both need full pt-PT diacritics, so the
      // latin-ext subset is not optional here.
      provider: fontProviders.google(),
      name: 'Source Serif 4',
      cssVariable: '--fonte-titulo',
      weights: [600, 700],
      styles: ['normal', 'italic'],
      subsets: ['latin', 'latin-ext'],
    },
    {
      provider: fontProviders.google(),
      name: 'Inter',
      cssVariable: '--fonte-texto',
      weights: [400, 500, 600],
      styles: ['normal', 'italic'],
      subsets: ['latin', 'latin-ext'],
    },
  ],
});
