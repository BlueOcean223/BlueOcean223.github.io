import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import { rehypeLinkCards } from './src/lib/rehype-link-cards.mjs';
import { remarkCjkQuotes } from './src/lib/remark-cjk-quotes.mjs';

// https://astro.build
export default defineConfig({
  site: 'https://blueocean223.github.io',
  integrations: [mdx(), sitemap()],
  markdown: {
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
    processor: unified({
      remarkPlugins: [remarkCjkQuotes],
      rehypePlugins: [rehypeLinkCards],
    }),
  },
});
