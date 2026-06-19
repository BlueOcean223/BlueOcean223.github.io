import { visit } from 'unist-util-visit';

/** Extract concatenated text from a hast node. */
function textOf(node) {
  if (node.type === 'text') return node.value;
  if (node.children) return node.children.map(textOf).join('');
  return '';
}

const URL_RE = /^https?:\/\/\S+$/;

function makeCard(href, title) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');
  const favicon = `https://icons.duckduckgo.com/ip3/${url.hostname}.ico`;
  const displayTitle = title && title !== href ? title : host;

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
        tagName: 'img',
        properties: {
          className: ['link-card-icon'],
          src: favicon,
          alt: '',
          loading: 'lazy',
          width: 32,
          height: 32,
        },
        children: [],
      },
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['link-card-body'] },
        children: [
          {
            type: 'element',
            tagName: 'span',
            properties: { className: ['link-card-title'] },
            children: [{ type: 'text', value: displayTitle }],
          },
          {
            type: 'element',
            tagName: 'span',
            properties: { className: ['link-card-url'] },
            children: [{ type: 'text', value: href }],
          },
        ],
      },
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['link-card-arrow'], 'aria-hidden': 'true' },
        children: [{ type: 'text', value: '↗' }],
      },
    ],
  };
}

/**
 * Turn a paragraph whose only content is a single URL into a styled link card.
 *
 * Supported forms:
 *   https://example.com
 *   <https://example.com>
 *   [A nice title](https://example.com)
 *
 * Inline links inside regular paragraphs are left untouched.
 */
export function rehypeLinkCards() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'p' || !parent || index === null || index === undefined) return;

      const meaningful = node.children.filter(
        (c) => !(c.type === 'text' && c.value.trim() === '')
      );
      if (meaningful.length !== 1) return;

      const child = meaningful[0];
      let href;
      let title;

      if (child.type === 'element' && child.tagName === 'a') {
        const value = child.properties && child.properties.href;
        if (typeof value !== 'string' || !URL_RE.test(value)) return;
        href = value;
        title = textOf(child).trim();
      } else if (child.type === 'text') {
        const value = child.value.trim();
        if (!URL_RE.test(value)) return;
        href = value;
        title = value;
      } else {
        return;
      }

      const card = makeCard(href, title);
      if (card) parent.children[index] = card;
    });
  };
}
