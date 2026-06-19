import { visit } from 'unist-util-visit';

const URL_RE = /^https?:\/\/\S+$/;
const metaCache = new Map();

/** Extract concatenated text from a hast node. */
function textOf(node) {
  if (node.type === 'text') return node.value;
  if (node.children) return node.children.map(textOf).join('');
  return '';
}

function decodeHtml(value = '') {
  return value
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function attrsOf(tag) {
  const attrs = {};
  const re = /([:\w-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/g;
  let match;
  while ((match = re.exec(tag))) {
    const raw = match[2];
    attrs[match[1].toLowerCase()] = decodeHtml(raw.replace(/^['"]|['"]$/g, ''));
  }
  return attrs;
}

function readMeta(html, names) {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  for (const tag of html.match(/<meta\s+[^>]*>/gi) || []) {
    const attrs = attrsOf(tag);
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (wanted.has(key) && attrs.content) return attrs.content;
  }
  return '';
}

function readTitle(html) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? decodeHtml(title.replace(/<[^>]*>/g, '')) : '';
}

function absoluteUrl(value, base) {
  if (!value) return '';
  try {
    return new URL(value, base).href;
  } catch {
    return '';
  }
}

function titleFromUrl(url) {
  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
  return last
    ? last.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : url.hostname.replace(/^www\./, '');
}

async function fetchMeta(href) {
  if (metaCache.has(href)) return metaCache.get(href);

  const url = new URL(href);
  const host = url.hostname.replace(/^www\./, '');
  const fallback = {
    siteName: host,
    title: titleFromUrl(url),
    description: '',
    image: '',
    favicon: `https://icons.duckduckgo.com/ip3/${url.hostname}.ico`,
  };

  const promise = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(href, {
        signal: controller.signal,
        headers: {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
          accept: 'text/html,application/xhtml+xml',
        },
      });
      clearTimeout(timer);
      if (!res.ok) return fallback;
      const html = await res.text();

      const siteName = readMeta(html, ['og:site_name', 'application-name']) || fallback.siteName;
      const title = readMeta(html, ['og:title', 'twitter:title']) || readTitle(html) || fallback.title;
      const description =
        readMeta(html, ['og:description', 'twitter:description', 'description']) || '';
      const image = absoluteUrl(readMeta(html, ['og:image', 'twitter:image']), href);
      const icon =
        html.match(/<link\s+[^>]*(?:rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'])[^>]*>/i)?.[0] ||
        html.match(/<link\s+[^>]*href=["'][^"']+["'][^>]*(?:rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'])[^>]*>/i)?.[0];
      const favicon = absoluteUrl(icon ? attrsOf(icon).href : '', href) || fallback.favicon;

      return { siteName, title, description, image, favicon };
    } catch {
      return fallback;
    }
  })();

  metaCache.set(href, promise);
  return promise;
}

function makeCard(href, meta) {
  const media = meta.image
    ? [
        {
          type: 'element',
          tagName: 'img',
          properties: {
            className: ['link-card-image'],
            src: meta.image,
            alt: '',
            loading: 'lazy',
          },
          children: [],
        },
      ]
    : [];

  return {
    type: 'element',
    tagName: 'a',
    properties: {
      href,
      className: ['link-card'],
      target: '_blank',
      rel: ['noopener', 'noreferrer'],
    },
    children: [
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['link-card-site'] },
        children: [
          {
            type: 'element',
            tagName: 'img',
            properties: {
              className: ['link-card-favicon'],
              src: meta.favicon,
              alt: '',
              loading: 'lazy',
              width: 22,
              height: 22,
            },
            children: [],
          },
          { type: 'text', value: meta.siteName },
        ],
      },
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['link-card-main', meta.image ? 'has-image' : 'no-image'] },
        children: [
          ...media,
          {
            type: 'element',
            tagName: 'span',
            properties: { className: ['link-card-body'] },
            children: [
              {
                type: 'element',
                tagName: 'span',
                properties: { className: ['link-card-title'] },
                children: [{ type: 'text', value: meta.title }],
              },
              meta.description
                ? {
                    type: 'element',
                    tagName: 'span',
                    properties: { className: ['link-card-desc'] },
                    children: [{ type: 'text', value: meta.description }],
                  }
                : {
                    type: 'element',
                    tagName: 'span',
                    properties: { className: ['link-card-url'] },
                    children: [{ type: 'text', value: href }],
                  },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Turn a paragraph whose only content is a single URL into a rich link card.
 * Inline links inside regular paragraphs are left untouched.
 */
export function rehypeLinkCards() {
  return async (tree) => {
    const tasks = [];

    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'p' || !parent || index === null || index === undefined) return;

      const meaningful = node.children.filter(
        (c) => !(c.type === 'text' && c.value.trim() === '')
      );
      if (meaningful.length !== 1) return;

      const child = meaningful[0];
      let href;

      if (child.type === 'element' && child.tagName === 'a') {
        const value = child.properties && child.properties.href;
        if (typeof value !== 'string' || !URL_RE.test(value)) return;
        href = value;
      } else if (child.type === 'text') {
        const value = child.value.trim();
        if (!URL_RE.test(value)) return;
        href = value;
      } else {
        return;
      }

      tasks.push(
        fetchMeta(href).then((meta) => {
          parent.children[index] = makeCard(href, meta);
        })
      );
    });

    await Promise.all(tasks);
  };
}
