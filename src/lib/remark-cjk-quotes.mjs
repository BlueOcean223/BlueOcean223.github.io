import { SKIP, visit } from 'unist-util-visit';

// SmartyPants picks “ or ” from the character before the quote, and a CJK
// character does not count as a word boundary, so `是"别人看不见"` comes out as
// `是”别人看不见”`. Astro runs SmartyPants before user remark plugins, so this
// plugin sees its output and re-pairs the double quotes in order.

// CJK radicals, punctuation and ideographs; compatibility ideographs; fullwidth forms.
const CJK_RE = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const OPEN = '\u201c';
const CLOSE = '\u201d';
const QUOTE_RE = /[\u201c\u201d]/g;

/** Re-pair curly double quotes in paragraphs, headings and table cells that contain CJK text. */
export function remarkCjkQuotes() {
  return (tree) => {
    visit(tree, ['paragraph', 'heading', 'tableCell'], (block) => {
      // Only plain text nodes: inline code and raw HTML keep their quotes and do not count.
      const texts = [];
      visit(block, 'text', (node) => {
        texts.push(node);
      });
      const joined = texts.map((node) => node.value).join('');
      const count = (joined.match(QUOTE_RE) || []).length;
      // An odd count means a quote we cannot pair (an inch mark, a quote spanning
      // paragraphs); leave the block as SmartyPants rendered it.
      if (!CJK_RE.test(joined) || count === 0 || count % 2 !== 0) return SKIP;
      let open = true;
      for (const node of texts) {
        node.value = node.value.replace(QUOTE_RE, () => {
          const quote = open ? OPEN : CLOSE;
          open = !open;
          return quote;
        });
      }
      return SKIP;
    });
  };
}
