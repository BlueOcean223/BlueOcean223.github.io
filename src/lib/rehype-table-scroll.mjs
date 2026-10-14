import { SKIP, visit } from 'unist-util-visit';

// A table cannot scroll on its own without `display: block`, which breaks its
// full-width layout. Wrapping it keeps the table a real table and lets only the
// wrapper scroll sideways when the columns do not fit on a narrow screen.

/** Wrap every table in a horizontally scrollable `div.table-scroll`. */
export function rehypeTableScroll() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'table' || !parent || index === undefined) return;
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['table-scroll'] },
        children: [node],
      };
      return SKIP;
    });
  };
}
