import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import { rehypeLinkCards } from './src/lib/rehype-link-cards.mjs';

// https://astro.build
export default defineConfig({
  site: 'https://blueocean223.github.io',
  integrations: [mdx(), sitemap()],
  markdown: {
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
    rehypePlugins: [rehypeLinkCards],
  },
});
